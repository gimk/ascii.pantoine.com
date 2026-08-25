import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  MediaViewConfig,
  ImageAdjustConfig,
  PhosphorTheme,
  MediaColorConfig,
  ToneMappingConfig,
  AppMode,
  ResamplingMode,
  RasterOutputMode,
} from '../types/ascii';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
import { DEFAULT_MEDIA_COLOR_CONFIG } from '../types/ascii';
import { DEFAULT_PHOSPHOR_TINT } from '../engine/palettes';
import { PaletteControls } from './PaletteControls';
import { ImageAdjustControls } from './ImageAdjustControls';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { ShaderPresetControls } from './ShaderPresetControls';
import { ShaderPreset } from '../engine/shaderPresets';
import { Settings } from 'lucide-react';

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
  currentTheme?: PhosphorTheme;
  onChangeTheme?: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  appMode?: AppMode;
  /**
   * Resolved raster mode. Passed in rather than read off config: media stores
   * it in two places and config.rasterMode is frequently undefined.
   */
  rasterMode?: RasterOutputMode;

  /*
   * Levels state and its histogram, forwarded straight to ImageAdjustControls.
   * Media's grading otherwise lives in `config` (MediaViewConfig), but levels
   * is the one part that does not: it sits in the mode's toneConfig, which the
   * host owns. See pipeline.md §4.
   */
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (next: ToneMappingConfig) => void;
  histogram?: Uint32Array | null;
  histogramOpaque?: number;
}

export const MediaViewControls: React.FC<MediaViewControlsProps> = ({
  config,
  onChangeConfig,
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  appMode = 'media',
  rasterMode,
  toneConfig,
  onChangeToneConfig,
  histogram = null,
  histogramOpaque = 0,
}) => {
  const isPixelMode = (rasterMode || config.rasterMode) === 'pixel';

  /* Invert lives in the effect controls now, so RESET EFFECTS owns it. */
  const resetRenderSettings = () => {
    onChangeConfig({
      ...config,
      resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
      algorithm: DEFAULT_MEDIA_VIEW_CONFIG.algorithm,
    });
  };
  /*
   * The colour state the adjust config cannot reach. Clearing the tint too,
   * because with the phosphor presets gone customThemeColor is what actually
   * decides the monochrome colour.
   */
  const resetPalette = () => {
    onChangeMediaColorConfig?.({
      ...(mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG),
      paletteMode: DEFAULT_MEDIA_COLOR_CONFIG.paletteMode,
      mode: DEFAULT_MEDIA_COLOR_CONFIG.mode,
      activePaletteId: DEFAULT_MEDIA_COLOR_CONFIG.activePaletteId,
      paletteMatch: DEFAULT_MEDIA_COLOR_CONFIG.paletteMatch,
    });
    onChangeCustomColor?.(DEFAULT_PHOSPHOR_TINT);
  };


  /*
   * Applying a preset writes its complete field set in one update, so no
   * setting from the previous look survives. A preset that names a tint also
   * clears the legacy theme, since customThemeColor is what actually wins.
   */
  const applyShaderPreset = (preset: ShaderPreset) => {
    onChangeConfig({ ...config, ...preset.config });
    if (preset.tint && onChangeCustomColor) {
      onChangeCustomColor(preset.tint);
    }
  };

  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  return (
    <div className="tab-content">
      {/*
        0. SHADER PRESETS -- pick the look, then refine it below.
        Pixel output only: most of what a preset sets is a dither screen and a
        set of colour stops, and in ASCII output the glyph ramp carries the tone
        instead, so the looks mostly collapse into one another.
      */}
      {isPixelMode && (
        <ShaderPresetControls current={config} onApply={applyShaderPreset} />
      )}

      {/* 1. RENDER SETTINGS */}
      <CollapsibleSection
        title="RENDER SETTINGS"
        icon={<Settings size={12} />}
        persistKey="MediaViewControls-render-settings"
        defaultOpen={true}
      >
        {/* Dither Algorithm Selector with Rapid Stepper & Category Filter */}
        <DitherAlgorithmPicker
          value={config.algorithm || 'floyd-steinberg'}
          onChange={(algo) => update('algorithm', algo)}
        />

        {/* Resampling Filter */}
        <div className="control-row" style={{ marginTop: '8px' }}>
          <span className="control-label">Resampling</span>
          <select
            className="number-input"
            style={{ width: '150px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.resampling || 'preserve-details'}
            onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
          >
            <option value="preserve-details">Preserve Details</option>
            <option value="nearest">Nearest (Pixel Art)</option>
            <option value="bilinear">Bilinear Smooth</option>
          </select>
        </div>

        <div className="collapsible-actions">
          <button
            className="btn btn-sm"
            onClick={resetRenderSettings}
            title="Reset dither algorithm and resampling filter"
          >
            RESET RENDER
          </button>
        </div>
      </CollapsibleSection>

      <ImageAdjustControls
        config={config}
        onChangeConfig={(next: ImageAdjustConfig) => onChangeConfig({ ...config, ...next })}
        resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
        showAlphaCutoff={config.background === 'transparent'}
        showInvert
        onResetPalette={resetPalette}
        toneConfig={toneConfig}
        onChangeToneConfig={onChangeToneConfig}
        histogram={histogram}
        histogramOpaque={histogramOpaque}
        paletteSlot={
          onChangeTheme ? (
            <div>
              {/* No subheading: the COLORS panel title already says this. */}
              <PaletteControls
                currentTheme={currentTheme || 'green'}
                onChangeTheme={onChangeTheme}
                customThemeColor={customThemeColor}
                onChangeCustomColor={onChangeCustomColor}
                mediaColorConfig={mediaColorConfig}
                onChangeMediaColorConfig={onChangeMediaColorConfig}
                appMode={appMode}
                tonalMapping={config.tonalMapping}
                onChangeTonalMapping={(t) => onChangeConfig({ ...config, tonalMapping: t })}
                isPixelMode={isPixelMode}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
};
