/**
 * Auto resolution: one solver for every mode.
 *
 * The grid it picks is two independent decisions, and keeping them separate is
 * what makes the same function correct in synth, media and model at once:
 *
 *   SHAPE — the aspect the grid should have. Comes from the *content* wherever
 *     the content has an aspect of its own (a photo, a video, a crop), and only
 *     falls back to the viewfinder for the procedural sources that will fill
 *     whatever shape they are given. The old solver used the viewfinder in
 *     every mode, which is why auto-res on a photo produced borders and had to
 *     be quarantined out of media.
 *
 *   SCALE — how many cells. The smallest of four ceilings, each of which is the
 *     honest answer to a different question:
 *
 *       perceptual   what can actually be seen on this display
 *       source       what the content actually contains
 *       aesthetic    what still looks like this output mode
 *       performance  what this machine can render in the time available
 *
 *     A single tuned constant (which is what this replaced) is whichever of the
 *     four happened to bind on the machine it was tuned on, frozen.
 *
 * Nothing here touches the DOM or React. Measurement comes in as numbers and a
 * grid goes out, so the whole thing is inspectable from a test.
 */

import { MONOSPACE_CELL_ASPECT } from './renderer';
import { MAX_GRID_COLS } from './mediaPresets';
import type { RasterOutputMode } from '../types/ascii';

/* ========================================================================
   Inputs
   ======================================================================== */

/**
 * What is being rasterized, which decides both where the shape comes from and
 * whether the frame budget is a framerate or a latency.
 */
export type AutoResContentKind = 'synth' | 'model' | 'image' | 'video';

export interface AutoResViewport {
  /** Viewfinder size in CSS pixels. */
  width: number;
  height: number;
  /** devicePixelRatio. Legibility is a CSS-pixel question, sharpness a device one. */
  dpr: number;
}

export interface AutoResContent {
  kind: AutoResContentKind;
  /** Natural size of the source, in pixels. Media only; absent means unbounded. */
  sourceWidth?: number;
  sourceHeight?: number;
  /**
   * The crop rectangle's normalized size, if one is applied.
   *
   * Cropping *gains* detail rather than losing it — the whole grid is spent on
   * what the rectangle keeps — so both the shape and the source ceiling have to
   * be taken against the crop, not the original frame.
   */
  cropW?: number;
  cropH?: number;
}

/**
 * What the pipeline costs, over and above cell count.
 *
 * Only used to seed the prior. Once real frames have been measured the
 * measurement already contains all of this, and these are ignored.
 */
export interface AutoResCost {
  /** Error diffusion is serial and cannot be vectorised the way ordered can. */
  serialDither: boolean;
  /** A colour buffer is a second full-size allocation and a second write. */
  color: boolean;
  /** The composite stage scales with cells. */
  postProcess: boolean;
  /**
   * Per-frame work that is *not* proportional to the grid — particle counts,
   * triangle counts. 0 is a bare scene; 1 roughly doubles the frame cost.
   */
  sceneComplexity: number;
}

export interface AutoResInput {
  viewport: AutoResViewport;
  output: RasterOutputMode;
  content: AutoResContent;
  /** Re-rasterized every frame (synth, model, video, playing timeline). */
  animated: boolean;
  /** optimizeConfig.targetFps. 0 means uncapped, which is treated as 60. */
  targetFps: number;
  /** Measured ms per cell for the live pipeline, or null before enough frames. */
  measuredMsPerCell: number | null;
  /**
   * Frames per second actually being achieved, or null when the reading would
   * be meaningless — a paused loop, a hidden tab, a static image, or the idle
   * throttle deliberately running slow. Only the settled safe zone reads this,
   * and only to notice a collapse.
   */
  measuredFps: number | null;
  cost: AutoResCost;
  /** navigator.hardwareConcurrency, for the pre-measurement prior. */
  cores: number;
  /** The grid in force, so a new solve can be damped against it. Null on first solve. */
  current?: { cols: number; rows: number } | null;
}

/**
 * The half of the input the viewport cannot see for itself.
 *
 * The viewport owns the measurements that are about the screen — its own size,
 * the device pixel ratio, which output mode is live. Everything about *what is
 * being rendered and what it costs* lives in App, so it is handed over as one
 * object read at solve time rather than plumbed through as a dozen props that
 * would each re-render the viewport when they changed.
 */
export type AutoResSignals = Pick<
  AutoResInput,
  'content' | 'animated' | 'targetFps' | 'measuredMsPerCell' | 'measuredFps' | 'cost' | 'cores'
> & {
  /**
   * Identity of the active pipeline, from costProbeKey. The controller latches
   * on it: a measurement only describes the work that produced it, so a new
   * pipeline is a new question rather than a reason to keep hunting.
   */
  pipelineKey: string;
};

/** Which ceiling bound the answer — worth surfacing, since it explains the number. */
export type AutoResLimit = 'perceptual' | 'source' | 'aesthetic' | 'performance';

export interface AutoResResult {
  cols: number;
  rows: number;
  cells: number;
  limitedBy: AutoResLimit;
}

/* ========================================================================
   Tuning
   ======================================================================== */

/**
 * Smallest a cell may be drawn, and the units differ on purpose.
 *
 * A glyph has to be read by a person, so its floor is physical size — CSS
 * pixels, identical on a retina panel and a cheap one. A pixel-mode or vector
 * cell has to be *resolved by the display*, so its floor is device pixels and a
 * retina panel legitimately earns twice the grid. Measuring both in CSS pixels
 * (which the old solver did) systematically under-resolves pixel mode on every
 * high-DPI screen.
 */
const MIN_ASCII_CELL_AREA_CSS = 95;
const MIN_PIXEL_CELL_DEVICE_PX = 2;
const MIN_VECTOR_CELL_DEVICE_PX = 1;

/**
 * Source pixels a single cell should cover, below which the grid is inventing
 * detail the source does not have. A glyph is an average over a patch and wants
 * a real one; a pixel-mode cell maps 1:1 at the ceiling, which is exactly what
 * the DPI panel calls Native 1:1 / 100 DPI.
 */
const MIN_SRC_PX_PER_CELL: Record<RasterOutputMode, number> = {
  ascii: 4,
  pixel: 1,
  vector: 1,
};

/** Bounds that keep each output mode looking like itself, whatever the numbers say. */
const SHAPE_BOUNDS: Record<
  RasterOutputMode,
  { minCols: number; minRows: number; maxCols: number; maxCells: number }
> = {
  /*
   * 220 columns is already a wall of text. The old ceiling was 180 with a hard
   * 7500-cell clamp on top; the clamp is what made a 4K viewfinder render at
   * the same coarseness as a laptop, and it is the perceptual ceiling's job
   * now — this only stops the grid becoming unreadable on an enormous display.
   */
  ascii: { minCols: 36, minRows: 18, maxCols: 220, maxCells: 22000 },
  /* Shared with the manual DPI paths, which clamp to the same width. */
  pixel: { minCols: 32, minRows: 24, maxCols: MAX_GRID_COLS, maxCells: 1200000 },
  /*
   * The grid is the beam's sampling lattice here, not a display raster, and a
   * coarse one makes a deflected line visibly faceted. Only the first pipeline
   * steps run over it, so the cells are much cheaper than they look.
   */
  vector: { minCols: 96, minRows: 64, maxCols: 1600, maxCells: 500000 },
};

/**
 * Share of a frame the rasterizer may spend. The rest is input handling,
 * layout and paint — take it all and the grid holds its framerate while the
 * interface stops answering.
 */
const FRAME_UTILISATION = 0.55;

/**
 * Latency budget for a still image, in place of a frame budget.
 *
 * This is the single biggest correction to the old behaviour. A still renders
 * once and then sits there, so the question is how long you will wait for it —
 * not how many of them fit in a 60th of a second. At 60fps the frame budget is
 * ~9ms, so a still legitimately gets more than an order of magnitude more cells
 * than an animation on the same machine. One shared constant could never
 * express that, and the old solver's was tuned for the animated case.
 *
 * Set well above a frame deliberately. The static path already renders a coarse
 * draft during a gesture and only pays this once the controls settle, so a
 * quarter second buys a lot of detail without anything feeling slow.
 */
const STATIC_BUDGET_MS = 220;

/** Prior cost per cell, before any frame has been measured. */
const BASE_MS_PER_CELL: Record<RasterOutputMode, number> = {
  ascii: 0.0012,
  pixel: 0.00035,
  vector: 0.00005,
};

/** Cores the priors above were written against. */
const REFERENCE_CORES = 8;

/*
 * There is deliberately no step limit on how far one solve may move the grid.
 *
 * An earlier version capped it, on the theory that an extrapolated performance
 * ceiling could overshoot wildly. It can — but a step limit is the wrong
 * defence, because it turns one correction into a series of them, and every
 * one of those is a visible re-render. Two things make the cap unnecessary:
 * the performance ceiling can only ever pull the grid *below* the other three,
 * which are exact and bounded; and the controller below allows exactly one
 * correction before latching, so a partial step would simply leave the grid
 * wrong with nothing left to fix it.
 */

/** Relative change in cell count below which a new solve is not worth applying. */
const HYSTERESIS = 0.08;

/* ========================================================================
   Cost probe — the closed half of the loop
   ======================================================================== */

export interface RenderCostProbe {
  /** Record one completed rasterization. */
  record: (cells: number, ms: number) => void;
  /** Blended ms per cell, or null until the estimate is worth trusting. */
  msPerCell: () => number | null;
  /**
   * Drop the estimate. Call when the pipeline's identity changes — a different
   * dither, a different output mode, colour switching on — because the old
   * average then describes work that is no longer being done, and trusting it
   * lets the solver overshoot in exactly the direction that hurts.
   */
  reset: () => void;
}

const PROBE_ALPHA = 0.2;
const PROBE_MIN_SAMPLES = 4;
/** Discard a sample this far off the running estimate: it is a GC pause, not a cost. */
const PROBE_OUTLIER_FACTOR = 5;

export function createRenderCostProbe(): RenderCostProbe {
  let ewma = 0;
  let samples = 0;

  return {
    record(cells: number, ms: number) {
      if (!(cells > 0) || !(ms > 0)) return;
      const perCell = ms / cells;
      if (samples > 0 && perCell > ewma * PROBE_OUTLIER_FACTOR) return;
      ewma = samples === 0 ? perCell : ewma + PROBE_ALPHA * (perCell - ewma);
      samples++;
    },
    msPerCell() {
      return samples >= PROBE_MIN_SAMPLES && ewma > 0 ? ewma : null;
    },
    reset() {
      ewma = 0;
      samples = 0;
    },
  };
}

/**
 * Identity of the work being measured. Two renders sharing this string cost
 * roughly the same per cell; when it changes, the probe's average is stale.
 */
export function costProbeKey(
  output: RasterOutputMode,
  kind: AutoResContentKind,
  cost: AutoResCost
): string {
  return [
    output,
    kind,
    cost.serialDither ? 'd1' : 'd0',
    cost.color ? 'c1' : 'c0',
    cost.postProcess ? 'p1' : 'p0',
  ].join(':');
}

/* ========================================================================
   Solver
   ======================================================================== */

/**
 * Hold a grid inside its mode's floor and ceiling, preserving aspect where the
 * clamp allows it.
 *
 * Shared by the solver and the controller's safety net, and the net is why it
 * exists separately: that path shrinks a grid by a factor without going through
 * the solver at all, so without this it would happily shrink straight past the
 * mode's minimum and keep going, one strike at a time, until the raster was a
 * few cells across.
 */
function clampToBounds(cols: number, rows: number, output: RasterOutputMode): { cols: number; rows: number } {
  const bounds = SHAPE_BOUNDS[output];
  let c = Math.round(cols);
  let r = Math.round(rows);

  /* Width first, carrying height with it, so a clamped grid keeps its shape. */
  if (c > bounds.maxCols) {
    r = Math.round(r * (bounds.maxCols / c));
    c = bounds.maxCols;
  }
  return { cols: Math.max(bounds.minCols, c), rows: Math.max(bounds.minRows, r) };
}

/** Grid cell width / height, in screen pixels. Glyphs are tall; everything else is square. */
export function cellAspectFor(output: RasterOutputMode): number {
  return output === 'ascii' ? MONOSPACE_CELL_ASPECT : 1.0;
}

/**
 * Cost per cell to plan against: measured if the probe has settled, otherwise a
 * prior assembled from the output mode, the machine and the active stages.
 *
 * The prior only has to land in the right order of magnitude — it governs the
 * first second or so, and is then replaced by the real thing.
 */
function estimateMsPerCell(input: AutoResInput): number {
  if (input.measuredMsPerCell && input.measuredMsPerCell > 0) return input.measuredMsPerCell;

  const cores = input.cores > 0 ? input.cores : REFERENCE_CORES;
  const deviceFactor = Math.max(0.6, Math.min(2.5, REFERENCE_CORES / cores));

  const { serialDither, color, postProcess, sceneComplexity } = input.cost;
  const pipelineFactor =
    (serialDither ? 1.6 : 1) *
    (color ? 1.25 : 1) *
    (postProcess ? 1.2 : 1) *
    (1 + Math.max(0, Math.min(2, sceneComplexity)));

  return BASE_MS_PER_CELL[input.output] * deviceFactor * pipelineFactor;
}

/**
 * The aspect the grid should be shaped to, in rendered pixels.
 *
 * Media answers with its own aspect because the renderer *fits* the source into
 * the grid: a grid of any other shape letterboxes, and the borders are dead
 * cells paid for at full price. Synth and model have no intrinsic aspect and
 * are happy to fill the viewfinder.
 */
function contentAspect(input: AutoResInput): number {
  const { content, viewport } = input;
  const viewportAspect = viewport.width / viewport.height;

  if (content.kind !== 'image' && content.kind !== 'video') return viewportAspect;

  const w = (content.sourceWidth || 0) * (content.cropW ?? 1);
  const h = (content.sourceHeight || 0) * (content.cropH ?? 1);
  if (!(w > 0) || !(h > 0)) return viewportAspect;
  return w / h;
}

/** Cells the display can actually resolve. See MIN_*_CELL for why the units differ. */
function perceptualCeiling(input: AutoResInput): number {
  const { viewport, output } = input;
  const pad = 20;
  const cssW = Math.max(80, viewport.width - pad);
  const cssH = Math.max(60, viewport.height - pad);

  if (output === 'ascii') return (cssW * cssH) / MIN_ASCII_CELL_AREA_CSS;

  const dpr = viewport.dpr > 0 ? viewport.dpr : 1;
  const min = output === 'vector' ? MIN_VECTOR_CELL_DEVICE_PX : MIN_PIXEL_CELL_DEVICE_PX;
  return (cssW * dpr * cssH * dpr) / (min * min);
}

/** Cells the content actually contains. Procedural sources have no such limit. */
function sourceCeiling(input: AutoResInput): number {
  const { content, output } = input;
  if (content.kind !== 'image' && content.kind !== 'video') return Infinity;

  const w = (content.sourceWidth || 0) * (content.cropW ?? 1);
  const h = (content.sourceHeight || 0) * (content.cropH ?? 1);
  if (!(w > 0) || !(h > 0)) return Infinity;

  return (w * h) / MIN_SRC_PX_PER_CELL[output];
}

/** Cells this machine can render in the time available. */
function performanceCeiling(input: AutoResInput): number {
  const msPerCell = estimateMsPerCell(input);
  if (!(msPerCell > 0)) return Infinity;

  if (!input.animated) return STATIC_BUDGET_MS / msPerCell;

  const fps = input.targetFps > 0 ? input.targetFps : 60;
  return ((1000 / fps) * FRAME_UTILISATION) / msPerCell;
}

/**
 * Solve for a grid.
 *
 * Deliberately excludes the live zoom. Auto-res re-fits the view after every
 * change it makes, so feeding the resulting scale back in closes a loop with
 * itself: raise the grid, re-fit, read the new scale, raise again. The
 * viewfinder size is the stable measure of how much screen the raster has.
 */
export function resolveAutoResolution(input: AutoResInput): AutoResResult {
  const output = input.output;
  const bounds = SHAPE_BOUNDS[output];
  const aspect = contentAspect(input);
  const cellAspect = cellAspectFor(output);

  const ceilings: Array<{ limit: AutoResLimit; cells: number }> = [
    { limit: 'perceptual', cells: perceptualCeiling(input) },
    { limit: 'source', cells: sourceCeiling(input) },
    { limit: 'aesthetic', cells: bounds.maxCells },
    { limit: 'performance', cells: performanceCeiling(input) },
  ];

  let binding = ceilings[0];
  for (const c of ceilings) if (c.cells < binding.cells) binding = c;

  const targetCells = binding.cells;

  /*
   * Shape and scale meet here: the rendered raster is cols*cellWidth wide and
   * rows*cellHeight tall, so holding (cols/rows) * cellAspect === aspect is
   * what makes the picture come out undistorted and borderless.
   */
  let cols = Math.sqrt(Math.max(1, targetCells) * (aspect / cellAspect));
  let rows = cols > 0 ? Math.max(1, targetCells) / cols : 1;

  cols = Math.round(cols);
  rows = Math.round(rows);

  /* Even columns: several dither kernels and the export tiling assume pairs. */
  if (output === 'ascii' && cols % 2 !== 0) cols += 1;

  const bounded = clampToBounds(cols, rows, output);
  return { ...bounded, cells: bounded.cols * bounded.rows, limitedBy: binding.limit };
}

/* ========================================================================
   Controller — when to solve at all
   ======================================================================== */

/**
 * Auto-resolution as an event-driven latch, not a running optimiser.
 *
 * The solver above answers "what grid?". This answers "should the grid change
 * right now?", and the honest answer is almost always no. A solver that re-runs
 * on a timer keeps proposing new grids, and every accepted proposal re-renders
 * the raster in front of the user — so a loop that is merely *converging* still
 * looks like the picture is glitching, and one that cannot converge glitches
 * forever.
 *
 * Two things make convergence unreliable enough to matter:
 *
 *   - Cost is not proportional to cells. Vector is the clear case: the beam
 *     cost is lineCount x cols/sampleStep, so it scales with the *width* while
 *     the ceiling divides a budget by a per-*cell* figure. Extrapolating from a
 *     measurement then overshoots, the next measurement disagrees, and the two
 *     chase each other — which is exactly the synth/vector case that never
 *     settled.
 *   - Measuring changes what is measured. Every applied grid changes the cost
 *     of the frame that produces the next measurement, so the loop is a
 *     feedback system that was never given a controller.
 *
 * So: solve on the events that can actually change the answer, allow exactly
 * one correction once real frames have been measured, then latch. After that
 * the only thing that may move the grid is a sustained, badly missed frame
 * budget — and that ratchets *down* only, remembering the cell count that
 * failed so it can never climb back into the same hole. A hunt needs somewhere
 * to hunt to; this leaves it nowhere.
 */
export interface AutoResController {
  /**
   * The grid to apply now, or null to leave it alone. Call as often as you
   * like — it is cheap, and answering "no change" is the common case.
   */
  next: (input: AutoResInput & { pipelineKey: string; now: number }) => { cols: number; rows: number } | null;
}

/** How long to gather frames at a freshly applied grid before correcting it. */
const MEASURE_WINDOW_MS = 1200;

/*
 * The safe zone.
 *
 * Once a grid is settled it is left alone unless the framerate has collapsed —
 * not merely missed. Missing a 60fps target is the normal condition for a heavy
 * scene and is not worth re-rendering the picture over; the earlier "35% over
 * budget" trigger treated it as an emergency, and on a model in vector mode
 * that never reaches 60 it ground the grid from 566x324 down to the floor in
 * twelve steps over fourteen seconds of continuous resizing.
 *
 * Two things stop that. The trigger is now a collapse — half the target, and
 * never above 30fps, so a 60fps target only reacts below 30 — and the whole
 * latch is allowed a hard maximum of two corrections. If two have not fixed it,
 * the grid is not what is wrong and shrinking further only costs detail.
 *
 * Judged on measured frames per second rather than on rasterizer cost per cell.
 * Cost-per-cell is an extrapolation and it is badly wrong for vector, where the
 * beam scales with the *width* rather than the cell count — shrinking cells by
 * a quarter there buys a mere eighth off the frame, which is precisely how a
 * feedback loop keeps deciding it needs to shrink again. Frames per second is
 * the thing actually being protected, and it needs no model to be right.
 */
const COLLAPSE_FPS_RATIO = 0.5;
const COLLAPSE_FPS_CEILING = 30;

/** Consecutive collapsed observations before the safety net fires. */
const OVER_BUDGET_STRIKES = 3;

/** Corrections allowed per latch, ever. */
const MAX_CORRECTIONS = 2;

/**
 * How much a correction takes off, in cells.
 *
 * Larger than it was, and deliberately: with only two corrections available
 * each one has to be worth making. A timid step that has to be repeated is the
 * behaviour this whole section exists to prevent.
 */
const SHRINK_FACTOR = 0.6;

/**
 * Anything that could legitimately change the answer. Deliberately does *not*
 * include the measured cost — that is what the measure phase is for, and
 * folding it in here would re-arm the latch on every frame and reinstate the
 * hunt this exists to stop. The viewport is bucketed so that sub-pixel resize
 * noise and scrollbar jitter do not count as events.
 */
function latchSignature(input: AutoResInput & { pipelineKey: string }): string {
  const c = input.content;
  const bucket = (n: number) => Math.round(n / 16);
  return [
    bucket(input.viewport.width),
    bucket(input.viewport.height),
    input.viewport.dpr,
    input.output,
    input.pipelineKey,
    input.animated ? 'a' : 's',
    input.targetFps,
    Math.round(c.sourceWidth || 0),
    Math.round(c.sourceHeight || 0),
    ((c.cropW ?? 1) * 1000).toFixed(0),
    ((c.cropH ?? 1) * 1000).toFixed(0),
  ].join('|');
}

export function createAutoResController(): AutoResController {
  let signature = '';
  let phase: 'solve' | 'measure' | 'settled' = 'solve';
  let measureUntil = 0;
  let strikes = 0;
  /** Corrections spent on the current latch. Capped at MAX_CORRECTIONS. */
  let corrections = 0;
  /*
   * Smallest cell count observed to blow the budget, per pipeline. The single
   * piece of state that makes the loop terminate: without it the safety net
   * shrinks, the next solve sees a cheaper frame and grows straight back, and
   * the pair oscillate indefinitely.
   */
  let failedAtCells = Infinity;
  let failedFor = '';

  return {
    next(input) {
      const sig = latchSignature(input);

      if (sig !== signature) {
        signature = sig;
        phase = 'solve';
        strikes = 0;
        corrections = 0;
        /*
         * The learned ceiling is in cells and survives a pure resize — the
         * cost of a cell did not change because the window did. It is only
         * void when the work itself changes.
         */
        if (failedFor !== input.pipelineKey) {
          failedAtCells = Infinity;
          failedFor = input.pipelineKey;
        }
      }

      const capped = (r: AutoResResult): { cols: number; rows: number } => {
        if (r.cells < failedAtCells) return { cols: r.cols, rows: r.rows };
        /* Re-solve against the learned ceiling rather than returning a grid known to fail. */
        const scale = Math.sqrt((failedAtCells * SHRINK_FACTOR) / r.cells);
        return clampToBounds(r.cols * scale, r.rows * scale, input.output);
      };

      if (phase === 'solve') {
        phase = 'measure';
        measureUntil = input.now + MEASURE_WINDOW_MS;
        return capped(resolveAutoResolution(input));
      }

      if (phase === 'measure') {
        if (input.now < measureUntil) return null;
        phase = 'settled';
        /*
         * The one correction. By now real frames have been timed at the grid
         * actually in force, so this replaces the prior with a measurement —
         * and then stops, whether or not it was right.
         */
        return capped(resolveAutoResolution(input));
      }

      /*
       * Settled — the safe zone. Only a collapsed framerate moves the grid now,
       * only downwards, and only twice. Nothing here can ever propose a larger
       * grid, which is what guarantees the picture stops changing.
       */
      if (!input.animated || !input.current) return null;
      if (corrections >= MAX_CORRECTIONS) return null;

      /*
       * Null when the reading would not mean anything — a paused loop, a
       * hidden tab, or the idle throttle deliberately running at 12fps. Acting
       * on any of those would shrink the grid for a slowdown nobody asked to
       * be rescued from.
       */
      const measuredFps = input.measuredFps;
      if (measuredFps == null || measuredFps <= 0) return null;

      const target = input.targetFps > 0 ? input.targetFps : 60;
      const collapseBelow = Math.min(COLLAPSE_FPS_CEILING, target * COLLAPSE_FPS_RATIO);

      if (measuredFps >= collapseBelow) {
        strikes = 0;
        return null;
      }

      strikes++;
      if (strikes < OVER_BUDGET_STRIKES) return null;
      strikes = 0;

      const cells = input.current.cols * input.current.rows;

      const scale = Math.sqrt(SHRINK_FACTOR);
      const shrunk = clampToBounds(input.current.cols * scale, input.current.rows * scale, input.output);

      failedAtCells = Math.min(failedAtCells, cells);
      failedFor = input.pipelineKey;

      /*
       * Already as small as this mode goes. Shrinking further would take the
       * raster below the size that still reads as this output mode, and the
       * framerate would still be on the floor — the grid is not the problem at
       * that point, the target framerate is. Spend the correction budget
       * anyway so this stops being reconsidered every few seconds.
       */
      if (shrunk.cols >= input.current.cols && shrunk.rows >= input.current.rows) {
        corrections = MAX_CORRECTIONS;
        return null;
      }

      corrections++;
      return shrunk;
    },
  };
}

/**
 * Whether a fresh solve is worth applying over the grid already in force.
 *
 * Without this the loop rewrites the grid on every resize tick and every
 * wobble in the cost measurement, and a re-render is not free — the raster
 * visibly re-resolves each time. A few percent is noise; only a real change
 * in the answer should cost a re-render.
 */
export function shouldReplaceGrid(
  current: { cols: number; rows: number } | null | undefined,
  next: { cols: number; rows: number }
): boolean {
  if (!current || current.cols <= 0 || current.rows <= 0) return true;
  if (current.cols === next.cols && current.rows === next.rows) return false;

  const currentCells = current.cols * current.rows;
  const nextCells = next.cols * next.rows;
  if (Math.abs(nextCells - currentCells) / currentCells > HYSTERESIS) return true;

  /*
   * A grid can hold its cell count while changing shape — rotating a photo, or
   * dragging the viewfinder from landscape to portrait. That is exactly the
   * case the cell-count test above cannot see, and the one where leaving the
   * old grid in place puts borders back.
   */
  const currentAspect = current.cols / current.rows;
  const nextAspect = next.cols / next.rows;
  return Math.abs(nextAspect - currentAspect) / currentAspect > 0.02;
}
