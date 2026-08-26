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

/**
 * Widest grid a DPI setting is allowed to ask for.
 *
 * Matches the ceiling autoSetMediaResolution already applies. The DPI paths
 * multiply source width by a percentage with no bound of their own, so a 4000px
 * photo at 200 DPI asks for 8000x6000 -- 48M cells, which is not slow but
 * unresponsive: one rasterization runs for seconds and the tab stops answering.
 */
export const MAX_GRID_COLS = 2048;

/**
 * Scale a requested grid down to MAX_GRID_COLS, preserving aspect.
 *
 * Applied to the DPI controls, where the cell count is implied by a percentage
 * rather than typed. An explicitly entered cols/rows is left alone -- someone
 * typing 4000 into a number field means it, and may be setting up an export.
 */
export function clampGridToBudget(cols: number, rows: number): { cols: number; rows: number } {
  if (cols <= MAX_GRID_COLS) return { cols, rows };
  const scale = MAX_GRID_COLS / cols;
  return {
    cols: MAX_GRID_COLS,
    rows: Math.max(10, Math.round(rows * scale)),
  };
}

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
  // Monochrome by default, matching DEFAULT_IMAGE_ADJUST_CONFIG -- see the
  // note there for why duotone is a poor first impression in ASCII output.
  tonalMapping: '1color',
  highlightColor: '#00ff66',
  midtoneColor: '#00a848',
  shadowColor: '#0a0a0a',
  curvePoints: [
    [0, 0],
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
    [1, 1],
  ],
  highlights: 0,
  midtones: 0,
  shadows: 0,
  background: 'black',
  alphaThreshold: 10,
};
