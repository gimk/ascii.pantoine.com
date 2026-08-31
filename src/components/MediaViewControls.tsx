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
import { PrintPressAndInksControls, PrintSettingsControls } from './PrintControls';
import { defaultPrintConfig, PRINT_CONFIG_DEFAULTS } from '../engine/printInks';
import { CharsetThemeBar } from './CharsetThemeBar';
import { CHARSETS } from '../engine/renderer';
import { Settings, Palette, Sliders, Activity } from 'lucide-react';
import { PrintTier } from '../types/ascii';

const DEFAULT_DENSITY_CHARS = CHARSETS[0].chars;

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
  /** Replace the ink stack from a palette. Print mode only. */
  onSeedInksFromPalette?: (colors: string[]) => void;
  printSlot?: React.ReactNode;
  printBadge?: string;
  cols?: number;
  rows?: number;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  density?: string;
  onChangeDensity?: (density: string) => void;
  onRenderProof?: () => void;
  proofProgress?: string | null;
  printTier?: { tier: PrintTier; supersample: number } | null;
  proofEstimateMs?: number;
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
  onSeedInksFromPalette,
  printSlot,
  cols = 80,
  rows = 40,
  mediaElement,
  density,
  onChangeDensity,
  onRenderProof,
  proofProgress,
  printTier,
  proofEstimateMs,
}) => {
  const effectiveRasterMode = rasterMode || config.rasterMode;
  const isAscii = effectiveRasterMode === 'ascii';
  const isPixel = effectiveRasterMode === 'pixel';
  const isVector = effectiveRasterMode === 'vector';
  const isPrint = effectiveRasterMode === 'print';

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

  const activePrintConfig = config.printConfig || PRINT_CONFIG_DEFAULTS;

  // ---------------------------------------------------------------------------
  // Reusable Sub-Components
  // ---------------------------------------------------------------------------

  const renderDitherAlgorithmSection = (defaultAlgo: string) => (
    <CollapsibleSection
      title="DITHERING ALGORITHM"
      icon={<Settings size={12} />}
      badge={
        DITHER_ALGORITHMS.find((a) => a.id === (config.algorithm || defaultAlgo))?.name ||
        (defaultAlgo === 'none' ? 'Threshold (None)' : 'Floyd-Steinberg')
      }
      persistKey={`MediaViewControls-dither-${effectiveRasterMode}`}
      onReset={() => {
        onChangeConfig({
          ...config,
          algorithm: defaultAlgo as any,
          ditherParams: undefined,
          resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
        });
      }}
      resetTitle={`Reset dither algorithm to default and resampling filter`}
    >
      <div className="render-settings-source">
        <div className="control-row">
          <span
            className="control-label"
            title="Filter the source is downsampled with on its way into the grid, before any dithering."
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

      <DitherAlgorithmPicker
        value={config.algorithm || (defaultAlgo as any)}
        onChange={(algo) => update('algorithm', algo)}
        params={config.ditherParams}
        onChangeParams={(next) => update('ditherParams', next)}
      />
    </CollapsibleSection>
  );

  const renderColorsSection = () => (
    <ColorAdjustControls
      config={config}
      onChangeConfig={(next: ImageAdjustConfig) => onChangeConfig({ ...config, ...next })}
      resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
      onResetPalette={resetPalette}
      mediaColorConfig={mediaColorConfig}
      appMode={appMode}
      isVectorMode={isVector}
      isPrintMode={isPrint}
      printBadge={config.printConfig ? `${config.printConfig.inks.length} INKS` : undefined}
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
            isPixelMode={isPixel || isVector}
            isVectorMode={isVector}
            isPrintMode={isPrint}
            printConfig={config.printConfig}
            onChangePrintConfig={(p) => update('printConfig', p)}
            cols={cols}
            rows={rows}
            mediaElement={mediaElement}
            onSeedInksFromPalette={onSeedInksFromPalette}
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
        !isPrint ? (
          <div className="color-backdrop-section">
            <BackgroundRow
              value={config.background}
              onChange={(bg) => update('background', bg)}
            />
          </div>
        ) : null
      }
    />
  );

  // ---------------------------------------------------------------------------
  // 1. ASCII MODE: 1. Character Ramp -> 2. Colors -> 3. Dithering Algorithm
  // ---------------------------------------------------------------------------
  if (isAscii) {
    return (
      <div className="tab-content">
        {/* 1. CHARACTER DENSITY RAMP */}
        <CharsetThemeBar
          currentCharset={density || DEFAULT_DENSITY_CHARS}
          onChangeCharset={onChangeDensity || (() => {})}
          appMode={appMode}
        />

        {/* 2. COLORS (includes PaletteControls + BackgroundRow inside) */}
        {renderColorsSection()}

        {/* 3. DITHERING ALGORITHM (Default: Threshold none) */}
        {renderDitherAlgorithmSection('none')}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. PIXEL MODE: 1. Dithering Algorithm -> 2. Colors
  // ---------------------------------------------------------------------------
  if (isPixel) {
    return (
      <div className="tab-content">
        {/* 1. DITHERING ALGORITHM (Default: Floyd-Steinberg) */}
        {renderDitherAlgorithmSection('floyd-steinberg')}

        {/* 2. COLORS (includes PaletteControls + BackgroundRow inside) */}
        {renderColorsSection()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. VECTOR MODE: 1. Beam Settings -> 2. Colors
  // ---------------------------------------------------------------------------
  if (isVector) {
    const vc = config.vectorConfig || VECTOR_CONFIG_DEFAULTS;
    const waveBadge = `${(vc.direction || 'vertical').toUpperCase()} · ${vc.lineCount || 60} LINES`;

    return (
      <div className="tab-content">
        {/* 1. BEAM SETTINGS */}
        <CollapsibleSection
          title="BEAM SETTINGS"
          icon={<Activity size={12} />}
          badge={waveBadge}
          persistKey="MediaViewControls-vector-beam-settings"
          onReset={() => update('vectorConfig', VECTOR_CONFIG_DEFAULTS)}
          resetTitle="Reset all beam deflection parameters to defaults"
        >
          <div className="render-settings-source">
            <div className="control-row">
              <span
                className="control-label"
                title="Filter the source is downsampled with on its way into the grid, before beam deflection."
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

          <VectorControls
            config={config.vectorConfig || VECTOR_CONFIG_DEFAULTS}
            onChange={(next) => update('vectorConfig', next)}
          />
        </CollapsibleSection>

        {/* 2. COLORS (includes PaletteControls + BackgroundRow inside) */}
        {renderColorsSection()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. PRINT MODE: 1. Press and Inks -> 2. Press Settings & Proof
  // ---------------------------------------------------------------------------
  if (isPrint) {
    const pressName = activePrintConfig.press.toUpperCase();
    const inkCount = activePrintConfig.inks.length;
    const pressBadge = `${pressName} · ${inkCount} INK${inkCount === 1 ? '' : 'S'}`;
    const proofBadge = `TAC ${activePrintConfig.tacLimit}% · YN ${activePrintConfig.yuleNielsen.toFixed(1)}`;

    return (
      <div className="tab-content">
        {/* 1. PRESS AND INKS (First position!) */}
        <CollapsibleSection
          title="PRESS AND INKS"
          icon={<Palette size={12} />}
          badge={pressBadge}
          persistKey="MediaViewControls-print-press-and-inks"
          onReset={() => {
            const def = defaultPrintConfig();
            onChangeConfig({
              ...config,
              resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
              printConfig: {
                ...activePrintConfig,
                press: def.press,
                paper: def.paper,
                inks: def.inks,
                inkPurity: def.inkPurity,
                grainInterlock: def.grainInterlock,
              },
            });
          }}
          resetTitle="Reset press profile, paper stock, ink stack, and separation settings"
        >
          {/* Resampling lives in whichever panel comes first for a mode. Print
              still downsamples the source into the contone grid before the
              separation, so the filter matters here exactly as it does for a
              cell mode — it is the last thing that touches the image as a
              photograph rather than as coverage. */}
          <div className="render-settings-source">
            <div className="control-row">
              <span
                className="control-label"
                title="Filter the source is downsampled with on its way into the grid, before separation and screening."
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

          <PrintPressAndInksControls
            config={activePrintConfig}
            onChange={(next) => update('printConfig', next)}
            cols={cols}
            rows={rows}
            mediaElement={mediaElement}
            onSeedInksFromPalette={onSeedInksFromPalette}
          />
        </CollapsibleSection>

        {/* 2. PRESS SETTINGS & PROOF */}
        <CollapsibleSection
          title="PRESS SETTINGS & PROOF"
          icon={<Sliders size={12} />}
          badge={proofBadge}
          persistKey="MediaViewControls-print-press-settings"
          onReset={() => {
            update('printConfig', {
              ...activePrintConfig,
              tacLimit: 260,
              yuleNielsen: 2.2,
              supersample: 4,
              proofSupersample: 8,
            });
          }}
          resetTitle="Reset TAC limit, optical gain, and supersample proof multipliers"
        >
          {printSlot || (
            <PrintSettingsControls
              config={activePrintConfig}
              onChange={(next) => update('printConfig', next)}
              cols={cols}
              rows={rows}
              onRenderProof={onRenderProof}
              proofProgress={proofProgress}
              tier={printTier}
              proofEstimateMs={proofEstimateMs}
            />
          )}
        </CollapsibleSection>
      </div>
    );
  }

  return null;
};
