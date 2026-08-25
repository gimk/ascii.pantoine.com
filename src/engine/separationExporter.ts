/**
 * Colour separation: one file per ink, so each colour can be edited on its own
 * in Illustrator, Figma, or on a screen-printing press.
 *
 * This half does the painting and the packaging. The logic that decides which
 * inks exist and which cells belong to each is in separation.ts, kept free of
 * canvas and Blob so its partition property can be verified without a browser.
 */

import {
  ImageExportOptions,
  renderExportFrame,
  PrintPlateResult,
} from './imageExporter';
import { MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from './renderer';
import { drawPixelRasterToCanvas, exportPixelRasterToSvg } from './pixelRasterRenderer';
import { createZip, ZipEntry } from './zip';
import {
  analyzeSeparation,
  maskLuminance,
  maskText,
  SeparationAnalysis,
  SeparationStyle,
} from './separation';

export type { SeparationPlate, SeparationAnalysis, SeparationStyle } from './separation';
export { MAX_PLATES, analyzeSeparation } from './separation';

export interface SeparationExportOptions extends ImageExportOptions {
  style?: SeparationStyle;
  /** SVG only: one file with a layer per ink, instead of one file per ink. */
  layeredSvg?: boolean;
}

export interface SeparationResult {
  analysis: SeparationAnalysis;
  plates: PrintPlateResult[];
  /** The archive, or the single layered SVG. Null when the separation was refused. */
  blob: Blob | null;
  url: string | null;
  fileName: string;
  width: number;
  height: number;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * One ASCII plate as SVG text runs, mirroring exportAsciiImage's ASCII branch.
 *
 * Needed because exportPixelRasterToSvg draws rects. Running an ASCII
 * separation through it would emit squares where the glyphs should be -- the
 * plates would be correct as masks and wrong as artwork.
 *
 * A plate is a single ink by definition, so the whole thing is one fill colour
 * and each row can stay a single <text> run rather than one node per cell.
 */
function buildAsciiPlateSvg(args: {
  maskedText: string;
  rows: number;
  cellHeight: number;
  scale: number;
  fill: string;
  width: number;
  height: number;
  bgColor: string;
  groupId?: string;
  groupLabel?: string;
}): string {
  const { maskedText, rows, cellHeight, scale, fill, width, height, bgColor, groupId, groupLabel } = args;
  const asGroup = Boolean(groupId);
  const lines = maskedText.split('\n');
  const out: string[] = [];

  if (asGroup) {
    const label = escapeXmlText(groupLabel || groupId!);
    out.push(`  <g id="${escapeXmlText(groupId!)}" inkscape:label="${label}" data-plate="${label}">`);
  } else {
    out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
    if (bgColor && bgColor !== 'transparent') {
      out.push(`  <rect width="100%" height="100%" fill="${bgColor}"/>`);
    }
  }

  out.push(
    `  <g font-family="monospace" font-size="${10 * scale}px" fill="${fill}" xml:space="preserve">`
  );
  for (let r = 0; r < rows && r < lines.length; r++) {
    const line = lines[r];
    // A row that is all spaces belongs entirely to other plates.
    if (!line || !line.trim()) continue;
    out.push(`    <text x="0" y="${((r + 0.8) * cellHeight).toFixed(2)}">${escapeXmlText(line)}</text>`);
  }
  out.push(`  </g>`);

  out.push(asGroup ? `  </g>` : `</svg>`);
  return out.join('\n');
}

/** Cell size in export pixels, matching exportAsciiImage exactly. */
function cellSize(isPixel: boolean, scale: number): { w: number; h: number } {
  return isPixel
    ? { w: Math.max(1, Math.round(scale)), h: Math.max(1, Math.round(scale)) }
    : { w: MONOSPACE_CELL_WIDTH * scale, h: MONOSPACE_CELL_HEIGHT * scale };
}

/**
 * Renders the frame once, then paints one file per ink.
 *
 * The frame is deliberately rendered a single time and re-masked per plate: a
 * per-plate re-render would be N times the work and, worse, N chances for the
 * dither to land differently and leave the plates not quite adding back up to
 * the original.
 */
export async function exportColorSeparation(
  opts: SeparationExportOptions
): Promise<SeparationResult> {
  const {
    name = 'raster-art',
    format = 'png',
    quality = 0.95,
    scale = 2.0,
    cols,
    rows,
    style = 'color',
    layeredSvg = false,
  } = opts;

  const frame = renderExportFrame(opts);
  const isPixel = frame.rasterMode === 'pixel';
  const analysis = analyzeSeparation(frame, cols, rows);

  const cell = cellSize(isPixel, scale);
  const width = Math.round(cols * cell.w);
  const height = Math.round(rows * cell.h);

  if (analysis.refusal) {
    return {
      analysis,
      plates: [],
      blob: null,
      url: null,
      fileName: `${name}-plates`,
      width,
      height,
    };
  }

  /*
   * JPG has no alpha, so a colour plate would arrive on an opaque ground and
   * the stack-to-rebuild workflow is gone. Force ink plates rather than emit
   * something that silently does not work.
   */
  const effectiveStyle: SeparationStyle = format === 'jpg' ? 'ink' : style;
  const isInk = effectiveStyle === 'ink';

  // Ink plates are a coverage mask; colour plates sit on nothing so they stack.
  const plateBg = isInk ? '#ffffff' : 'transparent';
  const plateFg = isInk ? '#000000' : frame.fgColor;

  const results: PrintPlateResult[] = [];
  const files: ZipEntry[] = [];
  const svgGroups: string[] = [];

  for (let p = 0; p < analysis.plates.length; p++) {
    const plate = analysis.plates[p];
    const index = String(p + 1).padStart(2, '0');
    const slug = `plate-${index}-${plate.hex.slice(1)}`;
    const plateLum = maskLuminance(frame, plate, cols, rows);
    // Ink plates drop the colour buffer entirely, which is what makes the
    // painters fall back to fgColor -- black -- for every cell they keep.
    const plateColors = isInk ? null : frame.colors;

    if (format === 'svg') {
      const svg = isPixel
        ? exportPixelRasterToSvg({
            cols,
            rows,
            luminance: plateLum,
            colors: plateColors,
            bgColor: layeredSvg ? 'transparent' : plateBg,
            fgColor: plateFg,
            width,
            height,
            ...(layeredSvg ? { groupId: slug, groupLabel: plate.hex } : {}),
          })
        : buildAsciiPlateSvg({
            maskedText: maskText(frame, plate, cols, rows),
            rows,
            cellHeight: cell.h,
            scale,
            // One ink per plate, so the whole run takes one fill.
            fill: isInk ? '#000000' : plate.hex,
            width,
            height,
            bgColor: layeredSvg ? 'transparent' : plateBg,
            ...(layeredSvg ? { groupId: slug, groupLabel: plate.hex } : {}),
          });

      if (layeredSvg) {
        svgGroups.push(svg);
        continue;
      }

      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      files.push({ name: `${slug}.svg`, data: new Uint8Array(await blob.arrayBuffer()) });
      results.push({ name: slug, colorHex: plate.hex, blob, url: URL.createObjectURL(blob) });
      continue;
    }

    const blob = await paintPlate({
      cols,
      rows,
      width,
      height,
      cell,
      isPixel,
      luminance: plateLum,
      colors: plateColors,
      text: isPixel ? '' : maskText(frame, plate, cols, rows),
      bgColor: plateBg,
      fgColor: plateFg,
      scale,
      format,
      quality,
    });

    files.push({
      name: `${slug}.${format === 'jpg' ? 'jpg' : 'png'}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    results.push({ name: slug, colorHex: plate.hex, blob, url: URL.createObjectURL(blob) });
  }

  if (format === 'svg' && layeredSvg) {
    const doc = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
        `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
      /*
       * Ink plates want their white ground, but it belongs to the document,
       * not to a layer -- a layer painting its own opaque background would
       * hide every layer beneath it. Colour plates get nothing, so stacking
       * them reproduces the image over whatever they are placed on.
       */
      ...(isInk ? [`  <rect width="100%" height="100%" fill="#ffffff"/>`] : []),
      ...svgGroups,
      `</svg>`,
    ].join('\n');
    const blob = new Blob([doc], { type: 'image/svg+xml;charset=utf-8' });
    return {
      analysis,
      plates: results,
      blob,
      url: URL.createObjectURL(blob),
      fileName: `${name}-plates.svg`,
      width,
      height,
    };
  }

  const zip = createZip(files);
  return {
    analysis,
    plates: results,
    blob: zip,
    url: URL.createObjectURL(zip),
    fileName: `${name}-plates.zip`,
    width,
    height,
  };
}

interface PaintPlateArgs {
  cols: number;
  rows: number;
  width: number;
  height: number;
  cell: { w: number; h: number };
  isPixel: boolean;
  luminance: Float32Array;
  colors: Uint8ClampedArray | null;
  text: string;
  bgColor: string;
  fgColor: string;
  scale: number;
  format: 'png' | 'jpg' | 'svg';
  quality: number;
}

/**
 * One plate onto a canvas, through the same painters the still export uses.
 *
 * No CRT effects here in either raster mode. Scanlines and bloom on a
 * separation would bake a screen artefact into every plate and it would
 * compound N times over when they are stacked back up.
 */
function paintPlate(args: PaintPlateArgs): Promise<Blob> {
  const { cols, rows, width, height, cell, isPixel, luminance, colors, text, bgColor, fgColor, scale, format, quality } = args;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Promise.reject(new Error('Could not create 2D canvas context'));

  if (isPixel) {
    drawPixelRasterToCanvas({
      ctx,
      cols,
      rows,
      luminance,
      colors,
      bgColor,
      fgColor,
      cellWidth: cell.w,
      cellHeight: cell.h,
      dpr: 1,
    });
  } else {
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.font = `${Math.round(10 * scale)}px 'JuliaMono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;

    const lines = text.split('\n');
    for (let row = 0; row < rows; row++) {
      const line = lines[row] || '';
      for (let col = 0; col < cols && col < line.length; col++) {
        const ch = line[col];
        if (!ch || ch === ' ') continue;
        const i = row * cols + col;
        ctx.fillStyle = colors
          ? `rgb(${colors[i * 3]}, ${colors[i * 3 + 1]}, ${colors[i * 3 + 2]})`
          : fgColor;
        ctx.fillText(ch, Math.round(col * cell.w), Math.round(row * cell.h));
      }
    }
  }

  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to generate plate blob'))),
      mimeType,
      format === 'jpg' ? quality : undefined
    );
  });
}
