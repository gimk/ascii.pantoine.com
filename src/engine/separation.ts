/**
 * Colour separation, the pure half: which inks a frame contains, and which
 * cells belong to each.
 *
 * Kept free of canvas, Blob and ZIP so it is testable on its own -- the
 * partition property below is the one thing that has to be exactly right, and
 * it should not need a browser to check. separationExporter.ts does the
 * painting and packaging on top of this.
 *
 * Everything here rests on one property of the pipeline: `luminance[i] < 0` is
 * the transparency sentinel and every painter already skips those cells
 * (pipeline.md invariants 1 and 2). Masking a plate is therefore just writing
 * -1 into the cells belonging to other inks, and no painter needs to change.
 */

import type { ExportFrame } from './imageExporter';

/**
 * Distinct colours above which a separation stops being useful.
 *
 * Not a technical limit -- it is the point where "edit each colour separately"
 * describes an impossible afternoon. In practice the real count is far lower
 * by construction: an indexed palette yields exactly its own entries,
 * 2color/3color yield 2 or 3, and pixel output with an explicit Quantize
 * Levels yields that many greys. Only `content` colour, which is continuous,
 * runs past it, and the answer there is to quantize first.
 */
export const MAX_PLATES = 64;

export interface SeparationPlate {
  /** '#rrggbb' */
  hex: string;
  r: number;
  g: number;
  b: number;
  /** Opaque cells painted in this colour. */
  cellCount: number;
}

export type SeparationStyle =
  /** Each plate in its own colour on transparency. Stack them to rebuild the image. */
  | 'color'
  /** Coverage mask: black on white, what a press wants. Survives JPG. */
  | 'ink';

export interface SeparationAnalysis {
  plates: SeparationPlate[];
  /** Total opaque cells in the frame. The plates partition exactly this. */
  opaqueCells: number;
  /**
   * Why a separation is not available, if it is not.
   *  - 'mono'      the frame carries no colour buffer at all
   *  - 'too-many'  more distinct colours than MAX_PLATES
   *  - 'empty'     nothing opaque to separate
   *  - 'vector'    the frame is beam geometry, which has no cells to partition
   */
  refusal?: 'mono' | 'too-many' | 'empty' | 'vector';
  /** Distinct colours found, reported even when it exceeds MAX_PLATES. */
  distinctColors: number;
}

/** Just the fields the separation reads, so tests need not build a whole frame. */
export type SeparableFrame = Pick<ExportFrame, 'text' | 'colors' | 'luminance'> & {
  rasterMode?: ExportFrame['rasterMode'];
};

/**
 * Enumerates the inks in a rendered frame.
 *
 * A frame with `colors === null` is the monochrome path: the pipeline left
 * colour to CSS downstream (pipeline.md §2.4), so there is exactly one ink and
 * nothing to separate. That is a refusal carrying a reason, not an empty list
 * -- the caller should say why rather than hand back a zero-file archive.
 */
export function analyzeSeparation(
  frame: SeparableFrame,
  cols: number,
  rows: number
): SeparationAnalysis {
  const { colors, luminance } = frame;

  /*
   * A plate is defined as a subset of the opaque *cells*, and every painter
   * masks by writing the -1 sentinel into the cells belonging to other inks.
   * Vector output has no cells, so the whole mechanism has nothing to act on --
   * it would fall through to the mono refusal and blame the colour panel for
   * something the colour panel cannot fix.
   *
   * The vector version is genuinely easy and worth doing later: group the
   * polylines by stroke colour, one SVG layer each, and it partitions by
   * construction. It is simply not this code path.
   */
  if (frame.rasterMode === 'vector') {
    return { plates: [], opaqueCells: 0, refusal: 'vector', distinctColors: 0 };
  }

  if (!colors || colors.length === 0) {
    return { plates: [], opaqueCells: 0, refusal: 'mono', distinctColors: 1 };
  }

  const total = cols * rows;
  const counts = new Map<number, number>();
  let opaqueCells = 0;

  for (let i = 0; i < total; i++) {
    // No luminance buffer means nothing was cut out, so every cell counts.
    if (luminance && luminance[i] < 0) continue;
    opaqueCells++;
    const o = i * 3;
    const key = (colors[o] << 16) | (colors[o + 1] << 8) | colors[o + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const distinctColors = counts.size;
  if (opaqueCells === 0) {
    return { plates: [], opaqueCells: 0, refusal: 'empty', distinctColors };
  }
  if (distinctColors > MAX_PLATES) {
    return { plates: [], opaqueCells, refusal: 'too-many', distinctColors };
  }

  const plates: SeparationPlate[] = [];
  counts.forEach((cellCount, key) => {
    const r = (key >> 16) & 255;
    const g = (key >> 8) & 255;
    const b = key & 255;
    plates.push({ hex: rgbToHex(r, g, b), r, g, b, cellCount });
  });

  // Dark to light, so plate 01 is the shadow ink -- the order a printer stacks
  // them, and a stable order between exports of the same image.
  plates.sort((a, b) => luma(a) - luma(b) || a.hex.localeCompare(b.hex));
  return { plates, opaqueCells, distinctColors };
}

export function luma(p: { r: number; g: number; b: number }): number {
  return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function cellBelongsTo(
  frame: SeparableFrame,
  plate: SeparationPlate,
  i: number
): boolean {
  const lum = frame.luminance;
  if (lum && lum[i] < 0) return false;
  const colors = frame.colors!;
  const o = i * 3;
  return colors[o] === plate.r && colors[o + 1] === plate.g && colors[o + 2] === plate.b;
}

/**
 * Luminance buffer for one plate: the frame's own values where the cell is
 * this ink, the transparency sentinel everywhere else.
 *
 * A frame with no luminance buffer is treated as fully opaque, which is what
 * the painters assume too.
 */
export function maskLuminance(
  frame: SeparableFrame,
  plate: SeparationPlate,
  cols: number,
  rows: number
): Float32Array {
  const total = cols * rows;
  const out = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    /*
     * Kept cells carry 1, not their graded luminance. A plate is coverage: the
     * cell is this ink or it is not. Handing the painter a dark value would
     * make an ink plate render its own shadows as grey, and in colour mode the
     * value is unused anyway because `colors` drives the fill.
     */
    out[i] = cellBelongsTo(frame, plate, i) ? 1 : -1;
  }
  return out;
}

/** The frame's text with every cell outside this plate blanked to a space. */
export function maskText(
  frame: SeparableFrame,
  plate: SeparationPlate,
  cols: number,
  rows: number
): string {
  const lines = frame.text.split('\n');
  const out: string[] = [];

  for (let y = 0; y < rows; y++) {
    const line = lines[y] || '';
    let row = '';
    for (let x = 0; x < cols; x++) {
      const ch = line[x] || ' ';
      row += cellBelongsTo(frame, plate, y * cols + x) ? ch : ' ';
    }
    out.push(row);
  }
  return out.join('\n');
}
