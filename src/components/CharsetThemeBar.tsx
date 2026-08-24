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
import { HalftoneControls } from './HalftoneControls';
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
          <HalftoneControls
            config={halftoneConfig}
            onChangeConfig={onChangeHalftoneConfig}
            rasterMode={rasterMode}
          />
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

