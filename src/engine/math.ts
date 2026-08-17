import { WaveParams } from '../types/ascii';

export const DEFAULT_WAVE_PARAMS: WaveParams = {
  timeSpeed: 1.0,
  aspectRatio: 0.55,
  contrast: 1.0,
  bias: 0.0,
  invert: false,

  radialAmp: 0.6,
  radialFreq: 0.12,
  radialSpeed: 1.0,
  radialCenterOffsetX: 0,
  radialCenterOffsetY: 0,

  radial2Amp: 0.0,
  radial2Freq: 0.3,
  radial2Speed: 2.0,

  xAmp: 0.2,
  xFreq: 0.08,
  xSpeed: 0.5,

  yAmp: 0.2,
  yFreq: 0.08,
  ySpeed: 0.5,

  diagAmp: 0.0,
  diagFreq: 0.1,
  diagSpeed: 1.0,

  spiralAmp: 0.0,
  spiralArms: 3,
  spiralSpeed: 2.0,
  spiralTwist: 0.1,

  tunnelAmp: 0.0,
  tunnelPower: 40,
  tunnelSpeed: 1.5,

  ringsAmp: 0.0,
  ringsRadius: 30,
  ringsSpeed: 1.5,
  ringsCount: 2,

  dualEmitterAmp: 0.0,
  dualEmitterSpacing: 25,
  dualEmitterFreq: 0.18,
  dualEmitterSpeed: 2.0,

  starfieldIntensity: 0.0,
};

/**
 * Evaluates the parametric wave synthesizer equation at point (x, y, time)
 */
export function evaluateParametricWave(
  x: number,
  y: number,
  time: number,
  dist: number,
  dx: number,
  dy: number,
  _cols: number,
  _rows: number,
  angle: number,
  p: WaveParams
): number {
  let val = 0;

  // 1. Primary Radial Wave
  if (p.radialAmp !== 0) {
    const rdx = dx - (p.radialCenterOffsetX || 0);
    const rdy = dy - (p.radialCenterOffsetY || 0);
    const rDist = Math.hypot(rdx, rdy);
    val += Math.sin(rDist * p.radialFreq - time * p.radialSpeed) * p.radialAmp;
  }

  // 2. Secondary Harmonic Radial Wave
  if (p.radial2Amp !== 0) {
    val += Math.sin(dist * p.radial2Freq - time * p.radial2Speed) * p.radial2Amp;
  }

  // 3. Directional Waves (X, Y, Diagonal)
  if (p.xAmp !== 0) {
    val += Math.cos(dx * p.xFreq + time * p.xSpeed) * p.xAmp;
  }
  if (p.yAmp !== 0) {
    val += Math.sin(dy * p.yFreq + time * p.ySpeed) * p.yAmp;
  }
  if (p.diagAmp !== 0) {
    val += Math.sin((dx + dy) * p.diagFreq + time * p.diagSpeed) * p.diagAmp;
  }

  // 4. Spiral / Vortex (Angular)
  if (p.spiralAmp !== 0) {
    val += Math.sin(angle * p.spiralArms - time * p.spiralSpeed + dist * (p.spiralTwist || 0)) * p.spiralAmp;
  }

  // 5. Tunnel / Depth Inverse Distance
  if (p.tunnelAmp !== 0) {
    const safeDist = Math.max(0.01, dist + 4.0);
    val += Math.sin(p.tunnelPower / safeDist - time * p.tunnelSpeed) * p.tunnelAmp;
  }

  // 6. Concentric Rings
  if (p.ringsAmp !== 0) {
    const rDistMod = Math.abs(dist - (p.ringsRadius + Math.sin(time * p.ringsSpeed) * 5));
    val += (2 / (rDistMod + 1)) * (Math.sin(angle * p.ringsCount + time * p.ringsSpeed) * 0.5 + 0.5) * p.ringsAmp;
  }

  // 7. Dual Emitter Interference (Moiré)
  if (p.dualEmitterAmp !== 0) {
    const d1 = Math.hypot(dx - p.dualEmitterSpacing, dy - p.dualEmitterSpacing * 0.4);
    const d2 = Math.hypot(dx + p.dualEmitterSpacing, dy + p.dualEmitterSpacing * 0.4);
    const wave1 = Math.sin(d1 * p.dualEmitterFreq - time * p.dualEmitterSpeed);
    const wave2 = Math.sin(d2 * p.dualEmitterFreq - time * p.dualEmitterSpeed);
    val += ((wave1 + wave2) * 0.5) * p.dualEmitterAmp;
  }

  // 8. Starfield / Sparkle Texture
  if (p.starfieldIntensity !== 0) {
    if (Math.sin(x * 123.45) * Math.cos(y * 543.21) > 0.985) {
      val += p.starfieldIntensity;
    }
  }

  // Global Contrast & Brightness Bias
  val = val * (p.contrast || 1.0) + (p.bias || 0.0);

  return val;
}

/**
 * Generates an exact, readable JavaScript formula string representing the current WaveParams
 */
export function generateFormulaCode(p: WaveParams): string {
  const lines: string[] = ['let val = 0;\n'];

  if (p.radialAmp !== 0) {
    if (p.radialCenterOffsetX !== 0 || p.radialCenterOffsetY !== 0) {
      lines.push(`// Primary Radial Wave (Offset Center)`);
      lines.push(`const rDist = Math.hypot(dx - (${p.radialCenterOffsetX}), dy - (${p.radialCenterOffsetY}));`);
      lines.push(`val += Math.sin(rDist * ${p.radialFreq} - time * ${p.radialSpeed}) * ${p.radialAmp};\n`);
    } else {
      lines.push(`// Primary Radial Wave`);
      lines.push(`val += Math.sin(dist * ${p.radialFreq} - time * ${p.radialSpeed}) * ${p.radialAmp};\n`);
    }
  }

  if (p.radial2Amp !== 0) {
    lines.push(`// Secondary Harmonic Ripple`);
    lines.push(`val += Math.sin(dist * ${p.radial2Freq} - time * ${p.radial2Speed}) * ${p.radial2Amp};\n`);
  }

  if (p.xAmp !== 0) {
    lines.push(`// Horizontal Swell (X)`);
    lines.push(`val += Math.cos(dx * ${p.xFreq} + time * ${p.xSpeed}) * ${p.xAmp};\n`);
  }

  if (p.yAmp !== 0) {
    lines.push(`// Vertical Swell (Y)`);
    lines.push(`val += Math.sin(dy * ${p.yFreq} + time * ${p.ySpeed}) * ${p.yAmp};\n`);
  }

  if (p.diagAmp !== 0) {
    lines.push(`// Diagonal Swell (X + Y)`);
    lines.push(`val += Math.sin((dx + dy) * ${p.diagFreq} + time * ${p.diagSpeed}) * ${p.diagAmp};\n`);
  }

  if (p.spiralAmp !== 0) {
    lines.push(`// Angular Spiral Vortex`);
    const twistStr = p.spiralTwist ? ` + dist * ${p.spiralTwist}` : '';
    lines.push(`val += Math.sin(angle * ${p.spiralArms} - time * ${p.spiralSpeed}${twistStr}) * ${p.spiralAmp};\n`);
  }

  if (p.tunnelAmp !== 0) {
    lines.push(`// Depth / Inverse Distance Tunnel`);
    lines.push(`val += Math.sin(${p.tunnelPower} / Math.max(0.01, dist + 4.0) - time * ${p.tunnelSpeed}) * ${p.tunnelAmp};\n`);
  }

  if (p.ringsAmp !== 0) {
    lines.push(`// Concentric Rings`);
    lines.push(`const rDistMod = Math.abs(dist - (${p.ringsRadius} + Math.sin(time * ${p.ringsSpeed}) * 5));`);
    lines.push(`val += (2 / (rDistMod + 1)) * (Math.sin(angle * ${p.ringsCount} + time * ${p.ringsSpeed}) * 0.5 + 0.5) * ${p.ringsAmp};\n`);
  }

  if (p.dualEmitterAmp !== 0) {
    lines.push(`// Dual Emitter Interference Moiré`);
    lines.push(`const d1 = Math.hypot(dx - ${p.dualEmitterSpacing}, dy - ${p.dualEmitterSpacing * 0.4});`);
    lines.push(`const d2 = Math.hypot(dx + ${p.dualEmitterSpacing}, dy + ${p.dualEmitterSpacing * 0.4});`);
    lines.push(`val += ((Math.sin(d1 * ${p.dualEmitterFreq} - time * ${p.dualEmitterSpeed}) + Math.sin(d2 * ${p.dualEmitterFreq} - time * ${p.dualEmitterSpeed})) * 0.5) * ${p.dualEmitterAmp};\n`);
  }

  if (p.starfieldIntensity !== 0) {
    lines.push(`// Starfield Background`);
    lines.push(`if (Math.sin(x * 123.45) * Math.cos(y * 543.21) > 0.985) val += ${p.starfieldIntensity};\n`);
  }

  const contrastStr = p.contrast !== 1.0 ? ` * ${p.contrast}` : '';
  const biasStr = p.bias !== 0.0 ? ` + ${p.bias}` : '';
  lines.push(`// Final Output`);
  lines.push(`return val${contrastStr}${biasStr};`);

  return lines.join('\n');
}

/**
 * Parses user-edited JavaScript formula and extracts corresponding WaveParams to update Synth sliders
 */
export function parseFormulaCodeToParams(code: string, baseParams: WaveParams): WaveParams {
  const p: WaveParams = { ...baseParams };

  try {
    // 1. Primary Radial Wave
    const radialMatch = code.match(/Math\.sin\(\s*(?:rDist|dist)\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)\s*\)\s*\*\s*([\d.]+)/);
    if (radialMatch) {
      p.radialFreq = parseFloat(radialMatch[1]) ?? p.radialFreq;
      p.radialSpeed = parseFloat(radialMatch[2]) ?? p.radialSpeed;
      p.radialAmp = parseFloat(radialMatch[3]) ?? p.radialAmp;
    }

    // Offset Center
    const offsetMatch = code.match(/Math\.hypot\(dx\s*-\s*\(([\d.-]+)\),\s*dy\s*-\s*\(([\d.-]+)\)\)/);
    if (offsetMatch) {
      p.radialCenterOffsetX = parseFloat(offsetMatch[1]) || 0;
      p.radialCenterOffsetY = parseFloat(offsetMatch[2]) || 0;
    }

    // 2. Secondary Harmonic Ripple
    const radial2Match = code.match(/Secondary Harmonic Ripple[\s\S]*?Math\.sin\(\s*dist\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)\s*\)\s*\*\s*([\d.]+)/);
    if (radial2Match) {
      p.radial2Freq = parseFloat(radial2Match[1]) ?? p.radial2Freq;
      p.radial2Speed = parseFloat(radial2Match[2]) ?? p.radial2Speed;
      p.radial2Amp = parseFloat(radial2Match[3]) ?? p.radial2Amp;
    }

    // 3. Directional X Wave
    const xMatch = code.match(/Math\.cos\(dx\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (xMatch) {
      p.xFreq = parseFloat(xMatch[1]) ?? p.xFreq;
      p.xSpeed = parseFloat(xMatch[2]) ?? p.xSpeed;
      p.xAmp = parseFloat(xMatch[3]) ?? p.xAmp;
    }

    // 4. Directional Y Wave
    const yMatch = code.match(/Math\.sin\(dy\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (yMatch) {
      p.yFreq = parseFloat(yMatch[1]) ?? p.yFreq;
      p.ySpeed = parseFloat(yMatch[2]) ?? p.ySpeed;
      p.yAmp = parseFloat(yMatch[3]) ?? p.yAmp;
    }

    // 5. Diagonal Wave (X+Y)
    const diagMatch = code.match(/Math\.sin\(\(dx\s*\+\s*dy\)\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (diagMatch) {
      p.diagFreq = parseFloat(diagMatch[1]) ?? p.diagFreq;
      p.diagSpeed = parseFloat(diagMatch[2]) ?? p.diagSpeed;
      p.diagAmp = parseFloat(diagMatch[3]) ?? p.diagAmp;
    }

    // 6. Spiral / Vortex (Angular)
    const spiralMatch = code.match(/Math\.sin\(angle\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)(?:\s*\+\s*dist\s*\*\s*([\d.]+))?\)\s*\*\s*([\d.]+)/);
    if (spiralMatch) {
      p.spiralArms = parseFloat(spiralMatch[1]) ?? p.spiralArms;
      p.spiralSpeed = parseFloat(spiralMatch[2]) ?? p.spiralSpeed;
      if (spiralMatch[3]) p.spiralTwist = parseFloat(spiralMatch[3]) ?? p.spiralTwist;
      p.spiralAmp = parseFloat(spiralMatch[4]) ?? p.spiralAmp;
    }

    // 7. Tunnel / Depth Inverse Distance
    const tunnelMatch = code.match(/Math\.sin\(([\d.]+)\s*\/\s*(?:Math\.max\(0\.01,\s*)?dist(?:\s*\+\s*[\d.]+)?\)?\s*-\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (tunnelMatch) {
      p.tunnelPower = parseFloat(tunnelMatch[1]) ?? p.tunnelPower;
      p.tunnelSpeed = parseFloat(tunnelMatch[2]) ?? p.tunnelSpeed;
      p.tunnelAmp = parseFloat(tunnelMatch[3]) ?? p.tunnelAmp;
    }

    // 8. Concentric Rings
    const ringsModMatch = code.match(/rDistMod\s*=\s*Math\.abs\(dist\s*-\s*\(([\d.]+)\s*\+\s*Math\.sin\(time\s*\*\s*([\d.-]+)\)/);
    if (ringsModMatch) {
      p.ringsRadius = parseFloat(ringsModMatch[1]) ?? p.ringsRadius;
      p.ringsSpeed = parseFloat(ringsModMatch[2]) ?? p.ringsSpeed;
    }
    const ringsAmpMatch = code.match(/Math\.sin\(angle\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*[\d.-]+\)\s*\*\s*0\.5\s*\+\s*0\.5\)\s*\*\s*([\d.]+)/);
    if (ringsAmpMatch) {
      p.ringsCount = parseFloat(ringsAmpMatch[1]) ?? p.ringsCount;
      p.ringsAmp = parseFloat(ringsAmpMatch[2]) ?? p.ringsAmp;
    }

    // 9. Dual Emitter Interference
    const dualSpacingMatch = code.match(/dx\s*-\s*([\d.]+)/);
    if (dualSpacingMatch) {
      p.dualEmitterSpacing = parseFloat(dualSpacingMatch[1]) ?? p.dualEmitterSpacing;
    }
    const dualWaveMatch = code.match(/Math\.sin\(d1\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)\)[\s\S]*?\*\s*([\d.]+);/);
    if (dualWaveMatch) {
      p.dualEmitterFreq = parseFloat(dualWaveMatch[1]) ?? p.dualEmitterFreq;
      p.dualEmitterSpeed = parseFloat(dualWaveMatch[2]) ?? p.dualEmitterSpeed;
      p.dualEmitterAmp = parseFloat(dualWaveMatch[3]) ?? p.dualEmitterAmp;
    }

    // 10. Starfield Sparkle
    const starMatch = code.match(/Math\.sin\(x\s*\*\s*123\.45\)[\s\S]*?val\s*\+=\s*([\d.]+);/);
    if (starMatch) {
      p.starfieldIntensity = parseFloat(starMatch[1]) ?? p.starfieldIntensity;
    }

    // 11. Final Return Contrast and Bias
    const returnMatch = code.match(/return\s+val(?:\s*\*\s*([\d.]+))?(?:\s*\+\s*([-\d.]+))?/);
    if (returnMatch) {
      if (returnMatch[1]) p.contrast = parseFloat(returnMatch[1]) ?? p.contrast;
      if (returnMatch[2]) p.bias = parseFloat(returnMatch[2]) ?? p.bias;
    }
  } catch {
    // Keep base params on parsing exception
  }

  return p;
}

/**
 * Determines whether the formula code contains custom non-parametric logic
 * that does not map to available WaveParams sliders.
 */
export function checkFormulaDivergence(
  code: string,
  prepareCode: string = '',
  params: WaveParams
): boolean {
  if (prepareCode && prepareCode.trim().length > 0) return true;

  const normalize = (str: string) =>
    str
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, '')
      .replace(/;+/g, ';')
      .replace(/\.0+\b/g, '')
      .trim();

  const cleanUser = normalize(code || '');
  const generated = normalize(generateFormulaCode(params));

  return cleanUser !== generated;
}

export interface CompileResult {
  fn: (
    x: number,
    y: number,
    time: number,
    dist: number,
    dx: number,
    dy: number,
    cols: number,
    rows: number,
    angle: number,
    ctx?: any
  ) => number;
  prepareFn?: (time: number, cols: number, rows: number, ctx?: any) => void;
  error: string | null;
}

/**
 * Compiles custom JavaScript formula string into an executable function
 */
export function compileCustomCode(renderCode: string, prepareCode?: string): CompileResult {
  try {
    let prepareFn: ((time: number, cols: number, rows: number, ctx?: any) => void) | undefined;
    if (prepareCode && prepareCode.trim().length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      prepareFn = new Function('time', 'cols', 'rows', 'ctx', prepareCode) as (
        time: number,
        cols: number,
        rows: number,
        ctx?: any
      ) => void;
    }

    let cleanCode = renderCode.trim();
    if (!cleanCode.includes('return ') && !cleanCode.startsWith('{')) {
      cleanCode = `return ${cleanCode};`;
    } else if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
      cleanCode = cleanCode.slice(1, -1);
    }

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const renderFn = new Function(
      'x',
      'y',
      'time',
      'dist',
      'dx',
      'dy',
      'cols',
      'rows',
      'angle',
      'ctx',
      `
      try {
        ${cleanCode}
      } catch (err) {
        return 0;
      }
    `
    ) as (
      x: number,
      y: number,
      time: number,
      dist: number,
      dx: number,
      dy: number,
      cols: number,
      rows: number,
      angle: number,
      ctx?: any
    ) => number;

    renderFn(0, 0, 0, 0, 0, 0, 80, 40, 0, {});

    return {
      fn: renderFn,
      prepareFn,
      error: null,
    };
  } catch (err: any) {
    return {
      fn: () => 0,
      error: err?.message || 'Syntax error in custom formula',
    };
  }
}
