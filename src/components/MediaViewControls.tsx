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
  VECTOR_CONFIG_DEFAULTS,
} from '../types/ascii';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
import { DEFAULT_MEDIA_COLOR_CONFIG } from '../types/ascii';
import { DEFAULT_PHOSPHOR_TINT, BUILTIN_PALETTES } from '../engine/palettes';
import { DITHER_ALGORITHMS } from '../engine/ditherAlgorithms';
import { PaletteControls } from './PaletteControls';
import {
  ColorAdjustControls,
  BackgroundRow,
  applyToneStops,
  DEFAULT_STOP_WEIGHT,
  resolveToneStops,
} from './ImageAdjustControls';
import { NToneRampEditor } from './NToneRampEditor';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { VectorControls } from './VectorControls';
import { Settings } from 'lucide-react';

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (config: MediaViewConfig) => void;
  currentTheme?: PhosphorTheme;
  onChangeTheme?: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (config: MediaColorConfig) => void;
  appMode?: AppMode;
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
  const effectiveRasterMode = rasterMode || config.rasterMode;
  const isPixelMode = effectiveRasterMode === 'pixel';
  const isVector = effectiveRasterMode === 'vector';

  const resetRenderSettings = () => {
    onChangeConfig({
      ...config,
      algorithm: DEFAULT_MEDIA_VIEW_CONFIG.algorithm,
      ditherParams: undefined,
      vectorConfig: undefined,
      resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
    });
  };

  const resetPalette = () => {
    if (onChangeMediaColorConfig) {
      onChangeMediaColorConfig({
        ...DEFAULT_MEDIA_COLOR_CONFIG,
      });
    }
    if (onChangeTheme) {
      onChangeTheme('monochrome');
    }
    if (onChangeCustomColor) {
      onChangeCustomColor(DEFAULT_PHOSPHOR_TINT);
    }
  };

  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const { colors: rampColors, weights: rampWeights } = resolveToneStops(config);

  return (
    <div className="tab-content">
      {/* 1. RENDER SETTINGS */}
      <CollapsibleSection
        title="RENDER SETTINGS"
        icon={<Settings size={12} />}
        badge={
          isVector
            ? 'Beam Deflection'
            : DITHER_ALGORITHMS.find((a) => a.id === (config.algorithm || 'floyd-steinberg'))?.name ||
              'Floyd-Steinberg'
        }
        persistKey="MediaViewControls-render-settings"
        onReset={resetRenderSettings}
        resetTitle={
          isVector
            ? 'Reset resampling filter and every beam parameter'
            : 'Reset resampling filter and dither algorithm'
        }
      >
        {/* Resampling */}
        <div className="render-settings-source">
          <div className="control-row">
            <span
              className="control-label"
              title="Filter the source is downsampled with on its way into the grid, before any dithering or deflection."
            >
              Resampling
            </span>
            <select
              className="number-input stepper-select"
              value={config.resampling || 'preserve-details'}
              onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
            >
              <option value="preserve-details">Preserve Details</option>
              <option value="nearest">Nearest (Pixel Art)</option>
              <option value="bilinear">Bilinear Smooth</option>
            </select>
          </div>
        </div>

        {/* Dither or Vector */}
        {isVector ? (
          <VectorControls
            config={config.vectorConfig || VECTOR_CONFIG_DEFAULTS}
            onChange={(next) => update('vectorConfig', next)}
          />
        ) : (
          <DitherAlgorithmPicker
            value={config.algorithm || 'floyd-steinberg'}
            onChange={(algo) => update('algorithm', algo)}
            params={config.ditherParams}
            onChangeParams={(next) => update('ditherParams', next)}
          />
        )}
      </CollapsibleSection>

      {/* 2. COLORS */}
      <ColorAdjustControls
        config={config}
        onChangeConfig={(next: ImageAdjustConfig) => onChangeConfig({ ...config, ...next })}
        resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
        onResetPalette={resetPalette}
        mediaColorConfig={mediaColorConfig}
        appMode={appMode}
        isVectorMode={isVector}
        paletteSlot={
          onChangeTheme ? (
            <PaletteControls
              currentTheme={currentTheme || 'monochrome'}
              onChangeTheme={onChangeTheme}
              customThemeColor={customThemeColor}
              onChangeCustomColor={onChangeCustomColor}
              mediaColorConfig={mediaColorConfig}
              onChangeMediaColorConfig={onChangeMediaColorConfig}
              appMode={appMode}
              tonalMapping={config.tonalMapping}
              onChangeTonalMapping={(t) => onChangeConfig({ ...config, tonalMapping: t })}
              isPixelMode={isPixelMode || isVector}
              isVectorMode={isVector}
              colorLevels={config.colorLevels}
              onChangeColorLevels={(val) => update('colorLevels', val)}
              rampEditorSlot={
                <NToneRampEditor
                  stops={rampColors}
                  weights={rampWeights}
                  onChangeRamp={(stops, nextWeights) =>
                    onChangeConfig({
                      ...config,
                      ...applyToneStops(config, stops),
                      toneStopWeights: nextWeights,
                    })
                  }
                />
              }
              onEditPaletteAsRamp={
                mediaColorConfig?.paletteMode === 'indexed' && onChangeMediaColorConfig
                  ? () => {
                      const pal = BUILTIN_PALETTES.find(
                        (p) => p.id === mediaColorConfig.activePaletteId
                      );
                      if (!pal || pal.colors.length < 2) return;
                      const stops = [...pal.colors];
                      onChangeMediaColorConfig({
                        ...mediaColorConfig,
                        paletteMode: 'phosphor',
                        mode: 'fixed',
                      });
                      onChangeConfig({
                        ...config,
                        ...applyToneStops(config, stops),
                        toneStopWeights: stops.map(() => DEFAULT_STOP_WEIGHT),
                        tonalMapping: 'ntone',
                      });
                    }
                  : undefined
              }
            />
          ) : null
        }
        backgroundSlot={
          <div className="color-backdrop-section">
            <BackgroundRow
              value={config.background}
              onChange={(bg) => update('background', bg)}
            />
          </div>
        }
      />
    </div>
  );
};
