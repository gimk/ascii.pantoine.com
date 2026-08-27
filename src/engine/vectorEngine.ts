/**
 * Vector Modulation Engine — beam deflection (`vectorEngine.ts`)
 *
 * Rutt-Etra scan processing and oscilloscope carrier modulation, as continuous
 * polylines rather than dithered cells.
 *
 * This is the second half of a fork in the render pipeline. Steps 1-3 of
 * `processRasterFrame` (channel mix, spatial filters, tone) run exactly as they
 * do for ASCII and pixel output; instead of quantizing the result to the grid,
 * vector mode hands the graded `lumBuffer` to `traceVectorField` and gets back
 * geometry. See vector-pipeline.md for why the effect cannot be a member of the
 * dither family: a dither writes `dest[i]` from `src[i]` and has nowhere to
 * return a line.
 *
 * The grid stops being a display raster here and becomes a *sampling* raster —
 * `cols x rows` is the resolution the beam reads luminance at, and the
 * coordinate space the polylines live in. Nothing downstream of this file
 * quantizes to it.
 */

import { VectorConfig, VectorFrame, VectorPolyline } from '../types/ascii';

/**
 * Resolves the stroke colour for one scan line.
 *
 * Deliberately narrow: the tracer is handed a function, not a colour config, so
 * it never learns about palettes, ramps or tonal mapping. `buildVectorColorResolver`
 * in rasterEngine owns that translation, which is what keeps this file a pure
 * geometry pass.
 *
 * `meanLum` is the average luminance the line actually sampled, so a ramp or a
 * palette picks a colour from where the line sits in the image rather than from
 * its index — a line crossing the highlight reads as a highlight.
 */
export type VectorColorResolver = (lineIndex: number, meanLum: number) => string;

/**
 * Fallback blanking level for a config written before the control existed.
 * Matches the studio's hardcoded cutoff.
 */
const DEFAULT_BLANKING = 0.02;

/**
 * Above this luminance the carrier never gates, so highlights stay a solid
 * line and only the shadows break into pulses. Different per axis in the
 * studio and kept that way: the horizontal relief needs a slightly earlier
 * hand-off or the ridge lines read as dotted rather than drawn.
 */
const CARRIER_SOLID_ABOVE_VERTICAL = 0.7;
const CARRIER_SOLID_ABOVE_HORIZONTAL = 0.65;

/**
 * Accumulates points for one beam pass and cuts a new polyline at every break.
 *
 * The studio strokes each sample individually (`beginPath`/`stroke` inside the
 * sample loop, roughly 24,000 calls a frame) and carries an `isDrawingSegment`
 * flag that never does anything, because the segment start is reassigned on
 * every iteration regardless. Accumulating removes both problems: a run of
 * samples is one polyline, and a break is the only thing that ends it.
 */
class BeamAccumulator {
  private points: number[] = [];
  private lumSum = 0;
  private lumCount = 0;
  /**
   * Whether a break has already discarded or terminated real content on this
   * line. A *leading* blank does not count — a line that starts below the
   * silhouette and then runs solid is still one continuous run, and refusing to
   * fill it would lose occlusion on exactly the lines that need it most.
   */
  private brokeWithContent = false;
  private emitted = 0;

  constructor(
    private readonly out: VectorPolyline[],
    private readonly lineIndex: number,
    private readonly resolveColor: VectorColorResolver,
    private readonly width: number,
    private readonly canFill: boolean,
    private readonly tint: (hex: string) => string
  ) {}

  push(x: number, y: number, lum: number): void {
    this.points.push(x, y);
    this.lumSum += lum;
    this.lumCount++;
  }

  /** End the current run. Runs shorter than a segment are dropped, not drawn. */
  break_(): void {
    if (this.points.length >= 4) {
      this.emit();
      this.brokeWithContent = true;
    } else if (this.points.length > 0) {
      this.points.length = 0;
      this.lumSum = 0;
      this.lumCount = 0;
      this.brokeWithContent = true;
    }
  }

  finish(): void {
    if (this.points.length >= 4) this.emit();
  }

  private emit(): void {
    const meanLum = this.lumCount > 0 ? this.lumSum / this.lumCount : 0;
    /*
     * Occlusion on the first unbroken run only. The studio gates fill on the
     * carrier being off entirely, which throws occlusion away the moment
     * anything is dashed; gating on the run keeps a partly-dashed frame
     * occluding wherever the beam did stay continuous, and restricting it to
     * the first run stops a dotted line stamping a fill under every dash.
     */
    const filled = this.canFill && !this.brokeWithContent && this.emitted === 0;
    this.out.push({
      points: Float32Array.from(this.points),
      color: this.tint(this.resolveColor(this.lineIndex, meanLum)),
      width: this.width,
      filled: filled ? true : undefined,
    });
    this.emitted++;
    this.points.length = 0;
    this.lumSum = 0;
    this.lumCount = 0;
  }
}

/** Local, so this file never imports rasterEngine and creates a cycle. */
function hexToRgbTriple(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return [255, 255, 255];
}

/**
 * Channel-split tint for one chromatic-aberration pass.
 *
 * A genuine RGB split rather than the studio's fixed red/green/blue strokes:
 * each pass keeps only its own channel of the resolved colour, so the three
 * offset copies recombine to the original wherever they overlap and fringe into
 * pure channels wherever they do not. That works for any palette, where hard
 * red/green/blue would discard the colour selection entirely.
 */
function channelSplit(hex: string, channel: 0 | 1 | 2): string {
  const [r, g, b] = hexToRgbTriple(hex);
  const kept = channel === 0 ? [r, 0, 0] : channel === 1 ? [0, g, 0] : [0, 0, b];
  return `rgb(${kept[0]},${kept[1]},${kept[2]})`;
}

/**
 * Trace the deflected beam over a graded luminance field.
 *
 * `lum` is `processRasterFrame`'s working buffer as it leaves step 3: fully
 * graded, in `[0, 1]`, with `-1` marking a transparent cell. The sentinel is
 * load-bearing here too — a beam drawn straight through a cut-out silhouette is
 * the failure this catches, and the studio has no equivalent because it has no
 * transparency.
 */
export function traceVectorField(
  lum: Float32Array,
  cols: number,
  rows: number,
  config: VectorConfig,
  resolveColor: VectorColorResolver,
  bgColor: string,
  glowColor: string
): VectorFrame {
  const polylines: VectorPolyline[] = [];
  const frame: VectorFrame = {
    width: cols,
    height: rows,
    polylines,
    bgColor,
    glow: Math.max(0, config.glow),
    glowColor,
    additive: config.chroma > 0,
  };

  if (cols <= 0 || rows <= 0 || lum.length < cols * rows) return frame;

  const isVertical = config.direction === 'vertical';
  const lineCount = Math.max(1, Math.round(config.lineCount));
  const step = Math.max(1, Math.round(config.sampleStep));
  const amp = config.amplitude;
  const bias = config.bias;
  const blanking = config.blanking ?? DEFAULT_BLANKING;
  const carrierOn = config.carrierEnabled;
  const freq = config.carrierFreq;
  const threshold = config.carrierThreshold;
  const pwm = config.pwm;
  const rippleAmp = config.rippleAmp;
  const rippleFreq = config.rippleFreq;
  const phase = config.phase;
  const strokeWidth = config.strokeWidth;

  /*
   * Occlusion is a painter's fill, so both the draw order and the edge the
   * polygon closes to are direction-dependent.
   *
   * The rule that makes it read as relief: **a line's fill must extend in the
   * direction of increasing draw order, and its bright deflection must go the
   * other way.** Then a line that peaks hard reaches back over the lines
   * already drawn behind it, and its fill hides them — while the lines still to
   * come are painted afterwards and stay visible.
   *
   * For a horizontal relief that is the familiar arrangement: draw top to
   * bottom, close down to the bottom edge, bright peaks upward. A vertical beam
   * deflects sideways with bright going *right*, so the same rule requires the
   * mirror image — draw right to left, close to the left edge. Closing a
   * vertical beam downward (which is what a single hardcoded edge gives you)
   * fills a meaningless wedge under each line.
   *
   * Draw order is invisible when occlusion is off: strokes do not overlap
   * destructively, and the additive aberration passes are order-independent.
   */
  const canFill = config.occlusion;

  /*
   * Which side the stack faces. Derived, never a control — but only the
   * vertical beam follows the deflection.
   *
   * **Horizontal keeps its near side at the bottom whatever the amplitude
   * does.** Geometrically a downward ridge is solid above its curve, so the
   * "correct" near side is the top; perceptually that is wrong, because lower
   * in the frame reads as nearer whichever way the ridges point. Flipping the
   * stack upward on a negative amplitude looks like the frame being eaten from
   * above rather than like an inverted relief. Occlusion does lose a little
   * bite, since a downward ridge dips away from a fill that also runs
   * downward — measured 43.6% of the beam hidden against 52.8% for a positive
   * amplitude — but it keeps working, and reading right beats measuring best.
   *
   * **Vertical does follow it**, because neither side of the frame is the
   * ground and there is no convention to violate. Negating the amplitude
   * mirrors the image cleanly, near side and all.
   */
  const invert = isVertical && amp < 0;
  if (canFill) {
    frame.fillEdge = isVertical
      ? { axis: 'x', value: invert ? cols : 0 }
      : { axis: 'y', value: invert ? 0 : rows };
  }

  /*
   * ...and the draw order flips with it, because a painter's fill only reads as
   * depth when the lines go far to near.
   *
   * The two halves are one decision, not two settings. Measured on a 20-line
   * stripe field where the ridges genuinely cross, flipping only one of the pair
   * destroys the frame either way — 480 and 240 surviving cells out of 4349 —
   * because every fill then sweeps away from the near side and across the entire
   * image instead of stopping at the ridge in front.
   *
   * Vertical is reversed relative to horizontal to begin with (its near side is
   * the left, so far-to-near counts down), hence the XOR rather than a plain
   * flag.
   */
  const farToNear = isVertical !== invert;

  /* Sampling along the line; the axis the beam travels. */
  const travelExtent = isVertical ? rows : cols;
  /* Placement across the image; the axis the lines are spaced on. */
  const placeExtent = isVertical ? cols : rows;
  const spacing = placeExtent / (lineCount + 1);

  const carrierSolidAbove = isVertical
    ? CARRIER_SOLID_ABOVE_VERTICAL
    : CARRIER_SOLID_ABOVE_HORIZONTAL;
  /* The studio's ripple falls off faster along a vertical beam than a horizontal one. */
  const rippleLumFalloff = isVertical ? 0.5 : 0.4;

  /*
   * Chromatic aberration is three passes at a constant offset across the
   * placement axis, composited additively by the painter. Luminance is sampled
   * at the *un*offset position in every pass, so the three copies differ by a
   * pure shift — which is what makes it read as a lens artefact rather than
   * three unrelated traces.
   */
  const chroma = Math.max(0, config.chroma);
  const passOffsets = chroma > 0 ? [-chroma, 0, chroma] : [0];

  const sampleLum = (px: number, py: number): number => {
    const ix = px < 0 ? 0 : px > cols - 1 ? cols - 1 : Math.floor(px);
    const iy = py < 0 ? 0 : py > rows - 1 ? rows - 1 : Math.floor(py);
    return lum[iy * cols + ix];
  };

  for (let pass = 0; pass < passOffsets.length; pass++) {
    const passOffset = passOffsets[pass];
    /*
     * With aberration on, the fill is skipped entirely: three offset ground
     * polygons would each cover the passes already stroked beneath them, and
     * under additive compositing an opaque ground is meaningless anyway.
     */
    const tint =
      passOffsets.length === 1
        ? (hex: string) => hex
        : (hex: string) => channelSplit(hex, pass as 0 | 1 | 2);

    /*
     * `n` walks the draw order, `i` stays the geometric index — the ripple
     * phase is keyed to `i`, so renumbering the lines would reshuffle the noise
     * every time the stack was flipped.
     */
    for (let n = 1; n <= lineCount; n++) {
      const i = farToNear ? lineCount + 1 - n : n;
      const base = i * spacing;
      const beam = new BeamAccumulator(
        polylines,
        i - 1,
        resolveColor,
        strokeWidth,
        canFill && passOffsets.length === 1,
        tint
      );

      for (let t = 0; t <= travelExtent; t += step) {
        const sampleX = isVertical ? base : t;
        const sampleY = isVertical ? t : base;
        const v = sampleLum(sampleX, sampleY);

        /*
         * Transparency always cuts the beam: a line drawn straight through a
         * cut-out silhouette is the artefact this catches, and the studio has
         * no equivalent because it has no transparency.
         */
        if (v < 0) {
          beam.break_();
          continue;
        }

        /*
         * Blanking: the beam is off below this luminance.
         *
         * Its own control, not a side effect of the carrier. The studio gates
         * blanking on `carrierOn`, which collapses the space of looks to two —
         * baselines drawn flat across the entire background, or a frame
         * dissolved into dots — with nothing in between. Separating them makes
         * the useful third look reachable: raise the cutoff, leave the carrier
         * off, and the background clears while the lit subject stays a
         * continuous line.
         *
         * At 0 the beam is never blanked, which is what a relief wants: Unknown
         * Pleasures is precisely a dead-flat line that lifts only where the
         * image is bright, and cutting it leaves ridges floating over nothing.
         */
        /*
         * `blanking > 0` guards the comparison rather than relying on `v <= 0`
         * being false: a pure black ground is *exactly* 0, so an unguarded
         * `<=` cuts the baseline at a cutoff of zero and the control never
         * reaches its own documented off position.
         */
        if (blanking > 0 && v <= blanking) {
          beam.break_();
          continue;
        }

        /*
         * Deflection. `bias` is the luminance that deflects to zero on both
         * axes; only the direction differs, with horizontal pushing up so
         * bright reads as a *peak* rather than a trough. That asymmetry is what
         * makes the Rutt-Etra terrain read as relief.
         *
         * The studio writes the horizontal case as `-(lum - (1 - bias))`, which
         * makes the same slider mean opposite things on the two axes — 0 is
         * unidirectional vertically and 1 is unidirectional horizontally, with
         * only the midpoint agreeing. Kept consistent here instead; the default
         * bias of 0.5 renders identically either way.
         */
        const deflect = isVertical ? (v - bias) * amp : -(v - bias) * amp;

        /*
         * Analog ripple, scaled by inverse luminance: heavy in the shadows,
         * clean in the highlights. This is most of what reads as "analog" —
         * a constant-amplitude ripple looks like a filter, not a beam.
         */
        const ripple =
          rippleAmp > 0
            ? Math.sin(t * rippleFreq * 0.1 + phase + i * (isVertical ? 1 : 0.5)) *
              rippleAmp *
              (1 - v * rippleLumFalloff)
            : 0;

        /*
         * Carrier gate — the Joy Division dot break. The duty cycle opens with
         * luminance via `pwm`, so the beam dissolves into discrete pulses in
         * the dark and closes into a solid line in the light.
         */
        if (carrierOn && v < carrierSolidAbove) {
          const carrier = (Math.sin(t * freq + phase) + 1) * 0.5;
          const dynamicThreshold = Math.max(0.01, 1 - v * pwm);
          if (carrier < dynamicThreshold * (1 - threshold)) {
            beam.break_();
            continue;
          }
        }

        const place = base + deflect + ripple + passOffset;
        if (isVertical) {
          beam.push(place, t, v);
        } else {
          beam.push(t, place, v);
        }
      }

      beam.finish();
    }
  }

  return frame;
}

/** Where an occlusion polygon closes to; `y`/`rows` for a relief, `x`/`0` for a beam. */
type FillEdge = NonNullable<VectorFrame['fillEdge']>;

/** Fallback for a frame traced before `fillEdge` existed. */
const LEGACY_FILL_EDGE = (frame: VectorFrame): FillEdge =>
  frame.fillEdge ?? { axis: 'y', value: frame.height };

/**
 * The two legs that turn an open run into a closed occlusion polygon: drop both
 * ends onto the edge, in the axis the edge is measured on.
 */
function closeToEdge(ctx: CanvasRenderingContext2D, pts: Float32Array, edge: FillEdge): void {
  const lastX = pts[pts.length - 2];
  const lastY = pts[pts.length - 1];
  if (edge.axis === 'y') {
    ctx.lineTo(lastX, edge.value);
    ctx.lineTo(pts[0], edge.value);
  } else {
    ctx.lineTo(edge.value, lastY);
    ctx.lineTo(edge.value, pts[1]);
  }
  ctx.closePath();
}

/**
 * Retune a config for a grid `divisor` times smaller, so a draft preview traces
 * the *same picture* at a coarser sampling rate.
 *
 * Necessary because almost every beam parameter is expressed in grid cells, and
 * the draft-preview pass changes the grid underneath them. Left alone, a
 * preview at divisor 3 deflects by 65 cells out of 266 instead of 65 out of 800
 * — three times the amplitude, three times the stroke weight, a third of the
 * carrier cycles. The preview would not be a rougher version of the render, it
 * would be a different render, which is worse than a slow one.
 *
 * Lengths shrink with the grid; frequencies are radians *per cell* and so grow.
 * Everything else (line count, bias, PWM, threshold, phase, glow) is either
 * dimensionless or applied after the geometry is scaled back up, and must not
 * move. Pairs with `scaleVectorFrame`, which undoes the geometric half.
 */
export function previewVectorConfig(config: VectorConfig, divisor: number): VectorConfig {
  if (divisor <= 1) return config;
  return {
    ...config,
    amplitude: config.amplitude / divisor,
    rippleAmp: config.rippleAmp / divisor,
    strokeWidth: config.strokeWidth / divisor,
    chroma: config.chroma / divisor,
    carrierFreq: config.carrierFreq * divisor,
    rippleFreq: config.rippleFreq * divisor,
    sampleStep: Math.max(1, config.sampleStep / divisor),
  };
}

/**
 * Rescale a traced frame into a different grid space.
 *
 * The draft-preview pass traces a fraction of the grid, and the viewport lays
 * out from its own `cols`/`rows` props — so a preview frame carrying its own
 * smaller `width`/`height` would paint at a different physical size and the
 * image would jump on every drag. The cell modes solve this by expanding the
 * text and colour buffers (`framePreview.ts`); geometry solves it by
 * multiplying, which is exact rather than a nearest-neighbour blow-up.
 *
 * Stroke width scales with the geometry so a preview reads at the same weight.
 */
export function scaleVectorFrame(frame: VectorFrame, width: number, height: number): VectorFrame {
  if (frame.width === width && frame.height === height) return frame;
  const kx = width / Math.max(1, frame.width);
  const ky = height / Math.max(1, frame.height);
  const k = (kx + ky) * 0.5;
  return {
    ...frame,
    width,
    height,
    /* The occlusion edge is a coordinate, so it moves with the geometry. */
    fillEdge: frame.fillEdge
      ? { axis: frame.fillEdge.axis, value: frame.fillEdge.value * (frame.fillEdge.axis === 'x' ? kx : ky) }
      : undefined,
    polylines: frame.polylines.map((line) => {
      const pts = new Float32Array(line.points.length);
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] = line.points[i] * kx;
        pts[i + 1] = line.points[i + 1] * ky;
      }
      return { ...line, points: pts, width: line.width * k };
    }),
  };
}

/**
 * Paint a traced frame into a 2D context.
 *
 * Shared by the viewport, the still exporters and the animation exporters, so
 * there is one definition of what the beam looks like. The caller sets up the
 * transform; this function works in the frame's own grid space and never reads
 * a zoom or a device pixel ratio.
 *
 * `strokeScale` divides the stroke width. It defaults to 1, so a stroke grows
 * with whatever scale the context carries — the same behaviour a vector
 * document has, and what keeps the viewport agreeing with an export at that
 * scale. Pass the context scale to hold lines at a constant on-screen weight
 * instead.
 *
 * `glowScale` multiplies the shadow radius, because canvas measures
 * `shadowBlur` in device pixels and ignores the transform. Without it the halo
 * would stay a fixed size while the beam under it grew.
 */
export function paintVectorFrame(
  ctx: CanvasRenderingContext2D,
  frame: VectorFrame,
  options: { strokeScale?: number; glowScale?: number } = {}
): void {
  const strokeScale = options.strokeScale && options.strokeScale > 0 ? options.strokeScale : 1;
  const glowScale = options.glowScale && options.glowScale > 0 ? options.glowScale : 1;
  const edge = LEGACY_FILL_EDGE(frame);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (frame.glow > 0) {
    ctx.shadowBlur = frame.glow * glowScale;
    ctx.shadowColor = frame.glowColor;
  }

  /*
   * Additive compositing is what makes the three aberration passes recombine
   * where they coincide instead of the last one covering the others. Carried on
   * the frame rather than passed by the caller, so every painter agrees.
   */
  if (frame.additive) {
    ctx.globalCompositeOperation = 'lighter';
  }

  for (const line of frame.polylines) {
    const pts = line.points;
    if (pts.length < 4) continue;

    /*
     * Occlusion: close the run to the far edge and fill with the ground, so a
     * nearer ridge hides what is behind it. Painted per polyline rather than as
     * a depth pass because the emission order already runs far to near.
     *
     * **This must be its own path.** Closing the run and then stroking the same
     * path draws the two closing legs and the edge run in the beam colour --
     * which reads as a hard vertical line dropping off each end of every ridge,
     * appearing the moment occlusion is switched on. The SVG exporter always
     * emitted a separate <polygon>; the canvas painter did not.
     */
    if (line.filled) {
      const savedOp = ctx.globalCompositeOperation;
      const savedShadow = ctx.shadowBlur;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
      closeToEdge(ctx, pts, edge);
      ctx.fillStyle = frame.bgColor;
      ctx.fill();
      ctx.shadowBlur = savedShadow;
      ctx.globalCompositeOperation = savedOp;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let p = 2; p < pts.length; p += 2) {
      ctx.lineTo(pts[p], pts[p + 1]);
    }
    ctx.strokeStyle = line.color;
    ctx.lineWidth = Math.max(0.05, line.width / strokeScale);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Serialize a traced frame as SVG.
 *
 * One `<polyline>` per run, which is already the native form — the cell
 * pipeline's `exportPixelRasterToSvg` must never be used here. It merges cells
 * into rectangles and would emit squares where the beam belongs, the same class
 * of mistake `buildAsciiPlateSvg` exists to correct for ASCII plates.
 *
 * Coordinates are rounded to 2dp: at export scales the third decimal is far
 * below a device pixel and it is a third of the file size.
 */
export function vectorFrameToSvg(
  frame: VectorFrame,
  options: { scale?: number; background?: string | null; groupId?: string } = {}
): string {
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const edge = LEGACY_FILL_EDGE(frame);
  const w = Math.round(frame.width * scale);
  const h = Math.round(frame.height * scale);

  const parts: string[] = [];
  const isGroup = Boolean(options.groupId);

  if (!isGroup) {
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    );
    const bg = options.background === undefined ? frame.bgColor : options.background;
    if (bg) parts.push(`<rect width="${w}" height="${h}" fill="${bg}"/>`);
  } else {
    parts.push(`<g id="${options.groupId}">`);
  }

  parts.push(
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="scale(${scale} ${scale})">`
  );

  const fmt = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  };

  for (const line of frame.polylines) {
    const pts = line.points;
    if (pts.length < 4) continue;

    const coords: string[] = [];
    for (let p = 0; p < pts.length; p += 2) {
      coords.push(`${fmt(pts[p])},${fmt(pts[p + 1])}`);
    }

    if (line.filled) {
      /*
       * The occlusion shape is a separate node from the stroke: the same path
       * cannot both fill with the ground and stroke with the beam colour, and
       * splitting them keeps the stroke a true open polyline for a plotter.
       */
      const closed =
        edge.axis === 'y'
          ? [
              ...coords,
              `${fmt(pts[pts.length - 2])},${fmt(edge.value)}`,
              `${fmt(pts[0])},${fmt(edge.value)}`,
            ]
          : [
              ...coords,
              `${fmt(edge.value)},${fmt(pts[pts.length - 1])}`,
              `${fmt(edge.value)},${fmt(pts[1])}`,
            ];
      parts.push(`<polygon points="${closed.join(' ')}" fill="${frame.bgColor}" stroke="none"/>`);
    }

    parts.push(
      `<polyline points="${coords.join(' ')}" stroke="${line.color}" stroke-width="${fmt(line.width)}"/>`
    );
  }

  parts.push(`</g>`);
  parts.push(isGroup ? `</g>` : `</svg>`);
  return parts.join('\n');
}
