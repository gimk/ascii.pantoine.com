import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop as CropIcon, Maximize, X } from 'lucide-react';
import { CropRect, CROP_FULL, CROP_MIN_SPAN, MediaConfig, ResamplingMode } from '../types/ascii';
import { computeMediaFraming, drawFramedMedia, measureMedia } from '../engine/mediaRenderer';

/**
 * The crop marquee: a drag-a-rectangle stage laid over the raster.
 *
 * ## Why it paints the source rather than the raster
 *
 * A crop that is already applied cannot be widened again from a cropped
 * picture — everything you would want to bring back is off screen. So crop
 * mode paints its own stage: the media, framed **uncropped**, with the region
 * outside the rectangle dimmed. You adjust against the whole photograph and
 * commit once, which is what every crop tool does and the only version of this
 * that can undo its own narrowing.
 *
 * It also means the render pipeline is untouched. The alternative — telling the
 * pipeline to ignore the crop while the marquee is open — would have put a
 * second, transient media config through the four paint sites and the exporters
 * (invariant 4), for a picture the user is about to cover with this stage
 * anyway.
 *
 * ## Why the geometry comes from the engine
 *
 * `computeMediaFraming` is the renderer's own framing maths, and both the
 * backdrop below and the marquee above are built from one call to it. The
 * backdrop is literally `drawFramedMedia`. So the rectangle you drag sits on
 * the source exactly where the rasterizer will read it, at any fit, scale, pan,
 * rotation or flip, with no alignment parameter and nothing here to drift.
 *
 * Rotation is the reason the marquee is a `<polygon>` and not a `<rect>`: the
 * crop is a rectangle *of the source*, so on screen it is that rectangle under
 * the framing transform — a rotated quad, with its handles rotated too. Fudging
 * it to a screen-aligned box would crop a different region than the one drawn.
 */

interface CropOverlayProps {
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig: MediaConfig;
  cols: number;
  rows: number;
  /** Display px per grid column / row, zoom included. */
  pxPerCol: number;
  pxPerRow: number;
  /** The pipeline's own resampling, so the backdrop is sampled as the raster was. */
  resampling: ResamplingMode;
  /** 0.6015 for the glyph grid, 1 for pixel and vector. Invariant 7. */
  cellAspect: number;
  /** The draft being edited — never `mediaConfig.crop` itself. */
  crop: CropRect;
  onChange: (crop: CropRect) => void;
  onCommit: (crop: CropRect) => void;
  onApply: () => void;
  onCancel: () => void;
}

/** Corner and edge grips, as the edges each one moves. */
type Grip = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

const GRIPS: Array<{ id: Grip; u: number; v: number; cursor: string }> = [
  { id: 'nw', u: 0, v: 0, cursor: 'nwse-resize' },
  { id: 'n', u: 0.5, v: 0, cursor: 'ns-resize' },
  { id: 'ne', u: 1, v: 0, cursor: 'nesw-resize' },
  { id: 'e', u: 1, v: 0.5, cursor: 'ew-resize' },
  { id: 'se', u: 1, v: 1, cursor: 'nwse-resize' },
  { id: 's', u: 0.5, v: 1, cursor: 'ns-resize' },
  { id: 'sw', u: 0, v: 1, cursor: 'nesw-resize' },
  { id: 'w', u: 0, v: 0.5, cursor: 'ew-resize' },
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The one-click aspect presets, as source-pixel width:height.
 *
 * `null` means the source's own aspect, which is not a constant — it is
 * resolved against the loaded picture at the point of use. Everything else
 * here is fixed.
 *
 * Landscape and portrait are listed as separate entries rather than as one
 * entry plus an orientation toggle: the rectangle can be turned by hand at any
 * time, so a toggle would be a second piece of state saying something the crop
 * already says, and a flat row is one click to any of them.
 */
const CROP_RATIOS: Array<{ label: string; ratio: number | null }> = [
  { label: 'ORIGINAL', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
];


/**
 * Re-cut the rectangle to a source-pixel aspect ratio.
 *
 * Two coordinate systems meet here: the crop is stored in fractions of the
 * source, but "16:9" is a statement about pixels, so the target is scaled by
 * the source's own aspect before it means anything. On a 3:2 photograph a 1:1
 * crop is w = 2/3 of the width against the full height, not a square in
 * fractions.
 *
 * The area is preserved rather than the width or the height, so switching
 * between presets keeps roughly the framing already chosen instead of growing
 * or shrinking with each click; the clamp then scales both axes by one factor,
 * because scaling them independently would silently give back a different
 * ratio than the button says. The centre is kept and only pushed inward if the
 * new rectangle would hang off an edge.
 */
function applyRatio(
  crop: CropRect,
  ratio: number,
  srcWidth: number,
  srcHeight: number
): CropRect {
  const r = ratio * (srcHeight / Math.max(1, srcWidth));
  if (!Number.isFinite(r) || r <= 0) return crop;

  const area = Math.max(CROP_MIN_SPAN * CROP_MIN_SPAN, crop.w * crop.h);
  let w = Math.sqrt(area * r);
  let h = Math.sqrt(area / r);

  /* One shared factor: the whole point of the button is the exact ratio. */
  const fit = Math.min(1, 1 / w, 1 / h);
  w *= fit;
  h *= fit;

  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  return {
    x: Math.max(0, Math.min(1 - w, cx - w / 2)),
    y: Math.max(0, Math.min(1 - h, cy - h / 2)),
    w,
    h,
  };
}

/**
 * Move one or two edges and rebuild the rect.
 *
 * Edges rather than a corner plus a size, because that is what a grip actually
 * does: the opposite edge must not move, and expressing it as x/w means every
 * grip on the left or top has to compensate for the width change by hand. The
 * min-span clamp then pushes against the *dragged* edge, so a rectangle
 * squeezed to nothing stops instead of flipping inside out.
 */
function applyGrip(start: CropRect, grip: Grip, du: number, dv: number): CropRect {
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;

  if (grip === 'move') {
    // A move never resizes: clamp the translation, not the edges.
    const tu = Math.max(-x0, Math.min(1 - x1, du));
    const tv = Math.max(-y0, Math.min(1 - y1, dv));
    return { x: x0 + tu, y: y0 + tv, w: start.w, h: start.h };
  }

  if (grip.includes('w')) x0 = Math.min(x1 - CROP_MIN_SPAN, clamp01(x0 + du));
  if (grip.includes('e')) x1 = Math.max(x0 + CROP_MIN_SPAN, clamp01(x1 + du));
  if (grip.includes('n')) y0 = Math.min(y1 - CROP_MIN_SPAN, clamp01(y0 + dv));
  if (grip.includes('s')) y1 = Math.max(y0 + CROP_MIN_SPAN, clamp01(y1 + dv));

  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The point a ratio-locked resize pivots around, per grip.
 *
 * The corners pin the opposite corner, which is what a corner drag means. The
 * edge grips pin their opposite edge on the axis they move, and stay
 * `center` on the other one: an edge handle only states one dimension, and
 * growing the other from a corner would slide the rectangle sideways as you
 * dragged straight up.
 */
const RATIO_ANCHOR: Record<
  Exclude<Grip, 'move'>,
  { x: 'left' | 'right' | 'center'; y: 'top' | 'bottom' | 'center' }
> = {
  nw: { x: 'right', y: 'bottom' },
  n: { x: 'center', y: 'bottom' },
  ne: { x: 'left', y: 'bottom' },
  e: { x: 'left', y: 'center' },
  se: { x: 'left', y: 'top' },
  s: { x: 'center', y: 'top' },
  sw: { x: 'right', y: 'top' },
  w: { x: 'right', y: 'center' },
};

/**
 * A grip drag with the ratio held, `r` being the target in *fraction* space.
 *
 * Built on the free solve rather than beside it: that one already knows which
 * edges each grip owns and where the min-span floor pushes, and a second copy
 * of it constrained differently is a second copy to keep in step. The free
 * result is read only for the size it implies; the ratio then decides one
 * dimension from the other and the anchor decides where the rectangle sits.
 *
 * A corner takes whichever axis was dragged further, so the box follows the
 * pointer diagonally instead of ignoring half the gesture. The clamp is a
 * single width — the height is derived from it — because clamping the two
 * independently is exactly how a locked rectangle drifts off its ratio at the
 * edges of the frame.
 */
function applyGripLocked(
  start: CropRect,
  grip: Exclude<Grip, 'move'>,
  du: number,
  dv: number,
  r: number
): CropRect {
  const free = applyGrip(start, grip, du, dv);
  const anchor = RATIO_ANCHOR[grip];

  const ax =
    anchor.x === 'left' ? start.x : anchor.x === 'right' ? start.x + start.w : start.x + start.w / 2;
  const ay =
    anchor.y === 'top' ? start.y : anchor.y === 'bottom' ? start.y + start.h : start.y + start.h / 2;

  let w: number;
  if (grip === 'n' || grip === 's') w = free.h * r;
  else if (grip === 'e' || grip === 'w') w = free.w;
  else w = Math.max(free.w, free.h * r);

  /* How far the rectangle can grow before it leaves the frame, per axis. */
  const roomX = anchor.x === 'left' ? 1 - ax : anchor.x === 'right' ? ax : 2 * Math.min(ax, 1 - ax);
  const roomY = anchor.y === 'top' ? 1 - ay : anchor.y === 'bottom' ? ay : 2 * Math.min(ay, 1 - ay);

  w = Math.max(w, CROP_MIN_SPAN, CROP_MIN_SPAN * r);
  w = Math.min(w, roomX, roomY * r);
  const h = w / r;
  /*
   * No rectangle of this ratio fits against that anchor — a tall lock on a
   * crop already pressed into a corner. Hold the last good one rather than
   * collapsing it to a sliver the user then has to drag back out.
   */
  if (!(w > 0) || w < CROP_MIN_SPAN || h < CROP_MIN_SPAN) return start;

  const x = anchor.x === 'left' ? ax : anchor.x === 'right' ? ax - w : ax - w / 2;
  const y = anchor.y === 'top' ? ay : anchor.y === 'bottom' ? ay - h : ay - h / 2;

  return {
    x: Math.max(0, Math.min(1 - w, x)),
    y: Math.max(0, Math.min(1 - h, y)),
    w,
    h,
  };
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  mediaElement,
  mediaConfig,
  cols,
  rows,
  pxPerCol,
  pxPerRow,
  cellAspect,
  resampling,
  crop,
  onChange,
  onCommit,
  onApply,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ grip: Grip; startCrop: CropRect; u: number; v: number } | null>(null);
  /*
   * The held preset, by label, or null for a free crop.
   *
   * The label rather than the number, because ORIGINAL has no number until a
   * picture is loaded — keying on the value would mean a second piece of state
   * saying which preset that value came from, and the two drifting apart the
   * moment the source changes.
   *
   * Local to the marquee because the lock is a way of dragging, not part of
   * the crop: what gets committed is a rectangle, and reopening the stage on
   * it should not imply the constraint that happened to produce it.
   */
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);

  const boxW = Math.max(1, cols * pxPerCol);
  const boxH = Math.max(1, rows * pxPerRow);

  /*
   * The framing the *uncropped* source would get. `crop: undefined` is the
   * whole point: this is the transform the backdrop is painted with and the
   * one the marquee inverts, so both speak in fractions of the full source.
   */
  const uncropped = useMemo<MediaConfig>(() => ({ ...mediaConfig, crop: undefined }), [mediaConfig]);

  const framing = useMemo(() => {
    const { width, height } = mediaElement
      ? measureMedia(mediaElement)
      : { width: 1, height: 1 };
    return {
      ...computeMediaFraming(width, height, uncropped, { cols, rows, cellAspect }),
      srcWidth: width,
      srcHeight: height,
    };
  }, [mediaElement, uncropped, cols, rows, cellAspect]);

  /**
   * Source fraction -> display pixel, as one matrix.
   *
   * Same order as the renderer's context calls, which is what makes it the
   * same transform: pan, cell squash, rotation, flip, then the centred
   * destination box, then the unit square the crop is expressed in.
   */
  const matrix = useMemo(() => {
    const m = new DOMMatrix();
    m.scaleSelf(pxPerCol, pxPerRow);
    m.translateSelf(framing.cx, framing.cy);
    m.scaleSelf(1, framing.cellAspect);
    m.rotateSelf(framing.rotation);
    m.scaleSelf(framing.flipX ? -1 : 1, framing.flipY ? -1 : 1);
    m.translateSelf(-framing.drawW / 2, -framing.drawH / 2);
    m.scaleSelf(framing.drawW, framing.drawH);
    return m;
  }, [framing, pxPerCol, pxPerRow]);

  const inverse = useMemo(() => {
    try {
      return matrix.inverse();
    } catch {
      // Singular: a zero scale or a degenerate box. Grips go inert rather
      // than throwing on every pointer move.
      return null;
    }
  }, [matrix]);

  const toPx = useCallback(
    (u: number, v: number): { x: number; y: number } => {
      const p = matrix.transformPoint(new DOMPoint(u, v));
      return { x: p.x, y: p.y };
    },
    [matrix]
  );

  // --- The backdrop ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mediaElement) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(1, Math.round(boxW * dpr));
    const h = Math.max(1, Math.round(boxH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    /*
     * The engine paints it, at display resolution. Not a hand-rolled
     * drawImage: a backdrop framed even slightly differently from the raster
     * would put the rectangle over the wrong pixels, which is the one mistake
     * a crop tool cannot make.
     */
    drawFramedMedia(ctx, mediaElement, uncropped, {
      cols,
      rows,
      cellAspect,
      resampling,
      pixelsPerCellX: pxPerCol * dpr,
      pixelsPerCellY: pxPerRow * dpr,
    });
  }, [mediaElement, uncropped, cols, rows, cellAspect, resampling, pxPerCol, pxPerRow, boxW, boxH]);

  // --- Dragging ------------------------------------------------------------

  const pointerToSource = useCallback(
    (clientX: number, clientY: number): { u: number; v: number } | null => {
      const svg = svgRef.current;
      if (!svg || !inverse) return null;
      /*
       * Measured live rather than cached: this sits inside the camera element,
       * which is transformed during a zoom tween, and a stale origin would
       * make the grips lag the picture they are drawn on.
       */
      const r = svg.getBoundingClientRect();
      /*
       * Divided back out of any ancestor scale. The camera element carries a
       * transform while a zoom step tweens, so the rect can be a scaled copy
       * of the SVG's own coordinate system; without this the grips would track
       * the pointer at the wrong rate for the length of the animation.
       */
      const kx = r.width > 0 ? boxW / r.width : 1;
      const ky = r.height > 0 ? boxH / r.height : 1;
      const p = inverse.transformPoint(
        new DOMPoint((clientX - r.left) * kx, (clientY - r.top) * ky)
      );
      return { u: p.x, v: p.y };
    },
    [inverse, boxW, boxH]
  );

  const handleGripDown = useCallback(
    (grip: Grip) => (e: React.PointerEvent) => {
      /*
       * The viewport pans on pointerdown anywhere in the stage. Without this a
       * grip drag would pan the camera under the rectangle it is moving.
       */
      e.stopPropagation();
      e.preventDefault();
      const at = pointerToSource(e.clientX, e.clientY);
      if (!at) return;
      dragRef.current = { grip, startCrop: crop, u: at.u, v: at.v };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [crop, pointerToSource]
  );

  /** A preset's source-pixel ratio; ORIGINAL is whatever the picture is. */
  const resolveRatio = useCallback(
    (ratio: number | null): number =>
      ratio ?? framing.srcWidth / Math.max(1, framing.srcHeight),
    [framing.srcWidth, framing.srcHeight]
  );

  /*
   * The lock in the crop's own coordinates. "16:9" is a statement about source
   * pixels and the rectangle is stored in fractions of the source, so on a 3:2
   * photograph a square is w = 2/3 against the full height, not w === h.
   * ORIGINAL falls out of the same conversion as exactly 1.
   */
  const lockedFractionRatio = useMemo(() => {
    const preset = CROP_RATIOS.find((p) => p.label === lockedLabel);
    if (!preset) return null;
    const r = resolveRatio(preset.ratio) * (framing.srcHeight / Math.max(1, framing.srcWidth));
    return Number.isFinite(r) && r > 0 ? r : null;
  }, [lockedLabel, resolveRatio, framing.srcHeight, framing.srcWidth]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.stopPropagation();
      const at = pointerToSource(e.clientX, e.clientY);
      if (!at) return;
      const du = at.u - drag.u;
      const dv = at.v - drag.v;
      /* A move is a translation: the ratio it already has survives it. */
      onChange(
        lockedFractionRatio && drag.grip !== 'move'
          ? applyGripLocked(drag.startCrop, drag.grip, du, dv, lockedFractionRatio)
          : applyGrip(drag.startCrop, drag.grip, du, dv)
      );
    },
    [onChange, pointerToSource, lockedFractionRatio]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      e.stopPropagation();
      dragRef.current = null;
      // One history entry per gesture, not one per pointermove.
      onCommit(crop);
    },
    [crop, onCommit]
  );

  /* Enter commits, Escape abandons — the shortcuts a modal stage implies. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onApply();
      }
    };
    // Capture phase: the app binds its own single-key shortcuts on window, and
    // a crop in progress owns the keyboard until it is committed.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onApply, onCancel]);

  // --- Geometry for the paint ----------------------------------------------

  const corners = [
    toPx(crop.x, crop.y),
    toPx(crop.x + crop.w, crop.y),
    toPx(crop.x + crop.w, crop.y + crop.h),
    toPx(crop.x, crop.y + crop.h),
  ];
  const pts = corners.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  const quad = pts.join(' ');

  /* Outside-the-rect scrim as one even-odd path: the box, then the quad. */
  const scrim = `M0,0 H${boxW.toFixed(2)} V${boxH.toFixed(2)} H0 Z M${pts.join(' L')} Z`;

  const thirds: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    const a = toPx(crop.x + crop.w * t, crop.y);
    const b = toPx(crop.x + crop.w * t, crop.y + crop.h);
    const c = toPx(crop.x, crop.y + crop.h * t);
    const d = toPx(crop.x + crop.w, crop.y + crop.h * t);
    thirds.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    thirds.push({ x1: c.x, y1: c.y, x2: d.x, y2: d.y });
  }


  /*
   * The toolbar rides the rectangle, not the stage.
   *
   * Anchored to the stage's own bottom edge it was routinely nowhere near the
   * crop — off the bottom of the viewport whenever the raster was taller than
   * the window, and a long way from the rectangle at any tight crop. It hangs
   * off the marquee's lower-left corner instead, so it is always next to what
   * it describes.
   *
   * The corner comes from the quad's bounding box rather than from the
   * bottom-left vertex, because under rotation that vertex is not the one that
   * looks lower-left — the bar would appear to jump between corners as the
   * source turned past 45 degrees.
   */
  const bbox = corners.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
      minY: Math.min(b.minY, p.y),
    }),
    { minX: Infinity, maxX: -Infinity, maxY: -Infinity, minY: Infinity }
  );

  const GAP = 8;
  /*
   * Always just below the rectangle's lower-left corner, and free to hang off
   * the stage from there.
   *
   * It used to flip above the rectangle near the bottom edge and slide back in
   * from the right, which kept it in frame at the cost of the one thing a bar
   * pinned to a rectangle has to do: stay where you last saw it. Dragging the
   * bottom grip a few pixels sent it to the other side of the crop and put
   * APPLY under a cursor that was aiming at a handle. The stage does not clip,
   * so overflowing is cheap; jumping is not.
   */
  const barTop = bbox.maxY + GAP;
  const barLeft = bbox.minX;
  const cropPxW = Math.round(framing.srcWidth * crop.w);
  const cropPxH = Math.round(framing.srcHeight * crop.h);
  const isFull = crop.w >= 1 && crop.h >= 1 && crop.x <= 0 && crop.y <= 0;

  /*
   * The highlighted chip is the *lock*, not a measurement of the rectangle.
   *
   * A free crop dragged onto 16:9 by hand is not locked to it, and lighting
   * the chip up would say it was — the next grip drag would then not behave
   * the way the highlight implied.
   */

  return (
    <div className="crop-stage" style={{ width: `${boxW}px`, height: `${boxH}px` }}>
      <canvas
        ref={canvasRef}
        className="crop-backdrop"
        style={{ width: `${boxW}px`, height: `${boxH}px` }}
      />

      <svg
        ref={svgRef}
        className="crop-marquee"
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <path className="crop-scrim" d={scrim} fillRule="evenodd" />

        {/* Body drag. Before the outline, so the stroke stays crisp over it. */}
        <polygon className="crop-body" points={quad} onPointerDown={handleGripDown('move')} />

        {thirds.map((l, i) => (
          <line key={i} className="crop-third" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
        ))}

        <polygon className="crop-outline" points={quad} />

        {GRIPS.map((g) => {
          const p = toPx(crop.x + crop.w * g.u, crop.y + crop.h * g.v);
          return (
            <circle
              key={g.id}
              className="crop-grip"
              cx={p.x}
              cy={p.y}
              r={6}
              style={{ cursor: g.cursor }}
              onPointerDown={handleGripDown(g.id)}
            />
          );
        })}
      </svg>

      {/*
        Real DOM rather than SVG shapes: these are buttons that focus, carry a
        title, and take the app's own button styling instead of a second set of
        shapes to keep in sync with it.
      */}
      <div
        className="crop-toolbar"
        style={{ left: `${barLeft}px`, top: `${barTop}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/*
          The presets go above the actions, because they are what you reach for
          while still shaping the rectangle -- APPLY is the end of the gesture
          and sits closest to it.

          Picking one both re-cuts the rectangle and holds it there: every grip
          from then on keeps the ratio, which is what a ratio control on a crop
          tool is for. FREE releases it and leaves the rectangle alone -- the
          way back out, and the state a crop starts in.

          One history entry per click, since this is a finished gesture rather
          than the middle of a drag, exactly like the FULL button.
        */}
        <div className="crop-toolbar-row crop-ratio-row">
          <span className={`crop-ratio-label ${lockedLabel ? 'is-locked' : ''}`}>RATIO</span>
          <button
            className={`btn btn-sm crop-ratio-btn ${lockedLabel === null ? 'active' : ''}`}
            onClick={() => setLockedLabel(null)}
            title="Release the lock -- drag the rectangle to any shape"
          >
            FREE
          </button>
          {CROP_RATIOS.map((p) => (
            <button
              key={p.label}
              className={`btn btn-sm crop-ratio-btn ${lockedLabel === p.label ? 'active' : ''}`}
              onClick={() => {
                setLockedLabel(p.label);
                const next = applyRatio(
                  crop,
                  resolveRatio(p.ratio),
                  framing.srcWidth,
                  framing.srcHeight
                );
                onChange(next);
                onCommit(next);
              }}
              title={
                p.ratio === null
                  ? 'Hold the rectangle at the aspect of the source itself, re-cutting it around its centre'
                  : `Hold the rectangle at ${p.label}, re-cutting it around its centre`
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="crop-toolbar-row crop-action-row">
          <span className="crop-readout" title="Cropped source size, in source pixels">
            <CropIcon size={11} />
            {cropPxW} x {cropPxH}
            <span className="crop-readout-pct">
              {isFull ? 'full frame' : `${Math.round(crop.w * crop.h * 100)}%`}
            </span>
          </span>
          <button
            className="btn btn-sm"
            onClick={() => {
              onChange(CROP_FULL);
              onCommit(CROP_FULL);
            }}
            disabled={isFull}
            title="Reset the rectangle to the whole frame"
          >
            <Maximize size={11} /> FULL
          </button>
          <button className="btn btn-sm" onClick={onCancel} title="Discard this crop (Esc)">
            <X size={11} /> CANCEL
          </button>
          <button className="btn btn-sm btn-primary" onClick={onApply} title="Apply this crop (Enter)">
            <Check size={11} /> APPLY
          </button>
        </div>
      </div>
    </div>
  );
};
