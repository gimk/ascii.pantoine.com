import React, { useMemo, useState } from 'react';
import {
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  ChevronLeft,
  ChevronRight,
  Dices,
} from 'lucide-react';
import {
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  ToneMappingConfig,
  PhosphorTheme,
  RasterOutputMode,
  ImageAdjustConfig,
  VECTOR_CONFIG_DEFAULTS,
} from '../types/ascii';
import { MediaUploadControls } from './MediaFileControls';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { VectorControls } from './VectorControls';
import { PaletteControls } from './PaletteControls';
import { NToneRampEditor } from './NToneRampEditor';
import { CHARSETS } from '../engine/renderer';
import { clampGridToBudget } from '../engine/mediaPresets';
import {
  AdjustSlider,
  applyToneStops,
  resolveToneStops,
  DEFAULT_STOP_WEIGHT,
  BackgroundRow,
  SimpleLevelsSlider,
} from './ImageAdjustControls';
import { BUILTIN_PALETTES } from '../engine/palettes';
import { ExportTab } from './ExportModal';

/** Monospace cells are taller than wide, so an ASCII grid needs fewer rows. */
const ASCII_CELL_ASPECT = 0.55;

/** Resolution presets: DPI for Pixel mode, Columns for ASCII mode */
const DPI_PRESETS: { label: string; value: number }[] = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '72', value: 72 },
  { label: '100', value: 100 },
  { label: '150', value: 150 },
  { label: '200', value: 200 },
];

const COLS_PRESETS: { label: string; value: number }[] = [
  { label: '60', value: 60 },
  { label: '80', value: 80 },
  { label: '100', value: 100 },
  { label: '140', value: 140 },
  { label: '180', value: 180 },
  { label: '240', value: 240 },
];

/** Numbered step header, matching the sidebar workflow titles. */
const Step: React.FC<{ n: string; label: string }> = ({ n, label }) => (
  <div className="sidebar-workflow-title">
    <span className="sidebar-workflow-step">{n}</span>
    <span className="sidebar-workflow-label">{label}</span>
    <div className="sidebar-workflow-line" />
  </div>
);

interface BasicPanelProps {
  mediaConfig: MediaConfig;
  onChangeMediaConfig: (cfg: MediaConfig) => void;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  onFileUpload: (file: File) => void;
  onUrlLoad: (url: string) => void;

  viewConfig: MediaViewConfig;
  onChangeViewConfig: (cfg: MediaViewConfig) => void;

  rasterMode: RasterOutputMode;
  onChangeRasterMode: (mode: RasterOutputMode) => void;

  cols: number;
  rows: number;
  onChangeResolution: (cols: number, rows: number) => void;

  density: string;
  onChangeDensity: (charset: string) => void;

  theme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor: string;
  onChangeCustomColor: (color: string) => void;
  mediaColorConfig: MediaColorConfig;
  onChangeMediaColorConfig: (cfg: MediaColorConfig) => void;

  toneConfig: ToneMappingConfig;
  onChangeToneConfig: (next: ToneMappingConfig) => void;

  onExport: (tab: ExportTab) => void;
}

/**
 * The BASIC sidebar: one flat walkthrough from a file import to an export,
 * following the exact design system and unified color controls of Advanced mode.
 */
export const BasicPanel: React.FC<BasicPanelProps> = ({
  mediaConfig,
  onChangeMediaConfig,
  mediaElement,
  onFileUpload,
  onUrlLoad,
  viewConfig,
  onChangeViewConfig,
  rasterMode,
  onChangeRasterMode,
  cols,
  rows,
  onChangeResolution,
  density,
  onChangeDensity,
  theme,
  onChangeTheme,
  customThemeColor,
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  toneConfig,
  onChangeToneConfig,
  onExport,
}) => {
  const isPixel = rasterMode === 'pixel';
  const isVector = rasterMode === 'vector';
  /* Only ASCII uses a glyph ramp; the other two label their step differently. */
  const isAscii = rasterMode === 'ascii';
  const hasSource = Boolean(mediaConfig.fileData);

  /* Source dimensions, needed to turn a DPI percentage into a grid size. */
  const { srcWidth, srcHeight } = useMemo(() => {
    let w = 0;
    let h = 0;
    if (mediaElement instanceof HTMLImageElement) {
      w = mediaElement.naturalWidth || mediaElement.width;
      h = mediaElement.naturalHeight || mediaElement.height;
    } else if (mediaElement instanceof HTMLVideoElement) {
      w = mediaElement.videoWidth || mediaElement.width;
      h = mediaElement.videoHeight || mediaElement.height;
    } else if (mediaElement instanceof HTMLCanvasElement) {
      w = mediaElement.width;
      h = mediaElement.height;
    }
    return { srcWidth: w, srcHeight: h };
  }, [mediaElement]);

  const srcAspect = srcWidth > 0 && srcHeight > 0 ? srcWidth / srcHeight : 1;
  const dpi = viewConfig.dpi ?? 72;

  const updateView = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeViewConfig({ ...viewConfig, [key]: val });
  };

  const updateAdjust = (next: ImageAdjustConfig) => {
    onChangeViewConfig({ ...viewConfig, ...next });
  };

  const handleDpiChange = (newDpi: number) => {
    const clamped = Math.max(10, Math.min(300, Math.round(newDpi)));
    updateView('dpi', clamped);
    if (srcWidth > 0 && srcHeight > 0) {
      const scale = clamped / 100;
      const grid = clampGridToBudget(
        Math.max(10, Math.round(srcWidth * scale)),
        Math.max(10, Math.round(srcHeight * scale))
      );
      onChangeResolution(grid.cols, grid.rows);
    }
  };

  const handleColsChange = (newCols: number) => {
    const clamped = Math.max(20, Math.min(400, Math.round(newCols)));
    const nextRows = Math.max(10, Math.round((clamped * ASCII_CELL_ASPECT) / srcAspect));
    onChangeResolution(clamped, nextRows);
  };

  const rotateBy = (deg: number) => {
    let next = (mediaConfig.rotation + deg) % 360;
    if (next < 0) next += 360;
    onChangeMediaConfig({ ...mediaConfig, rotation: next });
  };

  const [isCharsetRolling, setIsCharsetRolling] = useState(false);

  const activeCharsetId =
    CHARSETS.find((cs) => cs.chars === density)?.id ?? '__custom__';

  const currentCharsetIdx = useMemo(() => {
    const idx = CHARSETS.findIndex((cs) => cs.chars === density);
    return idx >= 0 ? idx : 0;
  }, [density]);

  const handleStepCharset = (dir: -1 | 1) => {
    const total = CHARSETS.length;
    const nextIdx = (currentCharsetIdx + dir + total) % total;
    onChangeDensity(CHARSETS[nextIdx].chars);
  };

  const handleRandomizeCharset = () => {
    setIsCharsetRolling(true);
    setTimeout(() => setIsCharsetRolling(false), 450);
    const pool = CHARSETS.filter((_, i) => i !== currentCharsetIdx);
    const pick = pool[Math.floor(Math.random() * pool.length)] || CHARSETS[0];
    onChangeDensity(pick.chars);
  };

  const { colors: rampColors, weights: rampWeights } = resolveToneStops(viewConfig);

  const handleEditPaletteAsRamp = () => {
    const pal = BUILTIN_PALETTES.find((p) => p.id === mediaColorConfig.activePaletteId);
    if (!pal || pal.colors.length < 2) return;
    const stops = [...pal.colors];
    onChangeMediaColorConfig({
      ...mediaColorConfig,
      paletteMode: 'phosphor',
      mode: 'fixed',
    });
    updateAdjust({
      ...viewConfig,
      ...applyToneStops(viewConfig, stops),
      toneStopWeights: stops.map(() => DEFAULT_STOP_WEIGHT),
      tonalMapping: 'ntone',
    });
  };

  return (
    <div className="basic-panel">
      {/* ================================================================ */}
      <Step n="01" label="Import" />
      <div className="basic-section">
        <MediaUploadControls
          config={mediaConfig}
          onChangeConfig={onChangeMediaConfig}
          mediaElement={mediaElement}
          onFileUpload={onFileUpload}
          onUrlLoad={onUrlLoad}
          minimal
        />

        {hasSource && (
          <div className="basic-framing">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => rotateBy(-90)}
              title="Rotate 90 degrees counter-clockwise"
            >
              <RotateCcw size={12} />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => rotateBy(90)}
              title="Rotate 90 degrees clockwise"
            >
              <RotateCw size={12} />
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mediaConfig.flipX ? 'active' : ''}`}
              onClick={() => onChangeMediaConfig({ ...mediaConfig, flipX: !mediaConfig.flipX })}
              title="Flip horizontally"
            >
              <FlipHorizontal size={12} />
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mediaConfig.flipY ? 'active' : ''}`}
              onClick={() => onChangeMediaConfig({ ...mediaConfig, flipY: !mediaConfig.flipY })}
              title="Flip vertically"
            >
              <FlipVertical size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      <Step n="02" label="Output" />
      <div className="basic-section">
        <div className="basic-output-toggle">
          <button
            type="button"
            className={`color-mode-tab ${isPixel ? 'active' : ''}`}
            onClick={() => onChangeRasterMode('pixel')}
            title="1:1 square pixel dither"
          >
            PIXEL
          </button>
          <button
            type="button"
            className={`color-mode-tab ${isAscii ? 'active' : ''}`}
            onClick={() => onChangeRasterMode('ascii')}
            title="Monospace character density ramp"
          >
            ASCII
          </button>
          <button
            type="button"
            className={`color-mode-tab ${isVector ? 'active' : ''}`}
            onClick={() => onChangeRasterMode('vector')}
            title="Rutt-Etra beam deflection, drawn as polylines"
          >
            VECTOR
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      <Step n="03" label="Dither" />
      <div className="basic-section">
        {/* 1. Resolution / Grid Density */}
        <div className="tonal-subheading" style={{ marginTop: 0 }}>
          <span>{isPixel ? 'Resolution (DPI)' : 'Grid Size (Columns)'}</span>
          <span className="control-static-value">
            {cols} &times; {rows} {isPixel ? 'px' : 'chars'}
          </span>
        </div>

        <div className="basic-chip-row" style={{ marginBottom: '4px' }}>
          {(isPixel ? DPI_PRESETS : COLS_PRESETS).map((preset) => {
            const isActive = isPixel ? dpi === preset.value : cols === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                className={`quantize-chip ${isActive ? 'active' : ''}`}
                onClick={() =>
                  isPixel ? handleDpiChange(preset.value) : handleColsChange(preset.value)
                }
                title={isPixel ? `${preset.value} DPI` : `${preset.value} columns wide`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* 2. Dithering Algorithm & Character Set */}
        <div className="tonal-subheading" style={{ marginTop: '2px' }}>
          <span>{isVector ? 'Beam Deflection' : isPixel ? 'Dither Pattern' : 'Dither & Glyphs'}</span>
        </div>

        {isVector ? (
          <VectorControls
            config={viewConfig.vectorConfig || VECTOR_CONFIG_DEFAULTS}
            onChange={(next) => updateView('vectorConfig', next)}
          />
        ) : (
          <DitherAlgorithmPicker
            value={viewConfig.algorithm || 'floyd-steinberg'}
            onChange={(algo) => updateView('algorithm', algo)}
            compact
          />
        )}

        {isAscii && (
          <div className="control-row" style={{ alignItems: 'center' }}>
            <span className="control-label" style={{ flexShrink: 0 }}>
              Charset
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              {/* Previous */}
              <button
                type="button"
                className="slider-nudge-btn"
                onClick={() => handleStepCharset(-1)}
                title="Previous charset (wraps around)"
                style={{ width: '24px', height: '24px', padding: 0 }}
              >
                <ChevronLeft size={13} />
              </button>

              {/* Select Dropdown */}
              <select
                className="number-input"
                style={{
                  width: '165px',
                  textAlign: 'left',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  height: '24px',
                }}
                value={activeCharsetId}
                onChange={(e) => {
                  const cs = CHARSETS.find((c) => c.id === e.target.value);
                  if (cs) onChangeDensity(cs.chars);
                }}
              >
                {CHARSETS.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))}
                {activeCharsetId === '__custom__' && (
                  <option value="__custom__">Custom (set in Advanced)</option>
                )}
              </select>

              {/* Next */}
              <button
                type="button"
                className="slider-nudge-btn"
                onClick={() => handleStepCharset(1)}
                title="Next charset (wraps around)"
                style={{ width: '24px', height: '24px', padding: 0 }}
              >
                <ChevronRight size={13} />
              </button>

              {/* Surprise Me / Randomizer Button */}
              <button
                type="button"
                className="slider-nudge-btn"
                onClick={handleRandomizeCharset}
                title="Surprise Me: pick a random charset"
                style={{
                  width: '24px',
                  height: '24px',
                  padding: 0,
                  color: 'var(--accent)',
                }}
              >
                <Dices
                  size={13}
                  style={{
                    transform: isCharsetRolling ? 'rotate(360deg)' : 'none',
                    transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      <Step n="04" label="Adjust" />
      <div className="basic-section">
        <SimpleLevelsSlider
          config={toneConfig}
          onChangeConfig={onChangeToneConfig}
        />

        <div className="tonal-subheading" style={{ marginTop: '4px' }}>
          <span>Detail &amp; Filtering</span>
        </div>
        <AdjustSlider id="sharpenStrength" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="sharpenRadius" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="denoise" config={viewConfig} onChangeConfig={updateAdjust} />
      </div>

      {/* ================================================================ */}
      <Step n="05" label="Color" />
      <div className="basic-section">
        <PaletteControls
          currentTheme={theme}
          onChangeTheme={onChangeTheme}
          customThemeColor={customThemeColor}
          onChangeCustomColor={onChangeCustomColor}
          mediaColorConfig={mediaColorConfig}
          onChangeMediaColorConfig={onChangeMediaColorConfig}
          appMode="media"
          tonalMapping={viewConfig.tonalMapping}
          onChangeTonalMapping={(t) => updateView('tonalMapping', t)}
          isPixelMode={isPixel}
          isVectorMode={isVector}
          colorLevels={viewConfig.colorLevels}
          onChangeColorLevels={(val) => updateView('colorLevels', val)}
          rampEditorSlot={
            <NToneRampEditor
              stops={rampColors}
              weights={rampWeights}
              onChangeRamp={(stops, nextWeights) =>
                updateAdjust({
                  ...viewConfig,
                  ...applyToneStops(viewConfig, stops),
                  toneStopWeights: nextWeights,
                })
              }
            />
          }
          onEditPaletteAsRamp={
            mediaColorConfig.paletteMode === 'indexed' ? handleEditPaletteAsRamp : undefined
          }
        />

        <div className="color-backdrop-section" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
          <BackgroundRow
            value={viewConfig.background}
            onChange={(bg) => updateView('background', bg)}
          />
        </div>
      </div>

      {/* ================================================================ */}
      <Step n="06" label="Export" />
      <div className="basic-section">
        <button
          type="button"
          className="btn basic-export-primary"
          onClick={() => onExport('image')}
          disabled={!hasSource}
          title={hasSource ? 'Export as PNG, JPG or SVG' : 'Import a file first'}
        >
          <Download size={15} />
          <span>EXPORT IMAGE</span>
        </button>
        <div className="basic-export-secondary">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onExport('gif')}
            disabled={!hasSource}
            title="Export an animated GIF"
          >
            GIF
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onExport('video')}
            disabled={!hasSource}
            title="Export a video file"
          >
            VIDEO
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onExport('separation')}
            disabled={!hasSource}
            title="Export one image per colour plate"
          >
            PLATES
          </button>
        </div>
      </div>
    </div>
  );
};
