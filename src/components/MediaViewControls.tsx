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
import { DEFAULT_PHOSPHOR_TINT, BUILTIN_PALETTES } from '../engine/palettes';
import { DITHER_ALGORITHMS } from '../engine/ditherAlgorithms';
import { PaletteControls } from './PaletteControls';
import {
  ImageAdjustControls,
  BackgroundRow,
  applyToneStops,
  DEFAULT_STOP_WEIGHT,
  resolveToneStops,
} from './ImageAdjustControls';
import { NToneRampEditor } from './NToneRampEditor';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
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
          DITHER_ALGORITHMS.find((a) => a.id === (config.algorithm || 'floyd-steinberg'))?.name ||
          'Floyd-Steinberg'
        }
        persistKey="MediaViewControls-render-settings"
        onReset={resetRenderSettings}
        resetTitle="Reset dither algorithm and resampling filter"
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
            style={{ width: '165px', textAlign: 'left', padding: '2px 6px', fontSize: '11px', height: '24px' }}
            value={config.resampling || 'preserve-details'}
            onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
          >
            <option value="preserve-details">Preserve Details</option>
            <option value="nearest">Nearest (Pixel Art)</option>
            <option value="bilinear">Bilinear Smooth</option>
          </select>
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
        mediaColorConfig={mediaColorConfig}
        paletteSlot={
          onChangeTheme ? (
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
                      /*
                       * Palette off and ramp on, in that order but as two
                       * writes to two different configs -- the render reads
                       * both, and leaving indexed set would keep the palette
                       * winning over the stops just copied out of it.
                       */
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
              onChange={(bg) => onChangeConfig({ ...config, background: bg })}
            />
          </div>
        }
      />
    </div>
  );
};
