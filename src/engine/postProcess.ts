import {
  BlendMode,
  PostProcessConfig,
  POST_PROCESS_DEFAULTS,
  SOURCE_OVERLAY_DEFAULTS,
  VectorConfig,
} from '../types/ascii';

/**
 * The composite stage: everything that happens to a frame once the raster
 * pipeline has finished with it.
 *
 * This is *not* part of `processRasterFrame` and must not become part of it.
 * The pipeline's job ends at a cell buffer or a polyline set; post-processing
 * works on the painted result, which is why one implementation can serve
 * ASCII, pixel and vector without knowing which it is looking at.
 *
 * Every consumer goes through `composePostProcess`. With no active stage it
 * calls the caller's own painter directly against the real context and
 * allocates nothing, so the four paint sites pay exactly what they paid before
 * the section existed.
 */

/** How much of a stage's slider counts as "off". */
const EPSILON = 0.001;

/**
 * One step of the chain.
 *
 * `composite` brings an extra layer in with a blend mode; `paint` filters the
 * frame that has been composed so far. Those two shapes cover every effect
 * this section is meant to hold — an overlay, a texture, a gradient map are
 * all the first; bloom, aberration, vignette, grain are all the second — and
 * having both defined now is what stops the second effect from re-plumbing
 * the viewport, the still exporter, the GIF exporter and the video exporter a
 * second time.
 */
export type PostStage =
  | {
      kind: 'composite';
      layer: CanvasImageSource | null;
      blend: BlendMode;
      /** 0..1. */
      opacity: number;
      placement: 'under' | 'over';
      blur?: number;
    }
  | {
      kind: 'paint';
      /** Receives the composed frame as a layer and returns what replaces it. */
      apply: (layer: HTMLCanvasElement, scale: number) => HTMLCanvasElement;
    };

/*
 * Scratch canvases, reused across frames.
 *
 * Five, because that is how many are genuinely live at once: the raster layer,
 * the layer a `paint` stage is writing into, the two buffers aberration splits
 * through, and the graded-source layer. Allocating per frame showed up as GC
 * sawtooth on a 60fps beam.
 */
const scratch: Array<HTMLCanvasElement | null> = [null, null, null, null, null];

function getScratch(slot: number, width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let c = scratch[slot];
  if (!c) {
    c = document.createElement('canvas');
    scratch[slot] = c;
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else {
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
    }
  }
  return c;
}

/**
 * Does this browser honour `ctx.filter`?
 *
 * Safari only shipped it in 16.4, and a silent no-op there would mean the glow
 * stage added an unblurred copy of the frame on top of itself — a hard-edged
 * double image, far worse than no glow. Probed once and cached.
 */
let canvasFilterSupport: boolean | null = null;
export function supportsCanvasFilter(): boolean {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return (canvasFilterSupport = false);
    probe.filter = 'blur(1px)';
    canvasFilterSupport = probe.filter === 'blur(1px)';
  } catch {
    canvasFilterSupport = false;
  }
  return canvasFilterSupport;
}

// --- Config helpers -------------------------------------------------------

export function resolvePostProcess(cfg?: PostProcessConfig | null): PostProcessConfig {
  if (!cfg) return POST_PROCESS_DEFAULTS;
  return {
    sourceOverlay: { ...SOURCE_OVERLAY_DEFAULTS, ...cfg.sourceOverlay },
    glow: { ...POST_PROCESS_DEFAULTS.glow, ...cfg.glow },
    aberration: { ...POST_PROCESS_DEFAULTS.aberration, ...cfg.aberration },
  };
}

export function overlayActive(cfg?: PostProcessConfig | null): boolean {
  const o = resolvePostProcess(cfg).sourceOverlay;
  return o.enabled && o.opacity > EPSILON;
}

export function glowActive(cfg?: PostProcessConfig | null): boolean {
  const g = resolvePostProcess(cfg).glow;
  return g.amount > EPSILON && g.radius > EPSILON;
}

export function aberrationActive(cfg?: PostProcessConfig | null): boolean {
  return resolvePostProcess(cfg).aberration.amount > EPSILON;
}

/** Any stage at all — the fast-path test every paint site asks first. */
export function postProcessActive(cfg?: PostProcessConfig | null): boolean {
  return overlayActive(cfg) || glowActive(cfg) || aberrationActive(cfg);
}

/**
 * `shadowBlur = b` spreads like a Gaussian of sigma b/2; `filter: blur(r)`
 * takes the sigma directly. Without this a migrated preset would bloom twice
 * as wide as it used to.
 */
export const LEGACY_SHADOW_TO_SIGMA = 0.5;

/**
 * Fold a pre-2.3 `vectorConfig.glow` into the post-processing glow.
 *
 * Existing links, presets and persisted settings carry the halo as a beam
 * parameter. The value was a canvas `shadowBlur`, which is roughly twice the
 * Gaussian sigma the blur filter takes, so it is halved on the way across and
 * the picture comes back the same.
 */
export function migratePostProcess(
  cfg: PostProcessConfig | undefined,
  vectorConfig?: VectorConfig | null
): PostProcessConfig {
  const resolved = resolvePostProcess(cfg);
  const legacy = vectorConfig?.glow;
  if (cfg?.glow || !legacy || legacy <= 0) return resolved;
  return {
    ...resolved,
    glow: { amount: 100, radius: legacy * LEGACY_SHADOW_TO_SIGMA, tint: '' },
  };
}

// --- Stages ---------------------------------------------------------------

/**
 * Additive bloom.
 *
 * Blurs the emissive layer once and adds it back under the sharp one. "Under"
 * matters in vector: the occlusion polygons in the sharp layer are opaque
 * ground, so a near ridge covers the halo of the ridge behind it exactly as it
 * covered the beam — which is what the old per-stroke shadow did by accident
 * of draw order, and what a halo composited on top would lose.
 */
export function makeGlowStage(
  radius: number,
  amount: number,
  tint: string
): PostStage {
  return {
    kind: 'paint',
    apply: (layer, scale) => {
      const w = layer.width;
      const h = layer.height;
      const out = getScratch(1, w, h);
      const ctx = out?.getContext('2d');
      if (!out || !ctx) return layer;

      const sigma = Math.max(0.1, radius * scale);
      ctx.save();
      ctx.filter = `blur(${sigma}px)`;
      ctx.globalAlpha = Math.min(1, amount / 100);
      ctx.drawImage(layer, 0, 0);
      ctx.restore();

      /*
       * Tinting the halo means recolouring the blurred copy while keeping its
       * alpha, which is `source-in` against a flood of the tint. Skipped when
       * the tint is empty so the bloom simply carries the frame's own colours,
       * which is what a phosphor actually does when the beam is already tinted.
       */
      if (tint) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Sharp layer last, so opaque occlusion fills clip the halo behind them.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(layer, 0, 0);
      ctx.restore();

      return out;
    },
  };
}

/**
 * RGB channel split.
 *
 * Each channel is isolated by multiplying the layer with a pure primary, then
 * the three are recombined with `lighter` at their own offsets — so where they
 * coincide they sum back to the original colour and where they do not they
 * fringe into primaries. Same principle as the beam's geometric aberration,
 * applied to pixels because the cell modes have no geometry to offset.
 */
export function makeAberrationStage(amount: number, angle: number): PostStage {
  return {
    kind: 'paint',
    apply: (layer, scale) => {
      const w = layer.width;
      const h = layer.height;
      const out = getScratch(2, w, h);
      const mask = getScratch(3, w, h);
      const ctx = out?.getContext('2d');
      const mctx = mask?.getContext('2d');
      if (!out || !ctx || !mask || !mctx) return layer;

      const rad = (angle * Math.PI) / 180;
      const dx = Math.cos(rad) * amount * scale;
      const dy = Math.sin(rad) * amount * scale;
      const channels: Array<[string, number, number]> = [
        ['#ff0000', -dx, -dy],
        ['#00ff00', 0, 0],
        ['#0000ff', dx, dy],
      ];

      ctx.globalCompositeOperation = 'lighter';
      for (const [primary, ox, oy] of channels) {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.clearRect(0, 0, w, h);
        mctx.drawImage(layer, 0, 0);
        mctx.save();
        /*
         * `multiply` zeroes the other two channels but leaves alpha alone,
         * which is what keeps a transparent ASCII background transparent
         * through all three passes instead of turning it into black fringes.
         */
        mctx.globalCompositeOperation = 'multiply';
        mctx.fillStyle = primary;
        mctx.fillRect(0, 0, w, h);
        mctx.restore();
        ctx.drawImage(mask, ox, oy);
      }
      ctx.globalCompositeOperation = 'source-over';
      return out;
    },
  };
}

/** Every active stage for a config, in application order. */
export function buildStages(
  cfg: PostProcessConfig | undefined,
  sourceLayer: CanvasImageSource | null
): PostStage[] {
  const resolved = resolvePostProcess(cfg);
  const stages: PostStage[] = [];

  if (overlayActive(resolved) && sourceLayer) {
    stages.push({
      kind: 'composite',
      layer: sourceLayer,
      blend: resolved.sourceOverlay.blend,
      opacity: Math.min(1, resolved.sourceOverlay.opacity / 100),
      placement: resolved.sourceOverlay.placement,
      blur: resolved.sourceOverlay.blur ?? 0,
    });
  }

  /*
   * Glow before aberration, and the order is physical rather than arbitrary:
   * the phosphor blooms at the tube, the lens splits what the tube emitted.
   * Reversed, you get three separately-bloomed channel copies, which reads as
   * a rendering mistake rather than as an optic.
   */
  if (glowActive(resolved) && supportsCanvasFilter()) {
    stages.push(makeGlowStage(resolved.glow.radius, resolved.glow.amount, resolved.glow.tint));
  }
  if (aberrationActive(resolved)) {
    stages.push(makeAberrationStage(resolved.aberration.amount, resolved.aberration.angle));
  }

  return stages;
}

/**
 * The graded luminance field as a greyscale layer — the picture the dither
 * quantized, one step before it was quantized.
 *
 * Rasterized at `cols x rows` and left there: unlike the raw source, this
 * *has* no detail beyond the grid, so supersampling it would only interpolate
 * values the pipeline never computed. The composite stretches it to the frame,
 * which is the honest representation of what it is.
 *
 * `lum[i] < 0` is the transparent sentinel (invariant 1) and stays transparent
 * here, so a cut-out silhouette does not come back as a black rectangle.
 */
export function gradedSourceCanvas(
  luminance: Float32Array | null,
  cols: number,
  rows: number
): HTMLCanvasElement | null {
  if (!luminance || cols <= 0 || rows <= 0) return null;
  if (luminance.length < cols * rows) return null;
  const canvas = getScratch(4, cols, rows);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;

  const img = ctx.createImageData(cols, rows);
  const data = img.data;
  for (let i = 0; i < cols * rows; i++) {
    const l = luminance[i];
    const o = i * 4;
    if (l < 0) {
      data[o + 3] = 0;
      continue;
    }
    const v = l <= 0 ? 0 : l >= 1 ? 255 : Math.round(l * 255);
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- The chain ------------------------------------------------------------

export interface ComposeOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  stages: PostStage[];
  /**
   * Painted first, beneath everything. Lifted out of `paintRaster` on purpose:
   * with an `under` overlay, a ground filled inside the raster layer sits on
   * top of the source and hides it completely.
   */
  bgColor?: string | null;
  /**
   * Richer ground than a flat fill — the exporters paint the CRT ambient glow
   * and scanlines into it. Wins over `bgColor` when given, and it belongs down
   * here for the same reason: anything opaque left in the raster layer hides an
   * `under` overlay.
   */
  paintBase?: (target: CanvasRenderingContext2D) => void;
  /** Paints the raster itself, onto a transparent surface. */
  paintRaster: (target: CanvasRenderingContext2D) => void;
  /**
   * Output pixels per frame unit, so a stage measured in pixels grows with an
   * export scale or a viewport zoom the way the picture does.
   */
  scale?: number;
}

/**
 * Run the raster paint and the post chain into `ctx`.
 *
 * Layer-at-a-time, never primitive-at-a-time. Setting a composite operation
 * and then painting glyphs or polylines blends each primitive against
 * everything already drawn, which for overlapping vector occlusion fills is
 * visibly wrong; it also disagrees with the CSS stacking-context semantics the
 * viewport gets for free. So the raster goes to its own transparent surface
 * and arrives as a single `drawImage`.
 */
export function composePostProcess(options: ComposeOptions): void {
  const { ctx, width, height, stages, bgColor, paintBase, paintRaster, scale = 1 } = options;

  const ground = (target: CanvasRenderingContext2D) => {
    if (paintBase) {
      paintBase(target);
      return;
    }
    if (bgColor && bgColor !== 'transparent') {
      target.save();
      target.fillStyle = bgColor;
      target.fillRect(0, 0, width, height);
      target.restore();
    }
  };

  const rasterLayer = stages.length > 0 ? getScratch(0, width, height) : null;
  const rasterCtx = rasterLayer?.getContext('2d') || null;

  // Nothing to compose, or no canvas to compose on: paint straight through.
  if (!rasterLayer || !rasterCtx) {
    ground(ctx);
    paintRaster(ctx);
    return;
  }

  paintRaster(rasterCtx);

  /*
   * `paint` stages run on the raster alone, before anything is composited
   * with it. A bloom is emitted by the artwork, not by the photograph behind
   * it, and aberration on the combined frame would split the source overlay
   * too -- which reads as a misregistered print rather than as an optic.
   */
  let layer: HTMLCanvasElement = rasterLayer;
  for (const stage of stages) {
    if (stage.kind === 'paint') layer = stage.apply(layer, scale);
  }

  const under = stages.filter(
    (s): s is Extract<PostStage, { kind: 'composite' }> =>
      s.kind === 'composite' && s.placement === 'under' && s.layer !== null
  );
  const over = stages.filter(
    (s): s is Extract<PostStage, { kind: 'composite' }> =>
      s.kind === 'composite' && s.placement === 'over' && s.layer !== null
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ground(ctx);

  for (const stage of under) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = stage.opacity;
    if (stage.blur && stage.blur > 0 && supportsCanvasFilter()) {
      ctx.filter = `blur(${stage.blur * scale}px)`;
    } else {
      ctx.filter = 'none';
    }
    ctx.drawImage(stage.layer as CanvasImageSource, 0, 0, width, height);
    ctx.filter = 'none';
  }

  /*
   * An `under` stage puts its blend on the *raster*, which is the layer coming
   * down on top of it. That is what makes under and over two different
   * pictures rather than one picture with the z-order swapped.
   */
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = under.length ? blendToCanvasOp(under[under.length - 1].blend) : 'source-over';
  ctx.drawImage(layer, 0, 0, width, height);

  for (const stage of over) {
    ctx.globalCompositeOperation = blendToCanvasOp(stage.blend);
    ctx.globalAlpha = stage.opacity;
    if (stage.blur && stage.blur > 0 && supportsCanvasFilter()) {
      ctx.filter = `blur(${stage.blur * scale}px)`;
    } else {
      ctx.filter = 'none';
    }
    ctx.drawImage(stage.layer as CanvasImageSource, 0, 0, width, height);
    ctx.filter = 'none';
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/**
 * `normal` is Porter-Duff `source-over`; every other name in `BlendMode` is
 * already a valid `globalCompositeOperation`.
 */
export function blendToCanvasOp(blend: BlendMode): GlobalCompositeOperation {
  return blend === 'normal' ? 'source-over' : (blend as GlobalCompositeOperation);
}

// --- SVG ------------------------------------------------------------------

/**
 * SVG filter primitives for the paint stages, so a vector export carries its
 * optics instead of losing them.
 *
 * It lost them until now: `vectorFrameToSvg` never emitted anything for the
 * beam's `shadowBlur`, so the halo visible in the viewport and in a PNG simply
 * was not in the SVG. Returns the `<filter>` markup and the id to reference,
 * or null when no paint stage is active.
 */
export function postProcessSvgFilter(
  cfg: PostProcessConfig | undefined,
  scale: number,
  idPrefix = 'pp'
): { id: string; markup: string } | null {
  if (!postProcessActive(cfg)) return null;

  const resolved = resolvePostProcess(cfg);
  const id = `${idPrefix}-filter`;
  const parts: string[] = [];

  parts.push(
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">`
  );

  /*
   * Glow is a blur added back with `feBlend mode="screen"` or `feMerge`.
   */
  if (glowActive(resolved)) {
    const stdDev = (resolved.glow.radius * scale).toFixed(2);
    parts.push(`<feGaussianBlur stdDeviation="${stdDev}" result="ppGlow"/>`);
    if (resolved.glow.tint) {
      parts.push(
        `<feColorMatrix type="matrix" in="ppGlow" result="ppGlowTinted" values="` +
          `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>`
      );
    }
    parts.push(`<feMerge>`);
    parts.push(`  <feMergeNode in="${resolved.glow.tint ? 'ppGlowTinted' : 'ppGlow'}"/>`);
    parts.push(`  <feMergeNode in="SourceGraphic"/>`);
    parts.push(`</feMerge>`);
  }

  /*
   * Aberration splits the R/G/B channels and shifts them.
   */
  if (aberrationActive(resolved)) {
    const rad = (resolved.aberration.angle * Math.PI) / 180;
    const dx = (Math.cos(rad) * resolved.aberration.amount * scale).toFixed(2);
    const dy = (Math.sin(rad) * resolved.aberration.amount * scale).toFixed(2);

    const chan = (result: string, matrix: string, ox: string, oy: string) => {
      parts.push(`<feColorMatrix type="matrix" values="${matrix}" result="${result}C"/>`);
      parts.push(`<feOffset in="${result}C" dx="${ox}" dy="${oy}" result="${result}"/>`);
    };

    chan('ppR', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', (-parseFloat(dx)).toFixed(2), (-parseFloat(dy)).toFixed(2));
    chan('ppG', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0', '0');
    chan('ppB', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', dx, dy);
    parts.push(`<feBlend in="ppR" in2="ppG" mode="screen" result="ppRG"/>`);
    parts.push(`<feBlend in="ppRG" in2="ppB" mode="screen"/>`);
  }

  parts.push(`</filter>`);
  return { id, markup: parts.join('\n') };
}

/** `<image>` markup for a source overlay in an SVG export. */
export function sourceOverlaySvg(
  cfg: PostProcessConfig | undefined,
  dataUrl: string,
  width: number,
  height: number
): string {
  const o = resolvePostProcess(cfg).sourceOverlay;
  const filter = o.blur && o.blur > 0 ? `;filter:blur(${o.blur}px)` : '';
  const style = `mix-blend-mode:${o.blend};opacity:${(o.opacity / 100).toFixed(3)}${filter}`;
  return `<image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" style="${style}"/>`;
}
