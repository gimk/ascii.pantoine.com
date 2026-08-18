import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { WaveParams, PhosphorTheme, CustomRenderContext } from '../types/ascii';
import { renderAsciiFrame } from './renderer';

export interface GifExportOptions {
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  cols: number;
  rows: number;
  theme: PhosphorTheme;
  customThemeColor?: string;
  scanlines?: boolean;
  duration?: number; // Duration in seconds (default: 2.0s)
  fps?: number; // Framerate (default: 15 fps)
  scale?: number; // Render resolution multiplier (1.0 or 1.5)
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

function getThemeColors(theme: PhosphorTheme, customColor?: string): { bg: string; text: string } {
  if (customColor) {
    let cleaned = customColor.replace('#', '').trim();
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
    scanlines = false,
    duration = 2.0,
    fps = 15,
    scale = 1.0,
  } = opts;

  // Wait for fonts to be ready so canvas typography is crisp
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const totalFrames = Math.max(2, Math.round(duration * fps));
  // delay in ms for gifenc
  const delayMs = Math.round(1000 / fps);

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

  const { bg, text } = getThemeColors(theme, customThemeColor);

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

  for (let i = 0; i < totalFrames; i++) {
    const t = i * (1 / fps) * (params.timeSpeed || 1.0);

    const frameText = renderAsciiFrame({
      cols,
      rows,
      time: t,
      density,
      trailPoints: [],
      waveParams: params,
      customRenderFn,
      prepareFn,
      customContext,
      interactiveInfluence: false,
    });

    const lines = frameText.split('\n');

    // 1. Draw Canvas Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw ASCII Text Lines
    ctx.fillStyle = text;
    ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (let row = 0; row < lines.length && row < rows; row++) {
      const line = lines[row];
      if (line) {
        ctx.fillText(line, 0, Math.round(row * charHeight));
      }
    }

    // 3. Optional CRT scanlines
    if (scanlines) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      const step = Math.max(2, Math.round(3 * scale));
      for (let y = 0; y < height; y += step) {
        ctx.fillRect(0, y, width, 1);
      }
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
  return new Blob([bytes], { type: 'image/gif' });
}
