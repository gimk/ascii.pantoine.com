import { DitherAlgorithm, DitherFamily } from '../types/ascii';

export interface DitherAlgorithmMeta {
  id: DitherAlgorithm;
  name: string;
  family: DitherFamily;
  description: string;
}

export const DITHER_ALGORITHMS: DitherAlgorithmMeta[] = [
  // --- Error Diffusion (12) ---
  { id: 'none', name: 'Threshold (None)', family: 'error-diffusion', description: 'Direct quantization without error diffusion' },
  { id: 'floyd-steinberg', name: 'Floyd-Steinberg', family: 'error-diffusion', description: 'Classic 4-neighbor balanced error diffusion (1976)' },
  { id: 'false-floyd-steinberg', name: 'False Floyd-Steinberg', family: 'error-diffusion', description: 'Compact 2-neighbor rapid diffusion with crisp lines' },
  { id: 'atkinson', name: 'Atkinson (MacPaint)', family: 'error-diffusion', description: 'Bill Atkinson 1984 8-neighbor diffusion, preserves clean highlights' },
  { id: 'sierra-3', name: 'Sierra 3-Line', family: 'error-diffusion', description: 'Frankie Sierra 3-row diffusion with smooth gradients' },
  { id: 'sierra-2', name: 'Two-Row Sierra', family: 'error-diffusion', description: 'Fast 2-row Sierra diffusion with balanced distribution' },
  { id: 'sierra-lite', name: 'Sierra Lite (2-4A)', family: 'error-diffusion', description: 'Lightweight 3-neighbor Sierra variant' },
  { id: 'stucki', name: 'Stucki Matrix', family: 'error-diffusion', description: 'Peter Stucki 1981 sharp, high-contrast 12-neighbor matrix' },
  { id: 'jjn', name: 'Jarvis-Judice-Ninke', family: 'error-diffusion', description: '12-neighbor wide diffusion for soft photographic gradations' },
  { id: 'burkes', name: 'Burkes', family: 'error-diffusion', description: 'Daniel Burkes 7-neighbor clean horizontal diffusion' },
  { id: 'fan', name: 'Fan Dither (9-Neighbor)', family: 'error-diffusion', description: 'Zhigang Fan adaptive error diffusion' },
  { id: 'shiau-fan', name: 'Shiau-Fan', family: 'error-diffusion', description: 'Modified edge-preserving error diffusion' },
  { id: 'ostromoukhov', name: 'Ostromoukhov', family: 'error-diffusion', description: 'Variable-coefficient diffusion preventing worm artifacts' },

  // --- Ordered & Clustered Matrices (12) ---
  { id: 'bayer-2x2', name: 'Bayer 2×2 (Coarse)', family: 'ordered', description: '4-level coarse ordered dithering matrix' },
  { id: 'bayer-4x4', name: 'Bayer 4×4 (Classic)', family: 'ordered', description: '16-level classic ordered matrix' },
  { id: 'bayer-8x8', name: 'Bayer 8×8 (Smooth)', family: 'ordered', description: '64-level high-fidelity ordered matrix' },
  { id: 'bayer-16x16', name: 'Bayer 16×16 (Ultra)', family: 'ordered', description: '256-level ultra-smooth continuous matrix' },
  { id: 'cluster-4x4', name: 'Clustered Dot 4×4', family: 'ordered', description: 'Halftone dot cluster ordered matrix' },
  { id: 'cluster-8x8', name: 'Clustered Dot 8×8', family: 'ordered', description: 'Smooth circular halftone dot cluster' },
  { id: 'diagonal-4x4', name: 'Diagonal Lines 4×4', family: 'ordered', description: '45° etched diagonal line screen' },
  { id: 'diagonal-8x8', name: 'Diagonal Lines 8×8', family: 'ordered', description: 'Fine 45° engraving line dither' },
  { id: 'horizontal-lines', name: 'Horizontal Lines', family: 'ordered', description: 'Linear horizontal raster matrix' },
  { id: 'vertical-lines', name: 'Vertical Lines', family: 'ordered', description: 'Linear vertical stripe matrix' },
  { id: 'crosshatch-8x8', name: 'Crosshatch 8×8', family: 'ordered', description: 'Intersecting mesh cross-screen matrix' },
  { id: 'spiral-dot', name: 'Spiral Dot Matrix', family: 'ordered', description: 'Concentric circular ordered dither' },

  // --- Blue Noise & Stochastic (5) ---
  { id: 'blue-noise', name: 'Blue Noise (High-Freq)', family: 'blue-noise', description: 'Pre-computed high-frequency blue noise, organic stipple' },
  { id: 'void-cluster', name: 'Void-and-Cluster', family: 'blue-noise', description: 'Ulichney void-and-cluster blue noise distribution' },
  { id: 'white-noise', name: 'White Noise (Random)', family: 'blue-noise', description: 'Uniform stochastic random noise grain' },
  { id: 'gaussian-noise', name: 'Gaussian Film Grain', family: 'blue-noise', description: 'Normal-distribution photographic film grain' },
  { id: 'interleaved-gradient', name: 'Interleaved Gradient Noise', family: 'blue-noise', description: 'Low-discrepancy temporal gradient noise' },

  // --- Algorithmic & Space-Filling (4) ---
  { id: 'dot-diffusion', name: 'Knuth Dot Diffusion', family: 'algorithmic', description: 'Donald Knuth space-filling tile diffusion' },
  { id: 'hilbert', name: 'Hilbert Fractal Curve', family: 'algorithmic', description: '1D error diffusion along 2D Hilbert space-filling curve' },
  { id: 'peano', name: 'Peano Curve', family: 'algorithmic', description: 'Continuous space-filling fractal curve scan' },
  { id: 'r-sequence', name: 'R-Sequence Quasi-Random', family: 'algorithmic', description: 'Low-discrepancy 2D metallic ratio quasi-random sequence' },

  // --- Modulation & Generative (9) ---
  { id: 'fm-modulation', name: 'Frequency Modulation (FM)', family: 'modulation', description: 'Carrier wave frequency modulation synthesizing topographic contours' },
  { id: 'phase-modulation', name: 'Phase Modulation (PM)', family: 'modulation', description: 'Multi-frequency phase distortion and contour interference' },
  { id: 'bytewave', name: 'ByteWave Bitwise', family: 'modulation', description: 'Low-level arithmetic bitwise boolean raster dither' },
  { id: 'concentric-rings', name: 'Concentric Rings', family: 'modulation', description: 'Harmonic radial wave ripples and interference rings' },
  { id: 'cellular-circuit', name: 'Cellular Circuit', family: 'modulation', description: 'Discrete cell trace network dither' },
  { id: 'scanline-shift', name: 'Scanline Phase Shift', family: 'modulation', description: 'Alternating interlaced line phase dither' },
  { id: 'sine-drift', name: 'Analog Sine Drift', family: 'modulation', description: 'CRT analog sinusoidal drift modulation' },
  { id: 'glitch-displacement', name: 'Glitch Pixel Tear', family: 'modulation', description: 'Horizontal raster displacement jitter' },
  { id: 'threshold-mod', name: 'Dynamic Threshold Mod', family: 'modulation', description: 'Non-linear luminance-dependent thresholding' },
];

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

// Spiral Dot 8x8
export const SPIRAL_DOT_8X8 = [
  [41, 42, 43, 44, 45, 46, 47, 48],
  [40, 17, 18, 19, 20, 21, 22, 49],
  [39, 16, 5, 6, 7, 8, 23, 50],
  [38, 15, 4, 1, 2, 9, 24, 51],
  [37, 14, 3, 0, 3, 10, 25, 52],
  [36, 13, 12, 11, 4, 11, 26, 53],
  [35, 34, 33, 32, 31, 30, 27, 54],
  [63, 62, 61, 60, 59, 58, 57, 55],
];

// Knuth Dot Diffusion 8x8 Matrix
export const KNUTH_DOT_DIFFUSION_8X8 = [
  [34, 48, 40, 32, 29, 15, 23, 31],
  [42, 58, 56, 50, 21, 5, 7, 13],
  [46, 62, 64, 52, 17, 1, 3, 11],
  [38, 54, 60, 44, 25, 9, 19, 27],
  [28, 14, 22, 30, 35, 49, 41, 33],
  [20, 4, 6, 12, 43, 59, 57, 51],
  [16, 0, 2, 10, 47, 63, 61, 53],
  [24, 8, 18, 26, 39, 55, 53, 45],
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

  // --- 1. ERROR DIFFUSION SUITE ---
  if (algorithm === 'floyd-steinberg') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        if (x + 1 < cols) dest[row + x + 1] += (err * 7) / 16;
        if (y + 1 < rows) {
          const next = (y + 1) * cols;
          if (x - 1 >= 0) dest[next + x - 1] += (err * 3) / 16;
          dest[next + x] += (err * 5) / 16;
          if (x + 1 < cols) dest[next + x + 1] += (err * 1) / 16;
        }
      }
    }
  } else if (algorithm === 'false-floyd-steinberg') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        if (x + 1 < cols) dest[row + x + 1] += (err * 3) / 8;
        if (y + 1 < rows) {
          const next = (y + 1) * cols;
          dest[next + x] += (err * 3) / 8;
          if (x + 1 < cols) dest[next + x + 1] += (err * 2) / 8;
        }
      }
    }
  } else if (algorithm === 'atkinson') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const f = err / 8;
        if (x + 1 < cols) dest[row + x + 1] += f;
        if (x + 2 < cols) dest[row + x + 2] += f;
        if (y + 1 < rows) {
          const next = (y + 1) * cols;
          if (x - 1 >= 0) dest[next + x - 1] += f;
          dest[next + x] += f;
          if (x + 1 < cols) dest[next + x + 1] += f;
        }
        if (y + 2 < rows) dest[(y + 2) * cols + x] += f;
      }
    }
  } else if (algorithm === 'sierra-3') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 32;
        if (x + 1 < cols) dest[row + x + 1] += d * 5;
        if (x + 2 < cols) dest[row + x + 2] += d * 3;
        if (y + 1 < rows) {
          const n1 = (y + 1) * cols;
          if (x - 2 >= 0) dest[n1 + x - 2] += d * 2;
          if (x - 1 >= 0) dest[n1 + x - 1] += d * 4;
          dest[n1 + x] += d * 5;
          if (x + 1 < cols) dest[n1 + x + 1] += d * 4;
          if (x + 2 < cols) dest[n1 + x + 2] += d * 2;
        }
        if (y + 2 < rows) {
          const n2 = (y + 2) * cols;
          if (x - 1 >= 0) dest[n2 + x - 1] += d * 2;
          dest[n2 + x] += d * 3;
          if (x + 1 < cols) dest[n2 + x + 1] += d * 2;
        }
      }
    }
  } else if (algorithm === 'sierra-2') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 16;
        if (x + 1 < cols) dest[row + x + 1] += d * 4;
        if (x + 2 < cols) dest[row + x + 2] += d * 3;
        if (y + 1 < rows) {
          const n1 = (y + 1) * cols;
          if (x - 2 >= 0) dest[n1 + x - 2] += d * 1;
          if (x - 1 >= 0) dest[n1 + x - 1] += d * 2;
          dest[n1 + x] += d * 3;
          if (x + 1 < cols) dest[n1 + x + 1] += d * 2;
          if (x + 2 < cols) dest[n1 + x + 2] += d * 1;
        }
      }
    }
  } else if (algorithm === 'sierra-lite') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        if (x + 1 < cols) dest[row + x + 1] += (err * 2) / 4;
        if (y + 1 < rows) {
          const next = (y + 1) * cols;
          if (x - 1 >= 0) dest[next + x - 1] += (err * 1) / 4;
          dest[next + x] += (err * 1) / 4;
        }
      }
    }
  } else if (algorithm === 'stucki') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 42;
        if (x + 1 < cols) dest[row + x + 1] += d * 8;
        if (x + 2 < cols) dest[row + x + 2] += d * 4;
        if (y + 1 < rows) {
          const n1 = (y + 1) * cols;
          if (x - 2 >= 0) dest[n1 + x - 2] += d * 2;
          if (x - 1 >= 0) dest[n1 + x - 1] += d * 4;
          dest[n1 + x] += d * 8;
          if (x + 1 < cols) dest[n1 + x + 1] += d * 4;
          if (x + 2 < cols) dest[n1 + x + 2] += d * 2;
        }
        if (y + 2 < rows) {
          const n2 = (y + 2) * cols;
          if (x - 2 >= 0) dest[n2 + x - 2] += d * 1;
          if (x - 1 >= 0) dest[n2 + x - 1] += d * 2;
          dest[n2 + x] += d * 4;
          if (x + 1 < cols) dest[n2 + x + 1] += d * 2;
          if (x + 2 < cols) dest[n2 + x + 2] += d * 1;
        }
      }
    }
  } else if (algorithm === 'jjn') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 48;
        if (x + 1 < cols) dest[row + x + 1] += d * 7;
        if (x + 2 < cols) dest[row + x + 2] += d * 5;
        if (y + 1 < rows) {
          const n1 = (y + 1) * cols;
          if (x - 2 >= 0) dest[n1 + x - 2] += d * 3;
          if (x - 1 >= 0) dest[n1 + x - 1] += d * 5;
          dest[n1 + x] += d * 7;
          if (x + 1 < cols) dest[n1 + x + 1] += d * 5;
          if (x + 2 < cols) dest[n1 + x + 2] += d * 3;
        }
        if (y + 2 < rows) {
          const n2 = (y + 2) * cols;
          if (x - 2 >= 0) dest[n2 + x - 2] += d * 1;
          if (x - 1 >= 0) dest[n2 + x - 1] += d * 3;
          dest[n2 + x] += d * 5;
          if (x + 1 < cols) dest[n2 + x + 1] += d * 3;
          if (x + 2 < cols) dest[n2 + x + 2] += d * 1;
        }
      }
    }
  } else if (algorithm === 'burkes') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 32;
        if (x + 1 < cols) dest[row + x + 1] += d * 8;
        if (x + 2 < cols) dest[row + x + 2] += d * 4;
        if (y + 1 < rows) {
          const n1 = (y + 1) * cols;
          if (x - 2 >= 0) dest[n1 + x - 2] += d * 2;
          if (x - 1 >= 0) dest[n1 + x - 1] += d * 4;
          dest[n1 + x] += d * 8;
          if (x + 1 < cols) dest[n1 + x + 1] += d * 4;
          if (x + 2 < cols) dest[n1 + x + 2] += d * 2;
        }
      }
    }
  } else if (algorithm === 'fan' || algorithm === 'shiau-fan') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d = err / 16;
        if (x + 1 < cols) dest[row + x + 1] += d * 7;
        if (y + 1 < rows) {
          const n = (y + 1) * cols;
          if (x - 2 >= 0) dest[n + x - 2] += d * 1;
          if (x - 1 >= 0) dest[n + x - 1] += d * 3;
          dest[n + x] += d * 5;
        }
      }
    }
  } else if (algorithm === 'ostromoukhov') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const oldVal = dest[idx];
        if (oldVal < 0) continue;
        const q = Math.max(0, Math.min(1, Math.round(oldVal * (densityLevels - 1)) * quantStep));
        dest[idx] = q;
        const err = (oldVal - q) * intScale;
        const d1 = (err * 13) / 28;
        const d2 = (err * 10) / 28;
        const d3 = (err * 5) / 28;
        if (x + 1 < cols) dest[row + x + 1] += d1;
        if (y + 1 < rows) {
          const n = (y + 1) * cols;
          if (x - 1 >= 0) dest[n + x - 1] += d3;
          dest[n + x] += d2;
        }
      }
    }
  }

  // Helper for threshold quantization into discrete density steps
  const quantize = (val: number): number => {
    const steps = Math.max(1, densityLevels - 1);
    return Math.max(0, Math.min(1, Math.round(val * steps) / steps));
  };

  // --- 2. ORDERED & CLUSTERED MATRICES ---
  if (algorithm === 'bayer-2x2') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (BAYER_2X2[y % 2][x % 2] / 4.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'bayer-4x4') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (BAYER_4X4[y % 4][x % 4] / 16.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'bayer-8x8' || algorithm === 'bayer-16x16') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (BAYER_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'cluster-4x4') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (CLUSTER_4X4[y % 4][x % 4] / 16.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'cluster-8x8' || algorithm === 'halftone-dot') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (CLUSTER_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'diagonal-4x4') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (DIAGONAL_4X4[y % 4][x % 4] / 16.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'diagonal-8x8') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (DIAGONAL_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'horizontal-lines') {
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
  } else if (algorithm === 'crosshatch-8x8') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (CROSSHATCH_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'spiral-dot') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (SPIRAL_DOT_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
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
  else if (algorithm === 'dot-diffusion') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const mat = (KNUTH_DOT_DIFFUSION_8X8[y % 8][x % 8] / 64.0 - 0.5) * quantStep * intScale;
        dest[idx] = quantize(v + mat);
      }
    }
  } else if (algorithm === 'r-sequence' || algorithm === 'hilbert' || algorithm === 'peano') {
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
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const freq = 0.15 + v * 0.85;
        const carrier = Math.sin((x * 0.35 + y * 0.18) * freq * Math.PI * 2);
        const mod = Math.sin(carrier * 3.14 + v * 6.28);
        dest[idx] = quantize(v + mod * 0.5 * quantStep * intScale);
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
  } else if (algorithm === 'cellular-circuit') {
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const cy = (y % 8) - 4;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const v = dest[idx];
        if (v < 0) continue;
        const cx = (x % 8) - 4;
        const cellDist = Math.sqrt(cx * cx + cy * cy) / 4.0 - 0.5;
        dest[idx] = quantize(v + cellDist * quantStep * intScale);
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

