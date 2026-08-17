import React from 'react';
import { CHARSETS } from '../engine/renderer';
import { PhosphorTheme } from '../types/ascii';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

export const CharsetThemeBar: React.FC<CharsetThemeBarProps> = ({
  currentCharset,
  onChangeCharset,
  currentTheme,
  onChangeTheme,
}) => {
  return (
    <div className="tab-content">
      {/* Phosphor Theme */}
      <div className="control-section">
        <div className="section-header">
          <span>Phosphor Color Theme</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          {THEMES.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                className={`btn ${isSelected ? 'btn-primary' : ''}`}
                style={{
                  justifyContent: 'flex-start',
                  borderLeft: `4px solid ${t.color}`,
                }}
                onClick={() => onChangeTheme(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Character Density Ramp */}
      <div className="control-section">
        <div className="section-header">
          <span>Character Density Presets</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
          {CHARSETS.map((cs) => {
            const isSelected = currentCharset === cs.chars;
            return (
              <button
                key={cs.id}
                className={`preset-card ${isSelected ? 'active' : ''}`}
                onClick={() => onChangeCharset(cs.chars)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="preset-card-title">{cs.name}</span>
                  <code style={{ fontSize: '11px', color: 'var(--accent)' }}>"{cs.chars}"</code>
                </div>
              </button>
            );
          })}
        </div>

        <div className="control-row">
          <span className="control-label">Custom Density Ramp</span>
        </div>
        <input
          type="text"
          className="number-input"
          style={{ width: '100%', textAlign: 'left', padding: '6px' }}
          value={currentCharset}
          onChange={(e) => onChangeCharset(e.target.value || ' ')}
          placeholder="e.g.  .:-=+*#%@"
        />
      </div>
    </div>
  );
};
