import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Maximize2, Edit3, Crop, Settings, ImagePlus, Scissors } from 'lucide-react';
import {
  PhosphorTheme,
  PhosphorGradient,
  CrtConfig,
  OptimizeConfig,
  RasterOutputMode,
  UiThemeSettings,
  PostProcessConfig,
  VectorFrame,
  CropRect,
  MediaConfig,
  ResamplingMode,
} from '../types/ascii';
import {
  buildStages,
  composePostProcess,
  glowActive,
  overlayActive,
  resolvePostProcess,
} from '../engine/postProcess';

import { AsciiLoadingSpinner } from './AsciiLoadingSpinner';
import { ViewfinderSettingsModal } from './ViewfinderSettingsModal';
import { CropOverlay } from './CropOverlay';
import { MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT, MONOSPACE_CELL_ASPECT } from '../engine/renderer';
import { resolvePhosphorTint } from '../engine/palettes';
import { paintVectorFrame, vectorFrameErasesGround } from '../engine/vectorEngine';
import { resolveAutoResolution, shouldReplaceGrid, createAutoResController } from '../engine/autoResolution';
import type { AutoResSignals } from '../engine/autoResolution';

const hexToRgb = (hex: string): [number, number, number] => {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num) || cleaned.length !== 6) return [0, 255, 102];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

/** Manual zoom range for the viewfinder steppers. */
const ZOOM_MIN = 0.1;
/*
 * Deep enough to sit on a single dither cell. Beyond roughly 13x the canvas
 * backing store hits MAX_BACKING_DIM and drawCanvas rasterizes at a reduced
 * scale, letting the browser upscale the residual -- soft, but never blank.
 */
const ZOOM_MAX = 64.0;

/**
 * Widest canvas any browser will allocate per dimension. Past this a canvas
 * silently becomes blank rather than throwing, so both draw paths clamp to it.
 */
const MAX_BACKING_DIM = 16384;

/** Preset stops offered by the zoom readout menu. */
const ZOOM_PRESETS = [1, 2, 4, 8, 16] as const;

/**
 * Zoom is geometric: one notch multiplies, it does not add. ~18% per notch
 * crosses the useful range in a comfortable number of turns while still being
 * fine enough to frame a shot; shift takes a bigger bite.
 */
const ZOOM_STEP_RATIO = 1.18;
const ZOOM_STEP_RATIO_COARSE = 1.6;

/**
 * How fast the camera falls back to identity after a zoom step: the fraction
 * of the remaining distance still left after one 60fps frame.
 *
 * Exponential decay rather than a keyframed ease, because it has no beginning.
 * A step arriving mid-flight simply moves the target and the same decay keeps
 * running, where a fresh ease per step would restart from zero velocity and
 * turn a burst of notches into a stagger. 0.62 settles in roughly 110ms.
 */
const ZOOM_DECAY_PER_FRAME = 0.62;

/** Below this much residual (in log scale) the camera snaps home. */
const ZOOM_DECAY_EPSILON = 0.0015;

/**
 * Ceiling on how far the camera may sit from identity. A jump straight
 * from 1600% to Fit is a factor of thirty; animating that literally is a
 * swooping flight across the image rather than a zoom, so a big jump starts
 * closer and simply covers less ground.
 */
const ZOOM_TWEEN_MAX_FACTOR = 4;

/**
 * The viewfinder camera: where the raster sits on screen and how big it is.
 *
 * `tx`/`ty` are the raster's top-left corner in CSS pixels within the
 * container's content box. Centring used to be a CSS flex accident, which is
 * precisely why the view could not be moved; it is now just a value of t.
 */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/** Keep at least this much of the raster on screen, so it can never be lost. */
const PAN_KEEP_VISIBLE_PX = 80;

/** Spacing of the backdrop dot grid, in CSS pixels. */
const DOT_TILE_PX = 22;

/** Modulo that returns a non-negative result, unlike JS `%` on negatives. */
const mod = (n: number, m: number): number => ((n % m) + m) % m;


export interface AsciiViewportHandle {
  setFrame: (
    frameText: string,
    time: number,
    fps: number,
    colors?: Uint8ClampedArray | null,
    bgColor?: string,
    rasterMode?: RasterOutputMode,
    vector?: VectorFrame | null,
    /**
     * The ungraded source for the post-processing overlay, belonging to this
     * frame. Rides along here rather than as a prop because the mode renderers
     * redraw one canvas in place every tick — a prop would either never look
     * changed, or force a React render per frame to say that it had.
     */
    sourceLayer?: HTMLCanvasElement | null
  ) => void;
  getFrameText: () => string;
  autoFit: () => void;
  getOptimalResolution: () => { cols: number; rows: number } | null;
  /**
   * Current framing in a form that survives a different screen: the scale plus
   * the point at the centre of the viewport, as a fraction of the raster.
   * Null before the container has been measured.
   */
  getViewFraming: () => { scale: number; cx: number; cy: number } | null;
}

interface AsciiViewportProps {
  cols: number;
  rows: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetTime: () => void;
  onStepFrame?: () => void;
  onMouseMove?: (x: number, y: number) => void;
  onClick?: (x: number, y: number) => void;
  presetName: string;
  isEdited?: boolean;
  viewMode?: 'editor' | 'fullscreen';
  onToggleViewMode?: () => void;
  autoRes?: boolean;
  onToggleAutoRes?: () => void;
  onAutoResolutionChange?: (cols: number, rows: number) => void;
  /**
   * The content-and-cost half of the auto-resolution input, read at solve time.
   *
   * A getter rather than a value: the frame cost it carries changes every few
   * frames, and a prop would re-render the whole viewport each time to deliver
   * a number only the solver reads. Returning null disables auto-res, which is
   * what a mode with nothing loaded yet wants.
   */
  autoResSignals?: () => AutoResSignals | null;
  /** Live width/height of the viewfinder area, for ratio-locking the grid to it. */
  onViewfinderAspectChange?: (aspect: number) => void;
  crtConfig?: CrtConfig;
  onChangeCrtConfig?: (cfg: CrtConfig) => void;
  optimizeConfig?: OptimizeConfig;
  onChangeOptimizeConfig?: (cfg: OptimizeConfig) => void;
  gradientConfig?: PhosphorGradient | null;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  uiThemeSettings?: UiThemeSettings;
  onChangeUiThemeSettings?: (cfg: UiThemeSettings) => void;
  isSyncEligible?: boolean;
  appMode?: 'synth' | 'media' | 'model';

  mediaType?: 'image' | 'video';
  isLoading?: boolean;
  loadingFileName?: string;
  loadingStatusText?: string;
  onOrbitRotate?: (
    prevX: number,
    prevY: number,
    currX: number,
    currY: number,
    width: number,
    height: number
  ) => void;
  onWheelZoom?: (deltaZoom: number) => void;

  /*
   * --- Crop -------------------------------------------------------------
   *
   * The marquee is a stage of its own (see CropOverlay): while it is open it
   * paints the *uncropped* source over the raster, because a crop cannot be
   * widened again from a picture that has already had the rest thrown away.
   * Nothing here reaches the render pipeline — the draft is App state and only
   * `onCropApply` commits it to `mediaConfig`.
   */
  cropEditing?: boolean;
  onToggleCrop?: () => void;
  /** The draft rectangle, live during the gesture. */
  cropDraft?: CropRect | null;
  onCropDraftChange?: (crop: CropRect) => void;
  /** End of gesture — one history entry per drag, not per pointermove. */
  onCropDraftCommit?: (crop: CropRect) => void;
  onCropApply?: () => void;
  onCropCancel?: () => void;
  /** Needed by the marquee to frame its backdrop the way the raster is framed. */
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig?: MediaConfig | null;
  resampling?: ResamplingMode;
  /**
   * Media mode with no source loaded. Drawn as a fixed-size DOM prompt rather
   * than into the raster grid, so it stays legible at any zoom and in pixel
   * mode.
   */
  showMediaPlaceholder?: boolean;
  /**
   * Framing carried by a share link, applied once instead of the initial
   * auto-fit. Same shape as getViewFraming returns.
   */
  initialView?: { scale: number; cx: number; cy: number } | null;
  /**
   * The composite stage. The viewport realises it in CSS rather than on canvas
   * — it has to, because the monochrome ASCII path is a `<pre>` and no canvas
   * operation can reach it — and `BlendMode` is deliberately the set of names
   * `mix-blend-mode` and `globalCompositeOperation` share, so this agrees with
   * an export without a translation table.
   */
  postProcess?: PostProcessConfig;
}

export const AsciiViewport = forwardRef<AsciiViewportHandle, AsciiViewportProps>(({
  cols,
  rows,
  isPlaying,
  onTogglePlay,
  onResetTime,
  onStepFrame,
  onMouseMove,
  onClick,
  presetName,
  isEdited = false,
  viewMode = 'editor',
  onToggleViewMode,
  autoRes = false,
  onToggleAutoRes,
  onAutoResolutionChange,
  autoResSignals,
  onViewfinderAspectChange,
  crtConfig,
  onChangeCrtConfig,
  optimizeConfig,
  onChangeOptimizeConfig,
  gradientConfig,
  theme,
  customThemeColor,
  uiThemeSettings,
  onChangeUiThemeSettings,
  isSyncEligible = true,
  appMode = 'synth',
  mediaType,
  isLoading = false,

  loadingFileName,
  loadingStatusText,
  onOrbitRotate,
  onWheelZoom,
  cropEditing = false,
  onToggleCrop,
  cropDraft,
  onCropDraftChange,
  onCropDraftCommit,
  onCropApply,
  onCropCancel,
  mediaElement,
  mediaConfig,
  resampling = 'bilinear',
  showMediaPlaceholder = false,
  initialView = null,
  postProcess,
}, ref) => {
  const isTimelineDisabled = appMode === 'media' && mediaType === 'image';
  const containerRef = useRef<HTMLDivElement>(null);
  /*
   * The grid and the solver's inputs, held as refs for the same reason: the
   * auto-res effect must not be torn down and rebuilt when the grid it just
   * set arrives back as a prop, or it re-solves in a loop with itself.
   */
  const gridRef = useRef<{ cols: number; rows: number }>({ cols, rows });
  gridRef.current = { cols, rows };
  const autoResSignalsRef = useRef<typeof autoResSignals>(autoResSignals);
  autoResSignalsRef.current = autoResSignals;
  const preRef = useRef<HTMLPreElement>(null);
  const bloomPreRef = useRef<HTMLPreElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 1:1 scratch buffer for pixel mode; blitted to the visible canvas so cells
  // land on exact device pixels instead of fractional fillRect edges.
  const pixelBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const timeSpanRef = useRef<HTMLElement>(null);
  const fpsSpanRef = useRef<HTMLElement>(null);
  
  const latestFrameTextRef = useRef<string>('');
  const latestColorsRef = useRef<Uint8ClampedArray | null>(null);
  const latestBgColorRef = useRef<string | undefined>(undefined);
  const latestVectorRef = useRef<VectorFrame | null>(null);
  
  const [isColoredView, setIsColoredView] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /*
   * How the composite stage is split between CSS and canvas here, and why.
   *
   *  - The **overlay** is a DOM layer with `mix-blend-mode`. It has to be:
   *    monochrome ASCII renders into a `<pre>`, and no canvas operation can
   *    reach that. One implementation covers all three viewport paths.
   *  - **Glow and aberration** run through the real `composePostProcess` chain
   *    inside the canvas painters, so what is on screen is what a PNG will be.
   *    The chain applies `paint` stages to the raster layer *before* anything
   *    is composited with it, which is exactly what CSS does when the overlay
   *    blends against an already-bloomed canvas — the two orders agree.
   *  - The `<pre>` path approximates both in CSS. It already diverges from the
   *    exporters that way for the CRT effects, and it is the one surface that
   *    cannot do otherwise.
   */
  const post = resolvePostProcess(postProcess);
  const hasOverlay = overlayActive(postProcess);
  const overlayUnder = hasOverlay && post.sourceOverlay.placement === 'under';

  /*
   * The two canvas painters are `useCallback([])` — they are re-created never,
   * so they read the composite config through refs rather than closing over a
   * stale one. Same pattern the view transform already uses.
   */
  const postProcessRef = useRef<PostProcessConfig | undefined>(postProcess);
  postProcessRef.current = postProcess;
  const overlayUnderRef = useRef<boolean>(overlayUnder);
  overlayUnderRef.current = overlayUnder;

  const [view, setView] = useState<ViewTransform>({ scale: 1.0, tx: 0, ty: 0 });
  const viewRef = useRef<ViewTransform>(view);
  viewRef.current = view;
  /** Read-only alias; the render body only ever cares about the scale. */
  const zoom = view.scale;
  const [activeRasterMode, setActiveRasterMode] = useState<RasterOutputMode>('ascii');
  const activeRasterModeRef = useRef<RasterOutputMode>('ascii');
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState<boolean>(false);
  /** Bumped on container resize purely to force a culled canvas to repaint. */
  const [resizeTick, setResizeTick] = useState<number>(0);

  /*
   * The viewport half of the auto-resolution input: its own measured size, the
   * device pixel ratio and which output mode is live. Everything about the
   * content and what it costs to render arrives through `autoResSignals`,
   * which is read here rather than held as props so a changing frame cost does
   * not re-render the viewport. See engine/autoResolution.ts.
   *
   * `current` is passed so the solver can damp its own step: the performance
   * ceiling is an extrapolation from a cost measured at a different grid size,
   * and jumping straight to it is what makes a closed loop oscillate.
   */
  /** Everything the solver needs, or null when there is nothing to size against. */
  const buildAutoResInput = useCallback(() => {
    if (!containerRef.current) return null;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return null;

    const signals = autoResSignalsRef.current?.();
    if (!signals) return null;

    return {
      ...signals,
      viewport: {
        width: clientWidth,
        height: clientHeight,
        dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      },
      output: activeRasterMode,
      current: gridRef.current,
    };
  }, [activeRasterMode]);

  /*
   * A single stateless solve, for callers that want an answer now — App uses it
   * to seed the grid the moment auto-res is switched on, so the old resolution
   * is never briefly visible. Deliberately does not touch the controller: this
   * has no opinion about *whether* the grid should change, only what it would
   * be, and advancing the latch from here would consume the correction pass
   * that belongs to the effect below.
   */
  const getOptimalResolution = useCallback((): { cols: number; rows: number } | null => {
    const input = buildAutoResInput();
    if (!input) return null;
    const result = resolveAutoResolution(input);
    return { cols: result.cols, rows: result.rows };
  }, [buildAutoResInput]);

  /* ======================================================================
     View transform: content geometry, pan clamping, and the two ways to
     change scale (about a point, or about the viewport centre).
     ====================================================================== */

  const latestRasterModeRef = useRef<RasterOutputMode>('ascii');

  /**
   * On-screen size of the raster at a given scale.
   *
   * Derived from the same cell constants both draw paths use rather than
   * measured, so a fit can be computed before anything has been laid out.
   */
  const getContentSize = useCallback(
    (scale: number) => {
      const square = latestRasterModeRef.current !== 'ascii';
      const cellW = square ? 1 : MONOSPACE_CELL_WIDTH;
      const cellH = square ? 1 : MONOSPACE_CELL_HEIGHT;
      return { w: cols * cellW * scale, h: rows * cellH * scale };
    },
    [cols, rows]
  );

  /**
   * Hold the pan so a sliver of the raster always overlaps the viewport.
   * Without this, one enthusiastic flick leaves you staring at empty space
   * with no clue which direction home is.
   */
  const clampPan = useCallback(
    (tx: number, ty: number, scale: number): { tx: number; ty: number } => {
      const el = containerRef.current;
      if (!el) return { tx, ty };
      const { clientWidth, clientHeight } = el;
      const { w, h } = getContentSize(scale);
      const keepX = Math.min(w, PAN_KEEP_VISIBLE_PX);
      const keepY = Math.min(h, PAN_KEEP_VISIBLE_PX);
      return {
        tx: Math.max(keepX - w, Math.min(clientWidth - keepX, tx)),
        ty: Math.max(keepY - h, Math.min(clientHeight - keepY, ty)),
      };
    },
    [getContentSize]
  );

  /** The pan that puts the raster dead centre at a given scale. */
  const centerFor = useCallback(
    (scale: number): { tx: number; ty: number } => {
      const el = containerRef.current;
      if (!el) return { tx: 0, ty: 0 };
      const { w, h } = getContentSize(scale);
      return {
        tx: Math.round((el.clientWidth - w) / 2),
        ty: Math.round((el.clientHeight - h) / 2),
      };
    },
    [getContentSize]
  );

  /*
   * Framing as a share link carries it.
   *
   * The pan is stored in pixels, which is meaningless on someone else's
   * window: the same tx frames completely different parts of the image on a
   * 3440px monitor and a 1280px laptop. Expressing it as the fraction of the
   * raster sitting under the centre of the viewport reproduces what the sender
   * was looking at at any size. Fractions outside 0..1 are legal and mean the
   * raster is panned partly off screen, which is a view someone may have
   * chosen deliberately.
   */
  const getViewFraming = useCallback((): { scale: number; cx: number; cy: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const v = viewRef.current;
    const { w, h } = getContentSize(v.scale);
    if (w <= 0 || h <= 0) return null;
    return {
      scale: Number(v.scale.toFixed(4)),
      cx: Number(((el.clientWidth / 2 - v.tx) / w).toFixed(4)),
      cy: Number(((el.clientHeight / 2 - v.ty) / h).toFixed(4)),
    };
  }, [getContentSize]);

  /*
   * The auto-res effect must read this without depending on it. Its identity
   * changes with cols/rows, so listing it as a dependency would tear the
   * controller down and rebuild it on every grid change — resetting the latch
   * each time and putting the hunt straight back. Reading it through a ref
   * keeps the effect stable and the measurement current.
   */
  const getViewFramingRef = useRef(getViewFraming);
  getViewFramingRef.current = getViewFraming;

  /** Inverse of getViewFraming, against this viewport's own size. */
  const framingToView = useCallback(
    (f: { scale: number; cx: number; cy: number }): ViewTransform | null => {
      const el = containerRef.current;
      if (!el) return null;
      const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, f.scale));
      const { w, h } = getContentSize(scale);
      const tx = el.clientWidth / 2 - f.cx * w;
      const ty = el.clientHeight / 2 - f.cy * h;
      return { scale, ...clampPan(tx, ty, scale) };
    },
    [getContentSize, clampPan]
  );

  /**
   * Pixel mode only ever sits on whole device pixels per cell.
   *
   * The steppers always maintained that ladder; every other way in (a fit, a
   * preset, the wheel) did not, and a fractional rung makes cells alternate
   * between N and N+1 pixels wide -- ruinous for the one mode whose entire
   * point is hard cell edges. Below one device pixel per cell the ladder has
   * no rung left, so the scale passes through untouched.
   */
  const snapScaleToCellGrid = useCallback((s: number, mode: 'round' | 'floor' = 'round'): number => {
    if (latestRasterModeRef.current !== 'pixel') return s;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    if (s * dpr < 1) return s;
    // A fit floors: rounding up would push the raster back past the edge it
    // was just asked to fit inside.
    const rungs = mode === 'floor' ? Math.floor(s * dpr) : Math.round(s * dpr);
    return Math.max(1, rungs) / dpr;
  }, []);

  const isUserInputZoomRef = useRef<boolean>(false);

  /**
   * Scale about a point, keeping whatever sits under it pinned in place.
   *
   * `px`/`py` are container-relative. The maths is independent of how the
   * scale is realised (canvas backing store or CSS transform) because the
   * content always grows from the stage origin.
   */
  const zoomAbout = useCallback(
    (nextScale: number, px: number, py: number) => {
      isUserInputZoomRef.current = true;
      setView((prev) => {
        const snapped = snapScaleToCellGrid(nextScale);
        const s2 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(snapped.toFixed(3))));
        if (s2 === prev.scale) return prev;
        const ux = (px - prev.tx) / prev.scale;
        const uy = (py - prev.ty) / prev.scale;
        return { scale: s2, ...clampPan(px - ux * s2, py - uy * s2, s2) };
      });
    },
    [clampPan, snapScaleToCellGrid]
  );

  /** Scale about the middle of the viewport, for buttons and hotkeys. */
  const zoomAboutCenter = useCallback(
    (nextScale: number) => {
      const el = containerRef.current;
      if (!el) return;
      zoomAbout(nextScale, el.clientWidth / 2, el.clientHeight / 2);
    },
    [zoomAbout]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      setView((prev) => ({ ...prev, ...clampPan(prev.tx + dx, prev.ty + dy, prev.scale) }));
    },
    [clampPan]
  );

  const recenter = useCallback(() => {
    setView((prev) => ({ ...prev, ...centerFor(prev.scale) }));
  }, [centerFor]);
  /* ======================================================================
     Zoom easing.

     The new scale is committed and drawn straight away; what softens the jump
     is the camera, carrying the transform that maps the new rendering back
     onto the old one and relaxing continuously to identity. So a step
     rasterizes once and the frames in between are the compositor scaling a
     bitmap -- fractionally soft in flight, which nothing perceives during
     motion, where redrawing per frame would mean re-running the glyph loop or
     reallocating the backing store sixty times a second.

     Crucially this is one long-lived decay, not an animation per step. Giving
     each notch its own ease meant every one restarted from zero velocity, so a
     quick burst of them -- which is how anyone actually uses a wheel or a
     trackpad -- came out as a stagger of accelerations. A step now only nudges
     the residual transform; the decay carrying it back to identity never
     restarts, so a burst reads as one continuous movement.
     ====================================================================== */

  const cameraRef = useRef<HTMLDivElement>(null);
  const prevViewRef = useRef<ViewTransform>(view);
  /**
   * How far the camera currently sits from identity, as a scale about a fixed
   * point. Any composition of scales-about-points is itself a scale about some
   * point, so this shape survives steps taken at different cursor positions.
   */
  const residualRef = useRef<{ s: number; px: number; py: number } | null>(null);
  const decayRafRef = useRef<number | null>(null);
  const decayLastTsRef = useRef<number>(0);

  const applyCameraResidual = useCallback(() => {
    const el = cameraRef.current;
    if (!el) return;
    const r = residualRef.current;
    if (!r) {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.willChange = '';
      return;
    }
    el.style.transformOrigin = `${r.px}px ${r.py}px`;
    el.style.transform = `scale(${r.s})`;
  }, []);

  const runDecay = useCallback(() => {
    if (decayRafRef.current !== null) return;
    decayLastTsRef.current = 0;

    const tick = (ts: number) => {
      const last = decayLastTsRef.current || ts;
      // Clamped so a backgrounded tab returning does not jump the decay.
      const dt = Math.min(64, ts - last);
      decayLastTsRef.current = ts;

      const r = residualRef.current;
      if (!r) {
        decayRafRef.current = null;
        applyCameraResidual();
        return;
      }

      /*
       * Decay in log space: zoom is geometric, so a residual of 2x and one of
       * 0.5x are the same distance from home and must come back at the same
       * rate. Raising the per-frame factor by dt/frame keeps the rate the same
       * on any refresh rate.
       */
      const logS = Math.log(r.s) * Math.pow(ZOOM_DECAY_PER_FRAME, dt / 16.6667);

      if (Math.abs(logS) < ZOOM_DECAY_EPSILON) {
        residualRef.current = null;
        decayRafRef.current = null;
        applyCameraResidual();
        return;
      }

      const s = Math.exp(logS);
      // Hold the fixed point and rebuild the scale around it, so relaxing the
      // magnitude never slides the image sideways.
      residualRef.current = { s, px: r.px, py: r.py };
      applyCameraResidual();
      decayRafRef.current = requestAnimationFrame(tick);
    };

    decayRafRef.current = requestAnimationFrame(tick);
  }, [applyCameraResidual]);

  useLayoutEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;

    const el = cameraRef.current;
    if (!el || prev.scale === view.scale) return;

    if (!isUserInputZoomRef.current) {
      residualRef.current = null;
      applyCameraResidual();
      return;
    }
    isUserInputZoomRef.current = false;

    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    /*
     * The fixed point of this step: the one screen position showing the same
     * part of the image before and after. Derived from the two states rather
     * than taken from the cursor, so it stays correct when a clamp has pulled
     * the pan somewhere the cursor was not.
     */
    const ds = view.scale - prev.scale;
    const qx = (prev.tx * view.scale - view.tx * prev.scale) / ds;
    const qy = (prev.ty * view.scale - view.ty * prev.scale) / ds;
    const k = prev.scale / view.scale;
    if (!Number.isFinite(qx) || !Number.isFinite(qy) || !(k > 0)) return;

    /*
     * Compose this step onto whatever the camera is already showing, as affine
     * maps x -> a*x + b. The step has to be applied *under* the existing
     * residual: the residual describes the old rendering, and the step maps
     * the new rendering onto that old one.
     */
    const cur = residualRef.current;
    let s: number;
    let px: number;
    let py: number;
    if (cur) {
      s = cur.s * k;
      const bx = (1 - cur.s) * cur.px;
      const by = (1 - cur.s) * cur.py;
      const tx = cur.s * ((1 - k) * qx) + bx;
      const ty = cur.s * ((1 - k) * qy) + by;
      // s === 1 means the two steps cancelled exactly; there is nothing left
      // to show and the fixed point would be a division by zero.
      if (Math.abs(1 - s) < 1e-9) {
        residualRef.current = null;
        applyCameraResidual();
        return;
      }
      px = tx / (1 - s);
      py = ty / (1 - s);
    } else {
      s = k;
      px = qx;
      py = qy;
    }

    // Cap the distance so a jump straight from 1600% to Fit eases rather than
    // flying in from far outside the frame.
    const maxLog = Math.log(ZOOM_TWEEN_MAX_FACTOR);
    const logS = Math.max(-maxLog, Math.min(maxLog, Math.log(s)));
    if (Math.abs(logS) < ZOOM_DECAY_EPSILON) {
      residualRef.current = null;
      applyCameraResidual();
      return;
    }

    residualRef.current = { s: Math.exp(logS), px, py };
    /*
     * Promote for the duration. Without this the layer holds live text -- the
     * uncoloured ASCII path is a <pre> scaled by CSS -- and the browser
     * re-rasterizes every glyph at every intermediate scale, which is ruinous
     * past 100% where the text is large. Promoted, it rasterizes once and the
     * compositor scales the texture.
     */
    el.style.willChange = 'transform';
    applyCameraResidual();
    runDecay();
  }, [view, applyCameraResidual, runDecay]);

  useEffect(() => () => {
    if (decayRafRef.current !== null) cancelAnimationFrame(decayRafRef.current);
  }, []);

  /**
   * One notch of zoom.
   *
   * Geometric, always: a step is a fixed *ratio*, so it feels the same at 40%
   * as at 1600%. The previous version mixed two incompatible rules -- whole
   * device pixels per cell above one pixel per cell, and a flat additive 1%
   * below it -- which on a 1x display meant 1% per notch under 100% and
   * +100% per notch over it. Eighty notches to cross the bottom of the range,
   * one to cross the top.
   *
   * Pixel mode still has to land on whole device pixels per cell or its cells
   * come out alternating widths, so there the geometric target is snapped to
   * the nearest rung. Where rungs are further apart than the step (the low
   * end, where rungs are 1x, 2x, 3x...), snapping alone would round straight
   * back onto the current rung and the notch would do nothing, so it takes the
   * next rung instead. Below one device pixel per cell the mode is being
   * downsampled anyway, there is no rung to hold, and the geometric value
   * stands unmodified.
   */
  const stepZoom = useCallback((z: number, dir: 1 | -1, coarse = false) => {
    const ratio = coarse ? ZOOM_STEP_RATIO_COARSE : ZOOM_STEP_RATIO;
    const target = dir > 0 ? z * ratio : z / ratio;
    const clamp = (v: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(v.toFixed(3))));

    if (latestRasterModeRef.current === 'pixel') {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const targetRungs = target * dpr;
      if (targetRungs >= 1) {
        let rung = Math.round(targetRungs);
        if (Math.abs(rung / dpr - z) < 1e-6) rung = Math.round(z * dpr) + dir;
        if (rung >= 1) return clamp(rung / dpr);
      }
    }

    return clamp(target);
  }, []);

  const autoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    /*
     * Vector shares pixel's 1:1 cell geometry -- polylines live in grid space
     * and a 0.6 cell would shear them -- but not its scale snapping below: a
     * beam is continuous, so there is no cell edge to keep hard.
     */
    const isPixel = latestRasterModeRef.current === 'pixel';
    const square = latestRasterModeRef.current !== 'ascii';
    const charWidth = square ? 1 : MONOSPACE_CELL_WIDTH;
    const charHeight = square ? 1 : MONOSPACE_CELL_HEIGHT;
    const unscaledWidth = cols * charWidth;
    const unscaledHeight = rows * charHeight;

    const pad = 16;
    const availableWidth = Math.max(10, clientWidth - pad);
    const availableHeight = Math.max(10, clientHeight - pad);

    const scaleX = availableWidth / unscaledWidth;
    const scaleY = availableHeight / unscaledHeight;
    /*
     * Fit to the same ceiling the manual steppers use; the old hard 5.0 could
     * not fill the viewfinder with a 1:1 grid, which needs one screen pixel
     * per cell and so routinely wants a scale in the high single digits.
     * Pixel mode floors to a whole number because drawCanvas rounds the cell
     * scale anyway — fitting to 7.4 would just render at 7 and sit off-centre.
     */
    const rawFit = Math.min(scaleX, scaleY);
    /*
     * Whole-number fit only while there is at least one cell-per-pixel rung to
     * land on. When the grid is larger than the viewport the fit is below 1,
     * where flooring yields 0 and the old max(1, ..) pinned it to 100% -- so
     * "fit" could not actually shrink an oversized grid to fit.
     */
    /*
     * Land on the cell ladder rather than a whole CSS scale: on a 1.5x display
     * a "whole" scale of 3 is 4.5 device pixels per cell, which is exactly the
     * alternating-width artefact the ladder exists to avoid.
     */
    const fitScale = isPixel && rawFit >= 1
      ? Math.min(ZOOM_MAX, snapScaleToCellGrid(rawFit, 'floor'))
      : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rawFit));
    // Fitting owns the pan too: a fit that left the raster off-centre would
    // be a strange sort of fit, and this is the one action that always
    // recovers a lost view.
    const scale = Number(fitScale.toFixed(2));
    setView({ scale, ...centerFor(scale) });
  }, [cols, rows, centerFor, snapScaleToCellGrid]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // If already at 100% (scale ~ 1.0), alternate back to fit
      if (Math.abs(view.scale - 1.0) < 0.01) {
        autoFit();
      } else {
        const el = containerRef.current;
        if (!el) {
          zoomAboutCenter(1.0);
          return;
        }
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        zoomAbout(1.0, px, py);
      }
    },
    [view.scale, autoFit, zoomAbout, zoomAboutCenter]
  );

  /**
   * Split the frame once per distinct frame, so a culled draw can address a
   * row directly instead of walking the whole string to find it. A pan or a
   * zoom re-draws the same text, which is exactly when the cache pays.
   */
  const linesCacheRef = useRef<{ text: string; lines: string[] } | null>(null);
  const getFrameLines = useCallback((text: string): string[] => {
    const cached = linesCacheRef.current;
    if (cached && cached.text === text) return cached.lines;
    const lines = text.split('\n');
    linesCacheRef.current = { text, lines };
    return lines;
  }, []);

  /**
   * Bumped by every setFrame. The engine renders into a module-level colour
   * buffer that it mutates in place, so the buffer's identity says nothing
   * about whether the pixels changed -- comparing it was why a render change
   * only appeared after a zoom. A counter cannot lie in the same way: if it
   * has not advanced, no new frame arrived and only the view can have moved.
   */
  const frameSeqRef = useRef<number>(0);

  /** What the canvas currently holds, so a pure pan can skip repainting. */
  const lastDrawRef = useRef<{
    seq: number;
    scale: number;
    mode: RasterOutputMode;
    culled: boolean;
    cols: number;
    rows: number;
    /**
     * Identity of the composite settings that produced the bitmap on the
     * canvas. Part of the key because a pan short-circuits the repaint, and
     * dragging a glow slider must not be mistaken for one.
     */
    post: string;
  } | null>(null);

  /** Everything the canvas painters read out of the composite config. */
  const postDrawKey = `${post.glow.amount}|${post.glow.radius}|${post.glow.tint}|${post.aberration.amount}|${post.aberration.angle}|${overlayUnder ? 'u' : '-'}`;
  const postDrawKeyRef = useRef<string>(postDrawKey);
  postDrawKeyRef.current = postDrawKey;

  /**
   * Paint a traced beam.
   *
   * Unlike the two cell paths this **re-strokes on every zoom** rather than
   * magnifying a bitmap, which is the whole reason vector output exists: the
   * geometry is resolution-independent, so a line is re-rasterized crisply at
   * whatever scale it is being viewed at instead of turning into a staircase.
   * Deliberately no bitmap cache here — it would throw that away.
   *
   * A *pan* is still free: the canvas holds the whole raster and carries the
   * translate in CSS, exactly as the cell paths do. Only past the backing-store
   * limit does it fall back to a viewport-sized canvas that repaints as it
   * moves, and at that magnification only a handful of lines are on screen.
   */
  const drawVector = useCallback(
    (
      canvas: HTMLCanvasElement,
      container: HTMLDivElement,
      frame: VectorFrame | null,
      bgColor: string | undefined,
      v: ViewTransform
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!frame || frame.polylines.length === 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        lastDrawRef.current = null;
        return;
      }

      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const scale = v.scale;
      /* One grid cell is one unit; the beam was traced in exactly this space. */
      const unscaledW = Math.max(1, frame.width);
      const unscaledH = Math.max(1, frame.height);
      const culled = Math.max(unscaledW, unscaledH) * scale * dpr > MAX_BACKING_DIM;

      const prev = lastDrawRef.current;
      const sameContent =
        prev !== null &&
        prev.seq === frameSeqRef.current &&
        prev.scale === scale &&
        prev.mode === 'vector' &&
        prev.culled === culled &&
        prev.cols === frame.width &&
        prev.rows === frame.height &&
        prev.post === postDrawKeyRef.current;

      if (sameContent && !culled) {
        const translate = `translate3d(${v.tx}px, ${v.ty}px, 0)`;
        if (canvas.style.transform !== translate) canvas.style.transform = translate;
        return;
      }

      lastDrawRef.current = {
        seq: frameSeqRef.current,
        scale,
        mode: 'vector',
        culled,
        cols: frame.width,
        rows: frame.height,
        post: postDrawKeyRef.current,
      };

      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const originX = culled ? v.tx : 0;
      const originY = culled ? v.ty : 0;
      const cssW = culled ? viewW : Math.round(unscaledW * scale);
      const cssH = culled ? viewH : Math.round(unscaledH * scale);

      const cssWpx = `${cssW}px`;
      const cssHpx = `${cssH}px`;
      if (canvas.style.width !== cssWpx) canvas.style.width = cssWpx;
      if (canvas.style.height !== cssHpx) canvas.style.height = cssHpx;
      const translate = culled ? 'none' : `translate3d(${v.tx}px, ${v.ty}px, 0)`;
      if (canvas.style.transform !== translate) canvas.style.transform = translate;

      const backingW = Math.max(1, Math.round(cssW * dpr));
      const backingH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, backingW, backingH);

      /*
       * With the source overlay sitting *under* the beam, the canvas must not
       * paint its own ground: an opaque plate here covers the overlay
       * completely. `.viewport-content-ground` is the ground in that case, and
       * it already sits below both.
       */
      const ground = overlayUnderRef.current ? null : bgColor || frame.bgColor;

      /*
       * Device pixels, not CSS pixels. The chain's scratch layers are sized
       * from these, so passing CSS units would rasterize the bloom at 1x and
       * then upscale it on a retina display.
       */
      composePostProcess({
        ctx,
        width: backingW,
        height: backingH,
        stages: buildStages(postProcessRef.current, null),
        /* The beam erases its occlusion polygons; keep them off the ground. */
        isolateRaster: vectorFrameErasesGround(frame),
        scale: scale * dpr,
        /*
         * The ground covers the raster's own box, not the whole backing store.
         * At deep zoom the canvas is the viewport and the raster is a window
         * inside it; flooding the lot would paint over the dot backdrop.
         */
        paintBase: ground && ground !== 'transparent'
          ? (target) => {
              target.setTransform(dpr, 0, 0, dpr, 0, 0);
              target.translate(originX, originY);
              target.scale(scale, scale);
              target.fillStyle = ground;
              target.fillRect(0, 0, unscaledW, unscaledH);
              target.setTransform(1, 0, 0, 1, 0, 0);
            }
          : undefined,
        paintRaster: (target) => {
          target.setTransform(dpr, 0, 0, dpr, 0, 0);
          target.translate(originX, originY);
          target.scale(scale, scale);
          /*
           * strokeScale stays 1, so a stroke grows with the zoom the way a
           * vector document does and the viewport matches what an export at
           * that scale produces.
           */
          paintVectorFrame(target, frame);
          target.setTransform(1, 0, 0, 1, 0, 0);
        },
      });
    },
    []
  );

  const drawCanvas = useCallback(
    (
      frameText: string,
      colors: Uint8ClampedArray | null,
      bgColor: string | undefined,
      v: ViewTransform,
      rasterMode: RasterOutputMode = 'ascii',
      vector: VectorFrame | null = null
    ) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      /*
       * Vector output goes first, before the colour-buffer check below: it has
       * no colour buffer by construction, and falling through would wipe the
       * canvas and blank the beam.
       */
      if (rasterMode === 'vector') {
        drawVector(canvas, container, vector, bgColor, v);
        return;
      }

      /*
       * No content: wipe rather than return. Bailing out left whatever was
       * last painted sitting on a canvas that is still displayed, so an empty
       * viewfinder could keep showing a ghost of the previous source.
       */
      if (!colors || colors.length === 0) {
        const blankCtx = canvas.getContext('2d');
        if (blankCtx) blankCtx.clearRect(0, 0, canvas.width, canvas.height);
        lastDrawRef.current = null;
        return;
      }

      const isPixelMode = rasterMode === 'pixel';
      const cellW = isPixelMode ? 1 : MONOSPACE_CELL_WIDTH;
      const cellH = isPixelMode ? 1 : MONOSPACE_CELL_HEIGHT;
      const unscaledW = Math.max(1, cols * cellW);
      const unscaledH = Math.max(1, rows * cellH);
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const scale = v.scale;

      /*
       * Two regimes, picked by whether the whole raster still fits in a canvas.
       *
       *  - Whole-raster (the common case): the backing store holds every cell
       *    and the canvas carries the pan as a CSS translate, so dragging costs
       *    nothing at all.
       *  - Culled (deep zoom): the backing store is the viewport and only the
       *    cells actually on screen are painted. This is the only way past the
       *    16384px limit -- beyond it a canvas silently goes blank -- and it is
       *    also far less work, since at that magnification a handful of cells
       *    fill the screen. Panning repaints, but only those few cells.
       */
      const culled = Math.max(unscaledW, unscaledH) * scale * dpr > MAX_BACKING_DIM;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const prev = lastDrawRef.current;
      const sameContent =
        prev !== null &&
        prev.seq === frameSeqRef.current &&
        prev.scale === scale &&
        prev.mode === rasterMode &&
        prev.culled === culled &&
        prev.cols === cols &&
        prev.rows === rows &&
        prev.post === postDrawKeyRef.current;

      // A pan in whole-raster mode just moves the bitmap that is already there.
      if (sameContent && !culled) {
        const translate = `translate3d(${v.tx}px, ${v.ty}px, 0)`;
        if (canvas.style.transform !== translate) canvas.style.transform = translate;
        return;
      }

      lastDrawRef.current = {
        seq: frameSeqRef.current,
        scale,
        mode: rasterMode,
        culled,
        cols,
        rows,
        post: postDrawKeyRef.current,
      };

      /*
       * Visible cell window. In whole-raster mode this stays the entire grid,
       * so both regimes share one drawing loop.
       */
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const stepX = cellW * scale;
      const stepY = cellH * scale;
      let col0 = 0;
      let col1 = cols;
      let row0 = 0;
      let row1 = rows;
      if (culled) {
        col0 = Math.max(0, Math.min(cols, Math.floor(-v.tx / stepX)));
        col1 = Math.max(col0, Math.min(cols, Math.ceil((viewW - v.tx) / stepX)));
        row0 = Math.max(0, Math.min(rows, Math.floor(-v.ty / stepY)));
        row1 = Math.max(row0, Math.min(rows, Math.ceil((viewH - v.ty) / stepY)));
      }

      // Where cell (0,0) sits inside the canvas box, in CSS pixels.
      const originX = culled ? v.tx : 0;
      const originY = culled ? v.ty : 0;

      const cssW = culled ? viewW : Math.round(unscaledW * scale);
      const cssH = culled ? viewH : Math.round(unscaledH * scale);
      const cssWpx = `${cssW}px`;
      const cssHpx = `${cssH}px`;
      if (canvas.style.width !== cssWpx) canvas.style.width = cssWpx;
      if (canvas.style.height !== cssHpx) canvas.style.height = cssHpx;

      const translate = culled ? 'none' : `translate3d(${v.tx}px, ${v.ty}px, 0)`;
      if (canvas.style.transform !== translate) canvas.style.transform = translate;

      /*
       * Pixel mode: rasterize one cell per pixel into a cols x rows ImageData,
       * then blit that upscaled with smoothing off. Painting scaled fillRects
       * instead would antialias every cell edge whenever zoom * dpr is not an
       * integer (imageSmoothingEnabled does not apply to fillRect), and the
       * regular dither grid resampled that way produces moire.
       */
      if (isPixelMode) {
        let buf = pixelBufferCanvasRef.current;
        if (!buf) {
          buf = document.createElement('canvas');
          pixelBufferCanvasRef.current = buf;
        }
        if (buf.width !== cols || buf.height !== rows) {
          buf.width = cols;
          buf.height = rows;
        }
        const bctx = buf.getContext('2d');
        if (!bctx) return;

        const img = bctx.createImageData(cols, rows);
        const data = img.data;
        let px = 0;
        let py = 0;
        for (let i = 0; i < frameText.length; i++) {
          const ch = frameText[i];
          if (ch === '\n') {
            py++;
            px = 0;
            continue;
          }
          if (px < cols && py < rows) {
            const cell = py * cols + px;
            const o = cell * 4;
            // A space marks an alpha-cutout cell; leave it fully transparent.
            if (ch !== ' ') {
              const c = cell * 3;
              data[o] = colors[c];
              data[o + 1] = colors[c + 1];
              data[o + 2] = colors[c + 2];
              data[o + 3] = 255;
            }
            px++;
          }
        }
        bctx.putImageData(img, 0, 0);

        // Whole device pixels per cell, so every cell comes out the same size
        // instead of alternating 2px/3px along the grid.
        const cellPx = Math.max(1, Math.round(scale * dpr));

        let backingW: number;
        let backingH: number;
        if (culled) {
          backingW = Math.max(1, Math.round(viewW * dpr));
          backingH = Math.max(1, Math.round(viewH * dpr));
        } else {
          const scaleCeiling = Math.max(1, Math.floor(MAX_BACKING_DIM / Math.max(cols, rows, 1)));
          const snapped = Math.min(scaleCeiling, cellPx);
          backingW = cols * snapped;
          backingH = rows * snapped;
        }
        if (canvas.width !== backingW || canvas.height !== backingH) {
          canvas.width = backingW;
          canvas.height = backingH;
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Suppressed under an `under` overlay, which the plate would cover.
        const plate = overlayUnderRef.current ? null : bgColor;
        const hasPlate = Boolean(plate && plate !== 'transparent');

        composePostProcess({
          ctx,
          width: canvas.width,
          height: canvas.height,
          stages: buildStages(postProcessRef.current, null),
          scale: cellPx,
          paintBase: hasPlate
            ? (target) => {
                target.setTransform(1, 0, 0, 1, 0, 0);
                target.fillStyle = plate as string;
                if (culled) {
                  const sw = col1 - col0;
                  const sh = row1 - row0;
                  if (sw > 0 && sh > 0) {
                    target.fillRect(
                      Math.round(originX * dpr) + col0 * cellPx,
                      Math.round(originY * dpr) + row0 * cellPx,
                      sw * cellPx,
                      sh * cellPx
                    );
                  }
                } else {
                  target.fillRect(0, 0, canvas.width, canvas.height);
                }
              }
            : undefined,
          paintRaster: (target) => {
            target.setTransform(1, 0, 0, 1, 0, 0);
            target.imageSmoothingEnabled = false;
            if (culled) {
              const sw = col1 - col0;
              const sh = row1 - row0;
              if (sw <= 0 || sh <= 0) return;
              // Anchor on whole device pixels so cell edges stay hard.
              const dx = Math.round(originX * dpr) + col0 * cellPx;
              const dy = Math.round(originY * dpr) + row0 * cellPx;
              target.drawImage(buf!, col0, row0, sw, sh, dx, dy, sw * cellPx, sh * cellPx);
            } else {
              target.drawImage(buf!, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
            }
          },
        });
        ctx.restore();
        return;
      }

      // Coloured ASCII: one fillText per non-blank visible cell.
      const backingW = Math.max(1, Math.round(cssW * dpr));
      const backingH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, backingW, backingH);

      const plate =
        !overlayUnderRef.current &&
        bgColor &&
        bgColor !== 'transparent' &&
        bgColor !== '#0a0a0a' &&
        bgColor !== '#000000' &&
        bgColor !== '#000'
          ? bgColor
          : null;

      const lines = getFrameLines(frameText);

      composePostProcess({
        ctx,
        width: backingW,
        height: backingH,
        stages: buildStages(postProcessRef.current, null),
        scale: scale * dpr,
        paintBase: plate
          ? (target) => {
              target.setTransform(dpr, 0, 0, dpr, 0, 0);
              target.translate(originX, originY);
              target.scale(scale, scale);
              target.fillStyle = plate;
              target.fillRect(0, 0, unscaledW, unscaledH);
              target.setTransform(1, 0, 0, 1, 0, 0);
            }
          : undefined,
        paintRaster: (target) => {
          target.setTransform(dpr, 0, 0, dpr, 0, 0);
          target.imageSmoothingEnabled = true;
          target.translate(originX, originY);
          target.scale(scale, scale);
          target.font = '10px "JuliaMono", "JetBrains Mono", "Courier New", monospace';
          target.textBaseline = 'top';
          target.textAlign = 'left';

          for (let y = row0; y < row1; y++) {
            const line = lines[y];
            if (!line) continue;
            const rowBase = y * cols;
            const yPx = y * cellH;
            const end = Math.min(col1, line.length);
            for (let x = col0; x < end; x++) {
              const ch = line[x];
              if (ch === ' ') continue;
              const cIdx = (rowBase + x) * 3;
              target.fillStyle = `rgb(${colors[cIdx]},${colors[cIdx + 1]},${colors[cIdx + 2]})`;
              target.fillText(ch, x * cellW, yPx);
            }
          }
          target.setTransform(1, 0, 0, 1, 0, 0);
        },
      });
      ctx.restore();
    },
    [cols, rows, getFrameLines]
  );

  /**
   * Copy the frame's source into the overlay layer.
   *
   * Called from `setFrame`, so it runs once per frame and never on a pan or a
   * zoom: the backing store is the source's own resolution and the CSS box
   * carries the view transform, so moving the camera costs nothing here. That
   * is also why this layer can never hit `MAX_BACKING_DIM` the way the raster
   * canvas does at deep zoom.
   */
  const blitSourceLayer = useCallback((src: HTMLCanvasElement | null, bgColor?: string) => {
    const dest = overlayCanvasRef.current;
    if (!dest) return;

    /*
     * Under an `under` overlay the raster canvas paints no ground, so the
     * frame's own background has to live here instead — otherwise the picture
     * falls back to `.viewport-content-ground`'s theme colour and a white
     * background setting silently turns dark. This reproduces the export
     * chain's layer order exactly: ground, then source, then blended raster.
     */
    const ground = overlayUnderRef.current && bgColor && bgColor !== 'transparent' ? bgColor : '';
    if (dest.style.backgroundColor !== ground) dest.style.backgroundColor = ground;

    if (!src || src.width === 0 || src.height === 0) {
      const c = dest.getContext('2d');
      if (c) c.clearRect(0, 0, dest.width, dest.height);
      return;
    }
    if (dest.width !== src.width || dest.height !== src.height) {
      dest.width = src.width;
      dest.height = src.height;
    }
    const ctx = dest.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, dest.width, dest.height);
    ctx.drawImage(src, 0, 0);
  }, []);

  /*
   * Depends on the whole transform, not just the scale: once the draw is
   * culled the canvas is viewport-anchored, so a pan changes which cells are
   * on screen. drawCanvas short-circuits a pan that only needs its CSS
   * translate moved, so the uncelled case stays free.
   */
  useEffect(() => {
    // Vector carries no frame text, so gate on having geometry instead.
    const hasContent =
      latestRasterModeRef.current === 'vector'
        ? Boolean(latestVectorRef.current)
        : Boolean(latestFrameTextRef.current);
    if (isColoredView && hasContent) {
      drawCanvas(
        latestFrameTextRef.current,
        latestColorsRef.current,
        latestBgColorRef.current,
        view,
        latestRasterModeRef.current,
        latestVectorRef.current
      );
    }
  }, [view, drawCanvas, isColoredView, resizeTick]);


  useImperativeHandle(ref, () => ({
    setFrame: (
      frameText: string,
      time: number,
      fps: number,
      colors?: Uint8ClampedArray | null,
      bgColor?: string,
      rasterMode?: RasterOutputMode,
      vector?: VectorFrame | null,
      sourceLayer?: HTMLCanvasElement | null
    ) => {
      // A new frame, by definition: invalidates the pan short-circuit in
      // drawCanvas regardless of whether the buffers came back identical.
      frameSeqRef.current++;
      blitSourceLayer(sourceLayer ?? null, bgColor);
      latestFrameTextRef.current = frameText;
      latestColorsRef.current = colors || null;
      latestBgColorRef.current = bgColor;
      latestVectorRef.current = vector || null;
      if (rasterMode) {
        latestRasterModeRef.current = rasterMode;
        // Mirror into state so auto-resolution and auto-fit, which size the
        // grid very differently for 1:1 cells, recompute on a mode switch.
        // setFrame runs every animation frame, so only commit on a change.
        if (rasterMode !== activeRasterModeRef.current) {
          activeRasterModeRef.current = rasterMode;
          setActiveRasterMode(rasterMode);
        }
      }

      /*
       * Which of the two output surfaces this frame belongs on. Vector always
       * takes the canvas: it has no colour buffer and no text, so neither of
       * the other two tests would catch it.
       */
      const isCanvasMode = Boolean(
        (colors && colors.length > 0) || rasterMode === 'pixel' || rasterMode === 'vector'
      );

      if (isCanvasMode) {
        if (!isColoredView) {
          setIsColoredView(true);
        }
        drawCanvas(
          frameText,
          colors || null,
          bgColor,
          // Read through the ref: setFrame runs from the animation loop and
          // must never paint at a transform the view has already moved past.
          viewRef.current,
          rasterMode || latestRasterModeRef.current,
          vector || null
        );
      } else {
        if (isColoredView) {
          setIsColoredView(false);
        }
        if (preRef.current) {
          preRef.current.textContent = frameText;
        }
        if (bloomPreRef.current) {
          bloomPreRef.current.textContent = frameText;
        }
      }

      if (timeSpanRef.current) {
        timeSpanRef.current.textContent = isTimelineDisabled ? 'STATIC' : `${time.toFixed(2)}s`;
      }
      if (fpsSpanRef.current) {
        fpsSpanRef.current.textContent = `${Math.round(fps)} FPS`;
      }
    },
    getFrameText: () => latestFrameTextRef.current,
    autoFit,
    getOptimalResolution,
    getViewFraming,
  }));

  /**
   * Set by the mode-switch restore below to let a remembered view survive the
   * refit that a resolution change would otherwise trigger on top of it.
   */
  const skipNextAutoFitRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (skipNextAutoFitRef.current) {
        skipNextAutoFitRef.current = false;
        return;
      }
      autoFit();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, autoFit]);

  /*
   * Re-fit a grid that auto-res just changed, in the same paint as the change.
   *
   * The delayed fit above cannot do this. A resolution change alters the
   * raster's unscaled size, so for the ~50ms until that timer runs the *new*
   * grid is painted at the *old* scale and the *old* pan — and because the
   * transform origin is the top-left corner (transform-origin: 0 0, needed so
   * the pan maths and the canvas blit agree), a grid that grew or shrank does
   * so away from that corner rather than about the centre. What you see is the
   * raster lurch sideways and change size, then snap back centred three frames
   * later. It reads as the zoom fighting the resolution.
   *
   * A layout effect runs after the DOM is updated but before the browser
   * paints, so the new grid and the fit that belongs to it land together and
   * there is no intermediate frame to see.
   *
   * Scoped to grids this component asked for. A manual resolution change, a
   * mode switch and a share-link restore all have their own choreography — and
   * the mode-switch restore in particular relies on the delayed fit being
   * skippable, which is why this claims the same flag rather than racing it.
   */
  const pendingAutoResFitRef = useRef<{
    cols: number;
    rows: number;
    /**
     * The framing to carry across, or null to re-fit from scratch.
     *
     * Carrying it is what makes a resolution change stop reading as a zoom. A
     * fit recomputed from a different cell count lands at a different scale,
     * so the raster visibly grows or shrinks and snaps back to centre — and if
     * the view had been zoomed or panned deliberately, that work is simply
     * thrown away. But the picture has not changed: it is the same image at a
     * different sampling density, and it should occupy exactly the same
     * rectangle it did a moment ago. Holding `cols * cellWidth * scale`
     * constant across the change is what keeps it there.
     *
     * Null after a viewfinder resize, where re-filling the new viewport is the
     * whole point, and on the first application, where there is no established
     * framing worth preserving.
     */
    preserve: { cols: number; scale: number; cx: number; cy: number } | null;
  } | null>(null);

  const prevGridRef = useRef<{ cols: number; rows: number }>({ cols, rows });

  useLayoutEffect(() => {
    const prevGrid = prevGridRef.current;
    const gridChanged = prevGrid.cols !== cols || prevGrid.rows !== rows;
    prevGridRef.current = { cols, rows };

    if (!gridChanged) return;

    /* The cols/rows change queues a delayed fit too; this one already did it. */
    skipNextAutoFitRef.current = true;

    const pending = pendingAutoResFitRef.current;
    if (pending && pending.cols === cols && pending.rows === rows) {
      pendingAutoResFitRef.current = null;
      const p = pending.preserve;
      if (p && p.cols > 0 && cols > 0) {
        /*
         * Same rendered width, different cell count. `framingToView` measures
         * against the new grid, so feeding it the compensated scale and the old
         * centre point reproduces the previous rectangle exactly.
         */
        let nextScale = p.scale * (p.cols / cols);
        /*
         * Pixel mode still owes its cells whole device pixels — a fractional
         * rung makes them alternate between N and N+1 wide. Rounded rather than
         * floored: this is not a fit trying to stay inside an edge, it is a
         * framing trying not to move, and the nearest rung moves it least.
         */
        if (latestRasterModeRef.current === 'pixel') {
          nextScale = snapScaleToCellGrid(nextScale, 'round');
        }
        const next = framingToView({ scale: nextScale, cx: p.cx, cy: p.cy });
        if (next) {
          setView(next);
          return;
        }
      }
      autoFit();
      return;
    }

    /*
     * Manual resolution change (sliders, presets, etc.):
     * Resize from the center of the image rather than the top-left origin.
     */
    const square = latestRasterModeRef.current !== 'ascii';
    const cellW = square ? 1 : MONOSPACE_CELL_WIDTH;
    const cellH = square ? 1 : MONOSPACE_CELL_HEIGHT;
    const curView = viewRef.current;

    const oldW = prevGrid.cols * cellW * curView.scale;
    const oldH = prevGrid.rows * cellH * curView.scale;
    const centerX = curView.tx + oldW / 2;
    const centerY = curView.ty + oldH / 2;

    const newW = cols * cellW * curView.scale;
    const newH = rows * cellH * curView.scale;
    const newTx = centerX - newW / 2;
    const newTy = centerY - newH / 2;

    setView({
      scale: curView.scale,
      ...clampPan(newTx, newTy, curView.scale),
    });
  }, [cols, rows, autoFit, framingToView, snapScaleToCellGrid, clampPan]);

  /*
   * A share link's framing, applied instead of the first auto-fit.
   *
   * Once only: after that the camera belongs to whoever is driving it, and
   * re-applying on a later render would yank the view back mid-gesture. It
   * runs on the same delay as the auto-fit above and rides its skip flag,
   * because the container has to be measured before a fraction can be turned
   * back into a pan.
   */
  const initialViewAppliedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!initialView || initialViewAppliedRef.current) return;
    const timer = setTimeout(() => {
      const next = framingToView(initialView);
      if (!next) return;
      initialViewAppliedRef.current = true;
      skipNextAutoFitRef.current = true;
      setView(next);
    }, 50);
    return () => clearTimeout(timer);
  }, [initialView, framingToView]);

  /*
   * Each content source keeps its own camera, so flipping synth -> media ->
   * model and back returns you to where you were rather than to a fresh fit.
   * Declared after the auto-fit effect so its flag lands before that timer.
   */
  const viewByModeRef = useRef<Record<string, ViewTransform>>({});
  const prevAppModeRef = useRef<string>(appMode);
  useEffect(() => {
    const prev = prevAppModeRef.current;
    if (prev === appMode) return;
    viewByModeRef.current[prev] = viewRef.current;
    prevAppModeRef.current = appMode;
    const saved = viewByModeRef.current[appMode];
    if (saved) {
      skipNextAutoFitRef.current = true;
      setView(saved);
    }
  }, [appMode]);

  /*
   * A shrinking viewfinder can strand a panned raster outside the box. Clamp
   * rather than recentre: recentring would yank a view the user just placed.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let resizeTimer: any;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setView((prev) => {
          const next = clampPan(prev.tx, prev.ty, prev.scale);
          return next.tx === prev.tx && next.ty === prev.ty ? prev : { ...prev, ...next };
        });
        /*
         * A culled canvas is sized to the viewport, so it has to be repainted
         * at the new size even when the clamp above leaves the pan untouched
         * and produces no state change of its own.
         */
        setResizeTick((t) => t + 1);
      }, 140);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [clampPan]);

  /*
   * Report the viewfinder's aspect to the sidebar so the resolution controls
   * can ratio-lock the grid against it. Runs regardless of autoRes, since the
   * lock is exactly what you reach for when autoRes is off.
   */
  useEffect(() => {
    if (!containerRef.current || !onViewfinderAspectChange) return;
    const el = containerRef.current;
    let resizeTimer: any;

    const report = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      onViewfinderAspectChange(clientWidth / clientHeight);
    };

    report();

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(report, 120);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [onViewfinderAspectChange]);

  /*
   * How often the controller is *asked*. Not how often the grid changes — it
   * answers "no change" for all but a handful of these, and after it has
   * latched it answers nothing else until an input actually moves.
   */
  const AUTO_RES_TICK_MS = 400;

  useEffect(() => {
    if (!autoRes || !containerRef.current || !onAutoResolutionChange) return;
    const el = containerRef.current;
    let resizeTimer: any;

    /*
     * One controller per activation, created here rather than in a ref so that
     * switching auto-res off and back on, or changing output mode, genuinely
     * starts over. A ref would keep a latch that had already settled and the
     * grid would never be re-solved.
     *
     * This is also why `autoFit` is no longer a dependency of this effect: it
     * changes identity with every cols/rows change, so keeping it here tore the
     * controller down and rebuilt it on each grid change — resetting the latch
     * every time and turning the whole thing back into a hunt.
     */
    const controller = createAutoResController();
    /*
     * The first grid this activation applies has no framing worth keeping —
     * the view may not have been fitted yet at all — so it fits. Everything
     * after it carries the framing across instead. See `preserve` above.
     */
    let hasAppliedOnce = false;

    const runAutoRes = (cause: 'resize' | 'tick') => {
      const input = buildAutoResInput();
      if (!input) return;

      const next = controller.next({ ...input, now: performance.now() });
      if (!next) return;
      /*
       * A solve that lands within a few percent of the grid already in force is
       * not worth a re-render: the raster visibly re-resolves each time, and
       * the resize stream alone is noisy enough to produce such a solve often.
       */
      if (!shouldReplaceGrid(gridRef.current, next)) return;
      /*
       * No autoFit() here, deliberately.
       *
       * It reads `cols`/`rows` from props, and the resolution change requested
       * on the line below has not arrived as props yet — so fitting now would
       * fit the grid being replaced. Instead the request is recorded, and the
       * layout effect above re-fits the moment the new grid lands, before the
       * browser has painted it. That is what keeps the change seamless.
       */
      /*
       * A resize wants the raster to re-fill the viewfinder it just got, so it
       * re-fits. Everything else — the measurement correction, a framerate
       * rescue — is the same picture at a different density and should not
       * move on screen at all.
       */
      const framing = cause === 'tick' && hasAppliedOnce ? getViewFramingRef.current() : null;
      pendingAutoResFitRef.current = {
        ...next,
        preserve: framing
          ? { cols: gridRef.current.cols, scale: framing.scale, cx: framing.cx, cy: framing.cy }
          : null,
      };
      hasAppliedOnce = true;
      onAutoResolutionChange(next.cols, next.rows);
    };

    runAutoRes('tick');

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        runAutoRes('resize');
      }, 120);
    });

    observer.observe(el);
    const tick = window.setInterval(() => runAutoRes('tick'), AUTO_RES_TICK_MS);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
      window.clearInterval(tick);
    };
  }, [autoRes, buildAutoResInput, onAutoResolutionChange]);

  /*
   * Pointer maths must measure whichever surface is actually on screen. The
   * <pre> stays mounted but display:none in canvas mode (coloured ASCII and
   * all of pixel mode), so reading it there yields a zero-size rect and every
   * handler bails out early -- which silently killed model orbit dragging.
   */
  const getSurfaceElement = (): HTMLElement | null =>
    (isColoredView ? canvasRef.current : preRef.current) || containerRef.current;

  /*
   * Drag routing. Media has no competing left-drag gesture, so it gets the
   * obvious one; synth keeps its particle clicks and model keeps its orbit,
   * and both reach the pan through the middle button. Space is already
   * play/pause app-wide, so it deliberately is not a pan modifier here.
   */
  const panDragRef = useRef<{ pointerId: number; startX: number; startY: number; tx: number; ty: number } | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);

  const isPanGesture = (e: React.PointerEvent<HTMLDivElement>): boolean =>
    e.button === 1 || (e.button === 0 && appMode === 'media');

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = getSurfaceElement();
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();

    if (isPanGesture(e)) {
      panDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
      setIsPanning(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      return;
    }

    if (rect.width <= 0 || rect.height <= 0) return;

    if (appMode === 'model') {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    } else if (appMode !== 'media') {
      const cx = ((e.clientX - rect.left) / rect.width) * cols;
      const cy = ((e.clientY - rect.top) / rect.height) * rows;
      if (onClick) onClick(cx, cy);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panDragRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      // Absolute from the gesture origin rather than accumulated deltas, so a
      // clamped edge does not bleed drift into the rest of the drag.
      const nextTx = pan.tx + (e.clientX - pan.startX);
      const nextTy = pan.ty + (e.clientY - pan.startY);
      setView((prev) => ({ ...prev, ...clampPan(nextTx, nextTy, prev.scale) }));
      return;
    }

    const targetElement = getSurfaceElement();
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (appMode === 'model') {
      if (isDraggingRef.current && onOrbitRotate) {
        const prevX = lastPosRef.current.x - rect.left;
        const prevY = lastPosRef.current.y - rect.top;
        const currX = e.clientX - rect.left;
        const currY = e.clientY - rect.top;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        onOrbitRotate(prevX, prevY, currX, currY, rect.width, rect.height);
      }
    } else if (appMode !== 'media') {
      const mouseX = ((e.clientX - rect.left) / rect.width) * cols;
      const mouseY = ((e.clientY - rect.top) / rect.height) * rows;
      if (mouseX >= 0 && mouseX < cols && mouseY >= 0 && mouseY < rows) {
        if (onMouseMove) onMouseMove(mouseX, mouseY);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      panDragRef.current = null;
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }
    if (appMode === 'model') {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  /*
   * Middle-click otherwise arms Windows' autoscroll, which hijacks the drag
   * and leaves a scroll cursor stuck over the viewfinder. Only the mousedown
   * event suppresses it; preventing the pointer event is not enough.
   */
  const handleMouseDownNative = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) e.preventDefault();
  };

  /**
   * Keyboard zoom. One notch, about the middle of the viewport.
   *
   * This used to keep its own multiplier for the non-pixel case, because
   * stepZoom's fine step was an additive 1% back then and would have needed a
   * hundred presses to double. stepZoom is geometric in every mode now, so
   * there is nothing left to special-case.
   */
  const nudgeZoom = useCallback(
    (dir: 1 | -1) => {
      zoomAboutCenter(stepZoom(viewRef.current.scale, dir));
    },
    [stepZoom, zoomAboutCenter]
  );

  /*
   * Wheel handling has to be a native non-passive listener: React registers
   * onWheel passively, so the preventDefault the model-mode dolly already
   * relied on was silently doing nothing.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinch arrives as ctrl+wheel, which is why it shares a branch
      // with the explicit modifier.
      const zoomModifier = e.ctrlKey || e.metaKey;

      /*
       * On the stacked narrow layout the page itself scrolls, so a bare wheel
       * belongs to the document -- swallowing it would trap the reader inside
       * the viewfinder with no way down to the controls. The model dolly still
       * responds, since it never needed to consume the event.
       */
      const isNarrowLayout =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
      if (isNarrowLayout && !zoomModifier) {
        if (appMode === 'model' && onWheelZoom) {
          onWheelZoom(e.deltaY > 0 ? 0.2 : -0.2);
        }
        return;
      }

      const horizontal =
        !zoomModifier && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY));
      if (horizontal) {
        e.preventDefault();
        const delta = e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) ? e.deltaY : e.deltaX;
        panBy(-delta, 0);
        return;
      }

      // Model mode spends the bare wheel on the camera dolly, so the view
      // zoom there needs the modifier.
      if (!zoomModifier && appMode === 'model' && onWheelZoom) {
        e.preventDefault();
        onWheelZoom(e.deltaY > 0 ? 0.2 : -0.2);
        return;
      }

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cur = viewRef.current.scale;
      /*
       * One wheel notch is one rung, never a coarse jump: a plain mouse wheel
       * reports deltaY of 100-120 per notch, so keying "coarse" off the
       * magnitude made every ordinary tick a four-cell leap.
       */
      const next =
        latestRasterModeRef.current === 'pixel'
          ? stepZoom(cur, e.deltaY > 0 ? -1 : 1)
          : cur * Math.exp(-e.deltaY * 0.0015);
      zoomAbout(next, e.clientX - rect.left, e.clientY - rect.top);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [appMode, onWheelZoom, panBy, zoomAbout, stepZoom]);

  /* Viewport hotkeys. 1 and 2 belong to the sidebar panels, hence 0 and 9. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      const isInput =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable);
      if (isInput || e.metaKey || e.ctrlKey || e.altKey) return;

      const nudge = e.shiftKey ? 60 : 15;
      switch (e.key) {
        case '0':
          e.preventDefault();
          autoFit();
          break;
        case '9':
          e.preventDefault();
          zoomAboutCenter(1);
          break;
        case '+':
        case '=':
          e.preventDefault();
          nudgeZoom(1);
          break;
        case '-':
        case '_':
          e.preventDefault();
          nudgeZoom(-1);
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          recenter();
          break;
        // Scroll semantics: the arrow moves the viewport, so the raster
        // travels the other way.
        case 'ArrowLeft':
          e.preventDefault();
          panBy(nudge, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          panBy(-nudge, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          panBy(0, nudge);
          break;
        case 'ArrowDown':
          e.preventDefault();
          panBy(0, -nudge);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [autoFit, zoomAboutCenter, nudgeZoom, recenter, panBy]);

  const showScanlines = crtConfig ? crtConfig.scanlines : true;
  const showCrtGlow = crtConfig && !isColoredView ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false;
  const showVignette = crtConfig ? crtConfig.vignette : false;
  /*
   * The CRT bloom stands down while the post-processing glow drives, and the
   * blurred `<pre>` underlayer becomes that glow's rendering on this path.
   * Two blurred copies of the same text at two radii is a smear, not a bloom.
   */
  const postGlowOnPre = glowActive(postProcess) && !isColoredView;
  const showPhosphorBloom =
    postGlowOnPre ||
    (crtConfig && !isColoredView ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false);

  const asciiColor = resolvePhosphorTint(theme, customThemeColor);
  const [ar, ag, ab] = hexToRgb(asciiColor);
  const asciiGlow = `rgba(${ar}, ${ag}, ${ab}, 0.11)`;

  /*
   * Optics on the monochrome text path, in CSS.
   *
   * An approximation, and the one place the viewport knowingly differs from
   * what a PNG of the same frame contains: a `<pre>` is not a canvas, so the
   * real chain cannot reach it. Aberration in particular is a pair of coloured
   * text shadows rather than a true channel split — it reads the same at a
   * glance and there is no cheaper honest option short of rasterizing the text
   * ourselves. Both are exact on every canvas path.
   */
  const preGlowFilter = postGlowOnPre
    ? `blur(${post.glow.radius.toFixed(2)}px) brightness(${(1 + post.glow.amount / 200).toFixed(2)})`
    : undefined;
  const preAberration = post.aberration.amount > 0 && !isColoredView ? post.aberration : null;
  const preAberrationShadow = preAberration
    ? (() => {
        const rad = (preAberration.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * preAberration.amount;
        const dy = Math.sin(rad) * preAberration.amount;
        return `${(-dx).toFixed(2)}px ${(-dy).toFixed(2)}px 0 rgba(255,0,0,0.75), ${dx.toFixed(2)}px ${dy.toFixed(2)}px 0 rgba(0,128,255,0.75)`;
      })()
    : null;

  // A couple of pixels of slack, so a fit that rounded to an odd number of
  // pixels does not permanently claim the view is panned.
  const centredPan = centerFor(view.scale);
  const isOffCentre =
    Math.abs(view.tx - centredPan.tx) > 2 || Math.abs(view.ty - centredPan.ty) > 2;

  /*
   * Default on: absent from older saved settings and shared links.
   *
   * Suppressed entirely while the media prompt is up. The grid still has a
   * nominal size with nothing loaded, so the bounds would outline an empty
   * rectangle and dim the space around it -- a frame around no picture, which
   * reads as a broken viewfinder rather than an empty one.
   */
  const showViewportBounds =
    !showMediaPlaceholder && (crtConfig ? (crtConfig.viewportBounds ?? true) : true);
  const contentBounds = cols > 0 && rows > 0 ? getContentSize(view.scale) : null;

  return (
    <div className="viewport-pane">
      {/* Visual Canvas Container */}
      <div
        ref={containerRef}
        className={[
          'viewport-canvas-container',
          showCrtGlow ? 'crt-glow-enabled' : '',
          appMode === 'model' ? 'model-orbit-active' : '',
          appMode === 'media' ? 'viewport-pan-ready' : '',
          isPanning ? 'viewport-panning' : '',
        ].filter(Boolean).join(' ')}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDownNative}
        onDoubleClick={handleDoubleClick}
        style={{
          ...(showCrtGlow ? {
            background: `radial-gradient(circle at center, ${asciiGlow} 0%, transparent 70%)`,
          } : {}),
        }}
      >
        {showScanlines && <div className="scanline-overlay" />}
        {showVignette && <div className="crt-vignette-overlay" />}

        {/*
          Dotted backdrop. Translated by the pan modulo one tile rather than
          re-drawn at a new background-position, so it rides the compositor
          with the rest of the pan instead of repainting every frame. The
          spacing is screen-fixed on purpose: a grid that scaled with the zoom
          would be a moire generator at 64x.
        */}
        <div
          className="viewport-dots"
          aria-hidden="true"
          style={{
            transform: `translate3d(${mod(view.tx, DOT_TILE_PX)}px, ${mod(view.ty, DOT_TILE_PX)}px, 0)`,
          }}
        />

        {/*
          The camera. Holds everything that is part of the picture, and exists
          so a zoom step can be animated: the new scale is committed and drawn
          immediately, then this element is given the inverse transform and
          animated back to identity. That tweens on the compositor from a
          bitmap already on screen, so a step costs exactly one rasterization
          instead of one per frame -- which matters, because scale is baked
          into the canvas backing store and cannot be transitioned in CSS.

          The dotted backdrop stays outside it: a backdrop that scaled with the
          picture would not read as a backdrop.
        */}
        <div className="viewport-camera" ref={cameraRef}>
        {/*
          The raster's own ground. Opaque, and drawn whether or not the bounds
          decoration is on: the ASCII text path is transparent between glyphs,
          so without it the dots would show straight through the artwork and
          the toggle would decide whether the picture is legible.

          With bounds enabled it also carries the hairline edge and a very
          large spread shadow that tints the void beyond. Both deliberately
          faint -- they say where the raster ends when you are panned off it,
          and disappear otherwise.
        */}
        {contentBounds && !showMediaPlaceholder && (
          <div
            className={`viewport-content-ground ${showViewportBounds ? 'with-bounds' : ''}`}
            aria-hidden="true"
            style={{
              transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
              width: `${contentBounds.w}px`,
              height: `${contentBounds.h}px`,
            }}
          />
        )}

        {/*
          Source overlay.

          Sized to the raster box and carrying the same translate, with a
          backing store fixed at the source's own resolution — so a pan and a
          zoom are both pure CSS and it can never hit MAX_BACKING_DIM the way
          the raster canvas can.

          `under` puts it below at `normal` and moves the blend onto the raster
          surfaces; `over` puts it above carrying the blend itself. Those are
          two different pictures, not one z-order swap — see the config type.
        */}
        {hasOverlay && contentBounds && !showMediaPlaceholder && (
          <div
            className="viewport-source-overlay-wrap"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
              width: `${contentBounds.w}px`,
              height: `${contentBounds.h}px`,
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: overlayUnder ? 1 : 3,
              opacity: post.sourceOverlay.opacity / 100,
              mixBlendMode: overlayUnder ? 'normal' : post.sourceOverlay.blend,
            }}
          >
            <canvas
              ref={overlayCanvasRef}
              className="viewport-source-overlay"
              aria-hidden="true"
              style={{
                display: 'block',
                position: 'absolute',
                top: post.sourceOverlay.blur && post.sourceOverlay.blur > 0 ? `-${post.sourceOverlay.blur * 1.5}px` : 0,
                left: post.sourceOverlay.blur && post.sourceOverlay.blur > 0 ? `-${post.sourceOverlay.blur * 1.5}px` : 0,
                width:
                  post.sourceOverlay.blur && post.sourceOverlay.blur > 0
                    ? `${contentBounds.w + post.sourceOverlay.blur * 3}px`
                    : `${contentBounds.w}px`,
                height:
                  post.sourceOverlay.blur && post.sourceOverlay.blur > 0
                    ? `${contentBounds.h + post.sourceOverlay.blur * 3}px`
                    : `${contentBounds.h}px`,
                filter:
                  post.sourceOverlay.blur && post.sourceOverlay.blur > 0
                    ? `blur(${post.sourceOverlay.blur}px)`
                    : undefined,
              }}
            />
          </div>
        )}

        {/*
          The canvas lives outside the stage because a culled draw anchors it to
          the viewport and paints the pan itself; in whole-raster mode
          drawCanvas gives it its own CSS translate instead. Either way it is
          positioned from the same origin as the stage.
        */}
        <canvas
          ref={canvasRef}
          className="ascii-canvas"
          style={{
            display: isColoredView ? 'block' : 'none',
            mixBlendMode: overlayUnder ? post.sourceOverlay.blend : undefined,
            /*
             * The pixel backing store snaps to whole cells, so it rarely maps
             * 1:1 onto the CSS box. Keep that residual resample nearest-
             * neighbour so cell edges stay hard instead of being smoothed.
             * Coloured ASCII draws glyphs and wants the default smoothing.
             */
            imageRendering: activeRasterMode === 'pixel' ? 'pixelated' : 'auto',
          }}
        />

        {/*
          The movable stage, carrying the text surfaces. The CRT overlays, the
          media prompt and the spinner sit outside it and so stay screen-fixed.
          Scale is still realised on the <pre> itself; only the translation
          lives here.
        */}
        {/*
          The stage blends as a *group* under an `under` overlay, so the bloom
          `<pre>` and the sharp one composite together first and only then
          against the source. Blending them separately would put the blurred
          copy through the blend twice.
        */}
        <div
          className="viewport-stage"
          style={{
            transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
            mixBlendMode: overlayUnder ? post.sourceOverlay.blend : undefined,
          }}
        >
          {/* Directional Phosphor Bloom Underlayer (Character Bloom) */}
          {showPhosphorBloom && !isColoredView && (
            <pre
              ref={bloomPreRef}
              aria-hidden="true"
              className={`ascii-pre ascii-bloom-pre ${gradientConfig ? 'gradient-enabled' : 'single-glow-enabled'}`}
              style={{
                transform: `scale(${zoom})`,
                fontSize: '10px',
                color: gradientConfig ? 'transparent' : (post.glow.tint || asciiColor),
                textShadow:
                  gradientConfig || postGlowOnPre
                    ? undefined
                    : `0 0 3px ${asciiColor}, 0 0 8px ${asciiGlow}`,
                /* Radius and strength come from the glow config when it drives. */
                ...(preGlowFilter ? { filter: preGlowFilter, opacity: 1 } : {}),
                ...(gradientConfig ? ({
                  '--text-gradient': `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`,
                } as React.CSSProperties) : {}),
              }}
            />
          )}

          {/* Sharp Foreground ASCII Text */}
          <pre
            ref={preRef}
            className={`ascii-pre ${gradientConfig ? 'gradient-enabled' : ''} ${showPhosphorBloom && !gradientConfig ? 'single-glow-enabled' : ''}`}
            style={{
              display: isColoredView ? 'none' : 'block',
              transform: `scale(${zoom})`,
              fontSize: '10px',
              color: gradientConfig ? 'transparent' : asciiColor,
              /*
               * Aberration wins the shadow slot when it is on: the CRT glow it
               * would otherwise carry is already being drawn by the blurred
               * underlayer above whenever the bloom is enabled at all.
               */
              textShadow:
                preAberrationShadow ||
                (showPhosphorBloom && !gradientConfig && !postGlowOnPre
                  ? `0 0 3px ${asciiColor}, 0 0 8px ${asciiGlow}`
                  : 'none'),
              ...(gradientConfig ? ({
                '--text-gradient': `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`,
              } as React.CSSProperties) : {}),
            }}
          />
        </div>
        {/*
          The crop marquee.

          Inside the camera and translated by the pan like the ground is, so it
          rides a pan and a zoom with the picture instead of being re-derived
          against the container. Last in the camera because it is modal while
          open: it covers the raster deliberately, and the source it paints is
          the uncropped one the rectangle is being chosen from.
        */}
        {cropEditing && contentBounds && mediaConfig && cropDraft && (
          <div
            className="crop-stage-anchor"
            style={{ transform: `translate3d(${view.tx}px, ${view.ty}px, 0)` }}
          >
            <CropOverlay
              mediaElement={mediaElement ?? null}
              mediaConfig={mediaConfig}
              cols={cols}
              rows={rows}
              pxPerCol={contentBounds.w / Math.max(1, cols)}
              pxPerRow={contentBounds.h / Math.max(1, rows)}
              cellAspect={activeRasterMode === 'ascii' ? MONOSPACE_CELL_ASPECT : 1}
              resampling={resampling}
              crop={cropDraft}
              onChange={(c) => onCropDraftChange?.(c)}
              onCommit={(c) => onCropDraftCommit?.(c)}
              onApply={() => onCropApply?.()}
              onCancel={() => onCropCancel?.()}
            />
          </div>
        )}

        </div>

        {/* No-Media Prompt: fixed size, outside the zoomed raster surface */}
        {showMediaPlaceholder && !isLoading && (
          <div
            className="media-placeholder-modal"
            /* Purely informational, so it must not swallow drops or clicks. */
            style={{ pointerEvents: 'none' }}
          >
            <ImagePlus size={22} strokeWidth={1.5} />
            <span className="media-placeholder-title">ADD MEDIA TO START</span>
            <span className="media-placeholder-hint">
              DRAG &amp; DROP &middot; PASTE &middot; OPEN FILE
            </span>
          </div>
        )}

        {/* ASCII Loading Spinner Overlay */}
        {isLoading && (
          <AsciiLoadingSpinner fileName={loadingFileName} statusText={loadingStatusText} />
        )}
      </div>

      {/* Bottom Timeline and Diagnostics Bar */}
      <div className="viewport-bottom-bar">
        <div className="status-group">
          {isTimelineDisabled ? (
            <>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Playback disabled for static 2D image"
              >
                <Play size={12} />
                PLAY
              </button>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Step disabled for static 2D image"
              >
                STEP
              </button>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Reset disabled for static 2D image"
              >
                <RotateCcw size={12} />
                RESET
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm"
                onClick={onTogglePlay}
                title={isPlaying ? 'Pause Animation (Space)' : 'Play Animation (Space)'}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
              {!isPlaying && (
                <button className="btn btn-sm" onClick={onStepFrame} title="Step 1 Frame">
                  STEP
                </button>
              )}
              <button className="btn btn-sm" onClick={onResetTime} title="Reset Time to 0">
                <RotateCcw size={12} />
                RESET
              </button>
            </>
          )}

          <span className="status-tag">
            FPS: <strong ref={fpsSpanRef}>{isTimelineDisabled ? 'STATIC' : '0'}</strong>
          </span>
          <span className="status-tag">
            T: <strong ref={timeSpanRef}>0s</strong>
          </span>
          <span className="status-tag res-tag">
            RES: <strong>{cols}x{rows}</strong>
          </span>
        </div>

        <div className="status-group">
          <span className="status-tag mode-tag">
            PRESET: <strong>{presetName}{isEdited ? ' <edited>' : ''}</strong>
          </span>

          {onToggleAutoRes && (
            <button
              className={`btn btn-sm ${autoRes ? 'btn-primary' : ''}`}
              onClick={onToggleAutoRes}
              title={
                autoRes
                  ? 'Auto Resolution is ON: the grid is solved from the content, the viewfinder, this machine and the target framerate. Click to lock the current resolution.'
                  : 'Auto Resolution is OFF (fixed size). Click to let the grid be solved automatically.'
              }
            >
              <Crop size={11} />
              <span className="btn-label-sm">{autoRes ? 'AUTO RES [ON]' : 'AUTO RES'}</span>
            </button>
          )}

          {/*
            Crop. Media only, and only with something loaded — the marquee
            frames a source, and there is nothing to frame otherwise.
          */}
          {onToggleCrop && appMode === 'media' && !showMediaPlaceholder && (
            <button
              className={`btn btn-sm ${cropEditing ? 'btn-primary' : ''}`}
              onClick={onToggleCrop}
              title={cropEditing ? 'Close the crop marquee' : 'Crop the source'}
            >
              <Scissors size={11} />
              <span className="btn-label-sm">CROP</span>
            </button>
          )}

          <div className="btn-group zoom-control-group">
            <button
              className="btn btn-sm"
              onClick={(e) => zoomAboutCenter(stepZoom(viewRef.current.scale, -1, e.shiftKey))}
              title="Zoom Out (hold Shift for a coarse step) [-]"
            >
              <ZoomOut size={12} />
            </button>
            <button
              className={`btn btn-sm zoom-readout-btn ${isZoomMenuOpen ? 'btn-primary' : ''}`}
              onClick={() => setIsZoomMenuOpen((o) => !o)}
              title="Zoom presets, fit and recentre"
            >
              {(zoom * 100).toFixed(0)}%
              {/* Quiet marker that the view is panned off-centre, so a lost
                  raster is always one glance and one click from recovery. */}
              {isOffCentre && <span className="zoom-offcentre-dot" aria-label="panned" />}
            </button>
            <button
              className="btn btn-sm"
              onClick={(e) => zoomAboutCenter(stepZoom(viewRef.current.scale, 1, e.shiftKey))}
              title="Zoom In (hold Shift for a coarse step) [+]"
            >
              <ZoomIn size={12} />
            </button>

            {isZoomMenuOpen && (
              <>
                <div className="zoom-menu-scrim" onClick={() => setIsZoomMenuOpen(false)} />
                <div className="zoom-menu" role="menu">
                  <button
                    className="zoom-menu-item"
                    onClick={() => { autoFit(); setIsZoomMenuOpen(false); }}
                  >
                    <span>FIT</span>
                    <span className="zoom-menu-key">0</span>
                  </button>
                  {ZOOM_PRESETS.map((p) => (
                    <button
                      key={p}
                      className={`zoom-menu-item ${Math.abs(zoom - p) < 0.005 ? 'active' : ''}`}
                      onClick={() => { zoomAboutCenter(p); setIsZoomMenuOpen(false); }}
                    >
                      <span>{p * 100}%</span>
                      {p === 1 && <span className="zoom-menu-key">9</span>}
                    </button>
                  ))}
                  <div className="zoom-menu-sep" />
                  <button
                    className="zoom-menu-item"
                    onClick={() => { recenter(); setIsZoomMenuOpen(false); }}
                    disabled={!isOffCentre}
                  >
                    <span>RECENTRE</span>
                    <span className="zoom-menu-key">C</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Viewfinder Display & Performance Settings Button */}
          {crtConfig && optimizeConfig && onChangeCrtConfig && onChangeOptimizeConfig && (
            <button
              className={`btn btn-sm ${isSettingsOpen ? 'btn-primary' : ''}`}
              onClick={() => setIsSettingsOpen(true)}
              title="Viewfinder Display & Performance Settings"
            >
              <Settings size={12} />
              <span className="btn-label-sm">SETTINGS</span>
            </button>
          )}

          {onToggleViewMode && (
            <button
              className={`btn btn-sm ${viewMode === 'fullscreen' ? 'btn-primary' : ''}`}
              onClick={onToggleViewMode}
              title={viewMode === 'fullscreen' ? 'Return to Edit Mode' : 'Fullscreen Viewfinder'}
            >
              {viewMode === 'fullscreen' ? (
                <>
                  <Edit3 size={12} />
                  <span className="btn-label-sm">EDIT</span>
                </>
              ) : (
                <Maximize2 size={12} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Viewfinder & Hardware Settings Modal */}
      {crtConfig && optimizeConfig && onChangeCrtConfig && onChangeOptimizeConfig && (
        <ViewfinderSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          crtConfig={crtConfig}
          onChangeCrtConfig={onChangeCrtConfig}
          optimizeConfig={optimizeConfig}
          onChangeOptimizeConfig={onChangeOptimizeConfig}
          uiThemeSettings={uiThemeSettings}
          onChangeUiThemeSettings={onChangeUiThemeSettings}
          isSyncEligible={isSyncEligible}
          isStaticImage={isTimelineDisabled}
          isContentColorActive={isColoredView}
        />
      )}
    </div>
  );
});
