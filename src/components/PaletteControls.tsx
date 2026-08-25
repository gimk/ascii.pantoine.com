import React, { useMemo } from 'react';
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
  /** Tonal half of the unified colour selector; lives in the adjust config. */
  tonalMapping?: TonalMappingType;
  onChangeTonalMapping?: (t: TonalMappingType) => void;
  isPixelMode?: boolean;
}

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
  const paletteMatch: PaletteMatchMode = mediaColorConfig?.paletteMatch || 'auto';
  /*
   * The resolved tint. customThemeColor is the source of truth now that the
   * presets are gone; currentTheme survives only as the fallback for state
   * saved before that change (and for share links).
   */
  const tintColor = resolvePhosphorTint(currentTheme, customThemeColor);
  /*
   * A single-hue palette carries no colour to match against, so the engine
   * forces the ramp for it. Reuse the engine's own test rather than a second
   * heuristic here, so the buttons cannot offer a silent no-op.
   */
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
          {/*
            Monochrome is a single tint over the source's own luminance, not a
            mapping onto colour stops, so it belongs with the sources rather
            than beside duotone and tritone. Unlike Content Color it needs no
            per-cell RGB, so it is offered in synth too.
          */}
          <optgroup label="Source">
            <option value="1color">Monochrome</option>
            {!isRgbDisabled && <option value="content">Content Color (True RGB)</option>}
          </optgroup>
          <optgroup label="Tonal Mapping">
            <option value="2color">2 Colors (Duotone)</option>
            <option value="3color">3 Colors (Tritone)</option>
          </optgroup>
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

      {/*
        1. Monochrome tint. The six hardcoded phosphor presets are gone: they
        were a parallel colour vocabulary that behaved unlike every other
        colour control in the sidebar. The tint is now just a colour, picked
        the same way the duotone and tritone stops are.
      */}
      {paletteMode === 'phosphor' && tonalMapping === '1color' && (
        <div style={{ marginTop: '8px' }}>
          <div className="control-row">
            <span className="control-label">{isPixelMode ? 'Foreground Tint' : 'Tint'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DeferredColorInput
                value={tintColor}
                fallback={DEFAULT_PHOSPHOR_TINT}
                title="Pick the monochrome tint"
                onChange={(c) => onChangeCustomColor?.(c)}
              />
              {/*
                No CLEAR: with the presets gone an empty custom colour falls
                back to a theme the sidebar no longer exposes, so clearing
                would look like a no-op. RESET restores the default tint
                explicitly instead.
              */}
              {tintColor.toLowerCase() !== DEFAULT_PHOSPHOR_TINT.toLowerCase() && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => onChangeCustomColor?.(DEFAULT_PHOSPHOR_TINT)}
                  style={{ fontSize: '8.5px', padding: '2px 5px' }}
                  title={`Reset to ${DEFAULT_PHOSPHOR_TINT}`}
                >
                  RESET
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

      {/* 2b. How that palette is matched to the source. */}
      {paletteMode === 'indexed' && activePalette && onChangeMediaColorConfig && (
        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label" title={paletteMatchHint}>
            Palette Match
          </span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {PALETTE_MATCH_OPTIONS.map((opt) => {
              const isDisabled = opt.id !== 'ramp' && !canHueMatch;
              return (
                <button
                  key={opt.id}
                  className={`btn btn-sm ${paletteMatch === opt.id ? 'btn-primary' : ''}`}
                  style={{
                    padding: '2px 7px',
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
