import React, { useState, useRef, useMemo } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { NumberInput, PrecisionSlider, ToggleSwitch } from './controlPrimitives';
import {
  ImageAdjustConfig,
  ToneMappingConfig,
  MediaColorConfig,
  AppMode,
  DEFAULT_IMAGE_ADJUST_CONFIG,
} from '../types/ascii';
import { BUILTIN_PALETTES } from '../engine/palettes';
import { evaluateMonotoneCubicSpline } from '../engine/mediaRenderer';
import { computeAutoLevels } from '../engine/autoLevels';
import { NToneRampEditor, NEUTRAL_STOP_WEIGHT } from './NToneRampEditor';
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
  /** One line of help on the label. Optional; most of these name themselves. */
  hint?: string;
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
    hint:
      'Edge-preserving noise removal. Reads as a contrast threshold: at 4 anything under about 6% local contrast is treated as grain and flattened, and every edge above it is left alone. Unlike Blur, which takes edges and grain equally.',
    sliderMin: 0,
    sliderMax: 8,
    hardMax: 100,
    step: 0.1,
    resetTo: DEFAULT_IMAGE_ADJUST_CONFIG.denoise ?? 0,
  },
  blur: {
    label: 'Blur',
    hint:
      'Plain box softening, applied after Denoise. Takes edges with it by design — reach for Denoise instead to clean grain up without losing the picture.',
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
      <span className="control-label" title={spec.hint}>
        {label ?? spec.label}
      </span>
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
    <div className="control-row-spaced">
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
        <div className="panel-note">
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
 * palette is actually rendering. It has to win: both default configs seed
 * `customToneColors` with three greens, so checking it first meant a selected
 * palette was always shadowed by those greens and the bands never changed when
 * you picked one.
 *
 * Mirrors `resolveRampStops` in rasterEngine — the engine's copy is what
 * actually renders, this one is what the editor draws. Keep the fallbacks in
 * step; they last diverged into a render that quantized and coloured to
 * different tone counts.
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

/** The three canvas backdrops the media renderer understands. */
const BACKGROUND_MODES: { id: BackgroundMode; label: string; title: string }[] = [
  { id: 'black', label: 'BLACK', title: 'Solid black backdrop' },
  { id: 'white', label: 'WHITE', title: 'Solid white backdrop — inverts the paper' },
  { id: 'transparent', label: 'NONE', title: 'Transparent — exports with an alpha channel' },
];

/**
 * Backdrop selector.
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

// ---------------------------------------------------------------------------
// High-Accuracy Quantize Levels Control
// ---------------------------------------------------------------------------
interface QuantizeLevelsControlProps {
  value?: number; // 0 (auto) or 2..256
  onChange: (val: number) => void;
}

const QUANTIZE_PRESETS: { label: string; value: number; title: string }[] = [
  { label: '2', value: 2, title: '2 Levels — 1-bit Monochrome' },
  { label: '4', value: 4, title: '4 Levels — 2-bit (Game Boy / CGA)' },
  { label: '8', value: 8, title: '8 Levels — 3-bit Color' },
  { label: '16', value: 16, title: '16 Levels — 4-bit (C64 / PICO-8)' },
  { label: '32', value: 32, title: '32 Levels — 5-bit Depth' },
  { label: '64', value: 64, title: '64 Levels — 6-bit Posterization' },
  { label: '128', value: 128, title: '128 Levels — 7-bit Semi-continuous' },
  { label: 'MAX', value: 256, title: 'Max (256 Levels — Continuous Tone)' },
];

export const QuantizeLevelsControl: React.FC<QuantizeLevelsControlProps> = ({
  value = 0,
  onChange,
}) => {
  const normalizedVal = !value || value <= 0 || value >= 256 ? 256 : value;
  const isMax = !value || value <= 0 || value >= 256;

  // Logarithmic slider warp mapping:
  // pos 0..100 -> exponential 2^1..2^8 (2 to 256)
  const sliderPos = useMemo(() => {
    const clamped = Math.max(2, Math.min(256, normalizedVal));
    const exp = Math.log2(clamped); // 1 to 8
    const t = (exp - 1) / 7; // 0 to 1
    return Math.round(t * 100);
  }, [normalizedVal]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseInt(e.target.value, 10);
    const t = pos / 100; // 0 to 1
    const exp = 1 + t * 7; // 1 to 8
    const rawVal = Math.round(Math.pow(2, exp));
    const nextVal = Math.max(2, Math.min(256, rawVal));
    onChange(nextVal >= 256 ? 0 : nextVal);
  };

  const handleStep = (delta: number) => {
    const next = normalizedVal + delta;
    if (next < 2) {
      onChange(2);
    } else if (next >= 256) {
      onChange(0);
    } else {
      onChange(next);
    }
  };

  return (
    <div className="quantize-controls-section">
      <div className="tonal-subheading tonal-subheading-flush">
        <span>Quantize Depth</span>
        {!isMax && (
          <button
            type="button"
            className="btn-reset"
            onClick={() => onChange(0)}
            title="Reset Quantization Depth to Max"
          >
            RESET
          </button>
        )}
      </div>

      {/* Quick Bit-Depth Preset Chips */}
      <div className="quantize-chip-row quantize-chip-row-inset">
        {QUANTIZE_PRESETS.map((p) => {
          const isSelected = p.value === 256 ? isMax : normalizedVal === p.value;
          return (
            <button
              key={p.value}
              type="button"
              className={`quantize-chip ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(p.value === 256 ? 0 : p.value)}
              title={p.title}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Stepper + Warp Slider + Numeric Direct Entry */}
      <div className="control-inline">
        <button
          type="button"
          className="slider-nudge-btn"
          disabled={normalizedVal <= 2}
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
          title={`Quantize level: ${isMax ? 'Max (256)' : normalizedVal}`}
        />

        <button
          type="button"
          className="slider-nudge-btn"
          disabled={isMax}
          onClick={() => handleStep(1)}
          title="Increase levels by 1"
        >
          <Plus size={10} />
        </button>

        <NumberInput
          value={normalizedVal}
          min={2}
          max={256}
          step={1}
          onChange={(val) => onChange(val >= 256 ? 0 : Math.max(2, val))}
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
    <div className="curve-section">
      <div className="tonal-subheading">
        <span className="control-inline">
          <span>Tonal Transfer Curve</span>
          {activeOrHoveredPoint && (
            <span className="curve-readout">
              IN: {Math.round(activeOrHoveredPoint[0] * 255)} • OUT: {Math.round(activeOrHoveredPoint[1] * 255)}
            </span>
          )}
        </span>

        <div className="control-inline">
          <span className="curve-point-count">{sortedPoints.length} PTS</span>
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
        className="framed-block"
      >
        {/* Quick Curve Presets Toolbar */}
        <div className="curve-preset-bar">
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
          className={`curve-graph${activePointIdx !== null ? ' is-dragging' : ''}`}
          onDoubleClick={handleReset}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
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
          className="curve-axis-scale"
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

// ---------------------------------------------------------------------------
// Simple 3-Handle Levels Slider (for Basic Mode — without histogram / auto)
// ---------------------------------------------------------------------------
interface SimpleLevelsSliderProps {
  config: ToneMappingConfig;
  onChangeConfig: (next: ToneMappingConfig) => void;
}

export const SimpleLevelsSlider: React.FC<SimpleLevelsSliderProps> = ({
  config,
  onChangeConfig,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<LevelsHandle | null>(null);

  const black = config.levelsBlack ?? 0;
  const mid = config.levelsMidtones ?? 128;
  const white = config.levelsWhite ?? 255;

  const midNorm = white > black ? (mid - black) / (white - black) : 0.5;

  const commit = (nextBlack: number, nextWhite: number, keepGamma = true) => {
    const b = Math.max(0, Math.min(245, Math.round(nextBlack)));
    const w = Math.max(b + 10, Math.min(255, Math.round(nextWhite)));
    const m = keepGamma
      ? Math.round(b + midNorm * (w - b))
      : Math.max(b + 1, Math.min(w - 1, Math.round(mid)));
    onChangeConfig({
      ...config,
      levelsBlack: b,
      levelsWhite: w,
      levelsMidtones: Math.max(b + 1, Math.min(w - 1, m)),
    });
  };

  const posToValue = (e: { clientX: number }) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(rect.right, e.clientX));
    return ((x - rect.left) / rect.width) * 255;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = posToValue(e);
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
    const p = posToValue(e);
    if (active === 'black') {
      commit(Math.min(p, white - 10), white);
    } else if (active === 'white') {
      commit(black, Math.max(p, black + 10));
    } else {
      onChangeConfig({
        ...config,
        levelsMidtones: Math.max(black + 1, Math.min(white - 1, Math.round(p))),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setActive(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const resetHandle = (id: LevelsHandle) => {
    if (id === 'black') {
      commit(0, white);
    } else if (id === 'white') {
      commit(black, 255);
    } else {
      const neutralMid = Math.round((black + white) / 2);
      onChangeConfig({
        ...config,
        levelsMidtones: neutralMid,
      });
    }
  };

  const handleSvgDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = posToValue(e);
    const d = {
      black: Math.abs(p - black),
      white: Math.abs(p - white),
      mid: Math.abs(p - mid) + 0.001,
    };
    const pick = (Object.keys(d) as LevelsHandle[]).reduce((a, b) => (d[b] < d[a] ? b : a));
    resetHandle(pick);
  };

  const px = (val: number) => (val / 255) * LV_W;

  const handleMark = (val: number, fill: string, stroke: string, id: LevelsHandle) => {
    const isActive = active === id;
    return (
      <g
        key={id}
        transform={`translate(${px(val).toFixed(2)}, 0)`}
        className="levels-handle"
        onDoubleClick={(e) => {
          e.stopPropagation();
          resetHandle(id);
        }}
      >
        <line
          x1={0}
          y1={6}
          x2={0}
          y2={22}
          stroke={stroke}
          strokeWidth={isActive ? 1.5 : 1}
          opacity={isActive ? 1 : 0.6}
        />
        <path
          d="M 0 17 L -5 25 L 5 25 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={1}
          filter={isActive ? 'drop-shadow(0 0 3px var(--accent))' : undefined}
        />
      </g>
    );
  };

  return (
    <div className="simple-levels-section control-row-spaced-below">
      <div className="tonal-subheading tonal-subheading-flush">
        <span>Levels</span>
      </div>

      <div
        className="framed-block framed-block-tight"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LV_W} 28`}
          preserveAspectRatio="none"
          className="levels-scrubber"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleSvgDoubleClick}
        >
          <defs>
            <linearGradient id="simple-lv-ramp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000000" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          {/* Base gradient bar */}
          <rect
            x={0}
            y={6}
            width={LV_W}
            height={10}
            fill="url(#simple-lv-ramp)"
            rx={2}
            stroke="var(--border-color)"
            strokeWidth={1}
          />

          {/* Black clip shadow */}
          <rect
            x={0}
            y={6}
            width={px(black)}
            height={10}
            fill="rgba(0, 0, 0, 0.65)"
            rx={2}
          />

          {/* White clip highlight */}
          <rect
            x={px(white)}
            y={6}
            width={LV_W - px(white)}
            height={10}
            fill="rgba(255, 255, 255, 0.2)"
            rx={2}
          />

          {handleMark(black, '#000000', 'var(--text-muted)', 'black')}
          {handleMark(mid, '#808080', 'var(--text-muted)', 'mid')}
          {handleMark(white, '#ffffff', 'var(--text-muted)', 'white')}
        </svg>

        <div
          className="levels-readout"
        >
          <div className="levels-readout-cell">
            <span className="levels-readout-label">BLACK</span>
            <NumberInput
              value={black}
              min={0}
              max={white - 10}
              step={1}
              onChange={(val) => commit(val, white)}
            />
          </div>

          <div className="levels-readout-cell">
            <span className="levels-readout-label">MID</span>
            <NumberInput
              value={mid}
              min={black + 1}
              max={white - 1}
              step={1}
              onChange={(val) =>
                onChangeConfig({
                  ...config,
                  levelsMidtones: Math.max(black + 1, Math.min(white - 1, val)),
                })
              }
            />
          </div>

          <div className="levels-readout-cell">
            <span className="levels-readout-label">WHITE</span>
            <NumberInput
              value={white}
              min={black + 10}
              max={255}
              step={1}
              onChange={(val) => commit(black, val)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const mid = config.levelsMidtones ?? 128;
  const white = config.levelsWhite ?? 255;

  const midNorm = white > black ? (mid - black) / (white - black) : 0.5;
  const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const isNeutral =
    (config.levelsBlack ?? 0) === 0 &&
    (config.levelsWhite ?? 255) === 255 &&
    Math.abs((config.levelsMidtones ?? 128) - 128) <= 1;

  const commit = (nextBlack: number, nextWhite: number, keepGamma = true) => {
    const b = Math.max(0, Math.min(245, Math.round(nextBlack)));
    const w = Math.max(b + 10, Math.min(255, Math.round(nextWhite)));
    const m = keepGamma
      ? Math.round(b + midNorm * (w - b))
      : Math.max(b + 1, Math.min(w - 1, Math.round(mid)));
    onChangeConfig({
      ...config,
      levelsBlack: b,
      levelsWhite: w,
      levelsMidtones: Math.max(b + 1, Math.min(w - 1, m)),
    });
  };

  const posToValue = (e: { clientX: number }) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(rect.right, e.clientX));
    return ((x - rect.left) / rect.width) * 255;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = posToValue(e);
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
    const p = posToValue(e);
    if (active === 'black') {
      commit(Math.min(p, white - 10), white);
    } else if (active === 'white') {
      commit(black, Math.max(p, black + 10));
    } else {
      onChangeConfig({
        ...config,
        levelsMidtones: Math.max(black + 1, Math.min(white - 1, Math.round(p))),
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

  const resetHandle = (id: LevelsHandle) => {
    if (id === 'black') {
      commit(0, white);
      flashNote('RESET BLACK (0)');
    } else if (id === 'white') {
      commit(black, 255);
      flashNote('RESET WHITE (255)');
    } else {
      const neutralMid = Math.round((black + white) / 2);
      onChangeConfig({
        ...config,
        levelsMidtones: neutralMid,
      });
      flashNote(`RESET MID (${neutralMid})`);
    }
  };

  const handleSvgDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = posToValue(e);
    const d = {
      black: Math.abs(p - black),
      white: Math.abs(p - white),
      mid: Math.abs(p - mid) + 0.001,
    };
    const pick = (Object.keys(d) as LevelsHandle[]).reduce((a, b) => (d[b] < d[a] ? b : a));
    resetHandle(pick);
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      levelsBlack: 0,
      levelsMidtones: 128,
      levelsWhite: 255,
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
    const b = Math.max(0, Math.min(245, res.black));
    const w = Math.max(b + 10, Math.min(255, res.white));
    const m = Math.round(b + midNorm * (w - b));
    onChangeConfig({
      ...config,
      levelsBlack: b,
      levelsWhite: w,
      levelsMidtones: Math.max(b + 1, Math.min(w - 1, m)),
    });
    flashNote(`AUTO: ${b} / ${w}`);
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

  const px = (val: number) => (val / 255) * LV_W;

  const handleMark = (val: number, fill: string, stroke: string, id: LevelsHandle) => (
    <g
      key={id}
      transform={`translate(${px(val).toFixed(2)}, 0)`}
      className="levels-handle"
      onDoubleClick={(e) => {
        e.stopPropagation();
        resetHandle(id);
      }}
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
    <div className="panel-group">
      <div className="tonal-subheading">
        <span className="control-inline">
          <span>Levels &amp; Histogram</span>
          {!isNeutral && <span className="badge-filled">ACTIVE</span>}
        </span>
        <button
          type="button"
          className="btn-reset"
          onClick={handleReset}
          title="Reset black, midtone and white points to 0 / 128 / 255"
        >
          RESET
        </button>
      </div>

      <div
        className="framed-block"
      >
        {/* Histogram Box */}
        <div className="histogram-frame">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${LV_W} ${LV_TRACK_Y + LV_TRACK_H + 2}`}
            preserveAspectRatio="none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleSvgDoubleClick}
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
          className="histogram-telemetry"
        >
          <span className="histogram-readout">
            {note ? (
              <span className="histogram-note">{note}</span>
            ) : (
              <>
                BLACK {black.toFixed(0)} &bull; MID {mid.toFixed(0)} &bull; WHITE {white.toFixed(0)}
                {' '}&bull; &gamma; {gamma.toFixed(2)}
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-auto-levels"
            onClick={handleAuto}
            title="Set the black and white points from the image's own histogram, clipping 0.1% at each end"
          >
            <BarChart3 size={10} />
            AUTO LEVELS
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ColorAdjustControlsProps {
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  paletteSlot?: React.ReactNode;
  backgroundSlot?: React.ReactNode;
  resetDefaults?: ImageAdjustConfig;
  onResetPalette?: () => void;
  persistKeyPrefix?: string;
  mediaColorConfig?: MediaColorConfig;
  appMode?: AppMode;
  isVectorMode?: boolean;
  isPrintMode?: boolean;
  printBadge?: string;
}

export const ColorAdjustControls: React.FC<ColorAdjustControlsProps> = ({
  config,
  onChangeConfig,
  paletteSlot,
  backgroundSlot,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  onResetPalette,
  persistKeyPrefix = 'MediaViewControls',
  mediaColorConfig,
  appMode = 'media',
  isVectorMode = false,
  isPrintMode = false,
  printBadge,
}) => {
  const colorBadge = useMemo(() => {
    if (isPrintMode) {
      return printBadge || 'INK STACK';
    }
    const isRgbDisabled = appMode === 'synth' || isVectorMode;
    const effectivePaletteMode =
      mediaColorConfig?.paletteMode === 'content' && isRgbDisabled
        ? 'phosphor'
        : mediaColorConfig?.paletteMode || 'phosphor';

    if (effectivePaletteMode === 'content') {
      return 'RGB (CONTENT)';
    }
    if (effectivePaletteMode === 'indexed') {
      const pal = BUILTIN_PALETTES.find((p) => p.id === mediaColorConfig?.activePaletteId);
      return pal ? pal.name : 'PRESET PALETTE';
    }
    if (config.tonalMapping && config.tonalMapping !== '1color') {
      const count = config.customToneColors?.length || 3;
      return `${count}-TONE RAMP`;
    }
    return '1-COLOR';
  }, [
    isPrintMode,
    printBadge,
    mediaColorConfig?.paletteMode,
    mediaColorConfig?.activePaletteId,
    config.tonalMapping,
    config.customToneColors,
    appMode,
    isVectorMode,
  ]);

  const resetColors = () => {
    onChangeConfig({
      ...config,
      tonalMapping: resetDefaults.tonalMapping,
      highlightColor: resetDefaults.highlightColor,
      midtoneColor: resetDefaults.midtoneColor,
      shadowColor: resetDefaults.shadowColor,
      customToneColors: resetDefaults.customToneColors ? [...resetDefaults.customToneColors] : ['#0a0a0a', '#00a848', '#00ff66'],
      colorLevels: resetDefaults.colorLevels ?? 0,
    });
    onResetPalette?.();
  };

  return (
    <CollapsibleSection
      title="COLORS"
      icon={<Palette size={12} />}
      badge={colorBadge}
      persistKey={`${persistKeyPrefix}-colors`}
      onReset={resetColors}
      resetTitle="Reset color mode, palette and quantization depth"
    >
      {paletteSlot}
      {backgroundSlot}
    </CollapsibleSection>
  );
};

export interface TonalAdjustControlsProps {
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  resetDefaults?: ImageAdjustConfig;
  showAlphaCutoff?: boolean;
  showInvert?: boolean;
  persistKeyPrefix?: string;
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (next: ToneMappingConfig) => void;
  histogram?: Uint32Array | null;
  histogramOpaque?: number;
}

export const TonalAdjustControls: React.FC<TonalAdjustControlsProps> = ({
  config,
  onChangeConfig,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  showAlphaCutoff = true,
  showInvert = false,
  persistKeyPrefix = 'MediaViewControls',
  toneConfig,
  onChangeToneConfig,
  histogram = null,
  histogramOpaque = 0,
}) => {
  const update = <K extends keyof ImageAdjustConfig>(key: K, val: ImageAdjustConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const resetTonal = () => {
    onChangeConfig({
      ...config,
      curvePoints: DEFAULT_CURVE_POINTS.map((pt) => [...pt] as [number, number]),
      brightness: resetDefaults.brightness,
      contrast: resetDefaults.contrast,
      highlights: resetDefaults.highlights,
      midtones: resetDefaults.midtones,
      shadows: resetDefaults.shadows,
      alphaThreshold: resetDefaults.alphaThreshold,
    });
    if (toneConfig && onChangeToneConfig) {
      onChangeToneConfig({ ...toneConfig, levelsBlack: 0, levelsMidtones: 128, levelsWhite: 255 });
    }
  };

  const resetEffects = () => {
    onChangeConfig({
      ...config,
      sharpenStrength: resetDefaults.sharpenStrength,
      sharpenRadius: resetDefaults.sharpenRadius,
      noise: resetDefaults.noise,
      denoise: resetDefaults.denoise,
      blur: resetDefaults.blur,
      ...(showInvert ? { invert: resetDefaults.invert } : {}),
    });
  };

  return (
    <>
      {/* TONAL CONTROLS */}
      <CollapsibleSection
        title="TONAL CONTROLS"
        icon={<Sparkles size={12} />}
        persistKey={`${persistKeyPrefix}-tonal-controls`}
        onReset={resetTonal}
        resetTitle="Reset exposure, curve, levels, highlights, midtones and shadows"
      >
        <div className="tonal-subheading tonal-subheading-flush">
          <span>Exposure &amp; Contrast</span>
        </div>
        <AdjustSlider id="brightness" config={config} onChangeConfig={onChangeConfig} />
        <AdjustSlider id="contrast" config={config} onChangeConfig={onChangeConfig} />

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
          <div className="panel-group-below">
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
        resetTitle="Reset invert, sharpen, blur, noise and denoise"
      >
        {showInvert && (
          <div className="control-row">
            <span className="control-label">Invert Luminance</span>
            <ToggleSwitch
              checked={Boolean(config.invert)}
              onChange={(val) => update('invert', val)}
              title="Swap highlights and shadows"
            />
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
      </CollapsibleSection>
    </>
  );
};

export interface ImageAdjustControlsProps extends ColorAdjustControlsProps, TonalAdjustControlsProps {
  adjustStepSlot?: React.ReactNode;
}

export const ImageAdjustControls: React.FC<ImageAdjustControlsProps> = (props) => {
  return (
    <>
      <ColorAdjustControls {...props} />
      {props.adjustStepSlot}
      <TonalAdjustControls {...props} />
    </>
  );
};
