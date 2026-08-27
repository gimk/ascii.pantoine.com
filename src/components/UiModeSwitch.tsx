import React from 'react';
import { Wand, Wrench } from 'lucide-react';
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
    icon: Wand,
    title: 'Basic — one panel: import, dither, adjust, colour, export',
  },
  {
    id: 'advanced',
    label: 'ADVANCED',
    icon: Wrench,
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

/**
 * The same choice as UiModeSwitch, collapsed into one icon button plus a
 * two-item menu.
 *
 * The segmented switch is centred in the header and needs room for two labels
 * side by side; below 620px the header has no such room, which is why it used
 * to simply disappear. The sidebar does not disappear at that width -- it
 * stacks under the viewport -- so hiding the switch left the layout choice
 * unreachable on a phone. This is that choice at the cost of a single icon
 * slot, taking the place of the keyboard-shortcuts button, which is the one
 * header control a touch device has no use for.
 */
export const UiModeMenu: React.FC<UiModeSwitchProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const active = MODES.find((m) => m.id === value) ?? MODES[0];
  const ActiveIcon = active.icon;

  return (
    <div className="header-mode-menu">
      <button
        type="button"
        className={`btn btn-sm ${isOpen ? 'btn-primary' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        title={`Interface: ${active.label}`}
        aria-label="Interface complexity"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <ActiveIcon size={13} className="header-btn-icon" />
      </button>

      {isOpen && (
        <>
          {/* Catches the tap-away without needing a document listener. */}
          <div className="zoom-menu-scrim" onClick={() => setIsOpen(false)} />
          <div className="zoom-menu header-mode-menu-list" role="menu">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode.id === value}
                  className={`zoom-menu-item ${mode.id === value ? 'active' : ''}`}
                  onClick={() => {
                    onChange(mode.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="header-mode-menu-item-label">
                    <Icon size={12} className="ui-mode-switch-icon" />
                    {mode.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
