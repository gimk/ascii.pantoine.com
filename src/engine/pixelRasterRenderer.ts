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

/**
 * Same raster as drawPixelRasterToCanvas, emitted as resolution-independent SVG.
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
  } = opts;

  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const elements: string[] = [];
  elements.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  elements.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width}" height="${height}">`);
  elements.push(`  <rect width="100%" height="100%" fill="${bgColor}"/>`);

  for (let y = 0; y < rows; y++) {
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      const idx = rowOff + x;
      const lum = luminance[idx];
      // Only alpha-cutout cells are omitted; dark cells are real pixels and
      // dropping them would punch holes through the shadows.
      if (lum < 0) continue;

      const px = (x * cellWidth).toFixed(2);
      const py = (y * cellHeight).toFixed(2);
      const pw = cellWidth.toFixed(2);
      const ph = cellHeight.toFixed(2);
      const fill = colors ? `rgb(${colors[idx * 3]},${colors[idx * 3 + 1]},${colors[idx * 3 + 2]})` : fgColor;
      const op = colors ? '1.0' : lum.toFixed(2);

      elements.push(`  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${fill}" opacity="${op}"/>`);
    }
  }

  elements.push(`</svg>`);
  return elements.join('\n');
}
