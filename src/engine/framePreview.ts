/**
 * Nearest-neighbour expansion of a rendered frame back up to a target grid.
 *
 * Used to make interactive edits cheap. Rasterizing is superlinear in cell
 * count once the spatial filters are in play, so dragging a slider on a large
 * grid costs far more than a frame and the app stops answering. Rendering at a
 * fraction of the grid and expanding the result costs a fraction of that, and
 * the expansion itself is a straight copy -- no dither, no filters, no colour
 * matching -- so it is an order of magnitude cheaper than the pass it replaces.
 *
 * The point of expanding rather than handing the viewport a smaller frame is
 * that AsciiViewport lays out from its `cols` / `rows` props, not from the
 * frame. A frame whose dimensions disagreed with those props would mis-index
 * the colour buffer and draw garbage, so the frame has to come back out at full
 * size. Callers pass the same cols/rows they would have rendered at.
 *
 * Output is visibly chunkier, which is the intended signal that this is a
 * preview: the caller follows it with a full-resolution pass once editing
 * stops.
 */

export interface PreviewFrame {
  text: string;
  colors: Uint8ClampedArray | null;
}

/**
 * Pick a divisor for the preview pass from what the last full render cost.
 *
 * Returns 1 when there is nothing to gain -- a frame that already renders
 * inside a display refresh should just render, since the expansion is not free
 * and a chunky preview for no reason is worse than none.
 */
export function choosePreviewDivisor(lastRenderMs: number): number {
  if (lastRenderMs > 120) return 4;
  if (lastRenderMs > 45) return 3;
  if (lastRenderMs > 18) return 2;
  return 1;
}

/**
 * Expand `text` (newline-separated rows) and its parallel RGB buffer from
 * srcCols x srcRows up to dstCols x dstRows.
 *
 * Short rows are padded and long ones clipped rather than trusted, because the
 * frame text is produced by a renderer that may emit a trailing newline or a
 * ragged final row, and an off-by-one here would shear the whole image.
 */
export function upscaleFrame(
  text: string,
  colors: Uint8ClampedArray | null,
  srcCols: number,
  srcRows: number,
  dstCols: number,
  dstRows: number
): PreviewFrame {
  if (srcCols <= 0 || srcRows <= 0 || dstCols <= 0 || dstRows <= 0) {
    return { text, colors };
  }
  if (srcCols === dstCols && srcRows === dstRows) {
    return { text, colors };
  }

  const srcLines = text.split('\n');
  const outLines: string[] = new Array(dstRows);
  const outColors = colors ? new Uint8ClampedArray(dstCols * dstRows * 3) : null;

  /*
   * Precompute the column map once. It is the same for every row, and doing it
   * per cell was measurably the bulk of the expansion's cost on a large grid.
   */
  const colMap = new Int32Array(dstCols);
  for (let x = 0; x < dstCols; x++) {
    colMap[x] = Math.min(srcCols - 1, Math.floor((x * srcCols) / dstCols));
  }

  /*
   * Consecutive output rows map to the same source row -- that is what the
   * divisor means -- so each distinct row is built once and then repeated.
   * Building every row independently made the expansion cost a real fraction
   * of the render it was meant to replace (39ms of a 1.9M-cell frame, most of
   * it in per-row string joins). The source index is monotonic, so a
   * single-slot cache is all this needs.
   */
  const rowChars = new Array<string>(dstCols);
  let builtSy = -1;
  let builtLine = '';
  let builtRowStart = -1;

  for (let y = 0; y < dstRows; y++) {
    const sy = Math.min(srcRows - 1, Math.floor((y * srcRows) / dstRows));
    const dstRowStart = y * dstCols * 3;

    if (sy !== builtSy) {
      const srcLine = srcLines[sy] ?? '';
      for (let x = 0; x < dstCols; x++) {
        const sx = colMap[x];
        rowChars[x] = srcLine[sx] ?? ' ';

        if (outColors && colors) {
          const s = (sy * srcCols + sx) * 3;
          const d = dstRowStart + x * 3;
          outColors[d] = colors[s];
          outColors[d + 1] = colors[s + 1];
          outColors[d + 2] = colors[s + 2];
        }
      }
      builtSy = sy;
      builtLine = rowChars.join('');
      builtRowStart = dstRowStart;
    } else if (outColors && builtRowStart >= 0) {
      /* Same source row: a block memmove beats re-reading it cell by cell. */
      outColors.copyWithin(dstRowStart, builtRowStart, builtRowStart + dstCols * 3);
    }

    outLines[y] = builtLine;
  }

  return { text: outLines.join('\n'), colors: outColors };
}
