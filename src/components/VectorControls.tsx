import React from 'react';
import { VectorConfig, VECTOR_CONFIG_DEFAULTS } from '../types/ascii';
import { PrecisionSlider, ToggleSwitch } from './controlPrimitives';
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

/*
 * `Extract<…, string>` is doing real work, not tidying: a mapped type keeps the
 * `?` modifier, so an *optional* numeric field contributes `undefined` here
 * rather than its key. That drops the deprecated `glow`, which is exactly
 * right — it has no row any more — and it will drop the next deprecation the
 * same way instead of handing it a slider that writes to dead state.
 */
type NumericKey = Extract<
  {
    [K in keyof VectorConfig]: VectorConfig[K] extends number ? K : never;
  }[keyof VectorConfig],
  string
>;

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
    id: 'chroma',
    label: 'Beam Aberration',
    hint:
      'Splits the beam into offset R/G/B passes that recombine where they overlap. ' +
      'Real geometry, so it survives into an SVG export — unlike the frame-level ' +
      'aberration in POST-PROCESSING, which is all the cell modes can have.',
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
 *
 * The whole carrier deck goes too, and costs nothing to hide because
 * `carrierEnabled` now defaults to *off*: a basic user opens on a plain
 * deflected scan rather than on a dashed one they have no control to explain.
 * This panel therefore only hides — it never writes — which is the invariant
 * every other reduction in BASIC holds.
 */
const COMPACT_ROW_IDS: NumericKey[] = [
  'lineCount',
  'amplitude',
  'smoothing',
  'blanking',
  'rippleAmp',
  'strokeWidth',
];

export const VectorControls: React.FC<VectorControlsProps> = ({
  config,
  onChange,
  compact = false,
}) => {
  const set = <K extends keyof VectorConfig>(key: K, value: VectorConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

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
      <div className="control-row">
        <span className="control-label" title="Which way the beams sweep.">
          Scan Axis
        </span>
        <div className="btn-group">
          <button
            type="button"
            className={`btn btn-sm btn-toggle ${config.direction === 'vertical' ? 'btn-primary' : ''}`}
            onClick={() => set('direction', 'vertical')}
            title="Vertical beams deflected sideways"
          >
            <MoveVertical size={10} />
            <span>VERT</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm btn-toggle ${config.direction === 'horizontal' ? 'btn-primary' : ''}`}
            onClick={() => set('direction', 'horizontal')}
            title="Horizontal beams deflected upward — the Rutt-Etra relief"
          >
            <MoveHorizontal size={10} />
            <span>HORIZ</span>
          </button>
        </div>
      </div>

      {renderRows(compact ? compactRows : GEOMETRY_ROWS)}

      <div className="control-row">
        <span
          className="control-label"
          title="Hide what is behind a nearer ridge. Which side the stack faces follows the sign of Deflection. Applies to the beams that stayed continuous."
        >
          Occlusion
        </span>
        <ToggleSwitch
          checked={Boolean(config.occlusion)}
          onChange={(val) => set('occlusion', val)}
          title="Hide what is behind a nearer ridge"
        />
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
            <ToggleSwitch
              checked={Boolean(config.carrierEnabled)}
              onChange={(val) => set('carrierEnabled', val)}
              title="Break the beam into pulses where the image is dark"
            />
          </div>
          {renderRows(CARRIER_ROWS, !config.carrierEnabled)}

          <div className="tonal-subheading">
            <span>Analog Ripple</span>
          </div>
          {renderRows(RIPPLE_ROWS)}

          {/*
            Beam Width and Beam Aberration only. Phosphor Glow used to sit here
            and is now one stage in 04 · POST-PROCESSING, blurring the finished
            frame once instead of shadowing every stroke — which also gives it
            to ASCII and pixel, and finally into SVG.

            Aberration stays because it is not a filter: it offsets the *trace*
            into three real channel passes that export as polylines. The
            post-processing one shifts pixels, which is all a cell mode can do.
          */}
          <div className="tonal-subheading">
            <span>Beam Optics</span>
          </div>
          {renderRows(OPTICS_ROWS)}
        </>
      )}
    </>
  );
};
