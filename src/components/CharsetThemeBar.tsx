import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';

import { CHARSETS } from '../engine/renderer';
import {
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  MediaColorConfig,
  AppMode,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
} from '../types/ascii';

import { RasterModeSelector } from './RasterModeSelector';
import { DitherControls } from './DitherControls';
import { PaletteControls } from './PaletteControls';
import { ToneControls } from './ToneControls';
import { Sparkles, Sliders, Zap, Type, CircleDot } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  gradientConfig?: PhosphorGradient | null;
  onChangeGradient?: (grad: PhosphorGradient | null) => void;
  crtConfig?: CrtConfig;
  onChangeCrtConfig?: (cfg: CrtConfig) => void;
  appMode?: AppMode;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  rasterMode?: RasterOutputMode;
  onChangeRasterMode?: (mode: RasterOutputMode) => void;
  ditherAlgorithm?: DitherAlgorithm;
  onChangeDitherAlgorithm?: (algo: DitherAlgorithm) => void;
  noise?: number;
  onChangeNoise?: (noise: number) => void;
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (cfg: ToneMappingConfig) => void;
  halftoneConfig?: HalftoneConfig;
  onChangeHalftoneConfig?: (cfg: HalftoneConfig) => void;
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
  gradientConfig = null,
  onChangeGradient,
  appMode = 'synth',
  mediaColorConfig = DEFAULT_MEDIA_COLOR_CONFIG,
  onChangeMediaColorConfig,
  rasterMode = 'ascii',
  onChangeRasterMode,
  ditherAlgorithm = 'floyd-steinberg',
  onChangeDitherAlgorithm,
  noise = 0,
  onChangeNoise,
  toneConfig,
  onChangeToneConfig,
  halftoneConfig,
  onChangeHalftoneConfig,
}) => {
  const isContentColorActive = appMode === 'media' && mediaColorConfig.mode === 'content';

  const activeCharsetName = CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom';
  const activeColorName = isContentColorActive
    ? 'From Content'
    : gradientConfig
      ? gradientConfig.name || 'Custom Gradient'
      : customThemeColor
        ? 'Custom Colour'
        : THEMES.find((t) => t.id === currentTheme)?.name || '';



  return (

    <div className="tab-content">
      {/* 1. Output Modality Selector */}
      {onChangeRasterMode && (
        <RasterModeSelector
          currentMode={rasterMode || 'ascii'}
          onChangeMode={onChangeRasterMode}
        />
      )}

      {/* 2. Dithering Engine Section (40+ Algorithms) */}
      {ditherAlgorithm && onChangeDitherAlgorithm && (
        <CollapsibleSection
          title="Dithering Algorithms (40+)"
          icon={<Sliders size={12} />}
          persistKey="CharsetThemeBar-dither"
          badge={ditherAlgorithm.toUpperCase()}
        >
          <DitherControls
            algorithm={ditherAlgorithm}
            onChangeAlgorithm={onChangeDitherAlgorithm}
            noise={noise}
            onChangeNoise={onChangeNoise}
          />
        </CollapsibleSection>
      )}

      {/* 3. Color, Themes & Palettes Section */}
      <CollapsibleSection
        title="Color Palettes & Themes"
        icon={<Sparkles size={12} />}
        persistKey="CharsetThemeBar-color"
        badge={activeColorName}
      >
        <PaletteControls
          currentTheme={currentTheme}
          onChangeTheme={onChangeTheme}
          customThemeColor={customThemeColor}
          onChangeCustomColor={onChangeCustomColor}
          gradientConfig={gradientConfig}
          onChangeGradient={onChangeGradient}
          mediaColorConfig={mediaColorConfig}
          onChangeMediaColorConfig={onChangeMediaColorConfig}
          appMode={appMode}
        />

      </CollapsibleSection>


      {/* 4. Tone Mapping & Bit Depth */}
      {toneConfig && onChangeToneConfig && (
        <CollapsibleSection
          title="Tone Mapping & Bit Depth"
          icon={<Zap size={12} />}
          persistKey="CharsetThemeBar-tone"
          badge={toneConfig.posterizeBits > 0 ? `${toneConfig.posterizeBits}-BIT` : '8-BIT'}
        >
          <ToneControls
            config={toneConfig}
            onChangeConfig={onChangeToneConfig}
          />
        </CollapsibleSection>
      )}

      {/* 5. Halftone Screen Configuration */}
      {rasterMode && rasterMode.startsWith('halftone-') && halftoneConfig && onChangeHalftoneConfig && (
        <CollapsibleSection
          title="Halftone Screen Geometry"
          icon={<CircleDot size={12} />}
          persistKey="CharsetThemeBar-halftone"
          badge={(halftoneConfig.dotShape || 'circle').toUpperCase()}
        >
          {rasterMode === 'halftone-dot' && (
            <div className="control-row" style={{ marginBottom: '8px' }}>
              <span className="control-label">Dot Shape</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['circle', 'square', 'diamond'] as const).map((shape) => (
                  <button
                    key={shape}
                    className={`segmented-btn ${halftoneConfig.dotShape === shape || (!halftoneConfig.dotShape && shape === 'circle') ? 'active' : ''}`}
                    onClick={() => onChangeHalftoneConfig({ ...halftoneConfig, dotShape: shape })}
                    style={{ fontSize: '9px', padding: '3px 6px', textTransform: 'capitalize' }}
                  >
                    {shape}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="control-row">
            <span className="control-label">Dot Scale</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.05"
                value={halftoneConfig.dotScale ?? 1.0}
                onChange={(e) => onChangeHalftoneConfig({ ...halftoneConfig, dotScale: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '10px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {(halftoneConfig.dotScale ?? 1.0).toFixed(2)}x
              </span>
            </div>
          </div>

          {(rasterMode === 'halftone-line' || rasterMode === 'halftone-crosshatch') && (
            <div className="control-row">
              <span className="control-label">Screen Angle</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
                <input
                  type="range"
                  min="0"
                  max="180"
                  step="5"
                  value={halftoneConfig.lineAngle ?? 45}
                  onChange={(e) => onChangeHalftoneConfig({ ...halftoneConfig, lineAngle: parseInt(e.target.value, 10) })}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '10px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {halftoneConfig.lineAngle ?? 45}°
                </span>
              </div>
            </div>
          )}

          {/* Cell Ratio & Presets */}
          <div className="control-row" style={{ marginTop: '4px' }}>
            <span className="control-label">Cell Ratio</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {[
                { label: '1:1', ratio: 1.0 },
                { label: '0.6', ratio: 0.6 },
                { label: '4:3', ratio: 0.75 },
                { label: '16:9', ratio: 0.5625 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`chip-btn ${Math.abs((halftoneConfig.cellRatio ?? 1.0) - preset.ratio) < 0.02 ? 'active' : ''}`}
                  style={{
                    fontSize: '9px',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    background: Math.abs((halftoneConfig.cellRatio ?? 1.0) - preset.ratio) < 0.02 ? 'var(--accent)' : 'var(--bg-control)',
                    color: Math.abs((halftoneConfig.cellRatio ?? 1.0) - preset.ratio) < 0.02 ? '#000' : 'var(--text-muted)',
                    fontWeight: Math.abs((halftoneConfig.cellRatio ?? 1.0) - preset.ratio) < 0.02 ? 700 : 500,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => onChangeHalftoneConfig({ ...halftoneConfig, cellRatio: preset.ratio })}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <span className="control-label">Dot Pitch</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
              <input
                type="range"
                min="4"
                max="24"
                step="1"
                value={halftoneConfig.dotPitch ?? 8}
                onChange={(e) => onChangeHalftoneConfig({ ...halftoneConfig, dotPitch: parseInt(e.target.value, 10) || 8 })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '10px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {halftoneConfig.dotPitch ?? 8}px
              </span>
            </div>
          </div>
        </CollapsibleSection>
      )}



      {/* 6. Character Density Ramp (Visible in ASCII mode) */}
      {(!rasterMode || rasterMode === 'ascii') && (

        <CollapsibleSection
          title="Character Density Ramp"
          icon={<Type size={12} />}
          persistKey="CharsetThemeBar-character-density-presets"
          badge={activeCharsetName}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {CHARSETS.map((cs) => {
              const isSelected = currentCharset === cs.chars;
              return (
                <button
                  key={cs.id}
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
            className="number-input"
            style={{ width: '100%', textAlign: 'left', padding: '4px 6px', fontSize: '10.5px' }}
            value={currentCharset}
            onChange={(e) => onChangeCharset(e.target.value || ' ')}
            placeholder="e.g.  .:-=+*#%@"
          />
        </CollapsibleSection>
      )}
    </div>
  );
};

