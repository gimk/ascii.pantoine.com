import { RenderContext } from '../types/ascii';
import { evaluateParametricWave } from './math';

/**
 * Density ramps, ordered dark to light.
 *
 * Every glyph must have the same advance width as ASCII in the terminal font
 * stack, otherwise the character grid shears apart. Block Elements, Geometric
 * Shapes and Braille all measure a full cell in JuliaMono and are safe; CJK,
 * emoji and half-width katakana are not. Measure with canvas measureText
 * against 'M' before adding anything outside those ranges.
 */
export const CHARSETS = [
  { id: 'standard', name: 'Classic Density', chars: ' .:-=+*#%@' },
  { id: 'dense', name: 'Dense ASCII', chars: ' .`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' },
  { id: 'blocks', name: 'Shading Blocks', chars: ' ░▒▓█' },
  { id: 'matrix', name: 'Matrix / Binary', chars: ' 010101' },
  { id: 'minimal', name: 'Minimal Dot Ramp', chars: ' .·:oO@' },
  { id: 'math', name: 'Math Operators', chars: ' ·-+=*#%' },
  { id: 'braille', name: 'Braille Pattern', chars: ' ⠁⠃⠇⠗⠷⠿' },
  { id: 'contrast', name: 'High Contrast', chars: '  ..::##@@' },

  // --- Block Elements ---
  // Eighth-block ramps are the smoothest tonal sets available in a monospace
  // grid: nine evenly spaced coverage steps from empty to solid.
  { id: 'blocks-v', name: 'Vertical Fill', chars: ' ▁▂▃▄▅▆▇█' },
  { id: 'blocks-h', name: 'Horizontal Fill', chars: ' ▏▎▍▌▋▊▉█' },
  { id: 'blocks-mixed', name: 'Block Density', chars: ' ·▫□▪■▓█' },

  // --- Symbols ---
  // Ordered by ink coverage, not by codepoint: outlined shapes read lighter
  // than filled ones of the same size.
  { id: 'circles', name: 'Dot Circles', chars: ' .·∘○◉●' },
  { id: 'geometric', name: 'Geometric Phases', chars: ' ·○◔◑◕●' },
  // Stops at U+283F, the densest six-dot cell. U+287F and U+28FF followed it
  // here and were removed: the dot-7 and dot-8 row sits below the 10px line box
  // and overlaps the row beneath, so the ramp gives up its darkest two steps to
  // keep the grid clean.
  { id: 'braille-dense', name: 'Braille Density', chars: ' ⠀⠁⠉⠋⠛⠟⠿' },

  // --- Typographic ---
  { id: 'punct', name: 'Punctuation Ramp', chars: ' .,:;!|Il1+*#' },

  // --- Stylistic (not tonal ramps: sequences chosen for texture, like Matrix) ---
  { id: 'hex', name: 'Hex Rain', chars: ' 0123456789ABCDEF' },
  // Half-width katakana (U+FF66..) was tried here for a Matrix-rain look and
  // removed: JuliaMono advances it at 5px against a 6px ASCII cell, which
  // skews every row that contains one.
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
