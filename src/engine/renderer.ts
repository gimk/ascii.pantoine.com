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

/**
 * Computes a single full ASCII frame with zero per-row array allocations
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

  if (prepareFn) {
    try {
      prepareFn(time, cols, rows, sharedCtx);
    } catch {
      // prepare error ignored
    }
  }

  if (cachedLines.length !== rows) {
    cachedLines = new Array(rows);
  }

  const numTrails = trailPoints.length;

  for (let y = 0; y < rows; y++) {
    const dy = y - cy;
    let rowStr = '';

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

      // Trail proximity luminance boost
      let trailInfluence = 0;
      if (interactiveInfluence && numTrails > 0) {
        const boost = ctx.luminanceBoost !== undefined ? ctx.luminanceBoost : 0.5;
        if (boost > 0) {
          for (let i = 0; i < numTrails; i++) {
            const pt = trailPoints[i];
            const adx = Math.abs(x - pt.x) * aspectRatio;
            const ady = Math.abs(y - pt.y);

            if (adx < 2.5 && ady < 2.5) {
              const tdistSq = adx * adx + ady * ady;
              if (tdistSq < radiusSq) {
                trailInfluence +=
                  (1 - Math.sqrt(tdistSq) / 2.5) * pt.age * boost;
              }
            }
          }
        }
      }

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

      // Stamp active trail point characters deterministically (no 60fps random flickering)
      if (interactiveInfluence && numTrails > 0) {
        let bestChar: string | null = null;
        let maxAge = 0;
        for (let i = 0; i < numTrails; i++) {
          const pt = trailPoints[i];
          if (Math.floor(pt.x) === x && Math.floor(pt.y) === y) {
            if (pt.age > maxAge) {
              maxAge = pt.age;
              bestChar = pt.char;
            }
          }
        }
        if (bestChar && maxAge > 0.05) {
          cellChar = bestChar;
        }
      }

      rowStr += cellChar;
    }
    cachedLines[y] = rowStr;
  }

  return cachedLines.join('\n');
}
