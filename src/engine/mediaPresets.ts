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
 * The DPI paths multiply source width by a percentage with no bound of their
 * own, so a 4000px photo at 200 DPI asks for 8000x6000 -- 48M cells, which is
 * not slow but unresponsive: one rasterization runs for seconds and the tab
 * stops answering.
 */
export const MAX_GRID_COLS = 2048;

/**
 * And the total, which is what the rasterizer actually pays for.
 *
 * A width cap alone bounds nothing on a tall source: a 1000x20000 panorama is
 * already inside it and still asks for 20M cells. Set to a square at the width
 * cap, so the two agree for a square picture and neither is the odd one out.
 *
 * It costs the long axis of a portrait source some resolution -- a 3000x4000
 * photo lands at 1774x2365 rather than 2048x2731 -- which is the trade the cap
 * exists to make.
 */
export const MAX_GRID_CELLS = MAX_GRID_COLS * MAX_GRID_COLS;

/**
 * Scale a requested grid down inside both budgets, preserving aspect.
 *
 * One factor for both axes, taken as the tightest the two caps allow. Scaling
 * them separately is how a grid ends up a different shape than the picture it
 * is for, and the letterboxing that follows looks like a bug in the crop
 * rather than in the clamp.
 *
 * Applied to the DPI controls, where the cell count is implied by a percentage
 * rather than typed. An explicitly entered cols/rows is left alone -- someone
 * typing 4000 into a number field means it, and may be setting up an export.
 */
export function clampGridToBudget(cols: number, rows: number): { cols: number; rows: number } {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  const scale = Math.min(MAX_GRID_COLS / c, Math.sqrt(MAX_GRID_CELLS / (c * r)));
  if (scale >= 1) return { cols, rows };
  return {
    cols: Math.max(10, Math.round(c * scale)),
    rows: Math.max(10, Math.round(r * scale)),
  };
}

export const DEFAULT_MEDIA_VIEW_CONFIG: MediaViewConfig = {
  // 1. Render / Sampling Settings
  resampling: 'preserve-details',
  algorithm: 'floyd-steinberg',
  rasterMode: 'pixel',
  dpi: 72,
  invert: false,
  edgeDetection: false,
  edgeThreshold: 30,
  edgeStrength: 100,

  // 2. Effect Controls
  sharpenStrength: 0,
  sharpenRadius: 1,
  noise: 0,
  denoise: 0,
  blur: 0,
  brightness: 0,
  contrast: 0,

  // 3. Tonal Controls (all sliders start at center)
  tonalMapping: 'ntone',
  highlightColor: '#00ff66',
  midtoneColor: '#00a848',
  shadowColor: '#0a0a0a',
  /*
   * Seeded to match the triple above, the same way DEFAULT_IMAGE_ADJUST_CONFIG
   * does. 'ntone' with the array left out is a valid config the engine now
   * resolves from the triple anyway, but the ramp editor writes this key on the
   * first edit, so seeding it keeps a fresh media session and an edited one
   * structurally identical rather than differing by one absent field.
   */
  customToneColors: ['#0a0a0a', '#00a848', '#00ff66'],
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
