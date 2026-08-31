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
  ExportFrame,
} from './imageExporter';
import { extractPlateBits, printExportCellSize, SUPERSAMPLE_PROOF_DEFAULT } from './printEngine';
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

  /*
   * Post-processing is stripped, deliberately, and this is the one export that
   * does so.
   *
   * A separation's plates must partition the opaque cells exactly (invariant
   * 9) — that is the only property that makes them reassemble into the image
   * on a press. A source overlay is a continuous photograph belonging to no
   * ink; a bloom and an aberration both spread colour across plate boundaries.
   * Any of the three turns a set of plates into three pictures that happen to
   * be in the same folder.
   */
  const frame = renderExportFrame({ ...opts, postProcess: undefined });
  const isPixel = frame.rasterMode === 'pixel';
  const isPrint = frame.rasterMode === 'print';
  const analysis = analyzeSeparation(frame, cols, rows);

  const printProofSs = opts.printConfig?.proofSupersample ?? SUPERSAMPLE_PROOF_DEFAULT;
  const printCell = printExportCellSize(scale, printProofSs);
  const cell = isPrint ? { w: printCell, h: printCell } : cellSize(isPixel, scale);
  const width = Math.round(cols * cell.w);
  const height = Math.round(rows * cell.h);

  /*
   * Print takes its own path entirely, and it is the shortest one here: the
   * plates exist on the frame already, screened, so there is no cell to mask
   * and no partition to preserve. One bitmap per ink, straight off `plateMask`.
   *
   * This is also the one separation whose plates legitimately *overlap*. See
   * PRINT_SEPARATION_IS_NATIVE in separation.ts for why invariant 9 is
   * suspended rather than quietly violated.
   */
  if (isPrint) {
    return exportPrintSeparation({
      frame,
      analysis,
      name,
      format,
      quality,
      width,
      height,
      style: format === 'jpg' ? 'ink' : style,
      layeredSvg,
      paperHex: opts.printConfig?.paper || frame.bgColor,
    });
  }

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

/**
 * One file per ink, off a screened print frame.
 *
 * Every plate is `bit p` of `plateMask` — literally the bits the viewport
 * painted — so a separation and the composite on screen cannot disagree about
 * where the dots are. Nothing re-screens, and there is no per-plate re-render to
 * let the dither land differently (the concern that shaped the cell path above);
 * here it is not even possible.
 *
 * `ink` style is what a press wants: black coverage on white, which is what a
 * plate *is*. `color` puts each ink in its own hue on transparency so the plates
 * stack back into the print — and in print mode that stack is genuinely correct
 * rather than approximate, because the composite really is an overprint.
 */
async function exportPrintSeparation(args: {
  frame: ExportFrame;
  analysis: SeparationAnalysis;
  name: string;
  format: 'png' | 'jpg' | 'svg';
  quality: number;
  width: number;
  height: number;
  style: SeparationStyle;
  layeredSvg: boolean;
  paperHex: string;
}): Promise<SeparationResult> {
  const { frame, analysis, name, format, quality, width, height, style, layeredSvg, paperHex } = args;
  const print = frame.print;

  if (!print || print.inks.length === 0) {
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

  const isInk = style === 'ink';
  const results: PrintPlateResult[] = [];
  const files: ZipEntry[] = [];
  const svgGroups: string[] = [];

  for (let p = 0; p < print.inks.length; p++) {
    const ink = print.inks[p];
    const index = String(p + 1).padStart(2, '0');
    /*
     * Numbered by print order, not by density. The cell path sorts dark to
     * light because that is the order a printer stacks arbitrary colours; here
     * the order is already known and meaningful — it is the sequence the drums
     * go through the machine in — so renumbering it would be losing
     * information, not adding it.
     */
    const slug = `plate-${index}-${ink.hex.slice(1)}`;
    const bits = extractPlateBits(print, p);

    if (format === 'svg') {
      // `luminance < 0` is absent, the sentinel the merger already reads.
      const lum = new Float32Array(bits.length);
      for (let i = 0; i < bits.length; i++) lum[i] = bits[i] ? 1 : -1;
      const svg = exportPixelRasterToSvg({
        cols: print.width,
        rows: print.height,
        luminance: lum,
        colors: null,
        bgColor: layeredSvg ? 'transparent' : isInk ? '#ffffff' : 'transparent',
        fgColor: isInk ? '#000000' : ink.hex,
        width,
        height,
        ...(layeredSvg ? { groupId: slug, groupLabel: `${index} ${ink.name}` } : {}),
      });

      if (layeredSvg) {
        svgGroups.push(svg);
        continue;
      }
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      files.push({ name: `${slug}.svg`, data: new Uint8Array(await blob.arrayBuffer()) });
      results.push({ name: slug, colorHex: ink.hex, blob, url: URL.createObjectURL(blob) });
      continue;
    }

    const blob = await paintPrintPlate({
      bits,
      srcW: print.width,
      srcH: print.height,
      width,
      height,
      fg: isInk ? '#000000' : ink.hex,
      bg: isInk ? '#ffffff' : null,
      format,
      quality,
    });
    files.push({
      name: `${slug}.${format === 'jpg' ? 'jpg' : 'png'}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    results.push({ name: slug, colorHex: ink.hex, blob, url: URL.createObjectURL(blob) });
  }

  if (format === 'svg' && layeredSvg) {
    const doc = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
        `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
      /*
       * The paper goes on the root, not in a layer — and for colour plates it is
       * the *stock*, not white. Stacking translucent inks over the wrong ground
       * is the single most common way a riso mock-up looks nothing like the
       * print, so the substrate ships with the file.
       */
      `  <rect width="100%" height="100%" fill="${isInk ? '#ffffff' : paperHex}"/>`,
      `  <g style="isolation:isolate">`,
      ...svgGroups.map((g) => (isInk ? g : g.replace('<g ', '<g style="mix-blend-mode:multiply" '))),
      `  </g>`,
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

/**
 * One binary plate onto a canvas at export size.
 *
 * Blits at the device raster's own resolution and lets `drawImage` scale, rather
 * than resolving through `resolvePrintFrame`: a plate is one flat ink, so there
 * is nothing to composite and no Yule-Nielsen averaging to do — that models
 * light scattering between *overprinted* inks and has no meaning on a single
 * separation. Smoothing stays on for the downscale, which is the right call
 * here: a plate destined for a press wants its dot edges anti-aliased rather
 * than aliased into a false pattern, same reason the resolve box-filters.
 */
function paintPrintPlate(args: {
  bits: Uint8Array;
  srcW: number;
  srcH: number;
  width: number;
  height: number;
  fg: string;
  bg: string | null;
  format: 'png' | 'jpg' | 'svg';
  quality: number;
}): Promise<Blob> {
  const { bits, srcW, srcH, width, height, fg, bg, format, quality } = args;

  const src = document.createElement('canvas');
  src.width = srcW;
  src.height = srcH;
  const sctx = src.getContext('2d');
  if (!sctx) return Promise.reject(new Error('Could not create 2D canvas context'));

  const img = sctx.createImageData(srcW, srcH);
  const data = img.data;
  const [fr, fg2, fb] = [
    parseInt(fg.slice(1, 3), 16) || 0,
    parseInt(fg.slice(3, 5), 16) || 0,
    parseInt(fg.slice(5, 7), 16) || 0,
  ];
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const o = i * 4;
    data[o] = fr;
    data[o + 1] = fg2;
    data[o + 2] = fb;
    data[o + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) return Promise.reject(new Error('Could not create 2D canvas context'));
  if (bg) {
    octx.fillStyle = bg;
    octx.fillRect(0, 0, width, height);
  }
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0, srcW, srcH, 0, 0, width, height);

  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to generate plate blob'))),
      mimeType,
      format === 'jpg' ? quality : undefined
    );
  });
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
