import {
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
} from '../types/ascii';
import { applyDitherAlgorithm } from './ditherAlgorithms';
import { BUILTIN_PALETTES, PaletteQuantizer, evaluateMultiTone, quantizeImageToPaletteWithDither } from './palettes';

import { getBrailleCharFromSubpixels, MONOSPACE_CELL_ASPECT } from './renderer';


export interface RenderMediaContext {
  cols: number;
  rows: number;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig: MediaConfig;
  viewConfig: MediaViewConfig;
  density: string;
  colorConfig?: MediaColorConfig;
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  halftoneConfig?: HalftoneConfig;
}


export interface AsciiMediaFrameResult {
  text: string;
  colors: Uint8ClampedArray | null; // RGB buffer (size = cols * rows * 3)
  luminance: Float32Array | null; // size = cols * rows
  bgColor: string;
  isColored: boolean;
  cols: number;
  rows: number;
  rasterMode?: RasterOutputMode;
}

export function resolveMediaBackgroundColor(colorConfig?: MediaColorConfig, viewConfigBackground?: string): string {
  if (colorConfig?.mode === 'content') {
    if (colorConfig.bgPreset === 'white') return '#ffffff';
    if (colorConfig.bgPreset === 'dark') return '#0a0a0a';
    if (colorConfig.bgPreset === 'custom') return colorConfig.customBg || '#0a0a0a';
  }
  if (viewConfigBackground === 'white') return '#ffffff';
  return '#0a0a0a';
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
let colorsBuffer = new Uint8ClampedArray(0);

// Active Quantizer cache
let cachedPaletteId = '';
let activeQuantizer: PaletteQuantizer | null = null;

/**
 * Fritsch-Carlson Monotone Cubic Spline Interpolation for Tone Curves
 */
export function evaluateMonotoneCubicSpline(points: [number, number][], x: number): number {
  if (!points || points.length === 0) return x;
  if (points.length === 1) return points[0][1];

  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const n = sorted.length;

  if (x <= sorted[0][0]) return Math.max(0, Math.min(1, sorted[0][1]));
  if (x >= sorted[n - 1][0]) return Math.max(0, Math.min(1, sorted[n - 1][1]));

  let i = 0;
  for (let k = 0; k < n - 1; k++) {
    if (x >= sorted[k][0] && x <= sorted[k + 1][0]) {
      i = k;
      break;
    }
  }

  const dx = sorted[i + 1][0] - sorted[i][0];
  if (dx === 0) return sorted[i][1];

  const deltas = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const segDx = sorted[k + 1][0] - sorted[k][0];
    deltas[k] = segDx === 0 ? 0 : (sorted[k + 1][1] - sorted[k][1]) / segDx;
  }

  const m = new Float64Array(n);
  m[0] = deltas[0];
  for (let k = 1; k < n - 1; k++) {
    m[k] = (deltas[k - 1] + deltas[k]) * 0.5;
  }
  m[n - 1] = deltas[n - 2];

  for (let k = 0; k < n - 1; k++) {
    if (deltas[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
    } else {
      const alpha = m[k] / deltas[k];
      const beta = m[k + 1] / deltas[k];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[k] = tau * alpha * deltas[k];
        m[k + 1] = tau * beta * deltas[k];
      }
    }
  }

  const t = (x - sorted[i][0]) / dx;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const y = h00 * sorted[i][1] + h10 * dx * m[i] + h01 * sorted[i + 1][1] + h11 * dx * m[i + 1];
  return Math.max(0, Math.min(1, y));
}

export function createToneCurveLUT(points?: [number, number][]): Float32Array | null {
  if (!points || points.length < 2) return null;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = evaluateMonotoneCubicSpline(points, i / 255.0);
  }
  return lut;
}

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
 * Computes a single full ASCII / Halftone frame and per-character RGB color data
 * from a 2D image or video element using aspect-compensated sampling and 40+ dithering algorithms.
 */
export function renderAsciiMediaFrameData(context: RenderMediaContext): AsciiMediaFrameResult {
  const { cols, rows, mediaElement, mediaConfig, viewConfig, density } = context;
  const colorConfig = context.colorConfig || viewConfig.colorConfig || DEFAULT_MEDIA_COLOR_CONFIG;
  const paletteMode = colorConfig.paletteMode || (colorConfig.mode === 'content' ? 'content' : 'phosphor');
  const isColored = paletteMode === 'content' || paletteMode === 'indexed' || paletteMode === 'duotone' || paletteMode === 'tritone' || paletteMode === 'quadtone';
  const bgColor = resolveMediaBackgroundColor(colorConfig, viewConfig.background);
  const rasterMode = context.rasterMode || viewConfig.rasterMode || 'ascii';


  if (cols <= 0 || rows <= 0) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols: 0, rows: 0, rasterMode };
  }

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
  if (isColored && colorsBuffer.length !== totalCells * 3) {
    colorsBuffer = new Uint8ClampedArray(totalCells * 3);
  }

  // Placeholder when no image or video is loaded yet
  if (!mediaElement) {
    const lines: string[] = [];
    const bannerMsg = 'PASTE IMAGE [ ⌘+V / CTRL+V ] OR DROP FILE';
    const subMsg = 'RASTER STUDIO 2D MEDIA ENGINE';

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
    return { text: lines.join('\n'), colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode };
  }

  const { ctx } = getOffscreenCanvas(cols, rows);
  if (!ctx) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode };
  }

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

  const isTextMode = rasterMode === 'ascii' || rasterMode === 'braille';
  const cellAspect = isTextMode ? MONOSPACE_CELL_ASPECT : (context.halftoneConfig?.cellRatio ?? 1.0);
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
    drawW = virtualCanvasWidth;
    drawH = virtualCanvasHeight;
  }

  drawW *= mediaConfig.scale || 1.0;
  drawH *= mediaConfig.scale || 1.0;

  const cx = cols / 2 + (mediaConfig.offsetX / 100) * (cols / 2);
  const cy = rows / 2 + (mediaConfig.offsetY / 100) * (rows / 2);

  ctx.imageSmoothingEnabled = viewConfig.resampling !== 'nearest';
  if (ctx.imageSmoothingEnabled) {
    ctx.imageSmoothingQuality = viewConfig.resampling === 'preserve-details' ? 'high' : 'medium';
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, cellAspect);
  if (mediaConfig.rotation !== 0) {
    ctx.rotate((mediaConfig.rotation * Math.PI) / 180);
  }
  const scaleFactorX = mediaConfig.flipX ? -1 : 1;
  const scaleFactorY = mediaConfig.flipY ? -1 : 1;
  if (scaleFactorX !== 1 || scaleFactorY !== 1) {
    ctx.scale(scaleFactorX, scaleFactorY);
  }

  try {
    ctx.drawImage(mediaElement, -drawW / 2, -drawH / 2, drawW, drawH);
  } catch {
  }
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, cols, rows);
  const data = imageData.data;

  const toneCfg = context.toneConfig || viewConfig.toneConfig;
  const mixR = (toneCfg?.channelMixerR ?? 100) / 100.0;
  const mixG = (toneCfg?.channelMixerG ?? 100) / 100.0;
  const mixB = (toneCfg?.channelMixerB ?? 100) / 100.0;

  const normWeight = 0.2126 * mixR + 0.7152 * mixG + 0.0722 * mixB || 1.0;

  const alphaThreshold = viewConfig.alphaThreshold ?? 10;
  for (let i = 0; i < totalCells; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];

    if (a <= alphaThreshold) {
      lumBuffer[i] = -1;
      continue;
    }

    const lum = (0.2126 * r * mixR + 0.7152 * g * mixG + 0.0722 * b * mixB) / (255.0 * normWeight);
    lumBuffer[i] = Math.max(0, Math.min(1, lum));
  }

  const blurRadius = viewConfig.blur > 0 ? Math.max(1, Math.round(viewConfig.blur / 2)) : 0;
  if (blurRadius > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, blurRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) lumBuffer[i] = blurBuffer[i];
    }
  }

  const sharpenStrength = (viewConfig.sharpenStrength || 0) / 100.0;
  const sharpenRadius = Math.max(1, Math.min(10, viewConfig.sharpenRadius || 2));

  if (sharpenStrength > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, sharpenRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) {
        const orig = lumBuffer[i];
        const blurred = blurBuffer[i];
        const unsharp = orig + sharpenStrength * (orig - blurred);
        lumBuffer[i] = Math.max(0, Math.min(1, unsharp));
      }
    }
  }

  if (viewConfig.edgeDetection) {
    const edgeThreshold = (viewConfig.edgeThreshold || 25) / 100.0;
    const edgeStrength = (viewConfig.edgeStrength || 100) / 100.0;
    edgeBuffer.fill(0);
    for (let y = 1; y < rows - 1; y++) {
      const rowOffset = y * cols;
      const prevRow = (y - 1) * cols;
      const nextRow = (y + 1) * cols;
      for (let x = 1; x < cols - 1; x++) {
        const l00 = Math.max(0, lumBuffer[prevRow + x - 1]);
        const l01 = Math.max(0, lumBuffer[prevRow + x]);
        const l02 = Math.max(0, lumBuffer[prevRow + x + 1]);
        const l10 = Math.max(0, lumBuffer[rowOffset + x - 1]);
        const l12 = Math.max(0, lumBuffer[rowOffset + x + 1]);
        const l20 = Math.max(0, lumBuffer[nextRow + x - 1]);
        const l21 = Math.max(0, lumBuffer[nextRow + x]);
        const l22 = Math.max(0, lumBuffer[nextRow + x + 1]);
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

  const contrastFactor = Math.tan(((viewConfig.contrast + 100) * Math.PI) / 400);
  const brightnessOffset = viewConfig.brightness / 100.0;
  const inBlack = Math.max(0, Math.min(0.95, ((toneCfg?.levelsBlack !== undefined) ? toneCfg.levelsBlack : (viewConfig.levelBlack ?? 0)) / 100.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, ((toneCfg?.levelsWhite !== undefined) ? toneCfg.levelsWhite : (viewConfig.levelWhite ?? 100)) / 100.0));
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, ((toneCfg?.levelsMidtones !== undefined) ? toneCfg.levelsMidtones : (viewConfig.levelMidtones ?? 50)) / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const shadowAdj = (viewConfig.shadows || 0) / 100.0;
  const highlightAdj = (viewConfig.highlights || 0) / 100.0;
  const midtoneGamma = Math.pow(2.0, -(viewConfig.midtones || 0) / 50.0);
  const curveLut = viewConfig.curvePoints && viewConfig.curvePoints.length >= 2 ? createToneCurveLUT(viewConfig.curvePoints) : null;
  const noiseAmp = (viewConfig.noise || 0) / 200.0;
  const posterizeBits = toneCfg?.posterizeBits || 0;

  for (let i = 0; i < totalCells; i++) {
    let val = lumBuffer[i];
    if (val < 0) continue;
    if (curveLut) {
      const lutIdx = Math.max(0, Math.min(255, Math.round(val * 255)));
      val = curveLut[lutIdx];
    }
    val = Math.max(0, Math.min(1, (val - inBlack) / (inWhite - inBlack)));
    if (levelsGamma !== 1.0 && val > 0 && val < 1) val = Math.pow(val, 1 / levelsGamma);
    val = (val - 0.5) * contrastFactor + 0.5 + brightnessOffset;
    if (shadowAdj !== 0) val = val + shadowAdj * (1.0 - val) * (1.0 - val) * 0.5;
    if (highlightAdj !== 0) val = val + highlightAdj * val * val * 0.5;
    if (midtoneGamma !== 1.0 && val > 0 && val < 1) val = Math.pow(val, midtoneGamma);
    if (posterizeBits > 0) {
      const steps = Math.pow(2, posterizeBits) - 1;
      val = Math.round(val * steps) / steps;
    }
    if (noiseAmp > 0) val += (Math.random() - 0.5) * noiseAmp;
    if (viewConfig.invert) val = 1.0 - val;
    lumBuffer[i] = Math.max(0, Math.min(1, val));
  }

  // Universal Dithering Suite (40+ Algorithms)
  const algorithm = context.algorithm || viewConfig.algorithm || 'floyd-steinberg';
  const ditherLevels = (rasterMode === 'pixel') ? 2 : densityLength;
  applyDitherAlgorithm(lumBuffer, ditherBuffer, cols, rows, algorithm, ditherLevels, 1.0);

  // Setup Palette Quantizer if indexed mode
  if (paletteMode === 'indexed') {
    const palId = colorConfig.activePaletteId || 'gameboy-classic';
    if (!activeQuantizer || cachedPaletteId !== palId) {
      const found = BUILTIN_PALETTES.find((p) => p.id === palId) || BUILTIN_PALETTES[0];
      activeQuantizer = new PaletteQuantizer(found);
      cachedPaletteId = palId;
    }
  }

  const samplingMethod = colorConfig.sampling || 'center';
  const saturationFactor = colorConfig.saturation !== undefined ? colorConfig.saturation / 100.0 : 2.0;

  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const idx = rowOffset + x;
      const val = ditherBuffer[idx];
      const p = idx * 4;

      if (val < 0) {
        lineBuffer[x] = ' ';
        if (isColored) {
          colorsBuffer[idx * 3] = 0;
          colorsBuffer[idx * 3 + 1] = 0;
          colorsBuffer[idx * 3 + 2] = 0;
        }
        continue;
      }

      // Glyph mapping
      if (rasterMode === 'braille') {
        const d1 = val > 0.10;
        const d2 = val > 0.25;
        const d3 = val > 0.38;
        const d4 = val > 0.50;
        const d5 = val > 0.63;
        const d6 = val > 0.75;
        const d7 = val > 0.88;
        const d8 = val > 0.95;
        lineBuffer[x] = getBrailleCharFromSubpixels(d1, d2, d3, d4, d5, d6, d7, d8);
      } else {
        let charIndex = Math.floor(val * densityLength);
        if (charIndex < 0) charIndex = 0;
        else if (charIndex >= densityLength) charIndex = densityLength - 1;
        lineBuffer[x] = density[charIndex] || ' ';
      }


      // Color calculations
      if (isColored) {
        let r = data[p];
        let g = data[p + 1];
        let b = data[p + 2];

        if (samplingMethod === 'average' || samplingMethod === 'weighted') {
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = Math.max(0, Math.min(rows - 1, y + dy));
            const nRowOff = ny * cols;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = Math.max(0, Math.min(cols - 1, x + dx));
              const np = (nRowOff + nx) * 4;
              if (data[np + 3] > alphaThreshold) {
                const weight = dx === 0 && dy === 0 ? 2 : 1;
                sumR += data[np] * weight;
                sumG += data[np + 1] * weight;
                sumB += data[np + 2] * weight;
                count += weight;
              }
            }
          }
          if (count > 0) { r = sumR / count; g = sumG / count; b = sumB / count; }
        }

        if (saturationFactor !== 1.0) {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = gray + (r - gray) * saturationFactor;
          g = gray + (g - gray) * saturationFactor;
          b = gray + (b - gray) * saturationFactor;
        }

        if (paletteMode === 'indexed' && activeQuantizer) {
          // Store saturated RGB for whole-image 3D error-diffusion
          colorsBuffer[idx * 3] = Math.max(0, Math.min(255, Math.round(r)));
          colorsBuffer[idx * 3 + 1] = Math.max(0, Math.min(255, Math.round(g)));
          colorsBuffer[idx * 3 + 2] = Math.max(0, Math.min(255, Math.round(b)));
        } else if ((paletteMode === 'duotone' || paletteMode === 'tritone' || paletteMode === 'quadtone') && colorConfig.multiTone) {
          const mapped = evaluateMultiTone(val, colorConfig.multiTone);
          colorsBuffer[idx * 3] = Math.max(0, Math.min(255, Math.round(mapped.r)));
          colorsBuffer[idx * 3 + 1] = Math.max(0, Math.min(255, Math.round(mapped.g)));
          colorsBuffer[idx * 3 + 2] = Math.max(0, Math.min(255, Math.round(mapped.b)));
        } else {
          colorsBuffer[idx * 3] = Math.max(0, Math.min(255, Math.round(r)));
          colorsBuffer[idx * 3 + 1] = Math.max(0, Math.min(255, Math.round(g)));
          colorsBuffer[idx * 3 + 2] = Math.max(0, Math.min(255, Math.round(b)));
        }
      }
    }
    cachedLines[y] = lineBuffer.join('');
  }

  // 3D Color-Space Error Diffusion for Indexed Palettes
  if (isColored && paletteMode === 'indexed' && activeQuantizer) {
    quantizeImageToPaletteWithDither(colorsBuffer, colorsBuffer, cols, rows, activeQuantizer, algorithm, 1.0);
  }


  return {
    text: cachedLines.join('\n'),
    colors: isColored ? colorsBuffer : null,
    luminance: ditherBuffer,
    bgColor,
    isColored,
    cols,
    rows,
    rasterMode,
  };
}

export function renderAsciiMediaFrame(context: RenderMediaContext): string {
  return renderAsciiMediaFrameData(context).text;
}

