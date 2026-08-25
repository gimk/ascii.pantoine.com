import React, { useState, useEffect } from 'react';

/**
 * Small numeric field paired with the range sliders across the sidebar.
 *
 * Keeps its own text buffer while focused so partial input ('-', '') does not
 * get clobbered by the clamped value coming back down from the parent.
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    setText(raw);
    if (raw === '-' || raw === '') return;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    setIsFocused(false);
    const parsed = parseInt(text, 10);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      const validVal = Math.max(min, Math.min(max, parsed));
      setText(validVal.toString());
      onChange(validVal);
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
