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
import { DeferredColorInput, PrecisionSlider } from './controlPrimitives';
import { QuantizeLevelsControl } from './ImageAdjustControls';
import { paletteIsMonochrome } from '../engine/rasterEngine';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

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
   * Vector output never quantizes -- it leaves the pipeline before step 3.5 --
   * so Quantize Depth is hidden rather than shown wired to nothing. The value
   * itself is left in state, so switching back to a cell mode restores it.
   */
  isVectorMode?: boolean;
  /**
   * Turn the selected palette into an editable N-tone ramp.
   */
  onEditPaletteAsRamp?: () => void;
  /**
   * Optional custom N-Tone ramp editor rendered when N-TONE tab is active.
   */
  rampEditorSlot?: React.ReactNode;
  /**
   * Quantize depth (colorLevels), rendered in MONO and RGB modes.
   */
  colorLevels?: number;
  onChangeColorLevels?: (val: number) => void;
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
  tonalMapping = 'ntone',
  onChangeTonalMapping,
  isPixelMode = false,
  isVectorMode = false,
  onEditPaletteAsRamp,
  rampEditorSlot,
  colorLevels = 0,
  onChangeColorLevels,
}) => {
  /*
   * RGB is the one colour mode with no vector meaning. Every other mode picks
   * the beam colour from the mean luminance of a run, which a polyline has;
   * RGB would have to average source RGB *along* the run, which is the one
   * thing that would make the tracer read the RGBA buffer as well as the
   * luminance — and a deflection beam in true source colour is a muddy look
   * besides. rasterEngine resolves it to the mono tint, so leaving the tab up
   * offers a mode that silently does something else. See vector-pipeline.md 8.
   */
  const isRgbDisabled = appMode === 'synth' || isVectorMode;
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
  /*
   * Hue matching needs per-cell RGB to compare against, and a beam has no
   * cells — its colour is a property of the whole run. The vector branch tone
   * matches unconditionally, so offering the choice would be offering a
   * setting that does nothing.
   */
  const canHueMatch = appMode !== 'synth' && !isVectorMode && !isMonoPalette;
  const paletteMatchHint = isMonoPalette
    ? 'This palette is a single-hue ramp, so there is no colour to match against.'
    : isVectorMode
      ? 'A beam has no cells to match per-pixel colour against, so the palette is driven as a tone ramp from the mean luminance of each run.'
      : appMode === 'synth'
        ? 'Synth output is luminance-only, so the palette can only be driven as a tone ramp.'
        : 'How the palette is matched to the source.';

  const primaryMode: 'ntone' | 'indexed' | 'mono' | 'content' =
    paletteMode === 'content'
      ? 'content'
      : paletteMode === 'indexed'
      ? 'indexed'
      : tonalMapping === '1color'
      ? 'mono'
      : 'ntone';

  const handleSelectPrimaryMode = (mode: 'ntone' | 'indexed' | 'mono' | 'content') => {
    const base = mediaColorConfig || FALLBACK_COLOR_CONFIG;
    if (mode === 'ntone') {
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
    } else if (mode === 'mono') {
      onChangeTonalMapping?.('1color');
      onChangeMediaColorConfig?.({ ...base, paletteMode: 'phosphor', mode: 'fixed' });
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
    <div className="palette-controls-container">
      {/* 1. Color Mode Segmented Navigation Tabs: N-TONE -> PALETTES -> MONO -> RGB */}
      <div className={`color-mode-nav ${isRgbDisabled ? 'three-col' : ''}`}>
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
        <button
          type="button"
          className={`color-mode-tab ${primaryMode === 'mono' ? 'active' : ''}`}
          onClick={() => handleSelectPrimaryMode('mono')}
          title="Monochrome — Single phosphor tint"
        >
          MONO
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
      {/* N-TONE RAMP EDITOR */}
      {primaryMode === 'ntone' && (
        <div className="palette-subpanel">
          {rampEditorSlot}
        </div>
      )}

      {/* INDEXED PALETTES */}
      {primaryMode === 'indexed' && (
        <div className="palette-subpanel" ref={dropdownRef}>
          <div className="control-row" style={{ marginBottom: '6px' }}>
            <span className="control-label">Preset Palette</span>
          </div>

          {/* Interactive Nuancier Dropdown Trigger */}
          <button
            type="button"
            className={`palette-dropdown-btn ${isDropdownOpen ? 'active' : ''}`}
            onClick={() => setIsDropdownOpen((v) => !v)}
            title="Click to select from full palettes library"
          >
            <div className="palette-dropdown-btn-left">
              {/* Swatches Ramp */}
              <div className="palette-swatches-bar">
                {activePalette.colors.slice(0, 16).map((c, i) => (
                  <div
                    key={i}
                    className="palette-swatch-cell"
                    style={{
                      background: c,
                      width: activePalette.colors.length > 8 ? '8px' : '12px',
                    }}
                  />
                ))}
              </div>
              <span className="palette-dropdown-btn-title">
                {activePalette.name}
              </span>
            </div>

            <div className="palette-dropdown-btn-right">
              <span className="palette-count-badge">
                {activePalette.colors.length}c
              </span>
              {isDropdownOpen ? (
                <ChevronUp size={13} className="palette-chevron" />
              ) : (
                <ChevronDown size={13} className="palette-chevron" />
              )}
            </div>
          </button>

          {/* Full Categories & Swatches Nuancier Dropdown Popover */}
          {isDropdownOpen && (
            <div className="palette-dropdown-menu">
              {groupedPalettes.map((grp) => (
                <div key={grp.category} className="palette-dropdown-group">
                  <div className="palette-group-header">
                    {grp.label}
                  </div>
                  <div className="palette-group-list">
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
                        >
                          <div className="palette-row-left">
                            <div className="palette-swatches-bar">
                              {pal.colors.slice(0, 12).map((c, i) => (
                                <div
                                  key={i}
                                  className="palette-swatch-cell"
                                  style={{ background: c }}
                                />
                              ))}
                              {pal.colors.length > 12 && (
                                <span className="palette-swatch-overflow">+</span>
                              )}
                            </div>
                            <span className="palette-row-title">
                              {pal.name}
                            </span>
                          </div>

                          <div className="palette-row-right">
                            <span className="palette-count-badge">
                              {pal.colors.length}c
                            </span>
                            {isSelected && <Check size={11} className="palette-check-icon" />}
                          </div>
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
              <div className="btn-group-inline">
                {PALETTE_MATCH_OPTIONS.map((opt) => {
                  const isDisabled = opt.id !== 'ramp' && !canHueMatch;
                  return (
                    <button
                      key={opt.id}
                      className={`btn btn-sm ${paletteMatch === opt.id ? 'btn-primary' : ''}`}
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

          {/* Hand the selected palette to the N-Tone ramp editor */}
          {activePalette && onEditPaletteAsRamp && (
            <div className="palette-action-card">
              <span className="palette-action-text">
                Copy these {activePalette.colors.length} colors into the N-Tone ramp editor as customizable stops.
              </span>
              <button
                type="button"
                className="btn btn-sm btn-block"
                onClick={onEditPaletteAsRamp}
                title="Load this palette into the N-Tone Ramp Editor as editable stops"
              >
                <Copy size={11} className="header-btn-icon" />
                EDIT IN RAMP EDITOR
              </button>
            </div>
          )}
        </div>
      )}

      {/* MONOCHROME TINT */}
      {primaryMode === 'mono' && (
        <div className="palette-subpanel">
          <div className="control-row">
            <span className="control-label">
              {isPixelMode ? 'Foreground Tint' : 'Phosphor Tint'}
            </span>
            <div className="btn-group-inline">
              <DeferredColorInput
                value={tintColor}
                fallback={DEFAULT_PHOSPHOR_TINT}
                hexFieldWidth="78px"
                title="Pick the monochrome tint"
                onChange={(c) => onChangeCustomColor?.(c)}
              />
              {tintColor.toLowerCase() !== DEFAULT_PHOSPHOR_TINT.toLowerCase() && (
                <button
                  type="button"
                  className="btn-reset"
                  onClick={() => {
                    onChangeTheme?.('monochrome');
                    onChangeCustomColor?.(DEFAULT_PHOSPHOR_TINT);
                  }}
                  title={`Reset to default white (${DEFAULT_PHOSPHOR_TINT})`}
                >
                  RESET
                </button>
              )}
            </div>
          </div>

          {onChangeColorLevels && !isVectorMode && (
            <QuantizeLevelsControl
              value={colorLevels}
              onChange={onChangeColorLevels}
            />
          )}
        </div>
      )}

      {/* TRUE CONTENT RGB */}
      {primaryMode === 'content' && onChangeMediaColorConfig && (
        <div className="palette-subpanel">
          <div className="control-row">
            <span className="control-label">Saturation</span>
            <PrecisionSlider
              value={mediaColorConfig?.saturation ?? 200}
              sliderMin={0}
              sliderMax={400}
              step={1}
              resetTo={200}
              onChange={(val) =>
                onChangeMediaColorConfig({
                  ...(mediaColorConfig || FALLBACK_COLOR_CONFIG),
                  saturation: Math.max(0, Math.min(400, Math.round(val))),
                })
              }
            />
          </div>

          {onChangeColorLevels && !isVectorMode && (
            <QuantizeLevelsControl
              value={colorLevels}
              onChange={onChangeColorLevels}
            />
          )}
        </div>
      )}
    </div>
  );
};
