import { HalftoneConfig, RasterOutputMode } from '../types/ascii';

export interface HalftoneRenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cols: number;
  rows: number;
  luminance: Float32Array; // size = cols * rows, values in [0, 1] (-1 for transparent)
  colors?: Uint8ClampedArray | null; // RGB buffer (size = cols * rows * 3)
  bgColor: string;
  fgColor: string;
  config: HalftoneConfig;
  mode: RasterOutputMode;
  cellWidth?: number;
  cellHeight?: number;
  dpr?: number;
}

export interface HalftoneSvgOptions {
  cols: number;
  rows: number;
  luminance: Float32Array;
  colors?: Uint8ClampedArray | null;
  bgColor: string;
  fgColor: string;
  config: HalftoneConfig;
  mode: RasterOutputMode;
  width?: number;
  height?: number;
}

/**
 * Draws geometric halftones (Dots, Lines, Crosshatch, CMYK rosettes, or Pixel Dither)
 * directly to a 2D HTML5 Canvas with sub-pixel sharpness and Retina DPR scaling.
 */
export function drawHalftoneToCanvas(renderCtx: HalftoneRenderContext): void {
  const {
    ctx,
    cols,
    rows,
    luminance,
    colors,
    bgColor,
    fgColor,
    config,
    mode,
    cellWidth = 6.015,
    cellHeight = 10.0,
    dpr = 1,
  } = renderCtx;

  const width = cols * cellWidth;
  const height = rows * cellHeight;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Clear background transparently (matches terminal viewport)
  ctx.clearRect(0, 0, width, height);
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  const dotScale = config.dotScale || 1.0;
  const minSize = config.minSize || 0.05;
  const maxSize = config.maxSize || 1.0;
  const maxRadius = (Math.min(cellWidth, cellHeight) / 2.0) * dotScale;

  // 1. GEOMETRIC DOT HALFTONE
  if (mode === 'halftone-dot') {
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.01) continue;

        const cx = x * cellWidth + cellWidth / 2;
        const cy = y * cellHeight + cellHeight / 2;
        const strength = minSize + (maxSize - minSize) * lum;
        const rad = strength * maxRadius;

        if (colors && colors.length >= (idx + 1) * 3) {
          ctx.fillStyle = `rgb(${colors[idx * 3]}, ${colors[idx * 3 + 1]}, ${colors[idx * 3 + 2]})`;
        } else {
          ctx.fillStyle = fgColor;
        }

        if (config.dotShape === 'square') {
          const side = rad * 1.6;
          ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
        } else if (config.dotShape === 'diamond') {
          const side = rad * 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy - side);
          ctx.lineTo(cx + side, cy);
          ctx.lineTo(cx, cy + side);
          ctx.lineTo(cx - side, cy);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.5, rad), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    return;
  }

  // 2. 1-BIT / MULTI-BIT PIXEL / GRAPHIC BITMAP DITHER
  if (mode === 'pixel' || mode === 'graphic') {
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
    return;
  }

  ctx.restore();
}

/**
 * Generates an ultra-crisp, resolution-independent Vector SVG representation of the halftone/raster frame.
 */
export function exportHalftoneToSvg(opts: HalftoneSvgOptions): string {
  const {
    cols,
    rows,
    luminance,
    colors,
    bgColor,
    fgColor,
    config,
    mode,
    width = cols * 6.015,
    height = rows * 10.0,
  } = opts;

  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const dotScale = config.dotScale || 1.0;
  const maxRadius = (Math.min(cellWidth, cellHeight) / 2.0) * dotScale;

  const elements: string[] = [];
  elements.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  elements.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width}" height="${height}">`);
  elements.push(`  <rect width="100%" height="100%" fill="${bgColor}"/>`);

  if (mode === 'halftone-dot') {
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.01) continue;

        const cx = (x * cellWidth + cellWidth / 2).toFixed(2);
        const cy = (y * cellHeight + cellHeight / 2).toFixed(2);
        const rad = Math.max(0.4, lum * maxRadius).toFixed(2);
        const fill = colors ? `rgb(${colors[idx * 3]},${colors[idx * 3 + 1]},${colors[idx * 3 + 2]})` : fgColor;

        if (config.dotShape === 'square') {
          const side = (parseFloat(rad) * 1.6).toFixed(2);
          const px = (parseFloat(cx) - parseFloat(side) / 2).toFixed(2);
          const py = (parseFloat(cy) - parseFloat(side) / 2).toFixed(2);
          elements.push(`  <rect x="${px}" y="${py}" width="${side}" height="${side}" fill="${fill}"/>`);
        } else {
          elements.push(`  <circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}"/>`);
        }
      }
    }
  } else if (mode === 'pixel' || mode === 'graphic') {
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.01) continue;
        const px = (x * cellWidth).toFixed(2);
        const py = (y * cellHeight).toFixed(2);
        const pw = cellWidth.toFixed(2);
        const ph = cellHeight.toFixed(2);
        const fill = colors ? `rgb(${colors[idx * 3]},${colors[idx * 3 + 1]},${colors[idx * 3 + 2]})` : fgColor;
        const op = colors ? '1.0' : lum.toFixed(2);

        elements.push(`  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${fill}" opacity="${op}"/>`);
      }
    }
  }

  elements.push(`</svg>`);
  return elements.join('\n');
}
