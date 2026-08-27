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
  /**
   * Hairline around the raster extents plus a faint tint outside them, so a
   * panned or zoomed-out view still reads where the image ends. Optional so
   * older shared links and saved settings default it on.
   */
  viewportBounds?: boolean;
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

/**
 * Which of the two sidebar layouts is on screen.
 *
 * BASIC is a single flat panel covering the media -> dither -> adjust -> colour
 * -> export path; ADVANCED is the two-tab tree with every source and control.
 * Both read and write exactly the same state, so this only decides what is
 * rendered -- never what a setting means.
 */
export type UiMode = 'basic' | 'advanced';

export interface UiThemeSettings {
  uiTheme: PhosphorTheme;
  customUiColor: string;
  syncUiWithAscii: boolean;
  autoCollapsePanels?: boolean;
  /**
   * Draw static images at a reduced grid while controls are being dragged,
   * then re-render sharp once they settle.
   *
   * Lives here rather than on OptimizeConfig because it describes the machine
   * the app is running on, not the artwork: OptimizeConfig is per-mode and
   * travels inside presets and shared links, and one person's need for a
   * coarse preview should not follow their work onto someone else's screen.
   *
   * Undefined means on -- the preview already costs nothing on grids fast
   * enough not to need it, so opting out is the unusual choice.
   */
  lowResPreview?: boolean;
  /**
   * Absent on settings blobs written before the switch existed, which is how
   * an existing user is told apart from a first-time one. See resolveUiMode.
   */
  uiMode?: UiMode;
}

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
/**
 * What a processed frame is made of.
 *
 * `ascii` and `pixel` are both *cell* modes: one glyph or one block per grid
 * cell, tone quantized to the grid. `vector` is not — it leaves the raster
 * pipeline at step 3.5 and returns polylines in continuous grid space. See
 * vector-pipeline.md for why the deflection look cannot be a dither algorithm.
 */
export type RasterOutputMode =
  | 'ascii'
  | 'pixel'
  | 'vector';

export type DitherFamily = 'error-diffusion' | 'ordered' | 'blue-noise' | 'algorithmic' | 'modulation';

/**
 * Per-algorithm tuning for the dither pass.
 *
 * Every field is optional and every algorithm ignores the ones it has no use
 * for — `getDitherParamIds` in engine/ditherAlgorithms is the authority on
 * which apply to which, and drives both the resolver and the controls. An
 * absent field takes the parameter's own default, so an empty object and an
 * absent object render identically; that is what keeps links and presets
 * written before this existed rendering the way they always did.
 */
export interface DitherParams {
  /** Mask amplitude / diffused error scale. 1 = one quantization step. */
  intensity?: number;
  /** Cells per mask sample; coarsens a tiling pattern without reshaping it. */
  scale?: number;
  /** Mask rotation in degrees. */
  angle?: number;
  /** Carrier rate multiplier for the wave and line patterns. */
  frequency?: number;
  /** Pattern origin offset. Deterministic — the same seed gives the same frame. */
  seed?: number;
  /** Alternate scan direction per row in the error-diffusion family. */
  serpentine?: boolean;
}

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
  // Algorithmic & Space-Filling (5)
  | 'halftone-dot'
  | 'dot-diffusion'
  | 'hilbert'
  | 'peano'
  | 'r-sequence'
  // Modulation & Generative (9)
  | 'rutt-etra'
  | 'scanline-shift'
  | 'sine-drift'
  | 'glitch-displacement'
  | 'threshold-mod'
  | 'phase-modulation'
  | 'bytewave'
  | 'concentric-rings'
  | 'cellular-circuit';

// --- Vector Modulation (Rutt-Etra / oscilloscope deflection) ---

/**
 * One continuous stroke of the beam.
 *
 * Points are flat `x0,y0,x1,y1,…` in grid space rather than `{x,y}[]`: a
 * 54-line frame at 400 samples is 21,600 points, and the phase animation
 * re-traces every one of them every frame.
 *
 * A carrier break, a blanking, or a transparent cell ends the polyline and
 * starts a new one, so a single scan line yields 1..n entries.
 */
export interface VectorPolyline {
  points: Float32Array;
  color: string;
  width: number;
  /**
   * Close down to the baseline and fill with the background before stroking —
   * painter's-algorithm occlusion, so a near ridge hides the line behind it.
   * Only ever set on an unbroken polyline; a dashed beam has no interior.
   */
  filled?: boolean;
}

export interface VectorFrame {
  /** Grid space, matching `cols` / `rows`. Polylines are painted into this box. */
  width: number;
  height: number;
  polylines: VectorPolyline[];
  bgColor: string;
  /** Canvas shadowBlur for the phosphor halo, carried through to every painter. */
  glow: number;
  glowColor: string;
  /**
   * Where an occlusion polygon closes to.
   *
   * Direction-dependent, so the painters cannot assume it: a horizontal relief
   * closes down to the bottom edge, but a vertical beam deflects sideways and
   * closing it downward fills a meaningless wedge. Absent when nothing is
   * filled.
   */
  fillEdge?: { axis: 'x' | 'y'; value: number };
  /**
   * Composite the strokes additively. Set when chromatic aberration split the
   * beam into channel passes, which have to recombine to white where they
   * coincide rather than the last one covering the others.
   */
  additive: boolean;
}

/**
 * Beam deflection parameters.
 *
 * Deliberately *not* an extension of `DitherParams`. That bag has six fields
 * shared across 44 algorithms and `getDitherParamIds` derives each algorithm's
 * controls from it; pushing fifteen more fields through it would hand 43
 * algorithms sliders that do nothing.
 */
export interface VectorConfig {
  direction: 'vertical' | 'horizontal';
  /** Number of scan lines across the image. */
  lineCount: number;
  /** Grid cells between samples along a line. Higher is coarser and faster. */
  sampleStep: number;
  /**
   * Low-pass radius in grid cells, along the beam only.
   *
   * The control that actually smooths a line. `sampleStep` reads like one and is
   * not: it *decimates* the series, so raising it drops vertices without
   * touching the values that survive — a coarser, more angular line carrying the
   * same point-sampled noise. Filtering has to happen to the luminance, before
   * it becomes a displacement.
   *
   * One-dimensional on purpose. Blurring across the placement axis would bleed
   * neighbouring scan lines into each other, and lines staying independent is
   * the entire premise of a relief.
   *
   * 0 is off and every sample is read raw.
   */
  smoothing: number;
  /** Peak deflection in grid cells. Negative inverts the relief. */
  amplitude: number;
  /** Luminance that deflects to zero. 0.5 is bipolar, 0 is unidirectional. */
  bias: number;
  /**
   * Luminance below which the beam is off entirely — the CRT blanking level.
   *
   * Independent of the carrier, which is the whole point. The two answer
   * different questions: blanking is *where there is no beam at all*, the
   * carrier is *how the beam breaks up where it is dim*. Tying them together
   * (as the reference studio does, and as this did at first) leaves only two
   * reachable looks — flat baselines drawn across the whole background, or
   * everything dissolved into dots — with no way to clear the background while
   * keeping the lit subject a continuous line.
   *
   * 0 draws the baseline everywhere, which is what a Joy Division relief wants.
   */
  blanking: number;
  occlusion: boolean;
  carrierEnabled: boolean;
  carrierFreq: number;
  carrierThreshold: number;
  /** Pulse-width factor: how fast the carrier duty cycle opens with luminance. */
  pwm: number;
  rippleAmp: number;
  rippleFreq: number;
  /** Animation input in radians, driven by the render loop rather than stored. */
  phase: number;
  strokeWidth: number;
  glow: number;
  /** Chromatic aberration offset in grid cells; 0 disables the extra passes. */
  chroma: number;
}

/**
 * Mirrors the studio's opening state, so a fresh vector mode looks like
 * `rutt_etra_scanline_dither_studio.html` on first paint.
 */
export const VECTOR_CONFIG_DEFAULTS: VectorConfig = {
  direction: 'vertical',
  lineCount: 54,
  sampleStep: 2,
  smoothing: 0,
  amplitude: 65,
  bias: 0.5,
  blanking: 0.02,
  occlusion: false,
  carrierEnabled: true,
  carrierFreq: 0.45,
  carrierThreshold: 0.32,
  pwm: 1.2,
  rippleAmp: 0,
  rippleFreq: 1.2,
  phase: 0,
  strokeWidth: 1.2,
  glow: 0,
  chroma: 0,
};

export type PaletteCategory = 'retro' | 'print' | 'design' | 'ramp' | 'custom';

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

export interface ToneMappingConfig {
  mappingMode?: '1-color' | '2-color' | '3-color' | 'multi-tone';
  numTones?: number; // 1 to 16+
  toneStops?: string[]; // Array of hex colors for the N stops (from shadow to highlight)
  highlightColor?: string; // For 1-color mode (e.g. '#9bb0ff')
  shadowColor?: string; // For 2-color / 3-color mode
  midtoneColor?: string; // For 3-color mode
  bgColor?: string; // 'black' | 'dark' | 'white' | 'transparent' | hex
  levelsBlack: number; // 0..255 (0 default)
  levelsMidtones: number; // 0..255 (128 default)
  levelsWhite: number; // 0..255 (255 default)
  channelMixerR: number; // 0..200 (100 default)
  channelMixerG: number; // 0..200 (100 default)
  channelMixerB: number; // 0..200 (100 default)
  posterizeBits: number; // 0 (off), 1, 2, 3, 4, 8
  inkBleed: number; // 0..100 (dot gain / print spread)
  curvePoints?: Array<[number, number]>;
}

export const DEFAULT_TONE_MAPPING_CONFIG: ToneMappingConfig = {
  mappingMode: '1-color',
  numTones: 1,
  toneStops: ['#9bb0ff'],
  highlightColor: '#9bb0ff',
  shadowColor: '#1a1a2e',
  midtoneColor: '#4e54c8',
  bgColor: '#000000',
  levelsBlack: 0,
  levelsMidtones: 128,
  levelsWhite: 255,
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

/**
 * How an indexed palette is matched to the source.
 *
 * 'auto' samples the source and picks: chromatic sources get hue matching,
 * luminance-driven ones (3D shading, synth fields, greyscale) get the ramp.
 * The other two settle it explicitly, because the two looks are a real choice
 * rather than a detection problem -- 'hue' keeps the source's own colours and
 * so only ever reaches the palette entries near them, while 'ramp' discards
 * hue and spreads luminance across every entry.
 */
export type PaletteMatchMode = 'auto' | 'hue' | 'ramp';

export interface MediaColorConfig {
  mode: ColorMode;
  sampling: ColorSamplingMethod;
  bgPreset: ColorBgPreset;
  customBg: string;
  saturation: number; // 0 to 400, default 200
  paletteMode?: PaletteMode;
  activePaletteId?: string;
  paletteMatch?: PaletteMatchMode;
  /**
   * Resolved monochrome tint. Derived from the theme / custom colour at render
   * time rather than stored, so it cannot drift from the sidebar value.
   */
  monoTint?: string;
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
  paletteMatch: 'auto',
};

/**
 * How graded luminance becomes colour. This is one half of the single colour
 * selector: the other half is MediaColorConfig.paletteMode, which takes over
 * for 'indexed' and 'content'. The UI presents both as one list.
 *
 * The old hardcoded 'gameboy' / 'cyberpunk' / 'amber' presets are gone; they
 * were three-stop ramps duplicating built-in palettes and are migrated to
 * them on load.
 */
export type TonalMappingType = '1color' | '2color' | '3color' | 'ntone';

/** Legacy tonal presets -> the built-in palette that reproduces them. */
export const LEGACY_TONAL_PRESET_PALETTES: Record<string, string> = {
  gameboy: 'gameboy-classic',
  cyberpunk: 'cyberpunk-neon',
  amber: 'crt-amber',
};

/**
 * Tone, filter and colour-grading controls consumed by the unified raster
 * engine. Shared by every app mode (synth, media, model) so a frame is graded
 * the same way whatever produced it.
 */
export interface ImageAdjustConfig {
  // Filters
  invert: boolean;
  edgeDetection: boolean;
  edgeThreshold: number; // 0 to 100
  edgeStrength: number; // 0 to 200
  sharpenStrength: number; // 0 to 300
  sharpenRadius: number; // 1 to 10
  noise: number; // 0 to 100
  denoise: number; // 0 to 100
  blur: number; // 0 to 20
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100

  // Tonal grading
  tonalMapping?: TonalMappingType;
  highlightColor?: string; // e.g. '#FFFFFF'
  midtoneColor?: string; // e.g. '#3B82F6'
  shadowColor?: string; // e.g. '#000000'
  customToneColors?: string[]; // Array of N hex color stops from shadow (0%) to highlight (100%)
  /**
   * Share of the tonal range each stop in `customToneColors` occupies.
   *
   * One entry per stop, any positive scale -- they are normalised, so [1,1,1]
   * and [50,50,50] are the same even split. Absent or the wrong length means an
   * even split, which is what the ramp did before weights existed.
   *
   * This is *not* a per-stop opacity. It widens or narrows the slice of the
   * luminance range that maps to that colour, which is what "more of this
   * colour" actually means for a tone ramp. See the warp in rasterEngine.
   */
  toneStopWeights?: number[];
  curvePoints?: Array<[number, number]>; // editable [x, y] control points in [0..1]
  highlights: number; // -100 to 100, default 0 (middle)
  midtones: number; // -100 to 100, default 0 (middle)
  shadows: number; // -100 to 100, default 0 (middle)
  alphaThreshold: number; // 0 to 255

  /**
   * Quantization depth fed to the dither pass. 0 = auto, which means the
   * charset length in ASCII modes, the palette size when one is active, and
   * full 8-bit for continuous pixel output. Dithering only has a visible
   * effect when the depth is genuinely reduced, so this is the control that
   * makes the algorithm choice matter.
   */
  colorLevels?: number; // 0 (auto) or 2..256
}

export const DEFAULT_IMAGE_ADJUST_CONFIG: ImageAdjustConfig = {
  invert: false,
  edgeDetection: false,
  edgeThreshold: 18,
  edgeStrength: 100,
  sharpenStrength: 0,
  sharpenRadius: 1,
  noise: 0,
  denoise: 0,
  blur: 0,
  brightness: 0,
  contrast: 0,
  /*
   * Monochrome by default.
   *
   * Duotone is the more striking look and was the default for exactly that
   * reason, but it breaks the first thing a new user sees: it paints every
   * cell below the luminance threshold in shadowColor, and against the dark
   * viewfinder that renders half the glyphs invisible. Mono keeps colours out
   * of the raster entirely, so ASCII takes the single-tint text path and every
   * glyph reads. The duotone stops below stay set, ready for the moment
   * someone chooses that look deliberately.
   */
  tonalMapping: 'ntone',
  highlightColor: '#00ff66',
  midtoneColor: '#00a848',
  shadowColor: '#0a0a0a',
  customToneColors: ['#0a0a0a', '#00a848', '#00ff66'],
  highlights: 0,
  midtones: 0,
  shadows: 0,
  alphaThreshold: 10,
  colorLevels: 0,
};

export interface MediaViewConfig extends ImageAdjustConfig {
  // Render / sampling settings specific to 2D media sources
  resampling: ResamplingMode;
  algorithm: DitherAlgorithm;
  ditherParams?: DitherParams;
  rasterMode?: RasterOutputMode;
  vectorConfig?: VectorConfig;
  dpi?: number; // 10 to 300, default 72
  /*
   * Levels lives in toneConfig above, as levelsBlack / levelsMidtones /
   * levelsWhite. A near-identically named levelBlack / levelMidtones /
   * levelWhite triple used to sit here too; nothing ever read it, and having
   * two of them one letter apart is how the media adjustConfig shadowing bug
   * happened (pipeline.md §1.2). Removed rather than wired up.
   */
  toneConfig?: ToneMappingConfig;
  background: BackgroundMode;
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
  aspectRatio?: number; // Monospace cell aspect ratio compensation, default 0.50
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
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
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
}

