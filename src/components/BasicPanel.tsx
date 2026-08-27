import React, { useMemo, useState } from 'react';
import {
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
  BlendMode,
  PostProcessConfig,
  VECTOR_CONFIG_DEFAULTS,
} from '../types/ascii';
import { MediaUploadControls } from './MediaFileControls';
import { OutputModeCards } from './outputModes';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { VectorControls } from './VectorControls';
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
import { PrecisionSlider, WorkflowStep } from './controlPrimitives';

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

/**
 * The blend modes worth putting in a flat list.
 *
 * Eight of the sixteen, chosen for what changes the picture most per unit of
 * explanation — the same rule the compact beam deck follows. The rest stay
 * live in state and reachable from ADVANCED; a ramp arriving from there or
 * from a shared link renders in full. This panel only hides.
 */
const BASIC_BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'difference',
  'color',
  'luminosity',
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
  postProcess,
  onChangePostProcess,
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

  /*
   * The ceiling is per-mode for the same reason the presets are: 400 columns is
   * already an enormous wall of glyphs and a third of what a beam wants to
   * sample at. Vector stops at the shared grid budget instead.
   */
  const handleColsChange = (newCols: number) => {
    const ceiling = isVector ? MAX_GRID_COLS : 400;
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
      <WorkflowStep n="01" label="Source" />
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
      <WorkflowStep n="02" label="Output" />
      <div className="basic-section">
        <OutputModeCards value={rasterMode} onChange={onChangeRasterMode} compact />

        {/* Resolution / Grid Density */}
        <div className="tonal-subheading tonal-subheading-flush" style={{ marginTop: '10px' }}>
          <span
            title={
              isVector
                ? 'How finely the beam reads the image. Nothing quantizes to this grid, so it is a sampling rate rather than a visible resolution — too coarse and the deflection curve turns faceted.'
                : undefined
            }
          >
            {isPixel
              ? 'Resolution (DPI)'
              : isVector
                ? 'Beam Sampling (Columns)'
                : 'Grid Size (Columns)'}
          </span>
          <span className="control-static-value">
            {cols} &times; {rows} {isPixel ? 'px' : isVector ? 'samples' : 'chars'}
          </span>
        </div>

        <div className="basic-chip-row">
          {(isPixel ? DPI_PRESETS : isVector ? VECTOR_COLS_PRESETS : COLS_PRESETS).map((preset) => {
            const isActive = isPixel ? dpi === preset.value : cols === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                className={`quantize-chip ${isActive ? 'active' : ''}`}
                onClick={() =>
                  isPixel ? handleDpiChange(preset.value) : handleColsChange(preset.value)
                }
                title={
                  isPixel
                    ? `${preset.value} DPI`
                    : isVector
                      ? `Sample the beam at ${preset.value} columns across`
                      : `${preset.value} columns wide`
                }
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {isAscii && (
          <div className="control-row" style={{ marginTop: '8px' }}>
            <span className="control-label control-fixed">Charset</span>

            <div className="control-cluster">
              {/* Previous */}
              <button
                type="button"
                className="slider-nudge-btn btn-icon-sq"
                onClick={() => handleStepCharset(-1)}
                title="Previous charset (wraps around)"
              >
                <ChevronLeft size={13} />
              </button>

              {/* Select Dropdown */}
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

              {/* Next */}
              <button
                type="button"
                className="slider-nudge-btn btn-icon-sq"
                onClick={() => handleStepCharset(1)}
                title="Next charset (wraps around)"
              >
                <ChevronRight size={13} />
              </button>

              {/* Surprise Me / Randomizer Button */}
              <button
                type="button"
                className={`slider-nudge-btn btn-icon-sq btn-dice${
                  isCharsetRolling ? ' rolling' : ''
                }`}
                onClick={handleRandomizeCharset}
                title="Surprise Me: pick a random charset"
              >
                <Dices size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      <WorkflowStep n="03" label="Aesthetic" />
      <div className="basic-section">
        {/* Dithering Algorithm & Character Set */}
        <div className="tonal-subheading tonal-subheading-flush">
          <span>{isVector ? 'Beam Deflection' : isPixel ? 'Dither Pattern' : 'Dithering'}</span>
        </div>

        {isVector ? (
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

        <div className="tonal-subheading tonal-subheading-tight" style={{ marginTop: '12px' }}>
          <span>Color &amp; Palette</span>
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

      {/* ================================================================ */}
      <WorkflowStep n="04" label="Adjust" />
      <div className="basic-section">
        <SimpleLevelsSlider
          config={toneConfig}
          onChangeConfig={onChangeToneConfig}
        />

        <div className="tonal-subheading tonal-subheading-tight">
          <span>Detail &amp; Filtering</span>
        </div>
        <AdjustSlider id="sharpenStrength" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="sharpenRadius" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="denoise" config={viewConfig} onChangeConfig={updateAdjust} />
      </div>

      {/* ================================================================ */}
      <WorkflowStep n="05" label="Compositing" />
      <div className="basic-section">
        <div className="control-row">
          <span
            className="control-label"
            title="Bring the original back in over its own rasterization, framed identically."
          >
            Overlay
          </span>
          <button
            type="button"
            className={`btn btn-sm btn-onoff ${
              postProcess.sourceOverlay.enabled ? 'btn-primary' : ''
            }`}
            onClick={() =>
              onChangePostProcess({
                ...postProcess,
                sourceOverlay: {
                  ...postProcess.sourceOverlay,
                  enabled: !postProcess.sourceOverlay.enabled,
                },
              })
            }
            disabled={!mediaElement}
          >
            {postProcess.sourceOverlay.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label" title="How the original and the raster combine.">
            Blend
          </span>
          <select
            className="number-input control-fill"
            value={postProcess.sourceOverlay.blend}
            disabled={!postProcess.sourceOverlay.enabled}
            onChange={(e) =>
              onChangePostProcess({
                ...postProcess,
                sourceOverlay: {
                  ...postProcess.sourceOverlay,
                  blend: e.target.value as BlendMode,
                },
              })
            }
          >
            {BASIC_BLEND_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replace(/-/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="control-row">
          <span className="control-label">Opacity</span>
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

        <div className="control-row">
          <span className="control-label" title="Blooms the finished frame. Works in every output mode.">
            Glow
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
  );
};
