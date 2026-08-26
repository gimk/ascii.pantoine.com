import React, { useMemo } from 'react';
import {
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-react';
import {
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  ToneMappingConfig,
  PhosphorTheme,
  RasterOutputMode,
  ImageAdjustConfig,
} from '../types/ascii';
import { MediaUploadControls } from './MediaFileControls';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { PaletteControls } from './PaletteControls';
import { PrecisionSlider } from './controlPrimitives';
import { CHARSETS } from '../engine/renderer';
import { clampGridToBudget } from '../engine/mediaPresets';
import {
  AdjustSlider,
  ToneBandRows,
  applyToneStops,
  DEFAULT_STOP_WEIGHT,
  BackgroundRow,
  QuantizeDepthNotice,
} from './ImageAdjustControls';
import { BUILTIN_PALETTES, PaletteQuantizer } from '../engine/palettes';
import { paletteIsMonochrome } from '../engine/rasterEngine';
import { ExportTab } from './ExportModal';

/** Monospace cells are taller than wide, so an ASCII grid needs fewer rows. */
const ASCII_CELL_ASPECT = 0.55;

/**
 * Resolution presets, as chips rather than a slider.
 *
 * Pixel output is measured in DPI, a straight percentage of the source. ASCII
 * has no such thing -- its unit is the character column -- so the two modes get
 * different chips behind the same row rather than one control pretending the
 * units are interchangeable.
 */
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

/** Numbered step header, matching the ADVANCED panel's workflow titles. */
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
 * The BASIC sidebar: one flat panel from a file to an export, in the order
 * someone actually walks it.
 *
 * No disclosures. Every section is a numbered step header and its controls,
 * always visible -- nothing to hunt for, nothing to expand. Each step carries
 * the minimum that step needs; the full versions of these controls all live in
 * ADVANCED.
 *
 * Everything drives the same state the ADVANCED tree does. What BASIC leaves
 * out stays exactly as the user left it and is still live in the render;
 * flipping the header switch reveals it untouched.
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

  /*
   * DPI is a percentage of the source resolution, so it has to resize the grid
   * alongside itself -- the same relationship OptimizeControls maintains in
   * the ADVANCED panel.
   */
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

  /* ASCII has no DPI: detail is the column count, with rows locked to aspect. */
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

  const updateTone = <K extends keyof ToneMappingConfig>(key: K, val: ToneMappingConfig[K]) => {
    onChangeToneConfig({ ...toneConfig, [key]: val });
  };

  /* A charset typed by hand in ADVANCED matches no preset; keep it selectable. */
  const activeCharsetId =
    CHARSETS.find((cs) => cs.chars === density)?.id ?? '__custom__';

  const activePalette = BUILTIN_PALETTES.find(
    (p) => p.id === mediaColorConfig.activePaletteId
  );
  const isIndexed = mediaColorConfig.paletteMode === 'indexed';

  /*
   * Which colour mode is actually on, mirroring how PaletteControls decides it.
   *
   * The bands only mean something when a ramp is rendering. Mono has no bands
   * at all -- colour is a single tint applied downstream, and nothing buckets --
   * and RGB reads true source colour, so in both cases showing three tonal
   * bands describes a ramp that is not running.
   */
  const colorMode: 'mono' | 'ramp' | 'indexed' | 'content' =
    mediaColorConfig.paletteMode === 'content'
      ? 'content'
      : isIndexed
      ? 'indexed'
      : viewConfig.tonalMapping && viewConfig.tonalMapping !== '1color'
      ? 'ramp'
      : 'mono';

  const showToneBands = colorMode === 'ramp' || colorMode === 'indexed';

  /*
   * Whether the active palette is picking colours by hue rather than by tone.
   *
   * A multi-hue palette on a chromatic source is matched in CIELAB, nearest
   * colour wins, and luminance position never enters into it -- so there is no
   * band to widen and the weights are meaningless. The engine already refuses
   * to apply them to any palette; this is so the UI says so too instead of
   * offering sliders that do nothing.
   *
   * Source chromaticity is sampled inside the engine and is not visible here,
   * so this errs toward reporting hue matching whenever the palette could do
   * it. Being told "tone-matched" and getting hue matching would be the worse
   * way to be wrong.
   */
  const isHueMatched =
    isIndexed &&
    !!activePalette &&
    (mediaColorConfig.paletteMatch || 'auto') !== 'ramp' &&
    !paletteIsMonochrome(new PaletteQuantizer(activePalette));

  /*
   * Turn the active palette into an editable ramp.
   *
   * Deliberately a button rather than something a slider drag triggers. The two
   * are different render paths, and indexed is usually the better one: it
   * error-diffuses in palette space against the palette's real luminances,
   * where a ramp buckets evenly (see pipeline.md on Game Boy's spacing), and on
   * a multi-hue palette it also matches hue. Losing that should be a choice, not
   * a surprise from nudging a control.
   */
  const convertPaletteToRamp = () => {
    if (!activePalette || activePalette.colors.length < 2) return;
    const stops = [...activePalette.colors];
    onChangeMediaColorConfig({ ...mediaColorConfig, paletteMode: 'phosphor', mode: 'fixed' });
    onChangeViewConfig({
      ...viewConfig,
      ...applyToneStops(viewConfig, stops),
      toneStopWeights: stops.map(() => DEFAULT_STOP_WEIGHT),
      tonalMapping: 'ntone',
    });
  };

  /*
   * A built-in palette IS a preset N-tone ramp, so touching a band -- recolour
   * or width -- should just work rather than being refused.
   *
   * They are not the same render path though. `indexed` error-diffuses in
   * palette space against the palette's real luminances; `ntone` buckets the
   * warped luminance into stops. pipeline.md walks through Game Boy's
   * 0.153/0.304/0.566/0.621 spacing and why that distinction is load-bearing.
   * So a palette stays indexed for as long as it is untouched -- keeping the
   * better rendering -- and converts to an editable ramp only on the first
   * edit, seeded with its own colours so nothing jumps.
   */


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

        {/*
         * Orientation only. A newcomer whose phone photo landed sideways is
         * otherwise stuck with no way forward except discovering ADVANCED,
         * where scale and offset also live.
         */}
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
              className={`btn btn-sm ${mediaConfig.flipX ? 'btn-primary' : ''}`}
              onClick={() => onChangeMediaConfig({ ...mediaConfig, flipX: !mediaConfig.flipX })}
              title="Flip horizontally"
            >
              <FlipHorizontal size={12} />
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mediaConfig.flipY ? 'btn-primary' : ''}`}
              onClick={() => onChangeMediaConfig({ ...mediaConfig, flipY: !mediaConfig.flipY })}
              title="Flip vertically"
            >
              <FlipVertical size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Above the resolution chips on purpose: switching raster mode      */}
      {/* re-derives the grid, which re-derives DPI. Below them, the first  */}
      {/* thing a newcomer set would be silently overwritten by the second. */}
      <Step n="02" label="Output" />
      <div className="basic-section">
        <div className="basic-output-toggle">
          <button
            type="button"
            className={`btn ${!isPixel ? 'btn-primary' : ''}`}
            onClick={() => onChangeRasterMode('ascii')}
            title="Monospace character density ramp"
          >
            ASCII
          </button>
          <button
            type="button"
            className={`btn ${isPixel ? 'btn-primary' : ''}`}
            onClick={() => onChangeRasterMode('pixel')}
            title="1:1 square pixel dither"
          >
            PIXEL
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      <Step n="03" label="Dither" />
      <div className="basic-section">
        <div className="control-row">
          <span className="control-label">{isPixel ? 'Input DPI' : 'Columns'}</span>
          <span className="control-static-value">
            {cols} x {rows} {isPixel ? 'px' : 'chars'}
          </span>
        </div>

        <div className="basic-chip-row">
          {(isPixel ? DPI_PRESETS : COLS_PRESETS).map((preset) => {
            const isActive = isPixel ? dpi === preset.value : cols === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                className={`btn btn-sm ${isActive ? 'btn-primary' : ''}`}
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

        <DitherAlgorithmPicker
          value={viewConfig.algorithm || 'floyd-steinberg'}
          onChange={(algo) => updateView('algorithm', algo)}
          compact
        />

        {/*
         * The ramp as one dropdown. CharsetThemeBar's card list and custom
         * string field are a browsing tool; picking a named ramp is all this
         * step needs.
         */}
        {!isPixel && (
          <div className="control-row">
            <span className="control-label">Charset</span>
            <select
              className="number-input basic-select"
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
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Shapes the greyscale going into the dither (engine steps 2-3).    */}
      <Step n="04" label="Adjust" />
      <div className="basic-section">
        {/*
         * Levels without the histogram: two clip points, as plain sliders.
         *
         * The midtone handle is deliberately absent -- it is a gamma pivot, and
         * Tonal Balance below already exposes Midtones doing the same job. Two
         * controls a slider apart that both bend the midtones is exactly the
         * confusion BASIC should not have. The histogram, the draggable
         * handles and AUTO LEVELS are all still in ADVANCED.
         */}
        <div className="control-row">
          <span className="control-label">Black Point</span>
          <PrecisionSlider
            value={toneConfig.levelsBlack}
            sliderMin={0}
            sliderMax={100}
            step={1}
            resetTo={0}
            onChange={(val) => updateTone('levelsBlack', val)}
          />
        </div>
        <div className="control-row">
          <span className="control-label">White Point</span>
          <PrecisionSlider
            value={toneConfig.levelsWhite}
            sliderMin={0}
            sliderMax={100}
            step={1}
            resetTo={100}
            onChange={(val) => updateTone('levelsWhite', val)}
          />
        </div>

        <div className="tonal-subheading">
          <span>Sharpening</span>
        </div>
        <AdjustSlider id="sharpenStrength" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="sharpenRadius" config={viewConfig} onChangeConfig={updateAdjust} />
        <AdjustSlider id="denoise" config={viewConfig} onChangeConfig={updateAdjust} />
      </div>

      {/* ================================================================ */}
      {/* Decides what the graded tone comes out as (engine step 4).        */}
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
        />

        {/*
         * One row per stop: its colour and its share of the tonal range. Shown
         * only for the two modes that actually run a ramp -- mono applies a
         * single tint downstream and never buckets, RGB reads source colour, so
         * bands there would describe a ramp that is not running.
         */}
        {showToneBands && (
          <>
            <ToneBandRows
              config={viewConfig}
              onChangeConfig={updateAdjust}
              paletteColors={isIndexed ? activePalette?.colors : undefined}
              disabled={isIndexed}
            />

            {isIndexed && (
              <div className="basic-note">
                <span>
                  {isHueMatched
                    ? 'This palette matches colours by hue, so bands do not apply.'
                    : 'Palette colours are fixed, and their spacing is set by the palette.'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={convertPaletteToRamp}
                  title="Copy these colours into an editable ramp. Loses palette matching, which is usually the better rendering."
                >
                  EDIT AS RAMP
                </button>
              </div>
            )}
          </>
        )}

        <BackgroundRow
          value={viewConfig.background}
          onChange={(bg) => updateView('background', bg)}
        />

        {/* Only appears when a shared link or an ADVANCED session left it set. */}
        <QuantizeDepthNotice
          value={viewConfig.colorLevels}
          onReset={() => updateView('colorLevels', 0)}
        />
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
