import { MediaPreset, MediaConfig, MediaViewConfig } from '../types/ascii';

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
  invert: false,
  edgeDetection: false,
  edgeThreshold: 30,
  edgeStrength: 100,

  // 2. Effect Controls
  sharpenStrength: 120,
  sharpenRadius: 2,
  noise: 0,
  blur: 0,
  brightness: 0,
  contrast: 0,

  // 3. Tonal Controls (all sliders start at center)
  levelBlack: 0,
  levelMidtones: 50,
  levelWhite: 100,
  highlights: 0,
  midtones: 0,
  shadows: 0,
  background: 'black',
  alphaThreshold: 10,
};

export const DEFAULT_MEDIA_PRESET: MediaPreset = {
  id: 'custom-media',
  name: 'Custom Media',
  description: 'Import 2D images or videos via clipboard paste (Cmd+V), file drop, or URL',
  mediaConfig: { ...DEFAULT_MEDIA_CONFIG },
  viewConfig: { ...DEFAULT_MEDIA_VIEW_CONFIG },
  theme: 'green',
};

// Built-in presets cleared per user request
export const MEDIA_PRESETS: MediaPreset[] = [];

