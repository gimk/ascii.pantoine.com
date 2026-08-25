import { ColorPalette } from '../types/ascii';

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

  {
    // Replaces the old hardcoded 'amber' tonal-mapping preset, which is now
    // reachable as a palette like every other multi-colour output.
    id: 'crt-amber',
    name: 'CRT Amber Monitor',
    category: 'retro',
    colors: ['#100a00', '#805800', '#ffb000'],
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

