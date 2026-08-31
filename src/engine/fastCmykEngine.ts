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

export const CMYK_INKS: Array<{ id: string; name: string; hex: string; angle: number }> = [
  { id: 'cmyk_c', name: 'Process Cyan', hex: '#00a3e0', angle: 15 },
  { id: 'cmyk_m', name: 'Process Magenta', hex: '#ec008c', angle: 75 },
  { id: 'cmyk_y', name: 'Process Yellow', hex: '#ffed00', angle: 0 },
  { id: 'cmyk_k', name: 'Process Black', hex: '#1d1d1b', angle: 45 },
];

/** Build standard 4-plate InkPlate array for Fast CMYK mode. */
export function getFastCmykPlates(config?: Partial<PrintConfig>): InkPlate[] {
  const angles = config?.cmykAngles || CMYK_DEFAULT_ANGLES;
  const plates: InkPlate[] = [
    makeInkPlate({ name: 'Process Cyan', hex: '#00a3e0' }, 'offset', angles.c),
    makeInkPlate({ name: 'Process Magenta', hex: '#ec008c' }, 'offset', angles.m),
    makeInkPlate({ name: 'Process Yellow', hex: '#ffed00' }, 'offset', angles.y),
    makeInkPlate({ name: 'Process Black', hex: '#1d1d1b' }, 'offset', angles.k),
  ];

  // If user disabled or hid any plate in config.inks, reflect that
  if (config?.inks && config.inks.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const src = config.inks[i];
      if (src) {
        plates[i].enabled = src.enabled;
        plates[i].hidden = src.hidden;
      }
    }
  }

  return plates;
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
  const angles = config.cmykAngles || CMYK_DEFAULT_ANGLES;

  const ruling = Math.max(2, Math.min(1000, config.cmykRuling ?? 50));
  const dotScale = Math.max(0.4, Math.min(2.5, config.cmykDotScale ?? 1.0));
  const paperHex = config.paper || '#ffffff';

  const angleArr = [angles.c, angles.m, angles.y, angles.k];
  const coverage = [0, 0, 0, 0];

  // Ruling frequency: cells across image width
  const freq = ruling / cols;
  const scaleFreq = freq / supersample;

  const cosArr = new Float32Array(4);
  const sinArr = new Float32Array(4);

  for (let p = 0; p < 4; p++) {
    const rad = (angleArr[p] * Math.PI) / 180;
    cosArr[p] = Math.cos(rad);
    sinArr[p] = Math.sin(rad);
  }

  const cols1 = Math.max(1, cols - 1);
  const rows1 = Math.max(1, rows - 1);

  // Pre-calculate per-plate screening
  for (let p = 0; p < 4; p++) {
    const ink = inks[p];
    if (!ink || !ink.enabled) continue;

    const cosT = cosArr[p];
    const sinT = sinArr[p];
    const cosNegT = cosT;
    const sinNegT = -sinT;
    const plateBit = 1 << p;

    let totalSet = 0;

    for (let y = 0; y < outH; y++) {
      const rowOffset = y * outW;
      for (let x = 0; x < outW; x++) {
        // 1. Rotate coordinate to plate screen angle
        const uPrime = (x * cosT - y * sinT) * scaleFreq;
        const vPrime = (x * sinT + y * cosT) * scaleFreq;

        // 2. Center of grid cell
        const uCell = Math.floor(uPrime) + 0.5;
        const vCell = Math.floor(vPrime) + 0.5;

        // 3. Distance to cell center in grid units
        const du = uPrime - uCell;
        const dv = vPrime - vCell;
        const dist = Math.sqrt(du * du + dv * dv);

        // 4. Sample source RGB at cell center
        const xc = (uCell * cosNegT - vCell * sinNegT) / scaleFreq;
        const yc = (uCell * sinNegT + vCell * cosNegT) / scaleFreq;

        const sx = Math.max(0, Math.min(cols1, Math.floor((xc / outW) * cols)));
        const sy = Math.max(0, Math.min(rows1, Math.floor((yc / outH) * rows)));

        const srcIdx = (sy * cols + sx) * 3;
        const r = (rgbData[srcIdx] ?? 255) / 255;
        const g = (rgbData[srcIdx + 1] ?? 255) / 255;
        const b = (rgbData[srcIdx + 2] ?? 255) / 255;

        // 5. CMYK Undercolor Removal (UCR)
        const c = 1 - r;
        const m = 1 - g;
        const yChan = 1 - b;
        const k = Math.min(c, Math.min(m, yChan));

        let channelVal = 0;
        if (p === 0) {
          channelVal = k >= 1 ? 0 : (c - k) / (1 - k);
        } else if (p === 1) {
          channelVal = k >= 1 ? 0 : (m - k) / (1 - k);
        } else if (p === 2) {
          channelVal = k >= 1 ? 0 : (yChan - k) / (1 - k);
        } else {
          channelVal = k;
        }

        channelVal = Math.max(0, Math.min(1, channelVal));

        // 6. Dot radius threshold
        const rDot = Math.sqrt(channelVal) * 0.7071 * dotScale;

        if (dist <= rDot && rDot > 0.02) {
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
