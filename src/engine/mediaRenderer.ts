import {
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
  RasterOutputMode,
  DitherAlgorithm,
  DitherParams,
  ToneMappingConfig,
  ResamplingMode,
  VectorConfig,
  VectorFrame,
  CropRect,
  CROP_FULL,
  CROP_MIN_SPAN,
} from '../types/ascii';
import { MONOSPACE_CELL_ASPECT } from './renderer';
import { processRasterFrame, toPipelineAdjustments, createToneCurveLUT, evaluateMonotoneCubicSpline, EMPTY_HISTOGRAM } from './rasterEngine';

export { createToneCurveLUT, evaluateMonotoneCubicSpline };


export interface RenderMediaContext {
  cols: number;
  rows: number;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig: MediaConfig;
  viewConfig: MediaViewConfig;
  density: string;
  colorConfig?: MediaColorConfig;
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  toneConfig?: ToneMappingConfig;
}


export interface AsciiMediaFrameResult {
  text: string;
  colors: Uint8ClampedArray | null; // RGB buffer (size = cols * rows * 3)
  luminance: Float32Array | null; // size = cols * rows
  bgColor: string;
  isColored: boolean;
  cols: number;
  rows: number;
  rasterMode?: RasterOutputMode;
  /** Beam geometry in vector mode; null in the cell modes. See ProcessedRasterResult. */
  vector?: VectorFrame | null;
  /** See ProcessedRasterResult: 256 bins of pre-levels luminance, live buffer. */
  histogram: Uint32Array;
  histogramOpaque: number;
}

export function resolveMediaBackgroundColor(colorConfig?: MediaColorConfig, viewConfigBackground?: string): string {
  if (colorConfig?.mode === 'content') {
    if (colorConfig.bgPreset === 'white') return '#ffffff';
    if (colorConfig.bgPreset === 'dark') return '#0a0a0a';
    if (colorConfig.bgPreset === 'custom') return colorConfig.customBg || '#0a0a0a';
  }
  if (viewConfigBackground === 'white') return '#ffffff';
  return '#0a0a0a';
}

// Scratch offscreen canvas for zero allocations
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  if (!offscreenCanvas && typeof document !== 'undefined') {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (offscreenCanvas) {
    if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas.width = Math.max(1, width);
      offscreenCanvas.height = Math.max(1, height);
    }
  }
  return { canvas: offscreenCanvas!, ctx: offscreenCtx };
}

/** Intrinsic pixel dimensions of whatever kind of element the media is. */
export function measureMedia(
  el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): { width: number; height: number } {
  if (el instanceof HTMLImageElement) {
    return { width: el.naturalWidth || el.width || 100, height: el.naturalHeight || el.height || 100 };
  }
  if (el instanceof HTMLVideoElement) {
    return { width: el.videoWidth || el.width || 100, height: el.videoHeight || el.height || 100 };
  }
  return { width: el.width || 100, height: el.height || 100 };
}

export interface FramedMediaOptions {
  cols: number;
  rows: number;
  /** 0.6015 for the glyph grid, 1.0 for pixel and vector. Invariant 7. */
  cellAspect: number;
  resampling: ResamplingMode;
  /**
   * Output pixels per grid cell, applied as a uniform pre-scale.
   *
   * 1 draws into a `cols x rows` buffer, which is what the raster pipeline
   * wants. The source overlay asks for the raster's *display* box instead —
   * `MONOSPACE_CELL_WIDTH` px per cell in ASCII — because a `cols x rows`
   * layer sitting under 6px-wide glyphs is six times too soft.
   *
   * Uniform is what makes this exact rather than a re-derivation: every length
   * in the framing maths below is in grid cells, so scaling the whole
   * coordinate space reproduces the identical framing at any resolution, with
   * no per-`fit` special case. `cellAspect` still un-squashes inside it.
   */
  pixelsPerCellX?: number;
  pixelsPerCellY?: number;
}

/**
 * Where the source lands in the grid, as numbers rather than as a side effect
 * on a context.
 *
 * Split out of `drawFramedMedia` because the crop marquee has to invert this
 * transform to turn a pointer position on screen back into a point on the
 * source, and a second copy of the maths in the viewport is a copy that
 * drifts. The renderer applies it; the overlay inverts it; neither owns it.
 *
 * Everything is in **grid units** (columns and rows), before any
 * `pixelsPerCell` pre-scale — that scale is uniform, so it composes on the
 * outside and changes nothing here.
 */
export interface MediaFraming {
  /** The `drawImage` source rect, in source pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /**
   * Destination box, centred on the origin, in *virtual* units — grid columns
   * across, and rows-divided-by-cellAspect down. `scale(1, cellAspect)` turns
   * the second into real rows.
   */
  drawW: number;
  drawH: number;
  /** Where that box is centred, in grid units. */
  cx: number;
  cy: number;
  cellAspect: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** An absent, malformed or inverted crop all resolve to the whole frame. */
export function resolveCrop(crop?: CropRect | null): CropRect {
  if (!crop) return CROP_FULL;
  const { x, y, w, h } = crop;
  if (![x, y, w, h].every((n) => typeof n === 'number' && isFinite(n))) return CROP_FULL;
  const cw = Math.min(1, Math.max(CROP_MIN_SPAN, w));
  const ch = Math.min(1, Math.max(CROP_MIN_SPAN, h));
  return {
    x: Math.min(1 - cw, Math.max(0, x)),
    y: Math.min(1 - ch, Math.max(0, y)),
    w: cw,
    h: ch,
  };
}

/**
 * The source dimensions the raster is actually made of: crop applied, and the
 * rotated rectangle's bounding box.
 *
 * Every panel that sizes the grid against "the source" wants these, not the
 * intrinsic ones. Sized against the intrinsic dimensions, a DPI change or a
 * fraction preset re-derives the *uncropped* aspect and the picture goes back
 * to letterboxing inside its old shape — the crop is still applied, but the
 * canvas it is drawn into no longer has its proportions.
 *
 * The rotation term is the bounding box rather than a 90-degree swap because
 * the angle is a free slider: at 90 it reduces to that swap, and at 45 it
 * gives the square that contains the diamond. Anything narrower clips the
 * corners off every intermediate angle.
 */
export function measureFramedMedia(
  el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null | undefined,
  mediaConfig?: MediaConfig | null,
  fallback: { width: number; height: number } = { width: 256, height: 256 }
): { width: number; height: number } {
  const src = el ? measureMedia(el) : fallback;
  const c = resolveCrop(mediaConfig?.crop);
  const cw = src.width * c.w;
  const ch = src.height * c.h;
  const rad = ((mediaConfig?.rotation || 0) * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  return {
    width: cw * cosA + ch * sinA,
    height: cw * sinA + ch * cosA,
  };
}

/** Is this crop doing anything? Drives the badge and the reset affordance. */
export function cropActive(crop?: CropRect | null): boolean {
  const c = resolveCrop(crop);
  return c.x > 0 || c.y > 0 || c.w < 1 || c.h < 1;
}

export function computeMediaFraming(
  srcWidth: number,
  srcHeight: number,
  mediaConfig: MediaConfig,
  opts: { cols: number; rows: number; cellAspect: number }
): MediaFraming {
  const { cols, rows, cellAspect } = opts;

  /*
   * The crop *is* the source from here down. Every length below reads from the
   * rect rather than from the image, which is the whole trick: fit, scale, pan
   * and rotation need no crop-aware branch, because as far as they can tell the
   * picture simply has different dimensions.
   */
  const crop = resolveCrop(mediaConfig.crop);
  const sw = Math.max(1, srcWidth * crop.w);
  const sh = Math.max(1, srcHeight * crop.h);
  const sx = srcWidth * crop.x;
  const sy = srcHeight * crop.y;

  const virtualCanvasWidth = cols;
  const virtualCanvasHeight = rows / cellAspect;

  let drawW = virtualCanvasWidth;
  let drawH = virtualCanvasHeight;

  const srcAspect = sw / Math.max(1, sh);

  /*
   * CONTAIN and COVER measure the *rotated* picture against the canvas.
   *
   * The fit used to be computed from the unrotated aspect and the rotation
   * applied afterwards, which meant a quarter-turned image was sized to fill
   * the box and then spun inside it — landing well short of every edge, with
   * margin all round. What has to fit is what you end up looking at.
   *
   * The rotated bounding box of a `drawW x drawH` rectangle is
   * `(drawW*cos + drawH*sin, drawW*sin + drawH*cos)` in absolute terms, and
   * `drawH` is `drawW / srcAspect`, so each edge gives a bound on `drawW`:
   * CONTAIN takes the tighter, COVER the looser. At zero degrees `cos` is 1
   * and `sin` is 0, the two bounds collapse to `width` and `height*aspect`,
   * and this reduces *exactly* to the aspect comparison it replaces — so an
   * unrotated source, which is nearly all of them, is sized as before.
   *
   * All of it in virtual space, where the rotation actually happens: the
   * `scale(1, cellAspect)` squash is applied after the rotate, not before.
   */
  const rad = (mediaConfig.rotation * Math.PI) / 180;
  const cosR = Math.abs(Math.cos(rad));
  const sinR = Math.abs(Math.sin(rad));
  const widthBound = virtualCanvasWidth / Math.max(1e-6, cosR + sinR / srcAspect);
  const heightBound = virtualCanvasHeight / Math.max(1e-6, sinR + cosR / srcAspect);

  if (mediaConfig.fit === 'contain') {
    drawW = Math.min(widthBound, heightBound);
    drawH = drawW / srcAspect;
  } else if (mediaConfig.fit === 'cover') {
    drawW = Math.max(widthBound, heightBound);
    drawH = drawW / srcAspect;
  } else if (mediaConfig.fit === 'original') {
    // 1:1 means one source pixel per cell, and the crop's pixels are the
    // source's pixels — so a crop under this fit reveals more of the grid
    // rather than magnifying what it kept.
    drawW = sw;
    drawH = sh;
  } else {
    /*
     * STRETCH is the "ignore the aspect" mode, so there is no aspect to hold
     * a rotated fit to and nothing here to solve for. It fills the box and a
     * rotation spills over the edges, which is the honest result of asking for
     * both.
     */
    drawW = virtualCanvasWidth;
    drawH = virtualCanvasHeight;
  }

  drawW *= mediaConfig.scale || 1.0;
  drawH *= mediaConfig.scale || 1.0;

  return {
    sx,
    sy,
    sw,
    sh,
    drawW,
    drawH,
    cx: cols / 2 + (mediaConfig.offsetX / 100) * (cols / 2),
    cy: rows / 2 + (mediaConfig.offsetY / 100) * (rows / 2),
    cellAspect,
    rotation: mediaConfig.rotation,
    flipX: mediaConfig.flipX,
    flipY: mediaConfig.flipY,
  };
}

/**
 * Draw the media into the grid the way the raster pipeline sees it: crop, fit
 * mode, scale, pan, rotation and flip, with the monospace cell squash applied
 * at the source (invariant 7).
 *
 * Extracted so the source overlay registers with the raster by construction.
 * Any second copy of this maths is a copy that drifts, and a source layer half
 * a cell off its own rasterization is worse than no overlay at all.
 */
export function drawFramedMedia(
  ctx: CanvasRenderingContext2D,
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  mediaConfig: MediaConfig,
  opts: FramedMediaOptions
): void {
  const { cols, rows, cellAspect, resampling } = opts;
  const ppcX = opts.pixelsPerCellX ?? 1;
  const ppcY = opts.pixelsPerCellY ?? 1;

  const { width: srcWidth, height: srcHeight } = measureMedia(mediaElement);
  const f = computeMediaFraming(srcWidth, srcHeight, mediaConfig, { cols, rows, cellAspect });

  ctx.imageSmoothingEnabled = resampling !== 'nearest';
  if (ctx.imageSmoothingEnabled) {
    ctx.imageSmoothingQuality = resampling === 'preserve-details' ? 'high' : 'medium';
  }

  ctx.save();
  if (ppcX !== 1 || ppcY !== 1) ctx.scale(ppcX, ppcY);
  ctx.translate(f.cx, f.cy);
  ctx.scale(1, cellAspect);
  if (f.rotation !== 0) {
    ctx.rotate((f.rotation * Math.PI) / 180);
  }
  const scaleFactorX = f.flipX ? -1 : 1;
  const scaleFactorY = f.flipY ? -1 : 1;
  if (scaleFactorX !== 1 || scaleFactorY !== 1) {
    ctx.scale(scaleFactorX, scaleFactorY);
  }

  try {
    /*
     * Always the nine-argument form. With a full crop the source rect is the
     * whole image and this is identical to the five-argument call it replaced,
     * so there is no cropped path and uncropped path to keep in agreement.
     */
    ctx.drawImage(
      mediaElement,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      -f.drawW / 2,
      -f.drawH / 2,
      f.drawW,
      f.drawH
    );
  } catch {
  }
  ctx.restore();
}

/*
 * Scratch canvas for the source overlay, separate from the pipeline's own:
 * the two are live at the same time and at different resolutions.
 */
let sourceCanvas: HTMLCanvasElement | null = null;

/**
 * The media, framed exactly as the raster framed it, at overlay resolution.
 *
 * The margins a `contain` fit leaves are kept **transparent** rather than
 * filled — an overlay is composited, and a black letterbox would blend as
 * black rather than as nothing.
 */
export function renderMediaSourceCanvas(params: {
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig: MediaConfig;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  cellAspect: number;
  resampling: ResamplingMode;
  /** Long-edge ceiling, so a 1600-column grid at 4x cannot blow past a canvas limit. */
  maxDim?: number;
}): HTMLCanvasElement | null {
  const {
    mediaElement, mediaConfig, cols, rows,
    cellWidth, cellHeight, cellAspect, resampling, maxDim = 8192,
  } = params;
  if (!mediaElement || cols <= 0 || rows <= 0) return null;
  if (typeof document === 'undefined') return null;

  let ppcX = cellWidth;
  let ppcY = cellHeight;
  const longEdge = Math.max(cols * ppcX, rows * ppcY);
  if (longEdge > maxDim) {
    const k = maxDim / longEdge;
    ppcX *= k;
    ppcY *= k;
  }

  const w = Math.max(1, Math.round(cols * ppcX));
  const h = Math.max(1, Math.round(rows * ppcY));

  if (!sourceCanvas) sourceCanvas = document.createElement('canvas');
  if (sourceCanvas.width !== w || sourceCanvas.height !== h) {
    sourceCanvas.width = w;
    sourceCanvas.height = h;
  }
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  drawFramedMedia(ctx, mediaElement, mediaConfig, {
    cols,
    rows,
    cellAspect,
    resampling,
    pixelsPerCellX: ppcX,
    pixelsPerCellY: ppcY,
  });

  return sourceCanvas;
}

/**
 * 2D Media Provider: Rasterizes uploaded image/video onto offscreen canvas
 * and routes through the unified 2D Raster Processing Engine.
 */
export function renderAsciiMediaFrameData(context: RenderMediaContext): AsciiMediaFrameResult {
  const {
    cols,
    rows,
    mediaElement,
    mediaConfig,
    viewConfig,
    density,
    colorConfig = DEFAULT_MEDIA_COLOR_CONFIG,
    // Fall back to the view config so callers that only pass a viewConfig
    // (exporters) render exactly what the viewport renders.
    rasterMode = viewConfig.rasterMode ?? 'ascii',
    algorithm = viewConfig.algorithm ?? 'floyd-steinberg',
    ditherParams,
    vectorConfig,
    toneConfig,
  } = context;

  const bgColor = resolveMediaBackgroundColor(colorConfig, viewConfig.background);

  if (cols <= 0 || rows <= 0) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols: 0, rows: 0, rasterMode, histogram: EMPTY_HISTOGRAM, histogramOpaque: 0 };
  }

  /*
   * Nothing loaded: emit a blank grid, not a banner drawn into the cells.
   * Baked-in text was indistinguishable from real media downstream -- it
   * scaled with the viewfinder zoom and, in pixel mode, every glyph became an
   * opaque cell, so the message was unreadable. The viewport paints a
   * fixed-size DOM prompt over the empty grid instead.
   */
  if (!mediaElement) {
    const blankRow = ' '.repeat(cols);
    const lines = new Array(rows).fill(blankRow);
    return { text: lines.join('\n'), colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode, histogram: EMPTY_HISTOGRAM, histogramOpaque: 0 };
  }

  const { ctx } = getOffscreenCanvas(cols, rows);
  if (!ctx) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode, histogram: EMPTY_HISTOGRAM, histogramOpaque: 0 };
  }

  // 1. Clear background
  ctx.clearRect(0, 0, cols, rows);
  if (viewConfig.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cols, rows);
  }

  // 2. Frame the source into the grid
  drawFramedMedia(ctx, mediaElement, mediaConfig, {
    cols,
    rows,
    cellAspect: rasterMode === 'ascii' ? MONOSPACE_CELL_ASPECT : 1.0,
    resampling: viewConfig.resampling,
  });

  const imageData = ctx.getImageData(0, 0, cols, rows);

  // 3. Delegate to Unified 2D Raster Processing Engine
  return processRasterFrame(
    {
      width: cols,
      height: rows,
      rgba: imageData.data,
      bgColor,
    },
    {
      cols,
      rows,
      density,
      rasterMode,
      ditherAlgorithm: algorithm,
      ditherParams: ditherParams || viewConfig.ditherParams,
      vectorConfig: vectorConfig || viewConfig.vectorConfig,
      toneConfig: toneConfig || viewConfig.toneConfig,
      colorConfig,
      monoTint: colorConfig?.monoTint,
      // viewConfig IS the media ImageAdjustConfig — it is where the media UI writes.
      ...toPipelineAdjustments(viewConfig),
    }
  );
}
