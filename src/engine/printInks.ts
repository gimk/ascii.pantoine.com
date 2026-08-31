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
    description: 'Soy ink through a thermal stencil, one pass per drum',
    ruling: 71,
    screen: 'am',
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
    fmAlgorithm: 'floyd-steinberg',

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
export function applyPressAngles(inks: InkPlate[], press: PressProfile): InkPlate[] {
  const angles = PRESS_PROFILES[press].angles;
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

function inkLuma(hex: string): number {
  const [r, g, b] = hexToBytes(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
    press,
    inks: [
      makeInkPlate({ name: 'Fluorescent Pink', hex: '#ff48b0' }, press, 45),
      makeInkPlate({ name: 'Federal Blue', hex: '#0078bf' }, press, 75),
    ],
    paper: p.paper,
    tacLimit: p.tacLimit,
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
  const inks = pool.slice(0, MAX_INKS).map((hex, i) =>
    makeInkPlate(
      { name: findInkSpec(hex)?.name || `Ink ${i + 1}`, hex },
      press,
      angles[Math.min(i, angles.length - 1)]
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

function lutKey(inks: InkPlate[], paper: string, tac: number, size: number): string {
  const ik = inks.map((k) => `${k.hex}:${k.opacity.toFixed(3)}`).join('|');
  return `${size}/${paper}/${tac}/${ik}`;
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
  size: number = LUT_SIZE_FULL
): SeparationLut {
  const key = lutKey(inks, paper, tacLimit, size);
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
