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
  TonalMappingType,
  ImageAdjustConfig,
} from '../types/ascii';
import {
  BUILTIN_PALETTES,
  PaletteQuantizer,
  DEFAULT_PHOSPHOR_TINT,
} from './palettes';
import { applyDitherAlgorithm, DITHER_ALGORITHMS } from './ditherAlgorithms';

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
  noise?: number;
  denoise?: number;
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
  tonalMapping?: TonalMappingType;
  highlightColor?: string;
  midtoneColor?: string;
  shadowColor?: string;
  colorLevels?: number;
  /** Monochrome tint, baked into pixel output where CSS cannot reach. */
  monoTint?: string;
}

/**
 * Serpentine Floyd-Steinberg over an arbitrary set of quantization targets.
 *
 * Unlike the tone-space dither this snaps to wherever the palette's colours
 * actually sit, so the error carried into neighbouring cells is the real
 * difference between what was asked for and what the palette could give. That
 * is what lets a four-colour ramp reproduce a smooth gradient, and what stops
 * two near-identical palette entries from each claiming an equal slice of the
 * tonal range.
 */
function diffusePaletteTone(
  lum: Float32Array,
  cols: number,
  rows: number,
  paletteLum: number[],
  work: Float32Array,
  outIndex: Int32Array,
  diffuse: boolean
): void {
  const n = cols * rows;
  for (let i = 0; i < n; i++) work[i] = lum[i];

  for (let y = 0; y < rows; y++) {
    const leftToRight = (y & 1) === 0;
    const rowOff = y * cols;
    for (let k = 0; k < cols; k++) {
      const x = leftToRight ? k : cols - 1 - k;
      const i = rowOff + x;
      if (lum[i] < 0) {
        outIndex[i] = -1;
        continue;
      }
      const want = work[i];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < paletteLum.length; c++) {
        const d = Math.abs(paletteLum[c] - want);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      outIndex[i] = best;
      if (!diffuse) continue;
      const err = want - paletteLum[best];
      const fwd = leftToRight ? 1 : -1;
      const spread = (dx: number, dy: number, w: number) => {
        const nx = x + dx * fwd;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny >= rows) return;
        const ni = ny * cols + nx;
        if (lum[ni] < 0) return;
        work[ni] = Math.max(0, Math.min(1, work[ni] + err * w));
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
}

/**
 * Same serpentine diffusion, carried in RGB against the palette's own colours.
 * Used for chromatic sources, where nearest-colour matching alone posterizes a
 * photo into whichever handful of entries its hues happen to land nearest.
 */
function diffusePaletteRgb(
  rgb: Float32Array,
  lum: Float32Array,
  cols: number,
  rows: number,
  quantizer: PaletteQuantizer,
  out: Uint8ClampedArray,
  diffuse: boolean
): void {
  for (let y = 0; y < rows; y++) {
    const leftToRight = (y & 1) === 0;
    const rowOff = y * cols;
    for (let k = 0; k < cols; k++) {
      const x = leftToRight ? k : cols - 1 - k;
      const i = rowOff + x;
      if (lum[i] < 0) {
        out[i * 3] = 0;
        out[i * 3 + 1] = 0;
        out[i * 3 + 2] = 0;
        continue;
      }
      const o = i * 3;
      const wr = rgb[o];
      const wg = rgb[o + 1];
      const wb = rgb[o + 2];
      const near = quantizer.findClosestRgb(
        Math.max(0, Math.min(255, wr)),
        Math.max(0, Math.min(255, wg)),
        Math.max(0, Math.min(255, wb))
      );
      out[o] = near.r;
      out[o + 1] = near.g;
      out[o + 2] = near.b;

      if (!diffuse) continue;
      const er = wr - near.r;
      const eg = wg - near.g;
      const eb = wb - near.b;
      const fwd = leftToRight ? 1 : -1;
      const spread = (dx: number, dy: number, w: number) => {
        const nx = x + dx * fwd;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny >= rows) return;
        const ni = ny * cols + nx;
        if (lum[ni] < 0) return;
        /*
         * Clamp the accumulator, not just the lookup. A palette that does not
         * span the colour space — Game Boy is four greens — can never absorb
         * the red and blue error, so it compounds cell after cell until every
         * pixel is pinned to one extreme and the image collapses to a single
         * colour. Bounding the carried value costs a little accuracy on
         * saturated sources and keeps the diffusion stable on all of them.
         */
        const no = ni * 3;
        rgb[no] = Math.max(0, Math.min(255, rgb[no] + er * w));
        rgb[no + 1] = Math.max(0, Math.min(255, rgb[no + 1] + eg * w));
        rgb[no + 2] = Math.max(0, Math.min(255, rgb[no + 2] + eb * w));
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
}

/**
 * Flattens an ImageAdjustConfig into the pipeline option fields the engine
 * reads. Every renderer routes its adjustments through here so synth, media
 * and model frames are graded identically.
 */
export function toPipelineAdjustments(
  adjust?: ImageAdjustConfig
): Partial<UnifiedPipelineOptions> {
  if (!adjust) return {};
  return {
    invert: adjust.invert,
    contrast: adjust.contrast,
    brightness: adjust.brightness,
    blur: adjust.blur,
    denoise: adjust.denoise,
    noise: adjust.noise,
    sharpenStrength: adjust.sharpenStrength,
    sharpenRadius: adjust.sharpenRadius,
    edgeDetection: adjust.edgeDetection,
    edgeThreshold: adjust.edgeThreshold,
    edgeStrength: adjust.edgeStrength,
    curvePoints: adjust.curvePoints,
    shadows: adjust.shadows,
    highlights: adjust.highlights,
    midtones: adjust.midtones,
    alphaThreshold: adjust.alphaThreshold,
    tonalMapping: adjust.tonalMapping,
    highlightColor: adjust.highlightColor,
    midtoneColor: adjust.midtoneColor,
    shadowColor: adjust.shadowColor,
    colorLevels: adjust.colorLevels,
  };
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
  /**
   * Distribution of the luminance entering the levels stage, 256 bins.
   *
   * Live module buffer, not a copy -- the same contract as `luminance`. Read
   * it before the next frame, or copy it if you need to hold on to it.
   */
  histogram: Uint32Array;
  /** Opaque cells counted into `histogram`; the denominator for a percentile. */
  histogramOpaque: number;
}

// ---------------------------------------------------------------------------
// Zero-Allocation Global Scratch Buffers (resized only on resolution change)
// ---------------------------------------------------------------------------
let cachedCols = 0;
let cachedRows = 0;

let lumBuffer = new Float32Array(0);
let blurBuffer = new Float32Array(0);
let tempBlurBuffer = new Float32Array(0);
let blendBlurBuffer = new Float32Array(0);
let edgeBuffer = new Float32Array(0);
// Luminance as it came off the source, before any filter or grading. Colour
// modes that sample the source RGB use it to recover how much the pipeline
// darkened or lifted each cell.
let srcLumBuffer = new Float32Array(0);
// Working buffer for palette-space error diffusion; holds 1 tone or 3 RGB
// channels per cell depending on which branch is running.
let paletteWorkBuffer = new Float32Array(0);
let paletteIndexBuffer = new Int32Array(0);
let colorsBuffer = new Uint8ClampedArray(0);
let cachedLines: string[] = [];
let lineBuffer: string[] = [];

/**
 * Distribution of the luminance entering the levels stage, 256 bins. Fixed
 * size, so unlike the per-cell buffers it never reallocates.
 *
 * Sampled after the spatial filters and after the tone curve, immediately
 * before levels is applied. That position is what makes AUTO LEVELS
 * idempotent: nothing in step 3 feeds back into step 2 or into the curve, so
 * the reading does not move when the levels it produced are applied. Sampling
 * the post-grade luminance instead would walk the image toward pure black and
 * white on every press.
 */
const histogramBuffer = new Uint32Array(256);
let histogramOpaque = 0;
/** Returned by the degenerate-size early exits, so consumers never see undefined. */
export const EMPTY_HISTOGRAM = new Uint32Array(256);

/**
 * The nothing-to-render result: no grid, no source, no WebGL context.
 *
 * Shared because every source has a degenerate early exit of its own and they
 * were four hand-copied object literals. Adding a field to
 * ProcessedRasterResult broke all of them at once, which is the cheap version
 * of this lesson.
 */
export function emptyRasterResult(rasterMode: RasterOutputMode = 'ascii'): ProcessedRasterResult {
  return {
    text: '',
    colors: null,
    luminance: new Float32Array(0),
    cols: 0,
    rows: 0,
    rasterMode,
    bgColor: '#0a0a0a',
    isColored: false,
    histogram: EMPTY_HISTOGRAM,
    histogramOpaque: 0,
  };
}

// Palette quantizer cache
let cachedPaletteId = '';
let activeQuantizer: PaletteQuantizer | null = null;
let cachedPaletteLum: number[] = [];
let cachedPaletteLumId = '';
let cachedPaletteIsMonochrome = false;

/**
 * Whether a palette carries a hue range, or is one hue at several lightnesses
 * (Game Boy's greens, CRT amber, Nord's blues, bronze).
 *
 * A single-hue palette cannot represent hue at all, so matching a colour
 * source against it in full colour space scores every pixel on how near its
 * hue is to the one hue available — which is noise, not information. Such a
 * palette has to be driven as a tone ramp whatever the source looks like.
 *
 * Measured as the chroma-weighted circular mean resultant length of the hue
 * angles: 1.0 is a single hue, 0 is hues cancelling out around the wheel.
 * Neutral entries are skipped because their hue angle is meaningless. An
 * earlier version measured spread in the a/b plane directly, which confuses
 * chroma variation with hue variation and mislabelled Game Boy's dark-green to
 * yellow-green ramp as chromatic. Real palettes separate cleanly under this
 * metric: every single-hue ramp scores above 0.95, and the nearest two-hue
 * palette (Riso pink + cornflower) scores 0.86.
 */
export function paletteIsMonochrome(quantizer: PaletteQuantizer): boolean {
  let sumX = 0;
  let sumY = 0;
  let sumChroma = 0;
  for (const lab of quantizer.labColors) {
    const chroma = Math.hypot(lab.a, lab.b);
    if (chroma < 6) continue;
    const hue = Math.atan2(lab.b, lab.a);
    sumX += Math.cos(hue) * chroma;
    sumY += Math.sin(hue) * chroma;
    sumChroma += chroma;
  }
  // An all-neutral palette is a pure grey ramp.
  if (sumChroma === 0) return true;
  return Math.hypot(sumX, sumY) / sumChroma >= 0.93;
}

function ensureBufferCapacity(totalCells: number, cols: number, rows: number) {
  if (lumBuffer.length !== totalCells) {
    lumBuffer = new Float32Array(totalCells);
    blurBuffer = new Float32Array(totalCells);
    tempBlurBuffer = new Float32Array(totalCells);
    blendBlurBuffer = new Float32Array(totalCells);
    edgeBuffer = new Float32Array(totalCells);
    srcLumBuffer = new Float32Array(totalCells);
    paletteWorkBuffer = new Float32Array(totalCells * 3);
    paletteIndexBuffer = new Int32Array(totalCells);
    colorsBuffer = new Uint8ClampedArray(totalCells * 3);
  }
  if (cachedCols !== cols || cachedRows !== rows) {
    cachedCols = cols;
    cachedRows = rows;
    cachedLines = new Array(rows);
    lineBuffer = new Array(cols);
  }
}

/**
 * Hex -> RGB, falling back per-channel only when the channel is genuinely
 * unparseable.
 *
 * The guard has to be an isNaN test, not `|| fallback`: parseInt('00', 16) is
 * 0, which is falsy, so `||` substituted the fallback channel for every zero
 * byte. #00ff66 came out as (255, 255, 102) -- a green tint rendered yellow.
 */
export function parseHexRgb(hex?: string, fallback = { r: 255, g: 255, b: 255 }): { r: number; g: number; b: number } {
  if (!hex) return fallback;
  const c = hex.replace('#', '').trim();

  const channel = (raw: string, fb: number): number => {
    const parsed = parseInt(raw, 16);
    if (Number.isNaN(parsed)) return fb;
    return Math.max(0, Math.min(255, parsed));
  };

  if (c.length === 3) {
    return {
      r: channel(c[0] + c[0], fallback.r),
      g: channel(c[1] + c[1], fallback.g),
      b: channel(c[2] + c[2], fallback.b),
    };
  }
  if (c.length === 6) {
    return {
      r: channel(c.substring(0, 2), fallback.r),
      g: channel(c.substring(2, 4), fallback.g),
      b: channel(c.substring(4, 6), fallback.b),
    };
  }
  return fallback;
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
// Fast Box Blur (Separable 1D, Alpha/Boundary-Aware)
// ---------------------------------------------------------------------------

/** Widest box kernel the separable passes will build. */
const MAX_BLUR_RADIUS = 10;

/** One separable box blur at a whole-cell radius. */
function applyIntegerBoxBlur(
  src: Float32Array,
  dest: Float32Array,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(Math.max(1, Math.floor(radius)), MAX_BLUR_RADIUS);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      const minX = Math.max(0, x - r);
      const maxX = Math.min(width - 1, x + r);
      for (let k = minX; k <= maxX; k++) {
        const val = src[rowOffset + k];
        if (val >= 0) {
          sum += val;
          count++;
        }
      }
      tempBlurBuffer[rowOffset + x] = count > 0 ? sum / count : -1;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let count = 0;
      const minY = Math.max(0, y - r);
      const maxY = Math.min(height - 1, y + r);
      for (let k = minY; k <= maxY; k++) {
        const val = tempBlurBuffer[k * width + x];
        if (val >= 0) {
          sum += val;
          count++;
        }
      }
      dest[y * width + x] = count > 0 ? sum / count : -1;
    }
  }
}

/**
 * Box blur at a fractional radius.
 *
 * A box kernel only exists at whole radii, so anything in between is a linear
 * crossfade between the two neighbouring kernels -- and below radius 1, between
 * the source and the narrowest kernel. Without this the smallest non-zero blur
 * or denoise setting jumped straight to a full one-cell average, which is why
 * the bottom of those ranges felt like an on/off switch rather than a dial.
 */
function applyFastBoxBlur(
  src: Float32Array,
  dest: Float32Array,
  width: number,
  height: number,
  radius: number
) {
  if (radius <= 0) {
    dest.set(src);
    return;
  }

  const clamped = Math.min(radius, MAX_BLUR_RADIUS);
  const lower = Math.floor(clamped);
  const frac = clamped - lower;

  if (frac <= 1e-4) {
    applyIntegerBoxBlur(src, dest, width, height, lower);
    return;
  }

  // Wider kernel into dest, narrower into the blend scratch, then mix in place.
  applyIntegerBoxBlur(src, dest, width, height, lower + 1);
  const narrow = lower === 0 ? src : blendBlurBuffer;
  if (lower > 0) {
    applyIntegerBoxBlur(src, blendBlurBuffer, width, height, lower);
  }

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const a = narrow[i];
    const b = dest[i];
    // -1 marks a cell masked out by alpha; it must not be averaged into.
    dest[i] = a < 0 || b < 0 ? -1 : a + (b - a) * frac;
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
    return emptyRasterResult(options.rasterMode || 'ascii');
  }

  ensureBufferCapacity(totalCells, cols, rows);

  const toneCfg = options.toneConfig;
  const colorCfg = options.colorConfig;

  // Resolve background color
  let bgColor = toneCfg?.bgColor || rawFrame.bgColor || '#0a0a0a';
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

  srcLumBuffer.set(lumBuffer);

  // -------------------------------------------------------------------------
  // Step 2: Spatial Filters (Blur, Denoise, Sharpen, Sobel Edges)
  // -------------------------------------------------------------------------
  const totalBlur = (options.blur || 0) + (options.denoise || 0);
  // Straight through, unrounded: the kernel now handles fractional radii, and
  // the old max(1, round(..)) meant the first non-zero notch already applied a
  // full one-cell average.
  const blurRadius = totalBlur > 0 ? totalBlur / 2 : 0;
  if (blurRadius > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, blurRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0 && blurBuffer[i] >= 0) lumBuffer[i] = blurBuffer[i];
    }
  }

  const sharpenStrength = (options.sharpenStrength || 0) / 100.0;
  const sharpenRadius = Math.max(0.1, Math.min(MAX_BLUR_RADIUS, options.sharpenRadius || 2));
  if (sharpenStrength > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, sharpenRadius);
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      const edgeY = Math.min(y, rows - 1 - y);

      for (let x = 0; x < cols; x++) {
        const i = rowOffset + x;
        const orig = lumBuffer[i];
        if (orig < 0) continue;

        const blurred = blurBuffer[i];
        if (blurred < 0) continue;

        const edgeX = Math.min(x, cols - 1 - x);
        const minEdge = Math.min(edgeX, edgeY);

        // Check for boundary next to transparent alpha background
        let isAlphaBoundary = false;
        if (x > 0 && lumBuffer[i - 1] < 0) isAlphaBoundary = true;
        else if (x < cols - 1 && lumBuffer[i + 1] < 0) isAlphaBoundary = true;
        else if (y > 0 && lumBuffer[i - cols] < 0) isAlphaBoundary = true;
        else if (y < rows - 1 && lumBuffer[i + cols] < 0) isAlphaBoundary = true;

        if (isAlphaBoundary || minEdge === 0) {
          // Do not sharpen outermost perimeter or transparent silhouette edges
          continue;
        }

        // Taper sharpening delta near edges to prevent boundary ringing
        const edgeFade = Math.min(1.0, minEdge / sharpenRadius);
        const unsharp = orig + sharpenStrength * edgeFade * (orig - blurred);
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

  /*
   * Histogram tap. Runs its own short pass rather than folding into the loop
   * below, because it has to read the value *after* the curve and *before*
   * levels, and those two are adjacent steps inside that loop.
   */
  histogramBuffer.fill(0);
  histogramOpaque = 0;
  for (let i = 0; i < totalCells; i++) {
    const raw = lumBuffer[i];
    if (raw < 0) continue; // transparent
    let v = raw;
    if (curveLut) {
      v = curveLut[Math.max(0, Math.min(255, Math.round(v * 255)))];
    }
    let bin = Math.round(v * 255);
    if (bin < 0) bin = 0;
    else if (bin > 255) bin = 255;
    histogramBuffer[bin]++;
    histogramOpaque++;
  }

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
  // Step 3.5: Dithering & Error Diffusion Execution
  // -------------------------------------------------------------------------
  const densityLength = density.length;

  const paletteMode = colorCfg?.paletteMode || (colorCfg?.mode === 'content' ? 'content' : 'phosphor');
  const activePalette =
    paletteMode === 'indexed'
      ? BUILTIN_PALETTES.find((p) => p.id === (colorCfg?.activePaletteId || 'gameboy-classic'))
      : undefined;

  /*
   * Quantization depth, i.e. how many tones the dither pass is allowed to
   * resolve. Dithering is only visible when the depth is actually reduced, so
   * this must track the real output depth rather than any one proxy for it:
   *
   *   - ASCII modes: one level per glyph, so the charset length.
   *   - Indexed palette: the palette's colour count.
   *   - Duotone / tritone: two or three stops.
   *   - Anything else in pixel mode: continuous, so full 8-bit.
   *
   * colorLevels overrides that. The output depth is only ever the DEFAULT,
   * never a constraint: asking for four tones out of a sixteen-colour palette,
   * or four glyphs out of a ten-character ramp, is a real and reachable look.
   * Anything above the natural depth simply saturates.
   */
  const tonal = options.tonalMapping || '1color';
  const isPixelOut = (options.rasterMode || 'ascii') === 'pixel';

  let autoLevels: number;
  if (!isPixelOut) {
    autoLevels = densityLength;
  } else if (activePalette) {
    autoLevels = activePalette.colors.length;
  } else if (tonal === '2color') {
    autoLevels = 2;
  } else if (tonal === '3color') {
    autoLevels = 3;
  } else {
    autoLevels = 256;
  }

  const explicitLevels =
    options.colorLevels && options.colorLevels >= 2
      ? Math.min(256, Math.round(options.colorLevels))
      : 0;
  const ditherLevels = Math.max(2, explicitLevels || autoLevels);

  const ditherAlgo = options.ditherAlgorithm || 'floyd-steinberg';

  /*
   * A palette's tones are not evenly spaced. Game Boy Classic sits at 0.15 /
   * 0.30 / 0.57 / 0.62, so quantizing the tone to four even steps and then
   * indexing the ramp stretches the shadows and collapses the highlights —
   * the top two colours are 0.06 apart but get a third of the range each.
   *
   * When the palette is doing the quantizing we therefore leave the tone at
   * full precision here and diffuse the error against the palette's own
   * colours in step 4 instead. Only the error-diffusion family can carry error
   * that way; ordered and stochastic masks still quantize in tone space, and
   * an explicit colorLevels means the user asked for even steps on purpose.
   */
  const ditherFamily = DITHER_ALGORITHMS.find((a) => a.id === ditherAlgo)?.family;
  const paletteOwnsQuantization =
    isPixelOut && !!activePalette && !explicitLevels && ditherFamily === 'error-diffusion';

  if (!paletteOwnsQuantization && ditherAlgo && ditherAlgo !== 'none') {
    applyDitherAlgorithm(lumBuffer, lumBuffer, cols, rows, ditherAlgo, ditherLevels);
  } else if (explicitLevels && !paletteOwnsQuantization) {
    // 'None' means no error distribution, not 'ignore the requested depth' —
    // posterize so the levels control still reads as a depth reduction and the
    // algorithm dropdown reads as how that reduction is distributed.
    const step = 1 / (ditherLevels - 1);
    for (let i = 0; i < totalCells; i++) {
      const v = lumBuffer[i];
      if (v < 0) continue;
      lumBuffer[i] = Math.min(1, Math.max(0, Math.round(v / step) * step));
    }
  }

  /*
   * Error diffusion can undershoot past 0 or overshoot past 1 on the cells it
   * pays the error back on. Negative luminance is the transparency sentinel
   * downstream, so an undershoot would punch a hole through an opaque cell —
   * a handful of stray transparent pixels scattered through any dithered
   * image. Clamp opaque cells back into range and restore the sentinel from
   * the pre-filter snapshot, which is the only authority on what was cut out.
   */
  for (let i = 0; i < totalCells; i++) {
    if (srcLumBuffer[i] < 0) {
      lumBuffer[i] = -1;
    } else {
      const v = lumBuffer[i];
      if (v < 0) lumBuffer[i] = 0;
      else if (v > 1) lumBuffer[i] = 1;
    }
  }

  /*
   * Ratio between the graded luminance and the source luminance for one cell.
   *
   * The colour modes that sample source RGB — 'content', and the chromatic
   * branch of 'indexed' — used to read straight from the untouched pixel data,
   * so every filter, the tone curve, levels, brightness/contrast and the
   * dither pass were all invisible there: they only ever moved lumBuffer.
   * Scaling the sampled RGB by this ratio puts those cells back under the same
   * grading as every other mode while keeping their hue.
   */
  const gradeRatio = (i: number): number => {
    const graded = lumBuffer[i];
    if (graded < 0) return 1;
    const src = srcLumBuffer[i];
    if (src <= 0.004) return graded <= 0.004 ? 1 : 1 + graded * 4;
    return graded / src;
  };

  // -------------------------------------------------------------------------
  // Step 4: Color Extraction & Retro Palette Quantization
  // -------------------------------------------------------------------------
  let colorsOut: Uint8ClampedArray | null = null;

  if (paletteMode === 'content') {
    const sat = (colorCfg?.saturation ?? 200) / 100.0;
    for (let i = 0; i < totalCells; i++) {
      const p = i * 4;
      const k = gradeRatio(i);
      let r = data[p] * k;
      let g = data[p + 1] * k;
      let b = data[p + 2] * k;

      if (sat !== 1.0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * sat;
        g = gray + (g - gray) * sat;
        b = gray + (b - gray) * sat;
      }
      r = Math.max(0, Math.min(255, Math.round(r)));
      g = Math.max(0, Math.min(255, Math.round(g)));
      b = Math.max(0, Math.min(255, Math.round(b)));

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
      cachedPaletteIsMonochrome = paletteIsMonochrome(activeQuantizer);
    }

    const sortedColors = activeQuantizer.sortedRgbColors;
    const numColors = sortedColors.length;
    /*
     * Hue matching needs per-cell RGB to match against. A luminance-only source
     * (3D shading passes, synth fields) has none, so the ramp is the only thing
     * available there regardless of what was asked for.
     */
    const canHueMatch = data.length === totalCells * 4 && !hasRawLum;
    const matchMode = colorCfg?.paletteMatch || 'auto';

    // Detect whether source has true chromatic variation (color photos, normal vectors)
    // vs luminance-driven / grayscale sources (3D shaded models, synth fields, monochrome media)
    let isChromatic = false;
    if (canHueMatch) {
      let sampleCount = 0;
      let chromaSum = 0;
      const step = Math.max(4, Math.floor(totalCells / 40) * 4);
      for (let p = 0; p < data.length; p += step) {
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const diff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        chromaSum += diff;
        sampleCount++;
      }
      if (sampleCount > 0 && chromaSum / sampleCount > 10) {
        isChromatic = true;
      }
    }

    // An explicit choice overrides the sampling. 'hue' on a greyscale photo is
    // a legitimate request -- it collapses onto the palette's neutrals, which
    // is a different and duller look than the ramp, and that is the point.
    if (matchMode === 'hue') {
      isChromatic = canHueMatch;
    } else if (matchMode === 'ramp') {
      isChromatic = false;
    }

    // A single-hue palette has no colour to match against; tone is all it can
    // carry, so send colour sources down the ramp too.
    if (cachedPaletteIsMonochrome) {
      isChromatic = false;
    }

    if (isChromatic && paletteOwnsQuantization) {
      // Chromatic source, palette-space diffusion: carry the colour error so a
      // photo spreads across the whole palette instead of collapsing onto the
      // few entries its hues sit nearest.
      for (let i = 0; i < totalCells; i++) {
        const p4 = i * 4;
        const k = gradeRatio(i);
        paletteWorkBuffer[i * 3] = data[p4] * k;
        paletteWorkBuffer[i * 3 + 1] = data[p4 + 1] * k;
        paletteWorkBuffer[i * 3 + 2] = data[p4 + 2] * k;
      }
      diffusePaletteRgb(paletteWorkBuffer, lumBuffer, cols, rows, activeQuantizer, colorsBuffer, ditherAlgo !== 'none');
    } else if (!isChromatic && paletteOwnsQuantization) {
      // Achromatic source: diffuse against where the palette's tones actually
      // sit rather than against evenly spaced steps.
      if (cachedPaletteLumId !== palId) {
        cachedPaletteLum = sortedColors.map((c) => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255);
        cachedPaletteLumId = palId;
      }
      diffusePaletteTone(
        lumBuffer, cols, rows, cachedPaletteLum, paletteWorkBuffer, paletteIndexBuffer,
        ditherAlgo !== 'none'
      );
      for (let i = 0; i < totalCells; i++) {
        const idx = paletteIndexBuffer[i];
        if (idx < 0) {
          colorsBuffer[i * 3] = 0;
          colorsBuffer[i * 3 + 1] = 0;
          colorsBuffer[i * 3 + 2] = 0;
          continue;
        }
        const col = sortedColors[idx];
        colorsBuffer[i * 3] = col.r;
        colorsBuffer[i * 3 + 1] = col.g;
        colorsBuffer[i * 3 + 2] = col.b;
      }
    } else if (isChromatic) {
      // Chromatic media / normals: Quantize using 3D CIELAB distance matching
      for (let i = 0; i < totalCells; i++) {
        if (lumBuffer[i] < 0) {
          colorsBuffer[i * 3] = 0;
          colorsBuffer[i * 3 + 1] = 0;
          colorsBuffer[i * 3 + 2] = 0;
          continue;
        }
        const p = i * 4;
        const k = gradeRatio(i);
        const nearest = activeQuantizer.findClosestRgb(
          Math.max(0, Math.min(255, data[p] * k)),
          Math.max(0, Math.min(255, data[p + 1] * k)),
          Math.max(0, Math.min(255, data[p + 2] * k))
        );
        colorsBuffer[i * 3] = nearest.r;
        colorsBuffer[i * 3 + 1] = nearest.g;
        colorsBuffer[i * 3 + 2] = nearest.b;
      }
    } else {
      // 3D Models (shaded/depth/wireframe), Synth, Grayscale: Map continuous luminance along sorted tone ramp
      for (let i = 0; i < totalCells; i++) {
        const lum = lumBuffer[i];
        if (lum < 0) {
          colorsBuffer[i * 3] = 0;
          colorsBuffer[i * 3 + 1] = 0;
          colorsBuffer[i * 3 + 2] = 0;
          continue;
        }
        const val = Math.max(0, Math.min(1, lum));
        const cIdx = Math.min(numColors - 1, Math.floor(val * numColors));
        const col = sortedColors[cIdx];
        colorsBuffer[i * 3] = col.r;
        colorsBuffer[i * 3 + 1] = col.g;
        colorsBuffer[i * 3 + 2] = col.b;
      }
    }
    colorsOut = colorsBuffer;
  } else if (options.tonalMapping && options.tonalMapping !== '1color') {
    // Multi-tone mapping. The fixed hardware looks that used to live here
    // (GameBoy, Cyberpunk, Amber) are built-in palettes now, so this branch is
    // only the user-defined duotone and tritone ramps.
    const tMode = options.tonalMapping;
    const high = parseHexRgb(options.highlightColor || '#FFFFFF', { r: 255, g: 255, b: 255 });
    const mid = parseHexRgb(options.midtoneColor || '#3B82F6', { r: 59, g: 130, b: 246 });
    const low = parseHexRgb(options.shadowColor || '#000000', { r: 0, g: 0, b: 0 });

    if (tMode === '2color') {
      for (let i = 0; i < totalCells; i++) {
        const lum = lumBuffer[i];
        if (lum < 0) {
          colorsBuffer[i * 3] = low.r;
          colorsBuffer[i * 3 + 1] = low.g;
          colorsBuffer[i * 3 + 2] = low.b;
          continue;
        }
        const col = lum > 0.5 ? high : low;
        colorsBuffer[i * 3] = col.r;
        colorsBuffer[i * 3 + 1] = col.g;
        colorsBuffer[i * 3 + 2] = col.b;
      }
    } else {
      for (let i = 0; i < totalCells; i++) {
        const lum = lumBuffer[i];
        if (lum < 0) {
          colorsBuffer[i * 3] = low.r;
          colorsBuffer[i * 3 + 1] = low.g;
          colorsBuffer[i * 3 + 2] = low.b;
          continue;
        }
        let col = low;
        if (lum > 0.66) col = high;
        else if (lum > 0.33) col = mid;
        colorsBuffer[i * 3] = col.r;
        colorsBuffer[i * 3 + 1] = col.g;
        colorsBuffer[i * 3 + 2] = col.b;
      }
    }
    colorsOut = colorsBuffer;
  }

  // -------------------------------------------------------------------------
  // Step 5: Character Density Ramp Mapping
  // -------------------------------------------------------------------------
  const effectiveRasterMode = options.rasterMode || 'ascii';
  const isPixelMode = effectiveRasterMode === 'pixel';

  if (isPixelMode && !colorsOut) {
    /*
     * Monochrome in pixel output. There is no <pre> to tint with CSS the way
     * ASCII output does, so the tint has to be baked into the colour buffer
     * here -- otherwise the tint control is wired to nothing in pixel mode.
     * Scaling the tint by luminance keeps it a single-hue ramp.
     */
    const tint = parseHexRgb(options.monoTint || DEFAULT_PHOSPHOR_TINT, { r: 255, g: 255, b: 255 });
    for (let i = 0; i < totalCells; i++) {
      const lum = lumBuffer[i];
      if (lum < 0) {
        colorsBuffer[i * 3] = 0;
        colorsBuffer[i * 3 + 1] = 0;
        colorsBuffer[i * 3 + 2] = 0;
      } else {
        const k = Math.max(0, Math.min(1, lum));
        colorsBuffer[i * 3] = Math.round(tint.r * k);
        colorsBuffer[i * 3 + 1] = Math.round(tint.g * k);
        colorsBuffer[i * 3 + 2] = Math.round(tint.b * k);
      }
    }
    colorsOut = colorsBuffer;
  }

  const overrides = rawFrame.charOverrides;

  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const cellIdx = rowOffset + x;
      const val = lumBuffer[cellIdx];

      if (val < 0) {
        lineBuffer[x] = ' ';
        continue;
      }

      let cellChar = ' ';
      if (isPixelMode) {
        /*
         * Every opaque cell is painted; its tone lives in the colour buffer,
         * not the glyph. Thresholding here would drop dark pixels entirely and
         * leave holes where the shadows should be (a space means "transparent"
         * to the viewport, and val < 0 above is the only transparent case).
         */
        cellChar = '█';
      } else {
        let charIndex = Math.floor(val * densityLength);
        if (charIndex < 0) charIndex = 0;
        else if (charIndex >= densityLength) charIndex = densityLength - 1;
        cellChar = density[charIndex] || ' ';
      }

      if (overrides && overrides[cellIdx]) {
        cellChar = overrides[cellIdx]!;
      }
      lineBuffer[x] = cellChar;
    }
    cachedLines[y] = lineBuffer.join('');
  }

  return {
    text: cachedLines.join('\n'),
    colors: colorsOut,
    luminance: lumBuffer,
    cols,
    rows,
    rasterMode: effectiveRasterMode,
    bgColor,
    isColored: Boolean(colorsOut && colorsOut.length > 0),
    histogram: histogramBuffer,
    histogramOpaque,
  };
}
