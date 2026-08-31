import React, { useMemo, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Scissors,
  RefreshCw,
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
  PostProcessConfig,
  VECTOR_CONFIG_DEFAULTS,
  PrintConfig,
  PrintTier,
} from '../types/ascii';
import { MediaUploadControls } from './MediaFileControls';
import { cropActive, measureFramedMedia } from '../engine/mediaRenderer';
import { OutputModeCards } from './outputModes';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { VectorControls } from './VectorControls';
import { PrintControls } from './PrintControls';
import { PaletteControls } from './PaletteControls';
import { NToneRampEditor } from './NToneRampEditor';
import { CHARSETS } from '../engine/renderer';
import { clampGridToBudget, MAX_GRID_COLS } from '../engine/mediaPresets';
import {
  AdjustSlider,
  applyToneStops,
  resolveToneStops,
  DEFAULT_STOP_WEIGHT,
  BackgroundRow,
  SimpleLevelsSlider,
} from './ImageAdjustControls';
import { BUILTIN_PALETTES } from '../engine/palettes';
import {
  PrecisionSlider,
  BlendModePicker,
  AutoResToggle,
  ToggleSwitch,
} from './controlPrimitives';

/** Monospace cells are taller than wide, so an ASCII grid needs fewer rows. */
const ASCII_CELL_ASPECT = 0.55;

/**
 * Vector shares pixel’s square cells: a polyline is geometry, not a glyph.
 *
 * Applying the monospace correction to it squashed the render to 55% height,
 * which is the same mistake `autoSetMediaResolution` documents avoiding on the
 * automatic path.
 */
const cellAspectFor = (mode: RasterOutputMode) => (mode === 'ascii' ? ASCII_CELL_ASPECT : 1.0);

/**
 * Print's contone grid, and the tightest range of the four.
 *
 * Deliberately far below vector's, for the opposite reason: this grid is
 * subdivided into `supersample` device pixels before anything is painted, so
 * every column costs S^2 pixels to screen. Detail comes from the ruling and the
 * screen resolution, not from here, and coverage is smooth by construction
 * anyway — it comes out of a separation table.
 */
const PRINT_COLS_PRESETS: { label: string; value: number }[] = [
  { label: '180', value: 180 },
  { label: '240', value: 240 },
  { label: '320', value: 320 },
  { label: '420', value: 420 },
  { label: '560', value: 560 },
  { label: '720', value: 720 },
];

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

/**
 * Vector runs an order of magnitude wider, because the grid stopped being a
 * display raster and became the beam’s *sampling* raster.
 *
 * Nothing downstream quantizes to it, so there are no visible cells to keep
 * legible and no reason to stay near 100 — what a coarse grid costs instead is
 * a visibly faceted deflection curve. 800 is the centre because it is what
 * `autoSetMediaResolution` picks on its own, matching the studio’s
 * `min(800, source.width)` working buffer.
 */
const VECTOR_COLS_PRESETS: { label: string; value: number }[] = [
  { label: '300', value: 300 },
  { label: '400', value: 400 },
  { label: '600', value: 600 },
  { label: '800', value: 800 },
  { label: '1200', value: 1200 },
  { label: '1600', value: 1600 },
];

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
  /**
   * Whether the grid is being solved rather than set.
   *
   * BASIC needs this as much as ADVANCED does now that auto-res is on by
   * default: without it the resolution chips would be quietly overruled with
   * nothing on screen saying so.
   */
  autoRes?: boolean;
  onToggleAutoRes?: () => void;

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

  postProcess: PostProcessConfig;
  onChangePostProcess: (next: PostProcessConfig) => void;
  /** Opens the crop marquee on the viewport. */
  onEnterCrop?: () => void;
  /** Fit, zoom, pan, rotation, flips and crop back to neutral. */
  onResetFraming?: () => void;
  /** True while the marquee is open, so the button can show it. */
  cropEditing?: boolean;

  /*
   * Print. Passed in rather than defaulted here because App owns the ink stack:
   * BASIC and ADVANCED must edit the same one, or switching panels would look
   * like losing your inks.
   */
  printConfigFallback: PrintConfig;
  onRenderProof?: () => void;
  proofProgress?: string | null;
  printTier?: { tier: PrintTier; supersample: number } | null;
  /** Replace the ink stack from a palette. Print mode only. */
  onSeedInksFromPalette?: (colors: string[]) => void;
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
  autoRes = false,
  onToggleAutoRes,
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
  postProcess,
  onChangePostProcess,
  onEnterCrop,
  onResetFraming,
  cropEditing = false,
  printConfigFallback,
  onRenderProof,
  proofProgress,
  printTier,
  onSeedInksFromPalette,
}) => {
  const isPixel = rasterMode === 'pixel';
  const isVector = rasterMode === 'vector';
  const isPrint = rasterMode === 'print';
  /* Only ASCII uses a glyph ramp; the other two label their step differently. */
  const isAscii = rasterMode === 'ascii';
  const hasSource = Boolean(mediaConfig.fileData);

  /*
   * Source dimensions *as framed* -- crop applied, rotation's bounding box --
   * because this is what a DPI percentage is turned into a grid against. The
   * intrinsic ones would put a cropped picture back inside the proportions of
   * the frame it was cropped out of.
   */
  const { srcWidth, srcHeight } = useMemo(() => {
    if (!mediaElement) return { srcWidth: 0, srcHeight: 0 };
    const { width, height } = measureFramedMedia(mediaElement, mediaConfig);
    return { srcWidth: Math.round(width), srcHeight: Math.round(height) };
  }, [mediaElement, mediaConfig]);

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

  /*
   * The ceiling is per-mode for the same reason the presets are: 400 columns is
   * already an enormous wall of glyphs and a third of what a beam wants to
   * sample at. Vector and print stop at the shared grid budget instead — one
   * because it samples, the other because its cells are subdivided below the
   * grid rather than displayed at it.
   */
  const handleColsChange = (newCols: number) => {
    const ceiling = isVector || isPrint ? MAX_GRID_COLS : 400;
    const clamped = Math.max(20, Math.min(ceiling, Math.round(newCols)));
    const nextRows = Math.max(10, Math.round((clamped * cellAspectFor(rasterMode)) / srcAspect));
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
      {/* STEP 01 · SOURCE & FRAMING                                      */}
      {/* ================================================================ */}
      <div className="basic-step-card">
        <div className="basic-step-header">
          <span className="basic-step-badge">01</span>
          <span className="basic-step-title">Source &amp; Framing</span>
          {hasSource && <span className="basic-step-tag">LOADED</span>}
        </div>

        <div className="basic-step-body">
          <MediaUploadControls
            config={mediaConfig}
            onChangeConfig={onChangeMediaConfig}
            mediaElement={mediaElement}
            onFileUpload={onFileUpload}
            onUrlLoad={onUrlLoad}
            minimal
          />

          {hasSource && (
            <div className="basic-framing-deck">
              <div className="basic-framing-tier-primary">
                <button
                  type="button"
                  className={`btn btn-sm ${cropEditing ? 'btn-primary' : ''}`}
                  onClick={onEnterCrop}
                  disabled={!onEnterCrop}
                  title={
                    cropEditing
                      ? 'The crop marquee is open on the viewport'
                      : 'Drag a crop rectangle on the viewport'
                  }
                >
                  <Scissors size={13} />
                  <span>
                    {cropEditing ? 'EDITING CROP' : cropActive(mediaConfig.crop) ? 'ADJUST CROP' : 'CROP'}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={onResetFraming}
                  disabled={!onResetFraming}
                  title="Reset fit, zoom, pan, rotation, flips and crop"
                >
                  <RefreshCw size={13} />
                  <span>RESET FRAMING</span>
                </button>
              </div>

              <div className="basic-framing-tier-secondary">
                <button
                  type="button"
                  className="btn-tool"
                  onClick={() => rotateBy(-90)}
                  title="Rotate 90° counter-clockwise"
                >
                  <RotateCcw size={14} />
                  <span>-90°</span>
                </button>

                <button
                  type="button"
                  className="btn-tool"
                  onClick={() => rotateBy(90)}
                  title="Rotate 90° clockwise"
                >
                  <RotateCw size={14} />
                  <span>+90°</span>
                </button>

                <button
                  type="button"
                  className={`btn-tool ${mediaConfig.flipX ? 'active' : ''}`}
                  onClick={() => onChangeMediaConfig({ ...mediaConfig, flipX: !mediaConfig.flipX })}
                  title="Flip horizontally"
                >
                  <FlipHorizontal size={14} />
                  <span>FLIP H</span>
                </button>

                <button
                  type="button"
                  className={`btn-tool ${mediaConfig.flipY ? 'active' : ''}`}
                  onClick={() => onChangeMediaConfig({ ...mediaConfig, flipY: !mediaConfig.flipY })}
                  title="Flip vertically"
                >
                  <FlipVertical size={14} />
                  <span>FLIP V</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 02 · OUTPUT RASTER                                         */}
      {/* ================================================================ */}
      <div className="basic-step-card">
        <div className="basic-step-header">
          <span className="basic-step-badge">02</span>
          <span className="basic-step-title">Output Raster</span>
          <span className="basic-step-tag">{rasterMode.toUpperCase()}</span>
        </div>

        <div className="basic-step-body">
          <OutputModeCards value={rasterMode} onChange={onChangeRasterMode} compact />

          {/* Resolution / Grid Density Header */}
          <div className="basic-sub-header">
            <span
              className="basic-sub-title"
              title={
                isVector
                  ? 'How finely the beam reads the image. Nothing quantizes to this grid, so it is a sampling rate rather than a visible resolution.'
                  : isPrint
                    ? 'Contone resolution: how finely the separation reads colour. The dots live below it, at Screen Res device pixels per cell, so this is not the size of the print.'
                    : undefined
              }
            >
              {isPixel
                ? 'Resolution (DPI)'
                : isVector
                  ? 'Beam Sampling'
                  : isPrint
                    ? 'Contone Grid'
                    : 'Grid Size'}
            </span>

            <span className="basic-sub-actions">
              <span className="control-static-value">
                {cols} &times; {rows} {isPixel ? 'px' : isVector ? 'smp' : isPrint ? 'cells' : 'chars'}
              </span>
              {onToggleAutoRes && (
                <AutoResToggle
                  active={autoRes}
                  onToggle={onToggleAutoRes}
                  noun={isPixel ? 'DPI' : isVector ? 'sampling rate' : isPrint ? 'contone grid' : 'grid'}
                />
              )}
            </span>
          </div>

          {/* 3x2 Grid Resolution Chips */}
          <div className="basic-chip-grid">
            {(isPixel ? DPI_PRESETS : isVector ? VECTOR_COLS_PRESETS : isPrint ? PRINT_COLS_PRESETS : COLS_PRESETS).map((preset) => {
              const isActive = isPixel ? dpi === preset.value : cols === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  className={`basic-preset-chip ${isActive ? 'active' : ''}`}
                  onClick={() =>
                    isPixel ? handleDpiChange(preset.value) : handleColsChange(preset.value)
                  }
                  title={
                    isPixel
                      ? `${preset.value} DPI`
                      : isVector
                        ? `Sample the beam at ${preset.value} columns across`
                        : isPrint
                          ? `Separate colour at ${preset.value} contone cells across`
                          : `${preset.value} columns wide`
                  }
                >
                  <span className="chip-val">{preset.label}</span>
                  <span className="chip-unit">
                    {isPixel ? 'DPI' : isVector ? 'SMP' : isPrint ? 'CTN' : 'COL'}
                  </span>
                </button>
              );
            })}
          </div>

          {isAscii && (
            <div className="basic-control-group" style={{ marginTop: '4px' }}>
              <div className="control-row" style={{ margin: 0 }}>
                <span className="control-label">Character Ramp</span>

                <div className="control-cluster basic-stepper-cluster">
                  <button
                    type="button"
                    className="slider-nudge-btn btn-icon-sq"
                    onClick={() => handleStepCharset(-1)}
                    title="Previous charset (wraps around)"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  <select
                    className="number-input stepper-select"
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

                  <button
                    type="button"
                    className="slider-nudge-btn btn-icon-sq"
                    onClick={() => handleStepCharset(1)}
                    title="Next charset (wraps around)"
                  >
                    <ChevronRight size={14} />
                  </button>

                  <button
                    type="button"
                    className={`slider-nudge-btn btn-icon-sq btn-dice${
                      isCharsetRolling ? ' rolling' : ''
                    }`}
                    onClick={handleRandomizeCharset}
                    title="Surprise Me: pick a random charset"
                  >
                    <Dices size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 03 · AESTHETIC & PALETTE                                   */}
      {/* ================================================================ */}
      <div className="basic-step-card">
        <div className="basic-step-header">
          <span className="basic-step-badge">03</span>
          <span className="basic-step-title">Aesthetic &amp; Palette</span>
        </div>

        <div className="basic-step-body">
          {/* Dithering Algorithm or Beam Controls */}
          <div className="basic-sub-header">
            <span className="basic-sub-title">
              {isPrint
                ? 'Press & Inks'
                : isVector
                  ? 'Beam Deflection'
                  : isPixel
                    ? 'Dither Pattern'
                    : 'Dithering Engine'}
            </span>
          </div>

          {isPrint ? (
            <PrintControls
              compact
              section="press"
              config={viewConfig.printConfig || printConfigFallback}
              onChange={(next) => updateView('printConfig', next)}
              cols={cols}
              rows={rows}
              onRenderProof={onRenderProof}
              proofProgress={proofProgress}
              tier={printTier}
            />
          ) : isVector ? (
            <VectorControls
              compact
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

          <div className="basic-sub-header" style={{ marginTop: '6px' }}>
            <span className="basic-sub-title">{isPrint ? 'Inks & Color' : 'Color & Theme'}</span>
          </div>

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
            isPrintMode={isPrint}
            printConfig={viewConfig.printConfig || printConfigFallback}
            onChangePrintConfig={(next) => updateView('printConfig', next)}
            cols={cols}
            rows={rows}
            onSeedInksFromPalette={onSeedInksFromPalette}
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

          <div className="color-backdrop-section">
            <BackgroundRow
              value={viewConfig.background}
              onChange={(bg) => updateView('background', bg)}
            />
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 04 · ADJUSTMENTS                                           */}
      {/* ================================================================ */}
      <div className="basic-step-card">
        <div className="basic-step-header">
          <span className="basic-step-badge">04</span>
          <span className="basic-step-title">Adjustments</span>
        </div>

        <div className="basic-step-body">
          <SimpleLevelsSlider
            config={toneConfig}
            onChangeConfig={onChangeToneConfig}
          />

          <div className="basic-sub-header" style={{ marginTop: '6px' }}>
            <span className="basic-sub-title">Detail &amp; Texture</span>
          </div>
          <AdjustSlider id="sharpenStrength" config={viewConfig} onChangeConfig={updateAdjust} />
          <AdjustSlider id="sharpenRadius" config={viewConfig} onChangeConfig={updateAdjust} />
          <AdjustSlider id="denoise" config={viewConfig} onChangeConfig={updateAdjust} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 05 · COMPOSITING & EFFECTS                                 */}
      {/* ================================================================ */}
      <div className="basic-step-card">
        <div className="basic-step-header">
          <span className="basic-step-badge">05</span>
          <span className="basic-step-title">Compositing &amp; Effects</span>
        </div>

        <div className="basic-step-body">
          <div className="control-row">
            <span
              className="control-label"
              title="Bring the original back in over its own rasterization, framed identically."
            >
              Original Overlay
            </span>
            <ToggleSwitch
              checked={Boolean(postProcess.sourceOverlay.enabled)}
              disabled={!mediaElement}
              title="Toggle original source overlay"
              onChange={(enabled) =>
                onChangePostProcess({
                  ...postProcess,
                  sourceOverlay: {
                    ...postProcess.sourceOverlay,
                    enabled,
                    placement: 'under',
                  },
                })
              }
            />
          </div>

          <div className="control-row">
            <span className="control-label" title="How the original and the raster combine.">
              Blend Mode
            </span>
            <BlendModePicker
              value={postProcess.sourceOverlay.blend}
              disabled={!postProcess.sourceOverlay.enabled}
              onChange={(blend) =>
                onChangePostProcess({
                  ...postProcess,
                  sourceOverlay: { ...postProcess.sourceOverlay, blend },
                })
              }
            />
          </div>

          <div className="control-row">
            <span className="control-label">Overlay Opacity</span>
            <PrecisionSlider
              value={postProcess.sourceOverlay.opacity}
              sliderMin={0}
              sliderMax={100}
              step={1}
              resetTo={100}
              disabled={!postProcess.sourceOverlay.enabled}
              onChange={(v) =>
                onChangePostProcess({
                  ...postProcess,
                  sourceOverlay: { ...postProcess.sourceOverlay, opacity: v },
                })
              }
            />
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="Gaussian blur radius applied to the source overlay."
            >
              Overlay Blur
            </span>
            <PrecisionSlider
              value={postProcess.sourceOverlay.blur ?? 0}
              sliderMin={0}
              sliderMax={40}
              step={1}
              resetTo={0}
              disabled={!postProcess.sourceOverlay.enabled}
              onChange={(v) =>
                onChangePostProcess({
                  ...postProcess,
                  sourceOverlay: { ...postProcess.sourceOverlay, blur: v },
                })
              }
            />
          </div>

          <div
            className="control-row"
            style={{
              marginTop: '4px',
              paddingTop: '8px',
              borderTop: '1px dashed var(--border-color)',
            }}
          >
            <span className="control-label" title="Blooms the finished frame. Works in every output mode.">
              CRT Glow Bloom
            </span>
            <PrecisionSlider
              value={postProcess.glow.amount}
              sliderMin={0}
              sliderMax={200}
              step={1}
              resetTo={0}
              onChange={(v) =>
                onChangePostProcess({ ...postProcess, glow: { ...postProcess.glow, amount: v } })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
