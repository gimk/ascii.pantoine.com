import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, RotateCcw, Copy, ZoomIn, ZoomOut, Maximize2, Edit3, Crop, Settings, ImagePlus } from 'lucide-react';
import {
  PhosphorTheme,
  PhosphorGradient,
  CrtConfig,
  OptimizeConfig,
  RasterOutputMode,
  UiThemeSettings,
} from '../types/ascii';

import { AsciiLoadingSpinner } from './AsciiLoadingSpinner';
import { ViewfinderSettingsModal } from './ViewfinderSettingsModal';
import { MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from '../engine/renderer';
import { resolvePhosphorTint } from '../engine/palettes';

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


export interface AsciiViewportHandle {
  setFrame: (
    frameText: string,
    time: number,
    fps: number,
    colors?: Uint8ClampedArray | null,
    bgColor?: string,
    rasterMode?: RasterOutputMode
  ) => void;
  getFrameText: () => string;
  autoFit: () => void;
  getOptimalResolution: () => { cols: number; rows: number } | null;
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
  /**
   * Media mode with no source loaded. Drawn as a fixed-size DOM prompt rather
   * than into the raster grid, so it stays legible at any zoom and in pixel
   * mode.
   */
  showMediaPlaceholder?: boolean;
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
  showMediaPlaceholder = false,
}, ref) => {
  const isTimelineDisabled = appMode === 'media' && mediaType === 'image';
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const bloomPreRef = useRef<HTMLPreElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 1:1 scratch buffer for pixel mode; blitted to the visible canvas so cells
  // land on exact device pixels instead of fractional fillRect edges.
  const pixelBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const timeSpanRef = useRef<HTMLElement>(null);
  const fpsSpanRef = useRef<HTMLElement>(null);
  
  const latestFrameTextRef = useRef<string>('');
  const latestColorsRef = useRef<Uint8ClampedArray | null>(null);
  const latestBgColorRef = useRef<string | undefined>(undefined);
  
  const [isColoredView, setIsColoredView] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [view, setView] = useState<ViewTransform>({ scale: 1.0, tx: 0, ty: 0 });
  const viewRef = useRef<ViewTransform>(view);
  viewRef.current = view;
  /** Read-only alias; the render body only ever cares about the scale. */
  const zoom = view.scale;
  const [activeRasterMode, setActiveRasterMode] = useState<RasterOutputMode>('ascii');
  const activeRasterModeRef = useRef<RasterOutputMode>('ascii');
  const [copied, setCopied] = useState<boolean>(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState<boolean>(false);
  /** Bumped on container resize purely to force a culled canvas to repaint. */
  const [resizeTick, setResizeTick] = useState<number>(0);

  const getOptimalResolution = useCallback((): { cols: number; rows: number } | null => {
    if (!containerRef.current) return null;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return null;

    /*
     * Pixel mode is a raster, not a text grid: the search below is tuned for
     * character cells (2-7.5k cells, 180 col ceiling) and leaves a 1:1 grid
     * occupying a fraction of the viewfinder. Instead pick the smallest whole
     * number of screen pixels per cell that keeps the grid inside the cell
     * budget, then fill the viewport at that scale. Whole-number scaling is
     * what drawCanvas snaps to anyway, so the result blits without resampling.
     */
    if (activeRasterMode === 'pixel') {
      const pad = 20;
      const availableWidth = Math.max(80, clientWidth - pad);
      const availableHeight = Math.max(60, clientHeight - pad);

      // Ceiling on live cells. Synth and model re-dither every frame, so this
      // trades raster detail against holding framerate on a full-screen grid.
      const MAX_PIXEL_CELLS = 40000;
      const scale = Math.max(
        2,
        Math.min(
          16,
          Math.ceil(Math.sqrt((availableWidth * availableHeight) / MAX_PIXEL_CELLS))
        )
      );

      return {
        cols: Math.max(32, Math.floor(availableWidth / scale)),
        rows: Math.max(24, Math.floor(availableHeight / scale)),
      };
    }

    const charWidth = MONOSPACE_CELL_WIDTH;
    const charHeight = MONOSPACE_CELL_HEIGHT;
    const pad = 20;
    const availableWidth = Math.max(80, clientWidth - pad);
    const availableHeight = Math.max(60, clientHeight - pad);
    const windowRatio = availableWidth / availableHeight;
    const charAspectCompensation = charHeight / charWidth;

    const targetCells = Math.max(2000, Math.min(7500, Math.round((availableWidth * availableHeight) / 95)));

    let bestCols = 100;
    let bestRows = 50;
    let minScore = Infinity;

    const minRows = Math.max(20, Math.min(35, Math.floor(availableHeight / 20)));
    const maxRows = Math.min(80, Math.max(45, Math.floor(availableHeight / 8)));

    for (let r = minRows; r <= maxRows; r++) {
      let c = Math.round(r * windowRatio * charAspectCompensation);
      if (c % 2 !== 0) c += 1;
      if (c < 36 || c > 180) continue;

      const gridVisualWidth = c * charWidth;
      const gridVisualHeight = r * charHeight;
      const gridRatio = gridVisualWidth / gridVisualHeight;

      const ratioMismatch = Math.abs(gridRatio - windowRatio) / windowRatio;
      const cellCount = c * r;
      const densityPenalty = (Math.abs(cellCount - targetCells) / targetCells) * 0.08;

      const score = ratioMismatch + densityPenalty;

      if (score < minScore) {
        minScore = score;
        bestCols = c;
        bestRows = r;
      }
    }

    return { cols: bestCols, rows: bestRows };
  }, [activeRasterMode]);

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
      const isPixel = latestRasterModeRef.current === 'pixel';
      const cellW = isPixel ? 1 : MONOSPACE_CELL_WIDTH;
      const cellH = isPixel ? 1 : MONOSPACE_CELL_HEIGHT;
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

  /**
   * Scale about a point, keeping whatever sits under it pinned in place.
   *
   * `px`/`py` are container-relative. The maths is independent of how the
   * scale is realised (canvas backing store or CSS transform) because the
   * content always grows from the stage origin.
   */
  const zoomAbout = useCallback(
    (nextScale: number, px: number, py: number) => {
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

  /*
   * Zoom bounds for the manual steppers. autoFit already fits up to 5x, so the
   * old 3x button ceiling could not even step back to a scale the Fit button
   * had just set. Pixel mode in particular wants deep zoom: at 1 device pixel
   * per cell a 256-wide dither is thumbnail-sized until well past 300%.
   * The step scales with the current zoom so crossing the range stays a few
   * clicks instead of eighty.
   */
  /*
   * Two different notions of a zoom step, because the two output modes scale
   * differently:
   *
   *  - ASCII scales through a CSS transform, so any fractional zoom is exact.
   *    Steps are a true 1% (25% with shift held for crossing the range).
   *  - Pixel mode snaps its backing store to whole device pixels per cell (see
   *    drawCanvas), so a fractional zoom means resampling cols*9 into a
   *    cols*8.5 box and losing the hard cell edges the mode exists for. Its
   *    steps are therefore whole cell scales, adjusted for devicePixelRatio so
   *    one click is one more screen pixel per cell.
   */
  const stepZoom = useCallback((z: number, dir: 1 | -1, coarse = false) => {
    const isPixel = latestRasterModeRef.current === 'pixel';
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    /** One device pixel per cell: the point below which the ladder runs out. */
    const rungFloor = 1 / dpr;

    if (isPixel && z >= rungFloor - 1e-9) {
      /*
       * Rungs are counted in single device pixels per cell; a coarse step just
       * crosses several of them at once. Quantising the *current* rung to a
       * multiple of the step instead put 100% on a 1x display at rung 0, so
       * one coarse click jumped straight to 400% and the click back landed
       * below the floor and fell through to the linear creep below -- zoom in
       * by 300 points, zoom out by 25.
       */
      const cellsPerClick = coarse ? 4 : 1;
      const currentRung = Math.max(1, Math.round(z * dpr));
      const nextRung = currentRung + dir * cellsPerClick;
      if (nextRung >= 1) {
        return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number((nextRung / dpr).toFixed(2))));
      }
      // Stepping down from the floor itself: land exactly on it before the
      // linear range below takes over, so no rung is skipped on the way out.
      if (z > rungFloor + 1e-9) {
        return Number(rungFloor.toFixed(2));
      }
      /*
       * Already at one device pixel per cell and still going down. The backing
       * store cannot shrink further and the browser downsamples the blit
       * instead, so the ladder has no rung left. Falling through to linear
       * steps is what lets a grid larger than the viewport be zoomed out to
       * fit -- clamping here pinned the minimum to 100% on a 1x display.
       */
    }

    const next = z + dir * (coarse ? 0.25 : 0.01);
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(next.toFixed(2))));
  }, []);

  const autoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const isPixel = latestRasterModeRef.current === 'pixel';
    const charWidth = isPixel ? 1 : MONOSPACE_CELL_WIDTH;
    const charHeight = isPixel ? 1 : MONOSPACE_CELL_HEIGHT;
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
  } | null>(null);

  const drawCanvas = useCallback(
    (
      frameText: string,
      colors: Uint8ClampedArray | null,
      bgColor: string | undefined,
      v: ViewTransform,
      rasterMode: RasterOutputMode = 'ascii'
    ) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

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
        prev.rows === rows;

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

        if (culled) {
          const sw = col1 - col0;
          const sh = row1 - row0;
          if (sw > 0 && sh > 0) {
            // Anchor on whole device pixels so cell edges stay hard.
            const dx = Math.round(originX * dpr) + col0 * cellPx;
            const dy = Math.round(originY * dpr) + row0 * cellPx;
            if (bgColor && bgColor !== 'transparent') {
              ctx.fillStyle = bgColor;
              ctx.fillRect(dx, dy, sw * cellPx, sh * cellPx);
            }
            ctx.drawImage(buf, col0, row0, sw, sh, dx, dy, sw * cellPx, sh * cellPx);
          }
        } else {
          if (bgColor && bgColor !== 'transparent') {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(buf, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
        }
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.translate(originX, originY);
      ctx.scale(scale, scale);

      if (bgColor && bgColor !== 'transparent' && bgColor !== '#0a0a0a' && bgColor !== '#000000' && bgColor !== '#000') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, unscaledW, unscaledH);
      }

      ctx.font = '10px "JuliaMono", "JetBrains Mono", "Courier New", monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      const lines = getFrameLines(frameText);
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
          ctx.fillStyle = `rgb(${colors[cIdx]},${colors[cIdx + 1]},${colors[cIdx + 2]})`;
          ctx.fillText(ch, x * cellW, yPx);
        }
      }
      ctx.restore();
    },
    [cols, rows, getFrameLines]
  );

  /*
   * Depends on the whole transform, not just the scale: once the draw is
   * culled the canvas is viewport-anchored, so a pan changes which cells are
   * on screen. drawCanvas short-circuits a pan that only needs its CSS
   * translate moved, so the uncelled case stays free.
   */
  useEffect(() => {
    if (isColoredView && latestFrameTextRef.current) {
      drawCanvas(
        latestFrameTextRef.current,
        latestColorsRef.current,
        latestBgColorRef.current,
        view,
        latestRasterModeRef.current
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
      rasterMode?: RasterOutputMode
    ) => {
      // A new frame, by definition: invalidates the pan short-circuit in
      // drawCanvas regardless of whether the buffers came back identical.
      frameSeqRef.current++;
      latestFrameTextRef.current = frameText;
      latestColorsRef.current = colors || null;
      latestBgColorRef.current = bgColor;
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

      const isCanvasMode = Boolean((colors && colors.length > 0) || rasterMode === 'pixel');

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
          rasterMode || latestRasterModeRef.current
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

  useEffect(() => {
    if (!autoRes || !containerRef.current || !onAutoResolutionChange) return;
    const el = containerRef.current;
    let resizeTimer: any;

    const runAutoRes = () => {
      const optimal = getOptimalResolution();
      if (optimal) {
        onAutoResolutionChange(optimal.cols, optimal.rows);
        autoFit();
      }
    };

    runAutoRes();

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        runAutoRes();
      }, 120);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [autoRes, getOptimalResolution, onAutoResolutionChange, autoFit]);

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
   * Keyboard and menu zoom steps.
   *
   * Pixel mode rides the whole-cell ladder stepZoom maintains; everything else
   * moves multiplicatively, because stepZoom's 1% fine step would need a
   * hundred presses to double and is meant for the on-screen steppers.
   */
  const nudgeZoom = useCallback(
    (dir: 1 | -1) => {
      const cur = viewRef.current.scale;
      const next =
        latestRasterModeRef.current === 'pixel'
          ? stepZoom(cur, dir)
          : cur * (dir > 0 ? 1.25 : 1 / 1.25);
      zoomAboutCenter(next);
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

  const copySnapshot = () => {
    const text = latestFrameTextRef.current || preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const showScanlines = crtConfig ? crtConfig.scanlines : true;
  const showCrtGlow = crtConfig && !isColoredView ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false;
  const showVignette = crtConfig ? crtConfig.vignette : false;
  const showPhosphorBloom = crtConfig && !isColoredView ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false;

  const asciiColor = resolvePhosphorTint(theme, customThemeColor);
  const [ar, ag, ab] = hexToRgb(asciiColor);
  const asciiGlow = `rgba(${ar}, ${ag}, ${ab}, 0.11)`;

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
        onDoubleClick={autoFit}
        style={{
          ...(showCrtGlow ? {
            background: `radial-gradient(circle at center, ${asciiGlow} 0%, transparent 70%)`,
          } : {}),
        }}
      >
        {showScanlines && <div className="scanline-overlay" />}
        {showVignette && <div className="crt-vignette-overlay" />}

        {/*
          Content bounds and the void outside them. One element does both: the
          hairline is its border, and a very large spread box-shadow tints
          everything beyond it. Deliberately faint -- it should tell you where
          the raster ends when you are panned off it, and be invisible
          otherwise.
        */}
        {showViewportBounds && contentBounds && (
          <div
            className="viewport-bounds"
            aria-hidden="true"
            style={{
              transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
              width: `${contentBounds.w}px`,
              height: `${contentBounds.h}px`,
            }}
          />
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
        <div
          className="viewport-stage"
          style={{ transform: `translate3d(${view.tx}px, ${view.ty}px, 0)` }}
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
                color: gradientConfig ? 'transparent' : asciiColor,
                textShadow: gradientConfig ? undefined : `0 0 3px ${asciiColor}, 0 0 8px ${asciiGlow}`,
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
              textShadow: showPhosphorBloom && !gradientConfig ? `0 0 3px ${asciiColor}, 0 0 8px ${asciiGlow}` : 'none',
              ...(gradientConfig ? ({
                '--text-gradient': `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`,
              } as React.CSSProperties) : {}),
            }}
          />
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

          {onToggleAutoRes && (
            <button
              className={`btn btn-sm ${autoRes ? 'btn-primary' : ''}`}
              onClick={onToggleAutoRes}
              title={
                autoRes
                  ? 'Auto Resolution is ON (adapts to window/viewfinder size). Click to lock current resolution.'
                  : 'Auto Resolution is OFF (fixed size). Click to toggle Auto Resolution.'
              }
            >
              <Crop size={11} />
              <span className="btn-label-sm">{autoRes ? 'AUTO RES [ON]' : 'AUTO RES'}</span>
            </button>
          )}
        </div>

        <div className="status-group">
          <span className="status-tag mode-tag">
            PRESET: <strong>{presetName}{isEdited ? ' <edited>' : ''}</strong>
          </span>

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

          <button className="btn btn-sm" onClick={copySnapshot} title="Copy Current Frame">
            <Copy size={12} />
            {copied ? 'COPIED!' : 'SNAP'}
          </button>

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
