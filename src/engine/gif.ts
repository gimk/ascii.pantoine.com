import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import * as THREE from 'three';
import {
  WaveParams,
  PhosphorTheme,
  CustomRenderContext,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  RasterOutputMode,
  DitherAlgorithm,
  DitherParams,
  ToneMappingConfig,
  ImageAdjustConfig,
  VectorConfig,
  VectorFrame,
} from '../types/ascii';
import { renderSynthFrameData, MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from './renderer';
import { ProcessedRasterResult } from './rasterEngine';
import { renderModelFrameData } from './modelRenderer';
import { renderAsciiMediaFrameData } from './mediaRenderer';
import { DEFAULT_WAVE_PARAMS } from './math';
import { injectGifComment } from './mediaMetadata';
import { drawPixelRasterToCanvas } from './pixelRasterRenderer';
import { paintVectorFrame } from './vectorEngine';

export interface GifExportOptions {
  name: string;
  type: 'parametric' | 'custom';
  params?: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  cols: number;
  rows: number;
  theme: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  crtConfig?: CrtConfig;
  duration?: number; // Duration in seconds (default: 2.0s)
  fps?: number; // Framerate (default: 15 fps)
  scale?: number; // Render resolution multiplier (1.0 or 1.5)
  appMode?: AppMode;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  // Live render settings, so exports match what the viewport shows
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
}

/** Minimal shape every render mode returns, used to paint export frames. */
type ExportFrameResult = Pick<ProcessedRasterResult, 'text' | 'colors' | 'bgColor' | 'isColored'> & {
  luminance?: Float32Array | null;
  /** Beam geometry in vector mode. Painted instead of text or cells. */
  vector?: VectorFrame | null;
};

const THEME_COLORS: Record<PhosphorTheme, { bg: string; text: string }> = {
  green: { bg: '#040905', text: '#00ff66' },
  amber: { bg: '#090602', text: '#ffb000' },
  cyan: { bg: '#03080a', text: '#00f0ff' },
  monochrome: { bg: '#0a0a0a', text: '#f0f0f0' },
  blood: { bg: '#0a0304', text: '#ff3344' },
  paper: { bg: '#f0eee6', text: '#151515' },
  matrix: { bg: '#040905', text: '#00ff66' },
};

function getThemeColors(
  theme: PhosphorTheme,
  customColor?: string,
  gradientConfig?: PhosphorGradient | null
): { bg: string; text: string } {
  const targetColor = gradientConfig ? gradientConfig.color1 : customColor;
  if (targetColor) {
    let cleaned = targetColor.replace('#', '').trim();
    if (cleaned.length === 3) cleaned = cleaned.split('').map((c) => c + c).join('');
    const num = parseInt(cleaned, 16);
    const [r, g, b] = Number.isNaN(num) ? [0, 255, 102] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      return {
        bg: `rgb(${Math.round(244 - (255 - r) * 0.05)}, ${Math.round(242 - (255 - g) * 0.05)}, ${Math.round(236 - (255 - b) * 0.05)})`,
        text: `rgb(${r}, ${g}, ${b})`,
      };
    }
    return {
      bg: `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(b * 0.035 + 2))})`,
      text: `rgb(${r}, ${g}, ${b})`,
    };
  }
  return THEME_COLORS[theme] || THEME_COLORS.green;
}

/**
 * Records an animated GIF loop of the active ASCII animation in the browser.
 */
export async function exportAnimatedGif(
  opts: GifExportOptions,
  onProgress?: (progress: number, frame: number, total: number) => void
): Promise<Blob> {
  const {
    cols,
    rows,
    params,
    density,
    customCode,
    customPrepare,
    type,
    theme,
    customThemeColor,
    gradientConfig,
    crtConfig,
    duration = 2.0,
    fps = 15,
    scale = 1.0,
  } = opts;

  const rasterMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const isPixel = rasterMode === 'pixel';
  const isVector = rasterMode === 'vector';
  const showScanlines = !isPixel && !isVector && (crtConfig ? crtConfig.scanlines : true);
  const showCrtGlow = !isPixel && !isVector && (crtConfig ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false);
  const showVignette = !isPixel && !isVector && (crtConfig ? crtConfig.vignette : false);
  const showPhosphorBloom = !isPixel && !isVector && (crtConfig ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false);

  // Wait for fonts to be ready so canvas typography is crisp
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const totalFrames = Math.max(2, Math.round(duration * fps));
  // delay in ms for gifenc
  const delayMs = Math.round(1000 / fps);

  // Character cell dimensions on canvas (1:1 square for pixel mode, 0.6015 monospace aspect for ASCII)
  const charWidth = isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
  const charHeight = isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Setup offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

  const { bg, text } = getThemeColors(theme, customThemeColor, gradientConfig);

  // Pre-generate linear gradient for text if active
  let textFillStyle: string | CanvasGradient = text;
  if (gradientConfig) {
    const rad = (gradientConfig.angle * Math.PI) / 180;
    const x2 = Math.cos(rad) * width;
    const y2 = Math.sin(rad) * height;
    const grad = ctx.createLinearGradient(0, 0, Math.abs(x2) || width, Math.abs(y2) || height);
    grad.addColorStop(0, gradientConfig.color1);
    grad.addColorStop(1, gradientConfig.color2);
    textFillStyle = grad;
  }

  // Compile custom code if needed
  let customRenderFn: any;
  let prepareFn: any;
  let customContext: CustomRenderContext = {};

  if (type === 'custom' && customCode) {
    try {
      customRenderFn = new Function(
        'x', 'y', 'time', 'dist', 'dx', 'dy', 'cols', 'rows', 'angle', 'ctx',
        customCode
      );
      if (customPrepare) {
        prepareFn = new Function('time', 'cols', 'rows', 'ctx', customPrepare);
      }
    } catch {}
  }

  const gif = GIFEncoder();
  const timeSpeed = (params?.timeSpeed || 1.0);

  for (let i = 0; i < totalFrames; i++) {
    const t = i * (1 / fps) * timeSpeed;

    let frameResult: ExportFrameResult | null = null;

    if (opts.appMode === 'model' && opts.geometry && opts.modelConfig && opts.modelViewConfig) {
      frameResult = renderModelFrameData({
        cols,
        rows,
        time: t,
        density,
        geometry: opts.geometry,
        modelConfig: opts.modelConfig,
        viewConfig: opts.modelViewConfig,
        colorConfig: opts.mediaColorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig,
        toneConfig: opts.toneConfig,
        adjustConfig: opts.adjustConfig,
      });
    } else if (opts.appMode === 'media' && opts.mediaConfig && opts.mediaViewConfig && opts.mediaElement) {
      frameResult = renderAsciiMediaFrameData({
        cols,
        rows,
        mediaElement: opts.mediaElement,
        mediaConfig: opts.mediaConfig,
        viewConfig: opts.mediaViewConfig,
        density,
        colorConfig: opts.mediaColorConfig || opts.mediaViewConfig.colorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig || opts.mediaViewConfig.vectorConfig,
        toneConfig: opts.toneConfig,
      });
    } else {
      frameResult = renderSynthFrameData({
        cols,
        rows,
        time: t,
        density,
        trailPoints: [],
        waveParams: params || DEFAULT_WAVE_PARAMS,
        customRenderFn,
        prepareFn,
        customContext,
        interactiveInfluence: false,
        colorConfig: opts.mediaColorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig,
        toneConfig: opts.toneConfig,
        adjustConfig: opts.adjustConfig,
      });
    }

    const lines = (frameResult?.text || '').split('\n');
    const isColored = Boolean(frameResult?.isColored && frameResult?.colors);
    const effectiveBg = isColored && frameResult ? frameResult.bgColor : bg;

    if (isVector) {
      /*
       * Re-strokes per frame at export scale. Phase is advanced by the caller
       * through vectorConfig, so the carrier and ripple drift across the
       * animation instead of every frame being identical.
       */
      ctx.fillStyle = effectiveBg;
      ctx.fillRect(0, 0, width, height);
      if (frameResult?.vector) {
        ctx.save();
        ctx.scale(scale, scale);
        paintVectorFrame(ctx, frameResult.vector, { glowScale: scale });
        ctx.restore();
      }
    } else if (isPixel && frameResult?.luminance) {
      drawPixelRasterToCanvas({
        ctx,
        cols,
        rows,
        luminance: frameResult.luminance,
        colors: frameResult.colors,
        bgColor: effectiveBg,
        fgColor: text,
        cellWidth: charWidth,
        cellHeight: charHeight,
        dpr: 1,
      });
    } else {
      // 1. Draw Canvas Background
      ctx.fillStyle = effectiveBg;
      ctx.fillRect(0, 0, width, height);

      // Optional CRT Centered Ambient Background Glow
      if (showCrtGlow && !isColored) {
        const ambientGlow = ctx.createRadialGradient(
          width / 2, height / 2, 0,
          width / 2, height / 2, Math.max(width, height) * 0.7
        );
        const baseGlowHex = gradientConfig ? gradientConfig.color1 : (customThemeColor || text);
        let glowColor = baseGlowHex;
        if (baseGlowHex.startsWith('#')) {
          const hex = baseGlowHex.slice(1);
          const fullHex = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
          if (fullHex.length === 6) {
            const r = parseInt(fullHex.slice(0, 2), 16);
            const g = parseInt(fullHex.slice(2, 4), 16);
            const b = parseInt(fullHex.slice(4, 6), 16);
            glowColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
          }
        }
        ambientGlow.addColorStop(0, glowColor);
        ambientGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = ambientGlow;
        ctx.fillRect(0, 0, width, height);
      }

      // CRT Scanlines on background
      if (showScanlines) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        const step = Math.max(2, Math.round(3 * scale));
        for (let y = 0; y < height; y += step) {
          ctx.fillRect(0, y, width, 1);
        }
      }

      // 2. Draw ASCII Text Lines (with Phosphor Bloom if enabled)
      ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      if (!isColored && showPhosphorBloom && gradientConfig) {
        // Direct directional gradient bloom matching character gradient
        ctx.save();
        ctx.filter = `blur(${Math.max(2, Math.round(3.5 * scale))}px)`;
        ctx.fillStyle = textFillStyle;
        for (let row = 0; row < lines.length && row < rows; row++) {
          const line = lines[row];
          if (line) ctx.fillText(line, 0, Math.round(row * charHeight));
        }
        ctx.restore();
      } else if (!isColored && showPhosphorBloom) {
        ctx.shadowColor = text;
        ctx.shadowBlur = Math.round(3 * scale);
      } else {
        ctx.shadowBlur = 0;
      }

      // Main sharp text render
      if (isColored && frameResult?.colors) {
        const colors = frameResult.colors;
        for (let row = 0; row < rows; row++) {
          const line = lines[row] || '';
          for (let col = 0; col < cols && col < line.length; col++) {
            const ch = line[col];
            if (ch && ch !== ' ') {
              const cIdx = (row * cols + col) * 3;
              ctx.fillStyle = `rgb(${colors[cIdx]}, ${colors[cIdx + 1]}, ${colors[cIdx + 2]})`;
              ctx.fillText(ch, Math.round(col * charWidth), Math.round(row * charHeight));
            }
          }
        }
      } else {
        ctx.fillStyle = textFillStyle;
        for (let row = 0; row < lines.length && row < rows; row++) {
          const line = lines[row];
          if (line) {
            ctx.fillText(line, 0, Math.round(row * charHeight));
          }
        }
      }

      ctx.shadowBlur = 0;
    }

    // 4. Optional CRT Corner Vignette
    if (showVignette) {
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.35,
        width / 2, height / 2, Math.max(width, height) * 0.7
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 4. Quantize and write frame
    const imgData = ctx.getImageData(0, 0, width, height);
    const palette = quantize(imgData.data, 256);
    const index = applyPalette(imgData.data, palette);

    gif.writeFrame(index, width, height, {
      palette,
      delay: delayMs,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFrames) * 100), i + 1, totalFrames);
    }

    // Yield execution every 2 frames for smooth UI progress
    if (i % 2 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  gif.finish();
  const bytes = gif.bytesView();
  return injectGifComment(
    bytes,
    `Generated with ASCII Studio (https://ascii.pantoine.com) - ${opts.name} (${opts.appMode || 'synth'})`
  );
}
