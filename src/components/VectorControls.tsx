import React, { useEffect } from 'react';
import { VectorConfig, VECTOR_CONFIG_DEFAULTS } from '../types/ascii';
import { PrecisionSlider } from './controlPrimitives';
import { MoveVertical, MoveHorizontal } from 'lucide-react';

/**
 * Beam deflection controls — vector mode's replacement for the dither picker.
 *
 * Renders as a bare fragment straight into RENDER SETTINGS rather than as its
 * own bordered deck: it *is* the whole content of that section in vector mode,
 * so a nested panel with its own title and reset button was a box inside a box
 * repeating the heading above it. The section header owns the reset.
 *
 * The two are mutually exclusive by construction: vector output leaves the
 * raster pipeline before quantization, so an algorithm selection has nothing to
 * act on. App hides the picker and shows this in its slot, and leaves
 * `ditherAlgorithm` in state untouched so switching back restores it.
 */

interface VectorControlsProps {
  config: VectorConfig;
  onChange: (config: VectorConfig) => void;
  /** Cut down to the handful of controls the basic panel shows. */
  compact?: boolean;
}

type NumericKey = {
  [K in keyof VectorConfig]: VectorConfig[K] extends number ? K : never;
}[keyof VectorConfig];

interface Row {
  id: NumericKey;
  label: string;
  hint: string;
  /** Range the track spans under normal use. */
  min: number;
  max: number;
  /**
   * Wider range the number field accepts, past the end of the track.
   * Defaults to the track range.
   *
   * Where a floor is given it is structural rather than cosmetic:
   * `sampleStep` is a stride and `lineCount` a count, so neither may reach
   * zero however far the field is pushed. The ceilings are only slow.
   */
  hardMin?: number;
  hardMax?: number;
  step: number;
}

/** Ranges mirror the studio's sliders; amplitude and ripple are in grid cells. */
const GEOMETRY_ROWS: Row[] = [
  {
    id: 'lineCount',
    label: 'Scan Lines',
    hint: 'How many beams sweep the image. The Joy Division look lives around 40-80.',
    min: 16,
    max: 180,
    hardMin: 1,
    hardMax: 1000,
    step: 1,
  },
  {
    id: 'sampleStep',
    label: 'Sample Step',
    hint:
      'Grid cells between samples along a beam — how often it is read, not how smooth it is. Higher is faster and more angular. Use Smoothing to settle a noisy line.',
    min: 1,
    max: 6,
    hardMin: 1,
    hardMax: 64,
    step: 1,
  },
  {
    id: 'smoothing',
    label: 'Smoothing',
    hint:
      'Low-pass radius in grid cells, along the beam only, applied before the luminance becomes a displacement. Settles jitter without flattening the ridges. Also softens Beam Cutoff by about the same radius.',
    min: 0,
    max: 48,
    hardMin: 0,
    hardMax: 400,
    step: 1,
  },
  {
    id: 'amplitude',
    label: 'Deflection',
    hint:
      'Peak displacement in grid cells. Negative inverts the relief, and the occlusion stack turns over with it.',
    min: -180,
    max: 180,
    hardMin: -2000,
    hardMax: 2000,
    step: 1,
  },
  {
    id: 'bias',
    label: 'Bias',
    hint: 'Luminance that deflects to zero. 0.5 is bipolar; 0 pushes one way only.',
    min: 0,
    max: 1,
    hardMin: -2,
    hardMax: 2,
    step: 0.05,
  },
  {
    id: 'blanking',
    label: 'Beam Cutoff',
    hint:
      'Luminance below which the beam is off entirely. Raise it to clear flat lines off a dark background; 0 draws the baseline everywhere, which is what a relief wants.',
    min: 0,
    max: 0.5,
    hardMin: 0,
    hardMax: 1,
    step: 0.01,
  },
];

const CARRIER_ROWS: Row[] = [
  {
    id: 'carrierFreq',
    label: 'Carrier Freq',
    hint: 'Rate of the modulating carrier. Higher breaks the beam into finer pulses.',
    min: 0.05,
    max: 1.5,
    hardMin: 0,
    hardMax: 20,
    step: 0.01,
  },
  {
    id: 'carrierThreshold',
    label: 'Threshold',
    hint: 'How readily the carrier opens. Higher keeps more of the beam drawn.',
    min: 0,
    max: 0.9,
    hardMin: -5,
    hardMax: 1,
    step: 0.02,
  },
  {
    id: 'pwm',
    label: 'PWM',
    hint: 'How fast the duty cycle opens with luminance — dots in shadow, line in light.',
    min: 0.2,
    max: 2.5,
    hardMin: 0,
    hardMax: 20,
    step: 0.1,
  },
];

const RIPPLE_ROWS: Row[] = [
  {
    id: 'rippleAmp',
    label: 'Ripple',
    hint: 'High-frequency analog noise on the beam, heaviest in the shadows.',
    min: 0,
    max: 20,
    hardMin: 0,
    hardMax: 500,
    step: 0.5,
  },
  {
    id: 'rippleFreq',
    label: 'Ripple Freq',
    hint: 'Rate of the ripple along the beam.',
    min: 0.1,
    max: 5,
    hardMin: 0,
    hardMax: 100,
    step: 0.1,
  },
  {
    id: 'phase',
    label: 'Phase',
    hint: 'Scrubs the carrier and ripple. Advanced automatically while a loop is running.',
    min: 0,
    max: 6.28,
    hardMin: -100,
    hardMax: 100,
    step: 0.05,
  },
];

const OPTICS_ROWS: Row[] = [
  {
    id: 'strokeWidth',
    label: 'Beam Width',
    hint: 'Stroke weight in grid cells. Scales with the image on export.',
    min: 0.5,
    max: 4,
    hardMin: 0,
    hardMax: 40,
    step: 0.1,
  },
  {
    id: 'glow',
    label: 'Phosphor Glow',
    hint: 'Halo radius around the beam.',
    min: 0,
    max: 25,
    hardMin: 0,
    hardMax: 200,
    step: 1,
  },
  {
    id: 'chroma',
    label: 'Aberration',
    hint: 'Splits the beam into offset R/G/B passes that recombine where they overlap.',
    min: 0,
    max: 8,
    hardMin: 0,
    hardMax: 100,
    step: 0.5,
  },
];

/**
 * What survives into the basic panel, in the order it renders.
 *
 * Chosen for what changes the picture most per unit of explanation. Left out:
 * Sample Step (a sampling-rate control that mostly trades detail for speed and
 * reads as a smoother without being one), Bias (only meaningful once you know
 * the deflection is bipolar), Ripple Freq and Phase (both modulate a ripple
 * that is off by default), and Phosphor Glow and Aberration (finishing passes
 * that need a look to finish).
 */
const COMPACT_ROW_IDS: NumericKey[] = [
  'lineCount',
  'amplitude',
  'smoothing',
  'blanking',
  'rippleAmp',
  'strokeWidth',
];

/**
 * The studio's four presets, carried across verbatim except for amplitude and
 * ripple, which were pixel figures against its 800px buffer and are grid cells
 * here — the same numbers, because the vector grid is sized to match.
 */
const PRESETS: { id: string; name: string; hint: string; patch: Partial<VectorConfig> }[] = [
  {
    id: 'unknown-pleasures',
    name: 'UNKNOWN PLEASURES',
    hint: 'Dense horizontal ridges, carrier off, occlusion on',
    patch: {
      direction: 'horizontal',
      lineCount: 80,
      sampleStep: 1,
      smoothing: 6,
      amplitude: 90,
      bias: 0,
      blanking: 0,
      occlusion: true,
      carrierEnabled: false,
      rippleAmp: 0,
      strokeWidth: 1.4,
      glow: 0,
      chroma: 0,
    },
  },
  {
    id: 'oscilloscope',
    name: 'OSCILLOSCOPE',
    hint: 'Vertical beams broken into carrier pulses',
    patch: {
      direction: 'vertical',
      lineCount: 54,
      sampleStep: 2,
      smoothing: 0,
      amplitude: 65,
      bias: 0.5,
      blanking: 0.02,
      occlusion: false,
      carrierEnabled: true,
      carrierFreq: 0.45,
      carrierThreshold: 0.32,
      pwm: 1.2,
      rippleAmp: 0,
      strokeWidth: 1.2,
      glow: 0,
      chroma: 0,
    },
  },
  {
    id: 'pulsar',
    name: 'PULSAR',
    hint: 'Wide deflection with heavy analog ripple and glow',
    patch: {
      direction: 'horizontal',
      lineCount: 46,
      sampleStep: 1,
      smoothing: 8,
      amplitude: 120,
      bias: 0,
      blanking: 0,
      occlusion: true,
      carrierEnabled: false,
      rippleAmp: 6,
      rippleFreq: 2.4,
      strokeWidth: 1.6,
      glow: 10,
      chroma: 0,
    },
  },
  {
    id: 'contour',
    name: 'CONTOUR',
    hint: 'Continuous beams on the subject only — carrier off, cutoff raised',
    patch: {
      direction: 'vertical',
      lineCount: 64,
      sampleStep: 1,
      smoothing: 4,
      amplitude: 55,
      bias: 0.5,
      blanking: 0.14,
      occlusion: false,
      carrierEnabled: false,
      rippleAmp: 0,
      strokeWidth: 1.2,
      glow: 0,
      chroma: 0,
    },
  },
  {
    id: 'rutt-etra',
    name: 'RUTT-ETRA',
    hint: 'Chromatic beam split, fine scan, no occlusion',
    patch: {
      direction: 'vertical',
      lineCount: 120,
      sampleStep: 1,
      smoothing: 0,
      amplitude: 45,
      bias: 0.5,
      blanking: 0.06,
      occlusion: false,
      carrierEnabled: false,
      rippleAmp: 1.5,
      rippleFreq: 3.2,
      strokeWidth: 0.8,
      glow: 6,
      chroma: 3,
    },
  },
];

export const VectorControls: React.FC<VectorControlsProps> = ({
  config,
  onChange,
  compact = false,
}) => {
  const set = <K extends keyof VectorConfig>(key: K, value: VectorConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  /*
   * The carrier defaults to *on*, so hiding its deck without switching it off
   * would leave a basic user with a dashed beam and no control that explains
   * it. Only `carrierEnabled` is touched — the three tuning values stay in the
   * config, so the advanced deck still has them when it comes back.
   */
  useEffect(() => {
    if (compact && config.carrierEnabled) {
      onChange({ ...config, carrierEnabled: false });
    }
  }, [compact, config, onChange]);

  const ALL_ROWS = [...GEOMETRY_ROWS, ...CARRIER_ROWS, ...RIPPLE_ROWS, ...OPTICS_ROWS];
  const compactRows = COMPACT_ROW_IDS.map(
    (id) => ALL_ROWS.find((r) => r.id === id) as Row
  );

  const renderRows = (rows: Row[], disabled = false) =>
    rows.map((row) => (
      <div className="control-row" key={row.id}>
        <span className="control-label" title={row.hint}>
          {row.label}
        </span>
        <PrecisionSlider
          value={config[row.id]}
          sliderMin={row.min}
          sliderMax={row.max}
          hardMin={row.hardMin}
          hardMax={row.hardMax}
          step={row.step}
          resetTo={VECTOR_CONFIG_DEFAULTS[row.id]}
          disabled={disabled}
          onChange={(val) => set(row.id, val)}
        />
      </div>
    ));

  return (
    <>
      {!compact && (
        <div className="vector-preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-sm vector-preset-chip"
              title={p.hint}
              onClick={() => onChange({ ...config, ...p.patch })}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="control-row">
        <span className="control-label" title="Which way the beams sweep.">
          Scan Axis
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className={`btn btn-sm ${config.direction === 'vertical' ? 'btn-primary' : ''}`}
            onClick={() => set('direction', 'vertical')}
            title="Vertical beams deflected sideways"
            style={{ height: '22px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            <MoveVertical size={10} />
            <span>VERT</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${config.direction === 'horizontal' ? 'btn-primary' : ''}`}
            onClick={() => set('direction', 'horizontal')}
            title="Horizontal beams deflected upward — the Rutt-Etra relief"
            style={{ height: '22px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            <MoveHorizontal size={10} />
            <span>HORIZ</span>
          </button>
        </div>
      </div>

      {renderRows(compact ? compactRows : GEOMETRY_ROWS)}

      <div className="control-row" style={{ alignItems: 'center' }}>
        <span
          className="control-label"
          title="Hide what is behind a nearer ridge. Which side the stack faces follows the sign of Deflection. Applies to the beams that stayed continuous."
        >
          Occlusion
        </span>
        <button
          type="button"
          className={`btn btn-sm ${config.occlusion ? 'btn-primary' : ''}`}
          onClick={() => set('occlusion', !config.occlusion)}
          style={{ minWidth: '46px', height: '22px', fontSize: '10px', fontWeight: 700 }}
        >
          {config.occlusion ? 'ON' : 'OFF'}
        </button>
      </div>

      {/*
        * The three tuning decks are advanced-only. Compact keeps a single flat
        * list instead of subheadings, because with one or two rows under each a
        * heading costs more vertical space than the control it introduces.
        */}
      {!compact && (
        <>
          <div className="tonal-subheading">
            <span>Carrier Modulation</span>
            <button
              type="button"
              className={`btn btn-sm ${config.carrierEnabled ? 'btn-primary' : ''}`}
              onClick={() => set('carrierEnabled', !config.carrierEnabled)}
              title="Break the beam into pulses where the image is dark"
              style={{ minWidth: '46px', height: '18px', fontSize: '9.5px', fontWeight: 700 }}
            >
              {config.carrierEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {renderRows(CARRIER_ROWS, !config.carrierEnabled)}

          <div className="tonal-subheading">
            <span>Analog Ripple</span>
          </div>
          {renderRows(RIPPLE_ROWS)}

          <div className="tonal-subheading">
            <span>Beam Optics</span>
          </div>
          {renderRows(OPTICS_ROWS)}
        </>
      )}
    </>
  );
};
