import { WaveParams, CustomRenderContext } from '../types/ascii';

function safeParseFloat(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
  starfieldDensity: 1.0,
  starfieldSpeed: 2.0,
  starfieldScale: 80.0,
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

  // 8. Starfield / Cosmic Sparkle Matrix
  if (p.starfieldIntensity !== 0) {
    const scale = p.starfieldScale || 80.0;
    const density = p.starfieldDensity !== undefined ? p.starfieldDensity : 1.0;
    const speed = p.starfieldSpeed !== undefined ? p.starfieldSpeed : 2.0;

    const sx = Math.floor(x * scale);
    const sy = Math.floor(y * scale);
    const hash = Math.sin(sx * 12.9898 + sy * 78.233) * 43758.5453;
    const rand = hash - Math.floor(hash);

    const threshold = Math.max(0.7, 1.0 - density * 0.035);
    if (rand > threshold) {
      const phase = rand * 6.28318 + time * speed;
      const sparkle = Math.max(0, Math.sin(phase));
      const starBrightness = sparkle * sparkle * ((rand - threshold) / (1.0 - threshold));
      val += starBrightness * p.starfieldIntensity;
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
  }  if (p.starfieldIntensity !== 0) {
    lines.push(`// Starfield & Cosmic Sparkle Matrix`);
    lines.push(`const sScale = ${p.starfieldScale || 80.0};`);
    lines.push(`const sHash = Math.sin(Math.floor(x * sScale) * 12.9898 + Math.floor(y * sScale) * 78.233) * 43758.5453;`);
    lines.push(`const sRand = sHash - Math.floor(sHash);`);
    const thresh = Number(Math.max(0.7, 1.0 - (p.starfieldDensity !== undefined ? p.starfieldDensity : 1.0) * 0.035).toFixed(4));
    lines.push(`const sThreshold = ${thresh};`);
    lines.push(`if (sRand > sThreshold) {`);
    lines.push(`  const sSparkle = Math.max(0, Math.sin(sRand * 6.28318 + time * ${p.starfieldSpeed !== undefined ? p.starfieldSpeed : 2.0}));`);
    lines.push(`  val += sSparkle * sSparkle * ((sRand - sThreshold) / (1.0 - sThreshold)) * ${p.starfieldIntensity};`);
    lines.push(`}\n`);
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
      p.radialFreq = safeParseFloat(radialMatch[1], p.radialFreq);
      p.radialSpeed = safeParseFloat(radialMatch[2], p.radialSpeed);
      p.radialAmp = safeParseFloat(radialMatch[3], p.radialAmp);
    }

    // Offset Center
    const offsetMatch = code.match(/Math\.hypot\(dx\s*-\s*\(([\d.-]+)\),\s*dy\s*-\s*\(([\d.-]+)\)\)/);
    if (offsetMatch) {
      p.radialCenterOffsetX = safeParseFloat(offsetMatch[1], p.radialCenterOffsetX);
      p.radialCenterOffsetY = safeParseFloat(offsetMatch[2], p.radialCenterOffsetY);
    }

    // 2. Secondary Harmonic Ripple
    const radial2Match = code.match(/Secondary Harmonic Ripple[\s\S]*?Math\.sin\(\s*dist\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)\s*\)\s*\*\s*([\d.]+)/);
    if (radial2Match) {
      p.radial2Freq = safeParseFloat(radial2Match[1], p.radial2Freq);
      p.radial2Speed = safeParseFloat(radial2Match[2], p.radial2Speed);
      p.radial2Amp = safeParseFloat(radial2Match[3], p.radial2Amp);
    }

    // 3. Directional X
    const xMatch = code.match(/Math\.cos\(dx\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (xMatch) {
      p.xFreq = safeParseFloat(xMatch[1], p.xFreq);
      p.xSpeed = safeParseFloat(xMatch[2], p.xSpeed);
      p.xAmp = safeParseFloat(xMatch[3], p.xAmp);
    }

    // 4. Directional Y
    const yMatch = code.match(/Math\.sin\(dy\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (yMatch) {
      p.yFreq = safeParseFloat(yMatch[1], p.yFreq);
      p.ySpeed = safeParseFloat(yMatch[2], p.ySpeed);
      p.yAmp = safeParseFloat(yMatch[3], p.yAmp);
    }

    // 5. Diagonal (X + Y)
    const diagMatch = code.match(/Math\.sin\(\(dx\s*\+\s*dy\)\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+)/);
    if (diagMatch) {
      p.diagFreq = safeParseFloat(diagMatch[1], p.diagFreq);
      p.diagSpeed = safeParseFloat(diagMatch[2], p.diagSpeed);
      p.diagAmp = safeParseFloat(diagMatch[3], p.diagAmp);
    }

    // 6. Angular Spiral Vortex
    const spiralArmsMatch = code.match(/Math\.sin\(angle\s*\*\s*([\d.]+)/);
    if (spiralArmsMatch) {
      p.spiralArms = safeParseFloat(spiralArmsMatch[1], p.spiralArms);
    }
    const spiralSpeedMatch = code.match(/-\s*time\s*\*\s*([\d.-]+)/);
    if (spiralSpeedMatch) {
      p.spiralSpeed = safeParseFloat(spiralSpeedMatch[1], p.spiralSpeed);
    }
    const spiralTwistMatch = code.match(/dist\s*\*\s*([\d.]+)/);
    if (spiralTwistMatch) {
      p.spiralTwist = safeParseFloat(spiralTwistMatch[1], p.spiralTwist);
    }
    const spiralAmpMatch = code.match(/\)\s*\*\s*([\d.]+);[\s\S]*?(?:Depth|Concentric|Dual|Starfield|Final)/);
    if (spiralAmpMatch) {
      p.spiralAmp = safeParseFloat(spiralAmpMatch[1], p.spiralAmp);
    }

    // 7. Depth / Wormhole Tunnel
    const tunnelPowerMatch = code.match(/Math\.sin\(([\d.]+)\s*\/\s*Math\.max/);
    if (tunnelPowerMatch) {
      p.tunnelPower = safeParseFloat(tunnelPowerMatch[1], p.tunnelPower);
    }
    const tunnelSpeedMatch = code.match(/-\s*time\s*\*\s*([\d.-]+)\)\s*\*\s*([\d.]+);/);
    if (tunnelSpeedMatch) {
      p.tunnelSpeed = safeParseFloat(tunnelSpeedMatch[1], p.tunnelSpeed);
      p.tunnelAmp = safeParseFloat(tunnelSpeedMatch[2], p.tunnelAmp);
    }

    // 8. Concentric Rings
    const ringsRadiusMatch = code.match(/Math\.abs\(dist\s*-\s*\(([\d.]+)/);
    if (ringsRadiusMatch) {
      p.ringsRadius = safeParseFloat(ringsRadiusMatch[1], p.ringsRadius);
    }
    const ringsSpeedMatch = code.match(/Math\.sin\(time\s*\*\s*([\d.-]+)\)\s*\*\s*5\)\);/);
    if (ringsSpeedMatch) {
      p.ringsSpeed = safeParseFloat(ringsSpeedMatch[1], p.ringsSpeed);
    }
    const ringsAmpMatch = code.match(/Math\.sin\(angle\s*\*\s*([\d.]+)\s*\+\s*time\s*\*\s*[\d.-]+\)\s*\*\s*0\.5\s*\+\s*0\.5\)\s*\*\s*([\d.]+)/);
    if (ringsAmpMatch) {
      p.ringsCount = safeParseFloat(ringsAmpMatch[1], p.ringsCount);
      p.ringsAmp = safeParseFloat(ringsAmpMatch[2], p.ringsAmp);
    }

    // 9. Dual Emitter Interference
    const dualSpacingMatch = code.match(/dx\s*-\s*([\d.]+)/);
    if (dualSpacingMatch) {
      p.dualEmitterSpacing = safeParseFloat(dualSpacingMatch[1], p.dualEmitterSpacing);
    }
    const dualWaveMatch = code.match(/Math\.sin\(d1\s*\*\s*([\d.]+)\s*-\s*time\s*\*\s*([\d.-]+)\)[\s\S]*?\*\s*([\d.]+);/);
    if (dualWaveMatch) {
      p.dualEmitterFreq = safeParseFloat(dualWaveMatch[1], p.dualEmitterFreq);
      p.dualEmitterSpeed = safeParseFloat(dualWaveMatch[2], p.dualEmitterSpeed);
      p.dualEmitterAmp = safeParseFloat(dualWaveMatch[3], p.dualEmitterAmp);
    }

    // 10. Starfield Sparkle
    const newStarMatch = code.match(/sScale\s*=\s*([\d.]+);[\s\S]*?sThreshold\s*=\s*([\d.]+);[\s\S]*?time\s*\*\s*([\d.-]+)[\s\S]*?\*\s*([\d.]+);/);
    if (newStarMatch) {
      p.starfieldScale = safeParseFloat(newStarMatch[1], p.starfieldScale);
      const thresh = safeParseFloat(newStarMatch[2], 0.965);
      p.starfieldDensity = Math.max(0, Number(((1.0 - thresh) / 0.035).toFixed(1)));
      p.starfieldSpeed = safeParseFloat(newStarMatch[3], p.starfieldSpeed);
      p.starfieldIntensity = safeParseFloat(newStarMatch[4], p.starfieldIntensity);
    } else {
      const legacyStarMatch = code.match(/Math\.sin\(x\s*\*\s*123\.45\)[\s\S]*?val\s*\+=\s*([\d.]+);/);
      if (legacyStarMatch) {
        p.starfieldIntensity = safeParseFloat(legacyStarMatch[1], p.starfieldIntensity);
      }
    } 

    // 11. Final Return Contrast and Bias
    const returnMatch = code.match(/return\s+val(?:\s*\*\s*([\d.]+))?(?:\s*\+\s*([-\d.]+))?/);
    if (returnMatch) {
      if (returnMatch[1]) p.contrast = safeParseFloat(returnMatch[1], p.contrast);
      if (returnMatch[2]) p.bias = safeParseFloat(returnMatch[2], p.bias);
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
    ctx?: CustomRenderContext
  ) => number;
  prepareFn?: (time: number, cols: number, rows: number, ctx?: CustomRenderContext) => void;
  error: string | null;
}

/**
 * Compiles custom JavaScript formula string into an executable function
 */
export function compileCustomCode(renderCode: string, prepareCode?: string): CompileResult {
  try {
    let prepareFn: ((time: number, cols: number, rows: number, ctx?: CustomRenderContext) => void) | undefined;
    if (prepareCode && prepareCode.trim().length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      prepareFn = new Function('time', 'cols', 'rows', 'ctx', prepareCode) as (
        time: number,
        cols: number,
        rows: number,
        ctx?: CustomRenderContext
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
      ctx?: CustomRenderContext
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
