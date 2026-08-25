import { MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from './renderer';

export interface PixelRasterContext {
  ctx: CanvasRenderingContext2D;
  cols: number;
  rows: number;
  luminance: Float32Array; // size = cols * rows, values in [0, 1] (-1 for transparent)
  colors?: Uint8ClampedArray | null; // RGB buffer (size = cols * rows * 3)
  bgColor: string;
  fgColor: string;
  cellWidth?: number;
  cellHeight?: number;
  dpr?: number;
}

export interface PixelRasterSvgOptions {
  cols: number;
  rows: number;
  luminance: Float32Array;
  colors?: Uint8ClampedArray | null;
  bgColor: string;
  fgColor: string;
  width?: number;
  height?: number;
  /**
   * Emit a bare `<g id="...">` rather than a whole SVG document, for callers
   * assembling several rasters into one file as layers. The background rect is
   * skipped in this mode -- a layer that paints its own opaque ground would
   * hide every layer beneath it.
   */
  groupId?: string;
  /** Human-readable layer name; defaults to groupId. */
  groupLabel?: string;
}

/**
 * Paints one filled cell per grid position, straight to a 2D canvas.
 *
 * Cells carry their own colour when a colour buffer is supplied; otherwise the
 * foreground colour is modulated by luminance so greyscale frames keep their
 * tonal range. Negative luminance marks a transparent cell and is skipped.
 */
export function drawPixelRasterToCanvas(renderCtx: PixelRasterContext): void {
  const {
    ctx,
    cols,
    rows,
    luminance,
    colors,
    bgColor,
    fgColor,
    cellWidth = MONOSPACE_CELL_WIDTH,
    cellHeight = MONOSPACE_CELL_HEIGHT,
    dpr = 1,
  } = renderCtx;

  const width = cols * cellWidth;
  const height = rows * cellHeight;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Clear transparently first so 'transparent' backgrounds survive export
  ctx.clearRect(0, 0, width, height);
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  for (let y = 0; y < rows; y++) {
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      const idx = rowOff + x;
      const lum = luminance[idx];
      if (lum < 0) continue;

      if (colors && colors.length >= (idx + 1) * 3) {
        ctx.fillStyle = `rgb(${colors[idx * 3]}, ${colors[idx * 3 + 1]}, ${colors[idx * 3 + 2]})`;
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = fgColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, lum));
      }

      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }

  ctx.restore();
}

/** Attribute-safe XML. Plate labels are hex colours today, but ids are cheap to break. */
function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * A merged rectangle in cell units, before it is written into path data.
 */
interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Greedy rectangle merge over the grid, grouped by fill.
 *
 * `keyOf(index)` returns the fill key for a cell, or null when the cell is not
 * painted. Cells sharing a key are merged into as few rectangles as possible:
 * first into horizontal runs within a row, then vertically wherever the run
 * directly above has the same key, start and width.
 *
 * This is the classic two-pass greedy mesh. It is not guaranteed minimal --
 * that problem is NP-hard for general polygons -- but it collapses the cases
 * that actually occur: flat backgrounds, palette regions, and the long
 * horizontal runs that dithering produces.
 */
function mergeCellRects(
  cols: number,
  rows: number,
  keyOf: (index: number) => string | null
): Map<string, CellRect[]> {
  const out = new Map<string, CellRect[]>();
  /** Runs from the previous row that a matching run below can still extend. */
  let open = new Map<string, CellRect>();

  const close = (rect: CellRect, key: string) => {
    const list = out.get(key);
    if (list) list.push(rect);
    else out.set(key, [rect]);
  };

  for (let y = 0; y < rows; y++) {
    const next = new Map<string, CellRect>();
    const rowOff = y * cols;

    let x = 0;
    while (x < cols) {
      const key = keyOf(rowOff + x);
      if (key === null) {
        x++;
        continue;
      }
      // Extend the run while the key holds.
      let end = x + 1;
      while (end < cols && keyOf(rowOff + end) === key) end++;
      const w = end - x;

      const runId = `${key}|${x}|${w}`;
      const above = open.get(runId);
      if (above) {
        // Identical run directly above: grow it downward instead of emitting.
        above.h++;
        next.set(runId, above);
        open.delete(runId);
      } else {
        next.set(runId, { x, y, w, h: 1 });
      }
      x = end;
    }

    // Anything still open was not continued by this row, so it is finished.
    open.forEach((rect, id) => close(rect, id.slice(0, id.indexOf('|'))));
    open = next;
  }

  open.forEach((rect, id) => close(rect, id.slice(0, id.indexOf('|'))));
  return out;
}

/**
 * `<path>` data for a set of rectangles, in cell units.
 *
 * Two compactions on top of using one path for the whole set:
 *
 *  - `h`/`v` rather than `l`, because every rectangle is axis-aligned:
 *    "M3 4h5v2h-5z" against "M3,4 L8,4 L8,6 L3,6 Z".
 *  - relative `m` after the first subpath. `z` returns the point to the
 *    subpath's start, so each rectangle can be placed as an offset from the
 *    last. The rectangles arrive in row-major order, so those offsets are
 *    almost always one or two digits where absolute coordinates would be three
 *    or four -- which is most of the file on heavily dithered output.
 */
function rectsToPathData(rects: CellRect[]): string {
  let d = '';
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (i === 0) {
      d += `M${r.x} ${r.y}`;
    } else {
      const dx = r.x - cx;
      const dy = r.y - cy;
      // A leading minus already separates the two numbers, so "m5-3" is valid
      // and one byte shorter than "m5 -3".
      d += dy < 0 ? `m${dx}${dy}` : `m${dx} ${dy}`;
    }
    d += `h${r.w}v${r.h}h-${r.w}z`;
    cx = r.x;
    cy = r.y;
  }
  return d;
}

/**
 * Same raster as drawPixelRasterToCanvas, emitted as resolution-independent SVG.
 *
 * With `groupId` set it emits a bare `<g>` instead of a whole document, so the
 * colour-separation export can stack one group per ink inside a single root --
 * which is what Illustrator and Figma read as layers.
 *
 * **On size.** This used to emit one `<rect>` per cell. A 500x400 grid is
 * 200,000 elements at ~90 bytes each: an 18 MB file, and -- worse for an
 * editor -- 200,000 vector nodes for Figma to instantiate, which is what
 * actually crashed it. Three things fix that:
 *
 *  1. Cells are merged into as few rectangles as possible (see mergeCellRects).
 *  2. All rectangles sharing a fill become ONE `<path>`. A separation plate is
 *     a single colour by definition, so a plate is now one node.
 *  3. Geometry is written in cell units as integers, with a `scale()` on the
 *     wrapping group doing the real sizing. "M3 4h5v1h-5z" rather than
 *     x="18.05" y="40.00" width="30.08" height="10.00".
 *
 * `shape-rendering="crispEdges"` suppresses the hairline seams that otherwise
 * show between abutting subpaths at fractional zoom levels.
 */
export function exportPixelRasterToSvg(opts: PixelRasterSvgOptions): string {
  const {
    cols,
    rows,
    luminance,
    colors,
    bgColor,
    fgColor,
    width = cols * MONOSPACE_CELL_WIDTH,
    height = rows * MONOSPACE_CELL_HEIGHT,
    groupId,
    groupLabel,
  } = opts;

  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const asGroup = Boolean(groupId);

  /*
   * The fill key doubles as the grouping key and as the source of the paint
   * attributes, so it carries everything that makes two cells non-mergeable.
   *
   * With a colour buffer that is the RGB triple. Without one, tone lives in
   * per-cell opacity instead, quantized to 2dp -- at 8-bit output the eye
   * cannot separate neighbouring hundredths, and leaving it continuous would
   * mean a distinct group per distinct float and no merging at all.
   */
  const keyOf = (i: number): string | null => {
    const lum = luminance[i];
    // Only alpha-cutout cells are omitted; dark cells are real pixels and
    // dropping them would punch holes through the shadows.
    if (lum < 0) return null;
    if (colors) {
      const o = i * 3;
      return `rgb(${colors[o]},${colors[o + 1]},${colors[o + 2]})`;
    }
    return `${fgColor} ${Math.max(0, Math.min(1, lum)).toFixed(2)}`;
  };

  const groups = mergeCellRects(cols, rows, keyOf);

  const elements: string[] = [];
  if (asGroup) {
    // inkscape:label is what Illustrator, Inkscape and Figma surface as the
    // layer name; id alone shows up as "Group 1".
    const label = escapeXmlAttr(groupLabel || groupId!);
    elements.push(`  <g id="${escapeXmlAttr(groupId!)}" inkscape:label="${label}" data-plate="${label}">`);
  } else {
    elements.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    elements.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width}" height="${height}">`);
    if (bgColor && bgColor !== 'transparent' && bgColor !== 'none') {
      elements.push(`  <rect width="100%" height="100%" fill="${bgColor}"/>`);
    }
  }

  // Trailing zeros trimmed: scale(6.015 10) not scale(6.0150 10.0000).
  const sx = Number(cellWidth.toFixed(4));
  const sy = Number(cellHeight.toFixed(4));
  const needsScale = sx !== 1 || sy !== 1;
  const indent = asGroup ? '    ' : '  ';

  if (needsScale) {
    elements.push(`${indent}<g transform="scale(${sx} ${sy})" shape-rendering="crispEdges">`);
  } else {
    elements.push(`${indent}<g shape-rendering="crispEdges">`);
  }

  groups.forEach((rects, key) => {
    if (rects.length === 0) return;
    const d = rectsToPathData(rects);
    if (colors) {
      elements.push(`${indent}  <path fill="${key}" d="${d}"/>`);
    } else {
      // key is "<fill> <opacity>"; fill may itself contain spaces ("rgb(1, 2, 3)").
      const cut = key.lastIndexOf(' ');
      const fill = key.slice(0, cut);
      const op = key.slice(cut + 1);
      elements.push(`${indent}  <path fill="${fill}" fill-opacity="${op}" d="${d}"/>`);
    }
  });

  elements.push(`${indent}</g>`);
  elements.push(asGroup ? `  </g>` : `</svg>`);
  return elements.join('\n');
}
