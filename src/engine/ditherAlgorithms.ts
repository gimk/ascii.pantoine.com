import { DitherAlgorithm, DitherFamily, DitherParams } from '../types/ascii';

export type DitherPatternType =
  | 'diffusion'
  | 'bayer'
  | 'halftone'
  | 'stochastic'
  | 'fractal'
  | 'wave'
  | 'glitch'
  | 'circuit'
  | 'lines';

export interface DitherAlgorithmMeta {
  id: DitherAlgorithm;
  name: string;
  family: DitherFamily;
  description: string;
  badge?: string;
  tags?: string[];
  patternType?: DitherPatternType;
  highlight?: boolean;
}

export const DITHER_ALGORITHMS: DitherAlgorithmMeta[] = [
  // --- Error Diffusion (13) ---
  { id: 'none', name: 'Threshold (None)', family: 'error-diffusion', description: 'Direct quantization without error diffusion', badge: 'Hard 1-Bit', tags: ['Quantize', 'Crisp'], patternType: 'diffusion' },
  { id: 'floyd-steinberg', name: 'Floyd-Steinberg', family: 'error-diffusion', description: 'Classic 4-neighbor balanced error diffusion (1976)', badge: 'Classic 1976', tags: ['Balanced', 'Smooth', 'Standard'], patternType: 'diffusion', highlight: true },
  { id: 'false-floyd-steinberg', name: 'False Floyd-Steinberg', family: 'error-diffusion', description: 'Compact 2-neighbor rapid diffusion with crisp lines', badge: 'Fast 2-Tap', tags: ['Fast', 'Crisp'], patternType: 'diffusion' },
  { id: 'atkinson', name: 'Atkinson (MacPaint)', family: 'error-diffusion', description: 'Bill Atkinson 1984 8-neighbor diffusion, preserves clean highlights', badge: 'Mac 1984', tags: ['Macintosh', 'High-Contrast', 'Clean'], patternType: 'diffusion', highlight: true },
  { id: 'sierra-3', name: 'Sierra 3-Line', family: 'error-diffusion', description: 'Frankie Sierra 3-row diffusion with smooth gradients', badge: 'Sierra 3-Row', tags: ['Photo', 'Soft', 'Gradient'], patternType: 'diffusion' },
  { id: 'sierra-2', name: 'Two-Row Sierra', family: 'error-diffusion', description: 'Fast 2-row Sierra diffusion with balanced distribution', badge: 'Sierra 2-Row', tags: ['Fast', 'Balanced'], patternType: 'diffusion' },
  { id: 'sierra-lite', name: 'Sierra Lite (2-4A)', family: 'error-diffusion', description: 'Lightweight 3-neighbor Sierra variant', badge: 'Sierra Lite', tags: ['Light', 'Fast'], patternType: 'diffusion' },
  { id: 'stucki', name: 'Stucki Matrix', family: 'error-diffusion', description: 'Peter Stucki 1981 sharp, high-contrast 12-neighbor matrix', badge: 'Sharp 1981', tags: ['High-Contrast', 'Crisp', 'Print'], patternType: 'diffusion', highlight: true },
  { id: 'jjn', name: 'Jarvis-Judice-Ninke', family: 'error-diffusion', description: '12-neighbor wide diffusion for soft photographic gradations', badge: 'JJN Photo', tags: ['Photographic', 'Ultra-Soft', 'Wide'], patternType: 'diffusion', highlight: true },
  { id: 'burkes', name: 'Burkes', family: 'error-diffusion', description: 'Daniel Burkes 7-neighbor clean horizontal diffusion', badge: 'Burkes 1988', tags: ['Horizontal', 'Clean'], patternType: 'diffusion' },
  { id: 'fan', name: 'Fan Dither (9-Neighbor)', family: 'error-diffusion', description: 'Zhigang Fan adaptive error diffusion', badge: 'Adaptive 9-Tap', tags: ['Adaptive', 'Smooth'], patternType: 'diffusion' },
  { id: 'shiau-fan', name: 'Shiau-Fan', family: 'error-diffusion', description: 'Modified edge-preserving error diffusion', badge: 'Edge Aware', tags: ['Edge-Preserving', 'Photo'], patternType: 'diffusion' },
  { id: 'ostromoukhov', name: 'Ostromoukhov', family: 'error-diffusion', description: 'Variable-coefficient diffusion preventing worm artifacts', badge: 'Anti-Worm', tags: ['Variable', 'No-Artifacts', 'Modern'], patternType: 'diffusion', highlight: true },

  // --- Ordered & Clustered Matrices (13) ---
  { id: 'bayer-2x2', name: 'Bayer 2×2 (Coarse)', family: 'ordered', description: '4-level coarse ordered dithering matrix', badge: 'Coarse 2×2', tags: ['Retro', 'Low-Res'], patternType: 'bayer' },
  { id: 'bayer-4x4', name: 'Bayer 4×4 (Classic)', family: 'ordered', description: '16-level classic ordered matrix', badge: 'GameBoy 4×4', tags: ['Classic', '16-Level', 'Retro'], patternType: 'bayer', highlight: true },
  { id: 'bayer-8x8', name: 'Bayer 8×8 (Smooth)', family: 'ordered', description: '64-level high-fidelity ordered matrix', badge: 'Smooth 8×8', tags: ['64-Level', 'Smooth', 'Matrix'], patternType: 'bayer', highlight: true },
  { id: 'bayer-16x16', name: 'Bayer 16×16 (Ultra)', family: 'ordered', description: '256-level ultra-smooth continuous matrix', badge: 'Ultra 16×16', tags: ['256-Level', 'Continuous'], patternType: 'bayer' },
  { id: 'cluster-4x4', name: 'Clustered Dot 4×4', family: 'ordered', description: 'Halftone dot cluster ordered matrix', badge: 'Cluster 4×4', tags: ['Halftone', 'Dot'], patternType: 'halftone' },
  { id: 'cluster-8x8', name: 'Clustered Dot 8×8', family: 'ordered', description: 'Smooth circular halftone dot cluster', badge: 'Cluster 8×8', tags: ['Halftone', 'Circular'], patternType: 'halftone' },
  { id: 'halftone-dot', name: 'Halftone Dot Screen', family: 'ordered', description: 'Newsprint-style clustered dot halftone screen', badge: 'Newsprint', tags: ['Halftone', 'Print', 'Comic'], patternType: 'halftone', highlight: true },
  { id: 'diagonal-4x4', name: 'Diagonal Lines 4×4', family: 'ordered', description: '45° etched diagonal line screen', badge: 'Diagonal 45°', tags: ['Etched', 'Line Art'], patternType: 'lines', highlight: true },
  { id: 'diagonal-8x8', name: 'Diagonal Lines 8×8', family: 'ordered', description: 'Fine 45° engraving line dither', badge: 'Fine Engrave', tags: ['Engraving', 'Fine Lines'], patternType: 'lines' },
  { id: 'horizontal-lines', name: 'Horizontal Lines', family: 'ordered', description: 'Linear horizontal raster matrix', badge: 'Scanlines H', tags: ['CRT', 'Raster Lines'], patternType: 'lines' },
  { id: 'vertical-lines', name: 'Vertical Lines', family: 'ordered', description: 'Linear vertical stripe matrix', badge: 'Stripes V', tags: ['Pinstripe', 'Lines'], patternType: 'lines' },
  { id: 'crosshatch-8x8', name: 'Crosshatch 8×8', family: 'ordered', description: 'Intersecting mesh cross-screen matrix', badge: 'Crosshatch', tags: ['Engraving', 'Mesh', 'Ink'], patternType: 'lines', highlight: true },
  { id: 'spiral-dot', name: 'Spiral Dot Matrix', family: 'ordered', description: 'Concentric circular ordered dither', badge: 'Spiral Dot', tags: ['Concentric', 'Organic'], patternType: 'halftone' },

  // --- Blue Noise & Stochastic (5) ---
  { id: 'blue-noise', name: 'Blue Noise (High-Freq)', family: 'blue-noise', description: 'Pre-computed high-frequency blue noise, organic stipple', badge: 'Organic Stipple', tags: ['High-Frequency', 'Organic', 'Stipple'], patternType: 'stochastic', highlight: true },
  { id: 'void-cluster', name: 'Void-and-Cluster', family: 'blue-noise', description: 'Ulichney void-and-cluster blue noise distribution', badge: 'Void-Cluster', tags: ['Smooth', 'Dispersed', 'Optimal'], patternType: 'stochastic', highlight: true },
  { id: 'white-noise', name: 'White Noise (Random)', family: 'blue-noise', description: 'Uniform stochastic random noise grain', badge: 'Random Noise', tags: ['Grain', 'Uniform', 'Raw'], patternType: 'stochastic' },
  { id: 'gaussian-noise', name: 'Gaussian Film Grain', family: 'blue-noise', description: 'Normal-distribution photographic film grain', badge: '35mm Film', tags: ['Photographic', 'Analog', 'Film Grain'], patternType: 'stochastic', highlight: true },
  { id: 'interleaved-gradient', name: 'Interleaved Gradient Noise', family: 'blue-noise', description: 'Low-discrepancy temporal gradient noise', badge: 'IGN Shader', tags: ['Low-Discrepancy', 'Temporal'], patternType: 'stochastic' },

  // --- Algorithmic & Space-Filling (4) ---
  { id: 'dot-diffusion', name: 'Knuth Dot Diffusion', family: 'algorithmic', description: 'Donald Knuth space-filling tile diffusion', badge: 'Knuth 1987', tags: ['Space-Filling', 'Tiling', 'Math'], patternType: 'fractal', highlight: true },
  { id: 'hilbert', name: 'Hilbert Fractal Curve', family: 'algorithmic', description: '1D error diffusion along 2D Hilbert space-filling curve', badge: 'Hilbert Curve', tags: ['Fractal', 'Space-Filling', 'Math'], patternType: 'fractal', highlight: true },
  { id: 'peano', name: 'Peano Curve', family: 'algorithmic', description: 'Continuous space-filling fractal curve scan', badge: 'Peano Fractal', tags: ['Fractal', 'Continuous', 'Geometric'], patternType: 'fractal', highlight: true },
  { id: 'r-sequence', name: 'R-Sequence Quasi-Random', family: 'algorithmic', description: 'Low-discrepancy 2D metallic ratio quasi-random sequence', badge: 'Metallic Ratio', tags: ['Quasi-Random', 'Metallic', 'Math'], patternType: 'fractal', highlight: true },

  // --- Modulation & Generative (9) ---
  { id: 'fm-modulation', name: 'Frequency Modulation (FM)', family: 'modulation', description: 'Carrier wave frequency modulation synthesizing topographic contours', badge: 'FM Carrier', tags: ['Topographic', 'Wave', 'Synth'], patternType: 'wave', highlight: true },
  { id: 'phase-modulation', name: 'Phase Modulation (PM)', family: 'modulation', description: 'Multi-frequency phase distortion and contour interference', badge: 'PM Distortion', tags: ['Phase', 'Interference', 'Harmonic'], patternType: 'wave' },
  { id: 'bytewave', name: 'ByteWave Bitwise', family: 'modulation', description: 'Low-level arithmetic bitwise boolean raster dither', badge: 'Bitwise Demo', tags: ['Low-Level', 'Boolean', 'Cyber'], patternType: 'glitch', highlight: true },
  { id: 'concentric-rings', name: 'Concentric Rings', family: 'modulation', description: 'Harmonic radial wave ripples and interference rings', badge: 'Radial Ripple', tags: ['Radar', 'Concentric', 'Wave'], patternType: 'wave', highlight: true },
  { id: 'cellular-circuit', name: 'Cellular Circuit', family: 'modulation', description: 'Discrete cell trace network dither', badge: 'PCB Circuit', tags: ['Cellular', 'Tech', 'Network'], patternType: 'circuit', highlight: true },
  { id: 'scanline-shift', name: 'Scanline Phase Shift', family: 'modulation', description: 'Alternating interlaced line phase dither', badge: 'Interlace CRT', tags: ['Scanline', 'CRT', 'Analog'], patternType: 'lines' },
  { id: 'sine-drift', name: 'Analog Sine Drift', family: 'modulation', description: 'CRT analog sinusoidal drift modulation', badge: 'Analog Sine', tags: ['CRT Drift', 'Wavy', 'Warp'], patternType: 'wave' },
  { id: 'glitch-displacement', name: 'Glitch Pixel Tear', family: 'modulation', description: 'Horizontal raster displacement jitter', badge: 'Cyberpunk Tear', tags: ['Glitch', 'Tear', 'Jitter'], patternType: 'glitch', highlight: true },
  { id: 'threshold-mod', name: 'Dynamic Threshold Mod', family: 'modulation', description: 'Non-linear luminance-dependent thresholding', badge: 'Dynamic Mod', tags: ['Non-Linear', 'Contrast'], patternType: 'wave' },
];

export function getRandomAlgorithm(family?: DitherFamily | 'all', currentId?: DitherAlgorithm): DitherAlgorithmMeta {
  const pool = !family || family === 'all'
    ? DITHER_ALGORITHMS
    : DITHER_ALGORITHMS.filter((a) => a.family === family);
  
  if (pool.length === 0) return DITHER_ALGORITHMS[0];
  if (pool.length === 1) return pool[0];

  const candidatePool = currentId ? pool.filter((a) => a.id !== currentId) : pool;
  const list = candidatePool.length > 0 ? candidatePool : pool;
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
}

export const DITHER_FAMILY_LABELS: Record<DitherFamily, string> = {
  'error-diffusion': 'Error Diffusion',
  ordered: 'Ordered & Clustered',
  'blue-noise': 'Blue Noise & Stochastic',
  algorithmic: 'Algorithmic & Space-Filling',
  modulation: 'Modulation & Generative',
};

export interface DitherAlgorithmGroup {
  family: DitherFamily;
  label: string;
  algorithms: DitherAlgorithmMeta[];
}

/**
 * Groups the algorithm registry by family, preserving registry order both for
 * the families themselves and for the algorithms inside each family.
 */
export function getDitherAlgorithmGroups(): DitherAlgorithmGroup[] {
  const groups: DitherAlgorithmGroup[] = [];
  const byFamily = new Map<DitherFamily, DitherAlgorithmGroup>();

  for (const algorithm of DITHER_ALGORITHMS) {
    let group = byFamily.get(algorithm.family);
    if (!group) {
      group = {
        family: algorithm.family,
        label: DITHER_FAMILY_LABELS[algorithm.family],
        algorithms: [],
      };
      byFamily.set(algorithm.family, group);
      groups.push(group);
    }
    group.algorithms.push(algorithm);
  }

  return groups;
}

// --- Ordered Matrices ---
export const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

export const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/**
 * Recursive Bayer construction: the parent matrix is scaled by 4 and tiled into
 * the four quadrants with offsets 0 / 2 / 3 / 1 — the same doubling that takes
 * the 2×2 to the 4×4 and the 4×4 to the 8×8 above.
 *
 * 'bayer-16x16' used to be a registry entry that ran BAYER_8X8, so the
 * "256-level ultra-smooth" option was byte-identical to the 64-level one.
 */
function buildBayerMatrix(source: number[][]): number[][] {
  const n = source.length;
  const out: number[][] = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const base = source[y][x] * 4;
      out[y][x] = base;
      out[y][x + n] = base + 2;
      out[y + n][x] = base + 3;
      out[y + n][x + n] = base + 1;
    }
  }
  return out;
}

export const BAYER_16X16 = buildBayerMatrix(BAYER_8X8);

// Clustered Dot 4x4 (halftone cluster)
export const CLUSTER_4X4 = [
  [12, 5, 6, 13],
  [4, 0, 1, 7],
  [11, 3, 2, 8],
  [15, 10, 9, 14],
];

// Clustered Dot 8x8 (smooth halftone cluster)
export const CLUSTER_8X8 = [
  [24, 10, 12, 26, 35, 47, 49, 37],
  [8, 0, 2, 14, 45, 59, 61, 51],
  [6, 4, 16, 28, 43, 57, 63, 53],
  [22, 18, 20, 30, 33, 41, 55, 39],
  [34, 46, 48, 36, 25, 11, 13, 27],
  [44, 58, 60, 50, 9, 1, 3, 15],
  [42, 56, 62, 52, 7, 5, 17, 29],
  [32, 40, 54, 38, 23, 19, 21, 31],
];

// Diagonal Lines 4x4
export const DIAGONAL_4X4 = [
  [0, 4, 8, 12],
  [12, 0, 4, 8],
  [8, 12, 0, 4],
  [4, 8, 12, 0],
];

// Diagonal Lines 8x8
export const DIAGONAL_8X8 = [
  [0, 8, 16, 24, 32, 40, 48, 56],
  [56, 0, 8, 16, 24, 32, 40, 48],
  [48, 56, 0, 8, 16, 24, 32, 40],
  [40, 48, 56, 0, 8, 16, 24, 32],
  [32, 40, 48, 56, 0, 8, 16, 24],
  [24, 32, 40, 48, 56, 0, 8, 16],
  [16, 24, 32, 40, 48, 56, 0, 8],
  [8, 16, 24, 32, 40, 48, 56, 0],
];

// Crosshatch 8x8
export const CROSSHATCH_8X8 = [
  [0, 32, 16, 48, 4, 36, 20, 52],
  [48, 16, 32, 0, 52, 20, 36, 4],
  [12, 44, 28, 60, 8, 40, 24, 56],
  [60, 28, 44, 12, 56, 24, 40, 8],
  [3, 35, 19, 51, 7, 39, 23, 55],
  [51, 19, 35, 3, 55, 23, 39, 7],
  [15, 47, 31, 63, 11, 43, 27, 59],
  [63, 31, 47, 15, 59, 27, 43, 11],
];

/**
 * Concentric spiral rank: cells ordered by their radius from the tile centre
 * with one turn's worth of angular progression folded in, then numbered 0..n-1.
 *
 * The hand-written matrix this replaces was not a permutation of 0..63 — 3, 4
 * and 11 each appeared twice while 28, 29 and 56 were missing — so the tile
 * repeated some thresholds and skipped others, which showed as seams along
 * every tile boundary. Ranking the cells keeps it well-formed by construction.
 */
function buildSpiralMask(size: number): number[][] {
  const centre = (size - 1) / 2;
  const cells: { x: number; y: number; key: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre;
      const dy = y - centre;
      // atan2 normalized to -0.5..0.5, so one full turn advances one ring.
      const angle = Math.atan2(dy, dx) / (Math.PI * 2);
      cells.push({ x, y, key: Math.hypot(dx, dy) + angle });
    }
  }
  cells.sort((a, b) => a.key - b.key || a.y - b.y || a.x - b.x);

  const out: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  cells.forEach((cell, rank) => {
    out[cell.y][cell.x] = rank;
  });
  return out;
}

export const SPIRAL_DOT_8X8 = buildSpiralMask(8);

/**
 * Concentric cell rank: one ring per tile, numbered outward from the tile's
 * centre cell.
 *
 * 'cellular-circuit' used to threshold on the raw cone `hypot(cx, cy) / 4 −
 * 0.5` over cx, cy ∈ [−4, 3]. Centring a cone on its range rather than its
 * mean does not centre it at all — a tile holds far more cells far from the
 * centre than near it — and the skew was worth +0.094 of tone, a third of the
 * way up a mid-grey image. Ranking the cells gives the uniform threshold
 * distribution every other mask here has, and keeps the per-cell ring look
 * that names the algorithm.
 */
function buildRadialCellMask(size: number): number[][] {
  // Centre on an exact cell rather than between four, so each tile has one
  // unambiguous innermost dot.
  const centre = Math.floor(size / 2);
  const cells: { x: number; y: number; key: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells.push({ x, y, key: Math.hypot(x - centre, y - centre) });
    }
  }
  cells.sort((a, b) => a.key - b.key || a.y - b.y || a.x - b.x);

  const out: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  cells.forEach((cell, rank) => {
    out[cell.y][cell.x] = rank;
  });
  return out;
}

export const RADIAL_CELL_8X8 = buildRadialCellMask(8);

/*
 * Knuth dot diffusion class matrix.
 *
 * Three cells were mistranscribed. The top-left quadrant read 64 / 60 / 44
 * where the quadrant mirror (top-left = 62 − bottom-left) requires 60 / 44 /
 * 36, and the bottom-right quadrant read 53 / 45 where its own mirror
 * (bottom-right = 64 − top-right) requires 45 / 37. The result held a 64, which
 * overflowed the /64 normalization, plus a duplicated 53 and two missing
 * values. Both mirrors are pinned by the 61 uncorrupted cells, so the repair is
 * determined rather than guessed.
 *
 * Still consumed as a plain ordered mask, not as Knuth's dot diffusion proper.
 */
export const KNUTH_DOT_DIFFUSION_8X8 = [
  [34, 48, 40, 32, 29, 15, 23, 31],
  [42, 58, 56, 50, 21, 5, 7, 13],
  [46, 62, 60, 52, 17, 1, 3, 11],
  [38, 54, 44, 36, 25, 9, 19, 27],
  [28, 14, 22, 30, 35, 49, 41, 33],
  [20, 4, 6, 12, 43, 59, 57, 51],
  [16, 0, 2, 10, 47, 63, 61, 53],
  [24, 8, 18, 26, 39, 55, 45, 37],
];

// Blue Noise 16x16 Pre-computed Texture
export const BLUE_NOISE_16X16 = new Float32Array([
  0.0039, 0.5059, 0.1294, 0.6275, 0.0353, 0.5373, 0.1608, 0.6588, 0.0118, 0.5137, 0.1373, 0.6353, 0.0431, 0.5451, 0.1686, 0.6667,
  0.7529, 0.2549, 0.8784, 0.3765, 0.7843, 0.2863, 0.9098, 0.4078, 0.7608, 0.2627, 0.8863, 0.3843, 0.7922, 0.2941, 0.9176, 0.4157,
  0.1922, 0.6902, 0.0667, 0.5686, 0.2235, 0.7216, 0.0980, 0.6000, 0.2000, 0.6980, 0.0745, 0.5765, 0.2314, 0.7294, 0.1059, 0.6078,
  0.9412, 0.4392, 0.8157, 0.3176, 0.9725, 0.4706, 0.8471, 0.3490, 0.9490, 0.4471, 0.8235, 0.3255, 0.9804, 0.4784, 0.8549, 0.3569,
  0.0510, 0.5529, 0.1765, 0.6745, 0.0196, 0.5216, 0.1451, 0.6431, 0.0588, 0.5608, 0.1843, 0.6824, 0.0275, 0.5294, 0.1529, 0.6510,
  0.8000, 0.3020, 0.9255, 0.4235, 0.7686, 0.2706, 0.8941, 0.3922, 0.8078, 0.3098, 0.9333, 0.4314, 0.7765, 0.2784, 0.9020, 0.4000,
  0.2392, 0.7373, 0.1137, 0.6157, 0.2078, 0.7059, 0.0824, 0.5843, 0.2471, 0.7451, 0.1216, 0.6235, 0.2157, 0.7137, 0.0902, 0.5922,
  0.9882, 0.4863, 0.8627, 0.3647, 0.9569, 0.4549, 0.8314, 0.3333, 0.9961, 0.4941, 0.8706, 0.3725, 0.9647, 0.4627, 0.8392, 0.3412,
  0.0157, 0.5176, 0.1412, 0.6392, 0.0471, 0.5490, 0.1725, 0.6706, 0.0078, 0.5098, 0.1333, 0.6314, 0.0392, 0.5412, 0.1647, 0.6627,
  0.7647, 0.2667, 0.8902, 0.3882, 0.7961, 0.2980, 0.9216, 0.4196, 0.7569, 0.2588, 0.8824, 0.3804, 0.7882, 0.2902, 0.9137, 0.4118,
  0.2039, 0.7020, 0.0784, 0.5804, 0.2353, 0.7333, 0.1098, 0.6118, 0.1961, 0.6941, 0.0706, 0.5725, 0.2275, 0.7255, 0.1020, 0.6039,
  0.9529, 0.4510, 0.8275, 0.3294, 0.9843, 0.4824, 0.8588, 0.3608, 0.9451, 0.4431, 0.8196, 0.3216, 0.9765, 0.4745, 0.8510, 0.3529,
  0.0627, 0.5647, 0.1882, 0.6863, 0.0314, 0.5333, 0.1569, 0.6549, 0.0549, 0.5569, 0.1804, 0.6784, 0.0235, 0.5255, 0.1490, 0.6471,
  0.8118, 0.3137, 0.9373, 0.4353, 0.7804, 0.2824, 0.9059, 0.4039, 0.8039, 0.3059, 0.9294, 0.4275, 0.7725, 0.2745, 0.8980, 0.3961,
  0.2510, 0.7490, 0.1255, 0.6275, 0.2196, 0.7176, 0.0941, 0.5961, 0.2431, 0.7412, 0.1176, 0.6196, 0.2118, 0.7098, 0.0863, 0.5882,
  1.0000, 0.4980, 0.8745, 0.3765, 0.9686, 0.4667, 0.8431, 0.3451, 0.9922, 0.4902, 0.8667, 0.3686, 0.9608, 0.4588, 0.8353, 0.3373,
]);

/**
 * A tiling threshold mask, normalized to offsets in [−0.5, +0.5] with a mean of
 * zero.
 *
 * Every ordered matrix used to be normalized inline against a hardcoded
 * divisor — `BAYER_4X4[y][x] / 16.0 - 0.5`. A 0..15 matrix over 16 has a mean
 * of 0.469, not 0.5, so each mask carried a systematic half-step tone bias. The
 * line screens were worse: DIAGONAL_4X4 holds 0..12 over 16, a bias of −0.125
 * of a step, visible as a global darkening the moment you picked it.
 *
 * Normalizing against the matrix's own range instead of an assumed one makes
 * every mask mean-zero, and lets a matrix use whatever value spacing suits its
 * pattern without having to also span exactly 0..n².
 */
export interface DitherMask {
  width: number;
  height: number;
  /** Row-major threshold offsets in [−0.5, +0.5]. */
  offsets: Float32Array;
}

const maskCache = new WeakMap<number[][], DitherMask>();

export function toDitherMask(matrix: number[][]): DitherMask {
  const cached = maskCache.get(matrix);
  if (cached) return cached;

  const height = matrix.length;
  const width = matrix[0].length;

  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix) {
    for (const value of row) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  /*
   * span is the value range plus one, and each cell sits half a step inside it,
   * so the lowest cell lands just above −0.5 and the highest just below +0.5
   * rather than one of them sitting exactly on the boundary.
   */
  const span = max - min + 1;
  const offsets = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      offsets[y * width + x] = (matrix[y][x] - min + 0.5) / span - 0.5;
    }
  }

  const mask: DitherMask = { width, height, offsets };
  maskCache.set(matrix, mask);
  return mask;
}

/**
 * Wraps a pre-computed [0, 1] noise texture as a mask, centred on the
 * texture's own mean rather than on a nominal 0.5 — BLUE_NOISE_16X16 averages
 * 0.502, so assuming 0.5 left a small standing tone offset.
 */
const textureMaskCache = new WeakMap<Float32Array, DitherMask>();

export function toTextureMask(texture: Float32Array, width: number): DitherMask {
  const cached = textureMaskCache.get(texture);
  if (cached) return cached;

  let sum = 0;
  for (let i = 0; i < texture.length; i++) sum += texture[i];
  const mean = sum / texture.length;

  const offsets = new Float32Array(texture.length);
  for (let i = 0; i < texture.length; i++) offsets[i] = texture[i] - mean;

  const mask: DitherMask = { width, height: texture.length / width, offsets };
  textureMaskCache.set(texture, mask);
  return mask;
}

/**
 * Every algorithm that is just "add a tiling threshold mask, then quantize".
 * Two ids still share a matrix — 'halftone-dot' with 'cluster-8x8' — which is a
 * de-duplication job rather than a normalization one.
 */
const ORDERED_MASK_SOURCES: Partial<Record<DitherAlgorithm, number[][]>> = {
  'bayer-2x2': BAYER_2X2,
  'bayer-4x4': BAYER_4X4,
  'bayer-8x8': BAYER_8X8,
  'bayer-16x16': BAYER_16X16,
  'cluster-4x4': CLUSTER_4X4,
  'cluster-8x8': CLUSTER_8X8,
  'halftone-dot': CLUSTER_8X8,
  'diagonal-4x4': DIAGONAL_4X4,
  'diagonal-8x8': DIAGONAL_8X8,
  'crosshatch-8x8': CROSSHATCH_8X8,
  'spiral-dot': SPIRAL_DOT_8X8,
  'dot-diffusion': KNUTH_DOT_DIFFUSION_8X8,
  'cellular-circuit': RADIAL_CELL_8X8,
};

interface DiffusionKernel {
  /** Sum of the weights; each tap receives `weight / divisor` of the error. */
  divisor: number;
  /** [dx, dy, weight] triples. dx is mirrored on right-to-left rows. */
  taps: ReadonlyArray<readonly [number, number, number]>;
}

/**
 * The error-diffusion family as data rather than twelve near-identical loops.
 *
 * Reading them side by side is also the only way to see how little separates
 * some of them: 'fan' and 'shiau-fan' carry the same coefficients, and
 * 'ostromoukhov' is a fixed kernel even though the algorithm it is named for
 * varies its coefficients per tone. Both are de-duplication work, not
 * normalization, so they stay as they are here.
 */
const DIFFUSION_KERNELS: Partial<Record<DitherAlgorithm, DiffusionKernel>> = {
  'floyd-steinberg': { divisor: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  'false-floyd-steinberg': { divisor: 8, taps: [[1, 0, 3], [0, 1, 3], [1, 1, 2]] },
  atkinson: { divisor: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  'sierra-3': {
    divisor: 32,
    taps: [
      [1, 0, 5], [2, 0, 3],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2],
    ],
  },
  'sierra-2': {
    divisor: 16,
    taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]],
  },
  'sierra-lite': { divisor: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
  stucki: {
    divisor: 42,
    taps: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
    ],
  },
  jjn: {
    divisor: 48,
    taps: [
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
    ],
  },
  burkes: {
    divisor: 32,
    taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]],
  },
  fan: { divisor: 16, taps: [[1, 0, 7], [-2, 1, 1], [-1, 1, 3], [0, 1, 5]] },
  'shiau-fan': { divisor: 16, taps: [[1, 0, 7], [-2, 1, 1], [-1, 1, 3], [0, 1, 5]] },
  ostromoukhov: { divisor: 28, taps: [[1, 0, 13], [-1, 1, 5], [0, 1, 10]] },
};


/**
 * A kernel in the form the hot loop wants: parallel typed arrays instead of an
 * array of tuples, weights pre-divided by the divisor, and the reach needed to
 * know when bounds checks can be skipped.
 *
 * The tap tuples above are the readable form and stay the source of truth; this
 * is derived from them once per kernel. Reading `taps[t][2]` per tap per cell
 * chases a pointer for every one of Stucki's twelve taps, which measured at
 * three times the cost of the twelve inline adds it replaced.
 */
interface CompiledKernel {
  dx: Int8Array;
  dy: Int8Array;
  /**
   * Weight divided by the kernel divisor, so the inner loop only multiplies.
   *
   * Float64 rather than Float32: Ostromoukhov's divisor is 28, and rounding
   * 13/28 to single precision moved 0.8% of cells versus computing
   * (err * 13) / 28 in double, because error diffusion carries the difference
   * into its neighbours instead of dropping it.
   */
  weight: Float64Array;
  /** Widest horizontal reach; a cell this far from either edge needs no x check. */
  reach: number;
  /** Deepest row reach; a row this far from the bottom needs no y check. */
  depth: number;
}

const compiledKernels = new Map<DitherAlgorithm, CompiledKernel>();

function compileKernel(algorithm: DitherAlgorithm, kernel: DiffusionKernel): CompiledKernel {
  const cached = compiledKernels.get(algorithm);
  if (cached) return cached;

  const n = kernel.taps.length;
  const compiled: CompiledKernel = {
    dx: new Int8Array(n),
    dy: new Int8Array(n),
    weight: new Float64Array(n),
    reach: 0,
    depth: 0,
  };

  for (let t = 0; t < n; t++) {
    const [dx, dy, weight] = kernel.taps[t];
    compiled.dx[t] = dx;
    compiled.dy[t] = dy;
    compiled.weight[t] = weight / kernel.divisor;
    compiled.reach = Math.max(compiled.reach, Math.abs(dx));
    compiled.depth = Math.max(compiled.depth, dy);
  }

  compiledKernels.set(algorithm, compiled);
  return compiled;
}

/*
 * Scratch buffers, reused across calls.
 *
 * rasterEngine calls this once per frame, so a `new Int32Array(cols)` inside is
 * an allocation on every frame of a video export — which is what the
 * zero-allocation pipeline in this file's header is there to avoid. Grown on
 * demand and never shrunk; a resolution change is rare and a stale larger
 * buffer costs nothing.
 */
let maskColScratch = new Int32Array(0);
let phaseScratch = new Float32Array(0);

/** Flat `dy * cols + dx` per tap, for each scan direction. Sized to the widest kernel. */
const tapOffsetForward = new Int32Array(16);
const tapOffsetReverse = new Int32Array(16);

/*
 * Frequency modulation carrier, in radians per cell.
 *
 * The shadows advance at FM_BASE_FREQ for a wave every ~52 cells and the
 * highlights at BASE + SPAN for one every ~8, measured along an axis; the
 * diagonal, where the row and column accumulators advance together, halves
 * both. Keeping the fastest case well clear of the two-cell Nyquist limit is
 * what stops the highlights breaking up into grain.
 */
const FM_BASE_FREQ = 0.12;
const FM_FREQ_SPAN = 0.66;

const TEXTURE_MASK_SOURCES: Partial<Record<DitherAlgorithm, { data: Float32Array; width: number }>> = {
  'blue-noise': { data: BLUE_NOISE_16X16, width: 16 },
  'void-cluster': { data: BLUE_NOISE_16X16, width: 16 },
};

/** The tiling mask an algorithm samples, if it samples one at all. */
function maskFor(algorithm: DitherAlgorithm): DitherMask | undefined {
  const matrix = ORDERED_MASK_SOURCES[algorithm];
  if (matrix) return toDitherMask(matrix);
  const texture = TEXTURE_MASK_SOURCES[algorithm];
  if (texture) return toTextureMask(texture.data, texture.width);
  return undefined;
}

/**
 * Patterns whose 'frequency' is a spatial rate: a carrier for the waves, a
 * line period for the screens.
 */
const FREQUENCY_ALGORITHMS = new Set<DitherAlgorithm>([
  'fm-modulation',
  'phase-modulation',
  'concentric-rings',
  'sine-drift',
  'bytewave',
  'glitch-displacement',
  'scanline-shift',
  'horizontal-lines',
  'vertical-lines',
]);

export type DitherParamId = keyof DitherParams;

export interface DitherParamSpec {
  id: DitherParamId;
  label: string;
  /** One line of help for the control. */
  hint: string;
  min: number;
  max: number;
  step: number;
  /** Value used when the parameter is absent. */
  fallback: number;
  /** Render as a switch rather than a slider. */
  toggle?: boolean;
  unit?: string;
}

/*
 * Defaults are chosen so that a resolved parameter set with nothing supplied
 * reproduces the hardcoded behaviour these values replaced. That is what lets
 * the field be optional everywhere without versioning the presets.
 */
export const DITHER_PARAM_SPECS: Record<DitherParamId, DitherParamSpec> = {
  intensity: {
    id: 'intensity',
    label: 'Intensity',
    hint: 'How hard the pattern pushes against the tone. 1.0 is one quantization step.',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 1,
    unit: '×',
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    hint: 'Cells per mask sample. Coarsens the pattern without reshaping it.',
    min: 1,
    max: 8,
    step: 1,
    fallback: 1,
    unit: '×',
  },
  angle: {
    id: 'angle',
    label: 'Screen angle',
    hint: 'Rotates the mask. 45° is the classic halftone screen.',
    min: 0,
    max: 90,
    step: 1,
    fallback: 0,
    unit: '°',
  },
  frequency: {
    id: 'frequency',
    label: 'Frequency',
    hint: 'Multiplies the carrier rate. Below 1 spreads the pattern out.',
    min: 0.25,
    max: 3,
    step: 0.05,
    fallback: 1,
    unit: '×',
  },
  seed: {
    id: 'seed',
    label: 'Seed',
    hint: 'Shifts the pattern origin. The same seed always gives the same frame.',
    min: 0,
    max: 64,
    step: 1,
    fallback: 0,
  },
  serpentine: {
    id: 'serpentine',
    label: 'Serpentine scan',
    hint: 'Alternates scan direction each row, cancelling diagonal worm artifacts.',
    min: 0,
    max: 1,
    step: 1,
    fallback: 1,
    toggle: true,
  },
};

export interface ResolvedDitherParams {
  intensity: number;
  scale: number;
  angle: number;
  frequency: number;
  seed: number;
  serpentine: boolean;
}

function clampParam(id: DitherParamId, value: number | undefined): number {
  const spec = DITHER_PARAM_SPECS[id];
  if (typeof value !== 'number' || !Number.isFinite(value)) return spec.fallback;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/** Fills in and clamps every parameter, whether or not the algorithm reads it. */
export function resolveDitherParams(params?: DitherParams): ResolvedDitherParams {
  return {
    intensity: clampParam('intensity', params?.intensity),
    scale: Math.round(clampParam('scale', params?.scale)),
    angle: clampParam('angle', params?.angle),
    frequency: clampParam('frequency', params?.frequency),
    seed: Math.round(clampParam('seed', params?.seed)),
    serpentine: params?.serpentine ?? true,
  };
}

/**
 * Which parameters an algorithm actually honours, derived from the shape of its
 * implementation rather than declared alongside its registry entry — a list
 * kept by hand next to 44 entries would drift from the code the first time a
 * branch changed. The picker renders exactly these controls.
 */
export function getDitherParamIds(algorithm: DitherAlgorithm): DitherParamId[] {
  if (algorithm === 'none') return [];
  if (DIFFUSION_KERNELS[algorithm]) return ['intensity', 'serpentine'];
  if (maskFor(algorithm)) return ['intensity', 'scale', 'angle', 'seed'];
  if (FREQUENCY_ALGORITHMS.has(algorithm)) return ['intensity', 'frequency', 'seed'];
  // 'threshold-mod' is a tone curve with no spatial term, so a seed would do
  // nothing; intensity drives its exponent.
  if (algorithm === 'threshold-mod') return ['intensity'];
  return ['intensity', 'seed'];
}

/**
 * Applies a selected mathematical dithering algorithm to a normalized [0, 1]
 * luminance buffer. Output values in dest remain normalized in [0, 1]
 * corresponding to density steps.
 *
 * Negative source values are the transparency sentinel and are left alone.
 */
export function applyDitherAlgorithm(
  src: Float32Array,
  dest: Float32Array,
  cols: number,
  rows: number,
  algorithm: DitherAlgorithm = 'floyd-steinberg',
  densityLevels: number = 10,
  params?: DitherParams
): void {
  dest.set(src);
  const totalCells = cols * rows;
  const quantStep = 1.0 / Math.max(1, densityLevels - 1);
  const { intensity, scale, angle, frequency, seed, serpentine } = resolveDitherParams(params);

  /** Quantizes into discrete density steps. */
  const quantize = (val: number): number => {
    const steps = Math.max(1, densityLevels - 1);
    return Math.max(0, Math.min(1, Math.round(val * steps) / steps));
  };

  /** Mask and carrier amplitude, in tone units. */
  const amp = quantStep * intensity;

  if (algorithm === 'none') {
    for (let i = 0; i < totalCells; i++) {
      const v = dest[i];
      if (v < 0) continue;
      dest[i] = quantize(v);
    }
    return;
  }

  // --- 1. ERROR DIFFUSION SUITE ---
  const kernel = DIFFUSION_KERNELS[algorithm];
  if (kernel) {
    const { dx, dy, weight, reach, depth } = compileKernel(algorithm, kernel);
    const tapCount = weight.length;
    const steps = Math.max(1, densityLevels - 1);

    // Flat offsets so an interior tap is one add and one array read.
    for (let t = 0; t < tapCount; t++) {
      tapOffsetForward[t] = dy[t] * cols + dx[t];
      tapOffsetReverse[t] = dy[t] * cols - dx[t];
    }

    const interiorLo = reach;
    const interiorHi = cols - reach;

    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      /*
       * Serpentine (boustrophedon) traversal: odd rows run right-to-left with
       * the kernel mirrored horizontally.
       *
       * Scanning every row in the same direction lets the residual error drift
       * consistently one way, which is what draws the diagonal "worm" trails —
       * and it draws them identically for every kernel, so Stucki, JJN, Burkes
       * and the three Sierras all collapsed into the same look regardless of
       * how their coefficients were distributed. Alternating the direction
       * cancels the drift and lets each kernel's own distribution show.
       *
       * Switchable because the one-directional worming is also a look, and it
       * is the look every link shared before this existed was rendered with.
       */
      const reverse = serpentine && (y & 1) === 1;
      const offsets = reverse ? tapOffsetReverse : tapOffsetForward;

      /*
       * Away from the bottom edge and both side margins every tap is in
       * bounds, so that span drops the three comparisons per tap — twelve taps
       * on Stucki, on every cell.
       */
      const interiorRow = y + depth < rows;

      for (let i = 0; i < cols; i++) {
        const x = reverse ? cols - 1 - i : i;
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue; // transparency sentinel

        const q = oldVal <= 0 ? 0 : oldVal >= 1 ? 1 : Math.round(oldVal * steps) / steps;
        dest[idx] = q;

        const err = (oldVal - q) * intensity;
        if (err === 0) continue;

        if (interiorRow && x >= interiorLo && x < interiorHi) {
          for (let t = 0; t < tapCount; t++) {
            dest[idx + offsets[t]] += err * weight[t];
          }
          continue;
        }

        for (let t = 0; t < tapCount; t++) {
          const ny = y + dy[t];
          if (ny >= rows) continue;
          const nx = reverse ? x - dx[t] : x + dx[t];
          if (nx < 0 || nx >= cols) continue;
          dest[ny * cols + nx] += err * weight[t];
        }
      }
    }
    return;
  }

  // --- 2. TILING MASKS: ordered matrices, halftone screens, blue noise ---
  const mask = maskFor(algorithm);
  if (mask) {
    const { width, height, offsets } = mask;
    const inv = 1 / scale;

    if (angle === 0) {
      /*
       * Unrotated, the mask column depends only on x and the mask row only on
       * y, so both fold into lookups built once per frame instead of a floor
       * and two modulos per cell. This is the path almost every frame takes and
       * it runs per cell per frame, so it stays separate from the general one.
       */
      if (maskColScratch.length < cols) maskColScratch = new Int32Array(cols);
      const colIndex = maskColScratch;
      for (let x = 0; x < cols; x++) {
        const mx = Math.floor(x * inv) + seed;
        colIndex[x] = ((mx % width) + width) % width;
      }

      for (let y = 0; y < rows; y++) {
        const row = y * cols;
        const my = Math.floor(y * inv);
        const maskRow = (((my % height) + height) % height) * width;
        for (let x = 0; x < cols; x++) {
          const idx = row + x;
          const v = dest[idx];
          if (v < 0) continue;
          dest[idx] = quantize(v + offsets[maskRow + colIndex[x]] * amp);
        }
      }
      return;
    }

    /*
     * A rotated tiling mask does not tile seamlessly at angles off a multiple
     * of 90 degrees, which is exactly how a real halftone screen behaves and
     * why print separations are screened at 15 / 45 / 75 degrees.
     *
     * The bias added after the floor is a whole number of mask periods, so it
     * cannot change the modulo but does guarantee a non-negative index — which
     * turns the wrap into one modulo instead of the two a possibly-negative one
     * needs.
     *
     * It has to be added to the integer, not to the coordinate. Biasing the
     * float first and truncating looks equivalent and is measurably faster, but
     * sin(30 degrees) is 0.49999999999999994, so x * sin lands just under an
     * integer; adding a bias in the hundreds costs exactly the low-order bits
     * that distinguish it, the value rounds up to the integer, and the floor
     * comes out one too high. Stepping the coordinates incrementally instead of
     * multiplying drifts the same way. Both were tried, and both moved a couple
     * of hundred out of 3584 (angle, scale, seed) combinations.
     */
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const reachAcross = cols + rows;
    const biasX = width * (Math.ceil(reachAcross / width) + 1);
    const biasY = height * (Math.ceil(reachAcross / height) + 1);

    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const ySin = y * sin;
      const yCos = y * cos;

      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const cx = (Math.floor((x * cos - ySin) * inv) + seed + biasX) % width;
        const cy = (Math.floor((x * sin + yCos) * inv) + biasY) % height;
        dest[idx] = quantize(v + offsets[cy * width + cx] * amp);
      }
    }
    return;
  }

  // --- 3. LINE SCREENS ---
  /*
   * A row or column parity rather than a tiling matrix. Frequency sets the
   * period: 1x is the two-cell alternation these had hardcoded, and below 1x
   * widens the bands.
   */
  if (
    algorithm === 'horizontal-lines' ||
    algorithm === 'scanline-shift' ||
    algorithm === 'vertical-lines'
  ) {
    const period = Math.max(2, Math.round(2 / frequency));
    const half = period / 2;
    const vertical = algorithm === 'vertical-lines';

    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const rowShift = vertical ? 0 : ((y + seed) % period < half ? 0.35 : -0.35) * amp;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const shift = vertical
          ? ((x + seed) % period < half ? 0.35 : -0.35) * amp
          : rowShift;
        dest[idx] = quantize(v + shift);
      }
    }
    return;
  }

  // --- 4. STOCHASTIC HASHES ---
  if (algorithm === 'white-noise') {
    /*
     * A sine-based spatial hash, deterministic in the cell coordinate so a
     * video renders with a stable grain rather than one that crawls between
     * frames. Seed offsets the coordinate to pick a different grain.
     */
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const sy = y + seed * 31;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const sx = x + seed * 17;
        const hash = ((Math.sin(sx * 12.9898 + sy * 78.233) * 43758.5453) % 1.0 + 1.0) % 1.0 - 0.5;
        dest[idx] = quantize(v + hash * amp);
      }
    }
    return;
  }

  if (algorithm === 'gaussian-noise') {
    // Box-Muller over two independent spatial hashes.
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const sy = y + seed * 31;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const sx = x + seed * 17;
        const h1 = Math.max(1e-5, ((Math.sin(sx * 37.1 + sy * 91.7) * 43758.5453) % 1.0 + 1.0) % 1.0);
        const h2 = ((Math.cos(sx * 41.3 + sy * 17.9) * 23421.631) % 1.0 + 1.0) % 1.0;
        const g = Math.sqrt(-2.0 * Math.log(h1)) * Math.cos(2.0 * Math.PI * h2) * 0.4;
        dest[idx] = quantize(v + g * amp);
      }
    }
    return;
  }

  if (algorithm === 'interleaved-gradient') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const sy = y + seed;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const ign = ((52.9829189 * ((0.06711056 * (x + seed) + 0.00583715 * sy) % 1)) % 1) - 0.5;
        dest[idx] = quantize(v + ign * amp);
      }
    }
    return;
  }

  // --- 5. ALGORITHMIC & SPACE-FILLING ---
  if (algorithm === 'r-sequence' || algorithm === 'hilbert' || algorithm === 'peano') {
    // R2 low-discrepancy sequence: the two plastic-number conjugates.
    const a1 = 0.7548776662466927;
    const a2 = 0.5698402909980532;
    const phase = seed * 0.381966;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const seq = ((0.5 + phase + a1 * x + a2 * y) % 1.0) - 0.5;
        dest[idx] = quantize(v + seq * amp);
      }
    }
    return;
  }

  // --- 6. MODULATION & GENERATIVE ---
  if (algorithm === 'fm-modulation') {
    /*
     * The carrier's phase is accumulated across the grid rather than computed
     * as position times local frequency.
     *
     * Multiplying an absolute coordinate by a per-cell frequency makes the
     * phase jump by (position times delta-frequency) wherever the tone moves:
     * at column 200 the old carrier shifted ~3.7 radians for a tone step of
     * 0.01, more than half a cycle, so each cell's pattern was uncorrelated
     * with its neighbour's and the whole field read as noise — noise that got
     * worse the further right it went, because the error scales with the
     * coordinate.
     *
     * Accumulating instead advances the phase by one cell's worth of local
     * frequency at a time, which stays continuous however the tone moves. Row
     * and column accumulators are summed so the field is coherent on both
     * axes; a row accumulator alone would leave every row independent and
     * streak horizontally.
     */
    const base = FM_BASE_FREQ * frequency;
    const span = FM_FREQ_SPAN * frequency;
    if (phaseScratch.length < cols) phaseScratch = new Float32Array(cols);
    const colPhase = phaseScratch;
    colPhase.fill(0, 0, cols);
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      let rowPhase = seed * 0.5;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        // Accumulate through transparent cells so the phase does not step
        // across a cut-out region.
        const step = base + Math.max(0, v) * span;
        rowPhase += step;
        colPhase[x] += step;
        if (v < 0) continue;
        dest[idx] = quantize(v + Math.sin(rowPhase + colPhase[x]) * 0.5 * amp);
      }
    }
    return;
  }

  if (algorithm === 'phase-modulation') {
    const rate = 0.25 * frequency;
    const offset = seed * 0.5;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const phase = Math.sin(x * rate + offset) * Math.cos(y * rate) * 3.5;
        const pMod = Math.sin(v * Math.PI * 4.0 + phase);
        dest[idx] = quantize(v + pMod * 0.45 * amp);
      }
    }
    return;
  }

  if (algorithm === 'bytewave') {
    // Kept integer so the XOR stays a bitwise pattern rather than a beat.
    const mx = Math.max(1, Math.round(3 * frequency));
    const my = Math.max(1, Math.round(5 * frequency));
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const sy = (y + seed) * my;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const byteVal = ((((x + seed) * mx) ^ sy) & 255) / 255.0 - 0.5;
        dest[idx] = quantize(v + byteVal * amp);
      }
    }
    return;
  }

  if (algorithm === 'concentric-rings') {
    const centreX = cols / 2;
    const centreY = rows / 2;
    const rate = 0.65 * frequency;
    const offset = seed * 0.5;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const dy = y - centreY;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const dx = x - centreX;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ring = Math.sin(dist * rate + v * Math.PI + offset) * 0.5;
        dest[idx] = quantize(v + ring * amp);
      }
    }
    return;
  }

  if (algorithm === 'sine-drift') {
    const rate = 0.4 * frequency;
    const offset = seed * 0.5;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const wave = Math.sin(y * rate + offset) * 0.4 * amp;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + wave);
      }
    }
    return;
  }

  if (algorithm === 'glitch-displacement') {
    /*
     * Two coprime line periods, so the tears land irregularly rather than on a
     * visible beat. Frequency shortens both; the floors stop a high frequency
     * collapsing them onto every row.
     */
    const shortPeriod = Math.max(2, Math.round(7 / frequency));
    const longPeriod = Math.max(3, Math.round(19 / frequency));
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const sy = y + seed;
      const isGlitchLine = sy % shortPeriod === 0 || sy % longPeriod === 0;
      const shift = isGlitchLine ? Math.sin(sy * 1.5) * 0.6 * amp : 0;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + shift);
      }
    }
    return;
  }

  if (algorithm === 'threshold-mod') {
    /*
     * A tone curve, not a spatial pattern — the one entry here with no mask at
     * all. Intensity drives the exponent, landing on the 1.25 it used to
     * hardcode at 1.0 and reaching a straight pass-through at 0.
     */
    const exponent = 1 + 0.25 * intensity;
    for (let i = 0; i < totalCells; i++) {
      const v = dest[i];
      if (v < 0) continue;
      dest[i] = quantize(Math.pow(v, exponent));
    }
    return;
  }
}
