import React, { useMemo, useState, useRef, useEffect } from 'react';
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
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  /**
   * Turn the selected palette into an editable N-tone ramp.
   *
   * Supplied by the host because the conversion writes to two configs at once
   * -- palette mode off, ramp stops on -- and only the host holds both. Omit it
   * and the action does not appear, which is how BASIC keeps its own wording
   * for the same operation next to the tonal bands.
   */
  onEditPaletteAsRamp?: () => void;
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

const PALETTE_CATEGORIES: { id: string; label: string }[] = [
  { id: 'retro', label: 'Retro Computing & Hardware' },
  { id: 'print', label: 'Risograph & Screenprint' },
  { id: 'design', label: 'Design & Modern Aesthetics' },
  { id: 'ramp', label: 'Tone Ramps' },
  { id: 'custom', label: 'Custom Palettes' },
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
  onEditPaletteAsRamp,
}) => {
  const isRgbDisabled = appMode === 'synth';
  const rawPaletteMode: PaletteMode = mediaColorConfig?.paletteMode || 'phosphor';
  const paletteMode: PaletteMode = rawPaletteMode === 'content' && isRgbDisabled ? 'phosphor' : rawPaletteMode;
  const activePaletteId = mediaColorConfig?.activePaletteId || 'gameboy-classic';
  const activePalette = BUILTIN_PALETTES.find((p) => p.id === activePaletteId) || BUILTIN_PALETTES[0];
  const paletteMatch: PaletteMatchMode = mediaColorConfig?.paletteMatch || 'auto';

  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

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

  const groupedPalettes = useMemo(() => {
    const groups: { category: string; label: string; palettes: typeof BUILTIN_PALETTES }[] = [];
    PALETTE_CATEGORIES.forEach((cat) => {
      const pals = BUILTIN_PALETTES.filter((p) => p.category === cat.id);
      if (pals.length > 0) {
        groups.push({ category: cat.id, label: cat.label, palettes: pals });
      }
    });
    const handled = new Set(PALETTE_CATEGORIES.map((c) => c.id));
    const remaining = BUILTIN_PALETTES.filter((p) => p.category && !handled.has(p.category));
    if (remaining.length > 0) {
      groups.push({ category: 'other', label: 'Other Palettes', palettes: remaining });
    }
    return groups;
  }, []);

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
            <span className="control-label">
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
                  style={{ fontSize: '10px', padding: '3px 6px' }}
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
        <div style={{ marginTop: '8px' }} ref={dropdownRef}>
          <div className="control-row" style={{ marginBottom: '6px' }}>
            <span className="control-label">
              Preset Palette
            </span>
          </div>

          {/* Interactive Nuancier Dropdown Trigger */}
          <button
            type="button"
            className="palette-row-btn"
            onClick={() => setIsDropdownOpen((v) => !v)}
            title="Click to open full palettes nuancier"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '6px 9px',
              background: isDropdownOpen ? 'var(--bg-control-hover)' : 'var(--bg-control)',
              border: `1px solid ${isDropdownOpen ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '3px',
              boxShadow: isDropdownOpen ? '0 0 8px var(--accent-glow)' : 'none',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
              {/* Swatches Ramp */}
              <div style={{ display: 'flex', gap: '2px', flexWrap: 'nowrap', alignItems: 'center', flexShrink: 0 }}>
                {activePalette.colors.slice(0, 16).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: activePalette.colors.length > 8 ? '9px' : '13px',
                      height: '18px',
                      borderRadius: '1px',
                      background: c,
                      border: '1px solid rgba(0,0,0,0.4)',
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activePalette.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                {activePalette.colors.length}c
              </span>
              {isDropdownOpen ? <ChevronUp size={13} color="var(--accent)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
            </div>
          </button>

          {/* Full Categories & Swatches Nuancier Dropdown Popover */}
          {isDropdownOpen && (
            <div
              className="palette-dropdown-menu"
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--accent)',
                background: 'var(--bg-panel)',
                borderRadius: '3px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.65), 0 0 12px var(--accent-glow)',
                marginBottom: '10px',
                padding: '5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {groupedPalettes.map((grp) => (
                <div key={grp.category}>
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      padding: '4px 6px 3px',
                      background: 'var(--bg-primary)',
                      borderBottom: '1px solid var(--border-color)',
                      marginBottom: '3px',
                      borderRadius: '2px',
                    }}
                  >
                    {grp.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {grp.palettes.map((pal) => {
                      const isSelected = pal.id === activePaletteId;
                      return (
                        <button
                          key={pal.id}
                          type="button"
                          className={`palette-row-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            const base = mediaColorConfig || FALLBACK_COLOR_CONFIG;
                            onChangeMediaColorConfig?.({
                              ...base,
                              paletteMode: 'indexed',
                              mode: 'fixed',
                              activePaletteId: pal.id,
                            });
                            setIsDropdownOpen(false);
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            padding: '5px 7px',
                            borderRadius: '2px',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                            {/* Swatches preview */}
                            <div style={{ display: 'flex', gap: '1.5px', flexShrink: 0, alignItems: 'center' }}>
                              {pal.colors.slice(0, 12).map((c, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: '8px',
                                    height: '14px',
                                    borderRadius: '1px',
                                    background: c,
                                    border: '1px solid rgba(0,0,0,0.4)',
                                  }}
                                />
                              ))}
                              {pal.colors.length > 12 && (
                                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, paddingLeft: '1px' }}>+</span>
                              )}
                            </div>
                            <span
                              className="palette-row-title"
                              style={{
                                fontSize: '11px',
                                fontWeight: isSelected ? 700 : 500,
                                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {pal.name}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              color: isSelected ? 'var(--accent)' : 'var(--text-dim)',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {pal.colors.length}c {isSelected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Palette Match Mode */}
          {activePalette && onChangeMediaColorConfig && (
            <div className="control-row" style={{ marginTop: '8px' }}>
              <span className="control-label" title={paletteMatchHint}>
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
                        fontSize: '10px',
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

          {/*
           * Hand the selected palette to the N-Tone ramp editor.
           *
           * A palette is a preset ramp -- that is why the ramp editor no longer
           * carries a preset list of its own. What differs is the render path,
           * not the colours: indexed error-diffuses in palette space against
           * the palette's real luminances, while a ramp buckets warped
           * luminance into evenly quantized stops. Indexed is usually the
           * better picture, so this is a button rather than something that
           * happens on its own.
           */}
          {activePalette && onEditPaletteAsRamp && (
            <div className="panel-note" style={{ marginTop: '8px' }}>
              <span>
                Copy these {activePalette.colors.length} colours into the N-Tone
                ramp below, where each one gets an editable tonal band. Leaves
                palette matching behind.
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={onEditPaletteAsRamp}
                title="Load this palette into the N-Tone Ramp Editor as editable stops"
              >
                EDIT IN RAMP EDITOR
              </button>
            </div>
          )}
        </div>
      )}

      {/* TRUE CONTENT RGB */}
      {primaryMode === 'content' && onChangeMediaColorConfig && (
        <div className="control-row" style={{ marginTop: '8px' }}>
          <span className="control-label">
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
