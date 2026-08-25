import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { CHARSETS } from '../engine/renderer';
import { AppMode } from '../types/ascii';
import { Type } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  appMode?: AppMode;
  isPixelMode?: boolean;
}

export const CharsetThemeBar: React.FC<CharsetThemeBarProps> = ({
  currentCharset,
  onChangeCharset,
  isPixelMode = false,
}) => {
  const activeCharsetName = isPixelMode ? 'N/A (Pixel Mode)' : (CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom');

  return (
    <div className="tab-content">
      {/* Palette / theme controls now live in TONAL CONTROLS for every mode. */}
      {/* 2. Character Density Ramp */}
      <CollapsibleSection
        title="Character Density Ramp"
        icon={<Type size={12} />}
        persistKey="CharsetThemeBar-character-density-presets"
        badge={activeCharsetName}
        defaultOpen={false}
      >
        <div style={{ opacity: isPixelMode ? 0.35 : 1, pointerEvents: isPixelMode ? 'none' : 'auto' }}>
          {isPixelMode && (
            <div style={{ fontSize: '9px', color: 'var(--accent)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
              CHARACTERS BYPASSED IN PIXEL MODE (SOLID PIXELS ONLY)
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {CHARSETS.map((cs) => {
              const isSelected = currentCharset === cs.chars;
              return (
                <button
                  key={cs.id}
                  disabled={isPixelMode}
                  className={`preset-card ${isSelected ? 'active' : ''}`}
                  onClick={() => onChangeCharset(cs.chars)}
                  style={{ padding: '4px 6px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="preset-card-title" style={{ fontSize: '10px' }}>{cs.name}</span>
                    <code style={{ fontSize: '10px', color: 'var(--accent)' }}>"{cs.chars}"</code>
                  </div>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            disabled={isPixelMode}
            className="text-input"
            style={{ width: '100%', fontSize: '10.5px' }}
            value={currentCharset}
            onChange={(e) => onChangeCharset(e.target.value || ' ')}
            placeholder="e.g.  .:-=+*#%@"
          />
        </div>
      </CollapsibleSection>
    </div>
  );
};

