import { DitherAlgorithm, ResamplingMode, TonalMappingType } from '../types/ascii';

/**
 * One-click looks covering the three panels a look is actually made of:
 * render settings, effect controls and tonal controls.
 *
 * Every preset sets the SAME complete field set. Partial presets would let one
 * look inherit the previous one's leftovers -- pick a blurred preset, then a
 * sharp one, and the blur silently rides along -- so switching would not be
 * reproducible. Nothing outside these three panels is touched: resolution,
 * DPI, framing, raster mode, palette and the invert toggle all stay put.
 */
export interface ShaderPresetConfig {
  // Render settings
  algorithm: DitherAlgorithm;
  resampling: ResamplingMode;
  // Effect controls
  sharpenStrength: number;
  sharpenRadius: number;
  blur: number;
  denoise: number;
  noise: number;
  brightness: number;
  contrast: number;
  // Tonal controls
  colorLevels: number;
  highlights: number;
  midtones: number;
  shadows: number;
  tonalMapping: TonalMappingType;
  highlightColor: string;
  midtoneColor: string;
  shadowColor: string;
}

export interface ShaderPreset {
  id: string;
  /** Short label for the button. Keep it to ~12 characters. */
  label: string;
  /** Tooltip: what the look is and where it comes from. */
  description: string;
  config: ShaderPresetConfig;
  /** Monochrome tint, applied only when tonalMapping is '1color'. */
  tint?: string;
}

/** Neutral starting point every preset is expressed as a departure from. */
const BASE: ShaderPresetConfig = {
  algorithm: 'floyd-steinberg',
  resampling: 'preserve-details',
  sharpenStrength: 0,
  sharpenRadius: 2,
  blur: 0,
  denoise: 0,
  noise: 0,
  brightness: 0,
  contrast: 0,
  colorLevels: 0,
  highlights: 0,
  midtones: 0,
  shadows: 0,
  tonalMapping: '1color',
  highlightColor: '#ffffff',
  midtoneColor: '#808080',
  shadowColor: '#000000',
};

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: 'neutral',
    label: 'NEUTRAL',
    description: 'Ungraded baseline: Floyd-Steinberg, no effects, white monochrome. A starting point, not a look.',
    config: { ...BASE },
    tint: '#ffffff',
  },
  {
    id: 'classic-mac',
    label: 'CLASSIC MAC',
    description: 'Macintosh 1984: Atkinson diffusion at 1-bit, which keeps midtones open instead of crushing them.',
    config: {
      ...BASE,
      algorithm: 'atkinson',
      colorLevels: 2,
      sharpenStrength: 120,
      contrast: 30,
      brightness: 5,
    },
    tint: '#ffffff',
  },
  {
    id: 'newsprint',
    label: 'NEWSPRINT',
    description: 'Halftone dot screen with ink-dark stops, as a photo reproduced on newsprint.',
    config: {
      ...BASE,
      algorithm: 'halftone-dot',
      colorLevels: 4,
      contrast: 35,
      brightness: 10,
      tonalMapping: '2color',
      highlightColor: '#f5f2e8',
      shadowColor: '#111827',
    },
  },
  {
    id: 'xerox',
    label: 'XEROX',
    description: 'Blown-out photocopy: hard threshold, heavy contrast and a little grain in the flats.',
    config: {
      ...BASE,
      // 'none' is the direct-threshold path; there is no separate 'threshold' id.
      algorithm: 'none',
      colorLevels: 2,
      contrast: 65,
      brightness: -5,
      noise: 14,
      sharpenStrength: 180,
      tonalMapping: '2color',
      highlightColor: '#fbfbf2',
      shadowColor: '#1a1a1a',
    },
  },
  {
    id: 'blueprint',
    label: 'BLUEPRINT',
    description: 'Cyanotype drafting print: pale linework on process blue, ordered 4x4 screen.',
    config: {
      ...BASE,
      algorithm: 'bayer-4x4',
      colorLevels: 3,
      sharpenStrength: 150,
      contrast: 25,
      tonalMapping: '2color',
      highlightColor: '#dfe9ff',
      shadowColor: '#0b2452',
    },
  },
  {
    id: 'cyberpunk',
    label: 'CYBERPUNK',
    description: 'Eighties neon tritone on an 8x8 ordered grid: cyan highlights, magenta mids, near-black shadows.',
    config: {
      ...BASE,
      algorithm: 'bayer-8x8',
      colorLevels: 4,
      sharpenStrength: 100,
      contrast: 20,
      tonalMapping: '3color',
      highlightColor: '#00f0ff',
      midtoneColor: '#ff0055',
      shadowColor: '#1a0033',
    },
  },
  {
    id: 'riso',
    label: 'RISO',
    description: 'Risograph two-ink screenprint. Blue noise keeps the grain organic rather than gridded.',
    config: {
      ...BASE,
      algorithm: 'blue-noise',
      colorLevels: 3,
      contrast: 18,
      tonalMapping: '2color',
      highlightColor: '#f84392',
      shadowColor: '#3a44a8',
    },
  },
  {
    id: 'amber-crt',
    label: 'AMBER CRT',
    description: 'Amber phosphor terminal: monochrome tint, sharpened, shadows lifted the way a warm tube glows.',
    config: {
      ...BASE,
      algorithm: 'floyd-steinberg',
      sharpenStrength: 140,
      contrast: 15,
      shadows: 12,
    },
    tint: '#ffb000',
  },
  {
    id: 'green-phosphor',
    label: 'PHOSPHOR',
    description: 'Green monochrome monitor: high micro-contrast with the deep blacks of a dark tube.',
    config: {
      ...BASE,
      algorithm: 'floyd-steinberg',
      sharpenStrength: 160,
      contrast: 22,
      shadows: -8,
    },
    tint: '#00ff66',
  },
  {
    id: 'airbrush',
    label: 'AIRBRUSH',
    description: 'No dither at all: a soft continuous ramp, blurred and flattened. The opposite of a screen.',
    config: {
      ...BASE,
      algorithm: 'none',
      resampling: 'bilinear',
      blur: 1.4,
      denoise: 0.8,
      contrast: -12,
      brightness: 6,
    },
    tint: '#ffffff',
  },
  {
    id: 'hard-ink',
    label: 'HARD INK',
    description: 'Brush and ink: everything driven to two flat values with no screen between them.',
    config: {
      ...BASE,
      // 'none' is the direct-threshold path; there is no separate 'threshold' id.
      algorithm: 'none',
      colorLevels: 2,
      sharpenStrength: 240,
      sharpenRadius: 1.5,
      contrast: 80,
      tonalMapping: '2color',
      highlightColor: '#ffffff',
      shadowColor: '#000000',
    },
  },
  {
    id: 'crosshatch',
    label: 'CROSSHATCH',
    description: 'Engraved crosshatch screen: an etching plate rather than a dot grid.',
    config: {
      ...BASE,
      algorithm: 'crosshatch-8x8',
      colorLevels: 3,
      sharpenStrength: 130,
      contrast: 30,
      highlights: -10,
    },
    tint: '#ffffff',
  },
  {
    id: 'scanline',
    label: 'SCANLINE',
    description: 'Horizontal line screen with drifting phase, like a mistracking broadcast signal.',
    config: {
      ...BASE,
      algorithm: 'scanline-shift',
      colorLevels: 4,
      contrast: 28,
      noise: 8,
      tonalMapping: '2color',
      highlightColor: '#e8f4ff',
      shadowColor: '#0a1428',
    },
  },
  {
    id: 'hilbert',
    label: 'HILBERT',
    description: 'Space-filling curve dither: grain that reads as woven thread instead of a repeating cell.',
    config: {
      ...BASE,
      algorithm: 'hilbert',
      colorLevels: 3,
      sharpenStrength: 110,
      contrast: 20,
    },
    tint: '#ffffff',
  },
];

/**
 * Whether a preset is the look currently in force.
 *
 * Compares only the fields a preset actually sets, so an unrelated edit
 * elsewhere in the sidebar does not clear the highlight -- but any edit to a
 * field the preset owns does, which is the honest signal.
 */
export function isShaderPresetActive(
  preset: ShaderPreset,
  current: Partial<ShaderPresetConfig>
): boolean {
  return (Object.keys(preset.config) as (keyof ShaderPresetConfig)[]).every((key) => {
    // A field the panel does not have at all (synth and model have no
    // resampling filter) cannot disagree, so it does not count against a match.
    if (!(key in current)) return true;
    const want = preset.config[key];
    const have = current[key];
    if (typeof want === 'string') {
      return typeof have === 'string' && want.toLowerCase() === have.toLowerCase();
    }
    // An unset numeric field reads as the neutral 0 the presets are built on.
    return (typeof have === 'number' ? have : 0) === want;
  });
}

/**
 * The tonal / effect half of a preset, i.e. everything that lives in an
 * ImageAdjustConfig.
 *
 * Synth and model keep the dither algorithm on their render settings and have
 * no resampling filter at all, so they cannot take `config` wholesale the way
 * the media panel can. Splitting it here keeps that knowledge in one place
 * instead of each call site re-deriving which fields belong where.
 */
export function toAdjustFields(preset: ShaderPreset) {
  const { algorithm, resampling, ...adjustFields } = preset.config;
  void algorithm;
  void resampling;
  return adjustFields;
}
