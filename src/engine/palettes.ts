import { ColorPalette, MultiToneConfig } from '../types/ascii';

export const BUILTIN_PALETTES: ColorPalette[] = [
  // --- Retro Hardware & Computing ---
  {
    id: 'gameboy-classic',
    name: 'Game Boy Classic',
    category: 'retro',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'gameboy-pocket',
    name: 'Game Boy Pocket',
    category: 'retro',
    colors: ['#282c28', '#686c68', '#a0a8a0', '#c8d0c8'],
  },
  {
    id: 'gameboy-light',
    name: 'Game Boy Light (Teal)',
    category: 'retro',
    colors: ['#003830', '#006b5c', '#00ab94', '#00ffdc'],
  },
  {
    id: 'cga-mode1',
    name: 'CGA Mode 1 (High)',
    category: 'retro',
    colors: ['#000000', '#00aaaa', '#aa00aa', '#aaaaaa'],
  },
  {
    id: 'cga-mode2',
    name: 'CGA Mode 2 (Vibrant)',
    category: 'retro',
    colors: ['#000000', '#55ff55', '#ff5555', '#ffff55'],
  },
  {
    id: 'c64',
    name: 'Commodore 64',
    category: 'retro',
    colors: [
      '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55',
      '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333',
      '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ],
  },
  {
    id: 'apple-ii',
    name: 'Apple II Hi-Res',
    category: 'retro',
    colors: ['#000000', '#14c000', '#e000e0', '#ffffff', '#ff6a00', '#0040ff'],
  },
  {
    id: 'zx-spectrum',
    name: 'ZX Spectrum',
    category: 'retro',
    colors: [
      '#000000', '#0000d8', '#d80000', '#d800d8', '#00d800', '#00d8d8', '#d8d800', '#d8d8d8',
      '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff',
    ],
  },
  {
    id: 'pico-8',
    name: 'PICO-8',
    category: 'retro',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'teletext',
    name: 'Teletext / Ceefax',
    category: 'retro',
    colors: ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'],
  },

  // --- Risograph & Screenprint Inks ---
  {
    id: 'riso-fluo-cornflower',
    name: 'Riso Fluo Pink & Cornflower',
    category: 'print',
    colors: ['#12101e', '#3a44a8', '#f84392', '#ffffff'],
  },
  {
    id: 'riso-sunflower-teal',
    name: 'Riso Sunflower & Teal',
    category: 'print',
    colors: ['#042022', '#00838f', '#ffc72c', '#fbfbf2'],
  },
  {
    id: 'riso-gold-crimson',
    name: 'Riso Flat Gold & Crimson',
    category: 'print',
    colors: ['#1c0406', '#9e1b32', '#b38808', '#fff8e7'],
  },
  {
    id: 'riso-4color-master',
    name: 'Riso 4-Ink Studio Master',
    category: 'print',
    colors: ['#151515', '#0078bf', '#ff48b0', '#ffe800', '#f4f0e6'],
  },
  {
    id: 'cmyk-process',
    name: 'CMYK Print Process',
    category: 'print',
    colors: ['#000000', '#009ee0', '#e5007d', '#fff100', '#ffffff'],
  },
  {
    id: 'metallic-bronze',
    name: 'Metallic Bronze Leaf',
    category: 'print',
    colors: ['#0a0806', '#4a3319', '#9e7240', '#e0c088', '#fff5df'],
  },

  // --- Design & Aesthetic ---
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    category: 'design',
    colors: ['#050014', '#3d007a', '#ff007f', '#00f0ff', '#ffe600'],
  },
  {
    id: 'acid-techno',
    name: 'Acid Techno',
    category: 'design',
    colors: ['#000000', '#250048', '#8a00e6', '#ccff00'],
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus Primary',
    category: 'design',
    colors: ['#111111', '#1446a0', '#db3069', '#f5d547', '#f5f5f5'],
  },
  {
    id: 'swiss-international',
    name: 'Swiss International Style',
    category: 'design',
    colors: ['#1a1a1a', '#e63946', '#f1faee', '#a8dadc', '#457b9d'],
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    category: 'design',
    colors: ['#002b36', '#073642', '#586e75', '#839496', '#268bd2', '#2aa198', '#859900', '#cb4b16'],
  },
  {
    id: 'nord',
    name: 'Nord Palette',
    category: 'design',
    colors: ['#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#88c0d0', '#81a1c1', '#5e81ac'],
  },
  {
    id: 'dracula',
    name: 'Dracula Theme',
    category: 'design',
    colors: ['#282a36', '#44475a', '#6272a4', '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#bd93f9', '#f8f8f2'],
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave Sunset',
    category: 'design',
    colors: ['#1f003b', '#5c007a', '#a60085', '#e60067', '#ff6b4a', '#ffbe3b'],
  },
];

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

/**
 * Converts a Hex color string (#rrggbb or #rgb) to RGB [0..255]
 */
export function hexToRgb(hex: string): RGB {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num) || cleaned.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Converts RGB [0..255] to Hex (#rrggbb)
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clampR = Math.max(0, Math.min(255, Math.round(r)));
  const clampG = Math.max(0, Math.min(255, Math.round(g)));
  const clampB = Math.max(0, Math.min(255, Math.round(b)));
  return '#' + ((1 << 24) + (clampR << 16) + (clampG << 8) + clampB).toString(16).slice(1);
}

/**
 * Converts RGB [0..255] to CIELAB space for perceptually uniform color matching.
 */
export function rgbToLab(r: number, g: number, b: number): Lab {
  // sRGB to linear RGB
  let rL = r / 255.0;
  let gL = g / 255.0;
  let bL = b / 255.0;

  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  // Linear RGB to CIE XYZ (D65 Illuminant)
  const x = (rL * 0.4124 + gL * 0.3576 + bL * 0.1805) / 0.95047;
  const y = (rL * 0.2126 + gL * 0.7152 + bL * 0.0722) / 1.00000;
  const z = (rL * 0.0193 + gL * 0.1192 + bL * 0.9505) / 1.08883;

  const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16.0 / 116.0;
  const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16.0 / 116.0;
  const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16.0 / 116.0;

  return {
    l: 116.0 * fy - 16.0,
    a: 500.0 * (fx - fy),
    b: 200.0 * (fy - fz),
  };
}

/**
 * CIELAB Delta E* (CIE76) color distance
 */
export function deltaE(lab1: Lab, lab2: Lab): number {
  const dL = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return dL * dL + da * da + db * db;
}

/**
 * Prepared palette structure with precomputed RGB & CIELAB values for O(N) zero-allocation matching.
 */
export class PaletteQuantizer {
  palette: ColorPalette;
  rgbColors: RGB[];
  labColors: Lab[];
  sortedRgbColors: RGB[];

  constructor(palette: ColorPalette) {
    this.palette = palette;
    this.rgbColors = palette.colors.map(hexToRgb);
    this.labColors = this.rgbColors.map((c) => rgbToLab(c.r, c.g, c.b));
    // Sort palette colors from darkest to brightest by perceived luminance
    this.sortedRgbColors = [...this.rgbColors].sort((a, b) => {
      const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
      const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
      return lumA - lumB;
    });
  }

  findClosestIndex(r: number, g: number, b: number): number {
    const inputLab = rgbToLab(r, g, b);
    let bestDist = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < this.labColors.length; i++) {
      const dist = deltaE(inputLab, this.labColors[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  findClosestRgb(r: number, g: number, b: number): RGB {
    const idx = this.findClosestIndex(r, g, b);
    return this.rgbColors[idx];
  }

  getToneRgb(val: number): RGB {
    const clamped = Math.max(0, Math.min(1, val));
    const numColors = this.sortedRgbColors.length;
    if (numColors === 0) return { r: 255, g: 255, b: 255 };
    if (numColors === 1) return this.sortedRgbColors[0];
    const idx = Math.min(numColors - 1, Math.floor(clamped * numColors));
    return this.sortedRgbColors[idx];
  }
}

/**
 * Evaluates a Multi-Tone gradient map (Duotone, Tritone, Quadtone) at scalar tone t in [0, 1].
 */
export function evaluateMultiTone(t: number, config: MultiToneConfig): RGB {
  const shadow = hexToRgb(config.shadow);
  const highlight = hexToRgb(config.highlight);
  const clampedT = Math.max(0, Math.min(1, t));

  if (config.midtone && config.highlight2) {
    // Quadtone (4 stops: 0.0, 0.33, 0.66, 1.0)
    const mid = hexToRgb(config.midtone);
    const hi2 = hexToRgb(config.highlight2);
    if (clampedT <= 0.333) {
      const u = clampedT / 0.333;
      return {
        r: shadow.r + (mid.r - shadow.r) * u,
        g: shadow.g + (mid.g - shadow.g) * u,
        b: shadow.b + (mid.b - shadow.b) * u,
      };
    } else if (clampedT <= 0.666) {
      const u = (clampedT - 0.333) / 0.333;
      return {
        r: mid.r + (hi2.r - mid.r) * u,
        g: mid.g + (hi2.g - mid.g) * u,
        b: mid.b + (hi2.b - mid.b) * u,
      };
    } else {
      const u = (clampedT - 0.666) / 0.334;
      return {
        r: hi2.r + (highlight.r - hi2.r) * u,
        g: hi2.g + (highlight.g - hi2.g) * u,
        b: hi2.b + (highlight.b - hi2.b) * u,
      };
    }
  } else if (config.midtone) {
    // Tritone (3 stops: 0.0, 0.5, 1.0)
    const mid = hexToRgb(config.midtone);
    if (clampedT <= 0.5) {
      const u = clampedT * 2.0;
      return {
        r: shadow.r + (mid.r - shadow.r) * u,
        g: shadow.g + (mid.g - shadow.g) * u,
        b: shadow.b + (mid.b - shadow.b) * u,
      };
    } else {
      const u = (clampedT - 0.5) * 2.0;
      return {
        r: mid.r + (highlight.r - mid.r) * u,
        g: mid.g + (highlight.g - mid.g) * u,
        b: mid.b + (highlight.b - mid.b) * u,
      };
    }
  }

  // Duotone (2 stops: 0.0, 1.0)
  return {
    r: shadow.r + (highlight.r - shadow.r) * clampedT,
    g: shadow.g + (highlight.g - shadow.g) * clampedT,
    b: shadow.b + (highlight.b - shadow.b) * clampedT,
  };
}

/**
 * Evaluates an arbitrary N-Tone gradient or discrete palette map at scalar tone t in [0, 1].
 * Supports 1 to 16+ color stops!
 * - 1 Color (Monotone): Interpolates from background to the single highlight color.
 * - 2 Colors (Duotone): Stops [shadow, highlight]
 * - 3 Colors (Tritone): Stops [shadow, midtone, highlight]
 * - N Colors: Evenly spaced or interpolated stops across [0, 1]
 */
export function evaluateNTone(t: number, toneStops: string[], bgColor: string = '#000000'): RGB {
  if (!toneStops || toneStops.length === 0) {
    return hexToRgb('#ffffff');
  }

  const clampedT = Math.max(0, Math.min(1, t));

  // 1-Color mode: Background to single highlight color
  if (toneStops.length === 1) {
    const bg = hexToRgb(bgColor || '#000000');
    const fg = hexToRgb(toneStops[0]);
    return {
      r: Math.round(bg.r + (fg.r - bg.r) * clampedT),
      g: Math.round(bg.g + (fg.g - bg.g) * clampedT),
      b: Math.round(bg.b + (fg.b - bg.b) * clampedT),
    };
  }

  const numSegments = toneStops.length - 1;
  const scaled = clampedT * numSegments;
  const index = Math.min(numSegments - 1, Math.floor(scaled));
  const u = scaled - index;

  const c1 = hexToRgb(toneStops[index]);
  const c2 = hexToRgb(toneStops[index + 1]);

  return {
    r: Math.round(c1.r + (c2.r - c1.r) * u),
    g: Math.round(c1.g + (c2.g - c1.g) * u),
    b: Math.round(c1.b + (c2.b - c1.b) * u),
  };
}

/**
 * Fast Median-Cut / K-Means palette extractor to pull top N dominant colors from an RGBA image buffer.
 */
export function extractDominantPalette(
  rgbaBuffer: Uint8ClampedArray | Uint8Array,
  numColors: number = 8
): string[] {
  const targetK = Math.max(2, Math.min(32, numColors));
  const pixels: RGB[] = [];
  const len = rgbaBuffer.length;
  const step = Math.max(4, Math.floor(len / (1000 * 4)) * 4); // sample ~1000 representative pixels

  for (let i = 0; i < len; i += step) {
    const a = rgbaBuffer[i + 3];
    if (a > 32) {
      pixels.push({
        r: rgbaBuffer[i],
        g: rgbaBuffer[i + 1],
        b: rgbaBuffer[i + 2],
      });
    }
  }

  if (pixels.length === 0) {
    return ['#000000', '#ffffff'];
  }

  // Initial centroid selection across luminance spread
  pixels.sort((a, b) => (0.299 * a.r + 0.587 * a.g + 0.114 * a.b) - (0.299 * b.r + 0.587 * b.g + 0.114 * b.b));
  const centroids: RGB[] = [];
  for (let k = 0; k < targetK; k++) {
    const pIdx = Math.min(pixels.length - 1, Math.floor((k / (targetK - 1 || 1)) * (pixels.length - 1)));
    centroids.push({ ...pixels[pIdx] });
  }

  // 4 iterations of K-Means clustering for fast convergence
  for (let iter = 0; iter < 4; iter++) {
    const sumsR = new Float64Array(targetK);
    const sumsG = new Float64Array(targetK);
    const sumsB = new Float64Array(targetK);
    const counts = new Uint32Array(targetK);

    for (let p = 0; p < pixels.length; p++) {
      const px = pixels[p];
      let bestDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < targetK; c++) {
        const cent = centroids[c];
        const dr = px.r - cent.r;
        const dg = px.g - cent.g;
        const db = px.b - cent.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          bestCluster = c;
        }
      }

      sumsR[bestCluster] += px.r;
      sumsG[bestCluster] += px.g;
      sumsB[bestCluster] += px.b;
      counts[bestCluster]++;
    }

    for (let c = 0; c < targetK; c++) {
      if (counts[c] > 0) {
        centroids[c].r = Math.round(sumsR[c] / counts[c]);
        centroids[c].g = Math.round(sumsG[c] / counts[c]);
        centroids[c].b = Math.round(sumsB[c] / counts[c]);
      }
    }
  }

  return centroids.map((c) => rgbToHex(c.r, c.g, c.b));
}

let scratchColorF32 = new Float32Array(0);

/**
 * Quantizes an RGB image buffer to an indexed palette using true 3D color-space error diffusion
 * so that all available palette colors (e.g. 4-color Game Boy, 16-color C64, 4-ink Riso) are fully mixed and utilized.
 */
export function quantizeImageToPaletteWithDither(
  srcRgb: Uint8ClampedArray | Uint8Array,
  destRgb: Uint8ClampedArray,
  cols: number,
  rows: number,
  quantizer: PaletteQuantizer,
  algorithm: string = 'floyd-steinberg',
  ditherStrength: number = 1.0
): void {
  const totalPixels = cols * rows;
  if (scratchColorF32.length !== totalPixels * 3) {
    scratchColorF32 = new Float32Array(totalPixels * 3);
  }

  for (let i = 0; i < totalPixels * 3; i++) {
    scratchColorF32[i] = srcRgb[i];
  }

  const intScale = Math.max(0, Math.min(2.0, ditherStrength));

  if (algorithm === 'none') {
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 3;
      const r = scratchColorF32[p];
      const g = scratchColorF32[p + 1];
      const b = scratchColorF32[p + 2];
      const closest = quantizer.findClosestRgb(r, g, b);
      destRgb[p] = closest.r;
      destRgb[p + 1] = closest.g;
      destRgb[p + 2] = closest.b;
    }
    return;
  }

  const isAtkinson = algorithm === 'atkinson';
  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols * 3;
    for (let x = 0; x < cols; x++) {
      const idx = rowOffset + x * 3;
      const curR = Math.max(0, Math.min(255, scratchColorF32[idx]));
      const curG = Math.max(0, Math.min(255, scratchColorF32[idx + 1]));
      const curB = Math.max(0, Math.min(255, scratchColorF32[idx + 2]));

      const closest = quantizer.findClosestRgb(curR, curG, curB);
      destRgb[idx] = closest.r;
      destRgb[idx + 1] = closest.g;
      destRgb[idx + 2] = closest.b;

      const errR = (curR - closest.r) * intScale;
      const errG = (curG - closest.g) * intScale;
      const errB = (curB - closest.b) * intScale;

      if (isAtkinson) {
        const fr = errR / 8;
        const fg = errG / 8;
        const fb = errB / 8;
        if (x + 1 < cols) {
          scratchColorF32[idx + 3] += fr;
          scratchColorF32[idx + 4] += fg;
          scratchColorF32[idx + 5] += fb;
        }
        if (x + 2 < cols) {
          scratchColorF32[idx + 6] += fr;
          scratchColorF32[idx + 7] += fg;
          scratchColorF32[idx + 8] += fb;
        }
        if (y + 1 < rows) {
          const nextRow = (y + 1) * cols * 3;
          if (x - 1 >= 0) {
            scratchColorF32[nextRow + (x - 1) * 3] += fr;
            scratchColorF32[nextRow + (x - 1) * 3 + 1] += fg;
            scratchColorF32[nextRow + (x - 1) * 3 + 2] += fb;
          }
          scratchColorF32[nextRow + x * 3] += fr;
          scratchColorF32[nextRow + x * 3 + 1] += fg;
          scratchColorF32[nextRow + x * 3 + 2] += fb;
          if (x + 1 < cols) {
            scratchColorF32[nextRow + (x + 1) * 3] += fr;
            scratchColorF32[nextRow + (x + 1) * 3 + 1] += fg;
            scratchColorF32[nextRow + (x + 1) * 3 + 2] += fb;
          }
        }
        if (y + 2 < rows) {
          const nextRow2 = (y + 2) * cols * 3;
          scratchColorF32[nextRow2 + x * 3] += fr;
          scratchColorF32[nextRow2 + x * 3 + 1] += fg;
          scratchColorF32[nextRow2 + x * 3 + 2] += fb;
        }
      } else {
        if (x + 1 < cols) {
          scratchColorF32[idx + 3] += (errR * 7) / 16;
          scratchColorF32[idx + 4] += (errG * 7) / 16;
          scratchColorF32[idx + 5] += (errB * 7) / 16;
        }
        if (y + 1 < rows) {
          const nextRow = (y + 1) * cols * 3;
          if (x - 1 >= 0) {
            scratchColorF32[nextRow + (x - 1) * 3] += (errR * 3) / 16;
            scratchColorF32[nextRow + (x - 1) * 3 + 1] += (errG * 3) / 16;
            scratchColorF32[nextRow + (x - 1) * 3 + 2] += (errB * 3) / 16;
          }
          scratchColorF32[nextRow + x * 3] += (errR * 5) / 16;
          scratchColorF32[nextRow + x * 3 + 1] += (errG * 5) / 16;
          scratchColorF32[nextRow + x * 3 + 2] += (errB * 5) / 16;
          if (x + 1 < cols) {
            scratchColorF32[nextRow + (x + 1) * 3] += (errR * 1) / 16;
            scratchColorF32[nextRow + (x + 1) * 3 + 1] += (errG * 1) / 16;
            scratchColorF32[nextRow + (x + 1) * 3 + 2] += (errB * 1) / 16;
          }
        }
      }
    }
  }
}

