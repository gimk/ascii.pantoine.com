/**
 * Dither Studio — Unified 2D Raster Engine (`rasterEngine.ts`)
 *
 * Consolidates all image post-processing, tone curves, convolution filters,
 * 3D color-space error diffusion, 40+ dithering algorithms, and output modality
 * routing into a single, high-performance, zero-allocation pipeline.
 */

import {
  RasterOutputMode,
  DitherAlgorithm,
  DitherParams,
  ToneMappingConfig,
  MediaColorConfig,
  TonalMappingType,
  ImageAdjustConfig,
  VectorConfig,
  VectorFrame,
  VECTOR_CONFIG_DEFAULTS,
} from '../types/ascii';
import {
  BUILTIN_PALETTES,
  PaletteQuantizer,
  DEFAULT_PHOSPHOR_TINT,
} from './palettes';
import { applyDitherAlgorithm, DITHER_ALGORITHMS } from './ditherAlgorithms';
import { traceVectorField, VectorColorResolver } from './vectorEngine';

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
  ditherParams?: DitherParams;
  /** Beam deflection. Read only when `rasterMode === 'vector'`. */
  vectorConfig?: VectorConfig;
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
  customToneColors?: string[];
  toneStopWeights?: number[];
  colorLevels?: number;
  /** Monochrome tint, baked into pixel output where CSS cannot reach. */
  monoTint?: string;
}

/**
 * A ramp's *natural* band boundaries — the share of the luminance range each
 * stop already gets with no weighting at all.
 *
 * These are not evenly spaced, and that surprises people. Step 3.5 quantizes to
 * N levels with round-to-nearest, so level i claims everything within half a
 * step of it: the two end levels get half-width bands and the interior ones get
 * full-width. A four-stop ramp is really 1/6, 1/3, 1/3, 1/6 — the shadow and
 * highlight stops cover half as much of the image as the middle two.
 *
 * Everything below is expressed relative to these, so a neutral weighting
 * reproduces exactly what the ramp did before weights existed.
 */
function naturalBandBoundaries(numStops: number): Float64Array {
  const out = new Float64Array(numStops);
  const step = 1 / (numStops - 1);
  for (let i = 0; i < numStops; i++) {
    out[i] = Math.min(1, (i + 0.5) * step);
  }
  out[numStops - 1] = 1;
  return out;
}

/**
 * A zero-width band is not merely invisible: it makes the warp non-invertible
 * and hands the dither a flat segment it will quantize into a hard edge.
 * Dragging a slider to zero means "as little as possible", not "break the ramp".
 */
const MIN_BAND = 0.01;

/** Slider position that means "leave this band alone". */
export const TONE_WEIGHT_NEUTRAL = 50;

/**
 * Slider position (0..100, 50 neutral) to a multiplier on the band's natural
 * width: `(v / 50) ^ 2.5`.
 *
 * A linear mapping felt inert, and measurably was. Weights are normalised
 * against each other, which eats most of the upward travel: raising one stop of
 * four from 50 to 100 lifts its share of the *total* only from 25% to 40%, so
 * half the slider bought a band 16.7% -> 28.4% of the image. Downward worked
 * fine — normalisation helps you there — leaving a control that was both weak
 * and lopsided.
 *
 * A power curve fixes both. It is smooth through neutral, where a two-piece
 * curve put a visible kink (the same drag was worth +7 below 50 and +30 above),
 * it still reaches exactly 0 at the bottom so a band can be suppressed, and at
 * 2.5 a single slider spans roughly 1% to 53% of a four-stop ramp in even
 * steps. Raising the exponent buys more reach at the cost of a lazier low end.
 *
 * Values outside 0..100 are clamped, so a legacy uniform array like [1, 1, 1]
 * still reads as neutral — any set of equal weights is, whatever the scale.
 */
const TONE_WEIGHT_EXPONENT = 2.5;

function toneWeightGain(value: number): number {
  const v = Math.max(0, Math.min(100, value));
  return Math.pow(v / TONE_WEIGHT_NEUTRAL, TONE_WEIGHT_EXPONENT);
}

/**
 * The share of the tonal range each stop ends up with, normalised to sum to 1.
 *
 * Exported so the UI can draw the ramp at its true proportions rather than as
 * equal blocks -- the whole point of the weights is that the blocks are not
 * equal, and a preview that hides that is worse than none.
 */
export function toneBandShares(weights: number[] | undefined, numStops: number): number[] {
  const natural = naturalBandBoundaries(numStops);
  const naturalWidths: number[] = [];
  for (let i = 0; i < numStops; i++) {
    naturalWidths.push(natural[i] - (i === 0 ? 0 : natural[i - 1]));
  }

  if (!weights || weights.length !== numStops) return naturalWidths;

  const gains = weights.map((w) => (Number.isFinite(w) ? toneWeightGain(w) : 1));
  const total = gains.reduce((a, b) => a + b, 0);
  if (total <= 0) return naturalWidths;

  const desired = naturalWidths.map((nw, i) =>
    Math.max(MIN_BAND, nw * (gains[i] / total) * numStops)
  );
  const desiredTotal = desired.reduce((a, b) => a + b, 0);
  return desired.map((d) => d / desiredTotal);
}

/**
 * The colour stops actually driving a tonal render.
 *
 * `customToneColors` is the modern representation and wins when present, but it
 * is optional on every config type, so a config carrying only the legacy
 * shadow/midtone/highlight triple has to resolve to the same thing. This used
 * to be inlined at each of the three places the ramp is read — quantize depth,
 * the band-width warp, and the colouring pass — and only the third one had the
 * legacy fallback. A config with `tonalMapping: 'ntone'` and no
 * `customToneColors` therefore quantized to full 8-bit (no visible dither) and
 * then coloured through three hard bands, which reads as a bare threshold.
 * All three now go through here so the depth and the ramp can never disagree.
 */
export function resolveRampStops(options: {
  tonalMapping?: TonalMappingType;
  customToneColors?: string[];
  shadowColor?: string;
  midtoneColor?: string;
  highlightColor?: string;
}): string[] {
  if (options.customToneColors && options.customToneColors.length >= 2) {
    return options.customToneColors;
  }
  if (options.tonalMapping === '2color') {
    return [options.shadowColor || '#000000', options.highlightColor || '#FFFFFF'];
  }
  return [
    options.shadowColor || '#000000',
    options.midtoneColor || '#3B82F6',
    options.highlightColor || '#FFFFFF',
  ];
}

/**
 * Build a 256-entry LUT that redistributes the luminance range across the ramp
 * stops according to per-stop weights.
 *
 * Returns null when the weights are absent, the wrong length, or neutral — the
 * caller then skips the pass entirely and the ramp behaves exactly as it always
 * has. Neutral is all-weights-equal at any value, so [50,50,50] and [1,1,1] are
 * both no-ops.
 *
 * **Why a warp rather than moving the bucket boundaries.** The colour branch
 * buckets with `floor(lum * N)`, and step 3.5 quantizes to N even levels right
 * before it. The two are deliberately aligned — that alignment is why an
 * N-stop ramp reproduces exactly N tones. Moving the *bucket* boundaries breaks
 * it: quantized levels collide into some bands and skip others, leaving dead
 * colours (the same failure §2.4 describes for palettes, in reverse). So the
 * boundaries stay put and the tone is warped to meet them, before the dither
 * runs, so the dither quantizes already-warped tone and stays consistent.
 *
 * The warp is piecewise-linear and strictly monotone: band i's requested slice
 * of the input range is stretched onto the slice the quantizer actually gives
 * stop i. Widening a band genuinely dedicates more of the image to that colour.
 *
 * Note the proportionality assumes `ditherLevels === numStops`, which is the
 * auto case. An explicit Quantize Levels detunes it — the warp stays monotone
 * and the sliders still read as more/less, but the shares stop tracking the
 * numbers exactly.
 */
export function buildToneBandLut(
  weights: number[] | undefined,
  numStops: number
): Float32Array | null {
  if (!weights || weights.length !== numStops || numStops < 2) return null;

  /* Equality is tested on the raw slider values: any uniform set is neutral. */
  if (weights.every((w) => w === weights[0])) return null;

  const natural = naturalBandBoundaries(numStops);

  /*
   * Scaling the natural widths rather than assigning absolute shares is what
   * keeps a neutral weighting an exact identity — otherwise nudging one slider
   * by a single step would jump the whole ramp from its legacy distribution to
   * a flat one.
   */
  const shares = toneBandShares(weights, numStops);

  const source = new Float64Array(numStops);
  let running = 0;
  for (let i = 0; i < numStops; i++) {
    running += shares[i];
    source[i] = running;
  }
  source[numStops - 1] = 1;

  const lut = new Float32Array(256);
  for (let s = 0; s < 256; s++) {
    const v = s / 255;
    let band = 0;
    while (band < numStops - 1 && v >= source[band]) band++;
    const srcLo = band === 0 ? 0 : source[band - 1];
    const srcHi = source[band];
    const dstLo = band === 0 ? 0 : natural[band - 1];
    const dstHi = natural[band];
    const span = srcHi - srcLo;
    const t = span > 1e-9 ? (v - srcLo) / span : 0;
    lut[s] = Math.min(1, Math.max(0, dstLo + Math.min(1, Math.max(0, t)) * (dstHi - dstLo)));
  }
  return lut;
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
    customToneColors: adjust.customToneColors,
    toneStopWeights: adjust.toneStopWeights,
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
   * Beam geometry, in vector mode only. Null in every cell mode, and `text` is
   * empty whenever this is set — the two are mutually exclusive representations
   * of the same frame, and a painter must branch on one or the other rather
   * than assuming both are populated.
   */
  vector?: VectorFrame | null;
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
/*
 * Guided-filter scratch, two buffers for a five-term filter. Each is reused
 * partway through: `guideMeanBuffer` carries mean(I), then b, then mean(b);
 * `guideCoeffBuffer` carries mean(I*I), then a, then mean(a). Sequencing them
 * that way is what keeps an edge-aware denoise from costing five full frames.
 */
let guideMeanBuffer = new Float32Array(0);
let guideCoeffBuffer = new Float32Array(0);
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
    vector: null,
    histogram: EMPTY_HISTOGRAM,
    histogramOpaque: 0,
  };
}

/** Canvas and SVG both want a colour string; the palette API speaks RGB. */
function rgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
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
    guideMeanBuffer = new Float32Array(totalCells);
    guideCoeffBuffer = new Float32Array(totalCells);
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

/**
 * Edge-preserving denoise: a self-guided filter (He, Sun & Tang).
 *
 * Denoise used to be added straight onto the blur radius and run through the
 * same box kernel, which is to say it was not a denoiser at all — it removed
 * grain and the edges holding the picture together in equal measure, and on an
 * ASCII grid, where an edge is often one cell wide, the edges went first.
 *
 * The guided filter fits a local linear model `out = a·I + b` over a window,
 * with `a = var / (var + eps)`. That single ratio is the whole mechanism: where
 * the local variance is far below `eps` the window is flat, `a` falls to 0 and
 * the output is the local mean; where variance is far above it there is real
 * structure, `a` rises to 1 and the input passes through untouched. Blending
 * `a` and `b` spatially before applying them is what keeps the transition
 * between those two regimes from showing as a seam.
 *
 * Chosen over a bilateral filter because it costs four box blurs *whatever the
 * radius is*, where a bilateral is quadratic in it. The separable kernel here
 * is already alpha-aware, so transparency is handled once rather than in every
 * tap of a range weight.
 *
 * `eps` is in squared luminance and reads directly as a contrast threshold:
 * detail below `sqrt(eps)` local standard deviation is treated as noise.
 */
function applyGuidedDenoise(
  buffer: Float32Array,
  width: number,
  height: number,
  radius: number,
  eps: number
) {
  const total = width * height;

  /*
   * mean(I*I) into the coefficient buffer. The sentinel is squared away
   * deliberately — carrying -1 through would let a transparent cell read as a
   * bright one, and the blur only skips values that are still negative.
   */
  for (let i = 0; i < total; i++) {
    const v = buffer[i];
    guideCoeffBuffer[i] = v < 0 ? -1 : v * v;
  }
  /*
   * In-place is safe here and below: the separable kernel drains `src` into
   * `tempBlurBuffer` on the horizontal pass and only then writes `dest`.
   */
  applyIntegerBoxBlur(guideCoeffBuffer, guideCoeffBuffer, width, height, radius);
  applyIntegerBoxBlur(buffer, guideMeanBuffer, width, height, radius);

  for (let i = 0; i < total; i++) {
    const mean = guideMeanBuffer[i];
    if (buffer[i] < 0 || mean < 0) {
      guideCoeffBuffer[i] = -1;
      guideMeanBuffer[i] = -1;
      continue;
    }
    /* Clamped at zero: the subtraction is catastrophic cancellation on a flat
     * window, and a variance of -1e-9 would invert the ratio below. */
    const variance = Math.max(0, guideCoeffBuffer[i] - mean * mean);
    const a = variance / (variance + eps);
    guideCoeffBuffer[i] = a;
    guideMeanBuffer[i] = mean - a * mean;
  }

  applyIntegerBoxBlur(guideCoeffBuffer, guideCoeffBuffer, width, height, radius);
  applyIntegerBoxBlur(guideMeanBuffer, guideMeanBuffer, width, height, radius);

  for (let i = 0; i < total; i++) {
    const v = buffer[i];
    if (v < 0) continue;
    const a = guideCoeffBuffer[i];
    const b = guideMeanBuffer[i];
    if (a < 0 || b < 0) continue;
    buffer[i] = Math.max(0, Math.min(1, a * v + b));
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
  /*
   * Denoise runs first and on its own. It used to be summed onto the blur
   * radius, which made the two controls the same control at different
   * strengths; they are opposites. Denoise is meant to remove what is not in
   * the picture and keep what is, so it gets an edge-aware kernel, while blur
   * stays the plain box average that a creative softening should be.
   *
   * The strength maps to both terms of the filter. Radius grows slowly, from 2
   * cells to 5 across the normal range, because past a few cells the window
   * stops being local and the linear fit stops meaning anything — and because
   * a window needs enough samples for its mean to be worth substituting in.
   *
   * `eps` carries most of the sweep: at `(0.015 · strength)^2` the slider
   * reads as a contrast threshold, so 4 treats anything under ~6% local
   * contrast as grain and 8 anything under ~12%. That is why the low end is
   * subtle rather than inert — it lowers a threshold, it does not shrink a
   * blur.
   *
   * Measured on a step wedge under 20% grain, against the box blur this
   * replaced, matched on how much grain each removes:
   *
   *   21% of the grain gone — denoise keeps 95% of the edge, blur keeps 80%
   *   51% gone            — denoise keeps 82%, blur keeps 58%
   *   79% gone            — denoise keeps 53%, blur keeps 20%
   */
  const denoiseStrength = options.denoise || 0;
  if (denoiseStrength > 0) {
    const denoiseRadius = Math.min(MAX_BLUR_RADIUS, Math.round(1 + denoiseStrength / 2));
    const denoiseEps = (0.015 * denoiseStrength) ** 2;
    applyGuidedDenoise(lumBuffer, cols, rows, denoiseRadius, denoiseEps);
  }

  // Straight through, unrounded: the kernel now handles fractional radii, and
  // the old max(1, round(..)) meant the first non-zero notch already applied a
  // full one-cell average.
  const blurRadius = (options.blur || 0) > 0 ? (options.blur || 0) / 2 : 0;
  if (blurRadius > 0) {
    applyFastBoxBlur(lumBuffer, blurBuffer, cols, rows, blurRadius);
    for (let i = 0; i < totalCells; i++) {
      if (lumBuffer[i] >= 0 && blurBuffer[i] >= 0) lumBuffer[i] = blurBuffer[i];
    }
  }

  const sharpenStrength = (options.sharpenStrength || 0) / 100.0;
  const sharpenRadius = Math.max(0.1, Math.min(MAX_BLUR_RADIUS, options.sharpenRadius || 1));
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

  const inBlack = Math.max(0, Math.min(0.95, (toneCfg?.levelsBlack ?? 0) / 255.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, (toneCfg?.levelsWhite ?? 255) / 255.0));
  const inMid = Math.max(inBlack + 0.005, Math.min(inWhite - 0.005, (toneCfg?.levelsMidtones ?? 128) / 255.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const shadowAdj = (options.shadows || 0) / 100.0;
  const highlightAdj = (options.highlights || 0) / 100.0;
  const midtoneGamma = Math.pow(2.0, -(options.midtones || 0) / 50.0);
  const curveLut = options.curvePoints && options.curvePoints.length >= 2 ? createToneCurveLUT(options.curvePoints) : null;
  const noiseAmp = (options.noise || 0) / 200.0;
  const posterizeBits = toneCfg?.posterizeBits || 0;

  /*
   * Exposure: brightness and contrast, applied *before* the curve and levels.
   *
   * This used to run between levels and the tonal balance, which made the two
   * coarsest controls in the panel silently override the two most precise ones.
   * Levels clips black to exactly 0; contrast then pivots the whole range about
   * 0.5, and brightness adds a flat offset, so a positive brightness turns that
   * clipped black into `brightness` and a negative contrast lifts it to
   * `0.5(1 - factor)`. Levels ran earlier, so nothing could recover it: dragging
   * the black point simply stopped producing black.
   *
   * Upstream is also the conventional place for it — Lightroom and Camera Raw
   * both apply Exposure and Contrast ahead of the tone curve — and it lines the
   * engine up with the sidebar, which reads exposure, curve, levels, balance
   * from top to bottom.
   *
   * A separate pass rather than an extra branch in the two loops below, because
   * *both* have to see it: the histogram tap must keep showing what levels
   * actually receives. It is skipped entirely at neutral.
   */
  if (contrastFactor !== 1.0 || brightnessOffset !== 0) {
    for (let i = 0; i < totalCells; i++) {
      const v = lumBuffer[i];
      if (v < 0) continue; // transparency sentinel
      lumBuffer[i] = Math.max(0, Math.min(1, (v - 0.5) * contrastFactor + 0.5 + brightnessOffset));
    }
  }

  /*
   * Histogram tap. Runs its own short pass rather than folding into the loop
   * below, because it has to read the value *after* the curve and *before*
   * levels, and those two are adjacent steps inside that loop.
   *
   * AUTO LEVELS stays idempotent across the move above: exposure is now
   * *upstream* of the tap, and the invariant is only that nothing downstream of
   * the tap feeds back above it. Levels is still the only thing the button
   * writes, and it still sits below.
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

    /* Exposure already ran, above the curve. */

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

  /*
   * The one ramp every tonal read shares — depth here, the band warp below, and
   * the colouring in step 4. Resolved even in '1color', where it is unused, so
   * there is no second code path to keep in step.
   */
  const rampStops = resolveRampStops(options);

  // -------------------------------------------------------------------------
  // The vector fork
  // -------------------------------------------------------------------------
  /*
   * Vector output leaves here, with the tone graded and nothing quantized.
   *
   * This is the whole reason the seam sits at 3.5 rather than at the top of the
   * function: steps 1-3 are exactly the field a beam wants to read, so vector
   * mode inherits the tone curve, levels, auto-levels, blur, sharpen and Sobel
   * edges without a line of new code. Everything below this point -- depth
   * resolution, the band warp, the dither, the colour buffer, the glyph ramp --
   * is cell machinery with no vector meaning.
   *
   * `luminance` and `histogram` still ride out on the result, so AUTO LEVELS
   * and the Levels histogram keep working: the histogram tap is upstream at
   * step 3 and never depended on the quantizer.
   */
  if ((options.rasterMode || 'ascii') === 'vector') {
    const vectorCfg = options.vectorConfig || VECTOR_CONFIG_DEFAULTS;
    const monoTint = options.monoTint || DEFAULT_PHOSPHOR_TINT;

    let resolveColor: VectorColorResolver;
    if (paletteMode === 'indexed' && activePalette) {
      /*
       * Tone match, always. Hue matching needs per-cell RGB to compare against
       * and a beam has no cells -- its colour is a property of the whole run.
       */
      const palId = activePalette.id;
      if (!activeQuantizer || cachedPaletteId !== palId) {
        activeQuantizer = new PaletteQuantizer(activePalette);
        cachedPaletteId = palId;
        cachedPaletteIsMonochrome = paletteIsMonochrome(activeQuantizer);
      }
      const q = activeQuantizer;
      resolveColor = (_line, meanLum) => rgbToHex(q.getToneRgb(meanLum));
    } else if (paletteMode !== 'content' && tonal !== '1color') {
      const stops = rampStops;
      resolveColor = (_line, meanLum) => {
        const v = Math.max(0, Math.min(0.9999, meanLum));
        return stops[Math.min(stops.length - 1, Math.floor(v * stops.length))];
      };
    } else {
      /*
       * Content colour resolves to the tint here rather than sampling the
       * source. Averaging RGB along a run is the one thing that would make the
       * tracer read the RGBA buffer as well as the luminance, and a deflection
       * beam in true source colour is a muddy look besides. See
       * vector-pipeline.md 7.
       */
      resolveColor = () => monoTint;
    }

    return {
      text: '',
      colors: null,
      luminance: lumBuffer,
      cols,
      rows,
      rasterMode: 'vector',
      bgColor,
      isColored: false,
      vector: traceVectorField(lumBuffer, cols, rows, vectorCfg, resolveColor, bgColor),
      histogram: histogramBuffer,
      histogramOpaque,
    };
  }

  let autoLevels: number;
  if (!isPixelOut) {
    autoLevels = densityLength;
  } else if (activePalette) {
    autoLevels = activePalette.colors.length;
  } else if (tonal !== '1color') {
    autoLevels = rampStops.length;
  } else {
    autoLevels = 256;
  }

  /*
   * Quantize depth (colorLevels) is strictly scoped to MONO and RGB modes.
   * In N-TONE and INDEXED (PALETTES) modes, the quantization depth is owned
   * intrinsically by the tone stop count or palette color count.
   */
  const isMonoOrRgb = paletteMode === 'content' || (paletteMode === 'phosphor' && tonal === '1color');

  const explicitLevels =
    isMonoOrRgb && options.colorLevels && options.colorLevels >= 2
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

  /*
   * Per-stop band widths, applied as a monotone warp on the tone *before* it is
   * quantized — see buildToneBandLut for why the warp goes here rather than
   * moving the bucket boundaries in step 4.
   *
   * Only meaningful when a user ramp is actually driving colour: an indexed
   * palette has its own quantization and its own spacing, and the mono path
   * never buckets at all.
   */
  if (!activePalette && tonal && tonal !== '1color') {
    const lut = buildToneBandLut(options.toneStopWeights, rampStops.length);
    if (lut) {
      for (let i = 0; i < totalCells; i++) {
        const v = lumBuffer[i];
        if (v < 0) continue; // transparency sentinel
        const idx = Math.min(255, Math.max(0, Math.round(v * 255)));
        lumBuffer[i] = lut[idx];
      }
    }
  }

  if (!paletteOwnsQuantization && ditherAlgo && ditherAlgo !== 'none') {
    applyDitherAlgorithm(lumBuffer, lumBuffer, cols, rows, ditherAlgo, ditherLevels, options.ditherParams);
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
    // Multi-tone N-color ramp mapping. Supports arbitrary N (2 to 8+) color stops.
    // Same `rampStops` the quantize depth above was derived from, so the number
    // of bands painted here always matches the number of tones resolved there.
    const numStops = rampStops.length;
    const parsedStops = rampStops.map((hex) => parseHexRgb(hex, { r: 128, g: 128, b: 128 }));

    for (let i = 0; i < totalCells; i++) {
      const lum = lumBuffer[i];
      if (lum < 0) {
        colorsBuffer[i * 3] = parsedStops[0].r;
        colorsBuffer[i * 3 + 1] = parsedStops[0].g;
        colorsBuffer[i * 3 + 2] = parsedStops[0].b;
        continue;
      }
      const val = Math.max(0, Math.min(0.9999, lum));
      const stopIdx = Math.min(numStops - 1, Math.floor(val * numStops));
      const col = parsedStops[stopIdx];
      colorsBuffer[i * 3] = col.r;
      colorsBuffer[i * 3 + 1] = col.g;
      colorsBuffer[i * 3 + 2] = col.b;
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
    vector: null,
    histogram: histogramBuffer,
    histogramOpaque,
  };
}
