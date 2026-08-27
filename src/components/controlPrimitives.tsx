import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BlendMode } from '../types/ascii';

/** Decimal places implied by a step, so 0.1 shows one and 5 shows none. */
const decimalsForStep = (step: number): number => {
  if (!isFinite(step) || step <= 0) return 0;
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
};

/** Snap to the step grid and strip the float noise a raw divide leaves behind. */
const quantize = (val: number, step: number): number => {
  if (!isFinite(step) || step <= 0) return val;
  const snapped = Math.round(val / step) * step;
  return Number(snapped.toFixed(decimalsForStep(step) + 2));
};

/**
 * Small numeric field paired with the range sliders across the sidebar.
 *
 * Keeps its own text buffer while focused so partial input ('-', '', '0.')
 * does not get clobbered by the clamped value coming back down from the
 * parent. Parses as a float: a step of 0.1 has to survive being typed.
 */
export const NumberInput: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({ value, min = -100, max = 100, step = 1, disabled = false, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value.toString());
    }
  }, [value, isFocused]);

  /*
   * Round to the precision the step implies before committing. Keeps a step of
   * 1 integer-only for callers like the resolution fields, which parseFloat
   * alone would have let '12.7' through.
   */
  const commit = (parsed: number) => {
    const rounded = Number(parsed.toFixed(decimalsForStep(step)));
    onChange(Math.max(min, Math.min(max, rounded)));
    return Math.max(min, Math.min(max, rounded));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    setText(raw);
    // Mid-typing states that are not yet a number: wait for the next keystroke
    // rather than snapping the value out from under the caret.
    if (raw === '-' || raw === '' || raw === '.' || raw === '-.' || raw.endsWith('.')) return;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      commit(parsed);
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    setIsFocused(false);
    const parsed = parseFloat(text);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      setText(commit(parsed).toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      className={`number-input number-input-sm${disabled ? ' control-disabled' : ''}`}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => !disabled && setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

/**
 * Slider + number field where the two cover different ranges on purpose.
 *
 * The track spans only the range worth dragging through, at a step fine enough
 * to land on, while the number field accepts the full extreme range. Most of
 * these effects are useful in a narrow band and violent past it -- spending the
 * whole track on the violent part is what made them feel uncontrollable.
 *
 * A value typed beyond the track simply grows the track to reach it, so an
 * extreme stays draggable instead of pinning the thumb to an end and clamping
 * the value away on the next nudge.
 */
export const PrecisionSlider: React.FC<{
  value: number;
  /** Range the track spans under normal use. */
  sliderMin: number;
  sliderMax: number;
  /** Range the number field accepts. Defaults to the track range. */
  hardMin?: number;
  hardMax?: number;
  step?: number;
  /** Snap-back target for a double-click on the track. Omit to disable. */
  resetTo?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({
  value,
  sliderMin,
  sliderMax,
  hardMin,
  hardMax,
  step = 0.1,
  resetTo,
  disabled = false,
  onChange,
}) => {
  const lo = hardMin ?? sliderMin;
  const hi = hardMax ?? sliderMax;
  const safeValue = isFinite(value) ? value : sliderMin;
  const trackMin = Math.min(sliderMin, safeValue);
  const trackMax = Math.max(sliderMax, safeValue);
  const isBeyondTrack = safeValue > sliderMax || safeValue < sliderMin;

  return (
    <div className="control-input-wrapper">
      <input
        type="range"
        className="range-slider"
        min={trackMin}
        max={trackMax}
        step={step}
        value={safeValue}
        disabled={disabled}
        onChange={(e) => onChange(quantize(parseFloat(e.target.value), step))}
        {...(resetTo !== undefined
          ? {
              onDoubleClick: () => onChange(resetTo),
              title: isBeyondTrack
                ? `Extended past the ${sliderMin}..${sliderMax} range. Double-click to reset to ${resetTo}`
                : `Double-click to reset to ${resetTo}`,
            }
          : isBeyondTrack
            ? { title: `Extended past the ${sliderMin}..${sliderMax} range` }
            : {})}
      />
      <NumberInput
        value={safeValue}
        min={lo}
        max={hi}
        step={step}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
};

/**
 * Colour swatch + hex field that commits only when the user is done picking.
 *
 * A native colour input fires `input` on every mouse move inside the picker.
 * Forwarding those straight up re-renders and re-rasterizes the whole frame
 * dozens of times a second, which is what made dragging in the picker crawl.
 *
 * So the live value is held locally -- the swatch tracks the cursor with no
 * render cost -- and is pushed to the parent only on `change`, which the
 * browser fires when the picker is dismissed or the value is committed. Blur
 * and unmount also flush, so a value can never be picked and then lost.
 */
export const DeferredColorInput: React.FC<{
  value: string;
  fallback?: string;
  title?: string;
  disabled?: boolean;
  /** Hex text field alongside the swatch. */
  showHexField?: boolean;
  hexFieldWidth?: string;
  onChange: (val: string) => void;
}> = ({
  value,
  fallback = '#ffffff',
  title,
  disabled = false,
  showHexField = true,
  hexFieldWidth = '80px',
  onChange,
}) => {
  const resolved = value || fallback;
  const [draft, setDraft] = useState<string>(resolved);
  const [hexText, setHexText] = useState<string>(value);
  const isPickingRef = useRef<boolean>(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Keep the latest callback in a ref: the commit listener is attached once,
  // and must not go stale nor be torn down and rebuilt on every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!isPickingRef.current) {
      setDraft(resolved);
      setHexText(value);
    }
  }, [resolved, value]);

  useEffect(() => {
    const el = colorInputRef.current;
    if (!el) return;

    const flush = () => {
      if (!isPickingRef.current) return;
      isPickingRef.current = false;
      onChangeRef.current(el.value);
    };

    // React's onChange maps to the `input` event for colour inputs, so the
    // commit-time event has to be subscribed to directly.
    el.addEventListener('change', flush);
    el.addEventListener('blur', flush);
    return () => {
      el.removeEventListener('change', flush);
      el.removeEventListener('blur', flush);
      // Picked but never committed, e.g. the panel closed mid-pick.
      flush();
    };
  }, []);

  const handleHexChange = (raw: string) => {
    setHexText(raw);
    const withHash = raw.startsWith('#') ? raw : '#' + raw;
    if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) {
      onChange(withHash);
    }
  };

  return (
    <div className="control-inline">
      <div
        className={`color-swatch${disabled ? ' control-disabled' : ''}`}
        style={{ background: draft }}
      >
        <input
          ref={colorInputRef}
          type="color"
          value={draft}
          disabled={disabled}
          title={title}
          onChange={(e) => {
            // Local only: this fires continuously while the picker is open.
            isPickingRef.current = true;
            setDraft(e.target.value);
          }}
        />
      </div>
      {showHexField && (
        <input
          type="text"
          className="text-input color-hex-field"
          value={hexText}
          placeholder={fallback}
          disabled={disabled}
          onChange={(e) => handleHexChange(e.target.value)}
          style={{ width: hexFieldWidth }}
        />
      )}
    </div>
  );
};

/**
 * A numbered rule across the sidebar — `01 · CONTENT MODE`, and so on.
 *
 * The sidebar is one continuous column in both UI modes now, so the step
 * numbers are the only thing saying where you are in the walkthrough. Nine
 * hand-written copies of this markup is how one of them ends up numbered
 * wrong, so both modes render it from here.
 */
export const WorkflowStep: React.FC<{
  n: string;
  label: string;
  /** Anchor for the sidebar rail to scroll to. */
  anchorRef?: React.Ref<HTMLDivElement>;
}> = ({ n, label, anchorRef }) => (
  <div className="sidebar-workflow-title" ref={anchorRef}>
    <span className="sidebar-workflow-step">{n}</span>
    <span className="sidebar-workflow-label">{label}</span>
    <div className="sidebar-workflow-line" />
  </div>
);

/**
 * One flat list, ordered darken -> lighten -> contrast -> comparative ->
 * component, and subtle to extreme inside each of those runs.
 *
 * The optgroup headings that used to carry that order were six unclickable
 * rows in a sixteen-row dropdown, and the grouping is legible from the order
 * itself. The order is the documentation now.
 */
export const BLEND_MODES: BlendMode[] = [
  'normal',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

const BLEND_LABELS: Partial<Record<BlendMode, string>> = {
  'color-dodge': 'Color Dodge',
  'color-burn': 'Color Burn',
  'hard-light': 'Hard Light',
  'soft-light': 'Soft Light',
};

export const blendLabel = (m: BlendMode): string =>
  BLEND_LABELS[m] || m.charAt(0).toUpperCase() + m.slice(1);

/**
 * The blend picker: a dropdown flanked by wrap-around steppers.
 *
 * A primitive rather than markup inside the compositing panel, because BASIC
 * and ADVANCED both show it and the two had drifted — ADVANCED had the
 * steppers and all sixteen modes, BASIC had a bare select over a shortlist of
 * eight, which additionally mis-displayed any mode outside its own list. One
 * component means the two cannot disagree about the control or about which
 * modes exist.
 *
 * The arrows matter more than they look: stepping is how you actually audition
 * blend modes — you compare neighbours against the picture, and reaching into
 * a sixteen-row dropdown for each one loses your place every time. They wrap,
 * so the list has no dead end in either direction.
 */
export const BlendModePicker: React.FC<{
  value: BlendMode;
  onChange: (mode: BlendMode) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const step = (delta: number) => {
    const i = BLEND_MODES.indexOf(value);
    // A value that is not in the list (an old link, a hand-edited preset)
    // reads as index -1; treat the step as starting from the top rather than
    // landing somewhere arbitrary.
    const from = i === -1 ? 0 : i;
    const next = (from + delta + BLEND_MODES.length) % BLEND_MODES.length;
    onChange(BLEND_MODES[next]);
  };

  return (
    <div className="control-cluster">
      <button
        type="button"
        className="slider-nudge-btn btn-icon-sq"
        disabled={disabled}
        onClick={() => step(-1)}
        title="Previous blend mode (wraps around)"
      >
        <ChevronLeft size={13} />
      </button>

      <select
        className="number-input stepper-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as BlendMode)}
      >
        {BLEND_MODES.map((m) => (
          <option key={m} value={m}>
            {blendLabel(m)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="slider-nudge-btn btn-icon-sq"
        disabled={disabled}
        onClick={() => step(1)}
        title="Next blend mode (wraps around)"
      >
        <ChevronRight size={13} />
      </button>
    </div>
  );
};
