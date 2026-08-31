/**
 * The press: contone colour in, screened device raster out.
 *
 * Three stages, and the resolution changes between the first and the second:
 *
 *   1. `separatePrint`   contone RGB  ->  one coverage plane per ink   (cols x rows)
 *   2. `screenPlates`    coverage     ->  binary dots per ink         (cols*S x rows*S)
 *   3. `resolvePrintFrame`  dots      ->  an ImageData of paper       (any size)
 *
 * That split is not an optimisation, it is what a RIP does: contone lives at a
 * few hundred pixels per inch and the screen lives at a few thousand. Every
 * existing pipeline stage runs at the contone resolution and is untouched; only
 * stages 2 and 3 see the big raster, which is why they are the only ones with a
 * quality tier.
 *
 * The physics is in printInks.ts, kept free of buffers so the separation can be
 * checked without a canvas. This file is buffers.
 */

import {
  InkPlate,
  PrintConfig,
  PrintFrame,
  PrintTier,
  DotShape,
  MAX_INKS,
} from '../types/ascii';
import {
  buildSeparationLut,
  sampleSeparationLut,
  linearizeHex,
  encodeSrgb,
  LUT_SIZE_FULL,
} from './printInks';
import { applyDitherAlgorithm, maskFor } from './ditherAlgorithms';

// ---------------------------------------------------------------------------
// Quality tiers
// ---------------------------------------------------------------------------

/*
 * Device-pixel budgets, set from measurement rather than guessed.
 *
 * Screening costs ~21,000 plate-pixels per millisecond. LIVE's budget is a
 * backstop for an enormous contone grid, not the usual governor — normally the
 * user's `supersample` is below it and simply applies.
 *
 * The number that matters for feel is not screening but the **resolve**, which
 * runs again on every zoom step at the new backing size and costs roughly
 * `output px x (taps + encode)`. Taps per output pixel is the reduction from the
 * device raster, so a high supersample makes zooming quadratically worse even
 * though the screening happened once. That is why LIVE defaults to 4 rather
 * than 8, and why quality lives in `proofSupersample` instead.
 */
/**
 * Live screening budget in **plate**-pixels — device pixels times ink count.
 *
 * Device pixels alone is the wrong unit, which the first version got wrong: a
 * six-ink stack does six times the screening of a one-ink stack on the same
 * raster, so a budget that ignores the count is either too tight for a duotone
 * or too loose for process colour. At ~21,000 plate-px/ms this is roughly a
 * 290 ms ceiling on the screening pass, a little above `STATIC_BUDGET_MS`
 * because the settled render is allowed to be the slow one and the drag is
 * already covered by the contone divisor.
 *
 * Two inks at 420x315 therefore afford the x4 default; four inks land on x3.
 */
export const LIVE_PLATE_PX_BUDGET = 6_000_000;
export const PROOF_PLATE_PX_BUDGET = 400_000_000;

/** What the viewport draws at unless the user says otherwise. */
export const SUPERSAMPLE_LIVE_DEFAULT = 4;
/** What RENDER PROOF and every export produce unless the user says otherwise. */
export const SUPERSAMPLE_PROOF_DEFAULT = 8;
export const SUPERSAMPLE_MIN = 1;
export const SUPERSAMPLE_MAX = 24;

/**
 * Device pixels per contone cell for a tier.
 *
 * A dot needs roughly 8 device pixels across before its *shape* is fully
 * resolved — below that a round dot and a diamond start to look alike — which
 * is why a proof defaults to 8. At 4 the lattice, the tone and the moiré are all
 * exactly right and only the dot outline is soft, which is the correct trade for
 * something being dragged and zoomed.
 *
 * What no tier does is change dot size or position. `ruling` is stored as cells
 * across the image width, so the lattice is pinned to the picture and only its
 * edge quality moves. That property is the whole reason the tiers are
 * interchangeable, and the first thing to check if the escalation ever feels
 * wrong.
 */
export function solveSupersample(
  cols: number,
  rows: number,
  requested: number,
  tier: PrintTier,
  inkCount = 1
): number {
  const isProof = tier === 'proof';
  if (requested > 0) {
    return Math.max(SUPERSAMPLE_MIN, Math.min(SUPERSAMPLE_MAX, requested));
  }
  const want = isProof ? SUPERSAMPLE_PROOF_DEFAULT : SUPERSAMPLE_LIVE_DEFAULT;
  const cells = Math.max(1, cols * rows) * Math.max(1, inkCount);
  const budget = isProof ? PROOF_PLATE_PX_BUDGET : 60_000_000;

  // Largest integer S whose plate-pixel count fits the budget.
  const fits = Math.floor(Math.sqrt(budget / cells));
  return Math.max(SUPERSAMPLE_MIN, Math.min(want, SUPERSAMPLE_MAX, Math.max(1, fits)));
}

/**
 * The supersample a tier will actually use, for the UI to state before it runs.
 *
 * Same call the renderer makes, exported so the panel and the export dialog
 * cannot quote a number the engine then declines to honour.
 */
export function tierSupersample(cfg: PrintConfig, cols: number, rows: number, tier: PrintTier) {
  return solveSupersample(
    cols,
    rows,
    tier === 'proof' ? cfg.proofSupersample : cfg.supersample,
    tier,
    cfg.inks.filter((k) => k.enabled).length
  );
}

/**
 * Output pixels per contone cell for an export, at a given scale multiplier.
 *
 * **Print's export scale is relative to the plate, not to the contone grid**, and
 * that is a correction rather than a convention. Treating it like the other
 * modes' scale meant a "2x" export of a 420-cell grid produced an 840-pixel
 * file off a 3360-pixel plate — the screening thrown away four times over,
 * silently, on the one output where the dots are the entire product.
 *
 * So 1x is the plate at its native resolution: every device pixel is one output
 * pixel and the dots come out exactly as screened. Below that the resolve
 * box-filters down, which is correct rather than lossy — it is the same filter
 * the viewport uses and it carries the optical dot gain. Above it the dots
 * magnify, which is what enlarging a coarse screen actually looks like.
 */
export function printExportCellSize(scale: number, proofSupersample: number): number {
  const ss = proofSupersample > 0 ? proofSupersample : SUPERSAMPLE_PROOF_DEFAULT;
  return Math.max(0.05, scale) * ss;
}

/**
 * Rough ms estimate, for the RENDER PROOF button to state its cost up front.
 *
 * Screening dominates a proof and is very nearly linear in plate-pixels; the
 * coefficient is measured (~21,000 plate-px/ms) and lands within ~10% across
 * 2.8M to 25M device pixels. The resolve is deliberately *not* modelled as a
 * function of device pixels: it scales with the output size, not the source, so
 * at proof resolutions it is a rounding error against the screening.
 */
export function estimatePrintCost(
  cols: number,
  rows: number,
  supersample: number,
  inkCount: number
): number {
  const devicePx = cols * rows * supersample * supersample;
  return Math.round((devicePx * Math.max(1, inkCount)) / 21_000);
}

// ---------------------------------------------------------------------------
// Stage 1 — separation
// ---------------------------------------------------------------------------

export interface PrintSeparation {
  /** `inkCount * cols * rows`, plate-major: plane p starts at `p * total`. */
  coverage: Float32Array;
  /** Enabled inks, in print order. Parallel to the coverage planes. */
  inks: InkPlate[];
  inkCount: number;
  cols: number;
  rows: number;
  paperHex: string;
  grainInterlock?: boolean;
}

let covBuffer = new Float32Array(0);
let covCapacity = 0;
const sampleScratch = new Float32Array(MAX_INKS);

/**
 * Contone RGB to one coverage plane per ink.
 *
 * `target` is gamma-encoded graded RGB, three bytes per cell — the colour the
 * press is being asked to hit. `lum` supplies the transparency sentinel
 * (pipeline.md invariant 1): a cell below zero gets no ink on any plate, which
 * leaves bare paper and is the honest answer for a cut-out.
 *
 * Every cell is a trilinear lookup rather than a solve; see
 * `buildSeparationLut` for why, and for what falls out of doing it
 * colorimetrically (automatic black generation, out-of-gamut inks, paper as a
 * real term).
 */
export function separatePrint(
  target: Uint8ClampedArray,
  lum: Float32Array | null,
  cols: number,
  rows: number,
  config: PrintConfig
): PrintSeparation {
  const inks = config.inks.filter((k) => k.enabled).slice(0, MAX_INKS);
  const n = inks.length;
  const total = cols * rows;

  const need = Math.max(1, n) * total;
  if (covCapacity < need) {
    covBuffer = new Float32Array(need);
    covCapacity = need;
  }
  const coverage = covBuffer;
  coverage.fill(0, 0, need);

  if (n === 0) {
    return { coverage, inks, inkCount: 0, cols, rows, paperHex: config.paper };
  }

  /*
   * The full table at both tiers.
   *
   * It used to drop to 17^3 while dragging, which no longer has anywhere to
   * hang now that the draft tier is gone — and it was buying very little. The
   * table is cached on (inks, paper, TAC), so it is rebuilt only when one of
   * those changes, and at 30 ms for four inks that already fits inside a drag.
   * Using a coarser table on some frames would also mean the separation itself
   * differed between a preview and the pass replacing it, which is precisely
   * the kind of "same picture, two answers" the fork is built to avoid.
   */
  const lut = buildSeparationLut(
    inks,
    config.paper,
    config.tacLimit,
    LUT_SIZE_FULL,
    config.inkPurity ?? 0.5
  );

  for (let i = 0; i < total; i++) {
    if (lum && lum[i] < 0) {
      /*
       * The sentinel is carried into every coverage plane rather than left as a
       * zero (pipeline.md invariant 1).
       *
       * Zero and cut-out both mean "no ink here", so they look identical on the
       * plate — but they are not the same to the *bilinear sample* in
       * `sampleCoverage`. Averaging an opaque cell against a zeroed cut-out
       * neighbour thins the ink along the silhouette, which prints as a pale
       * halo tracing every edge. Exactly the failure the alpha-aware box blur
       * in step 2 exists to avoid, arriving one stage later.
       */
      for (let p = 0; p < n; p++) coverage[p * total + i] = -1;
      continue;
    }
    const o = i * 3;
    sampleSeparationLut(lut, target[o], target[o + 1], target[o + 2], sampleScratch, 0);
    for (let p = 0; p < n; p++) {
      coverage[p * total + i] = sampleScratch[p];
    }
  }

  lastSeparation = {
    coverage,
    inks,
    inkCount: n,
    cols,
    rows,
    paperHex: config.paper,
    grainInterlock: config.grainInterlock ?? true,
  };
  return lastSeparation;
}

let lastSeparation: PrintSeparation | null = null;

/**
 * The separation the most recent print render produced.
 *
 * A live module buffer, exactly like `ProcessedRasterResult.luminance` — the
 * same contract and the same hazard (pipeline.md invariant 5): the next print
 * frame overwrites it. Exists so the PROOF tier can re-screen the separation
 * the viewport is already showing at a higher supersample, instead of running
 * the front of the pipeline twice and risking two subtly different separations
 * of the same picture.
 *
 * Anything that will outlive the current frame must `cloneSeparation` it first.
 */
export function lastPrintSeparation(): PrintSeparation | null {
  return lastSeparation;
}

/**
 * A private copy, for work that spans frames.
 *
 * The PROOF tier walks its bands across many animation frames, and an ordinary
 * render landing in between would overwrite the shared coverage buffer
 * underneath it — the plates would then be screened from two different
 * separations and the halves would not line up. Copying costs `inks * cells`
 * floats, a couple of megabytes, once per proof.
 */
export function cloneSeparation(sep: PrintSeparation): PrintSeparation {
  const used = Math.max(1, sep.inkCount) * sep.cols * sep.rows;
  return { ...sep, coverage: sep.coverage.slice(0, used) };
}

// ---------------------------------------------------------------------------
// Stage 2 — screening
// ---------------------------------------------------------------------------

/*
 * Spot functions: the order ink fills a screen cell.
 *
 * `fu`/`fv` are the fractional position inside the cell, so every function here
 * has to agree with itself across the wrap — `g(0, v)` must equal `g(1, v)` or
 * the lattice shows a seam every cell. The cosine forms wrap by construction;
 * the absolute-value forms wrap because they are symmetric about 0.5.
 *
 * Lower value means inked earlier, so a highlight is where only the lowest
 * values pass. Raw magnitudes do not matter at all — `buildAreaLut` replaces
 * each function with its own area percentile — which is what makes adding a
 * shape here a one-line change with correct tone for free.
 */
const TAU = Math.PI * 2;

function spotValue(shape: DotShape, fu: number, fv: number, aspect: number): number {
  switch (shape) {
    case 'round':
      // The Euclidean dot: round in the highlights, checkerboard at 50%,
      // inverse round hole in the shadows. What an offset screen actually does.
      return -(Math.cos(TAU * fu) + Math.cos(TAU * fv));
    case 'ellipse':
      // Chain dot. The dots join along one axis before the other, which is
      // what avoids the abrupt midtone jump a round dot makes at 50%.
      return -(Math.cos(TAU * fu) + aspect * Math.cos(TAU * fv)) / (1 + aspect);
    case 'square':
      return Math.max(Math.abs(fu - 0.5), Math.abs(fv - 0.5));
    case 'diamond':
      return Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
    case 'line':
      // A line screen: the band grows across v only, so `angle` rotates it.
      return Math.abs(fv - 0.5);
    case 'cross':
      return Math.min(Math.abs(fu - 0.5), Math.abs(fv - 0.5));
    default:
      return -(Math.cos(TAU * fu) + Math.cos(TAU * fv));
  }
}

const AREA_LUT_N = 512;
const AREA_SAMPLE = 128;

interface AreaLut {
  /** Normalized spot value -> the fraction of the cell at or below it. */
  lut: Float32Array;
  min: number;
  span: number;
}

const areaLutCache = new Map<string, AreaLut>();

/**
 * The calibration that makes tone correct, and the reason it is needed.
 *
 * A raw spot value is not a threshold. `{ g < a }` does not have area `a` for
 * any of the functions above, so thresholding on `g` directly means a plate
 * asked for 50% coverage prints something else — and differently for every dot
 * shape, so changing shape would silently change exposure.
 *
 * Replacing `g` with its own **area percentile** fixes it exactly:
 * `P(rank(g) < a) = a` holds by construction, for any spot function, including
 * ones added later. Sample the cell, sort, invert.
 *
 * This is the continuous-coordinate version of what `buildSpotScreen` in
 * ditherAlgorithms.ts does by ranking an 8x8 matrix. That one cannot be reused
 * here: its 45 degrees and its 8-pixel pitch are baked into the tile, and a
 * press screen needs arbitrary angle, arbitrary ruling and a sub-cell phase.
 */
function buildAreaLut(shape: DotShape, aspect: number): AreaLut {
  const key = `${shape}:${aspect.toFixed(3)}`;
  const hit = areaLutCache.get(key);
  if (hit) return hit;

  const samples = new Float32Array(AREA_SAMPLE * AREA_SAMPLE);
  let min = Infinity;
  let max = -Infinity;
  let k = 0;
  for (let y = 0; y < AREA_SAMPLE; y++) {
    const fv = (y + 0.5) / AREA_SAMPLE;
    for (let x = 0; x < AREA_SAMPLE; x++) {
      const fu = (x + 0.5) / AREA_SAMPLE;
      const g = spotValue(shape, fu, fv, aspect);
      samples[k++] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }

  const span = max - min || 1;
  // Histogram over the normalized range, then a CDF: bin i holds the fraction
  // of the cell at or below normalized value i / (N-1).
  const lut = new Float32Array(AREA_LUT_N);
  for (let i = 0; i < samples.length; i++) {
    const bin = Math.min(AREA_LUT_N - 1, (((samples[i] - min) / span) * (AREA_LUT_N - 1)) | 0);
    lut[bin] += 1;
  }
  let acc = 0;
  const inv = 1 / samples.length;
  for (let i = 0; i < AREA_LUT_N; i++) {
    acc += lut[i];
    lut[i] = acc * inv;
  }

  const built: AreaLut = { lut, min, span };
  areaLutCache.set(key, built);
  return built;
}

let maskBuffer = new Uint8Array(0);
let fmScratch = new Float32Array(0);
let fmScratchOut = new Float32Array(0);

/**
 * Bilinear sample of one coverage plane, clamped at the edges and alpha-aware.
 *
 * A silhouette has to be handled in **both** directions, and getting only one of
 * them is worse than getting neither:
 *
 *  - The cut-out side must take no ink at all. A plain bilinear tap reaches half
 *    a cell past the edge, so ink bled three device columns into a fully
 *    transparent region — measured, before the containing-cell test below.
 *  - The opaque side must keep its full coverage. Averaging it against a
 *    zero-valued cut-out neighbour thins the ink along the edge, which prints as
 *    a pale halo tracing every silhouette.
 *
 * So the containing cell decides whether there is ink at all, and the weighted
 * average then runs only over taps that carry some. The alpha boundary lands at
 * contone resolution, which is where the alpha actually lives. This is the same
 * treatment the box blur gives transparency in step 2, and the same reason.
 *
 * The renormalised branch is only entered near a silhouette, so the common case
 * pays two extra comparisons.
 */
function sampleCoverage(
  cov: Float32Array,
  base: number,
  cols: number,
  rows: number,
  x: number,
  y: number
): number {
  /*
   * The cell this device pixel is inside — floor of the unshifted position, not
   * of the half-cell-shifted one used for the taps below. A cut-out here means
   * bare paper, whatever the neighbours hold.
   */
  let ox = Math.floor(x);
  let oy = Math.floor(y);
  if (ox < 0) ox = 0;
  else if (ox > cols - 1) ox = cols - 1;
  if (oy < 0) oy = 0;
  else if (oy > rows - 1) oy = rows - 1;
  if (cov[base + oy * cols + ox] < 0) return -1;

  // Cell centres sit at half-integers, so shift before flooring or the whole
  // plate lands half a cell up and left of the dots screening it.
  const fx = x - 0.5;
  const fy = y - 0.5;
  let x0 = Math.floor(fx);
  let y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  let x1 = x0 + 1;
  let y1 = y0 + 1;

  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 < 0) x1 = 0;
  if (y1 < 0) y1 = 0;
  if (x0 > cols - 1) x0 = cols - 1;
  if (y0 > rows - 1) y0 = rows - 1;
  if (x1 > cols - 1) x1 = cols - 1;
  if (y1 > rows - 1) y1 = rows - 1;

  const r0 = base + y0 * cols;
  const r1 = base + y1 * cols;
  const v00 = cov[r0 + x0];
  const v10 = cov[r0 + x1];
  const v01 = cov[r1 + x0];
  const v11 = cov[r1 + x1];

  if (v00 >= 0 && v10 >= 0 && v01 >= 0 && v11 >= 0) {
    const a = v00 + (v10 - v00) * dx;
    const b = v01 + (v11 - v01) * dx;
    return a + (b - a) * dy;
  }

  const w00 = (1 - dx) * (1 - dy);
  const w10 = dx * (1 - dy);
  const w01 = (1 - dx) * dy;
  const w11 = dx * dy;
  let sum = 0;
  let weight = 0;
  if (v00 >= 0) {
    sum += v00 * w00;
    weight += w00;
  }
  if (v10 >= 0) {
    sum += v10 * w10;
    weight += w10;
  }
  if (v01 >= 0) {
    sum += v01 * w01;
    weight += w01;
  }
  if (v11 >= 0) {
    sum += v11 * w11;
    weight += w11;
  }
  /*
   * The containing cell was opaque, so there is ink here; the fallback is its
   * own value rather than the sentinel. The weight floor matters: exactly on a
   * boundary the only surviving tap can carry a weight of zero, and dividing by
   * it would produce NaN — which compares false against every threshold and so
   * silently drops ink instead of laying it down.
   */
  return weight > 1e-6 ? sum / weight : cov[base + oy * cols + ox];
}

/** Coverage transfer: ink limits, then physical dot growth. */
function transferCoverage(a: number, minC: number, maxC: number, gain: number): number {
  let v = minC + (maxC - minC) * a;
  if (gain !== 0) {
    /*
     * `sin(pi*a)` is the standard tone-value-increase shape: it peaks at
     * midtone and vanishes at both ends, so paper stays paper and a solid
     * stays solid. A flat offset instead would fog the highlights and a
     * multiplier would never let a solid be solid — both are what physical dot
     * growth conspicuously does not do.
     */
    v += gain * Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
  }
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface ScreenProgress {
  /** Device rows completed. */
  row: number;
  totalRows: number;
  plate: number;
  plateCount: number;
}

/**
 * Screens every plate into one device raster.
 *
 * Returns a `PrintFrame` whose `plateMask` carries bit `p` wherever ink `p` was
 * deposited. Plates overlap freely — that is the whole difference between this
 * and a colour separation, where every cell belongs to exactly one ink
 * (pipeline.md invariant 9).
 *
 * `onProgress` and `bandRows` exist for the PROOF tier: pass a band height and
 * this becomes resumable, which is what keeps a thirty-megapixel proof from
 * blocking input. `screenPlatesChunked` wraps that up.
 */
export function screenPlates(
  sep: PrintSeparation,
  supersample: number,
  tier: PrintTier
): PrintFrame {
  const frame = allocPrintFrame(sep, supersample, tier);
  for (let p = 0; p < sep.inkCount; p++) screenPlate(frame, sep, p, 0, frame.height);
  finalizeCoverage(frame, sep);
  return frame;
}

/**
 * Allocates the frame and zeroes the mask, without screening anything.
 *
 * Split out so the chunked path can hand the same frame back to the viewport
 * band by band — a partial proof paints as bare paper where it has not reached
 * yet, which reads as progress rather than as a broken render.
 */
export function allocPrintFrame(
  sep: PrintSeparation,
  supersample: number,
  tier: PrintTier,
  /**
   * Allocate a private mask instead of reusing the shared one.
   *
   * Required by the chunked path, and not an optimisation to skip: a proof is
   * written across many animation frames, and an ordinary render landing in
   * between calls this function too — which would `fill(0)` the very buffer the
   * proof is half way through writing. The bands already screened would vanish
   * and the result would be a frame with holes in it. Every other caller
   * finishes inside one turn, so they keep the shared buffer.
   */
  ownBuffer = false
): PrintFrame {
  const width = sep.cols * supersample;
  const height = sep.rows * supersample;
  const total = width * height;

  let mask: Uint8Array;
  if (ownBuffer) {
    mask = new Uint8Array(total);
  } else {
    if (maskBuffer.length < total) maskBuffer = new Uint8Array(total);
    maskBuffer.fill(0, 0, total);
    mask = maskBuffer;
  }

  return {
    width,
    height,
    supersample,
    plateMask: mask,
    inks: sep.inks,
    paperHex: sep.paperHex,
    coverage: new Array(sep.inkCount).fill(0),
    tier,
  };
}

/**
 * One plate, over a band of device rows.
 *
 * The whole loop is written incrementally rather than recomputing the transform
 * per pixel: stepping X by one advances the plate-space position and the screen
 * coordinates by constants, so the trig is hoisted to the row. That is the
 * difference between this pass being tens of milliseconds and being seconds.
 */
export function screenPlate(
  frame: PrintFrame,
  sep: PrintSeparation,
  p: number,
  rowStart: number,
  rowEnd: number
): void {
  const ink = sep.inks[p];
  if (!ink) return;

  const { width, height, supersample: ss, plateMask } = frame;
  const { cols, rows, coverage } = sep;
  const base = p * cols * rows;
  const bit = 1 << p;

  const y0 = Math.max(0, rowStart);
  const y1 = Math.min(height, rowEnd);
  if (y1 <= y0) return;

  if (ink.screen === 'fm') {
    screenPlateFm(frame, sep, p, y0, y1);
    return;
  }

  // --- registration: the inverse of the plate's own placement error ---
  const regRad = (ink.regAngle * Math.PI) / 180;
  const cosR = Math.cos(regRad);
  const sinR = Math.sin(regRad);
  const cx = width / 2;
  const cy = height / 2;
  const offX = ink.regX * ss;
  const offY = ink.regY * ss;

  // --- screen geometry ---
  const solid = ink.screen === 'solid';
  const theta = (ink.angle * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  // Ruling is cells across the image WIDTH, so the pitch follows the picture
  // and not the device raster. This is what pins dot size across tiers.
  const period = width / Math.max(0.5, ink.ruling);
  const invT = 1 / period;

  const { lut: areaLut, min: gMin, span: gSpan } = buildAreaLut(ink.dotShape, ink.dotAspect);
  const gScale = (AREA_LUT_N - 1) / gSpan;

  // Per-X increments, constant for the whole plate.
  const dPx = cosR;
  const dPy = -sinR;
  const dU = (cosR * cosT - sinR * sinT) * invT;
  const dV = (-cosR * sinT - sinR * cosT) * invT;
  const dSx = dPx / ss;
  const dSy = dPy / ss;

  const minC = ink.minCoverage;
  const maxC = ink.maxCoverage;
  const gain = ink.dotGain;

  for (let Y = y0; Y < y1; Y++) {
    // Row origin in plate space.
    const ry = Y - offY;
    const bx = -offX - cx;
    const by = ry - cy;
    const px0 = cx + bx * cosR + by * sinR;
    const py0 = cy - bx * sinR + by * cosR;

    let px = px0;
    let py = py0;
    let u = (px0 * cosT + py0 * sinT) * invT + ink.shiftX;
    let v = (-px0 * sinT + py0 * cosT) * invT + ink.shiftY;
    let sx = px0 / ss;
    let sy = py0 / ss;

    const rowOff = Y * width;

    for (let X = 0; X < width; X++) {
      const raw = sampleCoverage(coverage, base, cols, rows, sx, sy);
      if (raw > 0) {
        const a = transferCoverage(raw, minC, maxC, gain);
        if (a > 0) {
          let hit: boolean;
          if (solid) {
            hit = a > 0.5;
          } else if (a >= 1) {
            hit = true;
          } else {
            const fu = u - Math.floor(u);
            const fv = v - Math.floor(v);
            const g = spotValue(ink.dotShape, fu, fv, ink.dotAspect);
            let bin = ((g - gMin) * gScale) | 0;
            if (bin < 0) bin = 0;
            else if (bin > AREA_LUT_N - 1) bin = AREA_LUT_N - 1;
            hit = areaLut[bin] < a;
          }
          if (hit) plateMask[rowOff + X] |= bit;
        }
      }
      px += dPx;
      py += dPy;
      u += dU;
      v += dV;
      sx += dSx;
      sy += dSy;
    }
  }
}

/**
 * FM screening: fixed dot size, varying count.
 *
 * The riso thermal-master path, and the one place the print engine reaches back
 * into the existing dither registry. The coverage field is expanded to device
 * resolution and run through `applyDitherAlgorithm` at two levels — so all 44
 * algorithms and their whole parameter machinery apply per plate, and FM cost
 * no new dithering code at all.
 *
 * Bands are screened as complete strips rather than incrementally, because
 * error diffusion is sequential: a band boundary mid-diffusion would leave a
 * visible seam. In practice FM runs at WORKING or PROOF in one call.
 */
function screenPlateFm(
  frame: PrintFrame,
  sep: PrintSeparation,
  p: number,
  y0: number,
  y1: number
): void {
  const ink = sep.inks[p];
  const { width, supersample: ss, plateMask } = frame;
  const { cols, rows, coverage } = sep;
  const base = p * cols * rows;
  const bit = 1 << p;

  const bandH = y1 - y0;
  const scale = Math.max(1, Math.min(8, ink.fmScale || 1));
  const dWidth = Math.ceil(width / scale);
  const dBandH = Math.ceil(bandH / scale);
  const need = dWidth * dBandH;

  if (fmScratch.length < need) {
    fmScratch = new Float32Array(need);
    fmScratchOut = new Float32Array(need);
  }

  const regRad = (ink.regAngle * Math.PI) / 180;
  const cosR = Math.cos(regRad);
  const sinR = Math.sin(regRad);
  const cx = width / 2;
  const cy = frame.height / 2;
  const offX = ink.regX * ss;
  const offY = ink.regY * ss;
  const dSx = (cosR * scale) / ss;
  const dSy = (-sinR * scale) / ss;

  const mask = maskFor(ink.fmAlgorithm || 'atkinson');
  const isInterlock = sep.grainInterlock !== false;

  if (mask && isInterlock) {
    // Interlocking / joint screening with threshold mask:
    // Plate p is active on threshold interval [S_prev, S_prev + c_p] modulo 1.0.
    // In a multi-color gradient (e.g. Pink to Blue), dots interlock into adjacent negative spaces
    // with 0% accidental white paper gaps!
    const maskW = mask.width;
    const maskH = mask.height;
    const offsets = mask.offsets;
    const totalInks = sep.inkCount;

    for (let dY = 0; dY < dBandH; dY++) {
      const Y = y0 + dY * scale;
      const bx = -offX - cx;
      const by = Y - offY - cy;
      const px0 = cx + bx * cosR + by * sinR;
      const py0 = cy - bx * sinR + by * cosR;
      let sx = px0 / ss;
      let sy = py0 / ss;

      const my = ((dY % maskH) + maskH) % maskH;
      const maskRow = my * maskW;

      for (let dX = 0; dX < dWidth; dX++) {
        const raw = sampleCoverage(coverage, base, cols, rows, sx, sy);
        if (raw >= 0) {
          const cp = transferCoverage(raw, ink.minCoverage, ink.maxCoverage, ink.dotGain);
          if (cp > 0) {
            let active = false;
            if (cp >= 1) {
              active = true;
            } else {
              let sPrev = 0;
              let sTotal = 0;
              for (let k = 0; k < totalInks; k++) {
                const kRaw = sampleCoverage(coverage, k * cols * rows, cols, rows, sx, sy);
                if (kRaw > 0) {
                  const kCov = transferCoverage(kRaw, sep.inks[k].minCoverage, sep.inks[k].maxCoverage, sep.inks[k].dotGain);
                  if (k < p) sPrev += kCov;
                  sTotal += kCov;
                }
              }

              let effCp = cp;
              let effPrev = sPrev;
              if (sTotal > 0.55 && sTotal < 1.0) {
                const norm = 1.0 / sTotal;
                effCp = Math.min(1, cp * norm);
                effPrev = sPrev * norm;
              }

              const mx = ((dX % maskW) + maskW) % maskW;
              const threshold = offsets[maskRow + mx] + 0.5;
              const start = effPrev % 1.0;
              const end = start + effCp;
              if (end <= 1.0) {
                active = threshold >= start && threshold < end;
              } else {
                active = threshold >= start || threshold < (end - 1.0);
              }
            }

            if (active) {
              if (scale === 1) {
                if (Y < y1) plateMask[Y * width + dX] |= bit;
              } else {
                for (let sy0 = 0; sy0 < scale; sy0++) {
                  const py = Y + sy0;
                  if (py >= y1) break;
                  const pRow = py * width;
                  const baseX = dX * scale;
                  for (let sx0 = 0; sx0 < scale; sx0++) {
                    const px = baseX + sx0;
                    if (px < width) plateMask[pRow + px] |= bit;
                  }
                }
              }
            }
          }
        }
        sx += dSx;
        sy += dSy;
      }
    }
    return;
  }

  // Non-mask / error diffusion path:
  for (let dY = 0; dY < dBandH; dY++) {
    const Y = y0 + dY * scale;
    const bx = -offX - cx;
    const by = Y - offY - cy;
    const px0 = cx + bx * cosR + by * sinR;
    const py0 = cy - bx * sinR + by * cosR;
    let sx = px0 / ss;
    let sy = py0 / ss;
    const rowOff = dY * dWidth;
    for (let dX = 0; dX < dWidth; dX++) {
      const raw = sampleCoverage(coverage, base, cols, rows, sx, sy);
      /*
       * The sentinel goes straight through rather than being clamped to zero.
       * `applyDitherAlgorithm` already reads a negative as transparent
       * (pipeline.md invariant 1), so a cut-out neither takes ink nor absorbs
       * diffused error — which is what stops the error from piling up against
       * the silhouette and dumping a dark fringe along it.
       */
      fmScratch[rowOff + dX] =
        raw < 0 ? -1 : transferCoverage(raw, ink.minCoverage, ink.maxCoverage, ink.dotGain);
      sx += dSx;
      sy += dSy;
    }
  }

  applyDitherAlgorithm(
    fmScratch.subarray(0, need),
    fmScratchOut.subarray(0, need),
    dWidth,
    dBandH,
    ink.fmAlgorithm || 'atkinson',
    2,
    {
      seed: p * 47 + (p % 2 === 1 ? 23 : 0),
      angle: ink.angle,
      serpentine: true,
    }
  );

  if (scale === 1) {
    for (let i = 0; i < need; i++) {
      if (fmScratchOut[i] > 0.5) {
        const Y = y0 + ((i / dWidth) | 0);
        if (Y < y1) {
          plateMask[Y * width + (i % dWidth)] |= bit;
        }
      }
    }
  } else {
    for (let dY = 0; dY < dBandH; dY++) {
      const baseY = y0 + dY * scale;
      const rowOff = dY * dWidth;
      for (let dX = 0; dX < dWidth; dX++) {
        if (fmScratchOut[rowOff + dX] > 0.5) {
          const baseX = dX * scale;
          for (let sy = 0; sy < scale; sy++) {
            const py = baseY + sy;
            if (py >= y1) break;
            const pRow = py * width;
            for (let sx = 0; sx < scale; sx++) {
              const px = baseX + sx;
              if (px < width) {
                plateMask[pRow + px] |= bit;
              }
            }
          }
        }
      }
    }
  }
}

/** Inked fraction per plate, for the UI readout. */
export function finalizeCoverage(frame: PrintFrame, sep: PrintSeparation): void {
  const total = frame.width * frame.height;
  const counts = new Array(sep.inkCount).fill(0);
  const mask = frame.plateMask;
  for (let i = 0; i < total; i++) {
    const m = mask[i];
    if (m === 0) continue;
    for (let p = 0; p < sep.inkCount; p++) if (m & (1 << p)) counts[p]++;
  }
  frame.coverage = counts.map((c) => (total > 0 ? c / total : 0));
}

/**
 * The PROOF tier's resumable form.
 *
 * Yields after each band so the caller can paint, report progress and check for
 * cancellation. `plateMask` is written in place and a band is only a row range,
 * so there is nothing to stitch — and nothing standing in the way of moving
 * this into a worker later, which is why it is shaped this way rather than as a
 * callback-per-pixel.
 */
export function* screenPlatesChunked(
  sep: PrintSeparation,
  supersample: number,
  bandRows = 96
): Generator<{ frame: PrintFrame; progress: ScreenProgress }, PrintFrame, void> {
  const frame = allocPrintFrame(sep, supersample, 'proof', true);

  for (let p = 0; p < sep.inkCount; p++) {
    for (let y = 0; y < frame.height; y += bandRows) {
      screenPlate(frame, sep, p, y, Math.min(frame.height, y + bandRows));
      yield {
        frame,
        progress: {
          row: Math.min(frame.height, y + bandRows),
          totalRows: frame.height,
          plate: p + 1,
          plateCount: sep.inkCount,
        },
      };
    }
  }

  finalizeCoverage(frame, sep);
  return frame;
}

// ---------------------------------------------------------------------------
// Stage 3 — resolve
// ---------------------------------------------------------------------------

/**
 * Every reachable ink combination, pre-composited.
 *
 * `plateMask` is one byte, so there are only 256 possible stacks of ink at a
 * pixel however large the raster is. Compositing all of them once turns the
 * inner loop of the resolve into a single table read — no per-pixel `pow`, no
 * loop over inks, and the Yule-Nielsen exponent folded in for free.
 *
 * It also makes opaque inks exact rather than approximate: an opaque ink is
 * order-dependent, and each of the 256 entries is built by walking the stack in
 * print order, so the ordering is honoured without costing the hot loop a
 * branch.
 */
function buildCompositeTable(frame: PrintFrame, yuleNielsen: number): Float32Array {
  const table = new Float32Array(256 * 3);
  const P = linearizeHex(frame.paperHex);
  const inks = frame.inks;
  const n = Math.min(MAX_INKS, inks.length);

  const linear = inks.map((k) => linearizeHex(k.hex));
  const opac = inks.map((k) => Math.max(0, Math.min(1, k.opacity)));

  const yn = yuleNielsen > 1.0001 ? 1 / yuleNielsen : 0;
  const combos = 1 << n;

  for (let m = 0; m < combos; m++) {
    let r = P[0];
    let g = P[1];
    let b = P[2];

    // Print order, so an opaque ink laid down later covers what is beneath it.
    for (let p = 0; p < n; p++) {
      if (!(m & (1 << p))) continue;
      const [tr, tg, tb] = linear[p];
      const o = opac[p];
      if (inks[p].opaque) {
        r += (tr - r) * o;
        g += (tg - g) * o;
        b += (tb - b) * o;
      } else {
        // Coverage is binary here — the dot either landed or it did not — so
        // the Beer-Lambert exponent is just the ink's own solidity.
        r *= Math.pow(Math.max(0.002, tr), o);
        g *= Math.pow(Math.max(0.002, tg), o);
        b *= Math.pow(Math.max(0.002, tb), o);
      }
    }

    const o = m * 3;
    if (yn) {
      table[o] = Math.pow(r, yn);
      table[o + 1] = Math.pow(g, yn);
      table[o + 2] = Math.pow(b, yn);
    } else {
      table[o] = r;
      table[o + 1] = g;
      table[o + 2] = b;
    }
  }

  // Masks naming inks that do not exist can only arise from a stale buffer;
  // fold them onto bare paper rather than reading past the table.
  for (let m = combos; m < 256; m++) {
    const o = m * 3;
    const src = (m & (combos - 1)) * 3;
    table[o] = table[src];
    table[o + 1] = table[src + 1];
    table[o + 2] = table[src + 2];
  }

  return table;
}

let resolveCanvas: HTMLCanvasElement | null = null;
let resolveCtx: CanvasRenderingContext2D | null = null;

export function acquireResolveImage(w: number, h: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    try {
      return new ImageData(w, h);
    } catch {
      // ignore
    }
  }
  if (typeof document !== 'undefined') {
    if (!resolveCanvas) {
      resolveCanvas = document.createElement('canvas');
      resolveCtx = resolveCanvas.getContext('2d');
    }
    if (resolveCtx) {
      return resolveCtx.createImageData(w, h);
    }
  }
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * The device raster as paper, at whatever size the caller needs.
 *
 * The only place a composite exists — the viewport and every export call this,
 * so the screen and the file cannot disagree about what the print looks like.
 *
 * **Downsampling is ours, not the browser's.** A bilinear reduction of an
 * eight-times raster beats against the dot lattice and produces false moire
 * that looks exactly like a bug in the screening. A box filter over the whole
 * source footprint is also the physically right answer, and it is where optical
 * dot gain lives: averaging reflectance raised to `1/n` and raising the mean
 * back to `n` is the Yule-Nielsen transform, which models light scattering
 * sideways inside the paper and is why a halftone reads darker than its ink
 * area. At `n = 1` it is a plain box filter and the `pow` is skipped.
 *
 * Magnifying takes the nearest device pixel instead, so a zoomed-in proof shows
 * its actual dots rather than a smeared guess at them.
 */
export function resolvePrintFrame(
  frame: PrintFrame,
  targetW: number,
  targetH: number,
  yuleNielsen = 1,
  soloInk?: string | null,
  srcRect?: { x: number; y: number; w: number; h: number }
): ImageData {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));
  const out = acquireResolveImage(w, h);
  const px = out.data;

  /*
   * Solo is a mask filter, not a re-render. Screening the whole stack and then
   * hiding the other plates is what makes soloing instant, and it also means
   * what you see soloed is bit-identical to that plate's contribution in the
   * composite rather than a separate render that might disagree.
   */
  let keep = 0xff;
  if (soloInk) {
    const i = frame.inks.findIndex((k) => k.id === soloInk);
    keep = i >= 0 ? 1 << i : 0;
  } else {
    for (let i = 0; i < frame.inks.length; i++) {
      if (frame.inks[i].hidden) {
        keep &= ~(1 << i);
      }
    }
  }

  const table = buildCompositeTable(frame, yuleNielsen);
  const yn = yuleNielsen > 1.0001 ? yuleNielsen : 0;
  const { width: rasterW, height: rasterH, plateMask } = frame;

  /*
   * The source window, in device pixels.
   *
   * Present so a deep zoom resolves only the dots actually on screen. Without
   * it the viewport would have to composite a raster far larger than the
   * display just to look at a corner of it, and at high supersample that is the
   * one zoom level where the mode is genuinely interesting to look at closely.
   */
  const rx = srcRect ? Math.max(0, Math.min(rasterW - 1, Math.floor(srcRect.x))) : 0;
  const ry = srcRect ? Math.max(0, Math.min(rasterH - 1, Math.floor(srcRect.y))) : 0;
  const sw = srcRect ? Math.max(1, Math.min(rasterW - rx, Math.ceil(srcRect.w))) : rasterW;
  const sh = srcRect ? Math.max(1, Math.min(rasterH - ry, Math.ceil(srcRect.h))) : rasterH;

  const magnifying = w >= sw && h >= sh;

  if (magnifying) {
    // Pre-calculate 32-bit packed RGBA table for 1-instruction-per-pixel blits
    const table32 = new Uint32Array(256);
    for (let m = 0; m < 256; m++) {
      const o = m * 3;
      const r = encodeSrgb(yn ? Math.pow(table[o], yn) : table[o]);
      const g = encodeSrgb(yn ? Math.pow(table[o + 1], yn) : table[o + 1]);
      const b = encodeSrgb(yn ? Math.pow(table[o + 2], yn) : table[o + 2]);
      table32[m] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

    const px32 = new Uint32Array(px.buffer, px.byteOffset, w * h);
    const xs = sw / w;
    const ys = sh / h;
    let o = 0;
    for (let y = 0; y < h; y++) {
      const sy = ry + Math.min(sh - 1, (y * ys) | 0);
      const rowOff = sy * rasterW;
      for (let x = 0; x < w; x++) {
        const sx = rx + Math.min(sw - 1, (x * xs) | 0);
        px32[o++] = table32[plateMask[rowOff + sx] & keep];
      }
    }
    return out;
  }

  // Pre-split color lookup tables for fast box filter reads
  const tableR = new Float32Array(256);
  const tableG = new Float32Array(256);
  const tableB = new Float32Array(256);
  for (let m = 0; m < 256; m++) {
    tableR[m] = table[m * 3];
    tableG[m] = table[m * 3 + 1];
    tableB[m] = table[m * 3 + 2];
  }

  // Box filter. Integer edges so every source pixel lands in exactly one box.
  const colEdges = new Int32Array(w + 1);
  for (let x = 0; x <= w; x++) colEdges[x] = rx + Math.round((x * sw) / w);
  const rowEdges = new Int32Array(h + 1);
  for (let y = 0; y <= h; y++) rowEdges[y] = ry + Math.round((y * sh) / h);

  let o = 0;
  for (let y = 0; y < h; y++) {
    const sy0 = rowEdges[y];
    const sy1 = Math.max(sy0 + 1, rowEdges[y + 1]);
    for (let x = 0; x < w; x++) {
      const sx0 = colEdges[x];
      const sx1 = Math.max(sx0 + 1, colEdges[x + 1]);

      let ar = 0;
      let ag = 0;
      let ab = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowOff = sy * rasterW;
        for (let sx = sx0; sx < sx1; sx++) {
          const m = plateMask[rowOff + sx] & keep;
          ar += tableR[m];
          ag += tableG[m];
          ab += tableB[m];
          count++;
        }
      }
      const inv = 1 / count;
      let r = ar * inv;
      let g = ag * inv;
      let b = ab * inv;
      if (yn) {
        r = Math.pow(r, yn);
        g = Math.pow(g, yn);
        b = Math.pow(b, yn);
      }
      px[o] = encodeSrgb(r);
      px[o + 1] = encodeSrgb(g);
      px[o + 2] = encodeSrgb(b);
      px[o + 3] = 255;
      o += 4;
    }
  }

  return out;
}

/**
 * One plate as a binary bitmap, for separation and SVG export.
 *
 * `true` means ink. Nothing here re-screens: the plate is already exactly what
 * the press would burn, so the export reads the same bits the viewport painted.
 */
export function extractPlateBits(frame: PrintFrame, plateIndex: number): Uint8Array {
  const total = frame.width * frame.height;
  const bit = 1 << plateIndex;
  const out = new Uint8Array(total);
  const mask = frame.plateMask;
  for (let i = 0; i < total; i++) out[i] = mask[i] & bit ? 1 : 0;
  return out;
}

/**
 * Derived LPI, for the UI to show beside a resolution-free ruling.
 *
 * `ruling` is cells across the image width because that is what survives a grid
 * change, a crop and a tier switch. A printer still thinks in lines per inch, so
 * both have to be visible — this is the translation, and it needs the physical
 * width the export will actually have.
 */
export function rulingToLpi(ruling: number, exportWidthPx: number, dpi = 300): number {
  const inches = exportWidthPx / Math.max(1, dpi);
  return inches > 0 ? Math.round(ruling / inches) : 0;
}

export function lpiToRuling(lpi: number, exportWidthPx: number, dpi = 300): number {
  const inches = exportWidthPx / Math.max(1, dpi);
  return Math.max(1, Math.round(lpi * inches));
}
