/**
 * Inks, presses, and the colorimetric separation that turns a colour into
 * per-ink coverage.
 *
 * This is the half with no canvas in it. `printEngine.ts` does the screening
 * and the compositing on top; everything here is arithmetic and data, so the
 * one property that has to be exactly right — that a colour separated onto a
 * set of inks and then recomposited comes back as the same colour — can be
 * checked without a browser.
 *
 * The model is Beer-Lambert: translucent ink films multiply transmittance, so
 * layering them *adds* optical density. That single fact is what makes an exact
 * separation cheap, and it is derived in `buildSeparationLut` below.
 */

import {
  InkPlate,
  PrintConfig,
  PressProfile,
  MAX_INKS,
} from '../types/ascii';
import { Lab, rgbToLab, deltaE } from './palettes';

// ---------------------------------------------------------------------------
// sRGB transfer
// ---------------------------------------------------------------------------

/*
 * Real transfer curves, not `v / 255`.
 *
 * Ink density is a physical quantity and it multiplies in *linear* light. Doing
 * the separation on gamma-encoded values is the single largest source of the
 * muddy, plasticky look that digital "halftone" filters have — the overprints
 * come out far too dark and the midtones collapse. It is four lines of maths to
 * get right and everything downstream depends on it.
 */

const LINEARIZE_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEARIZE_LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Gamma-encoded byte to linear-light [0,1]. */
export function linearizeByte(v: number): number {
  return LINEARIZE_LUT[v < 0 ? 0 : v > 255 ? 255 : v | 0];
}

/** Linear-light [0,1] to gamma-encoded byte, exactly. */
export function encodeSrgbExact(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/*
 * The encode is a table, because it is the hot path.
 *
 * `resolvePrintFrame` calls it three times per *output* pixel, and it runs on
 * every repaint at display size — so a 900x675 viewport is 1.8 million `pow`
 * calls per frame. Measured: that alone was ~55 ms of a ~60 ms resolve,
 * dominating the box filter it was supposed to be a rounding step for.
 *
 * 16384 entries rather than 4096 because the curve is steep near zero: at 4096
 * the bottom of the range quantizes to about a whole byte, which shows as
 * banding in exactly the deep shadows a print puts most of its ink in. At 16384
 * the worst-case error is under a fifth of a byte, for 16 KB.
 */
const ENCODE_LUT_N = 16384;
const ENCODE_LUT = new Uint8Array(ENCODE_LUT_N + 1);
for (let i = 0; i <= ENCODE_LUT_N; i++) {
  ENCODE_LUT[i] = encodeSrgbExact(i / ENCODE_LUT_N);
}

/** Linear-light [0,1] to gamma-encoded byte, through the table. */
export function encodeSrgb(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 255;
  return ENCODE_LUT[(v * ENCODE_LUT_N + 0.5) | 0];
}

/** '#rgb' or '#rrggbb' to linear-light RGB. Falls back to white. */
export function linearizeHex(hex: string | undefined): [number, number, number] {
  const b = hexToBytes(hex);
  return [linearizeByte(b[0]), linearizeByte(b[1]), linearizeByte(b[2])];
}

/** RGB bytes to '#rrggbb'. */
export function bytesToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return '#' + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1);
}

export function hexToBytes(hex: string | undefined): [number, number, number] {
  if (!hex) return [255, 255, 255];
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [255, 255, 255];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// The ink library
// ---------------------------------------------------------------------------

export interface InkSpec {
  name: string;
  hex: string;
  /** Film solidity. Riso soy ink is thin; process ink is nearly opaque. */
  opacity: number;
  group: 'riso' | 'riso-fluo' | 'process' | 'spot';
}

/**
 * Real Risograph drum colours, plus process inks.
 *
 * Hex values are the published drum library, not invented approximations —
 * that matters because the separation reads them as density vectors, so a
 * wrong hex is a wrong separation, not just a wrong swatch. Several of these
 * (fluorescent pink, sun yellow, fluorescent green) sit outside CMYK gamut
 * entirely, which is the reason riso is worth simulating and the reason the
 * separation cannot assume a CMY basis.
 */
export const INK_LIBRARY: InkSpec[] = [
  // Standard riso drums
  { name: 'Black', hex: '#000000', opacity: 0.92, group: 'riso' },
  { name: 'Red', hex: '#ff665e', opacity: 0.8, group: 'riso' },
  { name: 'Blue', hex: '#3d5588', opacity: 0.8, group: 'riso' },
  { name: 'Green', hex: '#3d6730', opacity: 0.8, group: 'riso' },
  { name: 'Yellow', hex: '#ffb511', opacity: 0.8, group: 'riso' },
  { name: 'Purple', hex: '#3f2b6c', opacity: 0.8, group: 'riso' },
  { name: 'Violet', hex: '#5e2d90', opacity: 0.8, group: 'riso' },
  { name: 'Medium Blue', hex: '#6f8dce', opacity: 0.8, group: 'riso' },
  { name: 'Federal Blue', hex: '#0078bf', opacity: 0.8, group: 'riso' },
  { name: 'Burgundy', hex: '#765b6a', opacity: 0.8, group: 'riso' },
  { name: 'Teal', hex: '#3d8e84', opacity: 0.8, group: 'riso' },
  { name: 'Hunter Green', hex: '#407060', opacity: 0.8, group: 'riso' },
  { name: 'Sun Yellow', hex: '#ffe800', opacity: 0.78, group: 'riso' },
  { name: 'Brown', hex: '#a89f94', opacity: 0.8, group: 'riso' },

  // Fluorescents — the reason a spot separation beats a CMYK one
  { name: 'Fluorescent Pink', hex: '#ff48b0', opacity: 0.78, group: 'riso-fluo' },
  { name: 'Fluorescent Red', hex: '#ff7477', opacity: 0.78, group: 'riso-fluo' },
  { name: 'Fluorescent Orange', hex: '#ff6e40', opacity: 0.78, group: 'riso-fluo' },
  { name: 'Fluorescent Green', hex: '#a4dc30', opacity: 0.78, group: 'riso-fluo' },

  // Process
  { name: 'Process Cyan', hex: '#009ee0', opacity: 0.95, group: 'process' },
  { name: 'Process Magenta', hex: '#e5007d', opacity: 0.95, group: 'process' },
  { name: 'Process Yellow', hex: '#fff100', opacity: 0.95, group: 'process' },
  { name: 'Process Black', hex: '#1a1a1a', opacity: 0.97, group: 'process' },
];

export function findInkSpec(hex: string): InkSpec | undefined {
  const h = hex.toLowerCase();
  return INK_LIBRARY.find((s) => s.hex.toLowerCase() === h);
}

/** Common substrates. Paper is a term in the separation, so it gets real values. */
export const PAPER_STOCKS: { name: string; hex: string }[] = [
  { name: 'Bright White', hex: '#ffffff' },
  { name: 'Natural', hex: '#f4f0e6' },
  { name: 'Cream', hex: '#f2e8d5' },
  { name: 'Newsprint', hex: '#e8e2d0' },
  { name: 'Kraft', hex: '#c9a882' },
  { name: 'Grey Board', hex: '#a8a5a0' },
];

// ---------------------------------------------------------------------------
// Presses
// ---------------------------------------------------------------------------

export interface PressSpec {
  name: string;
  description: string;
  /** Screen ruling as halftone cells across the image width. */
  ruling: number;
  screen: InkPlate['screen'];
  dotShape: InkPlate['dotShape'];
  dotGain: number;
  /** Registration error the press is prone to, in contone cells. */
  registration: number;
  yuleNielsen: number;
  paper: string;
  tacLimit: number;
  /**
   * Screen angles to spread across the stack, in order.
   *
   * 30 degrees apart is not a style choice: a square lattice repeats every 90
   * degrees, so three screens can be at most 90/3 apart, and that maximum is
   * exactly what turns the unavoidable interference into a stable rosette
   * instead of visible moire. The fourth entry is the orphan — yellow's 15
   * degree separation is the most visible beat on a real sheet and is simply
   * the accepted compromise, because there is nowhere else to put it.
   */
  angles: number[];
}

export const PRESS_PROFILES: Record<PressProfile, PressSpec> = {
  offset: {
    name: 'OFFSET',
    description: 'Fine four-colour process, coated stock, tight registration',
    ruling: 150,
    screen: 'am',
    dotShape: 'round',
    dotGain: 0.08,
    registration: 0.15,
    yuleNielsen: 1.7,
    paper: '#ffffff',
    tacLimit: 320,
    angles: [45, 75, 0, 15],
  },
  newsprint: {
    name: 'NEWSPRINT',
    description: 'Coarse screen, heavy dot gain, absorbent uncoated stock',
    ruling: 60,
    screen: 'am',
    dotShape: 'round',
    dotGain: 0.22,
    registration: 1.2,
    yuleNielsen: 2.6,
    paper: '#e8e2d0',
    tacLimit: 240,
    angles: [45, 75, 0, 15],
  },
  screenprint: {
    name: 'SCREENPRINT',
    description: 'Coarse mesh, thick opaque ink, hand registration',
    ruling: 42,
    screen: 'am',
    dotShape: 'round',
    dotGain: 0.18,
    registration: 2.0,
    yuleNielsen: 1.4,
    paper: '#f4f0e6',
    tacLimit: 400,
    angles: [45, 15, 75, 0],
  },
  riso: {
    /*
     * 71 is the riso driver's own default ruling, and the ceiling is real: much
     * above 120 the thermal master cannot hold the dot and the print fills in.
     * Registration is loose because the sheet is physically re-gripped for
     * every colour pass — misregistration is the look, not a defect.
     */
    name: 'RISO',
    description: 'Soy ink through a thermal stencil (Grain Touch FM), one pass per drum',
    ruling: 71,
    screen: 'fm',
    dotShape: 'round',
    dotGain: 0.14,
    registration: 1.5,
    yuleNielsen: 2.2,
    paper: '#f4f0e6',
    tacLimit: 260,
    angles: [45, 75, 15, 0],
  },
};

let inkIdCounter = 0;

/** A plate from an ink spec, taking screen and press settings from a profile. */
export function makeInkPlate(
  spec: Pick<InkSpec, 'name' | 'hex'> & { opacity?: number },
  press: PressProfile,
  angle: number
): InkPlate {
  const p = PRESS_PROFILES[press];
  return {
    id: `ink-${++inkIdCounter}-${Date.now().toString(36)}`,
    name: spec.name,
    hex: spec.hex,
    opacity: spec.opacity ?? findInkSpec(spec.hex)?.opacity ?? 0.85,
    opaque: false,
    enabled: true,
    screen: p.screen,
    ruling: p.ruling,
    angle,
    shiftX: 0,
    shiftY: 0,
    dotShape: p.dotShape,
    dotAspect: 1,
    fmAlgorithm: 'blue-noise',
    fmScale: 2,

    regX: 0,
    regY: 0,
    regAngle: 0,
    dotGain: p.dotGain,
    minCoverage: 0,
    maxCoverage: 1,
  };
}

/**
 * Rewrites screen angles across a stack to the profile's convention.
 *
 * A batch action rather than derived state, deliberately: the convention is
 * what a printer would set up, and then breaking it on one plate is a real
 * thing to want. Derived angles would silently undo that.
 *
 * Yellow-ish inks are parked on the orphan angle, which is where they go on a
 * real press — a light ink's moire is the least visible, so it takes the worst
 * slot.
 */
function assignAngles(inks: InkPlate[], angles: number[]): InkPlate[] {
  const enabled = inks.filter((k) => k.enabled);

  // Luminance decides the order: darkest ink takes 45, the most stable angle.
  const ranked = [...enabled].sort((a, b) => inkLuma(a.hex) - inkLuma(b.hex));
  const orphan = angles[angles.length - 1];
  const assignment = new Map<string, number>();

  let slot = 0;
  for (const ink of ranked) {
    // A light, yellow-leaning ink goes to the orphan angle regardless of rank.
    if (isYellowish(ink.hex) && !assignment.has(ink.id)) {
      assignment.set(ink.id, orphan);
      continue;
    }
    assignment.set(ink.id, angles[Math.min(slot, angles.length - 1)]);
    slot++;
  }

  return inks.map((k) =>
    assignment.has(k.id) ? { ...k, angle: assignment.get(k.id)! } : k
  );
}

export function applyPressAngles(inks: InkPlate[], press: PressProfile): InkPlate[] {
  return assignAngles(inks, PRESS_PROFILES[press].angles);
}

/**
 * Angles for more plates than the press convention has names for.
 *
 * A press profile lists four, because four-colour process is what presses do
 * and 45/75/15/0 is the convention that makes a rosette. Beyond four there is
 * no convention to follow, so the angles are derived instead: a symmetric
 * halftone lattice repeats every 90°, so N screens are furthest apart at 90/N,
 * and eight plates land 11.25° apart — tight, but still clear of
 * `MOIRE_ANGLE_TOLERANCE`, which is the most that can be said for eight AM
 * screens on one sheet.
 *
 * Starts at 45 so the darkest ink still gets the stable angle, matching what
 * the four-colour path does.
 */
function spreadAngles(n: number): number[] {
  const step = 90 / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(((45 + i * step) % 90) * 100) / 100);
  }
  return out;
}

/**
 * Re-angle the stack to clear moiré, for the AUTO ROTATE action on the warning.
 *
 * Prefers the press convention whenever it has enough angles to go round,
 * because those are the real ones; falls back to an even spread only when the
 * stack is deeper than four. Without that fallback the convention assigns its
 * last angle to every plate past the fourth, which is a moiré *guarantee* — and
 * an eight-ink stack is exactly what ink extraction can now hand you.
 */
export function resolveMoireAngles(inks: InkPlate[], press: PressProfile): InkPlate[] {
  const pressAngles = PRESS_PROFILES[press].angles;
  const enabled = inks.filter((k) => k.enabled).length;
  return assignAngles(inks, enabled <= pressAngles.length ? pressAngles : spreadAngles(enabled));
}

function inkLuma(hex: string): number {
  const [r, g, b] = hexToBytes(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Puts a stack into press order: darkest ink down first, lightest last.
 *
 * This is the KCMY rule generalised to a spot stack. On press the first ink
 * down wants the highest tack and the largest area of dry paper to trap to,
 * which is the darkest, heaviest ink; a transparent light ink laid last adds
 * depth almost like a varnish. ISO 12647-2 says the same thing for process
 * work — CMY in sequence, black first or last.
 *
 * It is not cosmetic. `solveCoverage` is cyclic coordinate descent over the ink
 * columns in array order, and the box-constrained system is underdetermined
 * once there are more than three inks, so the *first* ink gets first claim on
 * the density it can carry. Darkest first is therefore what makes the solve
 * reach for one dark ink on a neutral instead of stacking three chromatic ones
 * — grey component replacement out of the ordering rather than a separate
 * stage. Reordering by hand and watching the shadows clean up is the same
 * effect, arrived at manually.
 *
 * Luma is the proxy for "darkest", which is right for spot inks and only
 * approximate for process ones: it would order a CMY set M before C. The
 * process stack does not come through here — it is declared explicitly in
 * press order in `fastCmykEngine`, where the C-M-Y trap sequence is a rule
 * rather than a consequence of sorting.
 *
 * Angles are not touched: `applyPressAngles` and friends assign by position, so
 * call this **before** them.
 */
export function orderInksForPress(inks: InkPlate[]): InkPlate[] {
  return [...inks].sort((a, b) => inkLuma(a.hex) - inkLuma(b.hex));
}

function isYellowish(hex: string): boolean {
  const [r, g, b] = hexToBytes(hex);
  return r > 180 && g > 140 && b < 120;
}

/**
 * The opening state: a two-ink riso on natural stock.
 *
 * Not four-colour offset, for the same reason vector mode opens with the
 * carrier off. A rosette asks a new user to understand screen angles, moire
 * and overprint all at once before the first paint means anything; two inks on
 * cream paper shows the machine doing its one legible thing — separate, screen,
 * overprint — and four-colour is two clicks away.
 *
 * Fluorescent pink and federal blue because it is the canonical riso pairing,
 * and because both are outside CMYK gamut, which makes the point of a spot
 * separation on the very first frame.
 */
export function defaultPrintConfig(): PrintConfig {
  const press: PressProfile = 'riso';
  const p = PRESS_PROFILES[press];
  return {
    engineMode: 'simulation',
    cmykRuling: 50,
    cmykDotScale: 1.0,
    cmykAngles: { c: 15, m: 75, y: 0, k: 45 },
    press,
    /*
     * Press order: the darker blue lays down first, the lighter pink last. See
     * `orderInksForPress` — the sequence is what the separation solve reads,
     * not just what a printer would set up on the press.
     */
    inks: [
      makeInkPlate({ name: 'Federal Blue', hex: '#0078bf' }, press, 75),
      makeInkPlate({ name: 'Fluorescent Pink', hex: '#ff48b0' }, press, 45),
    ],
    paper: p.paper,
    tacLimit: p.tacLimit,
    inkPurity: 0.5,
    grainInterlock: true,
    yuleNielsen: p.yuleNielsen,
    /*
     * The viewport at 4, the proof at 8 — and the gap between them is the
     * point. Held equal, pressing RENDER PROOF changed almost nothing on screen,
     * which is exactly how the first version was reported.
     */
    supersample: 4,
    proofSupersample: 8,
    soloInk: null,
  };
}

/** Frozen defaults for share/preset merging. Call `defaultPrintConfig` for state. */
export const PRINT_CONFIG_DEFAULTS: PrintConfig = defaultPrintConfig();

/**
 * A stack from an existing palette, for `SEED INKS FROM PALETTE`.
 *
 * Palette colours are ordered dark to light by convention in this codebase,
 * and a palette carries its paper as its lightest entry and its key ink as its
 * darkest. So the lightest entry becomes the substrate rather than an ink —
 * printing a near-white ink on near-white paper would waste a whole pass on
 * nothing, which is exactly what a naive import does.
 */
export function inksFromPalette(
  colors: string[],
  press: PressProfile
): { inks: InkPlate[]; paper: string } {
  const sorted = [...colors].sort((a, b) => inkLuma(a) - inkLuma(b));
  let paper = PRESS_PROFILES[press].paper;
  let pool = sorted;

  const lightest = sorted[sorted.length - 1];
  if (lightest && inkLuma(lightest) > 200) {
    paper = lightest;
    pool = sorted.slice(0, -1);
  }

  const angles = PRESS_PROFILES[press].angles;
  /*
   * `sorted` is already darkest-first, which is press order — but the helper is
   * the one place that rule is stated, so go through it rather than depend on
   * a sort three statements up staying that way.
   */
  const inks = orderInksForPress(
    pool.slice(0, MAX_INKS).map((hex, i) =>
      makeInkPlate(
        { name: findInkSpec(hex)?.name || `Ink ${i + 1}`, hex },
        press,
        angles[Math.min(i, angles.length - 1)]
      )
    )
  );
  return { inks: applyPressAngles(inks, press), paper };
}

// ---------------------------------------------------------------------------
// The separation
// ---------------------------------------------------------------------------

/**
 * Why this is a linear least-squares problem, and therefore cheap.
 *
 * Translucent ink films multiply transmittance, so N inks at coverages a_i over
 * a substrate of reflectance P give
 *
 *     R = P * prod_i  T_i ^ (o_i * a_i)
 *
 * Take negative logs and the product becomes a sum:
 *
 *     -log R = -log P + sum_i  a_i * (o_i * D_i),      D_i = -log T_i
 *
 * which is **linear in the coverages**. So separating a colour is
 *
 *     minimise || A a - b ||^2  subject to  0 <= a_i <= 1
 *
 * with A the 3xN matrix of per-ink density vectors and b the target density
 * above paper. Three consequences worth naming, because they are why this beats
 * channel extraction:
 *
 *  - **Black generation is automatic.** With a black ink in the set, the solve
 *    reaches for it on neutrals because one ink fits a neutral density better
 *    than three chromatic ones — grey component replacement falls out of the
 *    arithmetic rather than being a separate stage.
 *  - **Out-of-gamut inks just work.** Fluorescent pink is another density
 *    vector. Nothing anywhere assumes a CMY basis.
 *  - **Paper is a term, not a backdrop.** Cream stock shifts b, so the same
 *    photograph separates differently onto the same inks on different paper —
 *    which is true of the real process and is invisible to every filter that
 *    treats paper as a background fill.
 */

export interface InkDensity {
  /** o_i * D_i, per channel: density added per unit coverage. */
  d: [number, number, number];
}

/** Transmittance floor: a pure-black ink must give finite, not infinite, density. */
const MIN_TRANSMITTANCE = 0.002;

export function inkDensity(ink: InkPlate): InkDensity {
  const [r, g, b] = linearizeHex(ink.hex);
  const o = Math.max(0, Math.min(1, ink.opacity));
  const dens = (t: number) => -Math.log(Math.max(MIN_TRANSMITTANCE, Math.min(1, t))) * o;
  return { d: [dens(r), dens(g), dens(b)] };
}

/**
 * Box-constrained least squares by exact cyclic coordinate descent.
 *
 * Each sweep minimises one coverage exactly, holding the rest, then clamps into
 * [0,1] — which for a convex quadratic is a projected coordinate step and
 * converges monotonically. `rows` is 3 (the channels) or 4 when a total-area
 * penalty row is appended.
 *
 * Not a general NNLS: N is at most 8 and the system is tiny, so the sixteen
 * sweeps below cost less than the branch bookkeeping Lawson-Hanson would need.
 */
function solveCoverage(
  A: Float64Array, // rows * n, row-major
  b: Float64Array, // rows
  n: number,
  rows: number,
  out: Float64Array,
  sweeps = 16
): void {
  const r = new Float64Array(rows);
  for (let k = 0; k < rows; k++) {
    let acc = -b[k];
    for (let i = 0; i < n; i++) acc += A[k * n + i] * out[i];
    r[k] = acc;
  }

  // Column norms are fixed, so hoist them out of the sweep loop.
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < rows; k++) {
      const v = A[k * n + i];
      s += v * v;
    }
    h[i] = s;
  }

  for (let s = 0; s < sweeps; s++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (h[i] < 1e-12) continue;
      let g = 0;
      for (let k = 0; k < rows; k++) g += A[k * n + i] * r[k];
      let next = out[i] - g / h[i];
      next = next < 0 ? 0 : next > 1 ? 1 : next;
      const delta = next - out[i];
      if (delta === 0) continue;
      out[i] = next;
      for (let k = 0; k < rows; k++) r[k] += A[k * n + i] * delta;
      moved += delta < 0 ? -delta : delta;
    }
    if (moved < 1e-5) break;
  }
}

export interface SeparationLut {
  /** Grid nodes per axis. */
  size: number;
  /** Number of inks the table separates onto. */
  inkCount: number;
  /** size^3 * inkCount coverages in [0,1]. */
  data: Float32Array;
  /** Cache identity — the inks, paper, TAC and grid size that produced it. */
  key: string;
}

/**
 * Separation table grid size.
 *
 * Indexed in *gamma-encoded* sRGB rather than linear, so the nodes are
 * spread roughly perceptually and the shadows — where a separation changes
 * fastest — get their share of them. A linear-spaced grid puts most of its
 * nodes in the highlights, where the answer barely moves.
 */
export const LUT_SIZE_FULL = 33;

function lutKey(inks: InkPlate[], paper: string, tac: number, size: number, purity: number): string {
  const ik = inks.map((k) => `${k.hex}:${k.opacity.toFixed(3)}`).join('|');
  return `${size}/${paper}/${tac}/${purity.toFixed(2)}/${ik}`;
}

let cachedLut: SeparationLut | null = null;

/**
 * Builds — or returns cached — the RGB to N-coverage table.
 *
 * Solving per pixel is the obvious implementation and the wrong one: a contone
 * grid is 100k cells and the solve is iterative. A 33-cube is 35,937 solves
 * once, then every cell is a trilinear interpolation. This is exactly how a RIP
 * carries a separation, and it is the same trick `createToneCurveLUT` and the
 * dither mask cache already use in this codebase.
 *
 * One table is cached, not a map: the ink stack changes as a unit and the user
 * is editing one stack at a time, so a second entry would only ever hold the
 * state they just left.
 */
export function buildSeparationLut(
  inks: InkPlate[],
  paper: string,
  tacLimit: number,
  size: number = LUT_SIZE_FULL,
  purity: number = 0.5
): SeparationLut {
  const key = lutKey(inks, paper, tacLimit, size, purity);
  if (cachedLut && cachedLut.key === key && cachedLut.inkCount === inks.length) {
    return cachedLut;
  }

  const n = inks.length;
  const data = new Float32Array(size * size * size * Math.max(1, n));

  if (n === 0) {
    cachedLut = { size, inkCount: 0, data, key };
    return cachedLut;
  }

  const dens = inks.map(inkDensity);
  const P = linearizeHex(paper);
  const logP = [
    Math.log(Math.max(MIN_TRANSMITTANCE, P[0])),
    Math.log(Math.max(MIN_TRANSMITTANCE, P[1])),
    Math.log(Math.max(MIN_TRANSMITTANCE, P[2])),
  ];

  // Plain 3-row system, and a 4-row variant carrying the total-area penalty.
  const A3 = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    A3[i] = dens[i].d[0];
    A3[n + i] = dens[i].d[1];
    A3[2 * n + i] = dens[i].d[2];
  }

  const tac = tacLimit > 0 ? tacLimit / 100 : 0;
  /*
   * TAC as a penalty row rather than a clip.
   *
   * Scaling an over-limit solution down proportionally desaturates it and
   * lifts every shadow at once. A penalty lets the solve *redistribute*
   * instead: it trades three chromatic inks for one black wherever that costs
   * less total area, which is grey component replacement arriving for the
   * second time out of the same arithmetic. lambda is tuned so the constraint
   * bites without dominating the colour fit.
   */
  const lambda = 0.6;
  const A4 = new Float64Array(4 * n);
  A4.set(A3);
  for (let i = 0; i < n; i++) A4[3 * n + i] = lambda;

  const b3 = new Float64Array(3);
  const b4 = new Float64Array(4);
  const a = new Float64Array(n);
  const step = 255 / (size - 1);

  for (let bi = 0; bi < size; bi++) {
    const lb = linearizeByte(bi * step);
    for (let gi = 0; gi < size; gi++) {
      const lg = linearizeByte(gi * step);
      for (let ri = 0; ri < size; ri++) {
        const lr = linearizeByte(ri * step);

        // Target density above the paper. Negative where the target is
        // lighter than the stock, and the box constraint answers that with
        // zero ink, which is correct: no ink makes paper brighter.
        b3[0] = logP[0] - Math.log(Math.max(MIN_TRANSMITTANCE, lr));
        b3[1] = logP[1] - Math.log(Math.max(MIN_TRANSMITTANCE, lg));
        b3[2] = logP[2] - Math.log(Math.max(MIN_TRANSMITTANCE, lb));

        a.fill(0);
        solveCoverage(A3, b3, n, 3, a);

        if (tac > 0) {
          let sum = 0;
          for (let i = 0; i < n; i++) sum += a[i];
          if (sum > tac) {
            b4[0] = b3[0];
            b4[1] = b3[1];
            b4[2] = b3[2];
            b4[3] = lambda * tac;
            a.fill(0);
            solveCoverage(A4, b4, n, 4, a);
          }
        }

        // Parametric ink purity:
        // Suppresses secondary ink crosstalk when one ink dominates a color,
        // while preserving intentional multi-ink gradient blends where two inks have comparable strength.
        if (purity > 0) {
          let maxCoverage = 0;
          for (let i = 0; i < n; i++) {
            if (a[i] > maxCoverage) maxCoverage = a[i];
          }

          if (maxCoverage > 0.08) {
            const ratioCutoff = purity * 0.35;
            const absoluteCutoff = purity * 0.08;

            for (let i = 0; i < n; i++) {
              const cov = a[i];
              if (cov <= 0 || cov === maxCoverage) continue;

              const ratio = cov / maxCoverage;
              if (ratio < ratioCutoff || cov < absoluteCutoff) {
                const low = ratioCutoff * 0.3;
                if (ratio <= low) {
                  a[i] = 0;
                } else {
                  /*
                   * `t` is clamped because the two cutoffs are independent: an
                   * ink can fail the *absolute* test while already sitting
                   * above `ratioCutoff`, which puts the raw ratio past the top
                   * of the fade. Unclamped the smoothstep runs away past 1 and
                   * goes negative — and a negative coverage is the cut-out
                   * sentinel the screening reads as "no media here"
                   * (pipeline.md invariant 1), so the plate dropped out in
                   * speckles across light tints instead of fading down.
                   */
                  const t = Math.min(1, Math.max(0, (ratio - low) / (ratioCutoff - low)));
                  a[i] = cov * (t * t * (3 - 2 * t));
                }
              }
            }
          }
        }

        const o = ((bi * size + gi) * size + ri) * n;
        for (let i = 0; i < n; i++) data[o + i] = a[i];
      }
    }
  }

  cachedLut = { size, inkCount: n, data, key };
  return cachedLut;
}

/**
 * Trilinear sample of the separation table.
 *
 * Writes `inkCount` coverages into `out` at `outOffset`. Inputs are
 * gamma-encoded bytes, matching how the table is indexed.
 */
export function sampleSeparationLut(
  lut: SeparationLut,
  r: number,
  g: number,
  b: number,
  out: Float32Array,
  outOffset: number
): void {
  const { size, inkCount, data } = lut;
  if (inkCount === 0) return;

  const scale = (size - 1) / 255;
  const fr = (r < 0 ? 0 : r > 255 ? 255 : r) * scale;
  const fg = (g < 0 ? 0 : g > 255 ? 255 : g) * scale;
  const fb = (b < 0 ? 0 : b > 255 ? 255 : b) * scale;

  const r0 = Math.min(size - 1, fr | 0);
  const g0 = Math.min(size - 1, fg | 0);
  const b0 = Math.min(size - 1, fb | 0);
  const r1 = Math.min(size - 1, r0 + 1);
  const g1 = Math.min(size - 1, g0 + 1);
  const b1 = Math.min(size - 1, b0 + 1);
  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;

  const idx = (ri: number, gi: number, bi: number) => ((bi * size + gi) * size + ri) * inkCount;
  const c000 = idx(r0, g0, b0);
  const c100 = idx(r1, g0, b0);
  const c010 = idx(r0, g1, b0);
  const c110 = idx(r1, g1, b0);
  const c001 = idx(r0, g0, b1);
  const c101 = idx(r1, g0, b1);
  const c011 = idx(r0, g1, b1);
  const c111 = idx(r1, g1, b1);

  for (let i = 0; i < inkCount; i++) {
    const x00 = data[c000 + i] + (data[c100 + i] - data[c000 + i]) * dr;
    const x10 = data[c010 + i] + (data[c110 + i] - data[c010 + i]) * dr;
    const x01 = data[c001 + i] + (data[c101 + i] - data[c001 + i]) * dr;
    const x11 = data[c011 + i] + (data[c111 + i] - data[c011 + i]) * dr;
    const y0 = x00 + (x10 - x00) * dg;
    const y1 = x01 + (x11 - x01) * dg;
    out[outOffset + i] = y0 + (y1 - y0) * db;
  }
}

/**
 * The inverse: coverages back to a colour, ignoring screening.
 *
 * Only the round-trip check and the ink-stack swatches use this — the real
 * composite happens per device pixel in `resolvePrintFrame`, where coverage is
 * already binary. Keeping the forward model here means the check tests the same
 * physics the renderer uses rather than a restatement of it.
 */
export function compositeCoverage(
  inks: InkPlate[],
  paper: string,
  coverages: ArrayLike<number>
): [number, number, number] {
  const P = linearizeHex(paper);
  let r = P[0];
  let g = P[1];
  let b = P[2];

  for (let i = 0; i < inks.length; i++) {
    const a = Math.max(0, Math.min(1, coverages[i] ?? 0));
    if (a <= 0) continue;
    const ink = inks[i];
    const [tr, tg, tb] = linearizeHex(ink.hex);
    const o = Math.max(0, Math.min(1, ink.opacity));

    if (ink.opaque) {
      const k = a * o;
      r += (tr - r) * k;
      g += (tg - g) * k;
      b += (tb - b) * k;
    } else {
      r *= Math.pow(Math.max(MIN_TRANSMITTANCE, tr), o * a);
      g *= Math.pow(Math.max(MIN_TRANSMITTANCE, tg), o * a);
      b *= Math.pow(Math.max(MIN_TRANSMITTANCE, tb), o * a);
    }
  }
  return [r, g, b];
}

/** Angle pairs closer than this read as gross moire rather than a rosette. */
export const MOIRE_ANGLE_TOLERANCE = 8;

/**
 * Enabled AM plates whose screens are too close in angle at a similar ruling.
 *
 * A real press failure the app knows enough to warn about. Angles live modulo
 * 90 because a square lattice repeats there, so 5 and 95 are the same screen.
 */
export function findMoireConflicts(inks: InkPlate[]): [InkPlate, InkPlate][] {
  const am = inks.filter((k) => k.enabled && k.screen === 'am');
  const out: [InkPlate, InkPlate][] = [];
  for (let i = 0; i < am.length; i++) {
    for (let j = i + 1; j < am.length; j++) {
      const a = am[i];
      const b = am[j];
      // Rulings more than a third apart beat at a different scale entirely.
      const rulingRatio = Math.max(a.ruling, b.ruling) / Math.max(1, Math.min(a.ruling, b.ruling));
      if (rulingRatio > 1.33) continue;
      let d = Math.abs(((a.angle - b.angle) % 90 + 90) % 90);
      if (d > 45) d = 90 - d;
      if (d < MOIRE_ANGLE_TOLERANCE) out.push([a, b]);
    }
  }
  return out;
}

/**
 * Ink extraction: what to *print* an image with, which is not the same
 * question as what the image is mostly made of.
 *
 * The naive version is a popularity contest — histogram the pixels, take the
 * top N — and it fails the same way on every photograph: the top eight buckets
 * of a sunset are eight slightly different oranges, and the top eight of a
 * portrait are eight greys. Both fill the stack with plates that overprint into
 * each other, and neither buys any gamut.
 *
 * A plate earns its place by making a colour the other plates cannot. Ink is
 * subtractive and translucent (see `buildSeparationLut`), so any colour inside
 * the hull of the chosen inks is already reachable by overprinting: a muddy
 * mid-tone is free, a saturated cyan is not. So selection maximises spread in a
 * perceptual space, weighted by how much of the sheet each colour actually
 * covers, and stops when the next plate stops paying for itself.
 */

/** Sampling raster. Big enough that a 0.5%-coverage spot colour survives. */
const EXTRACT_SAMPLE_W = 160;
const EXTRACT_SAMPLE_H = 120;

/*
 * Every threshold here is a CIE76 ΔE. `deltaE` returns the *square* of it, so
 * they are compared against its square root — `labDistance` below.
 *
 * MERGE is tighter than SEPARATION on purpose: merging asks "is this the same
 * ink", separation asks "is a second plate worth a whole extra pass on press".
 * The gap between the two is where near-duplicates go to die instead of
 * becoming plates 7 and 8.
 */
const INK_MERGE_DELTA_E = 11;
const INK_MIN_SEPARATION = 17;


/*
 * Coverage floors, as a fraction of the sheet — and there are two, because a
 * vivid colour earns a plate at a coverage a dull one does not. Nothing else in
 * the stack can make a fluorescent pink; a warm grey is what any two inks
 * already produce where they overlap.
 */
const INK_MIN_SHARE_DULL = 0.02;
const INK_MIN_SHARE_VIVID = 0.005;
const INK_VIVID_CHROMA = 38;

/*
 * The elbow. Every plate after the first is scored on what it adds, and once
 * that falls to a seventh of what the second plate added, the stack is done.
 * This is the rule that makes the count follow the artwork — two-colour poster
 * in, two plates out — instead of always filling every slot.
 */
const INK_GAIN_KNEE = 0.14;

/** A plate below this L* anchors the shadows; see `chooseInkPlates`. */
const INK_KEY_LIGHTNESS = 34;
const INK_KEY_MIN_SHARE = 0.03;

/** Paper has to be light *and* actually present, not a specular glint. */
const PAPER_MIN_LIGHTNESS = 84;
const PAPER_NEAR_DELTA_E = 14;

/**
 * One merged colour region of the sampled image, carrying everything the
 * selection judges it on.
 */
export interface InkCandidate {
  hex: string;
  rgb: [number, number, number];
  lab: Lab;
  /** sqrt(a*² + b*²): how far outside grey it sits, i.e. how unfakeable it is. */
  chroma: number;
  /** Fraction of the opaque sampled pixels, so: coverage of the sheet. */
  share: number;
}

const labDistance = (a: Lab, b: Lab) => Math.sqrt(deltaE(a, b));

/**
 * How far a colour sits from what one already-chosen plate can already print.
 *
 * A single ink on paper does not give you one colour, it gives you a *line*:
 * every coverage from 0 to 100% traces the ramp from the paper to the solid.
 * So the question "is this candidate worth its own drum" is a
 * point-to-segment distance in Lab, not point-to-point — and measuring it
 * against the solid alone is what buys four plates for a greyscale photograph
 * (the light greys are all tints of the black) and a second, paler orange for a
 * sunset (a tint of the first orange is lighter *and* less saturated, which is
 * exactly what the paler orange is).
 *
 * The clamp carries the physics at both ends. Past the solid (t > 1) the
 * candidate is darker or more saturated than the ink can go at any coverage, so
 * it measures from the solid and reads as new reach. Before the paper (t < 0)
 * it is lighter than the substrate, which no amount of ink achieves.
 */
function tintRampDistance(c: Lab, paper: Lab, ink: Lab): number {
  const vl = ink.l - paper.l;
  const va = ink.a - paper.a;
  const vb = ink.b - paper.b;
  const wl = c.l - paper.l;
  const wa = c.a - paper.a;
  const wb = c.b - paper.b;

  const vv = vl * vl + va * va + vb * vb;
  const t = vv > 0 ? Math.max(0, Math.min(1, (wl * vl + wa * va + wb * vb) / vv)) : 0;

  const dl = wl - t * vl;
  const da = wa - t * va;
  const db = wb - t * vb;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Coverage weight, shared by both scores below.
 *
 * The square root matters: raw share lets the background outvote everything, so
 * the top pick becomes the paper-adjacent tint in every photograph.
 * Square-rooted, a region four times larger is twice as attractive, which is
 * about the rate a printer actually cares at.
 */
const shareWeight = (c: InkCandidate) => Math.sqrt(c.share);

/** Chroma weight: a colour the others cannot overprint into existence. */
const chromaWeight = (c: InkCandidate) => 0.55 + Math.min(1, c.chroma / 60);

/**
 * Worth as the *first* plate, which is a different question from the rest.
 *
 * The first plate is the density anchor, so darkness is a constraint here, not
 * a preference. Ink subtracts: a plate can be lightened to anything between
 * itself and the paper by dropping coverage, but never darkened. Seed on a
 * mid-tone and every shadow below it is unreachable at any coverage — which is
 * why a real separation starts at the key and works up.
 */
const anchorWeight = (c: InkCandidate) =>
  shareWeight(c) * chromaWeight(c) * Math.pow(Math.max(0.05, 1 - c.lab.l / 100), 1.5);

/**
 * Worth as a *subsequent* plate, where darkness deliberately does not appear.
 *
 * Once the anchor is placed, what a new drum buys is hue reach, and a bright
 * saturated yellow is one of the most valuable plates there is — no stack of
 * darker inks will ever multiply *up* to it. Carrying the anchor's darkness
 * term into this score is what made the selection drop exactly those inks.
 */
const plateWeight = (c: InkCandidate) => shareWeight(c) * chromaWeight(c);

/**
 * Pick the plates — and pick *how many* plates.
 *
 * Farthest-point selection: seed with the most valuable candidate, then
 * repeatedly take whichever one maximises (distance from everything already
 * chosen) × (its own worth). That product kills both failure modes at once. A
 * near-duplicate scores near zero however popular it is, and a three-pixel
 * outlier scores near zero however exotic it is.
 *
 * Pure, and kept separate from the canvas sampling below, so the rules can be
 * exercised without a DOM.
 */
export function chooseInkPlates(
  candidates: InkCandidate[],
  paperLab: Lab,
  maxInks: number = MAX_INKS
): InkCandidate[] {
  const budget = Math.max(1, Math.min(MAX_INKS, maxInks));
  if (candidates.length === 0) return [];

  const pool = [...candidates];
  let seedIdx = 0;
  for (let i = 1; i < pool.length; i++) {
    if (anchorWeight(pool[i]) > anchorWeight(pool[seedIdx])) seedIdx = i;
  }
  const chosen: InkCandidate[] = [pool.splice(seedIdx, 1)[0]];

  /* The second plate sets the scale every later plate is judged against. */
  let firstGain = 0;

  while (chosen.length < budget && pool.length > 0) {
    let bestIdx = -1;
    let bestGain = 0;

    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const floor = c.chroma >= INK_VIVID_CHROMA ? INK_MIN_SHARE_VIVID : INK_MIN_SHARE_DULL;
      if (c.share < floor) continue;

      let sep = Infinity;
      for (const s of chosen) sep = Math.min(sep, tintRampDistance(c.lab, paperLab, s.lab));
      if (sep < INK_MIN_SEPARATION) continue;

      const gain = sep * plateWeight(c);
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    if (firstGain === 0) firstGain = bestGain;
    else if (bestGain < firstGain * INK_GAIN_KNEE) break;

    chosen.push(pool.splice(bestIdx, 1)[0]);
  }

  /*
   * Reserve one dark plate if the picture has shadows and the selection came
   * back all mid-tones.
   *
   * Without a key, the separation can only build a shadow by piling every
   * chromatic plate on top of each other — the wrong colour, and the fastest
   * route into the TAC limit, after which the solve redistributes and the
   * shadows go flat. One dark ink is worth more than a fifth hue.
   */
  const hasKey = chosen.some((c) => c.lab.l < INK_KEY_LIGHTNESS);
  if (!hasKey && chosen.length < budget) {
    let key: InkCandidate | null = null;
    for (const c of pool) {
      if (c.share < INK_KEY_MIN_SHARE || c.lab.l >= INK_KEY_LIGHTNESS) continue;
      let sep = Infinity;
      for (const s of chosen) sep = Math.min(sep, tintRampDistance(c.lab, paperLab, s.lab));
      if (sep < INK_MIN_SEPARATION) continue;
      if (!key || c.lab.l < key.lab.l) key = c;
    }
    if (key) chosen.push(key);
  }

  /*
   * Darkest first: the printing order convention, and what `inksFromPalette`
   * already assumes when it calls the darkest entry the key.
   */
  return chosen.sort((a, b) => a.lab.l - b.lab.l);
}

/**
 * Extracts the ink stack and the paper stock an image would be printed with.
 */
export function extractImageInks(
  element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  press: PressProfile = 'riso',
  maxInks: number = 4
): { paper: string; inks: InkPlate[] } {
  const fallback = (paper = '#ffffff'): { paper: string; inks: InkPlate[] } => ({
    paper,
    inks: applyPressAngles([makeInkPlate(INK_LIBRARY[0], press, 15)], press),
  });

  const canvas = document.createElement('canvas');
  const w = EXTRACT_SAMPLE_W;
  const h = EXTRACT_SAMPLE_H;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback();

  try {
    ctx.drawImage(element, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const pixels = w * h;

    /*
     * 5-bit RGB histogram, accumulating sums so each bucket yields a true
     * centroid rather than whichever pixel happened to land in it first.
     */
    const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
    let opaque = 0;
    for (let i = 0; i < pixels; i++) {
      const o = i * 4;
      if (data[o + 3] < 128) continue;
      opaque++;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const hit = bins.get(key);
      if (hit) {
        hit.r += r;
        hit.g += g;
        hit.b += b;
        hit.n++;
      } else {
        bins.set(key, { r, g, b, n: 1 });
      }
    }
    if (opaque === 0 || bins.size === 0) return fallback();

    /*
     * Corner average, as the tie-breaker for which light region is the paper: a
     * background reaches the edge of the frame, a highlight usually does not.
     */
    let cornerLab: Lab | null = null;
    let cornerHex = '';
    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4].filter(
      (o) => data[o + 3] >= 128
    );
    if (corners.length > 0) {
      const cr = Math.round(corners.reduce((s, o) => s + data[o], 0) / corners.length);
      const cg = Math.round(corners.reduce((s, o) => s + data[o + 1], 0) / corners.length);
      const cb = Math.round(corners.reduce((s, o) => s + data[o + 2], 0) / corners.length);
      cornerLab = rgbToLab(cr, cg, cb);
      cornerHex = bytesToHex(cr, cg, cb);
    }

    /*
     * Merge in Lab, moving the centroid as mass arrives. The old pass kept the
     * first bucket's colour and only added the counts, which left the
     * representative sitting at the edge of its own cluster.
     */
    type Cluster = { r: number; g: number; b: number; n: number; lab: Lab };
    const clusters: Cluster[] = [];
    for (const bin of [...bins.values()].sort((a, b) => b.n - a.n)) {
      const r = bin.r / bin.n;
      const g = bin.g / bin.n;
      const b = bin.b / bin.n;
      const lab = rgbToLab(r, g, b);
      let host: Cluster | null = null;
      for (const c of clusters) {
        if (labDistance(lab, c.lab) < INK_MERGE_DELTA_E) {
          host = c;
          break;
        }
      }
      if (host) {
        const n = host.n + bin.n;
        host.r = (host.r * host.n + r * bin.n) / n;
        host.g = (host.g * host.n + g * bin.n) / n;
        host.b = (host.b * host.n + b * bin.n) / n;
        host.n = n;
        host.lab = rgbToLab(host.r, host.g, host.b);
      } else {
        clusters.push({ r, g, b, n: bin.n, lab });
      }
    }

    /*
     * Re-sort. Merging moves mass between clusters, so the order the buckets
     * arrived in is no longer the order of importance — the old code sorted
     * once, *before* merging, and never again, which is why a colour that had
     * absorbed half the image could still rank below one that had not.
     */
    clusters.sort((a, b) => b.n - a.n);

    const candidates: InkCandidate[] = clusters.map((c) => {
      const r = Math.round(c.r);
      const g = Math.round(c.g);
      const b = Math.round(c.b);
      return {
        hex: bytesToHex(r, g, b),
        rgb: [r, g, b] as [number, number, number],
        lab: c.lab,
        chroma: Math.sqrt(c.lab.a * c.lab.a + c.lab.b * c.lab.b),
        share: c.n / opaque,
      };
    });

    /*
     * Paper: the most *present* light region, not the lightest one. Picking by
     * lightness handed the stock to a 3%-coverage specular highlight and left
     * the cream background to be printed as an ink.
     */
    let paperHex = '#ffffff';
    let paperLab = rgbToLab(255, 255, 255);
    const paperPick = candidates
      .filter((c) => c.lab.l >= PAPER_MIN_LIGHTNESS && c.share >= 0.03)
      .map((c) => ({
        c,
        score:
          c.share +
          (cornerLab && labDistance(c.lab, cornerLab) < PAPER_NEAR_DELTA_E ? 0.25 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (paperPick) {
      paperHex = paperPick.c.hex;
      paperLab = paperPick.c.lab;
    } else if (cornerLab && cornerHex && cornerLab.l >= PAPER_MIN_LIGHTNESS - 4) {
      paperHex = cornerHex;
      paperLab = cornerLab;
    }

    /*
     * Nothing within a hair of the paper gets a plate: that pass would lay
     * near-white on near-white and spend a whole drum on nothing.
     */
    const inkPool = candidates.filter(
      (c) => labDistance(c.lab, paperLab) > PAPER_NEAR_DELTA_E
    );

    const selected = chooseInkPlates(inkPool, paperLab, maxInks);
    if (selected.length === 0) return fallback(paperHex);

    const angles = PRESS_PROFILES[press].angles;
    const plates = selected.map((c, idx) => {
      /*
       * Name from the ink library when it genuinely *is* that ink, judged
       * perceptually — the old threshold of 40 was measured in linear RGB,
       * where it means wildly different things at different lightnesses.
       */
      let name = `Ink ${idx + 1}`;
      let best = Infinity;
      for (const spec of INK_LIBRARY) {
        const [sr, sg, sb] = hexToBytes(spec.hex);
        const d = labDistance(c.lab, rgbToLab(sr, sg, sb));
        if (d < best) {
          best = d;
          if (d < 12) name = spec.name;
        }
      }
      return makeInkPlate({ name, hex: c.hex }, press, angles[Math.min(idx, angles.length - 1)]);
    });

    /*
     * Extraction ranks clusters by how much of the picture they cover, which is
     * the right order to *choose* inks in and the wrong one to print them in —
     * it routinely left the darkest ink last, with the last claim on density in
     * the solve. Press order is applied once the choice is made.
     */
    return { paper: paperHex, inks: applyPressAngles(orderInksForPress(plates), press) };
  } catch {
    return fallback();
  }
}
