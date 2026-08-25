import React from 'react';
import {
  PhosphorTheme,
  PaletteMode,
  ColorPalette,
  MediaColorConfig,
  AppMode,
} from '../types/ascii';
import { BUILTIN_PALETTES } from '../engine/palettes';

interface PaletteControlsProps {
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  appMode?: AppMode;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

export const PaletteControls: React.FC<PaletteControlsProps> = ({
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  appMode = 'synth',
}) => {
  const isRgbDisabled = appMode === 'synth';
  const rawPaletteMode: PaletteMode = mediaColorConfig?.paletteMode || 'phosphor';
  const paletteMode: PaletteMode = (rawPaletteMode === 'content' && isRgbDisabled) ? 'phosphor' : rawPaletteMode;
  const activePaletteId = mediaColorConfig?.activePaletteId || 'gameboy-classic';

  const handleSelectPaletteMode = (mode: PaletteMode) => {
    if (mode === 'indexed' || mode === 'content') {
      if (onChangeTheme) onChangeTheme('monochrome');
      if (onChangeCustomColor) onChangeCustomColor('');
    }

    if (onChangeMediaColorConfig) {
      onChangeMediaColorConfig({
        ...(mediaColorConfig || {
          mode: 'fixed',
          sampling: 'center',
          bgPreset: 'dark',
          customBg: '#0a0a0a',
          saturation: 200,
        }),
        paletteMode: mode,
        mode: mode === 'content' ? 'content' : 'fixed',
      });
    }
  };

  const handleSelectRetroPalette = (pal: ColorPalette) => {
    if (onChangeTheme) onChangeTheme('monochrome');
    if (onChangeCustomColor) onChangeCustomColor('');
    if (onChangeMediaColorConfig) {
      onChangeMediaColorConfig({
        ...(mediaColorConfig || {
          mode: 'fixed',
          sampling: 'center',
          bgPreset: 'dark',
          customBg: '#0a0a0a',
          saturation: 200,
        }),
        paletteMode: 'indexed',
        activePaletteId: pal.id,
      });
    }
  };

  return (
    <div style={{ marginBottom: '14px' }}>
      {/* Mode Switcher Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '10px' }}>
        <button
          type="button"
          className={`chip-btn ${paletteMode === 'phosphor' ? 'active' : ''}`}
          onClick={() => handleSelectPaletteMode('phosphor')}
          style={{ fontSize: '9px', padding: '4px 2px' }}
        >
          SINGLE COLOR
        </button>

        <button
          type="button"
          className={`chip-btn ${paletteMode === 'indexed' ? 'active' : ''}`}
          onClick={() => handleSelectPaletteMode('indexed')}
          style={{ fontSize: '9px', padding: '4px 2px' }}
        >
          INDEXED
        </button>

        <button
          type="button"
          disabled={isRgbDisabled}
          className={`chip-btn ${paletteMode === 'content' && !isRgbDisabled ? 'active' : ''}`}
          onClick={() => !isRgbDisabled && handleSelectPaletteMode('content')}
          style={{ fontSize: '9px', padding: '4px 2px' }}
          title={isRgbDisabled ? 'Content Color mode requires Media or 3D Model source' : 'Source content true color'}
        >
          CONTENT COLOR
        </button>
      </div>

      {/* 1. Single Color Mode (Phosphor Themes + Custom Color) */}
      {paletteMode === 'phosphor' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '8px' }}>
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`theme-btn ${currentTheme === th.id && !customThemeColor ? 'active' : ''}`}
                onClick={() => {
                  if (onChangeCustomColor) onChangeCustomColor('');
                  onChangeTheme(th.id);
                }}
                title={th.name}
              >
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: th.color,
                    boxShadow: currentTheme === th.id && !customThemeColor ? `0 0 6px ${th.color}` : 'none',
                  }}
                />
                <span>{th.id.slice(0, 4).toUpperCase()}</span>
              </button>
            ))}
          </div>

          {/* Custom Hex Color input */}
          <div className="control-row">
            <span className="control-label">Custom Tint</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '2px',
                  border: '1px solid var(--border-color)',
                  background: customThemeColor || THEMES.find((t) => t.id === currentTheme)?.color || '#00ff66',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  value={customThemeColor || THEMES.find((t) => t.id === currentTheme)?.color || '#00ff66'}
                  onChange={(e) => {
                    if (onChangeCustomColor) onChangeCustomColor(e.target.value);
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                  }}
                  title="Pick custom phosphor tint"
                />
              </div>
              <input
                type="text"
                className="text-input"
                value={customThemeColor}
                placeholder="#00ff66"
                onChange={(e) => {
                  if (onChangeCustomColor) onChangeCustomColor(e.target.value);
                }}
                style={{ width: '80px', fontSize: '10px' }}
              />
              {customThemeColor && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => onChangeCustomColor && onChangeCustomColor('')}
                  style={{ fontSize: '8.5px', padding: '2px 5px' }}
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Indexed Retro Hardware Palettes */}
      {paletteMode === 'indexed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto', paddingRight: '2px' }}>
          {BUILTIN_PALETTES.map((pal) => {
            const isSelected = activePaletteId === pal.id;
            return (
              <button
                key={pal.id}
                type="button"
                className={`palette-row-btn ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelectRetroPalette(pal)}
              >
                <div>
                  <div style={{ fontSize: '10px', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {pal.name}
                  </div>
                  <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    {pal.category} • {pal.colors.length} COLORS
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2px' }}>
                  {pal.colors.slice(0, 8).map((c, i) => (
                    <div
                      key={i}
                      style={{
                        width: '8px',
                        height: '14px',
                        borderRadius: '1px',
                        background: c,
                        border: '1px solid rgba(0,0,0,0.3)',
                      }}
                    />
                  ))}
                  {pal.colors.length > 8 && (
                    <span style={{ fontSize: '8px', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '2px' }}>
                      +{pal.colors.length - 8}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Content True Color Adjustments */}
      {paletteMode === 'content' && onChangeMediaColorConfig && (
        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label">Content Saturation</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              min={0}
              max={400}
              value={mediaColorConfig?.saturation ?? 200}
              onChange={(e) =>
                onChangeMediaColorConfig({
                  ...(mediaColorConfig || {
                    mode: 'content',
                    sampling: 'center',
                    bgPreset: 'dark',
                    customBg: '#0a0a0a',
                    saturation: 200,
                  }),
                  saturation: parseInt(e.target.value, 10) || 200,
                })
              }
              className="range-slider"
            />
            <input
              type="number"
              className="number-input"
              min={0}
              max={400}
              value={mediaColorConfig?.saturation ?? 200}
              onChange={(e) =>
                onChangeMediaColorConfig({
                  ...(mediaColorConfig || {
                    mode: 'content',
                    sampling: 'center',
                    bgPreset: 'dark',
                    customBg: '#0a0a0a',
                    saturation: 200,
                  }),
                  saturation: Math.max(0, Math.min(400, parseInt(e.target.value, 10) || 200)),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

