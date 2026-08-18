import { WaveParams, PhosphorTheme, CustomRenderContext, CrtConfig } from '../types/ascii';
import { renderAsciiFrame } from './renderer';

export interface VideoExportOptions {
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
  crtConfig?: CrtConfig;
  duration?: number; // Duration in seconds (default: 3.0s)
  fps?: number; // Framerate (default: 30 fps)
  scale?: number; // Render resolution multiplier (1.0, 1.5, 2.0)
  preferredFormat?: 'mp4' | 'webm' | 'auto';
}

export interface VideoExportResult {
  blob: Blob;
  mimeType: string;
  extension: '.mp4' | '.webm';
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

export function getSupportedVideoMimeType(preferred: 'mp4' | 'webm' | 'auto' = 'auto'): {
  mimeType: string;
  extension: '.mp4' | '.webm';
} {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: '.webm' };
  }

  const mp4Types = ['video/mp4;codecs=avc1', 'video/mp4'];
  const webmTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

  if (preferred === 'mp4') {
    for (const t of mp4Types) {
      if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, extension: '.mp4' };
    }
  }

  if (preferred === 'webm') {
    for (const t of webmTypes) {
      if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, extension: '.webm' };
    }
  }

  // Auto detect best available
  for (const t of mp4Types) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, extension: '.mp4' };
  }
  for (const t of webmTypes) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, extension: '.webm' };
  }

  return { mimeType: 'video/webm', extension: '.webm' };
}

/**
 * Records an animated WebM or MP4 video loop directly in the browser via Canvas + MediaRecorder.
 */
export async function exportVideoAnimation(
  opts: VideoExportOptions,
  onProgress?: (progress: number, frame: number, total: number) => void
): Promise<VideoExportResult> {
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
    crtConfig,
    duration = 3.0,
    fps = 30,
    scale = 1.5,
    preferredFormat = 'auto',
  } = opts;

  const showScanlines = crtConfig ? crtConfig.scanlines : true;
  const showGlow = crtConfig ? crtConfig.glow : false;
  const showVignette = crtConfig ? crtConfig.vignette : false;

  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const totalFrames = Math.max(2, Math.round(duration * fps));
  const frameIntervalMs = 1000 / fps;

  // Character cell dimensions on canvas
  const charWidth = 6.015 * scale;
  const charHeight = 10.0 * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Canvas setup
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
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

  const { mimeType, extension } = getSupportedVideoMimeType(preferredFormat);

  // Capture canvas media stream
  const stream = canvas.captureStream(fps);
  const chunks: Blob[] = [];

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000, // 8 Mbps for sharp crystal-clear typography
    });
  } catch {
    recorder = new MediaRecorder(stream);
  }

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = (e) => {
      reject(e);
    };
  });

  recorder.start();

  // Step-by-step frame rendering driven by real clock intervals
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

    // 1. Clear & Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw ASCII Text Lines (with CRT glow if enabled)
    ctx.fillStyle = text;
    ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (showGlow) {
      ctx.shadowColor = text;
      ctx.shadowBlur = Math.round(4 * scale);
    } else {
      ctx.shadowBlur = 0;
    }

    for (let row = 0; row < lines.length && row < rows; row++) {
      const line = lines[row];
      if (line) {
        ctx.fillText(line, 0, Math.round(row * charHeight));
      }
    }

    ctx.shadowBlur = 0;

    // 3. Optional CRT scanlines
    if (showScanlines) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      const step = Math.max(2, Math.round(3 * scale));
      for (let y = 0; y < height; y += step) {
        ctx.fillRect(0, y, width, 1);
      }
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

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFrames) * 100), i + 1, totalFrames);
    }

    // Wait for frame interval so the MediaRecorder stream captures every frame accurately
    await new Promise((resolve) => setTimeout(resolve, frameIntervalMs));
  }

  // Request final chunk and stop recorder
  recorder.requestData();
  recorder.stop();

  const finalBlob = await recordPromise;
  return {
    blob: finalBlob,
    mimeType,
    extension,
  };
}
