/**
 * Fast CMYK Halftone Engine
 *
 * Implements the Stefan Gustavson / Shadertoy (`fdjyR1`) analytical rotated
 * halftone screen algorithm.
 *
 * Runs with near-zero latency by computing analytical 2D rotated circular
 * dot distance grids per CMYK channel:
 *   - Cyan:    15°
 *   - Magenta: 75°
 *   - Yellow:   0°
 *   - Black:   45°
 *
 * Directly produces a 4-plate `PrintFrame` compatible with `resolvePrintFrame`,
 * viewport zooming, solo-ink inspection, and multi-layer SVG plate exports.
 */

import { InkPlate, PrintConfig, PrintFrame, PrintTier } from '../types/ascii';
import { makeInkPlate } from './printInks';

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
 * Dot radius for a requested ink coverage, in grid units.
 *
 * A circle of radius `r` in a unit cell covers `pi*r^2` until `r` passes 0.5,
 * after which it starts eating into its four neighbours and the overlap has to
 * come back off. Inverting that exactly is what makes the tone ramp linear:
 * `sqrt(v) * sqrt(0.5)` — the constant that merely parks the dot on the cell
 * corners at solid — lays 39% ink for a 25% signal and 78% for a 50% one, which
 * is a plugged midtone rather than a screen.
 *
 * The top end stays exact as well: at `r = sqrt(0.5)` the four lenses subtract
 * to precisely 1.0, so a solid channel is genuinely solid.
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

  const coverage = [0, 0, 0, 0];

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
     * The channel comes from the plate's identity, not from `p`. The stack is
     * ordered for the press (KCMY), so position no longer implies which
     * separation a plate carries.
     */
    const channel = CMYK_INKS[p].channel;
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

          const srcIdx = (sy * cols + sx) * 3;
          const r = (rgbData[srcIdx] ?? 255) / 255;
          const g = (rgbData[srcIdx + 1] ?? 255) / 255;
          const b = (rgbData[srcIdx + 2] ?? 255) / 255;

          // CMYK Undercolor Removal (UCR)
          const c = 1 - r;
          const m = 1 - g;
          const yChan = 1 - b;
          const k = Math.min(c, Math.min(m, yChan));

          let channelVal: number;
          if (channel === 'k') {
            channelVal = k;
          } else if (k >= 1) {
            channelVal = 0;
          } else {
            channelVal = ((channel === 'c' ? c : channel === 'm' ? m : yChan) - k) / (1 - k);
          }

          channelVal *= intensity;
          channelVal = channelVal < 0 ? 0 : channelVal > 1 ? 1 : channelVal;

          rDot = radiusForCoverage(channelVal) * dotScale;
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
