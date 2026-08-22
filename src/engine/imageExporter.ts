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
} from '../types/ascii';
import { renderAsciiFrame } from './renderer';
import { renderModelAsciiFrame } from './modelRenderer';
import { renderAsciiMediaFrameData, AsciiMediaFrameResult } from './mediaRenderer';
import { DEFAULT_WAVE_PARAMS } from './math';
import { injectPngMetadata, injectJpegComment } from './mediaMetadata';

export interface ImageExportOptions {
  name: string;
  format?: 'png' | 'jpg';
  quality?: number; // 0.1 to 1.0 (for JPEG)
  scale?: number; // 1.0, 1.5, 2.0, 3.0, 4.0
  transparentBg?: boolean;
  includeCrtGlow?: boolean;
  includeScanlines?: boolean;
  includeVignette?: boolean;
  includePhosphorBloom?: boolean;

  // Animation / Time state
  time?: number;
  currentAsciiFrame?: string;

  // Preset & Configuration
  type?: 'parametric' | 'custom';
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

  // Feature Modes
  appMode?: AppMode;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
}

export interface ImageExportResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  extension: '.png' | '.jpg';
}

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
 * Renders a single crisp high-resolution still image (PNG or JPG) of the current viewport.
 */
export async function exportAsciiImage(opts: ImageExportOptions): Promise<ImageExportResult> {
  const {
    name = 'ascii-art',
    format = 'png',
    quality = 0.95,
    scale = 2.0,
    transparentBg = false,
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
    time = 0,
    currentAsciiFrame,
  } = opts;

  const showScanlines = opts.includeScanlines ?? (crtConfig ? crtConfig.scanlines : true);
  const showCrtGlow = opts.includeCrtGlow ?? (crtConfig ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false);
  const showVignette = opts.includeVignette ?? (crtConfig ? crtConfig.vignette : false);
  const showPhosphorBloom = opts.includePhosphorBloom ?? (crtConfig ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false);

  // Wait for web fonts to load
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  // Character cell dimensions on canvas
  const charWidth = 6.015 * scale;
  const charHeight = 10.0 * scale;
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

  // Generate or use frameText
  let frameText = currentAsciiFrame || '';
  let mediaFrameResult: AsciiMediaFrameResult | null = null;

  if (opts.appMode === 'media' && opts.mediaConfig && opts.mediaViewConfig && opts.mediaElement) {
    mediaFrameResult = renderAsciiMediaFrameData({
      cols,
      rows,
      mediaElement: opts.mediaElement,
      mediaConfig: opts.mediaConfig,
      viewConfig: opts.mediaViewConfig,
      density,
      colorConfig: opts.mediaColorConfig || opts.mediaViewConfig.colorConfig,
    });
    if (!frameText) {
      frameText = mediaFrameResult.text;
    }
  } else if (!frameText) {
    if (opts.appMode === 'model' && opts.geometry && opts.modelConfig && opts.modelViewConfig) {
      frameText = renderModelAsciiFrame({
        cols,
        rows,
        time,
        density,
        geometry: opts.geometry,
        modelConfig: opts.modelConfig,
        viewConfig: opts.modelViewConfig,
      });
    } else {
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
            prepareFn(time, cols, rows, customContext);
          }
        } catch {}
      }

      frameText = renderAsciiFrame({
        cols,
        rows,
        time,
        density,
        trailPoints: [],
        waveParams: params || DEFAULT_WAVE_PARAMS,
        customRenderFn,
        prepareFn,
        customContext,
        interactiveInfluence: false,
      });
    }
  }

  const lines = frameText.split('\n');
  const isColored = Boolean(mediaFrameResult?.isColored && mediaFrameResult?.colors);
  const effectiveBg = isColored && mediaFrameResult ? mediaFrameResult.bgColor : bg;

  // 1. Draw Canvas Background
  if (format === 'jpg' || !transparentBg) {
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
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // 2. Draw ASCII Text Lines (with Phosphor Bloom if enabled)
  ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  if (!isColored && showPhosphorBloom && gradientConfig) {
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
  if (isColored && mediaFrameResult?.colors) {
    const colors = mediaFrameResult.colors;
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

  // 3. CRT Scanline Overlay
  if (showScanlines) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    const scanlineHeight = Math.max(1, Math.round(1.5 * scale));
    const scanlineStep = Math.max(2, Math.round(3.0 * scale));
    for (let y = 0; y < height; y += scanlineStep) {
      ctx.fillRect(0, y, width, scanlineHeight);
    }
  }

  // 4. CRT Vignette
  if (showVignette) {
    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.4,
      width / 2, height / 2, Math.max(width, height) * 0.75
    );
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  // 5. Convert to Blob & Inject Container Metadata
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const extension = format === 'jpg' ? '.jpg' : '.png';

  return new Promise<ImageExportResult>((resolve, reject) => {
    canvas.toBlob(
      (rawBlob) => {
        if (!rawBlob) {
          reject(new Error('Failed to generate image blob'));
          return;
        }

        rawBlob
          .arrayBuffer()
          .then((arrayBuffer) => {
            let finalBlob: Blob = rawBlob;

            if (format === 'png') {
              finalBlob = injectPngMetadata(arrayBuffer, {
                Title: name,
                Author: 'ASCII Studio',
                Software: 'ASCII Studio (https://ascii.pantoine.com)',
                Source: 'https://ascii.pantoine.com',
                Comment: `Generated with ASCII Studio (https://ascii.pantoine.com) - ${cols}x${rows}`,
                Description: `ASCII art rendered via ASCII Studio: ${name} (${opts.appMode || 'synth'})`,
              });
            } else {
              finalBlob = injectJpegComment(
                arrayBuffer,
                `ASCII Studio (https://ascii.pantoine.com) - ${name} (${opts.appMode || 'synth'})`
              );
            }

            const url = URL.createObjectURL(finalBlob);
            resolve({
              blob: finalBlob,
              url,
              width,
              height,
              mimeType,
              extension,
            });
          })
          .catch(() => {
            const url = URL.createObjectURL(rawBlob);
            resolve({
              blob: rawBlob,
              url,
              width,
              height,
              mimeType,
              extension,
            });
          });
      },
      mimeType,
      format === 'jpg' ? quality : undefined
    );
  });
}
