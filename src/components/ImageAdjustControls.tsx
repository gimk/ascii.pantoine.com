import React, { useState, useRef, useMemo } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { NumberInput, PrecisionSlider, DeferredColorInput } from './controlPrimitives';
import {
  ImageAdjustConfig,
  ToneMappingConfig,
  MediaColorConfig,
  DEFAULT_IMAGE_ADJUST_CONFIG,
} from '../types/ascii';
import { BUILTIN_PALETTES } from '../engine/palettes';
import { evaluateMonotoneCubicSpline } from '../engine/mediaRenderer';
import { computeAutoLevels } from '../engine/autoLevels';
import { toneBandShares } from '../engine/rasterEngine';
import { NToneRampEditor, NEUTRAL_STOP_WEIGHT, resampleRamp } from './NToneRampEditor';
import { Sliders, Sparkles, Minus, Plus, Palette, BarChart3 } from 'lucide-react';
import { BackgroundMode } from '../types/ascii';

// ---------------------------------------------------------------------------
// Shared grading slider registry
//
// Every numeric grading slider is declared once here and rendered through
// AdjustSlider. The BASIC panel groups these rows differently from ADVANCED,
// and without a single declaration the two layouts would drift the moment
// anyone retuned a range -- a blur capped at 8 in one panel and 40 in the
// other is the kind of divergence nobody notices until it ships.
// ---------------------------------------------------------------------------

export type AdjustSliderId =
  | 'highlights'
  | 'midtones'
  | 'shadows'
  | 'sharpenStrength'
  | 'sharpenRadius'
  | 'noise'
  | 'denoise'
  | 'blur'
  | 'brightness'
  | 'contrast';

export interface AdjustSliderSpec {
  label: string;
  /** Range the track spans under normal use. */
  sliderMin: number;
  sliderMax: number;
  /** Wider range the number field accepts. Defaults to the track range. */
  hardMin?: number;
  hardMax?: number;
  step: number;
  /** Snap-back target for a double-click on the track. */
  resetTo: number;
}

export const ADJUST_SLIDERS: Record<AdjustSliderId, AdjustSliderSpec> = {
  highlights: {
    label: 'Highlights',
    sliderMin: -100,
    sliderMax: 100,
    step: 1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.highlights,
  },
  midtones: {
    label: 'Midtones',
    sliderMin: -100,
    sliderMax: 100,
    step: 1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.midtones,
  },
  shadows: {
    label: 'Shadows',
    sliderMin: -100,
    sliderMax: 100,
    step: 1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.shadows,
  },
  sharpenStrength: {
    label: 'Sharpen Strength',
    sliderMin: 0,
    sliderMax: 300,
    hardMax: 1000,
    step: 5,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.sharpenStrength,
  },
  sharpenRadius: {
    label: 'Sharpen Radius',
    sliderMin: 0.1,
    sliderMax: 4,
    hardMax: 10,
    step: 0.1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.sharpenRadius,
  },
  noise: {
    label: 'Noise / Grain',
    sliderMin: 0,
    sliderMax: 100,
    hardMax: 200,
    step: 1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.noise,
  },
  denoise: {
    label: 'Denoise',
    sliderMin: 0,
    sliderMax: 8,
    hardMax: 100,
    step: 0.1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.denoise ?? 0,
  },
  blur: {
    label: 'Blur',
    sliderMin: 0,
    sliderMax: 8,
    hardMax: 40,
    step: 0.1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.blur,
  },
  brightness: {
    label: 'Brightness',
    sliderMin: -25,
    sliderMax: 25,
    hardMin: -100,
    hardMax: 100,
    step: 0.1,
    resetTo: 0,
  },
  contrast: {
    label: 'Contrast',
    sliderMin: -25,
    sliderMax: 25,
    hardMin: -100,
    hardMax: 100,
    step: 0.1,
    resetTo: 0,
  },
};

/** One labelled grading slider, rendered from its entry in ADJUST_SLIDERS. */
export const AdjustSlider: React.FC<{
  id: AdjustSliderId;
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  /** Overrides the registry label; the ranges are never overridable. */
  label?: string;
}> = ({ id, config, onChangeConfig, label }) => {
  const spec = ADJUST_SLIDERS[id];
  return (
    <div className="control-row">
      <span className="control-label">{label ?? spec.label}</span>
      <PrecisionSlider
        value={config[id] ?? spec.resetTo}
        sliderMin={spec.sliderMin}
        sliderMax={spec.sliderMax}
        hardMin={spec.hardMin}
        hardMax={spec.hardMax}
        step={spec.step}
        resetTo={spec.resetTo}
        onChange={(val) => onChangeConfig({ ...config, [id]: val })}
      />
    </div>
  );
};

/**
 * Tonal Balance: the three luminance push sliders, with their reset.
 *
 * Note these are NOT the tone ramp's highlight/midtone/shadow *colours*
 * (highlightColor & co). The app has both triplets and they are unrelated:
 * these shift luminance before the dither, those pick what colour the result
 * is painted in. Keeping them in separate, differently titled groups is the
 * only thing stopping that from being thoroughly confusing.
 */
export const TonalBalanceGroup: React.FC<{
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  resetDefaults?: ImageAdjustConfig;
}> = ({ config, onChangeConfig, resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG }) => (
  <>
    <div className="tonal-subheading">
      <span>Tonal Balance</span>
      <button
        type="button"
        className="btn-reset"
        onClick={() =>
          onChangeConfig({
            ...config,
            highlights: resetDefaults.highlights ?? 0,
            midtones: resetDefaults.midtones ?? 0,
            shadows: resetDefaults.shadows ?? 0,
          })
        }
        title="Reset highlights, midtones, and shadows to 0"
      >
        RESET
      </button>
    </div>
    <AdjustSlider id="highlights" config={config} onChangeConfig={onChangeConfig} />
    <AdjustSlider id="midtones" config={config} onChangeConfig={onChangeConfig} />
    <AdjustSlider id="shadows" config={config} onChangeConfig={onChangeConfig} />
  </>
);

/**
 * Writes a set of ramp stops back onto the config.
 *
 * The engine still reads the legacy shadow/midtone/highlight triple in some
 * paths, so the ends and middle of the stop array are mirrored onto them on
 * every edit rather than left to go stale.
 */
export const applyToneStops = (
  config: ImageAdjustConfig,
  newStops: string[]
): ImageAdjustConfig => ({
  ...config,
  tonalMapping: 'ntone',
  customToneColors: newStops,
  shadowColor: newStops[0] || '#000000',
  midtoneColor:
    newStops.length > 2 ? newStops[Math.floor(newStops.length / 2)] : '#3b82f6',
  highlightColor: newStops[newStops.length - 1] || '#ffffff',
});

/**
 * The N-tone ramp editor, shown only once the mapping is past single colour.
 *
 * Colours and band widths are edited in one place here, the same as in BASIC.
 * They were split for a while -- stops in this editor, nothing for widths -- and
 * a ramp you could recolour but not redistribute is only half a ramp.
 */
export const ToneRampGroup: React.FC<{
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  resetDefaults?: ImageAdjustConfig;
  /**
   * An indexed palette is driving colour, so the engine skips this ramp
   * entirely -- see `paletteOwnsQuantization`. The editor stays usable (what is
   * set here takes effect the moment the palette comes off) but says so.
   */
  paletteActive?: boolean;
}> = ({
  config,
  onChangeConfig,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  paletteActive = false,
}) => {
  if (!config.tonalMapping || config.tonalMapping === '1color') return null;

  const fallbackStops = resetDefaults.customToneColors
    ? [...resetDefaults.customToneColors]
    : ['#0a0a0a', '#00a848', '#00ff66'];

  const { colors, weights } = resolveToneStops(config);

  return (
    <div style={{ marginTop: '6px' }}>
      <div className="tonal-subheading">
        <span>N-Tone Ramp Editor</span>
        <button
          type="button"
          className="btn-reset"
          /* Colours and distribution both, or RESET leaves half the ramp behind. */
          onClick={() =>
            onChangeConfig({
              ...applyToneStops(config, fallbackStops),
              toneStopWeights: fallbackStops.map(() => DEFAULT_STOP_WEIGHT),
            })
          }
          title="Reset Ramp to default green tones and an even distribution"
        >
          RESET
        </button>
      </div>
      {paletteActive && (
        <div className="panel-note" style={{ marginBottom: '8px' }}>
          <span>
            A preset palette is driving colour. These stops and widths apply once
            it is turned off.
          </span>
        </div>
      )}
      <NToneRampEditor
        stops={colors}
        weights={weights}
        onChangeRamp={(stops, nextWeights) =>
          onChangeConfig({
            ...applyToneStops(config, stops),
            toneStopWeights: nextWeights,
          })
        }
      />
    </div>
  );
};

/**
 * Neutral weight. Weights are relative, so all-equal is an even split.
 *
 * An alias, not a second constant: the engine defines neutral and both editors
 * have to agree with it or a "reset" would leave the warp switched on.
 */
export const DEFAULT_STOP_WEIGHT = NEUTRAL_STOP_WEIGHT;

/**
 * Most stops the BASIC stepper will add.
 *
 * The engine and ADVANCED's ramp editor both go to 256; this is a layout
 * limit, not an engine one. Each stop here is a full row -- label, swatch,
 * slider -- so past about eight the ramp stops being one control among six and
 * becomes the whole panel. A ramp that arrives with more (a preset, a shared
 * link, an ADVANCED session) is shown in full and can still be shortened; only
 * the + button stops.
 */
export const BASIC_MAX_TONE_STOPS = 8;

/**
 * The stops currently driving colour, and the weight each one carries.
 *
 * `paletteColors` wins when given, and callers pass it only while an indexed
 * palette is actually rendering. It has to win: `customToneColors` is never
 * empty — DEFAULT_IMAGE_ADJUST_CONFIG seeds it with three greens — so checking
 * it first meant a selected palette was always shadowed by those greens and the
 * bands never changed when you picked one.
 */
export const resolveToneStops = (
  config: ImageAdjustConfig,
  paletteColors?: string[]
): { colors: string[]; weights: number[] } => {
  let colors: string[];

  if (paletteColors && paletteColors.length >= 2) {
    colors = paletteColors;
  } else if (config.customToneColors && config.customToneColors.length >= 2) {
    colors = config.customToneColors;
  } else if (config.tonalMapping === '2color') {
    colors = [config.shadowColor || '#0a0a0a', config.highlightColor || '#00ff66'];
  } else {
    colors = [
      config.shadowColor || '#0a0a0a',
      config.midtoneColor || '#00a848',
      config.highlightColor || '#00ff66',
    ];
  }

  const weights =
    config.toneStopWeights && config.toneStopWeights.length === colors.length
      ? config.toneStopWeights
      : colors.map(() => DEFAULT_STOP_WEIGHT);

  return { colors, weights };
};

/**
 * One row per ramp stop: its colour, and how much of the tonal range it gets.
 *
 * The slider is a **band width**, not an opacity and not a luminance push. It
 * widens or narrows the slice of the luminance range that maps to that colour,
 * which is what "more of this colour" actually means for a tone ramp -- drag
 * shadows up and more of the image resolves to the shadow stop. The engine
 * implements it as a monotone warp applied before quantization; see
 * buildToneBandLut in rasterEngine for why it cannot simply move the bucket
 * boundaries.
 *
 * Colour and weight sit on the same line deliberately. Split across two
 * sections -- stops under COLORS, grading under TONAL CONTROLS, as ADVANCED
 * still has it -- making a chosen colour actually read means a round trip
 * between panels.
 *
 * Every edit commits the *resolved* stop list, not whatever `customToneColors`
 * happened to hold. While a palette is showing, those are the palette's own
 * colours, so a host converting the palette into an editable ramp gets the
 * colours that were on screen rather than a stale default.
 */
export const ToneBandRows: React.FC<{
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  /**
   * Colours of the active built-in palette, when one is driving the render.
   */
  paletteColors?: string[];
  /**
   * Show the bands but refuse edits.
   *
   * Used while an indexed palette is rendering: the stops shown are real, but
   * neither weight nor colour applies to that path, and converting away from it
   * costs enough that it should be a deliberate act rather than the side effect
   * of nudging a slider.
   */
  disabled?: boolean;
}> = ({ config, onChangeConfig, paletteColors, disabled = false }) => {
  const { colors, weights } = resolveToneStops(config, paletteColors);

  const setStopColor = (index: number, hex: string) => {
    const next = [...colors];
    next[index] = hex;
    onChangeConfig({
      ...applyToneStops(config, next),
      /* Weights are positional — one per stop — so they travel with the list. */
      toneStopWeights: [...weights],
    });
  };

  const setStopWeight = (index: number, value: number) => {
    const next = [...weights];
    next[index] = value;
    onChangeConfig({
      ...applyToneStops(config, [...colors]),
      toneStopWeights: next,
    });
  };

  /*
   * Change how many colours the ramp has. `resampleRamp` is shared with
   * ADVANCED's editor -- same interpolation, same weight carry-over -- so a
   * ramp built in one panel and resized in the other behaves identically. Only
   * the cap differs, and that is a layout limit passed in by the caller.
   */
  const setStopCount = (nextCount: number) => {
    const next = resampleRamp(colors, weights, nextCount, BASIC_MAX_TONE_STOPS);
    if (next.colors === colors) return;
    onChangeConfig({
      ...applyToneStops(config, next.colors),
      toneStopWeights: next.weights,
    });
  };

  const isEven = weights.every((w) => w === weights[0]);

  /*
   * Proportions straight from the engine helper, so the bar shows the widths
   * the render will actually use rather than an even split that would hide the
   * only thing the weights do.
   */
  const shares = toneBandShares(disabled ? undefined : weights, colors.length);

  /* Labelled by role at the ends, by position in between. */
  const labelFor = (i: number) => {
    if (i === 0) return 'Shadows';
    if (i === colors.length - 1) return 'Highlights';
    if (colors.length === 3) return 'Midtones';
    return `Tone ${i + 1}`;
  };

  return (
    <>
      <div className="tonal-subheading">
        <span>Tonal Bands</span>
        {/*
          * Count sits with the bands rather than in its own section: how many
          * colours the ramp has and how wide each one is are one decision. An
          * indexed palette has no say -- its length is the palette's -- so the
          * stepper is hidden rather than shown inert.
          */}
        {!disabled && (
          <span className="tone-band-count">
            <button
              type="button"
              className="slider-nudge-btn"
              disabled={colors.length <= 2}
              onClick={() => setStopCount(colors.length - 1)}
              title="One fewer colour"
            >
              <Minus size={11} />
            </button>
            <span className="tone-band-count-value" title={`${colors.length} colours in the ramp`}>
              {colors.length}
            </span>
            <button
              type="button"
              className="slider-nudge-btn"
              disabled={colors.length >= BASIC_MAX_TONE_STOPS}
              onClick={() => setStopCount(colors.length + 1)}
              title={
                colors.length >= BASIC_MAX_TONE_STOPS
                  ? `${BASIC_MAX_TONE_STOPS} is the most this panel shows -- use ADVANCED for longer ramps`
                  : 'One more colour'
              }
            >
              <Plus size={11} />
            </button>
          </span>
        )}
        {!isEven && !disabled && (
          <button
            type="button"
            className="btn-reset"
            onClick={() =>
              onChangeConfig({
                ...config,
                toneStopWeights: colors.map(() => DEFAULT_STOP_WEIGHT),
              })
            }
            title="Give every colour an equal share of the tonal range"
          >
            EVEN
          </button>
        )}
      </div>

      {/*
       * Shadow on the left, highlight on the right — the same reading order as
       * the rows below, and as the ramp itself.
       */}
      <div
        className="tone-band-preview"
        title={
          disabled
            ? 'Colours in this palette'
            : 'Share of the tonal range each colour covers'
        }
      >
        {colors.map((color, i) => (
          <span
            key={i}
            className="tone-band-preview-seg"
            style={{ background: color, flexGrow: shares[i] }}
          />
        ))}
      </div>

      {colors.map((color, i) => (
        <div className="tone-band-row" key={i}>
          <span className="control-label tone-band-label">{labelFor(i)}</span>
          <DeferredColorInput
            value={color}
            showHexField={false}
            disabled={disabled}
            title={`${labelFor(i)} colour`}
            onChange={(hex) => setStopColor(i, hex)}
          />
          {/*
           * A bare range, not PrecisionSlider: its numeric field is 54px of
           * fixed width that will not shrink, and beside a label and a swatch
           * there is not room for it in a 380px panel. The weight is relative
           * anyway — the number carries no meaning worth reading.
           */}
          <input
            type="range"
            className="range-slider tone-band-slider"
            min={0}
            max={100}
            step={1}
            value={weights[i]}
            disabled={disabled}
            onChange={(e) => setStopWeight(i, parseInt(e.target.value, 10))}
            onDoubleClick={() => !disabled && setStopWeight(i, DEFAULT_STOP_WEIGHT)}
            title={
              disabled
                ? 'Band widths apply to tone ramps, not to palette matching'
                : `Share of the tonal range given to ${labelFor(i).toLowerCase()}. Double-click to reset.`
            }
          />
        </div>
      ))}
    </>
  );
};

/** The three canvas backdrops the media renderer understands. */
const BACKGROUND_MODES: { id: BackgroundMode; label: string; title: string }[] = [
  { id: 'black', label: 'BLACK', title: 'Solid black backdrop' },
  { id: 'white', label: 'WHITE', title: 'Solid white backdrop — inverts the paper' },
  { id: 'transparent', label: 'NONE', title: 'Transparent — exports with an alpha channel' },
];

/**
 * Backdrop selector.
 *
 * The engine has read viewConfig.background since the media renderer landed
 * (mediaRenderer.ts, resolveMediaBackgroundColor) but nothing ever exposed it,
 * so it was stuck on the 'black' default. This is that control.
 */
export const BackgroundRow: React.FC<{
  value: BackgroundMode;
  onChange: (next: BackgroundMode) => void;
}> = ({ value, onChange }) => (
  <div className="control-row">
    <span className="control-label">Background</span>
    <div className="btn-group-inline">
      {BACKGROUND_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`btn btn-sm ${value === mode.id ? 'btn-primary' : ''}`}
          onClick={() => onChange(mode.id)}
          title={mode.title}
        >
          {mode.label}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Escape hatch for a non-auto quantize depth in a panel that does not show the
 * quantize control.
 *
 * BASIC leaves depth on Auto, where it follows the charset or palette and
 * needs no decision. But hiding a control is not the same as resetting it: a
 * shared link serialises colorLevels, and so does flipping over from ADVANCED
 * mid-session. Either way the image comes out posterised with nothing on
 * screen to explain why. Rather than silently forcing it back -- which would
 * throw away a deliberate ADVANCED setting on a mode switch -- surface it only
 * when it is actually set, with one button to return to Auto.
 */
export const QuantizeDepthNotice: React.FC<{
  value?: number;
  onReset: () => void;
}> = ({ value, onReset }) => {
  if (!value || value <= 0) return null;
  return (
    <div className="control-row">
      <span className="control-label">Depth</span>
      <div className="btn-group-inline">
        <span className="control-static-value">{value} LEVELS</span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onReset}
          title="Return quantization depth to Auto, following the charset or palette"
        >
          AUTO
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// High-Accuracy Quantize Levels Control
// ---------------------------------------------------------------------------
interface QuantizeLevelsControlProps {
  value?: number; // 0 (auto) or 2..256
  onChange: (val: number) => void;
}

const QUANTIZE_PRESETS: { label: string; value: number; title: string }[] = [
  { label: 'AUTO', value: 0, title: 'Auto (Natural depth from charset or palette)' },
  { label: '2 (1b)', value: 2, title: '2 Levels — 1-bit Monochrome' },
  { label: '4 (2b)', value: 4, title: '4 Levels — 2-bit (Game Boy / CGA)' },
  { label: '8 (3b)', value: 8, title: '8 Levels — 3-bit Color' },
  { label: '16 (4b)', value: 16, title: '16 Levels — 4-bit (C64 / PICO-8)' },
  { label: '32', value: 32, title: '32 Levels — 5-bit Depth' },
  { label: '64', value: 64, title: '64 Levels — 6-bit Posterization' },
  { label: '128', value: 128, title: '128 Levels — 7-bit Semi-continuous' },
  { label: '256', value: 256, title: '256 Levels — 8-bit Continuous Tone' },
];

export const QuantizeLevelsControl: React.FC<QuantizeLevelsControlProps> = ({
  value = 0,
  onChange,
}) => {
  const normalizedVal = value ?? 0;

  // Logarithmic slider warp mapping:
  // pos 0 -> 0 (Auto)
  // pos 1..100 -> exponential 2^1..2^8 (2 to 256)
  const sliderPos = useMemo(() => {
    if (normalizedVal <= 0) return 0;
    const clamped = Math.max(2, Math.min(256, normalizedVal));
    const exp = Math.log2(clamped); // 1 to 8
    const t = (exp - 1) / 7; // 0 to 1
    return Math.round(1 + t * 99);
  }, [normalizedVal]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseInt(e.target.value, 10);
    if (pos === 0) {
      onChange(0);
      return;
    }
    const t = (pos - 1) / 99; // 0 to 1
    const exp = 1 + t * 7; // 1 to 8
    const rawVal = Math.round(Math.pow(2, exp));
    onChange(Math.max(2, Math.min(256, rawVal)));
  };

  const handleStep = (delta: number) => {
    if (normalizedVal === 0) {
      if (delta > 0) onChange(2);
      return;
    }
    const next = normalizedVal + delta;
    if (next < 2) {
      onChange(0); // Underflow to Auto
    } else {
      onChange(Math.min(256, next));
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="tonal-subheading">
        <span>Quantization &amp; Dither Depth</span>
        <button
          type="button"
          className="btn-reset"
          onClick={() => onChange(0)}
          title="Reset Quantization Depth to Auto"
        >
          RESET
        </button>
      </div>

      {/* Quick Bit-Depth Preset Chips */}
      <div className="quantize-chip-row" style={{ marginTop: '4px', marginBottom: '8px' }}>
        {QUANTIZE_PRESETS.map((p) => {
          const isSelected = normalizedVal === p.value;
          return (
            <button
              key={p.value}
              type="button"
              className={`quantize-chip ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(p.value)}
              title={p.title}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Stepper + Warp Slider + Numeric Direct Entry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          className="slider-nudge-btn"
          onClick={() => handleStep(-1)}
          title="Decrease levels by 1"
        >
          <Minus size={10} />
        </button>

        <input
          type="range"
          className="range-slider"
          min={0}
          max={100}
          step={1}
          value={sliderPos}
          onChange={handleSliderChange}
          title={`Quantize level: ${normalizedVal === 0 ? 'Auto' : normalizedVal}`}
        />

        <button
          type="button"
          className="slider-nudge-btn"
          onClick={() => handleStep(1)}
          title="Increase levels by 1"
        >
          <Plus size={10} />
        </button>

        <NumberInput
          value={normalizedVal}
          min={0}
          max={256}
          step={1}
          onChange={(val) => onChange(val === 1 ? 2 : val)}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tone Curve Spline Graph with Preset Bar
// ---------------------------------------------------------------------------
interface ToneCurveGraphProps {
  config: ImageAdjustConfig;
  onChangeConfig: (newConfig: ImageAdjustConfig) => void;
}

const DEFAULT_CURVE_POINTS: [number, number][] = [
  [0, 0],
  [0.25, 0.25],
  [0.5, 0.5],
  [0.75, 0.75],
  [1, 1],
];

const CURVE_PRESETS: { name: string; points: [number, number][]; title: string }[] = [
  {
    name: 'LINEAR',
    title: '1:1 Neutral Linear Transfer',
    points: [
      [0, 0],
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
      [1, 1],
    ],
  },
  {
    name: 'S-CURVE',
    title: 'S-Curve Contrast Boost',
    points: [
      [0, 0],
      [0.25, 0.12],
      [0.5, 0.5],
      [0.75, 0.88],
      [1, 1],
    ],
  },
  {
    name: 'LIFT',
    title: 'Lift Shadow Tones',
    points: [
      [0, 0.16],
      [0.25, 0.42],
      [0.5, 0.65],
      [0.75, 0.85],
      [1, 1],
    ],
  },
  {
    name: 'CONTRAST',
    title: 'High Contrast Punch',
    points: [
      [0, 0],
      [0.2, 0.04],
      [0.5, 0.5],
      [0.8, 0.96],
      [1, 1],
    ],
  },
  {
    name: 'INVERT',
    title: 'Invert Curve Spline',
    points: [
      [0, 1],
      [0.25, 0.75],
      [0.5, 0.5],
      [0.75, 0.25],
      [1, 0],
    ],
  },
];

const ToneCurveGraph: React.FC<ToneCurveGraphProps> = ({ config, onChangeConfig }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activePointIdx, setActivePointIdx] = useState<number | null>(null);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ inVal: number; outVal: number } | null>(null);

  const rawPoints = config.curvePoints && config.curvePoints.length >= 2 ? config.curvePoints : DEFAULT_CURVE_POINTS;
  const sortedPoints = [...rawPoints].sort((a, b) => a[0] - b[0]);

  const samples = 96;
  const pathPoints: [number, number][] = [];

  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = evaluateMonotoneCubicSpline(sortedPoints, x);
    pathPoints.push([x * 100, 100 - y * 100]);
  }

  const pathD = pathPoints.reduce((acc, [px, py], idx) => {
    return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  const getSvgNormalizedCoords = (e: React.PointerEvent<SVGSVGElement | HTMLDivElement>) => {
    if (!svgRef.current) return { normX: 0.5, normY: 0.5 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    return { normX, normY };
  };

  const handlePointPointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActivePointIdx(idx);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointIdx !== null) return;
    const { normX, normY } = getSvgNormalizedCoords(e);
    if (sortedPoints.length >= 12) return;

    const threshold = 0.04;
    for (let k = 0; k < sortedPoints.length; k++) {
      const dist = Math.hypot(sortedPoints[k][0] - normX, sortedPoints[k][1] - normY);
      if (dist < threshold) return;
    }

    const newPoints = [...sortedPoints, [normX, normY] as [number, number]].sort((a, b) => a[0] - b[0]);
    onChangeConfig({ ...config, curvePoints: newPoints });
    const insertedIdx = newPoints.findIndex((p) => Math.abs(p[0] - normX) < 0.001 && Math.abs(p[1] - normY) < 0.001);
    if (insertedIdx >= 0) {
      setActivePointIdx(insertedIdx);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { normX, normY } = getSvgNormalizedCoords(e);
    setCursorPos({
      inVal: Math.round(normX * 255),
      outVal: Math.round(normY * 255),
    });

    if (activePointIdx === null || activePointIdx < 0 || activePointIdx >= sortedPoints.length) return;

    const n = sortedPoints.length;
    let clampedX = normX;

    if (activePointIdx === 0) {
      clampedX = Math.max(0, Math.min(sortedPoints[1][0] - 0.01, normX));
    } else if (activePointIdx === n - 1) {
      clampedX = Math.max(sortedPoints[n - 2][0] + 0.01, Math.min(1, normX));
    } else {
      const minX = sortedPoints[activePointIdx - 1][0] + 0.01;
      const maxX = sortedPoints[activePointIdx + 1][0] - 0.01;
      clampedX = Math.max(minX, Math.min(maxX, normX));
    }

    const clampedY = Math.max(0, Math.min(1, normY));
    const newPoints = [...sortedPoints];
    newPoints[activePointIdx] = [Number(clampedX.toFixed(4)), Number(clampedY.toFixed(4))];

    onChangeConfig({ ...config, curvePoints: newPoints });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActivePointIdx(null);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handlePointDoubleClick = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (idx === 0 || idx === sortedPoints.length - 1) return;
    const newPoints = sortedPoints.filter((_, i) => i !== idx);
    onChangeConfig({ ...config, curvePoints: newPoints });
    setActivePointIdx(null);
  };

  const handleApplyPreset = (points: [number, number][]) => {
    onChangeConfig({
      ...config,
      curvePoints: points.map((p) => [...p] as [number, number]),
    });
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      curvePoints: [...DEFAULT_CURVE_POINTS],
    });
  };

  const activeOrHoveredPoint =
    activePointIdx !== null
      ? sortedPoints[activePointIdx]
      : hoveredPointIdx !== null
      ? sortedPoints[hoveredPointIdx]
      : null;

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="tonal-subheading">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Tonal Transfer Curve</span>
          {activeOrHoveredPoint && (
            <span style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 600 }}>
              IN: {Math.round(activeOrHoveredPoint[0] * 255)} • OUT: {Math.round(activeOrHoveredPoint[1] * 255)}
            </span>
          )}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            {sortedPoints.length} PTS
          </span>
          <button
            type="button"
            className="btn-reset"
            onClick={handleReset}
            title="Reset Tone Curve to Linear 1:1"
          >
            RESET
          </button>
        </div>
      </div>

      <div
        style={{
          padding: '10px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Quick Curve Presets Toolbar */}
        <div className="curve-preset-bar" style={{ marginTop: 0 }}>
          {CURVE_PRESETS.map((cp) => (
            <button
              key={cp.name}
              type="button"
              className="curve-preset-btn"
              onClick={() => handleApplyPreset(cp.points)}
              title={cp.title}
            >
              {cp.name}
            </button>
          ))}
        </div>

        {/* SQUARED 1:1 Aspect Ratio Graph */}
        <div
          style={{
            width: '100%',
            maxWidth: '260px',
            aspectRatio: '1 / 1',
            margin: '0 auto',
            position: 'relative',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '3px',
            overflow: 'hidden',
            cursor: activePointIdx !== null ? 'grabbing' : 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
          }}
          onDoubleClick={handleReset}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            style={{ width: '100%', height: '100%', display: 'block' }}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => {
              setCursorPos(null);
              setHoveredPointIdx(null);
              if (activePointIdx === null) setActivePointIdx(null);
            }}
          >
            <defs>
              <linearGradient id="interactiveSplineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines (25%, 50%, 75%) */}
            <line x1="25" y1="0" x2="25" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" strokeDasharray="2 2" />
            <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" strokeDasharray="2 2" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

            {/* 45-degree Neutral 1:1 Diagonal */}
            <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.24)" strokeWidth="0.75" strokeDasharray="3 3" />

            {/* Fill under Curve */}
            <path d={areaD} fill="url(#interactiveSplineGrad)" pointerEvents="none" />

            {/* Active Transfer Curve */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />

            {/* Interactive Editable Control Points (Draggable in both X and Y!) */}
            {sortedPoints.map((pt, idx) => {
              const svgX = pt[0] * 100;
              const svgY = 100 - pt[1] * 100;
              const isSelected = activePointIdx === idx || hoveredPointIdx === idx;
              const isEndpoint = idx === 0 || idx === sortedPoints.length - 1;

              return (
                <g
                  key={idx}
                  style={{ cursor: isSelected ? 'grabbing' : 'grab' }}
                  onPointerDown={(e) => handlePointPointerDown(idx, e)}
                  onDoubleClick={(e) => handlePointDoubleClick(idx, e)}
                  onPointerEnter={() => setHoveredPointIdx(idx)}
                  onPointerLeave={() => setHoveredPointIdx(null)}
                >
                  {/* Outer Glow Ring on Hover/Active */}
                  {isSelected && (
                    <circle
                      cx={svgX}
                      cy={svgY}
                      r="7"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1.2"
                      strokeOpacity="0.7"
                    />
                  )}

                  {/* Main Point Handle */}
                  <circle
                    cx={svgX}
                    cy={svgY}
                    r={isEndpoint ? 4.2 : 3.8}
                    fill={isEndpoint ? (idx === 0 ? '#000000' : '#ffffff') : 'var(--accent)'}
                    stroke={isEndpoint ? 'var(--accent)' : '#ffffff'}
                    strokeWidth={1.5}
                  />

                  {/* Hit target extension for easy grabbing */}
                  <circle cx={svgX} cy={svgY} r="10" fill="transparent" />
                </g>
              );
            })}

            {/* Hover Crosshair / Cursor position */}
            {cursorPos && (
              <circle
                cx={(cursorPos.inVal / 255) * 100}
                cy={100 - evaluateMonotoneCubicSpline(sortedPoints, cursorPos.inVal / 255) * 100}
                r="2.2"
                fill="none"
                stroke="var(--text-primary)"
                strokeWidth="0.8"
                strokeDasharray="1 1"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>

        {/* Axis Reference Scale */}
        <div
          style={{
            width: '100%',
            maxWidth: '260px',
            margin: '4px auto 0',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>IN: 0</span>
          <span>128</span>
          <span>255</span>
        </div>
      </div>
    </div>
  );
};

/* ========================================================================
   LEVELS

   Drives ToneMappingConfig.levelsBlack / levelsMidtones / levelsWhite, which
   the engine has always applied (rasterEngine step 3) but which nothing could
   reach until now.

   Placed *after* the tone curve because that is the pipeline order: the curve
   runs first and levels reads its output. The histogram shown is sampled at
   exactly that point, so the bars under the handles are the tone the handles
   actually operate on.
   ======================================================================== */

interface LevelsControlProps {
  config: ToneMappingConfig;
  onChangeConfig: (next: ToneMappingConfig) => void;
  histogram: Uint32Array | null;
  histogramOpaque: number;
}

const LV_W = 256;
const LV_HIST_H = 56;
const LV_TRACK_Y = 60;
const LV_TRACK_H = 12;

type LevelsHandle = 'black' | 'mid' | 'white';

export const LevelsControl: React.FC<LevelsControlProps> = ({
  config,
  onChangeConfig,
  histogram,
  histogramOpaque,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<LevelsHandle | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

  const black = config.levelsBlack ?? 0;
  const mid = config.levelsMidtones ?? 50;
  const white = config.levelsWhite ?? 100;

  const midNorm = white > black ? (mid - black) / (white - black) : 0.5;
  const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const isNeutral =
    (config.levelsBlack ?? 0) === 0 &&
    (config.levelsWhite ?? 100) === 100 &&
    Math.abs((config.levelsMidtones ?? 50) - 50) < 0.01;

  const commit = (nextBlack: number, nextWhite: number, keepGamma = true) => {
    const b = Math.max(0, Math.min(95, nextBlack));
    const w = Math.max(b + 5, Math.min(100, nextWhite));
    const m = keepGamma
      ? b + midNorm * (w - b)
      : Math.max(b + 1, Math.min(w - 1, mid));
    onChangeConfig({
      ...config,
      levelsBlack: Number(b.toFixed(2)),
      levelsWhite: Number(w.toFixed(2)),
      levelsMidtones: Number(Math.max(b + 1, Math.min(w - 1, m)).toFixed(2)),
    });
  };

  const posToPercent = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(rect.right, e.clientX));
    return ((x - rect.left) / rect.width) * 100;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = posToPercent(e);
    const d = {
      black: Math.abs(p - black),
      white: Math.abs(p - white),
      mid: Math.abs(p - mid) + 0.001,
    };
    const pick = (Object.keys(d) as LevelsHandle[]).reduce((a, b) => (d[b] < d[a] ? b : a));
    setActive(pick);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    const p = posToPercent(e);
    if (active === 'black') {
      commit(Math.min(p, white - 5), white);
    } else if (active === 'white') {
      commit(black, Math.max(p, black + 5));
    } else {
      onChangeConfig({
        ...config,
        levelsMidtones: Number(Math.max(black + 1, Math.min(white - 1, p)).toFixed(2)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setActive(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const flashNote = (msg: string) => {
    setNote(msg);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 1800);
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      levelsBlack: 0,
      levelsMidtones: 50,
      levelsWhite: 100,
    });
    flashNote('RESET');
  };

  const handleAuto = () => {
    if (!histogram || histogramOpaque <= 0) {
      flashNote('NO HISTOGRAM');
      return;
    }
    const res = computeAutoLevels(histogram, histogramOpaque);
    if (!res) {
      flashNote('NO SIGNAL');
      return;
    }
    const b = Math.max(0, Math.min(95, res.black));
    const w = Math.max(b + 5, Math.min(100, res.white));
    const m = b + midNorm * (w - b);
    onChangeConfig({
      ...config,
      levelsBlack: Number(b.toFixed(2)),
      levelsWhite: Number(w.toFixed(2)),
      levelsMidtones: Number(Math.max(b + 1, Math.min(w - 1, m)).toFixed(2)),
    });
    flashNote(`AUTO: ${b.toFixed(0)} / ${w.toFixed(0)}`);
  };

  const bars = useMemo(() => {
    if (!histogram || histogramOpaque <= 0) return null;
    let peak = 0;
    for (let i = 0; i < 256; i++) if (histogram[i] > peak) peak = histogram[i];
    if (peak <= 0) return null;
    const scale = Math.sqrt(peak);
    const out: number[] = new Array(256);
    for (let i = 0; i < 256; i++) {
      out[i] = (Math.sqrt(histogram[i]) / scale) * LV_HIST_H;
    }
    return out;
  }, [histogram, histogramOpaque]);

  const px = (pct: number) => (pct / 100) * LV_W;

  const handleMark = (pct: number, fill: string, stroke: string, id: LevelsHandle) => (
    <g
      key={id}
      transform={`translate(${px(pct).toFixed(2)}, 0)`}
      style={{ cursor: 'ew-resize' }}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={LV_TRACK_Y + LV_TRACK_H}
        stroke={stroke}
        strokeWidth={active === id ? 1.6 : 0.8}
        opacity={active === id ? 0.9 : 0.5}
      />
      <path
        d={`M 0 ${LV_TRACK_Y} L -5 ${LV_TRACK_Y + LV_TRACK_H} L 5 ${LV_TRACK_Y + LV_TRACK_H} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.8}
      />
    </g>
  );

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="tonal-subheading">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Levels &amp; Histogram</span>
          {!isNeutral && (
            <span
              style={{
                color: 'var(--accent)',
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 4px',
                background: 'var(--accent-glow)',
                border: '1px solid var(--accent)',
                borderRadius: '2px',
              }}
            >
              ACTIVE
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn-reset"
          onClick={handleReset}
          title="Reset black, midtone and white points to 0 / 50 / 100"
        >
          RESET
        </button>
      </div>

      <div
        style={{
          padding: '10px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Histogram Box */}
        <div
          style={{
            width: '100%',
            maxWidth: '260px',
            margin: '0 auto',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${LV_W} ${LV_TRACK_Y + LV_TRACK_H + 2}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: '84px', touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Everything outside [black, white] is clipped flat by the engine. */}
            <rect x={0} y={0} width={px(black)} height={LV_HIST_H} fill="rgba(0,0,0,0.55)" />
            <rect
              x={px(white)}
              y={0}
              width={LV_W - px(white)}
              height={LV_HIST_H}
              fill="rgba(255,255,255,0.07)"
            />

            {bars ? (
              <g fill="var(--accent)" opacity={0.75}>
                {bars.map((h, i) =>
                  h > 0 ? (
                    <rect key={i} x={i} y={LV_HIST_H - h} width={1} height={h} />
                  ) : null
                )}
              </g>
            ) : (
              <text
                x={LV_W / 2}
                y={LV_HIST_H / 2 + 3}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-dim)"
                fontFamily="var(--font-mono)"
              >
                NO FRAME SAMPLED
              </text>
            )}

            {/* Gradient track along the bottom */}
            <defs>
              <linearGradient id="levels-ramp" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#000000" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
            </defs>
            <rect x={0} y={LV_TRACK_Y - 3} width={LV_W} height={2} fill="url(#levels-ramp)" />

            {handleMark(black, '#000000', 'var(--text-muted)', 'black')}
            {handleMark(mid, '#808080', 'var(--text-muted)', 'mid')}
            {handleMark(white, '#ffffff', 'var(--text-muted)', 'white')}
          </svg>
        </div>

        {/* Telemetry & Auto Levels */}
        <div
          style={{
            maxWidth: '260px',
            margin: '6px auto 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
          >
            {note ? (
              <span style={{ color: 'var(--accent)' }}>{note}</span>
            ) : (
              <>
                BLACK {black.toFixed(0)} &bull; MID {mid.toFixed(0)} &bull; WHITE {white.toFixed(0)}
                {' '}&bull; &gamma; {gamma.toFixed(2)}
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '1px 8px', fontSize: '10px', height: '20px', whiteSpace: 'nowrap' }}
            onClick={handleAuto}
            title="Set the black and white points from the image's own histogram, clipping 0.1% at each end"
          >
            <BarChart3 size={10} style={{ marginRight: '3px' }} />
            AUTO LEVELS
          </button>
        </div>
      </div>
    </div>
  );
};

interface ImageAdjustControlsProps {
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  paletteSlot?: React.ReactNode;
  showAlphaCutoff?: boolean;
  showInvert?: boolean;
  onResetPalette?: () => void;
  resetDefaults?: ImageAdjustConfig;
  persistKeyPrefix?: string;
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (next: ToneMappingConfig) => void;
  histogram?: Uint32Array | null;
  histogramOpaque?: number;
  mediaColorConfig?: MediaColorConfig;
}

export const ImageAdjustControls: React.FC<ImageAdjustControlsProps> = ({
  config,
  onChangeConfig,
  paletteSlot,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  showAlphaCutoff = true,
  showInvert = false,
  onResetPalette,
  persistKeyPrefix = 'MediaViewControls',
  toneConfig,
  onChangeToneConfig,
  histogram = null,
  histogramOpaque = 0,
  mediaColorConfig,
}) => {
  const update = <K extends keyof ImageAdjustConfig>(key: K, val: ImageAdjustConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const colorBadge = useMemo(() => {
    if (mediaColorConfig?.paletteMode === 'content') {
      return 'RGB (CONTENT)';
    }
    if (mediaColorConfig?.paletteMode === 'indexed') {
      const pal = BUILTIN_PALETTES.find((p) => p.id === mediaColorConfig.activePaletteId);
      return pal ? pal.name : 'PRESET PALETTE';
    }
    if (config.tonalMapping && config.tonalMapping !== '1color') {
      const count = config.customToneColors?.length || 3;
      return `${count}-TONE RAMP`;
    }
    return '1-COLOR';
  }, [mediaColorConfig?.paletteMode, mediaColorConfig?.activePaletteId, config.tonalMapping, config.customToneColors]);

  const quantBadge = useMemo(() => {
    if (!config.colorLevels || config.colorLevels <= 0) {
      return 'AUTO';
    }
    if (config.colorLevels === 2) {
      return '1-BIT (2 LVS)';
    }
    return `${config.colorLevels} LEVELS`;
  }, [config.colorLevels]);

  const resetEffects = () => {
    onChangeConfig({
      ...config,
      sharpenStrength: resetDefaults.sharpenStrength,
      sharpenRadius: resetDefaults.sharpenRadius,
      noise: resetDefaults.noise,
      denoise: resetDefaults.denoise,
      blur: resetDefaults.blur,
      brightness: resetDefaults.brightness,
      contrast: resetDefaults.contrast,
      ...(showInvert ? { invert: resetDefaults.invert } : {}),
    });
  };

  const resetTonal = () => {
    onChangeConfig({
      ...config,
      curvePoints: DEFAULT_CURVE_POINTS.map((pt) => [...pt] as [number, number]),
      highlights: resetDefaults.highlights,
      midtones: resetDefaults.midtones,
      shadows: resetDefaults.shadows,
      alphaThreshold: resetDefaults.alphaThreshold,
      colorLevels: resetDefaults.colorLevels ?? 0,
    });
    if (toneConfig && onChangeToneConfig) {
      onChangeToneConfig({ ...toneConfig, levelsBlack: 0, levelsMidtones: 50, levelsWhite: 100 });
    }
  };

  const resetColors = () => {
    onChangeConfig({
      ...config,
      tonalMapping: resetDefaults.tonalMapping,
      highlightColor: resetDefaults.highlightColor,
      midtoneColor: resetDefaults.midtoneColor,
      shadowColor: resetDefaults.shadowColor,
      customToneColors: resetDefaults.customToneColors ? [...resetDefaults.customToneColors] : ['#0a0a0a', '#00a848', '#00ff66'],
    });
    onResetPalette?.();
  };

  return (
    <>
      {/* COLORS */}
      <CollapsibleSection
        title="COLORS"
        icon={<Palette size={12} />}
        badge={colorBadge}
        persistKey={`${persistKeyPrefix}-colors`}
        onReset={resetColors}
        resetTitle="Reset color mode and the tone ramp stops"
      >
        {paletteSlot}

        <ToneRampGroup
          config={config}
          onChangeConfig={onChangeConfig}
          resetDefaults={resetDefaults}
          paletteActive={mediaColorConfig?.paletteMode === 'indexed'}
        />
      </CollapsibleSection>

      {/* TONAL CONTROLS */}
      <CollapsibleSection
        title="TONAL CONTROLS"
        icon={<Sparkles size={12} />}
        badge={quantBadge}
        persistKey={`${persistKeyPrefix}-tonal-controls`}
        onReset={resetTonal}
        resetTitle="Reset curve, levels, quantize depth, highlights, midtones and shadows"
      >
        {/* Quantize depth */}
        <QuantizeLevelsControl
          value={config.colorLevels}
          onChange={(val) => update('colorLevels', val)}
        />

        {/* Real-time Interactive Tonal Transfer Curve Graph */}
        <ToneCurveGraph config={config} onChangeConfig={onChangeConfig} />

        {/* Levels & Auto Range */}
        {toneConfig && onChangeToneConfig && (
          <LevelsControl
            config={toneConfig}
            onChangeConfig={onChangeToneConfig}
            histogram={histogram}
            histogramOpaque={histogramOpaque}
          />
        )}

        {/* Tonal Balance: Highlights, Midtones, Shadows */}
        <TonalBalanceGroup
          config={config}
          onChangeConfig={onChangeConfig}
          resetDefaults={resetDefaults}
        />

        {/* Alpha Threshold */}
        {showAlphaCutoff && (
          <div style={{ marginTop: '20px' }}>
            <div className="tonal-subheading">
              <span>Alpha Cutoff</span>
              <button
                type="button"
                className="btn-reset"
                onClick={() => update('alphaThreshold', DEFAULT_IMAGE_ADJUST_CONFIG.alphaThreshold)}
                title="Reset alpha cutoff threshold"
              >
                RESET
              </button>
            </div>
            <div className="control-row">
              <span className="control-label">Threshold</span>
              <PrecisionSlider
                value={config.alphaThreshold}
                sliderMin={0}
                sliderMax={255}
                step={5}
                resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.alphaThreshold}
                onChange={(val) => update('alphaThreshold', val)}
              />
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* EFFECT CONTROLS */}
      <CollapsibleSection
        title="EFFECT CONTROLS"
        icon={<Sliders size={12} />}
        persistKey={`${persistKeyPrefix}-effect-controls`}
        defaultOpen={false}
        onReset={resetEffects}
        resetTitle="Reset invert, sharpen, blur, noise, denoise, brightness and contrast"
      >
        {showInvert && (
          <div className="control-row">
            <span className="control-label">Invert Luminance</span>
            <button
              className={`btn btn-sm ${config.invert ? 'btn-primary' : ''}`}
              onClick={() => update('invert', !config.invert)}
              title="Swap highlights and shadows"
            >
              {config.invert ? 'INVERTED [ON]' : 'NORMAL [OFF]'}
            </button>
          </div>
        )}

        {/* SHARPENING */}
        <div className="tonal-subheading">
          <span>Sharpening &amp; Edge Definition</span>
        </div>

        <AdjustSlider id="sharpenStrength" config={config} onChangeConfig={onChangeConfig} />
        <AdjustSlider id="sharpenRadius" config={config} onChangeConfig={onChangeConfig} />

        {/* TEXTURE & GRAIN */}
        <div className="tonal-subheading">
          <span>Texture &amp; Noise</span>
        </div>

        <AdjustSlider id="noise" config={config} onChangeConfig={onChangeConfig} />
        <AdjustSlider id="denoise" config={config} onChangeConfig={onChangeConfig} />

        {/* OPTICAL FILTERS */}
        <div className="tonal-subheading">
          <span>Optical Filters</span>
        </div>

        <AdjustSlider id="blur" config={config} onChangeConfig={onChangeConfig} />

        {/* EXPOSURE & CONTRAST */}
        <div className="tonal-subheading">
          <span>Exposure &amp; Contrast</span>
        </div>

        <AdjustSlider id="brightness" config={config} onChangeConfig={onChangeConfig} />
        <AdjustSlider id="contrast" config={config} onChangeConfig={onChangeConfig} />
      </CollapsibleSection>
    </>
  );
};
