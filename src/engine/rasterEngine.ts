/**
 * ASCII Studio / Raster Studio — Unified 2D Raster Engine (`rasterEngine.ts`)
 *
 * Consolidates all image post-processing, tone curves, convolution filters,
 * 3D color-space error diffusion, 40+ dithering algorithms, and output modality
 * routing into a single, high-performance, zero-allocation pipeline.
 */

import {
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  MediaColorConfig,
  HalftoneConfig,
} from '../types/ascii';
import { applyDitherAlgorithm } from './ditherAlgorithms';
import {
  BUILTIN_PALETTES,
  PaletteQuantizer,
  evaluateMultiTone,
  quantizeImageToPaletteWithDither,
  hexToRgb,
} from './palettes';
import { getBrailleCharFromSubpixels } from './renderer';

export interface RawFrameBuffer {
  width: number;
  height: number;
  rgba: Uint8ClampedArray; // size = width * height * 4
  luminance?: Float32Array; // optional precomputed luminance
  charOverrides?: (string | null)[]; // optional particle / spark character overrides
  bgColor?: string;
}

export interface UnifiedPipelineOptions {
  cols: number;
  rows: number;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  density: string;
  toneConfig?: ToneMappingConfig;
  colorConfig?: MediaColorConfig;
  halftoneConfig?: HalftoneConfig;
  noise?: number;
  contrast?: number;
  brightness?: number;
  invert?: boolean;
  blur?: number;
  sharpenStrength?: number;
  sharpenRadius?: number;
  edgeDetection?: boolean;
  edgeThreshold?: number;
  edgeStrength?: number;
  curvePoints?: [number, number][];
  shadows?: number;
  highlights?: number;
  midtones?: number;
  alphaThreshold?: number;
  saturation?: number;
}

export interface ProcessedRasterResult {
  text: string;
  colors: Uint8ClampedArray | null; // RGB buffer (size = cols * rows * 3)
  luminance: Float32Array; // size = cols * rows
  cols: number;
  rows: number;
  rasterMode: RasterOutputMode;
  bgColor: string;
  isColored: boolean;
}

// ---------------------------------------------------------------------------
// Zero-Allocation Global Scratch Buffers (resized only on resolution change)
// ---------------------------------------------------------------------------
let cachedCols = 0;
let cachedRows = 0;

let lumBuffer = new Float32Array(0);
let ditherBuffer = new Float32Array(0);
let blurBuffer = new Float32Array(0);
let tempBlurBuffer = new Float32Array(0);
let edgeBuffer = new Float32Array(0);
let colorsBuffer = new Uint8ClampedArray(0);
let cachedLines: string[] = [];
let lineBuffer: string[] = [];

// Palette quantizer cache
let cachedPaletteId = '';
let activeQuantizer: PaletteQuantizer | null = null;

function ensureBufferCapacity(totalCells: number, cols: number, rows: number) {
  if (lumBuffer.length !== totalCells) {
    lumBuffer = new Float32Array(totalCells);
    ditherBuffer = new Float32Array(totalCells);
    blurBuffer = new Float32Array(totalCells);
    tempBlurBuffer = new Float32Array(totalCells);
    edgeBuffer = new Float32Array(totalCells);
    colorsBuffer = new Uint8ClampedArray(totalCells * 3);
  }
  if (cachedCols !== cols || cachedRows !== rows) {
    cachedCols = cols;
    cachedRows = rows;
    cachedLines = new Array(rows);
    lineBuffer = new Array(cols);
  }
}

// ---------------------------------------------------------------------------
// Fritsch-Carlson Monotone Cubic Spline Interpolation for Tone Curves
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fast Box Blur (Separable 1D)
// ---------------------------------------------------------------------------
function applyFastBoxBlur(src: Float32Array, dest: Float32Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    dest.set(src);
    return;
  }

  const r = Math.min(Math.max(1, Math.floor(radius)), 10);
  const winSize = 2 * r + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;

    for (let i = -r; i <= r; i++) {
      const px = Math.min(width - 1, Math.max(0, i));
      sum += src[rowOffset + px];
    }
    tempBlurBuffer[rowOffset] = sum / winSize;

    for (let x = 1; x < width; x++) {
      const removeX = Math.max(0, x - r - 1);
      const addX = Math.min(width - 1, x + r);
      sum += src[rowOffset + addX] - src[rowOffset + removeX];
      tempBlurBuffer[rowOffset + x] = sum / winSize;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;

    for (let i = -r; i <= r; i++) {
      const py = Math.min(height - 1, Math.max(0, i));
      sum += tempBlurBuffer[py * width + x];
    }
    dest[x] = sum / winSize;

    for (let y = 1; y < height; y++) {
      const removeY = Math.max(0, y - r - 1);
      const addY = Math.min(height - 1, y + r);
      sum += tempBlurBuffer[addY * width + x] - tempBlurBuffer[removeY * width + x];
      dest[y * width + x] = sum / winSize;
    }
  }
}

// ---------------------------------------------------------------------------
// Unified Post-Processing & Dithering Pipeline
// ---------------------------------------------------------------------------
export function processRasterFrame(
  rawFrame: RawFrameBuffer,
  options: UnifiedPipelineOptions
): ProcessedRasterResult {
  const { cols, rows, density } = options;
  const totalCells = cols * rows;

  if (cols <= 0 || rows <= 0) {
    return {
      text: '',
      colors: null,
      luminance: new Float32Array(0),
      cols: 0,
      rows: 0,
      rasterMode: options.rasterMode || 'ascii',
      bgColor: '#0a0a0a',
      isColored: false,
    };
  }

  ensureBufferCapacity(totalCells, cols, rows);

  const rasterMode = options.rasterMode || 'ascii';
  const algorithm = options.ditherAlgorithm || 'none';
  const toneCfg = options.toneConfig;
  const colorCfg = options.colorConfig;

  // Resolve background color
  let bgColor = rawFrame.bgColor || '#0a0a0a';
  if (colorCfg?.mode === 'content') {
    if (colorCfg.bgPreset === 'white') bgColor = '#ffffff';
    else if (colorCfg.bgPreset === 'dark') bgColor = '#0a0a0a';
    else if (colorCfg.bgPreset === 'custom') bgColor = colorCfg.customBg || '#0a0a0a';
  }

  // -------------------------------------------------------------------------
  // Step 1: Channel Mixing & Base Luminance Extraction
  // -------------------------------------------------------------------------
  const mixR = (toneCfg?.channelMixerR ?? 100) / 100.0;
  const mixG = (toneCfg?.channelMixerG ?? 100) / 100.0;
  const mixB = (toneCfg?.channelMixerB ?? 100) / 100.0;
  const normWeight = 0.2126 * mixR + 0.7152 * mixG + 0.0722 * mixB || 1.0;
  const alphaThreshold = options.alphaThreshold ?? 10;

  const data = rawFrame.rgba;
  const hasRawLum = Boolean(rawFrame.luminance && rawFrame.luminance.length === totalCells);

  for (let i = 0; i < totalCells; i++) {
    if (hasRawLum && rawFrame.luminance) {
      lumBuffer[i] = rawFrame.luminance[i];
      continue;
    }

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

  // -------------------------------------------------------------------------
  // Step 2: Spatial Filters (Blur, Sharpen, Sobel Edges)
  // -------------------------------------------------------------------------
  const blurRadius = options.blur && options.blur > 0 ? Math.max(1, Math.round(options.blur / 2)) : 0;
  if (blurRadius > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, blurRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0) lumBuffer[i] = blurBuffer[i];
    }
  }

  const sharpenStrength = (options.sharpenStrength || 0) / 100.0;
  const sharpenRadius = Math.max(1, Math.min(10, options.sharpenRadius || 2));
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

  if (options.edgeDetection) {
    const edgeThreshold = (options.edgeThreshold || 25) / 100.0;
    const edgeStrength = (options.edgeStrength || 100) / 100.0;
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

  // -------------------------------------------------------------------------
  // Step 3: Tone Levels, Gamma, Curves, and Posterization
  // -------------------------------------------------------------------------
  const contrastFactor = Math.tan((((options.contrast || 0) + 100) * Math.PI) / 400);
  const brightnessOffset = (options.brightness || 0) / 100.0;

  const inBlack = Math.max(0, Math.min(0.95, (toneCfg?.levelsBlack ?? 0) / 100.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, (toneCfg?.levelsWhite ?? 100) / 100.0));
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, (toneCfg?.levelsMidtones ?? 50) / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const shadowAdj = (options.shadows || 0) / 100.0;
  const highlightAdj = (options.highlights || 0) / 100.0;
  const midtoneGamma = Math.pow(2.0, -(options.midtones || 0) / 50.0);
  const curveLut = options.curvePoints && options.curvePoints.length >= 2 ? createToneCurveLUT(options.curvePoints) : null;
  const noiseAmp = (options.noise || 0) / 200.0;
  const posterizeBits = toneCfg?.posterizeBits || 0;

  for (let i = 0; i < totalCells; i++) {
    let val = lumBuffer[i];
    if (val < 0) continue;

    if (curveLut) {
      const lutIdx = Math.max(0, Math.min(255, Math.round(val * 255)));
      val = curveLut[lutIdx];
    }

    if (val <= inBlack) {
      val = 0;
    } else if (val >= inWhite) {
      val = 1;
    } else {
      const norm = (val - inBlack) / (inWhite - inBlack);
      val = Math.pow(norm, levelsGamma);
    }

    if (contrastFactor !== 1.0 || brightnessOffset !== 0) {
      val = (val - 0.5) * contrastFactor + 0.5 + brightnessOffset;
      val = Math.max(0, Math.min(1, val));
    }

    if (shadowAdj !== 0 || highlightAdj !== 0) {
      if (val < 0.5) {
        val = val + shadowAdj * (0.5 - val) * 0.5;
      } else {
        val = val + highlightAdj * (val - 0.5) * 0.5;
      }
      val = Math.max(0, Math.min(1, val));
    }

    if (midtoneGamma !== 1.0) {
      val = Math.pow(val, midtoneGamma);
    }

    if (noiseAmp > 0) {
      val = val + (Math.random() - 0.5) * noiseAmp;
      val = Math.max(0, Math.min(1, val));
    }

    if (posterizeBits > 0 && posterizeBits <= 6) {
      const steps = Math.pow(2, posterizeBits) - 1;
      val = Math.round(val * steps) / steps;
    }

    if (options.invert) {
      val = 1.0 - val;
    }

    lumBuffer[i] = val;
  }

  // -------------------------------------------------------------------------
  // Step 4: Universal 40+ Dithering Algorithm Execution
  // -------------------------------------------------------------------------
  const ditherLevels = posterizeBits > 0 ? Math.pow(2, posterizeBits) : 256;
  applyDitherAlgorithm(lumBuffer, ditherBuffer, cols, rows, algorithm, ditherLevels, 1.0);

  // -------------------------------------------------------------------------
  // Step 5: Color Extraction & 3D Palette Quantization
  // -------------------------------------------------------------------------
  const paletteMode = colorCfg?.paletteMode || (colorCfg?.mode === 'content' ? 'content' : 'phosphor');
  const isColored = paletteMode === 'content' || paletteMode === 'indexed' || paletteMode === 'duotone' || paletteMode === 'tritone' || paletteMode === 'quadtone';

  let colorsOut: Uint8ClampedArray | null = null;

  if (isColored) {
    if (paletteMode === 'content') {
      const sat = (colorCfg?.saturation ?? 200) / 100.0;
      for (let i = 0; i < totalCells; i++) {
        const p = i * 4;
        let r = data[p];
        let g = data[p + 1];
        let b = data[p + 2];

        if (sat !== 1.0) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = Math.max(0, Math.min(255, Math.round(gray + (r - gray) * sat)));
          g = Math.max(0, Math.min(255, Math.round(gray + (g - gray) * sat)));
          b = Math.max(0, Math.min(255, Math.round(gray + (b - gray) * sat)));
        }

        colorsBuffer[i * 3] = r;
        colorsBuffer[i * 3 + 1] = g;
        colorsBuffer[i * 3 + 2] = b;
      }
      colorsOut = colorsBuffer;
    } else if (paletteMode === 'indexed') {
      const palId = colorCfg?.activePaletteId || 'gameboy-classic';
      if (!activeQuantizer || cachedPaletteId !== palId) {
        const found = BUILTIN_PALETTES.find((p) => p.id === palId) || BUILTIN_PALETTES[0];
        activeQuantizer = new PaletteQuantizer(found);
        cachedPaletteId = palId;
      }

      // If we have raw RGBA, use true 3D color error diffusion
      if (data.length === totalCells * 4 && !hasRawLum) {
        for (let i = 0; i < totalCells; i++) {
          colorsBuffer[i * 3] = data[i * 4];
          colorsBuffer[i * 3 + 1] = data[i * 4 + 1];
          colorsBuffer[i * 3 + 2] = data[i * 4 + 2];
        }
        quantizeImageToPaletteWithDither(
          colorsBuffer,
          colorsBuffer,
          cols,
          rows,
          activeQuantizer,
          algorithm,
          1.0
        );
      } else {
        // Map dithered luminance across palette swatches
        const rgbList = activeQuantizer.palette.colors.map(hexToRgb);
        const numColors = rgbList.length;
        for (let i = 0; i < totalCells; i++) {
          const val = Math.max(0, Math.min(1, ditherBuffer[i]));
          const cIdx = Math.max(0, Math.min(numColors - 1, Math.floor(val * numColors)));
          const col = rgbList[cIdx];
          colorsBuffer[i * 3] = col.r;
          colorsBuffer[i * 3 + 1] = col.g;
          colorsBuffer[i * 3 + 2] = col.b;
        }
      }
      colorsOut = colorsBuffer;
    } else if ((paletteMode === 'duotone' || paletteMode === 'tritone' || paletteMode === 'quadtone') && colorCfg?.multiTone) {
      for (let i = 0; i < totalCells; i++) {
        const val = Math.max(0, Math.min(1, ditherBuffer[i]));
        const mapped = evaluateMultiTone(val, colorCfg.multiTone);
        colorsBuffer[i * 3] = mapped.r;
        colorsBuffer[i * 3 + 1] = mapped.g;
        colorsBuffer[i * 3 + 2] = mapped.b;
      }
      colorsOut = colorsBuffer;
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Output Modality Routing
  // -------------------------------------------------------------------------
  const densityLength = density.length;
  const overrides = rawFrame.charOverrides;

  if (rasterMode === 'braille') {
    // 8-Dot Braille Matrix packing
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const cellIdx = rowOffset + x;
        const val = ditherBuffer[cellIdx];

        if (val < 0) {
          lineBuffer[x] = ' ';
          continue;
        }

        // Subpixel thresholding
        const d1 = val > 0.12;
        const d2 = val > 0.25;
        const d3 = val > 0.37;
        const d4 = val > 0.50;
        const d5 = val > 0.62;
        const d6 = val > 0.75;
        const d7 = val > 0.87;
        const d8 = val > 0.95;

        let cellChar = getBrailleCharFromSubpixels(d1, d2, d3, d4, d5, d6, d7, d8);

        if (overrides && overrides[cellIdx]) {
          cellChar = overrides[cellIdx]!;
        }
        lineBuffer[x] = cellChar;
      }
      cachedLines[y] = lineBuffer.join('');
    }
  } else if (rasterMode === 'ascii') {
    // Standard Monospace ASCII Character Density Mapping
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const cellIdx = rowOffset + x;
        const val = ditherBuffer[cellIdx];

        if (val < 0) {
          lineBuffer[x] = ' ';
          continue;
        }

        let charIndex = Math.floor(val * densityLength);
        if (charIndex < 0) charIndex = 0;
        else if (charIndex >= densityLength) charIndex = densityLength - 1;

        let cellChar = density[charIndex] || ' ';
        if (overrides && overrides[cellIdx]) {
          cellChar = overrides[cellIdx]!;
        }
        lineBuffer[x] = cellChar;
      }
      cachedLines[y] = lineBuffer.join('');
    }
  } else {
    // Graphic Halftone & Pixel modes
    cachedLines.fill('');
  }

  return {
    text: cachedLines.join('\n'),
    colors: colorsOut,
    luminance: ditherBuffer,
    cols,
    rows,
    rasterMode,
    bgColor,
    isColored,
  };
}
