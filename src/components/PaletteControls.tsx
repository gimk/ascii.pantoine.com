import React, { useMemo, useState } from 'react';
import {
  PhosphorTheme,
  PaletteMode,
  MediaColorConfig,
  AppMode,
  TonalMappingType,
  PaletteMatchMode,
} from '../types/ascii';
import {
  BUILTIN_PALETTES,
  PaletteQuantizer,
  resolvePhosphorTint,
  DEFAULT_PHOSPHOR_TINT,
} from '../engine/palettes';
import { DeferredColorInput } from './controlPrimitives';
import { paletteIsMonochrome } from '../engine/rasterEngine';

interface PaletteControlsProps {
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  appMode?: AppMode;
  tonalMapping?: TonalMappingType;
  onChangeTonalMapping?: (t: TonalMappingType) => void;
  isPixelMode?: boolean;
}

const FALLBACK_COLOR_CONFIG: MediaColorConfig = {
  mode: 'fixed',
  sampling: 'center',
  bgPreset: 'dark',
  customBg: '#0a0a0a',
  saturation: 200,
};

const PALETTE_MATCH_OPTIONS: { id: PaletteMatchMode; label: string; title: string }[] = [
  {
    id: 'auto',
    label: 'AUTO',
    title:
      'Sample the source: colour images get hue matching, luminance-driven sources get the full ramp.',
  },
  {
    id: 'hue',
    label: 'HUE',
    title:
      "Match each cell to the nearest palette colour. Keeps the source's own hues, so an image with a narrow hue range only reaches the palette entries near it.",
  },
  {
    id: 'ramp',
    label: 'RAMP',
    title:
      'Ignore hue and spread luminance across every palette entry, darkest to lightest. Uses the whole palette whatever the source looks like.',
  },
];

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
  const paletteMatch: PaletteMatchMode = mediaColorConfig?.paletteMatch || 'auto';
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const tintColor = resolvePhosphorTint(currentTheme, customThemeColor);

  const isMonoPalette = useMemo(
    () => (activePalette ? paletteIsMonochrome(new PaletteQuantizer(activePalette)) : false),
    [activePalette]
  );
  const canHueMatch = appMode !== 'synth' && !isMonoPalette;
  const paletteMatchHint = isMonoPalette
    ? 'This palette is a single-hue ramp, so there is no colour to match against.'
    : appMode === 'synth'
      ? 'Synth output is luminance-only, so the palette can only be driven as a tone ramp.'
      : 'How the palette is matched to the source.';

  const primaryMode: 'mono' | 'ntone' | 'indexed' | 'content' =
    paletteMode === 'content'
      ? 'content'
      : paletteMode === 'indexed'
      ? 'indexed'
      : tonalMapping !== '1color'
      ? 'ntone'
      : 'mono';

  const handleSelectPrimaryMode = (mode: 'mono' | 'ntone' | 'indexed' | 'content') => {
    const base = mediaColorConfig || FALLBACK_COLOR_CONFIG;
    if (mode === 'mono') {
      onChangeTonalMapping?.('1color');
      onChangeMediaColorConfig?.({ ...base, paletteMode: 'phosphor', mode: 'fixed' });
    } else if (mode === 'ntone') {
      onChangeTonalMapping?.('ntone');
      onChangeMediaColorConfig?.({ ...base, paletteMode: 'phosphor', mode: 'fixed' });
    } else if (mode === 'indexed') {
      onChangeTheme?.('monochrome');
      onChangeCustomColor?.('');
      onChangeTonalMapping?.('1color');
      onChangeMediaColorConfig?.({
        ...base,
        paletteMode: 'indexed',
        mode: 'fixed',
        activePaletteId: activePaletteId || 'gameboy-classic',
      });
    } else if (mode === 'content') {
      onChangeTheme?.('monochrome');
      onChangeCustomColor?.('');
      onChangeTonalMapping?.('1color');
      onChangeMediaColorConfig?.({ ...base, paletteMode: 'content', mode: 'content' });
    }
  };

  const filteredPalettes = useMemo(() => {
    if (selectedCategory === 'all') return BUILTIN_PALETTES;
    return BUILTIN_PALETTES.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* 1. Large High-Contrast Color Mode Tabs */}
      <div className={`color-mode-nav ${isRgbDisabled ? 'three-col' : ''}`}>
        <button
          type="button"
          className={`color-mode-tab ${primaryMode === 'mono' ? 'active' : ''}`}
          onClick={() => handleSelectPrimaryMode('mono')}
          title="Monochrome — Single phosphor tint"
        >
          MONO
        </button>
        <button
          type="button"
          className={`color-mode-tab ${primaryMode === 'ntone' ? 'active' : ''}`}
          onClick={() => handleSelectPrimaryMode('ntone')}
          title="N-Tone Ramp — Custom multi-color gradient ramp (2 to 256 levels)"
        >
          N-TONE
        </button>
        <button
          type="button"
          className={`color-mode-tab ${primaryMode === 'indexed' ? 'active' : ''}`}
          onClick={() => handleSelectPrimaryMode('indexed')}
          title="Palettes — Built-in retro, hardware and design palettes"
        >
          PALETTES
        </button>
        {!isRgbDisabled && (
          <button
            type="button"
            className={`color-mode-tab ${primaryMode === 'content' ? 'active' : ''}`}
            onClick={() => handleSelectPrimaryMode('content')}
            title="True RGB — Original source content colors"
          >
            RGB
          </button>
        )}
      </div>

      {/* 2. Mode-Specific Sub-Controls */}
      {/* MONOCHROME TINT */}
      {primaryMode === 'mono' && (
        <div style={{ marginTop: '8px' }}>
          <div className="control-row">
            <span className="control-label" style={{ fontSize: '11px', fontWeight: 800 }}>
              {isPixelMode ? 'Foreground Tint' : 'Phosphor Tint'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <DeferredColorInput
                value={tintColor}
                fallback={DEFAULT_PHOSPHOR_TINT}
                hexFieldWidth="84px"
                title="Pick the monochrome tint"
                onChange={(c) => onChangeCustomColor?.(c)}
              />
              {tintColor.toLowerCase() !== DEFAULT_PHOSPHOR_TINT.toLowerCase() && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => onChangeCustomColor?.(DEFAULT_PHOSPHOR_TINT)}
                  style={{ fontSize: '9px', padding: '3px 6px' }}
                  title={`Reset to default green (${DEFAULT_PHOSPHOR_TINT})`}
                >
                  RESET
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INDEXED PALETTES */}
      {primaryMode === 'indexed' && (
        <div style={{ marginTop: '8px' }}>
          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            {['all', 'retro', 'print', 'design', 'custom'].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`quantize-chip ${selectedCategory === cat ? 'active' : ''}`}
                style={{ fontSize: '9.5px', padding: '3px 7px' }}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Palette Selector Dropdown */}
          <div className="control-row" style={{ marginBottom: '8px' }}>
            <span className="control-label" style={{ fontSize: '11px', fontWeight: 800 }}>
              Preset Palette
            </span>
            <select
              className="number-input"
              style={{ width: '160px', textAlign: 'left', padding: '4px 6px', fontSize: '11px' }}
              value={activePaletteId}
              onChange={(e) => {
                const base = mediaColorConfig || FALLBACK_COLOR_CONFIG;
                onChangeMediaColorConfig?.({ ...base, paletteMode: 'indexed', mode: 'fixed', activePaletteId: e.target.value });
              }}
            >
              {filteredPalettes.map((pal) => (
                <option key={pal.id} value={pal.id}>
                  {pal.name} ({pal.colors.length}c)
                </option>
              ))}
            </select>
          </div>

          {/* Palette Colors Swatches Preview */}
          {activePalette && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '8px',
                padding: '6px 8px',
                background: 'var(--bg-control)',
                borderRadius: '3px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', gap: '2.5px', flexWrap: 'wrap', maxWidth: '200px' }}>
                {activePalette.colors.map((c, i) => (
                  <div
                    key={i}
                    title={c}
                    style={{
                      width: '14px',
                      height: '18px',
                      borderRadius: '1px',
                      background: c,
                      border: '1px solid rgba(0,0,0,0.45)',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {activePalette.colors.length} COLORS
              </span>
            </div>
          )}

          {/* Palette Match Mode */}
          {activePalette && onChangeMediaColorConfig && (
            <div className="control-row" style={{ marginTop: '8px' }}>
              <span className="control-label" style={{ fontSize: '11px', fontWeight: 800 }} title={paletteMatchHint}>
                Palette Match
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {PALETTE_MATCH_OPTIONS.map((opt) => {
                  const isDisabled = opt.id !== 'ramp' && !canHueMatch;
                  return (
                    <button
                      key={opt.id}
                      className={`btn btn-sm ${paletteMatch === opt.id ? 'btn-primary' : ''}`}
                      style={{
                        padding: '3px 8px',
                        fontSize: '9.5px',
                        opacity: isDisabled ? 0.4 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                      }}
                      disabled={isDisabled}
                      title={isDisabled ? paletteMatchHint : opt.title}
                      onClick={() =>
                        onChangeMediaColorConfig({
                          ...(mediaColorConfig || FALLBACK_COLOR_CONFIG),
                          paletteMatch: opt.id,
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRUE CONTENT RGB */}
      {primaryMode === 'content' && onChangeMediaColorConfig && (
        <div className="control-row" style={{ marginTop: '8px' }}>
          <span className="control-label" style={{ fontSize: '11px', fontWeight: 800 }}>
            Content Saturation
          </span>
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
