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

export const OUTPUT_MODES: OutputModeSpec[] = [
  {
    id: 'ascii',
    name: 'ASCII',
    badge: 'TEXT',
    description: 'Monospace Density Ramp',
    icon: Type,
    title: 'Monospace ASCII character density rasterization [Hotkey: 1]',
  },
  {
    id: 'pixel',
    name: 'PIXEL',
    badge: 'DITHER',
    description: '1:1 Square Pixel Grid',
    icon: Grid,
    title: 'Direct square hardware dither rasterization [Hotkey: 2]',
  },
  {
    id: 'vector',
    name: 'VECTOR',
    badge: 'BEAM',
    description: 'Rutt-Etra Scanline Relief',
    icon: Activity,
    title: 'Oscilloscope beam deflection and carrier modulation, as polylines [Hotkey: 3]',
  },
];

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
          title={mode.title}
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
