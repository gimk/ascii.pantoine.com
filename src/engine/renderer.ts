import { RenderContext } from '../types/ascii';
import { evaluateParametricWave } from './math';

export const CHARSETS = [
  { id: 'standard', name: 'Classic Density', chars: ' .:-=+*#%@' },
  { id: 'dense', name: 'Dense ASCII', chars: ' .`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' },
  { id: 'blocks', name: 'Shading Blocks', chars: ' ░▒▓█' },
  { id: 'matrix', name: 'Matrix / Binary', chars: ' 010101' },
  { id: 'minimal', name: 'Minimal Dot Ramp', chars: ' .·:oO@' },
  { id: 'math', name: 'Math Operators', chars: ' ·-+=*#%' },
  { id: 'braille', name: 'Braille Pattern', chars: ' ⠁⠃⠇⠗⠷⠿' },
  { id: 'contrast', name: 'High Contrast', chars: '  ..::##@@' },
];

let cachedLines: string[] = [];
let lineBuffer: string[] = [];
let trailInfluenceBuffer = new Float32Array(0);
let trailCharAgeBuffer = new Float32Array(0);
let trailCharBuffer: string[] = [];

/**
 * Computes a single full ASCII frame with zero per-row array allocations
 * and O(W*H + 25N) spatial particle rasterization.
 */
export function renderAsciiFrame(ctx: RenderContext): string {
  const {
    cols,
    rows,
    time,
    density,
    trailPoints,
    waveParams,
    customRenderFn,
    prepareFn,
    customContext,
    interactiveInfluence,
  } = ctx;

  if (cols <= 0 || rows <= 0) return '';

  const cx = cols / 2;
  const cy = rows / 2;
  const aspectRatio = waveParams.aspectRatio || 0.55;
  const radiusSq = 2.5 * 2.5;
  const densityLength = density.length;
  const sharedCtx = customContext || {};
  const totalCells = cols * rows;

  if (prepareFn) {
    try {
      prepareFn(time, cols, rows, sharedCtx);
    } catch {
      // prepare error ignored
    }
  }

  // Ensure line caches match current grid dimensions
  if (cachedLines.length !== rows) {
    cachedLines = new Array(rows);
  }
  if (lineBuffer.length !== cols) {
    lineBuffer = new Array(cols);
  }

  const numTrails = trailPoints.length;
  const hasTrails = interactiveInfluence && numTrails > 0;

  // Filter active fluid wave ripples
  const activeRipples = (ctx.ripples && ctx.ripples.length > 0)
    ? ctx.ripples.filter((r) => {
        const dt = time - r.startTime;
        return dt >= 0 && dt < r.maxAge;
      })
    : [];
  const numRipples = activeRipples.length;
  const hasRipples = numRipples > 0;

  // Spatial Particle Pre-Rasterization Buffer
  if (hasTrails) {
    if (trailInfluenceBuffer.length !== totalCells) {
      trailInfluenceBuffer = new Float32Array(totalCells);
      trailCharAgeBuffer = new Float32Array(totalCells);
      trailCharBuffer = new Array(totalCells).fill('');
    } else {
      trailInfluenceBuffer.fill(0);
      trailCharAgeBuffer.fill(0);
      trailCharBuffer.fill('');
    }

    const boost = ctx.luminanceBoost !== undefined ? ctx.luminanceBoost : 0.5;
    const rx = Math.ceil(2.5 / Math.max(0.1, aspectRatio));
    const ry = 3;

    for (let i = 0; i < numTrails; i++) {
      const pt = trailPoints[i];
      const px = pt.x;
      const py = pt.y;
      const age = pt.age;

      if (age <= 0) continue;

      // 1. Direct character stamp at integer cell coordinate
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      if (ix >= 0 && ix < cols && iy >= 0 && iy < rows && age > 0.05) {
        const cellIdx = iy * cols + ix;
        if (age > trailCharAgeBuffer[cellIdx]) {
          trailCharAgeBuffer[cellIdx] = age;
          trailCharBuffer[cellIdx] = pt.char;
        }
      }

      // 2. Localized bounding box for luminance glow influence
      if (boost > 0) {
        const minX = Math.max(0, Math.floor(px - rx));
        const maxX = Math.min(cols - 1, Math.ceil(px + rx));
        const minY = Math.max(0, Math.floor(py - ry));
        const maxY = Math.min(rows - 1, Math.ceil(py + ry));

        for (let y = minY; y <= maxY; y++) {
          const ady = Math.abs(y - py);
          if (ady >= 2.5) continue;
          const rowOffset = y * cols;

          for (let x = minX; x <= maxX; x++) {
            const adx = Math.abs(x - px) * aspectRatio;
            if (adx >= 2.5) continue;

            const tdistSq = adx * adx + ady * ady;
            if (tdistSq < radiusSq) {
              const inf = (1 - Math.sqrt(tdistSq) / 2.5) * age * boost;
              trailInfluenceBuffer[rowOffset + x] += inf;
            }
          }
        }
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    const dy = y - cy;
    const rowOffset = y * cols;

    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) * aspectRatio;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      let animValue = 0;
      if (customRenderFn) {
        animValue = customRenderFn(x, y, time, dist, dx, dy, cols, rows, angle, sharedCtx);
      } else {
        animValue = evaluateParametricWave(
          x,
          y,
          time,
          dist,
          dx,
          dy,
          cols,
          rows,
          angle,
          waveParams
        );
      }

      // Dynamic Interactive Wave Ripples
      if (hasRipples) {
        for (let r = 0; r < numRipples; r++) {
          const rip = activeRipples[r];
          const dt = time - rip.startTime;
          const decay = 1 - dt / rip.maxAge;
          const ripWaveRadius = dt * rip.speed;
          const rdx = (x - rip.x) * aspectRatio;
          const rdy = y - rip.y;
          const rdist = Math.hypot(rdx, rdy);
          const distDiff = Math.abs(rdist - ripWaveRadius);

          if (distDiff < 10) {
            const envelope = 1 - distDiff / 10;
            animValue += Math.sin((rdist - ripWaveRadius) * rip.frequency) * rip.amplitude * decay * envelope * 0.8;
          }
        }
      }

      // O(1) particle influence lookup from pre-rasterized spatial buffer
      const cellIdx = rowOffset + x;
      const trailInfluence = hasTrails ? trailInfluenceBuffer[cellIdx] : 0;

      // Normalize into [0, 1]
      let normalized = (animValue + 1) * 0.5 + trailInfluence;

      if (waveParams.invert) {
        normalized = 1.0 - normalized;
      }

      // Map to character index
      let charIndex = Math.floor(normalized * densityLength);
      if (charIndex < 0) charIndex = 0;
      else if (charIndex >= densityLength) charIndex = densityLength - 1;

      let cellChar = density[charIndex] || ' ';

      // O(1) character stamp lookup
      if (hasTrails && trailCharBuffer[cellIdx]) {
        cellChar = trailCharBuffer[cellIdx];
      }

      lineBuffer[x] = cellChar;
    }
    cachedLines[y] = lineBuffer.join('');
  }

  return cachedLines.join('\n');
}
