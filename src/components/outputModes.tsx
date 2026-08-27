import React from 'react';
import { Grid, Type, Activity } from 'lucide-react';
import { RasterOutputMode } from '../types/ascii';

/**
 * The output rasterization modes, as data.
 *
 * Lives here rather than in App so BASIC and ADVANCED render the same three
 * cards from the same source: ADVANCED as full command cards at the top of the
 * RENDER block, BASIC as the `.source-card-mini` variant of them. Two copies
 * of this list is how the two modes drift into looking like two apps.
 */
export interface OutputModeSpec {
  id: RasterOutputMode;
  name: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
}

/*
 * Display order, and the hotkey order with it: PIXEL leads because it is the
 * one most reached for.
 *
 * This array is the single definition of both. The number keys are read as an
 * index into it (App's key handler), the card tooltips number themselves from
 * the same index, and the shortcuts sheet lists it directly — so re-ordering
 * these three entries moves the row, the tooltips, the sheet and the actual
 * bindings together, and there is no second list to update or forget.
 */
export const OUTPUT_MODES: OutputModeSpec[] = [
  {
    id: 'pixel',
    name: 'PIXEL',
    badge: 'DITHER',
    description: '1:1 Square Pixel Grid',
    icon: Grid,
    title: 'Direct square hardware dither rasterization',
  },
  {
    id: 'ascii',
    name: 'ASCII',
    badge: 'TEXT',
    description: 'Monospace Density Ramp',
    icon: Type,
    title: 'Monospace ASCII character density rasterization',
  },
  {
    id: 'vector',
    name: 'VECTOR',
    badge: 'BEAM',
    description: 'Rutt-Etra Scanline Relief',
    icon: Activity,
    title: 'Oscilloscope beam deflection and carrier modulation, as polylines',
  },
];

/**
 * The mode a number key selects, or null for any other key.
 *
 * The binding is positional by design — see the note above `OUTPUT_MODES`. One
 * reader for the key handler and the shortcuts sheet both, so a reorder can
 * never leave the sheet describing keys that do something else.
 */
export function outputModeForKey(key: string): OutputModeSpec | null {
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1 || n > OUTPUT_MODES.length) return null;
  return OUTPUT_MODES[n - 1];
}

/** The number key that selects a mode, matching its position in the row. */
export function outputModeHotkey(id: RasterOutputMode): string {
  const i = OUTPUT_MODES.findIndex((m) => m.id === id);
  return i >= 0 ? String(i + 1) : '';
}

interface OutputModeCardsProps {
  value: RasterOutputMode;
  onChange: (mode: RasterOutputMode) => void;
  /**
   * The BASIC variant: icon, name, and the live dot moved to the corner.
   *
   * Same card and the same hover/active rules — the description, the badge and
   * the ACTIVE/READY footer are what come off, which is most of the height and
   * none of the meaning at this size.
   */
  compact?: boolean;
}

/** The three output modes as selectable cards. */
export const OutputModeCards: React.FC<OutputModeCardsProps> = ({ value, onChange, compact }) => (
  <div className={`render-mode-grid${compact ? ' render-mode-grid-compact' : ''}`}>
    {OUTPUT_MODES.map((mode) => {
      const Icon = mode.icon;
      const isActive = value === mode.id;
      return (
        <button
          key={mode.id}
          type="button"
          className={`source-card${compact ? ' source-card-mini' : ''}${isActive ? ' active' : ''}`}
          onClick={() => onChange(mode.id)}
          title={`${mode.title} [Hotkey: ${outputModeHotkey(mode.id)}]`}
        >
          <div className="source-card-header">
            <div className="source-card-icon-wrap">
              <Icon size={compact ? 13 : 14} />
            </div>
            {!compact && <span className="source-card-badge">{mode.badge}</span>}
          </div>
          <div className="source-card-body">
            <span className="source-card-name">{mode.name}</span>
            {!compact && <span className="source-card-desc">{mode.description}</span>}
          </div>
          {compact ? (
            <span className="source-card-dot" />
          ) : (
            <div className="source-card-footer">
              <span className="source-card-dot" />
              <span className="source-card-status">{isActive ? 'ACTIVE' : 'READY'}</span>
            </div>
          )}
        </button>
      );
    })}
  </div>
);
