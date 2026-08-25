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
  ToneMappingConfig,
  ImageAdjustConfig,
} from '../types/ascii';
import { renderSynthFrameData, MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from './renderer';
import { renderModelFrameData } from './modelRenderer';
import { renderAsciiMediaFrameData } from './mediaRenderer';
import { DEFAULT_WAVE_PARAMS } from './math';
import { injectPngMetadata, injectJpegComment } from './mediaMetadata';
import { drawPixelRasterToCanvas, exportPixelRasterToSvg } from './pixelRasterRenderer';


export interface ImageExportOptions {
  name: string;
  format?: 'png' | 'jpg' | 'svg';
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
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
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
  extension: '.png' | '.jpg' | '.svg';
}

export interface PrintPlateResult {
  name: string;
  colorHex: string;
  blob: Blob;
  url: string;
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

export interface ExportFrame {
  text: string;
  luminance: Float32Array | null;
  colors: Uint8ClampedArray | null;
  /** Background actually used: the theme's, or the frame's own once it is coloured. */
  bgColor: string;
  /** Foreground for the monochrome paths, where `colors` is null. */
  fgColor: string;
  rasterMode: RasterOutputMode;
}

/**
 * Renders one frame at export resolution, through the same mode renderer the
 * viewport uses.
 *
 * Extracted so the still export and the colour-separation export cannot drift
 * apart. pipeline.md invariant 4 is that every export path must forward
 * rasterMode, ditherAlgorithm, toneConfig and adjustConfig, and that missing
 * one silently produces an export different from what is on screen -- a second
 * hand-copied dispatch is exactly how that happens again.
 */
export function renderExportFrame(opts: ImageExportOptions): ExportFrame {
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
    time = 0,
    currentAsciiFrame,
  } = opts;

  const rasterMode: RasterOutputMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const { bg, text: fgColor } = getThemeColors(theme, customThemeColor, gradientConfig);

  let frameText = currentAsciiFrame || '';
  let frameLuminance: Float32Array | null = null;
  let frameColors: Uint8ClampedArray | null = null;
  let effectiveBg = bg;

  if (opts.appMode === 'media' && opts.mediaConfig && opts.mediaViewConfig && opts.mediaElement) {
    const res = renderAsciiMediaFrameData({
      cols,
      rows,
      mediaElement: opts.mediaElement,
      mediaConfig: opts.mediaConfig,
      viewConfig: opts.mediaViewConfig,
      density,
      colorConfig: opts.mediaColorConfig || opts.mediaViewConfig.colorConfig,
      rasterMode,
      algorithm: opts.ditherAlgorithm,
      toneConfig: opts.toneConfig,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
    if (res.isColored) effectiveBg = res.bgColor;
  } else if (opts.appMode === 'model' && opts.geometry && opts.modelConfig && opts.modelViewConfig) {
    const res = renderModelFrameData({
      cols,
      rows,
      time,
      density,
      geometry: opts.geometry,
      modelConfig: opts.modelConfig,
      viewConfig: opts.modelViewConfig,
      colorConfig: opts.mediaColorConfig,
      rasterMode,
      algorithm: opts.ditherAlgorithm,
      toneConfig: opts.toneConfig,
      adjustConfig: opts.adjustConfig,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
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

    const res = renderSynthFrameData({
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
      colorConfig: opts.mediaColorConfig,
      rasterMode,
      algorithm: opts.ditherAlgorithm,
      toneConfig: opts.toneConfig,
      adjustConfig: opts.adjustConfig,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
    if (res.isColored) effectiveBg = res.bgColor;
  }

  return {
    text: frameText,
    luminance: frameLuminance,
    colors: frameColors,
    bgColor: effectiveBg,
    fgColor,
    rasterMode,
  };
}

/**
 * Renders a single crisp high-resolution still image (PNG, JPG or Vector SVG) of the current viewport.
 */
export async function exportAsciiImage(opts: ImageExportOptions): Promise<ImageExportResult> {
  const {
    name = 'raster-art',
    format = 'png',
    quality = 0.95,
    scale = 2.0,
    transparentBg = false,
    cols,
    rows,
    gradientConfig,
    crtConfig,
  } = opts;

  // Everything the frame itself needs -- source configs, density, time, the
  // custom-preset code -- is read by renderExportFrame, not here.
  const rasterMode: RasterOutputMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const isPixel = rasterMode === 'pixel';
  const showScanlines = !isPixel && (opts.includeScanlines ?? (crtConfig ? crtConfig.scanlines : true));
  const showCrtGlow = !isPixel && (opts.includeCrtGlow ?? (crtConfig ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false));
  const showVignette = !isPixel && (opts.includeVignette ?? (crtConfig ? crtConfig.vignette : false));
  const showPhosphorBloom = !isPixel && (opts.includePhosphorBloom ?? (crtConfig ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false));

  const {
    text: frameText,
    luminance: frameLuminance,
    colors: frameColors,
    bgColor: effectiveBg,
    fgColor: text,
  } = renderExportFrame(opts);


  // If Vector SVG export is requested
  if (format === 'svg') {
    let svgContent = '';

    const charWidth = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
    const charHeight = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
    const width = Math.round(cols * charWidth);
    const height = Math.round(rows * charHeight);

    if (!isPixel) {
      const lines = frameText.split('\n');

      const textNodes: string[] = [];
      textNodes.push(`<?xml version="1.0" encoding="UTF-8"?>`);
      textNodes.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
      if (!transparentBg) {
        textNodes.push(`  <rect width="100%" height="100%" fill="${effectiveBg}"/>`);
      }
      textNodes.push(`  <g font-family="monospace" font-size="${10 * scale}px" fill="${text}" xml:space="preserve">`);

      for (let r = 0; r < lines.length && r < rows; r++) {
        const line = lines[r];
        if (line) {
          const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          textNodes.push(`    <text x="0" y="${((r + 0.8) * charHeight).toFixed(2)}">${escaped}</text>`);
        }
      }
      textNodes.push(`  </g>`);
      textNodes.push(`</svg>`);
      svgContent = textNodes.join('\n');
    } else {
      svgContent = exportPixelRasterToSvg({
        cols,
        rows,
        luminance: frameLuminance || new Float32Array(cols * rows).fill(0.5),
        colors: frameColors,
        bgColor: transparentBg ? 'transparent' : effectiveBg,
        fgColor: text,
        width,
        height,
      });
    }

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      width,
      height,
      mimeType: 'image/svg+xml',
      extension: '.svg',
    };
  }

  // Character cell dimensions on canvas (1:1 square for pixel mode, 0.6015 monospace aspect for ASCII)
  const charWidth = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
  const charHeight = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Setup offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

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

  // Pixel raster mode paints filled cells instead of glyphs
  if (isPixel && frameLuminance) {
    drawPixelRasterToCanvas({
      ctx,
      cols,
      rows,
      luminance: frameLuminance,
      colors: frameColors,
      bgColor: transparentBg ? 'transparent' : effectiveBg,
      fgColor: text,
      cellWidth: charWidth,
      cellHeight: charHeight,
      dpr: 1,
    });
  } else {
    // Standard ASCII text rendering
    const lines = frameText.split('\n');

    // 1. Draw Canvas Background
    if (format === 'jpg' || !transparentBg) {
      ctx.fillStyle = effectiveBg;
      ctx.fillRect(0, 0, width, height);

      // CRT Glow
      if (showCrtGlow && !frameColors) {
        const ambientGlow = ctx.createRadialGradient(
          width / 2, height / 2, 0,
          width / 2, height / 2, Math.max(width, height) * 0.7
        );
        ambientGlow.addColorStop(0, `rgba(0, 255, 102, 0.18)`);
        ambientGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = ambientGlow;
        ctx.fillRect(0, 0, width, height);
      }

      // CRT Scanlines (rendered directly on background behind content)
      if (showScanlines) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        const scanlineHeight = Math.max(1, Math.round(1.5 * scale));
        const scanlineStep = Math.max(2, Math.round(3.0 * scale));
        for (let y = 0; y < height; y += scanlineStep) {
          ctx.fillRect(0, y, width, scanlineHeight);
        }
      }
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    // 2. Draw Text Lines
    ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (showPhosphorBloom && !frameColors) {
      ctx.shadowColor = text;
      ctx.shadowBlur = Math.round(3 * scale);
    } else {
      ctx.shadowBlur = 0;
    }


    if (frameColors) {
      for (let row = 0; row < rows; row++) {
        const line = lines[row] || '';
        for (let col = 0; col < cols && col < line.length; col++) {
          const ch = line[col];
          if (ch && ch !== ' ') {
            const cIdx = (row * cols + col) * 3;
            ctx.fillStyle = `rgb(${frameColors[cIdx]}, ${frameColors[cIdx + 1]}, ${frameColors[cIdx + 2]})`;
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
  }

  // CRT Vignette
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

  // Convert to Blob & Inject Container Metadata
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
                Author: 'Dither Studio',
                Software: 'Dither Studio (https://ascii.pantoine.com)',
                Source: 'https://ascii.pantoine.com',
                Comment: `Generated with Dither Studio (https://ascii.pantoine.com) - ${cols}x${rows} (${rasterMode})`,
                Description: `Raster visual rendered via Dither Studio: ${name} (${opts.appMode || 'synth'})`,
              });
            } else {
              finalBlob = injectJpegComment(
                arrayBuffer,
                `Dither Studio (https://ascii.pantoine.com) - ${name} (${opts.appMode || 'synth'})`
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

