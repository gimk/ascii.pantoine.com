/**
 * Fast CMYK Halftone Engine
 *
 * The screen geometry is the Stefan Gustavson / Shadertoy (`fdjyR1`) analytical
 * rotated halftone: no mask, no accumulation — a device pixel finds its cell in
 * a rotated lattice and asks whether it falls inside that cell's dot. Four
 * plates in press order, on the conventional angles:
 *   - Black:   45°
 *   - Cyan:    15°
 *   - Magenta: 75°
 *   - Yellow:   0°
 *
 * Three separate questions, kept separate because conflating them is what makes
 * a halftone engine wrong rather than merely fast:
 *
 *   1. *How much ink does this colour need?* — `solveCellAreas`, a peel in press
 *      order against the inks' actual densities, with the black plate taking
 *      the grey component.
 *   2. *What dot radius is that much ink?* — `radiusForCoverage`, the exact
 *      inverse of circle-area-minus-neighbour-overlap.
 *   3. *Is this pixel in the dot?* — the rotated lattice above.
 *
 * The engine is `PrintFrame`-native, so the viewport, solo-ink inspection,
 * proof tiers and multi-layer SVG plate export treat its output exactly like
 * the press simulation's.
 */

import { InkPlate, PrintConfig, PrintFrame, PrintTier } from '../types/ascii';
import { linearizeHex, makeInkPlate } from './printInks';

export const CMYK_DEFAULT_ANGLES = {
  c: 15,
  m: 75,
  y: 0,
  k: 45,
};

export type CmykChannel = 'c' | 'm' | 'y' | 'k';

/**
 * The four process plates, in press order, with **stable** ids.
 *
 * **The stack is KCMY, not CMYK** — black down first, yellow last. That is the
 * standard sheetfed offset sequence, and ISO 12647-2 states it as CMY with
 * black acceptable either first or last: black first gives cyan a larger area
 * of dry, uninked paper to trap to, and the transparent high-coverage yellow
 * laid last reads almost like a gloss varnish. The one rule not to break is
 * C before M before Y, which is what keeps the traps right.
 *
 * It is not only a convention here. `solveCoverage` is cyclic coordinate
 * descent over the ink columns in array order, so with a box-constrained,
 * non-unique solution set the *first* ink gets first claim on density. Darkest
 * first is what turns that into grey component replacement instead of a muddy
 * three-ink neutral — the same effect as dragging black to the bottom of the
 * press-sim stack by hand.
 *
 * The ids matter more than they look: `makeInkPlate` mints a fresh
 * `ink-<n>-<timestamp>` on every call, and this factory is called both per
 * render in the panel and per frame in the engine. Identity drifting between
 * those two callers is what made the per-plate editors impossible to open (the
 * panel's `expanded` id was stale one render later), and it would have resolved
 * a soloed plate to bare paper, since `resolvePrintFrame` finds the solo plate
 * by id in `frame.inks`. Process CMYK is a fixed stack of four, so it gets
 * fixed names — and those names, not the array position, are what say which
 * channel a plate carries.
 */
export const CMYK_INKS: Array<{
  id: string;
  channel: CmykChannel;
  name: string;
  hex: string;
  angle: number;
}> = [
  { id: 'cmyk_k', channel: 'k', name: 'Process Black', hex: '#1d1d1b', angle: 45 },
  { id: 'cmyk_c', channel: 'c', name: 'Process Cyan', hex: '#00a3e0', angle: 15 },
  { id: 'cmyk_m', channel: 'm', name: 'Process Magenta', hex: '#ec008c', angle: 75 },
  { id: 'cmyk_y', channel: 'y', name: 'Process Yellow', hex: '#ffed00', angle: 0 },
];

/** Press-order index of each channel, for callers holding a c/m/y/k key. */
export const CMYK_PLATE_INDEX: Record<CmykChannel, number> = {
  k: 0,
  c: 1,
  m: 2,
  y: 3,
};

/** The order plates were stored in before the stack was put into press order. */
const LEGACY_PLATE_ORDER: CmykChannel[] = ['c', 'm', 'y', 'k'];

/** Build standard 4-plate InkPlate array for Fast CMYK mode, in press order. */
export function getFastCmykPlates(config?: Partial<PrintConfig>): InkPlate[] {
  const angles = config?.cmykAngles || CMYK_DEFAULT_ANGLES;

  const stored = config?.cmykPlates;
  if (stored && stored.length === 4) {
    /*
     * Stored plates are re-seated into press order by channel rather than read
     * positionally. A config written before the stack was KCMY holds them in
     * CMYK order, so trusting the position would relabel cyan as the black
     * plate and repaint the picture with the user's own colours in the wrong
     * channels. Plates saved with ids are matched on those; older ones without
     * fall back to the legacy CMYK positions they must have been written in.
     */
    const byChannel = new Map<CmykChannel, InkPlate>();
    stored.forEach((p, i) => {
      const spec = CMYK_INKS.find((s) => s.id === p.id);
      const channel = spec ? spec.channel : LEGACY_PLATE_ORDER[i];
      if (!byChannel.has(channel)) byChannel.set(channel, p);
    });

    return CMYK_INKS.map((spec) => {
      const p = byChannel.get(spec.channel);
      if (!p) {
        return {
          ...makeInkPlate({ name: spec.name, hex: spec.hex }, 'offset', angles[spec.channel]),
          id: spec.id,
          opacity: 1,
          intensity: 1,
        };
      }
      return {
        ...p,
        id: spec.id,
        angle: typeof p.angle === 'number' ? p.angle : angles[spec.channel],
        intensity: typeof p.intensity === 'number' ? p.intensity : 1,
      };
    });
  }

  return CMYK_INKS.map((spec) => ({
    ...makeInkPlate({ name: spec.name, hex: spec.hex }, 'offset', angles[spec.channel]),
    id: spec.id,
    /*
     * Solid ink, full intensity — so the untouched default and what the panel's
     * RESET writes are the same picture. `makeInkPlate` would otherwise hand
     * back the 0.85 library default for an unknown hex and every channel would
     * print 15% light with no control saying so.
     */
    opacity: 1,
    intensity: 1,
  }));
}

/**
 * Dot radius for a requested ink **area**, in grid units.
 *
 * A circle of radius `r` in a unit cell covers `pi*r^2` until `r` passes 0.5,
 * after which it starts eating into its four neighbours and the overlap has to
 * come back off. This inverts that exactly, so asking for 40% area lays 40% of
 * the cell rather than 63% of it, and at `r = sqrt(0.5)` the four lenses
 * subtract to precisely 1.0 so a solid channel is genuinely solid.
 *
 * **Area is not tone.** What area to ask for is a separate question, answered
 * by `solveCellAreas` — a halftone is a mixture of paper and solid ink, so 50%
 * black area on white paper reads around sRGB 189, not 128. Feeding a gamma
 * channel value straight in here is what washes a picture out.
 */
const R_MAX = Math.SQRT1_2;
const COVERAGE_LUT_N = 1024;

function dotCoverage(r: number): number {
  if (r <= 0) return 0;
  if (r >= R_MAX) return 1;
  const area = Math.PI * r * r;
  if (r <= 0.5) return area;
  // Lens shared with each of the four neighbours, whose centres are 1 away.
  const lens = 2 * r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(4 * r * r - 1);
  return Math.min(1, area - 2 * lens);
}

const COVERAGE_TO_RADIUS = (() => {
  const lut = new Float32Array(COVERAGE_LUT_N + 1);
  for (let i = 0; i <= COVERAGE_LUT_N; i++) {
    const target = i / COVERAGE_LUT_N;
    let lo = 0;
    let hi = R_MAX;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) * 0.5;
      if (dotCoverage(mid) < target) lo = mid;
      else hi = mid;
    }
    lut[i] = (lo + hi) * 0.5;
  }
  return lut;
})();

function radiusForCoverage(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return R_MAX;
  const f = v * COVERAGE_LUT_N;
  const i = f | 0;
  const t = f - i;
  return COVERAGE_TO_RADIUS[i] + (COVERAGE_TO_RADIUS[i + 1] - COVERAGE_TO_RADIUS[i]) * t;
}

/** sRGB byte to linear reflectance. */
const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    lut[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

/** Matches the composite's own floor in `buildCompositeTable`. */
const MIN_TRANSMITTANCE = 0.002;
const LUMA = [0.2126, 0.7152, 0.0722];

interface PlateOptics {
  /** Effective transmittance per channel, `T^opacity`, as the composite uses it. */
  t: [number, number, number];
  /** Channel this ink absorbs most — the one its area is solved against. */
  ctrl: number;
  /** Luminance-weighted absorption, for the neutral (black) step. */
  absLuma: number;
}

function plateOptics(ink: InkPlate): PlateOptics {
  const [lr, lg, lb] = linearizeHex(ink.hex);
  const o = Math.max(0, Math.min(1, typeof ink.opacity === 'number' ? ink.opacity : 1));
  const t: [number, number, number] = [
    Math.pow(Math.max(MIN_TRANSMITTANCE, lr), o),
    Math.pow(Math.max(MIN_TRANSMITTANCE, lg), o),
    Math.pow(Math.max(MIN_TRANSMITTANCE, lb), o),
  ];
  let ctrl = 0;
  for (let ch = 1; ch < 3; ch++) {
    if (1 - t[ch] > 1 - t[ctrl]) ctrl = ch;
  }
  const absLuma = LUMA[0] * (1 - t[0]) + LUMA[1] * (1 - t[1]) + LUMA[2] * (1 - t[2]);
  return { t, ctrl, absLuma };
}

/**
 * Ink areas that make the screen *read* as the source colour.
 *
 * The mistake worth naming, because the obvious code makes it: `1 - r` on a
 * gamma-encoded byte is not a dot area. A halftone cell is a mixture of bare
 * paper and solid ink, so its reflectance is linear in the dot area —
 * `R = P * (1 - a * (1 - T))`, the Murray-Davies relation — and inverting that
 * is the only way the printed tone matches the picture. Fifty percent black
 * area on white paper reads sRGB 189; hitting a mid grey takes 79%.
 *
 * Four inks are peeled off **in press order**, which is the second reason the
 * stack is KCMY and not a cosmetic one:
 *
 *  - Black takes the neutral floor — the least any channel has to fall — scaled
 *    by `blackGen`. At 1 it is full GCR and a grey prints on the black plate
 *    alone, which is correct and also why no rosette appears in neutrals. Below
 *    1 black lays a skeleton and the chromatic inks carry the rest, so greys
 *    get a four-plate overprint and the rosette comes back.
 *  - Each chromatic ink then brings the channel it absorbs most down to target,
 *    against the residual the plates before it left. Independent rotated
 *    screens multiply, which is the Demichel assumption the rosette itself
 *    rests on, so composing them this way is consistent with how
 *    `buildCompositeTable` will put them back together.
 */
function peelChromatic(
  want: number[],
  cur: number[],
  optics: PlateOptics[],
  channels: CmykChannel[],
  out: Float64Array
): number {
  let least = 1;
  for (let i = 0; i < optics.length; i++) {
    if (channels[i] === 'k') continue;
    const op = optics[i];
    const ch = op.ctrl;
    const abs = 1 - op.t[ch];
    let a = abs > 1e-6 ? (1 - want[ch] / cur[ch]) / abs : 0;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    out[i] = a;
    if (a < least) least = a;
    if (a > 0) {
      cur[0] *= 1 - a * (1 - op.t[0]);
      cur[1] *= 1 - a * (1 - op.t[1]);
      cur[2] *= 1 - a * (1 - op.t[2]);
    }
  }
  return least;
}

function solveCellAreas(
  rl: number,
  gl: number,
  bl: number,
  paper: [number, number, number],
  optics: PlateOptics[],
  channels: CmykChannel[],
  blackGen: number,
  out: Float64Array
): void {
  // Transmittance the whole stack has to reach, per channel, relative to paper.
  const want = [
    Math.min(1, Math.max(0, rl / Math.max(1e-4, paper[0]))),
    Math.min(1, Math.max(0, gl / Math.max(1e-4, paper[1]))),
    Math.min(1, Math.max(0, bl / Math.max(1e-4, paper[2]))),
  ];

  /*
   * Pass one: what the chromatic inks do on their own, and how far short of the
   * target they fall — the error to beat. Their common component, the smallest
   * of the three areas, is the grey they are making between them.
   */
  const cur = [1, 1, 1];
  const common = peelChromatic(want, cur, optics, channels, out);
  const baseErr = overshoot(want, cur);

  const kIndex = channels.indexOf('k');
  const kOptics = kIndex >= 0 ? optics[kIndex] : null;
  if (!kOptics || kOptics.absLuma <= 1e-6 || blackGen <= 0) {
    if (kIndex >= 0) out[kIndex] = 0;
    return;
  }

  /*
   * Two candidates, because the honest answer is a coupled solve and this
   * engine is the one that does not do those.
   *
   * The ambitious one is all the black the target itself allows: black darkens
   * all three channels by the same factor, so the *lightest* channel is what
   * binds it. On a neutral that is full grey component replacement — at
   * `blackGen` 1 a grey prints on the black plate alone, which is correct, and
   * is also why neutrals then carry no rosette.
   *
   * On saturated colour it overshoots, and not because of the target: cyan has
   * a real green absorption, so a green needs near-solid cyan to fix red, and
   * that alone takes green most of the way down. Add a black sized from the
   * target and green is crushed with nothing able to lighten it. So the
   * fallback is the classic UCR rule — black replaces only the grey the
   * chromatic inks were already making — which is always feasible, since the
   * inks it stands in for shrink to make room.
   *
   * Try the ambitious value, keep it only if the second peel lands no further
   * from the target than the chromatic inks managed alone, and otherwise take
   * the conservative one.
   */
  const ceiling = Math.min(1, Math.max(want[0], want[1], want[2]));
  const cap = Math.min(1, (1 - ceiling) / kOptics.absLuma);
  const ambitious = Math.min(blackGen * cap, cap);
  const conservative = Math.min(blackGen * common, cap);

  let kArea = applyBlack(ambitious, want, cur, kOptics, optics, channels, out);
  if (kArea > conservative && overshoot(want, cur) > baseErr + 1e-5) {
    kArea = applyBlack(conservative, want, cur, kOptics, optics, channels, out);
  }
  out[kIndex] = kArea;
}

/** Lays `kArea` of black, re-peels the chromatic inks over it, returns `kArea`. */
function applyBlack(
  kArea: number,
  want: number[],
  cur: number[],
  kOptics: PlateOptics,
  optics: PlateOptics[],
  channels: CmykChannel[],
  out: Float64Array
): number {
  const a = kArea < 0 ? 0 : kArea > 1 ? 1 : kArea;
  cur[0] = 1 - a * (1 - kOptics.t[0]);
  cur[1] = 1 - a * (1 - kOptics.t[1]);
  cur[2] = 1 - a * (1 - kOptics.t[2]);
  peelChromatic(want, cur, optics, channels, out);
  return a;
}

/** How far past the target the stack has gone, summed square, per channel. */
function overshoot(want: number[], cur: number[]): number {
  let e = 0;
  for (let ch = 0; ch < 3; ch++) {
    const d = want[ch] - cur[ch];
    if (d > 0) e += d * d;
  }
  return e;
}

/*
 * The separation, cached per *source* pixel and shared by all four plates.
 *
 * A plate's screen grid is its own — rotated — so there is no cell two plates
 * share, but the thing being solved is a property of the source pixel, not of
 * the cell that sampled it. At a fine ruling the cells outnumber the pixels
 * several times over, and this is what stops the solve being repeated for each
 * of them. A stamp rather than a clear, so a new frame costs nothing to
 * invalidate.
 */
let areaCache = new Float32Array(0);
let areaStamp = new Int32Array(0);
let frameStamp = 0;

export interface FastCmykInput {
  rgbData: Uint8ClampedArray | Uint8Array;
  cols: number;
  rows: number;
  supersample: number;
  config: PrintConfig;
  tier?: PrintTier;
}

/**
 * Screen an image using the fast analytical CMYK algorithm.
 */
export function renderFastCmykFrame(input: FastCmykInput): PrintFrame {
  const {
    rgbData,
    cols,
    rows,
    supersample,
    config,
    tier = 'live',
  } = input;

  const outW = Math.max(1, cols * supersample);
  const outH = Math.max(1, rows * supersample);
  const total = outW * outH;

  const plateMask = new Uint8Array(total);
  const inks = getFastCmykPlates(config);

  const ruling = Math.max(2, Math.min(1000, config.cmykRuling ?? 50));
  const dotScale = Math.max(0.2, Math.min(2.5, config.cmykDotScale ?? 1.0));
  const paperHex = config.paper || '#ffffff';
  const blackGen = Math.max(0, Math.min(1, config.cmykBlackGen ?? 0.8));

  const coverage = [0, 0, 0, 0];

  const paper = linearizeHex(paperHex);
  const optics = inks.map(plateOptics);
  const channels = CMYK_INKS.map((s) => s.channel);
  const areas = new Float64Array(4);

  const cells = cols * rows;
  if (areaCache.length < cells * 4) {
    areaCache = new Float32Array(cells * 4);
    areaStamp = new Int32Array(cells);
  }
  frameStamp++;

  // Ruling frequency: cells across image width
  const freq = ruling / cols;
  const scaleFreq = freq / supersample;

  const cols1 = Math.max(1, cols - 1);
  const rows1 = Math.max(1, rows - 1);

  // Pre-calculate per-plate screening
  for (let p = 0; p < 4; p++) {
    const ink = inks[p];
    if (!ink || !ink.enabled) continue;

    /*
     * Angle and separation role come from the plate's identity, not from `p`.
     * The stack is ordered for the press (KCMY), so position no longer implies
     * which separation a plate carries.
     */
    const angleDeg = typeof ink.angle === 'number' ? ink.angle : CMYK_INKS[p].angle;
    const rad = (angleDeg * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);
    const plateBit = 1 << p;

    // Dot-area gain for this channel, independent of the ink's solidity.
    const intensity = typeof ink.intensity === 'number' ? ink.intensity : 1.0;

    let totalSet = 0;

    /*
     * The screen value is constant across a cell — it is sampled at the cell
     * centre — so the source fetch, the UCR solve and the radius inversion
     * happen once per cell and are memoised, not once per device pixel. At
     * ruling 50 on an 8x plate that is one solve per few thousand pixels
     * instead of one per pixel, which is what makes this engine worth the name.
     */
    let lastU = Infinity;
    let lastV = Infinity;
    let rDot = 0;

    // Rotation is stepped rather than multiplied out: u and v are affine in x.
    const duX = cosT * scaleFreq;
    const dvX = sinT * scaleFreq;

    for (let y = 0; y < outH; y++) {
      const rowOffset = y * outW;
      let uPrime = -y * sinT * scaleFreq;
      let vPrime = y * cosT * scaleFreq;

      for (let x = 0; x < outW; x++, uPrime += duX, vPrime += dvX) {
        // Cell centre, in screen grid units.
        const uCell = Math.floor(uPrime) + 0.5;
        const vCell = Math.floor(vPrime) + 0.5;

        if (uCell !== lastU || vCell !== lastV) {
          lastU = uCell;
          lastV = vCell;

          // Rotate the cell centre back into device space to sample the source.
          const xc = (uCell * cosT + vCell * sinT) / scaleFreq;
          const yc = (-uCell * sinT + vCell * cosT) / scaleFreq;

          const sx = Math.max(0, Math.min(cols1, Math.floor((xc / outW) * cols)));
          const sy = Math.max(0, Math.min(rows1, Math.floor((yc / outH) * rows)));

          const cell = sy * cols + sx;
          const cacheIdx = cell * 4;
          if (areaStamp[cell] !== frameStamp) {
            areaStamp[cell] = frameStamp;
            const srcIdx = cell * 3;
            solveCellAreas(
              SRGB_TO_LINEAR[rgbData[srcIdx] ?? 255],
              SRGB_TO_LINEAR[rgbData[srcIdx + 1] ?? 255],
              SRGB_TO_LINEAR[rgbData[srcIdx + 2] ?? 255],
              paper,
              optics,
              channels,
              blackGen,
              areas
            );
            areaCache[cacheIdx] = areas[0];
            areaCache[cacheIdx + 1] = areas[1];
            areaCache[cacheIdx + 2] = areas[2];
            areaCache[cacheIdx + 3] = areas[3];
          }

          let area = areaCache[cacheIdx + p] * intensity;
          area = area < 0 ? 0 : area > 1 ? 1 : area;

          rDot = radiusForCoverage(area) * dotScale;
        }

        if (rDot <= 0.02) continue;

        const du = uPrime - uCell;
        const dv = vPrime - vCell;
        if (du * du + dv * dv <= rDot * rDot) {
          plateMask[rowOffset + x] |= plateBit;
          totalSet++;
        }
      }
    }

    coverage[p] = totalSet / total;
  }

  return {
    width: outW,
    height: outH,
    supersample,
    plateMask,
    inks,
    paperHex,
    coverage,
    tier,
  };
}
