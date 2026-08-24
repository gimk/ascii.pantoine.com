import {
  RenderContext,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
} from '../types/ascii';
import { evaluateParametricWave } from './math';
import { applyDitherAlgorithm } from './ditherAlgorithms';


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
  // Uses strictly 6-dot Braille (up to U+283F) to avoid row-4 dot-7/8 vertical bleed into the row below
  { id: 'braille-dense', name: 'Braille Density', chars: ' ⠁⠂⠄⠃⠉⠅⠇⠋⠍⠏⠛⠟⠷⠿' },

  // --- Quadrants & Micro-Blocks ---
  { id: 'quadrants', name: 'Quadrant Blocks', chars: ' ▖▗▘▝▚▞█' },
  { id: 'box-drawing', name: 'Box & Pipe Matrix', chars: ' ·─│┌┐└┘├┤┬┴┼═║' },

  // --- Typographic ---
  { id: 'punct', name: 'Punctuation Ramp', chars: ' .,:;!|Il1+*#' },

  // --- Stylistic ---
  { id: 'hex', name: 'Hex Rain', chars: ' 0123456789ABCDEF' },
];

/**
 * Maps a 2x4 subpixel binary matrix into an authentic Unicode Braille character (U+2800..U+28FF).
 * subpixels is an array or indexed values of length 8 in order:
 * [ (0,0), (0,1), (0,2), (1,0), (1,1), (1,2), (0,3), (1,3) ]
 */
export function getBrailleCharFromSubpixels(
  d1: boolean, d2: boolean, d3: boolean, d4: boolean,
  d5: boolean, d6: boolean, d7: boolean, d8: boolean
): string {
  let mask = 0;
  if (d1) mask |= 0x01; // Dot 1 (col 0, row 0)
  if (d2) mask |= 0x02; // Dot 2 (col 0, row 1)
  if (d3) mask |= 0x04; // Dot 3 (col 0, row 2)
  if (d4) mask |= 0x08; // Dot 4 (col 1, row 0)
  if (d5) mask |= 0x10; // Dot 5 (col 1, row 1)
  if (d6) mask |= 0x20; // Dot 6 (col 1, row 2)
  if (d7) mask |= 0x40; // Dot 7 (col 0, row 3)
  if (d8) mask |= 0x80; // Dot 8 (col 1, row 3)
  return String.fromCharCode(0x2800 + mask);
}


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

export interface SynthRenderOptions extends RenderContext {
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
}

let synthRawLumBuffer = new Float32Array(0);
let synthDitherBuffer = new Float32Array(0);

export function renderSynthFrameData(ctx: SynthRenderOptions): {
  text: string;
  luminance: Float32Array;
  cols: number;
  rows: number;
} {
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
    rasterMode = 'ascii',
    algorithm = 'none',
    toneConfig,
  } = ctx;

  const totalCells = cols * rows;
  if (synthRawLumBuffer.length !== totalCells) {
    synthRawLumBuffer = new Float32Array(totalCells);
    synthDitherBuffer = new Float32Array(totalCells);
  }

  if (cols <= 0 || rows <= 0) {
    return { text: '', luminance: synthDitherBuffer, cols: 0, rows: 0 };
  }

  const cx = cols / 2;
  const cy = rows / 2;
  const isSquareMode = rasterMode !== 'ascii' && rasterMode !== 'braille';
  const aspectRatio = isSquareMode ? 1.0 : (waveParams.aspectRatio || 0.55);
  const densityLength = density.length;
  const sharedCtx = customContext || {};


  if (prepareFn) {
    try {
      prepareFn(time, cols, rows, sharedCtx);
    } catch {}
  }

  if (cachedLines.length !== rows) cachedLines = new Array(rows);
  if (lineBuffer.length !== cols) lineBuffer = new Array(cols);

  // Particles pre-rasterization
  const numTrails = trailPoints.length;
  const hasTrails = interactiveInfluence && numTrails > 0;
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
    const radiusSq = 2.5 * 2.5;

    for (let i = 0; i < numTrails; i++) {
      const pt = trailPoints[i];
      const px = pt.x;
      const py = pt.y;
      const age = pt.age;
      if (age <= 0) continue;

      const ix = Math.floor(px);
      const iy = Math.floor(py);
      if (ix >= 0 && ix < cols && iy >= 0 && iy < rows && age > 0.05) {
        const cellIdx = iy * cols + ix;
        if (age > trailCharAgeBuffer[cellIdx]) {
          trailCharAgeBuffer[cellIdx] = age;
          trailCharBuffer[cellIdx] = pt.char;
        }
      }

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

  // 1. Calculate raw luminance values across the grid
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

      const cellIdx = rowOffset + x;
      const trailInfluence = hasTrails ? trailInfluenceBuffer[cellIdx] : 0;
      let normalized = (animValue + 1) * 0.5 + trailInfluence;
      if (waveParams.invert) {
        normalized = 1.0 - normalized;
      }
      synthRawLumBuffer[cellIdx] = Math.max(0, Math.min(1, normalized));
    }
  }

  // 2. Apply Tone Mapping (Levels & Posterization)
  const inBlack = Math.max(0, Math.min(0.95, (toneConfig?.levelsBlack ?? 0) / 100.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, (toneConfig?.levelsWhite ?? 100) / 100.0));
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, (toneConfig?.levelsMidtones ?? 50) / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));
  const posterizeBits = toneConfig?.posterizeBits || 0;

  for (let i = 0; i < totalCells; i++) {
    let val = synthRawLumBuffer[i];
    val = Math.max(0, Math.min(1, (val - inBlack) / (inWhite - inBlack)));
    if (levelsGamma !== 1.0 && val > 0 && val < 1) val = Math.pow(val, 1 / levelsGamma);
    if (posterizeBits > 0) {
      const steps = Math.pow(2, posterizeBits) - 1;
      val = Math.round(val * steps) / steps;
    }
    synthRawLumBuffer[i] = Math.max(0, Math.min(1, val));
  }

  // 3. Apply 40+ Dithering Algorithm
  const ditherLevels = (rasterMode === 'pixel') ? 2 : densityLength;
  applyDitherAlgorithm(synthRawLumBuffer, synthDitherBuffer, cols, rows, algorithm, ditherLevels, 1.0);

  // 4. Output Modality Glyph Generation
  if (rasterMode === 'braille') {
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const sampleSub = (subX: number, subY: number): boolean => {
          const px = x + (subX ? 0.65 : 0.35);
          const py = y + (subY * 0.25 + 0.125);
          const dx = (px - cx) * aspectRatio;
          const dy = py - cy;
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          let val = 0;
          if (customRenderFn) {
            val = customRenderFn(px, py, time, dist, dx, dy, cols, rows, angle, sharedCtx);
          } else {
            val = evaluateParametricWave(px, py, time, dist, dx, dy, cols, rows, angle, waveParams);
          }
          let norm = (val + 1) * 0.5;
          if (waveParams.invert) norm = 1 - norm;
          return norm >= 0.5;
        };

        const d1 = sampleSub(0, 0);
        const d2 = sampleSub(0, 1);
        const d3 = sampleSub(0, 2);
        const d4 = sampleSub(1, 0);
        const d5 = sampleSub(1, 1);
        const d6 = sampleSub(1, 2);
        const d7 = sampleSub(0, 3);
        const d8 = sampleSub(1, 3);

        let cellChar = getBrailleCharFromSubpixels(d1, d2, d3, d4, d5, d6, d7, d8);
        if (hasTrails && trailCharBuffer[rowOffset + x]) {
          cellChar = trailCharBuffer[rowOffset + x];
        }
        lineBuffer[x] = cellChar;
      }
      cachedLines[y] = lineBuffer.join('');
    }
  } else {
    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const cellIdx = rowOffset + x;
        const finalLum = synthDitherBuffer[cellIdx];
        let charIndex = Math.floor(finalLum * densityLength);
        if (charIndex < 0) charIndex = 0;
        else if (charIndex >= densityLength) charIndex = densityLength - 1;

        let cellChar = density[charIndex] || ' ';
        if (hasTrails && trailCharBuffer[cellIdx]) {
          cellChar = trailCharBuffer[cellIdx];
        }
        lineBuffer[x] = cellChar;
      }
      cachedLines[y] = lineBuffer.join('');
    }
  }

  return {
    text: cachedLines.join('\n'),
    luminance: synthDitherBuffer,
    cols,
    rows,
  };
}


