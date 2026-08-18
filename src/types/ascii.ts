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
  glow: boolean;
  vignette: boolean;
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

export interface OptimizeConfig {
  targetFps: number; // 0 for uncapped, or 15, 20, 24, 30, 45, 60
  pauseWhenHidden: boolean; // Pause when tab is inactive
  idleThrottle: boolean; // Throttle framerate when mouse is idle
}
