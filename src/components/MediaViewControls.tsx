import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  MediaViewConfig,
  ImageAdjustConfig,
  PhosphorTheme,
  MediaColorConfig,
  AppMode,
  ResamplingMode,
  RasterOutputMode,
} from '../types/ascii';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
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
        paletteSlot={
          onChangeTheme ? (
            <div>
              <div className="tonal-subheading">
                <span>Color &amp; Tonal Palette</span>
              </div>
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
