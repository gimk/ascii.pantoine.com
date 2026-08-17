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

/**
 * Computes a single full ASCII frame
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

  // Pre-allocate row arrays
  const lines: string[] = new Array(rows);
  const grid: string[][] = new Array(rows);
  const numTrails = trailPoints.length;

  for (let y = 0; y < rows; y++) {
    const rowChars: string[] = new Array(cols);
    const dy = y - cy;

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

      rowChars[x] = density[charIndex] || ' ';
    }
    grid[y] = rowChars;
  }

  // Stamp active trail point characters on top
  if (interactiveInfluence && numTrails > 0) {
    for (let i = 0; i < numTrails; i++) {
      const pt = trailPoints[i];
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        if (Math.random() < pt.age * 0.6) {
          grid[py][px] = pt.char;
        }
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    lines[y] = grid[y].join('');
  }

  return lines.join('\n');
}
