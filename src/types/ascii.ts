export interface TrailPoint {
  x: number;
  y: number;
  age: number;
  initialAge: number;
  char: string;
  vx?: number;
  vy?: number;
}

export interface CrtConfig {
  scanlines: boolean;
  crtGlow: boolean; // centered ambient background radial glow
  vignette: boolean;
  phosphorBloom: boolean; // character soft bloom
  glow?: boolean; // legacy compatibility fallback
}

export interface ParticleConfig {
  enabled: boolean;
  lifespan: number;
  decayRate: number;
  trailChars: string;
  burstCount: number;
  burstSpeed: number;
  flowStrength: number;
  swirlStrength: number;
  drag: number;
  luminanceBoost: number;
}

export interface WaveParams {
  // Global / Dynamics
  timeSpeed: number;
  aspectRatio: number;
  contrast: number;
  bias: number;
  invert: boolean;

  // 1. Primary Radial Wave: sin(dist * freq - time * speed)
  radialAmp: number;
  radialFreq: number;
  radialSpeed: number;
  radialCenterOffsetX: number;
  radialCenterOffsetY: number;

  // 2. Secondary Harmonic Radial Wave
  radial2Amp: number;
  radial2Freq: number;
  radial2Speed: number;

  // 3. Directional Waves (X, Y, Diagonal)
  xAmp: number;
  xFreq: number;
  xSpeed: number;

  yAmp: number;
  yFreq: number;
  ySpeed: number;

  diagAmp: number;
  diagFreq: number;
  diagSpeed: number;

  // 4. Spiral / Angular Wave
  spiralAmp: number;
  spiralArms: number;
  spiralSpeed: number;
  spiralTwist: number;

  // 5. Tunnel / Depth Inverse Distance
  tunnelAmp: number;
  tunnelPower: number;
  tunnelSpeed: number;

  // 6. Concentric Rings
  ringsAmp: number;
  ringsRadius: number;
  ringsSpeed: number;
  ringsCount: number;

  // 7. Dual Emitter Interference (Moiré)
  dualEmitterAmp: number;
  dualEmitterSpacing: number;
  dualEmitterFreq: number;
  dualEmitterSpeed: number;

  // 8. Starfield / Sparkle Texture
  starfieldIntensity: number;
  starfieldDensity: number;
  starfieldSpeed: number;
  starfieldScale: number;
}

export interface PhosphorGradient {
  id?: string;
  name?: string;
  color1: string;
  color2: string;
  angle: number; // in degrees (0, 45, 90, 135, 180, etc.)
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  densityCharset?: string;
  particleConfig?: ParticleConfig;
  optimizeConfig?: OptimizeConfig;
  crtConfig?: CrtConfig;
  author?: string;
}

export type PhosphorTheme =
  | 'green'
  | 'amber'
  | 'cyan'
  | 'monochrome'
  | 'matrix'
  | 'paper'
  | 'blood';

export interface CharsetOption {
  id: string;
  name: string;
  chars: string;
}

export interface CustomRenderContext {
  [key: string]: any;
}

export interface RenderContext {
  cols: number;
  rows: number;
  time: number;
  density: string;
  trailPoints: TrailPoint[];
  waveParams: WaveParams;
  customRenderFn?: (
    x: number,
    y: number,
    time: number,
    dist: number,
    dx: number,
    dy: number,
    cols: number,
    rows: number,
    angle: number,
    ctx?: CustomRenderContext
  ) => number;
  prepareFn?: (time: number, cols: number, rows: number, ctx?: CustomRenderContext) => void;
  customContext?: CustomRenderContext;
  interactiveInfluence: boolean;
  luminanceBoost?: number;
}

export type AppMode = 'synth' | 'media' | 'model';

// --- 2D Media (Images & Videos) Types ---
export type MediaSourceType = 'preset' | 'file' | 'url' | 'clipboard';
export type MediaType = 'image' | 'video';
export type MediaFitMode = 'contain' | 'cover' | 'stretch' | 'original';
// --- v1.6 Raster Modalities & Advanced Engine Types ---
export type RasterOutputMode =
  | 'ascii'
  | 'braille'
  | 'halftone-dot'
  | 'halftone-line'
  | 'halftone-crosshatch'
  | 'halftone-cmyk'
  | 'pixel';

export type DitherFamily = 'error-diffusion' | 'ordered' | 'blue-noise' | 'algorithmic' | 'modulation';

export type DitherAlgorithm =
  // Error Diffusion (12)
  | 'none'
  | 'floyd-steinberg'
  | 'false-floyd-steinberg'
  | 'atkinson'
  | 'sierra-3'
  | 'sierra-2'
  | 'sierra-lite'
  | 'stucki'
  | 'jjn'
  | 'burkes'
  | 'fan'
  | 'shiau-fan'
  | 'ostromoukhov'
  // Ordered & Clustered Matrices (12)
  | 'bayer-2x2'
  | 'bayer-4x4'
  | 'bayer-8x8'
  | 'bayer-16x16'
  | 'cluster-4x4'
  | 'cluster-8x8'
  | 'diagonal-4x4'
  | 'diagonal-8x8'
  | 'horizontal-lines'
  | 'vertical-lines'
  | 'crosshatch-8x8'
  | 'spiral-dot'
  // Blue Noise & Stochastic (5)
  | 'blue-noise'
  | 'void-cluster'
  | 'white-noise'
  | 'gaussian-noise'
  | 'interleaved-gradient'
  // Algorithmic & Space-Filling (4)
  | 'dot-diffusion'
  | 'hilbert'
  | 'peano'
  | 'r-sequence'
  // Modulation & Glitch (4)
  | 'scanline-shift'
  | 'sine-drift'
  | 'glitch-displacement'
  | 'threshold-mod';

export type PaletteCategory = 'retro' | 'print' | 'design' | 'custom';

export interface ColorPalette {
  id: string;
  name: string;
  category: PaletteCategory;
  colors: string[];
}

export type PaletteMode =
  | 'phosphor'
  | 'gradient'
  | 'duotone'
  | 'tritone'
  | 'quadtone'
  | 'indexed'
  | 'extracted'
  | 'content';

export interface MultiToneConfig {
  shadow: string;
  midtone?: string;
  highlight: string;
  highlight2?: string;
  contrast?: number;
}

export interface HalftoneConfig {
  dotScale: number; // 0.2 to 2.5, default 1.0
  lineAngle: number; // 0 to 180 degrees
  dotShape: 'circle' | 'square' | 'diamond';
  minSize: number; // 0 to 1
  maxSize: number; // 0 to 1
  cmykAngles: { c: number; m: number; y: number; k: number };
  cellRatio?: number; // 1.0 = square (1:1), 0.6 = monospace, etc.
  dotPitch?: number; // pixel size per cell (e.g. 4 to 20, default 8)
}

export const DEFAULT_HALFTONE_CONFIG: HalftoneConfig = {
  dotScale: 1.0,
  lineAngle: 45,
  dotShape: 'circle',
  minSize: 0.05,
  maxSize: 1.0,
  cmykAngles: { c: 15, m: 75, y: 0, k: 45 },
  cellRatio: 1.0,
  dotPitch: 8,
};


export interface ToneMappingConfig {
  levelsBlack: number; // 0..100
  levelsMidtones: number; // 0..100 (50 default)
  levelsWhite: number; // 0..100
  channelMixerR: number; // 0..200 (100 default)
  channelMixerG: number; // 0..200 (100 default)
  channelMixerB: number; // 0..200 (100 default)
  posterizeBits: number; // 0 (off), 1, 2, 3, 4, 8
  inkBleed: number; // 0..100 (dot gain / print spread)
  curvePoints?: Array<[number, number]>;
}

export const DEFAULT_TONE_MAPPING_CONFIG: ToneMappingConfig = {
  levelsBlack: 0,
  levelsMidtones: 50,
  levelsWhite: 100,
  channelMixerR: 100,
  channelMixerG: 100,
  channelMixerB: 100,
  posterizeBits: 0,
  inkBleed: 0,
};

export type ResamplingMode = 'bilinear' | 'nearest' | 'preserve-details';
export type TonalMappingMode = '1-color' | '2-color' | 'multi-tone' | 'grayscale';
export type BackgroundMode = 'black' | 'white' | 'transparent';

export interface MediaConfig {
  sourceType: MediaSourceType;
  mediaType: MediaType;
  mediaId?: string;
  fileName?: string;
  fileData?: string; // base64 or object URL / data URL for image or video
  remoteUrl?: string;
  scale: number;
  fit: MediaFitMode;
  offsetX: number;
  offsetY: number;
  rotation: number; // in degrees
  flipX: boolean;
  flipY: boolean;
  loop: boolean;
  playbackSpeed: number;
}

export type ColorMode = 'fixed' | 'content';
export type ColorSamplingMethod = 'average' | 'center' | 'weighted';
export type ColorBgPreset = 'dark' | 'white' | 'custom';

export interface MediaColorConfig {
  mode: ColorMode;
  sampling: ColorSamplingMethod;
  bgPreset: ColorBgPreset;
  customBg: string;
  saturation: number; // 0 to 400, default 200
  paletteMode?: PaletteMode;
  activePaletteId?: string;
  customPalette?: string[];
  multiTone?: MultiToneConfig;
}

export const DEFAULT_MEDIA_COLOR_CONFIG: MediaColorConfig = {
  mode: 'fixed',
  sampling: 'center',
  bgPreset: 'dark',
  customBg: '#0a0a0a',
  saturation: 200,
  paletteMode: 'phosphor',
  activePaletteId: 'gameboy-classic',
};

export interface MediaViewConfig {
  // 1. Render / Sampling Settings
  resampling: ResamplingMode;
  algorithm: DitherAlgorithm;
  rasterMode?: RasterOutputMode;
  halftoneConfig?: HalftoneConfig;
  toneConfig?: ToneMappingConfig;
  invert: boolean;
  edgeDetection: boolean;
  edgeThreshold: number; // 0 to 100
  edgeStrength: number; // 0 to 200

  // 2. Effect Controls
  sharpenStrength: number; // 0 to 300
  sharpenRadius: number; // 1 to 10
  noise: number; // 0 to 100
  blur: number; // 0 to 20
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100

  // 3. Tonal Controls
  curvePoints?: Array<[number, number]>; // editable [x, y] control points in [0..1]
  levelBlack?: number; // 0 to 100, default 0
  levelMidtones?: number; // 0 to 100, default 50 (middle)
  levelWhite?: number; // 0 to 100, default 100
  highlights: number; // -100 to 100, default 0 (middle)
  midtones: number; // -100 to 100, default 0 (middle)
  shadows: number; // -100 to 100, default 0 (middle)
  background: BackgroundMode;
  alphaThreshold: number; // 0 to 255
  colorConfig?: MediaColorConfig;
}

export interface MediaPreset {
  id: string;
  name: string;
  description: string;
  mediaConfig: MediaConfig;
  viewConfig: MediaViewConfig;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  densityCharset?: string;
  colorConfig?: MediaColorConfig;
  optimizeConfig?: OptimizeConfig;
  crtConfig?: CrtConfig;
  author?: string;
}

export type ModelShadingMode = 'shaded' | 'wireframe' | 'depth' | 'normals' | 'outline' | 'points';

export type BuiltinModelId = 'torus-knot';

export interface ModelConfig {
  sourceType: 'preset' | 'file' | 'url';
  modelId: string;
  fileName?: string;
  fileData?: string; // base64 or text representation for serialization
  fileType?: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply';
  remoteUrl?: string;
  remoteAttribution?: string;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  normalizeSize: boolean;
  autoCenter: boolean;
  flatShading: boolean;
  wireframe: boolean;
  doubleSided: boolean;
  invertNormals: boolean;
  polyStats?: { vertices: number; faces: number };
}

export interface ModelViewConfig {
  shadingMode: ModelShadingMode;
  autoRotate: boolean;
  autoRotateSpeedX: number;
  autoRotateSpeedY: number;
  autoRotateSpeedZ: number;
  manualRotationX: number;
  manualRotationY: number;
  manualRotationZ: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  lightAngleX: number;
  lightAngleY: number;
  lightIntensity: number;
  ambientLight: number;
  specularIntensity: number;
  contrast: number;
  brightness: number;
  invert: boolean;
  edgeThreshold: number;
  edgeWeight: number;
  cameraDistance: number;
  fov: number;
  isOrthographic: boolean;
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  halftoneConfig?: HalftoneConfig;
  toneConfig?: ToneMappingConfig;
}

export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  modelConfig: ModelConfig;
  viewConfig: ModelViewConfig;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  densityCharset?: string;
  optimizeConfig?: OptimizeConfig;
  crtConfig?: CrtConfig;
  author?: string;
}

export interface OptimizeConfig {
  targetFps: number; // 0 for uncapped, or 15, 20, 24, 30, 45, 60
  pauseWhenHidden: boolean; // Pause when tab is inactive
  idleThrottle: boolean; // Throttle framerate when mouse is idle
}

export interface RenderSettings {
  cols: number;
  rows: number;
  autoRes: boolean;
  density: string;
  theme: PhosphorTheme;
  customThemeColor: string;
  gradientConfig: PhosphorGradient | null;
  crtConfig: CrtConfig;
  optimizeConfig: OptimizeConfig;
  mediaColorConfig?: MediaColorConfig;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  halftoneConfig?: HalftoneConfig;
  toneConfig?: ToneMappingConfig;
}

