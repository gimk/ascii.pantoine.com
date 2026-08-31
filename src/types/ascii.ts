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

/**
 * A rectangle of the source, in normalized source coordinates.
 *
 * Normalized rather than pixels so the same crop survives the source being
 * swapped for a different resolution of the same picture, and so a share link
 * carries a crop that means the same thing on the recipient's copy.
 *
 * This is the `drawImage` **source rect**, applied inside `drawFramedMedia`,
 * which is what makes it a crop rather than a zoom: the grid is spent entirely
 * on what the rectangle keeps, so cropping in *gains* cell detail instead of
 * discarding cells already rasterized. Fit, scale, pan and rotation then treat
 * the rectangle exactly as they treat a whole image — a crop whose aspect the
 * grid does not share letterboxes under CONTAIN and overflows under COVER,
 * same as any source. No new grid maths, so invariant 7 is untouched.
 */
export interface CropRect {
  /** Left edge, 0..1 of source width. */
  x: number;
  /** Top edge, 0..1 of source height. */
  y: number;
  /** Width, 0..1 of source width. */
  w: number;
  /** Height, 0..1 of source height. */
  h: number;
}

/** The whole frame — what an absent crop resolves to. */
export const CROP_FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/** Smallest crop the marquee will let you drag, as a fraction of the source. */
export const CROP_MIN_SPAN = 0.02;
// --- v1.6 Raster Modalities & Advanced Engine Types ---
/**
 * What a processed frame is made of.
 *
 * `ascii` and `pixel` are both *cell* modes: one glyph or one block per grid
 * cell, tone quantized to the grid. The other two are not, and both leave the
 * raster pipeline at step 3.5:
 *
 *  - `vector` returns polylines in continuous grid space. See
 *    vector-pipeline.md for why the deflection look cannot be a dither
 *    algorithm.
 *  - `print` returns a *device raster* — a halftone screened at S sub-pixels
 *    per grid cell, with one overprinting plate per ink. The grid becomes the
 *    contone resolution and the dots live below it. See print-pipeline.md for
 *    why a press separation cannot be a dither algorithm either: dither picks
 *    one colour per cell, and a press overprints every ink at once.
 */
export type RasterOutputMode =
  | 'ascii'
  | 'pixel'
  | 'vector'
  | 'print';

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
  /*
   * No glow field. The phosphor halo used to live here as a canvas
   * `shadowBlur` applied per stroke, which meant the browser rasterized a
   * blurred copy of every polyline — hundreds of them on a carrier-broken
   * beam. It is now one post-processing stage that blurs the finished
   * emissive layer once, shared with the cell modes. See engine/postProcess.
   */
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
  /**
   * @deprecated Moved to `PostProcessConfig.glow`, which blurs the finished
   * frame once instead of shadowing every stroke, and reaches ASCII and pixel
   * too. Still read on load so existing links and presets keep their halo —
   * `migratePostProcess` folds it forward — but never written again.
   */
  glow?: number;
  /**
   * Chromatic aberration offset in grid cells; 0 disables the extra passes.
   *
   * Stays here rather than moving to post-processing with the glow, because it
   * is *geometry*: three real traced passes that recombine additively and
   * export as SVG polylines. `PostProcessConfig.aberration` shifts the
   * rasterized frame instead, which is the only thing available in the cell
   * modes but strictly worse here.
   */
  chroma: number;
}

/**
 * The opening state of vector mode: a shallow horizontal relief.
 *
 * Not the studio's opening frame any more. That was a vertical carrier-broken
 * scan, which asks a new user to understand two things at once — what a beam
 * deflection is, and what a carrier does to it — before the first paint means
 * anything. What is here instead is the mode's plainest legible output:
 * horizontal beams, occluded so the ridges stack, and nothing modulating them.
 *
 * The carrier starts **off**, which is the one departure worth calling out. A
 * dashed beam is a strong look to open on and the hardest default to reverse
 * without knowing the vocabulary; off, the dot-break is one toggle away. It
 * also lets the BASIC panel hide the carrier deck without writing to the
 * config, which is the invariant every other reduction there holds
 * (pipeline.md §4).
 *
 * Deflection opens small for the same reason. A large amplitude is most of a
 * relief already built, so the first paint reads as a finished statement
 * rather than as a control someone is meant to drive. A shallow scan shows the
 * beam doing its work and leaves the whole range above it to reach for.
 */
export const VECTOR_CONFIG_DEFAULTS: VectorConfig = {
  direction: 'horizontal',
  lineCount: 50,
  sampleStep: 1,
  smoothing: 5,
  amplitude: 15,
  bias: 0.5,
  blanking: 0,
  occlusion: true,
  carrierEnabled: false,
  carrierFreq: 0.45,
  carrierThreshold: 0.32,
  pwm: 1.2,
  rippleAmp: 0,
  rippleFreq: 2,
  phase: 0,
  strokeWidth: 1,
  chroma: 0,
};

// --- Print: halftone and risograph separation (print-pipeline.md) ---

/**
 * Inks a single frame can carry.
 *
 * Eight because `PrintFrame.plateMask` gives each ink one bit of one byte per
 * device pixel, which is what keeps a 30-megapixel proof inside 30 MB instead
 * of four times that. It is also past any real press: four-colour process plus
 * two spots is six, and a riso studio swapping eight drums through one sheet is
 * a day's work.
 */
export const MAX_INKS = 8;

/**
 * A press, as a set of defaults rather than as a branch in the engine.
 *
 * Every profile drives the same machinery — separation, screening, overprint.
 * They differ only in ruling, screen family, ink solidity and which angles the
 * stack is spaced on. Keeping them as data is what stopped HALFTONE and RISO
 * from becoming two render types with two copies of the same pipeline.
 */
export type PressProfile = 'offset' | 'newsprint' | 'screenprint' | 'riso';

/**
 * How a plate turns continuous coverage into ink or no ink.
 *
 *  - `am` amplitude modulation: fixed lattice pitch, the dot grows. Offset,
 *    newsprint, screenprint, and the riso driver's own default.
 *  - `fm` frequency modulation: fixed dot size, the *count* varies. Runs the
 *    coverage plane through the existing dither registry, which is what a riso
 *    thermal master often does.
 *  - `solid` no screen at all — ink wherever coverage passes half. Line art
 *    and spot blocks.
 */
export type ScreenFamily = 'am' | 'fm' | 'solid';

/**
 * Spot function, i.e. the order ink fills a screen cell.
 *
 * `round` is the Euclidean dot a real offset screen lays down: a round dot in
 * the highlights, a checkerboard at 50%, an inverse round hole in the shadows.
 * The others are the classic alternatives a printer would ask for by name.
 */
export type DotShape = 'round' | 'ellipse' | 'square' | 'diamond' | 'line' | 'cross';

/**
 * One printing pass.
 *
 * Deliberately flat and deliberately not an extension of `DitherParams` — same
 * argument as `VectorConfig`. A plate carries screen geometry, press error and
 * ink physics, three things a dither mask has no notion of, and there are up to
 * eight of them at once.
 */
export interface InkPlate {
  /**
   * Stable across reorder, because array order *is* print order and the UI
   * lets it be dragged. Keying rows or `soloInk` by index instead would make a
   * reorder silently retarget them.
   */
  id: string;
  name: string;
  /** The ink at 100% coverage on white paper. */
  hex: string;
  /**
   * Film solidity, 0..1: how much of its own density the ink reaches at full
   * coverage. Riso soy ink is thin, around 0.8; process ink is near opaque at
   * 0.95. This is the term that makes overprints mix rather than just darken.
   */
  opacity: number;
  /**
   * Composite src-over in print order instead of multiplying.
   *
   * Off for every translucent ink, which is nearly all of them — and off is
   * what makes the overprint order-independent. On for a genuinely opaque ink
   * (white or metallic on dark stock), where laying it down second is the
   * whole point and print order starts to matter.
   */
  opaque: boolean;
  enabled: boolean;

  // --- screen geometry ---
  screen: ScreenFamily;
  /**
   * Screen ruling as **halftone cells across the image width**, not LPI.
   *
   * Resolution-free on purpose, and it is load-bearing three times over: the
   * dot keeps its size when the contone grid changes, when a crop re-solves
   * the grid, and — the important one — across the DRAFT / WORKING / PROOF
   * render tiers, which differ only in device pixels per cell. Store LPI here
   * instead and every one of those silently resizes the dots.
   *
   * The UI shows the derived LPI beside it, because a printer thinks in LPI.
   */
  ruling: number;
  /** Screen rotation in degrees. 30° apart across the stack gives a rosette. */
  angle: number;
  /**
   * Dot-lattice phase, in screen cells. Fractional and wrapping.
   *
   * Distinct from `regX`/`regY`: this slides the dots *within* a stationary
   * plate, which is what turns a dot-centred rosette into a clear-centred one.
   * Registration slides the whole plate, dots and image together.
   */
  shiftX: number;
  shiftY: number;
  dotShape: DotShape;
  /** Ellipse elongation, or line duty. 1 is round/square. */
  dotAspect: number;
  /**
   * Which of the existing 44 algorithms screens this plate when `screen` is
   * `fm`. The whole registry and its parameter machinery apply per plate, so
   * FM screening cost no new dithering code.
   */
  fmAlgorithm: DitherAlgorithm;
  /**
   * Grain scale for FM screening: 1 = fine (1px device tap), 2 = medium (Riso stencil ~300 DPI),
   * 3 = coarse grain, 4 = chunky newsprint grain.
   */
  fmScale?: number;

  // --- press error and ink physics ---
  /**
   * Registration error in **contone cells**, so it is grid-relative and
   * survives a resolution change the way `ruling` does.
   */
  regX: number;
  regY: number;
  /** Plate rotation drift in degrees. Adds to the effective screen angle. */
  regAngle: number;
  /**
   * Tone value increase at 50% coverage, in coverage units.
   *
   * Applied as `a + gain·sin(pi·a)`, which peaks at midtone and vanishes at
   * both ends — so paper stays paper and a solid stays solid, which is what
   * physical dot growth actually does.
   */
  dotGain: number;
  /** Coverage transfer endpoints — this plate's ink limits. */
  minCoverage: number;
  maxCoverage: number;
}

export interface PrintConfig {
  press: PressProfile;
  inks: InkPlate[];
  /**
   * Substrate colour, and a real term in the separation rather than a
   * background fill. Translucent ink over cream paper is a different colour
   * than the same ink over white, so the solve starts from here.
   */
  paper: string;
  /** Total area coverage cap, summed across inks, in percent. 0 = unlimited. */
  tacLimit: number;
  /**
   * Ink purity / crosstalk suppression (0.0 to 1.0, default 0.5):
   * Suppresses secondary ink bleed and faint crosstalk in areas where a primary ink dominates,
   * keeping flat colors and solid fields completely clean on their own plate.
   */
  inkPurity?: number;
  /**
   * Grain interlock (joint screening):
   * When enabled (default true), stochastic FM dots on adjacent plates interlock into each other's
   * negative space in gradient blends, eliminating accidental white paper voids between overlapping colors.
   */
  grainInterlock?: boolean;
  /**
   * Yule-Nielsen n: optical dot gain from light scattering sideways inside the
   * paper, applied when the device raster is box-filtered down. 1 is off, ~1.7
   * is coated stock, 2-3 uncoated.
   */
  yuleNielsen: number;
  /**
   * Device pixels per contone cell for everything the viewport draws itself.
   *
   * Still clamped down by a budget on a very large grid, so an enormous contone
   * grid degrades rather than stalling — but otherwise this is the number, and
   * it is the one the user drags. Kept low enough that zooming stays
   * responsive, because zooming re-resolves the composite at the new size.
   */
  supersample: number;
  /**
   * Device pixels per contone cell for RENDER PROOF and for every export.
   *
   * Separate from `supersample` because the two answer different questions —
   * "how fast should the viewport be" against "how good should the file be" —
   * and tying them together left the proof barely distinguishable from the live
   * view, which is exactly how it was reported.
   */
  proofSupersample: number;
  /** `InkPlate.id` to render alone on paper, or null for the full composite. */
  soloInk: string | null;
}

/**
 * A screened device raster: what a press would actually put on the sheet.
 *
 * The composite is **not** stored. `plateMask` plus the ink table is enough to
 * derive it, and `resolvePrintFrame` does so on demand — one buffer instead of
 * two, and the only place a composite exists, so the viewport and every export
 * cannot disagree about what the paper looks like.
 */
export interface PrintFrame {
  /** Device raster size: `cols * supersample` by `rows * supersample`. */
  width: number;
  height: number;
  supersample: number;
  /**
   * One byte per device pixel; bit `i` set means ink `i` of `inks` was
   * deposited there. Plates overlap freely — that is the whole difference from
   * a colour separation (pipeline.md invariant 9).
   */
  plateMask: Uint8Array;
  /** The enabled inks, in print order. `plateMask` bits index this array. */
  inks: InkPlate[];
  paperHex: string;
  /** Inked fraction per ink, parallel to `inks`. Drives the UI readout. */
  coverage: number[];
  /** Which tier produced this frame, for the viewport badge. */
  tier: PrintTier;
}

/**
 * Render quality tiers. Two, deliberately.
 *
 * `live` is everything the viewport shows on its own — during a drag and after
 * it settles alike. `proof` is the explicit, slower render behind a button, and
 * what every export produces.
 *
 * This started as three, with a separate coarser supersample while dragging,
 * and that was wrong twice over: the draft was too crude to read (at the budget
 * it often solved to one device pixel per cell, where a dot degenerates to a
 * threshold and the screen effectively vanishes), while the settled tier was
 * high enough to make zooming lag. The reduction the draft needs is already
 * supplied by the *contone divisor* the static-render path applies — a smaller
 * grid at the same supersample is a cheaper frame whose dots keep their shape.
 * So the supersample stays put and only the grid moves, which is both faster
 * and far more legible.
 *
 * The reason a tier switch is not disorienting is unchanged: `ruling` is
 * resolution-free, so it moves no dot.
 */
export type PrintTier = 'live' | 'proof';

// --- Post-processing (the composite stage, after the raster) ---

/**
 * Separable and non-separable blend modes, named identically in CSS
 * `mix-blend-mode` and canvas `globalCompositeOperation`.
 *
 * That overlap is the reason the list is exactly this: the viewport blends in
 * CSS (it has to — the monochrome ASCII path is a `<pre>`, not a canvas) and
 * every export blends on canvas, so one enum with no translation table is what
 * keeps the screen and the file agreeing.
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Bring the source back in over its own rasterization.
 *
 * The layer is the *ungraded* frame the pipeline was handed, drawn through the
 * identical framing maths, so it registers with the raster cell for cell at
 * any zoom without a single alignment parameter.
 */
export interface SourceOverlayConfig {
  enabled: boolean;
  /**
   * Which layer carries the blend.
   *
   * Not a mere z-order swap: blending is non-commutative for most of these
   * modes. `over` computes blend(raster, source), `under` computes
   * blend(source, raster) — genuinely different pictures, which is the whole
   * reason both exist.
   */
  placement: 'under' | 'over';
  blend: BlendMode;
  /** 0..100. */
  opacity: number;
  /** Gaussian blur in pixels. 0 is off. */
  blur?: number;
  /**
   * Supersample of the raster's *display* box, not of the grid.
   *
   * An ASCII cell is 6.015 x 10 px, so a cols x rows layer would be six times
   * too soft behind the glyphs it is meant to sit under. 1 means one source
   * pixel per display pixel.
   */
  quality: 1 | 2 | 4;
  /**
   * `original` is the raw framed source. `graded` is the luminance field as it
   * leaves tone mapping — the same picture the dither quantized, before it was
   * quantized. Blend tone with `graded`, blend the photograph with `original`.
   */
  source: 'original' | 'graded';
}

/**
 * Phosphor bloom over the finished frame.
 *
 * One implementation for all three output modes. Vector used to strike its own
 * halo with a canvas `shadowBlur` held across every stroke, which made the
 * browser rasterize a blurred copy per polyline; ASCII had a second, unrelated
 * bloom in CSS. This blurs the emissive layer once and adds it back.
 */
export interface GlowConfig {
  /** 0..200 — how much of the blurred layer is added back. 0 is off. */
  amount: number;
  /** Gaussian sigma in output pixels, scaled by zoom and export scale. */
  radius: number;
  /** Empty means the resolved phosphor / accent tint. */
  tint: string;
}

/**
 * RGB channel split of the finished frame.
 *
 * The cell modes have no geometry to split, so this is the only aberration
 * available to them. Vector keeps `VectorConfig.chroma` as well, which offsets
 * the *trace* and therefore survives into SVG as real polylines.
 */
export interface AberrationConfig {
  /** Channel offset in output pixels at 1x. 0 is off. */
  amount: number;
  /** Split direction in degrees. */
  angle: number;
}

/**
 * Everything that happens to a frame after the raster pipeline is done with
 * it, in the order it is applied.
 *
 * A container rather than three fields on `RenderSettings`, so the next effect
 * is one key here instead of another entry to add to the persisted blob, the
 * share payload and every preset type — each of which is a separate chance to
 * declare a field and forget to write it (pipeline.md invariant 4).
 */
export interface PostProcessConfig {
  sourceOverlay: SourceOverlayConfig;
  glow: GlowConfig;
  aberration: AberrationConfig;
}

export const SOURCE_OVERLAY_DEFAULTS: SourceOverlayConfig = {
  enabled: false,
  placement: 'under',
  blend: 'normal',
  opacity: 100,
  blur: 0,
  quality: 2,
  source: 'original',
};

export const POST_PROCESS_DEFAULTS: PostProcessConfig = {
  sourceOverlay: SOURCE_OVERLAY_DEFAULTS,
  glow: { amount: 0, radius: 6, tint: '' },
  aberration: { amount: 0, angle: 0 },
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
  /**
   * Source rect, or absent for the whole frame.
   *
   * Optional rather than defaulted so every share link, preset and persisted
   * blob written before crop existed keeps rendering identically: absent and
   * `CROP_FULL` are the same picture.
   */
  crop?: CropRect;
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
  printConfig?: PrintConfig;
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
  printConfig?: PrintConfig;
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
  printConfig?: PrintConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
  /**
   * The composite stage. Deliberately here and *only* here, including for
   * media — it is not grading, so invariant 8's "media grading lives in
   * mediaViewConfig" does not pull it into a second home.
   */
  postProcess?: PostProcessConfig;
}

