import {
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
} from '../types/ascii';
import { MONOSPACE_CELL_ASPECT } from './renderer';
import { processRasterFrame, createToneCurveLUT, evaluateMonotoneCubicSpline } from './rasterEngine';

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
  toneConfig?: ToneMappingConfig;
  halftoneConfig?: HalftoneConfig;
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
    rasterMode = 'ascii',
    algorithm = 'floyd-steinberg',
    toneConfig,
    halftoneConfig,
  } = context;

  const bgColor = resolveMediaBackgroundColor(colorConfig, viewConfig.background);

  if (cols <= 0 || rows <= 0) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols: 0, rows: 0, rasterMode };
  }

  // Placeholder when no media loaded
  if (!mediaElement) {
    const bannerMsg = ' [ NO MEDIA LOADED ] ';
    const subMsg = ' DRAG & DROP / PASTE / OPEN FILE ';
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      if (r === Math.floor(rows / 2) - 1) {
        const pad = Math.max(0, Math.floor((cols - subMsg.length) / 2));
        line = ' '.repeat(pad) + subMsg + ' '.repeat(Math.max(0, cols - pad - subMsg.length));
      } else if (r === Math.floor(rows / 2) + 1) {
        const pad = Math.max(0, Math.floor((cols - bannerMsg.length) / 2));
        line = ' '.repeat(pad) + bannerMsg + ' '.repeat(Math.max(0, cols - pad - bannerMsg.length));
      } else {
        line = ' '.repeat(cols);
      }
      lines.push(line.slice(0, cols));
    }
    return { text: lines.join('\n'), colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode };
  }

  const { ctx } = getOffscreenCanvas(cols, rows);
  if (!ctx) {
    return { text: '', colors: null, luminance: null, bgColor, isColored: false, cols, rows, rasterMode };
  }

  // 1. Clear background
  ctx.clearRect(0, 0, cols, rows);
  if (viewConfig.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cols, rows);
  }


  // 2. Compute media element dimensions
  let srcWidth = 100;
  let srcHeight = 100;
  if (mediaElement instanceof HTMLImageElement) {
    srcWidth = mediaElement.naturalWidth || mediaElement.width || 100;
    srcHeight = mediaElement.naturalHeight || mediaElement.height || 100;
  } else if (mediaElement instanceof HTMLVideoElement) {
    srcWidth = mediaElement.videoWidth || mediaElement.width || 100;
    srcHeight = mediaElement.videoHeight || mediaElement.height || 100;
  } else if (mediaElement instanceof HTMLCanvasElement) {
    srcWidth = mediaElement.width || 100;
    srcHeight = mediaElement.height || 100;
  }

  const isTextMode = rasterMode === 'ascii';
  const cellAspect = isTextMode ? MONOSPACE_CELL_ASPECT : (halftoneConfig?.cellRatio ?? 1.0);
  const virtualCanvasWidth = cols;
  const virtualCanvasHeight = rows / cellAspect;

  let drawW = virtualCanvasWidth;
  let drawH = virtualCanvasHeight;

  const srcAspect = srcWidth / Math.max(1, srcHeight);
  const canvasAspect = virtualCanvasWidth / Math.max(1, virtualCanvasHeight);

  if (mediaConfig.fit === 'contain') {
    if (srcAspect > canvasAspect) {
      drawW = virtualCanvasWidth;
      drawH = virtualCanvasWidth / srcAspect;
    } else {
      drawH = virtualCanvasHeight;
      drawW = virtualCanvasHeight * srcAspect;
    }
  } else if (mediaConfig.fit === 'cover') {
    if (srcAspect > canvasAspect) {
      drawH = virtualCanvasHeight;
      drawW = virtualCanvasHeight * srcAspect;
    } else {
      drawW = virtualCanvasWidth;
      drawH = virtualCanvasWidth / srcAspect;
    }
  } else if (mediaConfig.fit === 'original') {
    drawW = srcWidth;
    drawH = srcHeight;
  } else {
    drawW = virtualCanvasWidth;
    drawH = virtualCanvasHeight;
  }

  drawW *= mediaConfig.scale || 1.0;
  drawH *= mediaConfig.scale || 1.0;

  const cx = cols / 2 + (mediaConfig.offsetX / 100) * (cols / 2);
  const cy = rows / 2 + (mediaConfig.offsetY / 100) * (rows / 2);

  ctx.imageSmoothingEnabled = viewConfig.resampling !== 'nearest';
  if (ctx.imageSmoothingEnabled) {
    ctx.imageSmoothingQuality = viewConfig.resampling === 'preserve-details' ? 'high' : 'medium';
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, cellAspect);
  if (mediaConfig.rotation !== 0) {
    ctx.rotate((mediaConfig.rotation * Math.PI) / 180);
  }
  const scaleFactorX = mediaConfig.flipX ? -1 : 1;
  const scaleFactorY = mediaConfig.flipY ? -1 : 1;
  if (scaleFactorX !== 1 || scaleFactorY !== 1) {
    ctx.scale(scaleFactorX, scaleFactorY);
  }

  try {
    ctx.drawImage(mediaElement, -drawW / 2, -drawH / 2, drawW, drawH);
  } catch {
  }
  ctx.restore();

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
      toneConfig: toneConfig || viewConfig.toneConfig,
      colorConfig,
      halftoneConfig,
      contrast: viewConfig.contrast,
      brightness: viewConfig.brightness,
      invert: viewConfig.invert,
      blur: viewConfig.blur,
      denoise: viewConfig.denoise,
      sharpenStrength: viewConfig.sharpenStrength,
      sharpenRadius: viewConfig.sharpenRadius,
      edgeDetection: viewConfig.edgeDetection,
      edgeThreshold: viewConfig.edgeThreshold,
      edgeStrength: viewConfig.edgeStrength,
      curvePoints: viewConfig.curvePoints,
      shadows: viewConfig.shadows,
      highlights: viewConfig.highlights,
      midtones: viewConfig.midtones,
      alphaThreshold: viewConfig.alphaThreshold,
      noise: viewConfig.noise,
      saturation: colorConfig.saturation,
      tonalMapping: viewConfig.tonalMapping,
      highlightColor: viewConfig.highlightColor,
      midtoneColor: viewConfig.midtoneColor,
      shadowColor: viewConfig.shadowColor,
    }
  );
}

export function renderAsciiMediaFrame(context: RenderMediaContext): string {
  return renderAsciiMediaFrameData(context).text;
}
