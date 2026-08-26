import { DitherAlgorithm, DitherFamily } from '../types/ascii';

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

/**
 * Applies a selected mathematical dithering algorithm to a normalized [0, 1] luminance buffer.
 * Output values in destBuffer remain normalized in [0, 1] corresponding to density steps.
 */
export function applyDitherAlgorithm(
  src: Float32Array,
  dest: Float32Array,
  cols: number,
  rows: number,
  algorithm: DitherAlgorithm = 'floyd-steinberg',
  densityLevels: number = 10,
  intensity: number = 1.0
): void {
  dest.set(src);
  const totalCells = cols * rows;
  const quantStep = 1.0 / Math.max(1, densityLevels - 1);
  const intScale = Math.max(0, Math.min(2.0, intensity));

  if (algorithm === 'none') {
    for (let i = 0; i < totalCells; i++) {
      const v = dest[i];
      if (v < 0) continue;
      dest[i] = Math.round(v * (densityLevels - 1)) / (densityLevels - 1);
    }
    return;
  }

  // Helper for threshold quantization into discrete density steps
  const quantize = (val: number): number => {
    const steps = Math.max(1, densityLevels - 1);
    return Math.max(0, Math.min(1, Math.round(val * steps) / steps));
  };

  // --- 1. ERROR DIFFUSION SUITE ---
  const kernel = DIFFUSION_KERNELS[algorithm];
  if (kernel) {
    const { divisor, taps } = kernel;
    const tapCount = taps.length;

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
       */
      const reverse = (y & 1) === 1;

      for (let i = 0; i < cols; i++) {
        const x = reverse ? cols - 1 - i : i;
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue; // transparency sentinel

        const q = quantize(oldVal);
        dest[idx] = q;

        const err = (oldVal - q) * intScale;
        if (err === 0) continue;
        const unit = err / divisor;

        for (let t = 0; t < tapCount; t++) {
          const tap = taps[t];
          const ny = y + tap[1];
          if (ny >= rows) continue;
          const nx = x + (reverse ? -tap[0] : tap[0]);
          if (nx < 0 || nx >= cols) continue;
          dest[ny * cols + nx] += unit * tap[2];
        }
      }
    }
    return;
  }

  // --- 2. ORDERED & CLUSTERED MATRICES ---
  const orderedSource = ORDERED_MASK_SOURCES[algorithm];
  if (orderedSource) {
    const { width, height, offsets } = toDitherMask(orderedSource);
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const maskRow = (y % height) * width;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + offsets[maskRow + (x % width)] * quantStep * intScale);
      }
    }
    return;
  }

  /*
   * The two line screens stay hand-rolled: they are a row or column parity
   * rather than a tiling matrix, and their ±0.35 swing is already mean-zero.
   */
  if (algorithm === 'horizontal-lines') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const lineShift = (y % 2 === 0 ? 0.35 : -0.35) * quantStep * intScale;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + lineShift);
      }
    }
  } else if (algorithm === 'vertical-lines') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const lineShift = (x % 2 === 0 ? 0.35 : -0.35) * quantStep * intScale;
        dest[idx] = quantize(v + lineShift);
      }
    }
  }

  // --- 3. BLUE NOISE & STOCHASTIC ---
  else if (algorithm === 'blue-noise' || algorithm === 'void-cluster') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const bnIdx = (y % 16) * 16 + (x % 16);
        const noise = (BLUE_NOISE_16X16[bnIdx] - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + noise);
      }
    }
  } else if (algorithm === 'white-noise') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        // Deterministic golden-ratio spatial hash for temporal stability
        const hash = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1.0 + 1.0) % 1.0 - 0.5;
        dest[idx] = quantize(v + hash * quantStep * intScale);
      }
    }
  } else if (algorithm === 'gaussian-noise') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const h1 = Math.max(1e-5, ((Math.sin(x * 37.1 + y * 91.7) * 43758.5453) % 1.0 + 1.0) % 1.0);
        const h2 = ((Math.cos(x * 41.3 + y * 17.9) * 23421.631) % 1.0 + 1.0) % 1.0;
        const g = Math.sqrt(-2.0 * Math.log(h1)) * Math.cos(2.0 * Math.PI * h2) * 0.4;
        dest[idx] = quantize(v + g * quantStep * intScale);
      }
    }
  } else if (algorithm === 'interleaved-gradient') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const ign = ((52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1) - 0.5;
        dest[idx] = quantize(v + ign * quantStep * intScale);
      }
    }
  }

  // --- 4. ALGORITHMIC & SPACE-FILLING ---
  else if (algorithm === 'r-sequence' || algorithm === 'hilbert' || algorithm === 'peano') {
    const a1 = 0.7548776662466927;
    const a2 = 0.5698402909980532;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const seq = ((0.5 + a1 * x + a2 * y) % 1.0) - 0.5;
        dest[idx] = quantize(v + seq * quantStep * intScale);
      }
    }
  }

  // --- 5. MODULATION & GENERATIVE ---
  else if (algorithm === 'fm-modulation') {
    /*
     * The carrier's phase is accumulated across the grid rather than computed
     * as position × local frequency.
     *
     * Multiplying an absolute coordinate by a per-cell frequency makes the
     * phase jump by (position × Δfrequency) wherever the tone moves: at column
     * 200 the old carrier shifted ~3.7 radians for a tone step of 0.01, more
     * than half a cycle, so each cell's pattern was uncorrelated with its
     * neighbour's and the whole field read as noise — noise that got worse the
     * further right it went, because the error scales with the coordinate.
     *
     * Accumulating instead advances the phase by one cell's worth of local
     * frequency at a time, which stays continuous however the tone moves. Row
     * and column accumulators are summed so the field is coherent on both
     * axes; a row accumulator alone would leave every row independent and
     * streak horizontally.
     */
    const colPhase = new Float32Array(cols);
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      let rowPhase = 0;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        // Accumulate through transparent cells so the phase does not step
        // across a cut-out region.
        const step = FM_BASE_FREQ + Math.max(0, v) * FM_FREQ_SPAN;
        rowPhase += step;
        colPhase[x] += step;
        if (v < 0) continue;
        const carrier = Math.sin(rowPhase + colPhase[x]);
        dest[idx] = quantize(v + carrier * 0.5 * quantStep * intScale);
      }
    }
  } else if (algorithm === 'phase-modulation') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const phase = Math.sin(x * 0.25) * Math.cos(y * 0.25) * 3.5;
        const pMod = Math.sin(v * Math.PI * 4.0 + phase);
        dest[idx] = quantize(v + pMod * 0.45 * quantStep * intScale);
      }
    }
  } else if (algorithm === 'bytewave') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const byteVal = (((x * 3) ^ (y * 5)) & 255) / 255.0 - 0.5;
        dest[idx] = quantize(v + byteVal * quantStep * intScale);
      }
    }
  } else if (algorithm === 'concentric-rings') {
    const cx = cols / 2;
    const cy = rows / 2;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const dy = y - cy;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const dx = x - cx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ring = Math.sin(dist * 0.65 + v * 3.14) * 0.5;
        dest[idx] = quantize(v + ring * quantStep * intScale);
      }
    }
  } else if (algorithm === 'scanline-shift') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const phase = (y % 2 === 0 ? 0.35 : -0.35) * quantStep * intScale;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + phase);
      }
    }
  } else if (algorithm === 'sine-drift') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const wave = Math.sin(y * 0.4) * 0.4 * quantStep * intScale;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + wave);
      }
    }
  } else if (algorithm === 'glitch-displacement') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const isGlitchLine = (y % 7 === 0 || y % 19 === 0);
      const shift = isGlitchLine ? (Math.sin(y * 1.5) * 0.6 * quantStep * intScale) : 0;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        dest[idx] = quantize(v + shift);
      }
    }
  } else if (algorithm === 'threshold-mod') {
    for (let i = 0; i < totalCells; i++) {
      const v = dest[i];
      if (v < 0) continue;
      const curved = Math.pow(v, 1.25);
      dest[i] = quantize(curved);
    }
  }
}

