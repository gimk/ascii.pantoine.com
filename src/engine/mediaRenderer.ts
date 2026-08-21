import { MediaConfig, MediaViewConfig } from '../types/ascii';

export interface RenderMediaContext {
  cols: number;
  rows: number;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig: MediaConfig;
  viewConfig: MediaViewConfig;
  density: string;
}

// Scratch and cached buffers for zero-allocation rendering
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

let cachedLines: string[] = [];
let lineBuffer: string[] = [];
let lumBuffer = new Float32Array(0);
let ditherBuffer = new Float32Array(0);
let blurBuffer = new Float32Array(0);
let edgeBuffer = new Float32Array(0);

// Bayer 4x4 Matrix
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Bayer 8x8 Matrix
const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  if (!offscreenCanvas && typeof document !== 'undefined') {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (offscreenCanvas) {
    if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas.width = Math.max(1, width);
      offscreenCanvas.height = Math.max(1, height);
    }
  }
  return { canvas: offscreenCanvas!, ctx: offscreenCtx };
}

/**
 * Fast separable 1D box blur for smoothing and unsharp masking.
 */
function applyFastBoxBlur(src: Float32Array, dest: Float32Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    dest.set(src);
    return;
  }

  const r = Math.min(Math.max(1, Math.floor(radius)), 10);
  const temp = new Float32Array(width * height);
  const winSize = 2 * r + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;

    // Initialize window
    for (let i = -r; i <= r; i++) {
      const px = Math.min(width - 1, Math.max(0, i));
      sum += src[rowOffset + px];
    }
    temp[rowOffset] = sum / winSize;

    for (let x = 1; x < width; x++) {
      const removeX = Math.max(0, x - r - 1);
      const addX = Math.min(width - 1, x + r);
      sum += src[rowOffset + addX] - src[rowOffset + removeX];
      temp[rowOffset + x] = sum / winSize;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;

    for (let i = -r; i <= r; i++) {
      const py = Math.min(height - 1, Math.max(0, i));
      sum += temp[py * width + x];
    }
    dest[x] = sum / winSize;

    for (let y = 1; y < height; y++) {
      const removeY = Math.max(0, y - r - 1);
      const addY = Math.min(height - 1, y + r);
      sum += temp[addY * width + x] - temp[removeY * width + x];
      dest[y * width + x] = sum / winSize;
    }
  }
}

/**
 * Computes a single full ASCII frame from a 2D image or video element
 * using aspect-compensated sampling and advanced dithering algorithms.
 */
export function renderAsciiMediaFrame(context: RenderMediaContext): string {
  const { cols, rows, mediaElement, mediaConfig, viewConfig, density } = context;

  if (cols <= 0 || rows <= 0) return '';
  if (!mediaElement) return '';

  const totalCells = cols * rows;
  const densityLength = density.length;

  // Ensure line caches and calculation buffers match grid dimensions
  if (cachedLines.length !== rows) cachedLines = new Array(rows);
  if (lineBuffer.length !== cols) lineBuffer = new Array(cols);
  if (lumBuffer.length !== totalCells) {
    lumBuffer = new Float32Array(totalCells);
    ditherBuffer = new Float32Array(totalCells);
    blurBuffer = new Float32Array(totalCells);
    edgeBuffer = new Float32Array(totalCells);
  }

  // Placeholder when no image or video is loaded yet
  if (!mediaElement) {
    const lines: string[] = [];
    const bannerMsg = 'PASTE IMAGE [ ⌘+V / CTRL+V ] OR DROP FILE';
    const subMsg = 'ASCII STUDIO 2D MEDIA RASTERIZER';

    for (let r = 0; r < rows; r++) {
      let line = '';
      if (r === Math.floor(rows / 2) - 1) {
        const pad = Math.max(0, Math.floor((cols - subMsg.length) / 2));
        line = ' '.repeat(pad) + subMsg + ' '.repeat(Math.max(0, cols - pad - subMsg.length));
      } else if (r === Math.floor(rows / 2) + 1) {
        const pad = Math.max(0, Math.floor((cols - bannerMsg.length) / 2));
        line = ' '.repeat(pad) + bannerMsg + ' '.repeat(Math.max(0, cols - pad - bannerMsg.length));
      } else if (r === Math.floor(rows / 2) - 3 || r === Math.floor(rows / 2) + 3) {
        const boxWidth = Math.min(cols - 4, Math.max(subMsg.length, bannerMsg.length) + 6);
        const pad = Math.max(0, Math.floor((cols - boxWidth) / 2));
        line = ' '.repeat(pad) + '+' + '-'.repeat(Math.max(0, boxWidth - 2)) + '+' + ' '.repeat(Math.max(0, cols - pad - boxWidth));
      } else {
        line = ' '.repeat(cols);
      }
      lines.push(line.slice(0, cols));
    }
    return lines.join('\n');
  }

  const { ctx } = getOffscreenCanvas(cols, rows);
  if (!ctx) return '';

  // 1. Clear background
  ctx.fillStyle = viewConfig.background === 'white' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, cols, rows);

  // 2. Compute media element dimensions
  let srcWidth = 100;
  let srcHeight = 100;
  if (mediaElement instanceof HTMLImageElement) {
    srcWidth = mediaElement.naturalWidth || mediaElement.width || 100;
    srcHeight = mediaElement.naturalHeight || mediaElement.height || 100;
  } else if (mediaElement instanceof HTMLVideoElement) {
    srcWidth = mediaElement.videoWidth || mediaElement.width || 100;
    srcHeight = mediaElement.videoHeight || mediaElement.height || 100;
  } else if (mediaElement instanceof HTMLCanvasElement) {
    srcWidth = mediaElement.width || 100;
    srcHeight = mediaElement.height || 100;
  }

  // Monospace cell aspect ratio compensation factor (standard ~0.55 width/height)
  const cellAspect = 0.55;
  const virtualCanvasWidth = cols;
  const virtualCanvasHeight = rows / cellAspect;

  let drawW = virtualCanvasWidth;
  let drawH = virtualCanvasHeight;

  const srcAspect = srcWidth / Math.max(1, srcHeight);
  const canvasAspect = virtualCanvasWidth / Math.max(1, virtualCanvasHeight);

  if (mediaConfig.fit === 'contain') {
    if (srcAspect > canvasAspect) {
      drawW = virtualCanvasWidth;
      drawH = virtualCanvasWidth / srcAspect;
    } else {
      drawH = virtualCanvasHeight;
      drawW = virtualCanvasHeight * srcAspect;
    }
  } else if (mediaConfig.fit === 'cover') {
    if (srcAspect > canvasAspect) {
      drawH = virtualCanvasHeight;
      drawW = virtualCanvasHeight * srcAspect;
    } else {
      drawW = virtualCanvasWidth;
      drawH = virtualCanvasWidth / srcAspect;
    }
  } else if (mediaConfig.fit === 'original') {
    drawW = srcWidth;
    drawH = srcHeight;
  } else {
    // stretch
    drawW = virtualCanvasWidth;
    drawH = virtualCanvasHeight;
  }

  // Apply user scale / zoom
  drawW *= mediaConfig.scale || 1.0;
  drawH *= mediaConfig.scale || 1.0;

  // Compress height back to cell aspect ratio
  const finalDrawH = drawH * cellAspect;
  const finalDrawW = drawW;

  // Compute pan offsets in grid coordinates
  const cx = cols / 2 + (mediaConfig.offsetX / 100) * (cols / 2);
  const cy = rows / 2 + (mediaConfig.offsetY / 100) * (rows / 2);

  // Set Resampling Smoothing Mode
  ctx.imageSmoothingEnabled = viewConfig.resampling !== 'nearest';
  if (ctx.imageSmoothingEnabled) {
    ctx.imageSmoothingQuality = viewConfig.resampling === 'preserve-details' ? 'high' : 'medium';
  }

  ctx.save();
  ctx.translate(cx, cy);

  if (mediaConfig.rotation !== 0) {
    ctx.rotate((mediaConfig.rotation * Math.PI) / 180);
  }

  const scaleFactorX = mediaConfig.flipX ? -1 : 1;
  const scaleFactorY = mediaConfig.flipY ? -1 : 1;
  if (scaleFactorX !== 1 || scaleFactorY !== 1) {
    ctx.scale(scaleFactorX, scaleFactorY);
  }

  try {
    ctx.drawImage(mediaElement, -finalDrawW / 2, -finalDrawH / 2, finalDrawW, finalDrawH);
  } catch {
    // drawing error (e.g. video not ready)
  }
  ctx.restore();

  // 3. Extract Pixel Data
  const imageData = ctx.getImageData(0, 0, cols, rows);
  const data = imageData.data;

  // 4. Initial Luminance Extraction & Alpha Handling
  const alphaThreshold = viewConfig.alphaThreshold ?? 10;
  for (let i = 0; i < totalCells; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];

    if (a <= alphaThreshold) {
      lumBuffer[i] = -1; // Flag as transparent
      continue;
    }

    // ITU-R BT.709 relative luminance
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    lumBuffer[i] = lum;
  }

  // 5. Blur Pre-Filtering
  const blurRadius = viewConfig.blur > 0 ? Math.max(1, Math.round(viewConfig.blur / 2)) : 0;

  if (blurRadius > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, blurRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) lumBuffer[i] = blurBuffer[i];
    }
  }

  // 6. Sharpen Filter (Unsharp Mask: Original + Strength * (Original - Blurred))
  if (viewConfig.sharpenStrength > 0) {
    const sRadius = Math.max(1, viewConfig.sharpenRadius || 2);
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, sRadius);
    const amount = (viewConfig.sharpenStrength / 100.0) * 1.5;

    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) {
        const diff = lumBuffer[i] - blurBuffer[i];
        lumBuffer[i] = Math.max(0, Math.min(1, lumBuffer[i] + diff * amount));
      }
    }
  }

  // 7. Sobel Edge Detection (if enabled)
  if (viewConfig.edgeDetection) {
    edgeBuffer.fill(0);
    const edgeThreshold = (viewConfig.edgeThreshold || 30) / 100.0;
    const edgeStrength = (viewConfig.edgeStrength || 100) / 100.0;

    for (let y = 1; y < rows - 1; y++) {
      const rowOffset = y * cols;
      for (let x = 1; x < cols - 1; x++) {
        const i00 = (y - 1) * cols + (x - 1);
        const i01 = (y - 1) * cols + x;
        const i02 = (y - 1) * cols + (x + 1);
        const i10 = rowOffset + (x - 1);
        const i12 = rowOffset + (x + 1);
        const i20 = (y + 1) * cols + (x - 1);
        const i21 = (y + 1) * cols + x;
        const i22 = (y + 1) * cols + (x + 1);

        const l00 = Math.max(0, lumBuffer[i00]);
        const l01 = Math.max(0, lumBuffer[i01]);
        const l02 = Math.max(0, lumBuffer[i02]);
        const l10 = Math.max(0, lumBuffer[i10]);
        const l12 = Math.max(0, lumBuffer[i12]);
        const l20 = Math.max(0, lumBuffer[i20]);
        const l21 = Math.max(0, lumBuffer[i21]);
        const l22 = Math.max(0, lumBuffer[i22]);

        const gx = -l00 - 2 * l10 - l20 + l02 + 2 * l12 + l22;
        const gy = -l00 - 2 * l01 - l02 + l20 + 2 * l21 + l22;
        const mag = Math.hypot(gx, gy);

        if (mag > edgeThreshold) {
          edgeBuffer[rowOffset + x] = Math.min(1, (mag - edgeThreshold) * edgeStrength * 2);
        }
      }
    }

    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) {
        lumBuffer[i] = Math.max(0, Math.min(1, lumBuffer[i] + edgeBuffer[i]));
      }
    }
  }

  // 8. Levels, Brightness, Contrast & Tonal Level Curves
  const contrastFactor = Math.tan(((viewConfig.contrast + 100) * Math.PI) / 400); // [-100..100] -> [0..inf]
  const brightnessOffset = viewConfig.brightness / 100.0;

  // Levels parameters: black point, white point, and midtones gamma
  const inBlack = Math.max(0, Math.min(0.95, (viewConfig.levelBlack ?? 0) / 100.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, (viewConfig.levelWhite ?? 100) / 100.0));
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, (viewConfig.levelMidtones ?? 50) / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  // Symmetrical tonal adjustments centered at 0 (range: -100 to 100)
  const shadowAdj = (viewConfig.shadows || 0) / 100.0; // [-1..1]
  const highlightAdj = (viewConfig.highlights || 0) / 100.0; // [-1..1]
  const midtoneGamma = Math.pow(2.0, -(viewConfig.midtones || 0) / 50.0); // [-100..100] -> gamma

  // Noise injection
  const noiseAmp = (viewConfig.noise || 0) / 200.0;

  for (let i = 0; i < totalCells; i++) {
    let val = lumBuffer[i];
    if (val < 0) continue;

    // 1. Levels Remapping
    val = Math.max(0, Math.min(1, (val - inBlack) / (inWhite - inBlack)));
    if (levelsGamma !== 1.0 && val > 0 && val < 1) {
      val = Math.pow(val, 1 / levelsGamma);
    }

    // 2. Contrast & Brightness
    val = (val - 0.5) * contrastFactor + 0.5 + brightnessOffset;

    // 3. Tonal Curves (Shadows, Highlights, Midtones)
    if (shadowAdj !== 0) {
      val = val + shadowAdj * (1.0 - val) * (1.0 - val) * 0.5;
    }
    if (highlightAdj !== 0) {
      val = val + highlightAdj * val * val * 0.5;
    }
    if (midtoneGamma !== 1.0 && val > 0 && val < 1) {
      val = Math.pow(val, midtoneGamma);
    }

    // 4. Noise
    if (noiseAmp > 0) {
      val += (Math.random() - 0.5) * noiseAmp;
    }

    // 5. Invert
    if (viewConfig.invert) {
      val = 1.0 - val;
    }

    lumBuffer[i] = Math.max(0, Math.min(1, val));
  }

  // 9. Dithering Algorithms
  ditherBuffer.set(lumBuffer);
  const algorithm = viewConfig.algorithm || 'floyd-steinberg';

  if (algorithm === 'floyd-steinberg') {
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const oldVal = ditherBuffer[idx];
        if (oldVal < 0) continue;

        const quantized = Math.round(oldVal * (densityLength - 1)) / (densityLength - 1);
        ditherBuffer[idx] = quantized;
        const err = oldVal - quantized;

        if (x + 1 < cols) ditherBuffer[rowOffset + x + 1] += (err * 7) / 16;
        if (y + 1 < rows) {
          const nextRow = (y + 1) * cols;
          if (x - 1 >= 0) ditherBuffer[nextRow + x - 1] += (err * 3) / 16;
          ditherBuffer[nextRow + x] += (err * 5) / 16;
          if (x + 1 < cols) ditherBuffer[nextRow + x + 1] += (err * 1) / 16;
        }
      }
    }
  } else if (algorithm === 'atkinson') {
    // 1/8 to 6 neighboring pixels
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const oldVal = ditherBuffer[idx];
        if (oldVal < 0) continue;

        const quantized = Math.round(oldVal * (densityLength - 1)) / (densityLength - 1);
        ditherBuffer[idx] = quantized;
        const err = oldVal - quantized;
        const fraction = err / 8;

        if (x + 1 < cols) ditherBuffer[rowOffset + x + 1] += fraction;
        if (x + 2 < cols) ditherBuffer[rowOffset + x + 2] += fraction;
        if (y + 1 < rows) {
          const nextRow = (y + 1) * cols;
          if (x - 1 >= 0) ditherBuffer[nextRow + x - 1] += fraction;
          ditherBuffer[nextRow + x] += fraction;
          if (x + 1 < cols) ditherBuffer[nextRow + x + 1] += fraction;
        }
        if (y + 2 < rows) {
          ditherBuffer[(y + 2) * cols + x] += fraction;
        }
      }
    }
  } else if (algorithm === 'sierra') {
    // Sierra Lite error diffusion
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const oldVal = ditherBuffer[idx];
        if (oldVal < 0) continue;

        const quantized = Math.round(oldVal * (densityLength - 1)) / (densityLength - 1);
        ditherBuffer[idx] = quantized;
        const err = oldVal - quantized;

        if (x + 1 < cols) ditherBuffer[rowOffset + x + 1] += (err * 2) / 4;
        if (y + 1 < rows) {
          const nextRow = (y + 1) * cols;
          if (x - 1 >= 0) ditherBuffer[nextRow + x - 1] += (err * 1) / 4;
          ditherBuffer[nextRow + x] += (err * 1) / 4;
        }
      }
    }
  } else if (algorithm === 'bayer-4x4') {
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const val = ditherBuffer[idx];
        if (val < 0) continue;

        const matrixVal = (BAYER_4X4[y % 4][x % 4] / 16.0 - 0.5) * (1.0 / (densityLength - 1));
        ditherBuffer[idx] = Math.max(0, Math.min(1, val + matrixVal));
      }
    }
  } else if (algorithm === 'bayer-8x8') {
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const val = ditherBuffer[idx];
        if (val < 0) continue;

        const matrixVal = (BAYER_8X8[y % 8][x % 8] / 64.0 - 0.5) * (1.0 / (densityLength - 1));
        ditherBuffer[idx] = Math.max(0, Math.min(1, val + matrixVal));
      }
    }
  } else if (algorithm === 'noise') {
    for (let i = 0; i < totalCells; i++) {
      const val = ditherBuffer[i];
      if (val < 0) continue;
      const noise = (Math.random() - 0.5) * (1.0 / (densityLength - 1));
      ditherBuffer[i] = Math.max(0, Math.min(1, val + noise));
    }
  }

  // 10. Density Charset Mapping & Line Assembly
  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const idx = rowOffset + x;
      const val = ditherBuffer[idx];

      if (val < 0) {
        lineBuffer[x] = ' ';
        continue;
      }

      let charIndex = Math.floor(val * densityLength);
      if (charIndex < 0) charIndex = 0;
      else if (charIndex >= densityLength) charIndex = densityLength - 1;

      lineBuffer[x] = density[charIndex] || ' ';
    }
    cachedLines[y] = lineBuffer.join('');
  }

  return cachedLines.join('\n');
}
