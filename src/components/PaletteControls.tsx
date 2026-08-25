import React from 'react';
import {
  PhosphorTheme,
  PaletteMode,
  MediaColorConfig,
  AppMode,
  TonalMappingType,
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
  /** Tonal half of the unified colour selector; lives in the adjust config. */
  tonalMapping?: TonalMappingType;
  onChangeTonalMapping?: (t: TonalMappingType) => void;
  isPixelMode?: boolean;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

const CATEGORY_LABELS: Record<string, string> = {
  retro: 'Hardware Palettes',
  print: 'Print & Riso Palettes',
  design: 'Design Palettes',
  custom: 'Custom Palettes',
};

const FALLBACK_COLOR_CONFIG: MediaColorConfig = {
  mode: 'fixed',
  sampling: 'center',
  bgPreset: 'dark',
  customBg: '#0a0a0a',
  saturation: 200,
};

/**
 * The single colour-output selector.
 *
 * Colour used to be chosen twice: a phosphor / indexed / content tab strip
 * here, and a separate "Tonal Mapping" dropdown in the tonal controls. They
 * were mutually exclusive in the engine but not in the UI, so picking a
 * palette silently disabled the tonal mapping and vice versa. Both are one
 * list now — an indexed palette is just an n-colour mapping with fixed stops.
 */
export const PaletteControls: React.FC<PaletteControlsProps> = ({
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  appMode = 'synth',
  tonalMapping = '1color',
  onChangeTonalMapping,
  isPixelMode = false,
}) => {
  const isRgbDisabled = appMode === 'synth';
  const rawPaletteMode: PaletteMode = mediaColorConfig?.paletteMode || 'phosphor';
  const paletteMode: PaletteMode = rawPaletteMode === 'content' && isRgbDisabled ? 'phosphor' : rawPaletteMode;
  const activePaletteId = mediaColorConfig?.activePaletteId || 'gameboy-classic';
  const activePalette = BUILTIN_PALETTES.find((p) => p.id === activePaletteId);

  // One value covering both backing fields.
  const choice =
    paletteMode === 'content'
      ? 'content'
      : paletteMode === 'indexed'
        ? 'palette:' + activePaletteId
        : tonalMapping;

  const groupedPalettes = BUILTIN_PALETTES.reduce<Record<string, typeof BUILTIN_PALETTES>>((acc, pal) => {
    (acc[pal.category] ||= []).push(pal);
    return acc;
  }, {});

  const handleChoice = (next: string) => {
    const base = mediaColorConfig || FALLBACK_COLOR_CONFIG;

    if (next.startsWith('palette:') || next === 'content') {
      // Indexed and content drive colour entirely; a phosphor tint on top would
      // only re-colour the result, so clear it.
      onChangeTheme?.('monochrome');
      onChangeCustomColor?.('');
      onChangeTonalMapping?.('1color');
      onChangeMediaColorConfig?.(
        next === 'content'
          ? { ...base, paletteMode: 'content', mode: 'content' }
          : { ...base, paletteMode: 'indexed', mode: 'fixed', activePaletteId: next.slice(8) }
      );
      return;
    }

    onChangeTonalMapping?.(next as TonalMappingType);
    onChangeMediaColorConfig?.({ ...base, paletteMode: 'phosphor', mode: 'fixed' });
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      <div className="control-row">
        <span className="control-label">Color Mode</span>
        <select
          className="number-input"
          style={{ width: '150px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
          value={choice}
          onChange={(e) => handleChoice(e.target.value)}
        >
          <optgroup label="Tonal Mapping">
            <option value="1color">1 Color (Mono Tint)</option>
            <option value="2color">2 Colors (Duotone)</option>
            <option value="3color">3 Colors (Tritone)</option>
          </optgroup>
          {!isRgbDisabled && (
            <optgroup label="Source">
              <option value="content">Content Color (True RGB)</option>
            </optgroup>
          )}
          {Object.entries(groupedPalettes).map(([cat, pals]) => (
            <optgroup key={cat} label={CATEGORY_LABELS[cat] || cat}>
              {pals.map((pal) => (
                <option key={pal.id} value={'palette:' + pal.id}>
                  {pal.name} ({pal.colors.length})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* 1. Single Color Mode (Phosphor Themes in ASCII only; Custom Tint in Pixel) */}
      {paletteMode === 'phosphor' && tonalMapping === '1color' && (
        <div style={{ marginTop: '8px' }}>
          {!isPixelMode && (
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
          )}

          {/* Custom Hex Color input */}
          <div className="control-row">
            <span className="control-label">{isPixelMode ? 'Foreground Tint' : 'Custom Tint'}</span>
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

      {/* 2. Indexed palette preview — the palette itself is picked in the list above. */}
      {paletteMode === 'indexed' && activePalette && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
            {activePalette.colors.map((c, i) => (
              <div
                key={i}
                title={c}
                style={{
                  width: '14px',
                  height: '16px',
                  borderRadius: '1px',
                  background: c,
                  border: '1px solid rgba(0,0,0,0.35)',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: '8.5px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            {activePalette.category} • {activePalette.colors.length} colors
          </span>
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
                  ...(mediaColorConfig || FALLBACK_COLOR_CONFIG),
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
                  ...(mediaColorConfig || FALLBACK_COLOR_CONFIG),
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
