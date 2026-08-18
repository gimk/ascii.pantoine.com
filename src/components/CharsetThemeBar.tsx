import React, { useState } from 'react';
import { CHARSETS } from '../engine/renderer';
import { PhosphorTheme, CrtConfig } from '../types/ascii';
import { Tv, Sparkles, Pipette } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  crtConfig: CrtConfig;
  onChangeCrtConfig: (cfg: CrtConfig) => void;
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
  customThemeColor = '',
  onChangeCustomColor,
  crtConfig,
  onChangeCrtConfig,
}) => {
  const [customHex, setCustomHex] = useState<string>(customThemeColor || '#00ff66');

  const updateCrt = <K extends keyof CrtConfig>(key: K, val: CrtConfig[K]) => {
    onChangeCrtConfig({
      ...crtConfig,
      [key]: val,
    });
  };

  const handleCustomColorChange = (hex: string) => {
    setCustomHex(hex);
    if (onChangeCustomColor) {
      onChangeCustomColor(hex);
    }
  };

  return (
    <div className="tab-content">
      {/* 1. CRT & Display Effects */}
      <div className="control-section">
        <div className="section-header">
          <span>CRT & Display Effects</span>
          <Tv size={12} style={{ color: 'var(--accent)' }} />
        </div>

        <div className="control-row">
          <span className="control-label">CRT Scanlines</span>
          <button
            className={`btn btn-sm ${crtConfig.scanlines ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('scanlines', !crtConfig.scanlines)}
          >
            {crtConfig.scanlines ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Phosphor Glow Bloom</span>
          <button
            className={`btn btn-sm ${crtConfig.glow ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('glow', !crtConfig.glow)}
          >
            {crtConfig.glow ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">CRT Corner Vignette</span>
          <button
            className={`btn btn-sm ${crtConfig.vignette ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('vignette', !crtConfig.vignette)}
          >
            {crtConfig.vignette ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>
      </div>

      {/* 2. Phosphor Theme */}
      <div className="control-section">
        <div className="section-header">
          <span>Phosphor Color Theme</span>
          <Sparkles size={12} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
          {THEMES.map((t) => {
            const isSelected = !customThemeColor && currentTheme === t.id;
            return (
              <button
                key={t.id}
                className={`btn ${isSelected ? 'btn-primary' : ''}`}
                style={{
                  justifyContent: 'flex-start',
                  borderLeft: `4px solid ${t.color}`,
                }}
                onClick={() => {
                  if (onChangeCustomColor) onChangeCustomColor('');
                  onChangeTheme(t.id);
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {/* Custom Phosphor Accent Color */}
        <div className="control-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Pipette size={11} /> Custom Phosphor Color
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="color"
              style={{
                width: '28px',
                height: '24px',
                padding: 0,
                border: '1px solid var(--border-color)',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
              value={customHex}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              title="Pick a custom phosphor color"
            />
            <input
              type="text"
              className="number-input"
              style={{ width: '68px', textAlign: 'center', padding: '2px 4px', fontSize: '10.5px' }}
              value={customHex}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              placeholder="#00ff66"
            />
            {customThemeColor && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (onChangeCustomColor) onChangeCustomColor('');
                }}
                title="Reset to default theme"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Character Density Ramp */}
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
