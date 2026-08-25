import {
  RenderContext,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  MediaColorConfig,
  ImageAdjustConfig,
} from '../types/ascii';
import { evaluateParametricWave } from './math';
import { processRasterFrame, toPipelineAdjustments, ProcessedRasterResult } from './rasterEngine';

export const MONOSPACE_CELL_WIDTH = 6.015;
export const MONOSPACE_CELL_HEIGHT = 10.0;
export const MONOSPACE_CELL_ASPECT = MONOSPACE_CELL_WIDTH / MONOSPACE_CELL_HEIGHT; // ~0.6015





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

let trailInfluenceBuffer = new Float32Array(0);
let trailCharAgeBuffer = new Float32Array(0);
let trailCharBuffer: string[] = [];


export interface SynthRenderOptions extends RenderContext {
  colorConfig?: MediaColorConfig;
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
}

let synthRawLumBuffer = new Float32Array(0);


export function renderSynthFrameData(ctx: SynthRenderOptions): ProcessedRasterResult {
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
    adjustConfig,
  } = ctx;

  const totalCells = cols * rows;
  if (synthRawLumBuffer.length !== totalCells) {
    synthRawLumBuffer = new Float32Array(totalCells);
  }

  if (cols <= 0 || rows <= 0) {
    return {
      text: '',
      colors: null,
      luminance: new Float32Array(0),
      cols: 0,
      rows: 0,
      rasterMode,
      bgColor: '#0a0a0a',
      isColored: false,
    };
  }

  const cx = cols / 2;
  const cy = rows / 2;
  const isSquareMode = rasterMode !== 'ascii';
  const aspectRatio = isSquareMode ? 1.0 : (waveParams.aspectRatio || MONOSPACE_CELL_ASPECT);
  const sharedCtx = customContext || {};

  if (prepareFn) {
    try {
      prepareFn(time, cols, rows, sharedCtx);
    } catch {}
  }

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

  // 2. Delegate to Unified 2D Raster Processing Engine
  return processRasterFrame(
    {
      width: cols,
      height: rows,
      rgba: new Uint8ClampedArray(0),
      luminance: synthRawLumBuffer,
      charOverrides: hasTrails ? trailCharBuffer : undefined,
    },
    {
      cols,
      rows,
      density,
      rasterMode,
      ditherAlgorithm: algorithm,
      toneConfig,
      colorConfig: ctx.colorConfig,
      monoTint: ctx.colorConfig?.monoTint,
      ...toPipelineAdjustments(adjustConfig),
    }
  );
}




