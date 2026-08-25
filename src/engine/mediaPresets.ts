import { MediaConfig, MediaViewConfig } from '../types/ascii';

export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  sourceType: 'file',
  mediaType: 'image',
  fileName: '',
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
  resampling: 'preserve-details',
  algorithm: 'floyd-steinberg',
  dpi: 72,
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
  contrast: 0,

  // 3. Tonal Controls (all sliders start at center)
  tonalMapping: '1color',
  highlightColor: '#FFFFFF',
  midtoneColor: '#3B82F6',
  shadowColor: '#000000',
  curvePoints: [
    [0, 0],
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
    [1, 1],
  ],
  levelBlack: 0,
  levelMidtones: 50,
  levelWhite: 100,
  highlights: 0,
  midtones: 0,
  shadows: 0,
  background: 'black',
  alphaThreshold: 10,
};
