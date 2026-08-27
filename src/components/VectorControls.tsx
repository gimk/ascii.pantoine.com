import React from 'react';
import { VectorConfig, VECTOR_CONFIG_DEFAULTS } from '../types/ascii';
import { PrecisionSlider } from './controlPrimitives';
import { RotateCcw, Activity, MoveVertical, MoveHorizontal } from 'lucide-react';

/**
 * Beam deflection controls — vector mode's replacement for the dither picker.
 *
 * The two are mutually exclusive by construction: vector output leaves the
 * raster pipeline before quantization, so an algorithm selection has nothing to
 * act on. App hides the picker and shows this in its slot, and leaves
 * `ditherAlgorithm` in state untouched so switching back restores it.
 */

interface VectorControlsProps {
  config: VectorConfig;
  onChange: (config: VectorConfig) => void;
}

type NumericKey = {
  [K in keyof VectorConfig]: VectorConfig[K] extends number ? K : never;
}[keyof VectorConfig];

interface Row {
  id: NumericKey;
  label: string;
  hint: string;
  min: number;
  max: number;
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
    step: 1,
  },
  {
    id: 'sampleStep',
    label: 'Sample Step',
    hint: 'Grid cells between samples along a beam. Higher is coarser and faster.',
    min: 1,
    max: 6,
    step: 1,
  },
  {
    id: 'amplitude',
    label: 'Deflection',
    hint: 'Peak displacement in grid cells. Negative inverts the relief.',
    min: -180,
    max: 180,
    step: 1,
  },
  {
    id: 'bias',
    label: 'Bias',
    hint: 'Luminance that deflects to zero. 0.5 is bipolar; 0 pushes one way only.',
    min: 0,
    max: 1,
    step: 0.05,
  },
];

const CARRIER_ROWS: Row[] = [
  {
    id: 'carrierFreq',
    label: 'Carrier Freq',
    hint: 'Rate of the modulating carrier. Higher breaks the beam into finer pulses.',
    min: 0.05,
    max: 1.5,
    step: 0.01,
  },
  {
    id: 'carrierThreshold',
    label: 'Threshold',
    hint: 'How readily the carrier opens. Higher keeps more of the beam drawn.',
    min: 0,
    max: 0.9,
    step: 0.02,
  },
  {
    id: 'pwm',
    label: 'PWM',
    hint: 'How fast the duty cycle opens with luminance — dots in shadow, line in light.',
    min: 0.2,
    max: 2.5,
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
    step: 0.5,
  },
  {
    id: 'rippleFreq',
    label: 'Ripple Freq',
    hint: 'Rate of the ripple along the beam.',
    min: 0.1,
    max: 5,
    step: 0.1,
  },
  {
    id: 'phase',
    label: 'Phase',
    hint: 'Scrubs the carrier and ripple. Advanced automatically while a loop is running.',
    min: 0,
    max: 6.28,
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
    step: 0.1,
  },
  {
    id: 'glow',
    label: 'Phosphor Glow',
    hint: 'Halo radius around the beam.',
    min: 0,
    max: 25,
    step: 1,
  },
  {
    id: 'chroma',
    label: 'Aberration',
    hint: 'Splits the beam into offset R/G/B passes that recombine where they overlap.',
    min: 0,
    max: 8,
    step: 0.5,
  },
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
      amplitude: 90,
      bias: 0,
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
      amplitude: 65,
      bias: 0.5,
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
      amplitude: 120,
      bias: 0,
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
    id: 'rutt-etra',
    name: 'RUTT-ETRA',
    hint: 'Chromatic beam split, fine scan, no occlusion',
    patch: {
      direction: 'vertical',
      lineCount: 120,
      sampleStep: 1,
      amplitude: 45,
      bias: 0.5,
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

export const VectorControls: React.FC<VectorControlsProps> = ({ config, onChange }) => {
  const set = <K extends keyof VectorConfig>(key: K, value: VectorConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const isDefault = (Object.keys(VECTOR_CONFIG_DEFAULTS) as (keyof VectorConfig)[]).every(
    (k) => config[k] === VECTOR_CONFIG_DEFAULTS[k]
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
          step={row.step}
          resetTo={VECTOR_CONFIG_DEFAULTS[row.id]}
          disabled={disabled}
          onChange={(val) => set(row.id, val)}
        />
      </div>
    ));

  return (
    <div className="dither-param-deck">
      <div className="dither-param-deck-header">
        <div className="dither-param-deck-title">
          <Activity size={11} />
          <span>Beam Deflection</span>
        </div>
        {!isDefault && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onChange({ ...VECTOR_CONFIG_DEFAULTS })}
            title="Reset every beam parameter"
            style={{
              padding: '1px 6px',
              height: '18px',
              fontSize: '9.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <RotateCcw size={10} />
            <span>Reset</span>
          </button>
        )}
      </div>

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

      {renderRows(GEOMETRY_ROWS)}

      <div className="control-row" style={{ alignItems: 'center' }}>
        <span
          className="control-label"
          title="Hide what is behind a nearer ridge. Applies to the beams that stayed continuous."
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
    </div>
  );
};
