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
  if (bgColor && bgColor !== 'transparent' && bgColor !== '#0a0a0a' && bgColor !== '#000000' && bgColor !== '#000') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  } else if (mode === 'halftone-cmyk') {
    // CMYK subtractive printing plates require a white background substrate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }


  const dotScale = config.dotScale || 1.0;
  const minSize = config.minSize || 0.05;
  const maxSize = config.maxSize || 1.0;
  const maxRadius = (Math.min(cellWidth, cellHeight) / 2.0) * dotScale;

  // 1. CMYK 4-PASS ROSETTE SCREEN
  if (mode === 'halftone-cmyk') {
    ctx.globalCompositeOperation = 'multiply';

    const angles = config.cmykAngles || { c: 15, m: 75, y: 0, k: 45 };
    const plates = [
      { name: 'C', color: '#00ffff', angle: angles.c },
      { name: 'M', color: '#ff00ff', angle: angles.m },
      { name: 'Y', color: '#ffff00', angle: angles.y },
      { name: 'K', color: '#000000', angle: angles.k },
    ];

    for (let p = 0; p < plates.length; p++) {
      const plate = plates[p];
      ctx.fillStyle = plate.color;

      for (let y = 0; y < rows; y++) {
        const rowOff = y * cols;
        for (let x = 0; x < cols; x++) {
          const idx = rowOff + x;
          const lum = luminance[idx];
          if (lum < 0) continue;

          let r = 255, g = 255, b = 255;
          if (colors && colors.length >= (idx + 1) * 3) {
            r = colors[idx * 3];
            g = colors[idx * 3 + 1];
            b = colors[idx * 3 + 2];
          } else {
            const v = Math.round(lum * 255);
            r = v; g = v; b = v;
          }

          // RGB to CMYK extraction
          const cL = 1 - r / 255.0;
          const mL = 1 - g / 255.0;
          const yL = 1 - b / 255.0;
          const kL = Math.min(cL, mL, yL);

          let inkStrength = 0;
          if (plate.name === 'K') inkStrength = kL;
          else if (plate.name === 'C') inkStrength = kL < 1 ? (cL - kL) / (1 - kL) : 0;
          else if (plate.name === 'M') inkStrength = kL < 1 ? (mL - kL) / (1 - kL) : 0;
          else if (plate.name === 'Y') inkStrength = kL < 1 ? (yL - kL) / (1 - kL) : 0;

          if (inkStrength <= 0.02) continue;

          const cx = x * cellWidth + cellWidth / 2;
          const cy = y * cellHeight + cellHeight / 2;
          const rad = Math.max(0.4, inkStrength * maxRadius);

          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    return;
  }

  // 2. GEOMETRIC DOT HALFTONE
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

  // 3. LINE / STRIPE HALFTONE
  if (mode === 'halftone-line') {
    const angleRad = ((config.lineAngle || 45) * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    ctx.lineCap = 'round';
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.01) continue;

        const cx = x * cellWidth + cellWidth / 2;
        const cy = y * cellHeight + cellHeight / 2;
        const lineWeight = Math.max(0.5, lum * maxRadius * 1.8);

        if (colors && colors.length >= (idx + 1) * 3) {
          ctx.strokeStyle = `rgb(${colors[idx * 3]}, ${colors[idx * 3 + 1]}, ${colors[idx * 3 + 2]})`;
        } else {
          ctx.strokeStyle = fgColor;
        }

        ctx.lineWidth = lineWeight;
        const len = Math.max(cellWidth, cellHeight) * 0.75;

        ctx.beginPath();
        ctx.moveTo(cx - cosA * len, cy - sinA * len);
        ctx.lineTo(cx + cosA * len, cy + sinA * len);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  // 4. CROSSHATCH HALFTONE
  if (mode === 'halftone-crosshatch') {
    const angle1 = (45 * Math.PI) / 180;
    const angle2 = (-45 * Math.PI) / 180;

    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.02) continue;

        const cx = x * cellWidth + cellWidth / 2;
        const cy = y * cellHeight + cellHeight / 2;
        const lineWeight = Math.max(0.5, lum * maxRadius * 1.2);

        if (colors && colors.length >= (idx + 1) * 3) {
          ctx.strokeStyle = `rgb(${colors[idx * 3]}, ${colors[idx * 3 + 1]}, ${colors[idx * 3 + 2]})`;
        } else {
          ctx.strokeStyle = fgColor;
        }

        ctx.lineWidth = lineWeight;
        const len = Math.max(cellWidth, cellHeight) * 0.65;

        // Stroke 1
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(angle1) * len, cy - Math.sin(angle1) * len);
        ctx.lineTo(cx + Math.cos(angle1) * len, cy + Math.sin(angle1) * len);
        ctx.stroke();

        // Stroke 2 (triggered on deeper shadow tones)
        if (lum > 0.35) {
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(angle2) * len, cy - Math.sin(angle2) * len);
          ctx.lineTo(cx + Math.cos(angle2) * len, cy + Math.sin(angle2) * len);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    return;
  }

  // 5. 1-BIT / MULTI-BIT PIXEL BITMAP DITHER
  if (mode === 'pixel') {
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum < 0) continue;

        if (colors && colors.length >= (idx + 1) * 3) {
          ctx.fillStyle = `rgb(${colors[idx * 3]}, ${colors[idx * 3 + 1]}, ${colors[idx * 3 + 2]})`;
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
  } else if (mode === 'halftone-line') {
    const angleRad = ((config.lineAngle || 45) * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const len = Math.max(cellWidth, cellHeight) * 0.75;

    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const lum = luminance[idx];
        if (lum <= 0.01) continue;

        const cx = x * cellWidth + cellWidth / 2;
        const cy = y * cellHeight + cellHeight / 2;
        const lineWeight = Math.max(0.5, lum * maxRadius * 1.8).toFixed(2);
        const stroke = colors ? `rgb(${colors[idx * 3]},${colors[idx * 3 + 1]},${colors[idx * 3 + 2]})` : fgColor;

        const x1 = (cx - cosA * len).toFixed(2);
        const y1 = (cy - sinA * len).toFixed(2);
        const x2 = (cx + cosA * len).toFixed(2);
        const y2 = (cy + sinA * len).toFixed(2);

        elements.push(`  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${lineWeight}" stroke-linecap="round"/>`);
      }
    }
  } else if (mode === 'pixel') {
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
