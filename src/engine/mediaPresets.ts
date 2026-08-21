import { MediaPreset, MediaConfig, MediaViewConfig } from '../types/ascii';
import { CHARSETS } from './renderer';

export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  sourceType: 'preset',
  mediaType: 'image',
  mediaId: 'cyber-skull',
  fileName: 'cyber-skull.png',
  scale: 1.0,
  fit: 'contain',
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  loop: true,
  playbackSpeed: 1.0,
};

export const DEFAULT_MEDIA_VIEW_CONFIG: MediaViewConfig = {
  // 1. Render / Sampling Settings
  inputDpi: 72,
  resampling: 'preserve-details',
  algorithm: 'floyd-steinberg',
  invert: false,
  edgeDetection: false,
  edgeThreshold: 30,
  edgeStrength: 100,

  // 2. Effect Controls
  sharpenStrength: 120,
  sharpenRadius: 2,
  noise: 0,
  denoise: 0,
  blur: 0,
  brightness: 0,
  contrast: 20,

  // 3. Tonal Controls
  tonalMapping: '1-color',
  highlights: 50,
  midtones: 0,
  shadows: 0,
  background: 'black',
  alphaThreshold: 10,
};

// Generates canvas image data URLs for built-in offline presets
function createProceduralMediaDataUrl(id: string, width = 256, height = 256): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  if (id === 'cyber-skull') {
    // Cyberpunk Skull Silhouette
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 4;

    // Cranium
    ctx.beginPath();
    ctx.arc(cx, cy - 25, 65, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.bezierCurveTo(cx - 55, cy + 30, cx - 40, cy + 50, cx - 35, cy + 65);
    ctx.lineTo(cx + 35, cy + 65);
    ctx.bezierCurveTo(cx + 40, cy + 50, cx + 55, cy + 30, cx + 64, cy - 10);
    ctx.closePath();
    ctx.fill();

    // Eye sockets
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx - 24, cy - 15, 18, 22, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 24, cy - 15, 18, 22, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Nasal cavity
    ctx.beginPath();
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx - 8, cy + 28);
    ctx.lineTo(cx + 8, cy + 28);
    ctx.closePath();
    ctx.fill();

    // Teeth slits
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    for (let i = -24; i <= 24; i += 8) {
      ctx.beginPath();
      ctx.moveTo(cx + i, cy + 46);
      ctx.lineTo(cx + i, cy + 64);
      ctx.stroke();
    }

    // Circuit lines & cyber markings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let r = 85; r <= 115; r += 15) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
  } else if (id === 'retro-arcade') {
    // Pixel Arcade Space Invader / Mech
    ctx.fillStyle = '#ffffff';
    const pixelSize = 14;
    const sprite = [
      '    ██      ██    ',
      '      ██  ██      ',
      '    ██████████    ',
      '  ████  ██  ████  ',
      '██████████████████',
      '██  ██████████  ██',
      '██  ██      ██  ██',
      '      ██  ██      ',
      '    ██      ██    ',
    ];
    const startY = cy - (sprite.length * pixelSize) / 2;
    sprite.forEach((row, rIdx) => {
      const startX = cx - (row.length * pixelSize) / 2;
      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        if (row[cIdx] === '█') {
          ctx.fillRect(startX + cIdx * pixelSize, startY + rIdx * pixelSize, pixelSize - 1, pixelSize - 1);
        }
      }
    });
  } else if (id === 'cyber-horizon') {
    // Synthwave Sunset & Neon Grid
    // Sun
    const grad = ctx.createLinearGradient(0, cy - 70, 0, cy + 20);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#666666');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy - 20, 55, 0, Math.PI * 2);
    ctx.fill();

    // Sun horizontal scan-cuts
    ctx.fillStyle = '#000000';
    for (let y = cy - 20; y <= cy + 35; y += 7) {
      ctx.fillRect(cx - 60, y, 120, (y - (cy - 20)) / 7 + 1);
    }

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy + 20);
    ctx.lineTo(width, cy + 20);
    ctx.stroke();

    // Perspective grid lines
    for (let x = -width; x <= width * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 20);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = cy + 25; y < height; y += (height - y) * 0.28 + 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (id === 'glitch-portrait') {
    // Minimalist High-Contrast Portrait with Halftone Aura
    const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 110);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#888888');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 55, 75, 0, 0, Math.PI * 2);
    ctx.fill();

    // High-contrast facial shadows
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx - 20, cy - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 20, cy - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 30, 24, 8, 0, 0, Math.PI);
    ctx.fill();
  } else if (id === 'oscilloscope-waves') {
    // Oscilloscope Multi-Harmonic Lissajous Figure
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.1; t += 0.02) {
      const px = cx + Math.sin(3 * t + Math.PI / 3) * 90;
      const py = cy + Math.sin(4 * t) * 90;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Concentric radar ring
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 105, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}

export const MEDIA_PRESETS: MediaPreset[] = [
  {
    id: 'cyber-skull',
    name: 'Cyberpunk Skull',
    description: 'High-contrast graphic skull with Atkinson error-diffusion dithering',
    mediaConfig: {
      ...DEFAULT_MEDIA_CONFIG,
      mediaId: 'cyber-skull',
      fileName: 'cyber-skull.png',
      fileData: createProceduralMediaDataUrl('cyber-skull'),
    },
    viewConfig: {
      ...DEFAULT_MEDIA_VIEW_CONFIG,
      algorithm: 'atkinson',
      sharpenStrength: 160,
      sharpenRadius: 3,
      contrast: 40,
      brightness: -10,
    },
    theme: 'green',
    densityCharset: CHARSETS[0].chars,
  },
  {
    id: 'retro-arcade',
    name: 'Retro Arcade Sprite',
    description: 'Crisp pixel-art mech with Bayer 4x4 matrix ordered dithering',
    mediaConfig: {
      ...DEFAULT_MEDIA_CONFIG,
      mediaId: 'retro-arcade',
      fileName: 'arcade-invader.png',
      fileData: createProceduralMediaDataUrl('retro-arcade'),
    },
    viewConfig: {
      ...DEFAULT_MEDIA_VIEW_CONFIG,
      algorithm: 'bayer-4x4',
      resampling: 'nearest',
      sharpenStrength: 200,
      contrast: 35,
    },
    theme: 'amber',
    densityCharset: CHARSETS[2].chars, // Shading Blocks
  },
  {
    id: 'cyber-horizon',
    name: 'Synthwave Horizon',
    description: 'Neon grid sunset with smooth Floyd-Steinberg detail diffusion',
    mediaConfig: {
      ...DEFAULT_MEDIA_CONFIG,
      mediaId: 'cyber-horizon',
      fileName: 'synth-horizon.png',
      fileData: createProceduralMediaDataUrl('cyber-horizon'),
    },
    viewConfig: {
      ...DEFAULT_MEDIA_VIEW_CONFIG,
      algorithm: 'floyd-steinberg',
      contrast: 25,
      brightness: 5,
      highlights: 65,
    },
    theme: 'cyan',
    densityCharset: CHARSETS[1].chars, // Dense ASCII
  },
  {
    id: 'glitch-portrait',
    name: 'Cyber Portrait',
    description: 'High-pass filtered portrait with Sobel outline edge enhancement',
    mediaConfig: {
      ...DEFAULT_MEDIA_CONFIG,
      mediaId: 'glitch-portrait',
      fileName: 'portrait.png',
      fileData: createProceduralMediaDataUrl('glitch-portrait'),
    },
    viewConfig: {
      ...DEFAULT_MEDIA_VIEW_CONFIG,
      algorithm: 'sierra',
      edgeDetection: true,
      edgeThreshold: 25,
      edgeStrength: 120,
      sharpenStrength: 140,
      contrast: 30,
    },
    theme: 'monochrome',
    densityCharset: CHARSETS[4].chars, // Minimal Dot Ramp
  },
  {
    id: 'oscilloscope-waves',
    name: 'Oscilloscope Harmonics',
    description: 'Multi-frequency Lissajous signal on phosphor CRT display',
    mediaConfig: {
      ...DEFAULT_MEDIA_CONFIG,
      mediaId: 'oscilloscope-waves',
      fileName: 'lissajous.png',
      fileData: createProceduralMediaDataUrl('oscilloscope-waves'),
    },
    viewConfig: {
      ...DEFAULT_MEDIA_VIEW_CONFIG,
      algorithm: 'floyd-steinberg',
      sharpenStrength: 180,
      contrast: 45,
      brightness: -5,
    },
    theme: 'green',
    densityCharset: CHARSETS[6].chars, // Braille Pattern
  },
];
