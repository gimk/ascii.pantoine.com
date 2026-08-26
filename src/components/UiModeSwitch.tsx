import React from 'react';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { UiMode } from '../types/ascii';

interface UiModeSwitchProps {
  value: UiMode;
  onChange: (mode: UiMode) => void;
}

const MODES: {
  id: UiMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
}[] = [
  {
    id: 'basic',
    label: 'BASIC',
    icon: Sparkles,
    title: 'Basic — one panel: import, dither, adjust, colour, export',
  },
  {
    id: 'advanced',
    label: 'ADVANCED',
    icon: SlidersHorizontal,
    title: 'Advanced — every source and control, across the Content and Render tabs',
  },
];

/**
 * The BASIC / ADVANCED segmented switch that sits centred in the header.
 *
 * Both modes drive the same state, so this never converts or discards
 * anything: it only decides which arrangement of controls is on screen.
 */
export const UiModeSwitch: React.FC<UiModeSwitchProps> = ({ value, onChange }) => {
  const activeIndex = Math.max(0, MODES.findIndex((m) => m.id === value));

  return (
    <div
      className="ui-mode-switch"
      role="radiogroup"
      aria-label="Interface complexity"
    >
      {/* Sliding indicator. Behind the buttons, moved by transform so the
          travel animates rather than the label flashing between states. */}
      <span
        className="ui-mode-switch-indicator"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`ui-mode-switch-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(mode.id)}
            title={mode.title}
          >
            <Icon size={12} className="ui-mode-switch-icon" />
            <span className="ui-mode-switch-label">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};
