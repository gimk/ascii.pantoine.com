import React, { useState, useEffect } from 'react';

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
      className="number-input"
      style={{
        width: '54px',
        padding: '2px 4px',
        fontSize: '11px',
        textAlign: 'right',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
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
