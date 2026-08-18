import { WaveParams, PhosphorTheme } from '../types/ascii';
import { DEFAULT_WAVE_PARAMS } from './math';
import { CHARSETS } from './renderer';

const THEMES: PhosphorTheme[] = ['green', 'amber', 'cyan', 'monochrome', 'blood', 'paper'];

const ADJECTIVES = [
  'Quantum', 'Cosmic', 'Cyber', 'Hyper', 'Solar', 'Neon', 'Astral',
  'Chrono', 'Spectral', 'Prismatic', 'Vortex', 'Abyssal', 'Radiant',
  'Glitch', 'Fractal', 'Plasma', 'Atomic', 'Galactic', 'Pulsar', 'Magnetic',
];

const NOUNS = [
  'Ripple', 'Vortex', 'Tunnel', 'Moiré', 'Plasma', 'Waveform',
  'Singularity', 'Pulsar', 'Cascade', 'Nebula', 'Lattice', 'Mirage',
  'Echo', 'Supernova', 'Resonance', 'Matrix', 'Anomaly', 'Flares', 'Orbits', 'Current',
];

export interface RandomizedPreset {
  name: string;
  archetype: string;
  params: WaveParams;
  theme: PhosphorTheme;
  density: string;
}

function rand(min: number, max: number, decimals: number = 2): number {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomAnimation(): RandomizedPreset {
  const archetypeIndex = Math.floor(Math.random() * 8);
  const adj = choice(ADJECTIVES);
  const noun = choice(NOUNS);
  const name = `${adj} ${noun}`;
  const theme = choice(THEMES);
  const density = choice(CHARSETS).chars;

  let archetype = 'Parametric Flow';
  const params: WaveParams = {
    ...DEFAULT_WAVE_PARAMS,
    timeSpeed: rand(0.7, 1.6, 2),
    aspectRatio: 0.55,
    contrast: rand(0.9, 1.4, 2),
    bias: rand(-0.2, 0.2, 2),
  };

  switch (archetypeIndex) {
    // 0. Cosmic Vortex
    case 0:
      archetype = 'Cosmic Vortex';
      params.spiralAmp = rand(0.4, 0.9, 2);
      params.spiralArms = Math.floor(rand(2, 6, 0));
      params.spiralSpeed = rand(1.0, 3.0, 2);
      params.spiralTwist = rand(0.05, 0.25, 3);
      params.radialAmp = rand(0.2, 0.5, 2);
      params.radialFreq = rand(0.08, 0.2, 2);
      params.radialSpeed = rand(0.8, 1.8, 2);
      if (Math.random() > 0.4) {
        params.starfieldIntensity = rand(0.2, 0.6, 2);
        params.starfieldDensity = rand(0.6, 2.5, 1);
        params.starfieldSpeed = rand(1.0, 4.0, 1);
        params.starfieldScale = Math.floor(rand(50, 120, 0));
      }
      break;

    // 1. Wormhole / Tunnel Hypnosis
    case 1:
      archetype = 'Wormhole Tunnel';
      params.tunnelAmp = rand(0.6, 1.0, 2);
      params.tunnelPower = rand(25, 60, 1);
      params.tunnelSpeed = rand(1.0, 2.5, 2);
      params.spiralAmp = rand(0.2, 0.5, 2);
      params.spiralArms = Math.floor(rand(2, 5, 0));
      params.spiralSpeed = rand(0.6, 1.8, 2);
      break;

    // 2. Dual Moiré Interference
    case 2:
      archetype = 'Dual Moiré';
      params.dualEmitterAmp = rand(0.7, 1.2, 2);
      params.dualEmitterSpacing = rand(15, 38, 1);
      params.dualEmitterFreq = rand(0.12, 0.28, 2);
      params.dualEmitterSpeed = rand(1.2, 2.8, 2);
      params.contrast = rand(1.1, 1.4, 2);
      break;

    // 3. Multi-Harmonic Ripple Field
    case 3:
      archetype = 'Harmonic Ripples';
      params.radialAmp = rand(0.4, 0.7, 2);
      params.radialFreq = rand(0.1, 0.25, 2);
      params.radialSpeed = rand(1.0, 2.0, 2);
      params.radial2Amp = rand(0.3, 0.6, 2);
      params.radial2Freq = rand(0.2, 0.45, 2);
      params.radial2Speed = rand(1.5, 3.0, 2);
      params.xAmp = rand(0.1, 0.3, 2);
      params.xFreq = rand(0.05, 0.15, 2);
      params.xSpeed = rand(0.5, 1.5, 2);
      break;

    // 4. Concentric Rings & Orbital Pulsar
    case 4:
      archetype = 'Pulsar Rings';
      params.ringsAmp = rand(0.6, 1.0, 2);
      params.ringsRadius = rand(18, 42, 1);
      params.ringsSpeed = rand(0.8, 2.2, 2);
      params.ringsCount = Math.floor(rand(1, 4, 0));
      params.radialAmp = rand(0.2, 0.4, 2);
      params.radialFreq = rand(0.06, 0.15, 2);
      params.radialSpeed = rand(0.8, 1.5, 2);
      params.starfieldIntensity = rand(0.2, 0.5, 2);
      params.starfieldDensity = rand(0.8, 2.0, 1);
      params.starfieldSpeed = rand(1.5, 3.5, 1);
      params.starfieldScale = Math.floor(rand(60, 100, 0));
      break;

    // 5. Classic Complex Plasma
    case 5:
      archetype = 'Complex Plasma';
      params.radialAmp = rand(0.2, 0.4, 2);
      params.radialFreq = rand(0.06, 0.14, 2);
      params.radialSpeed = rand(0.5, 1.2, 2);
      params.xAmp = rand(0.2, 0.45, 2);
      params.xFreq = rand(0.06, 0.15, 2);
      params.xSpeed = rand(0.6, 1.6, 2);
      params.yAmp = rand(0.2, 0.45, 2);
      params.yFreq = rand(0.06, 0.15, 2);
      params.ySpeed = rand(0.6, 1.6, 2);
      params.diagAmp = rand(0.15, 0.35, 2);
      params.diagFreq = rand(0.05, 0.12, 2);
      params.diagSpeed = rand(0.5, 1.5, 2);
      break;

    // 6. Geometric Matrix Grid
    case 6:
      archetype = 'Matrix Grid';
      params.xAmp = rand(0.35, 0.6, 2);
      params.xFreq = rand(0.1, 0.22, 2);
      params.xSpeed = rand(0.8, 1.8, 2);
      params.yAmp = rand(0.35, 0.6, 2);
      params.yFreq = rand(0.1, 0.22, 2);
      params.ySpeed = rand(0.8, 1.8, 2);
      params.diagAmp = rand(0.2, 0.4, 2);
      params.diagFreq = rand(0.08, 0.18, 2);
      params.diagSpeed = rand(0.8, 1.8, 2);
      break;

    // 7. Offset Radial Vortex
    case 7:
    default:
      archetype = 'Celestial Anomaly';
      params.radialAmp = rand(0.4, 0.7, 2);
      params.radialFreq = rand(0.08, 0.18, 2);
      params.radialSpeed = rand(1.0, 2.0, 2);
      params.radialCenterOffsetX = rand(-20, 20, 1);
      params.radialCenterOffsetY = rand(-12, 12, 1);
      params.spiralAmp = rand(0.3, 0.6, 2);
      params.spiralArms = Math.floor(rand(2, 5, 0));
      params.spiralSpeed = rand(1.2, 2.4, 2);
      params.tunnelAmp = rand(0.2, 0.5, 2);
      params.tunnelPower = rand(15, 35, 1);
      params.tunnelSpeed = rand(0.8, 1.6, 2);
      break;
  }

  return {
    name,
    archetype,
    params,
    theme,
    density,
  };
}
