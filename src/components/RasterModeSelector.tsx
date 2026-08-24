import React from 'react';
import { RasterOutputMode } from '../types/ascii';
import { Type, Grid, CircleDot, AlignJustify, Hash, Layers, Square } from 'lucide-react';

interface RasterModeSelectorProps {
  currentMode: RasterOutputMode;
  onChangeMode: (mode: RasterOutputMode) => void;
}

const MODES: {
  id: RasterOutputMode;
  label: string;
  badge: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}[] = [
  { id: 'ascii', label: 'ASCII', badge: 'TXT', icon: Type, description: 'Classic monospace character density' },
  { id: 'braille', label: 'BRAILLE', badge: '8-DOT', icon: Grid, description: '8x sub-pixel Unicode Braille matrix' },
  { id: 'halftone-dot', label: 'DOTS', badge: 'PRINT', icon: CircleDot, description: 'Geometric variable-radius dot halftone' },
  { id: 'halftone-line', label: 'LINES', badge: 'SCREEN', icon: AlignJustify, description: 'Directional engraving stripe screen' },
  { id: 'halftone-crosshatch', label: 'HATCH', badge: 'MESH', icon: Hash, description: '2-pass etched crosshatch screen' },
  { id: 'halftone-cmyk', label: 'CMYK', badge: 'ROSETTE', icon: Layers, description: '4-plate process screen print angles' },
  { id: 'pixel', label: 'PIXEL', badge: 'BITMAP', icon: Square, description: 'Clean 1-bit / N-bit pixel dither' },
];

export const RasterModeSelector: React.FC<RasterModeSelectorProps> = ({
  currentMode,
  onChangeMode,
}) => {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          OUTPUT MODALITY
        </span>
        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
          [{MODES.find((m) => m.id === currentMode)?.badge || 'TXT'}]
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px',
        }}
      >
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              className={`segmented-btn ${isActive ? 'active' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '6px 2px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                background: isActive ? 'var(--bg-control-active, rgba(0,255,102,0.12))' : 'var(--bg-control)',
                borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
                color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              onClick={() => onChangeMode(mode.id)}
              title={mode.description}
            >
              <Icon size={13} />
              <span style={{ fontSize: '9.5px', fontWeight: isActive ? 700 : 500 }}>
                {mode.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
