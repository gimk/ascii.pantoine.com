import React, { useState, useEffect, useMemo } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { AppMode, MediaConfig } from '../types/ascii';
import { AlertTriangle, Lock, Unlock, Scale, CheckCircle2, Grid } from 'lucide-react';
import { MONOSPACE_CELL_ASPECT } from '../engine/renderer';
import { clampGridToBudget } from '../engine/mediaPresets';
import { measureFramedMedia } from '../engine/mediaRenderer';
import { AutoResToggle } from './controlPrimitives';

interface OptimizeControlsProps {
  cols: number;
  rows: number;
  onChangeResolution: (cols: number, rows: number) => void;
  onMatchViewfinderRatio?: () => void;
  autoRes?: boolean;
  onToggleAutoRes?: () => void;
  appMode?: AppMode;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig?: MediaConfig;
  isPixelMode?: boolean;
  /** Width/height of the viewfinder area; synth and model lock their grid to this. */
  viewfinderAspect?: number;
  dpi?: number;
  onChangeDpi?: (newDpi: number) => void;
}

const NumberInput: React.FC<{
  value: number;
  min?: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({ value, min = 1, step = 1, disabled = false, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value.toString());
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    setText(raw);
    if (raw === '-' || raw === '') return;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, parsed));
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    setIsFocused(false);
    const parsed = parseInt(text, 10);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      const validVal = Math.max(min, parsed);
      setText(validVal.toString());
      onChange(validVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      className={`number-input number-input-sm${disabled ? ' control-disabled' : ''}`}
      disabled={disabled}
      min={min}
      step={step}
      value={text}
      onFocus={() => !disabled && setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export const OptimizeControls: React.FC<OptimizeControlsProps> = ({
  cols,
  rows,
  onChangeResolution,
  onMatchViewfinderRatio,
  autoRes = false,
  onToggleAutoRes,
  appMode = 'synth',
  mediaElement,
  mediaConfig,
  isPixelMode = false,
  viewfinderAspect = 16 / 9,
  dpi = 72,
  onChangeDpi,
}) => {
  const totalCells = cols * rows;
  const [draftCols, setDraftCols] = useState<number>(cols);
  const [draftRows, setDraftRows] = useState<number>(rows);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);
  const [lockViewfinderRatio, setLockViewfinderRatio] = useState<boolean>(true);

  useEffect(() => {
    setDraftCols(cols);
    setDraftRows(rows);
  }, [cols, rows]);

  // Monospace cell aspect ratio (0.55 for characters, 1.0 for 1:1 squared pixels)
  const cellAspect = isPixelMode ? 1.0 : 0.55;

  /*
   * Source dimensions *as framed* -- crop applied, rotation's bounding box.
   *
   * Everything below derives a grid from these: the DPI slider, the fraction
   * presets and the aspect lock. Measured intrinsically, each of them would
   * quietly re-impose the uncropped shape on a cropped picture and letterbox
   * it back inside its old proportions.
   */
  const { srcWidth, srcHeight, srcAspect } = useMemo(() => {
    const { width, height } = measureFramedMedia(mediaElement, mediaConfig);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    return { srcWidth: w, srcHeight: h, srcAspect: w / Math.max(1, h) };
  }, [mediaElement, mediaConfig]);

  // Visual aspect ratio on screen: (cols / rows) * cellAspect
  const currentGridRatio = (cols / Math.max(1, rows)) * cellAspect;
  const isRatioMatched = srcWidth > 0 && Math.abs(currentGridRatio - srcAspect) / srcAspect < 0.05;

  // Fractional resolution scaling presets based on image original dimensions
  const mediaFractionPresets = useMemo(() => {
    const fractions = [
      { label: '1/2', factor: 0.5, desc: 'Ultra Detail' },
      { label: '1/4', factor: 0.25, desc: 'High Detail' },
      { label: '1/5', factor: 0.2, desc: 'Medium-High' },
      { label: '1/6', factor: 1 / 6, desc: 'Medium' },
      { label: '1/8', factor: 0.125, desc: 'Standard' },
      { label: '1/16', factor: 0.0625, desc: 'Compact' },
      { label: '1/32', factor: 0.03125, desc: 'Retro' },
    ];

    return fractions.map((f) => {
      let c = Math.max(20, Math.round(srcWidth * f.factor));
      let r = Math.max(10, Math.round((c * cellAspect) / srcAspect));
      return {
        label: f.label,
        desc: f.desc,
        cols: c,
        rows: r,
      };
    });
  }, [srcWidth, srcAspect, cellAspect]);

  const handleMatchRatio = () => {
    if (srcWidth <= 0 || srcHeight <= 0) return;
    const newRows = Math.max(10, Math.round((draftCols * cellAspect) / srcAspect));
    setDraftRows(newRows);
    onChangeResolution(draftCols, newRows);
  };

  const handleMediaColsChange = (newCols: number) => {
    setDraftCols(newCols);
    if (lockAspectRatio && srcWidth > 0 && srcHeight > 0) {
      const newRows = Math.max(10, Math.round((newCols * cellAspect) / srcAspect));
      setDraftRows(newRows);
      onChangeResolution(newCols, newRows);
    } else {
      onChangeResolution(newCols, draftRows);
    }
  };

  const handleMediaRowsChange = (newRows: number) => {
    setDraftRows(newRows);
    if (lockAspectRatio && srcWidth > 0 && srcHeight > 0) {
      const newCols = Math.max(20, Math.round((newRows * srcAspect) / cellAspect));
      setDraftCols(newCols);
      onChangeResolution(newCols, newRows);
    } else {
      onChangeResolution(draftCols, newRows);
    }
  };

  /*
   * Live-apply ceiling for synth/model. A character grid past 240x120 is
   * already unreadable, but a square pixel grid is a raster and needs the
   * headroom, so pixel mode gets the same 640-wide budget media uses.
   */
  const liveColsCeiling = isPixelMode ? 640 : 240;
  const liveRowsCeiling = isPixelMode ? 480 : 120;

  /*
   * Synth and model have no source image to lock against, so the reference is
   * the viewfinder itself: with the lock on, one slider drives the other so the
   * grid keeps filling the viewport instead of growing into a letterbox.
   * A grid displays at (cols / rows) * cellAspect, so matching the viewfinder
   * means rows = cols * cellAspect / viewfinderAspect.
   */
  const safeViewAspect = Math.max(0.05, viewfinderAspect);
  // Use the real cell aspect the viewport draws with, not the 0.55 the media
  // path approximates with — the lock is judged against the viewfinder itself,
  // so a few percent off reads as a visible letterbox.
  const viewCellAspect = isPixelMode ? 1.0 : MONOSPACE_CELL_ASPECT;
  const rowsForCols = (c: number) => Math.max(5, Math.round((c * viewCellAspect) / safeViewAspect));
  const colsForRows = (r: number) => Math.max(10, Math.round((r * safeViewAspect) / viewCellAspect));

  const handleSynthColsChange = (newCols: number) => {
    setDraftCols(newCols);
    const nextRows = lockViewfinderRatio ? rowsForCols(newCols) : draftRows;
    if (lockViewfinderRatio) setDraftRows(nextRows);
    if (newCols <= liveColsCeiling && nextRows <= liveRowsCeiling) {
      onChangeResolution(newCols, nextRows);
    }
  };

  const handleSynthRowsChange = (newRows: number) => {
    setDraftRows(newRows);
    const nextCols = lockViewfinderRatio ? colsForRows(newRows) : draftCols;
    if (lockViewfinderRatio) setDraftCols(nextCols);
    if (nextCols <= liveColsCeiling && newRows <= liveRowsCeiling) {
      onChangeResolution(nextCols, newRows);
    }
  };

  const handleMatchViewfinder = () => {
    const nextRows = rowsForCols(draftCols);
    setDraftRows(nextRows);
    onChangeResolution(draftCols, nextRows);
  };

  const isPendingHighRes =
    appMode !== 'media' &&
    (draftCols > liveColsCeiling || draftRows > liveRowsCeiling) &&
    (draftCols !== cols || draftRows !== rows);

  /*
   * Character cells are ~0.55 as wide as they are tall, so the text presets are
   * 2:1 grids that read as square. Pixel mode paints 1:1 cells, where a 2:1
   * grid really is a 2:1 letterbox, so it needs its own square-ish ladder.
   */
  const synthResolutionPresets = isPixelMode
    ? [
        { label: '64x64', c: 64, r: 64 },
        { label: '128x128', c: 128, r: 128 },
        { label: '160x120', c: 160, r: 120 },
        { label: '256x256', c: 256, r: 256 },
        { label: '320x240', c: 320, r: 240 },
      ]
    : [
        { label: '50x25', c: 50, r: 25 },
        { label: '70x35', c: 70, r: 35 },
        { label: '100x50', c: 100, r: 50 },
        { label: '120x60', c: 120, r: 60 },
        { label: '150x75', c: 150, r: 75 },
      ];

  const handleApplyPendingResolution = () => {
    onChangeResolution(draftCols, draftRows);
  };

  const handleDpiChange = (newDpi: number) => {
    if (onChangeDpi) {
      onChangeDpi(newDpi);
    }
    if (srcWidth > 0 && srcHeight > 0) {
      const scaleFactor = newDpi / 100;
      /*
       * Capped: DPI multiplies the source width by a percentage with no bound
       * of its own, so a large photo at a high setting asks for tens of
       * millions of cells and the tab stops answering. Typed cols/rows below
       * are deliberate and stay uncapped.
       */
      const grid = clampGridToBudget(
        Math.max(10, Math.round(srcWidth * scaleFactor)),
        Math.max(10, Math.round(srcHeight * scaleFactor))
      );
      onChangeResolution(grid.cols, grid.rows);
    }
  };

  return (
    <div className="tab-content">
      {appMode === 'media' ? (
        /* MEDIA SPECIFIC RESOLUTION & RENDER CONTROLS */
        <>
          {isPixelMode ? (
            /* 1. Pixel Mode: Simple DPI Slider & Canvas Output */
            <CollapsibleSection
              title="DPI / Resolution"
              icon={<Grid size={12} />}
              badge={
                <span className="collapsible-badge-inline is-accent">
                  {cols}×{rows} px ({dpi ?? 72} DPI)
                </span>
              }
              persistKey="OptimizeControls-pixel-dpi"
              headerRight={
                onToggleAutoRes && (
                  <AutoResToggle active={autoRes} onToggle={onToggleAutoRes} noun="DPI" />
                )
              }
            >
              {/* DPI Slider */}
              <div className={`control-row control-row-spaced-below`}>
                <span className="control-label">Input DPI</span>
                <div className="control-input-wrapper">
                  <input
                    type="range"
                    className="range-slider"
                    min={10}
                    max={300}
                    step={1}
                    value={dpi ?? 72}
                    onChange={(e) => handleDpiChange(parseInt(e.target.value, 10) || 72)}
                  />
                  <NumberInput
                    value={dpi ?? 72}
                    min={10}
                    step={1}
                    onChange={(newDpi) => handleDpiChange(Math.max(10, Math.min(300, newDpi)))}
                  />
                </div>
              </div>

              {/* Quick DPI Preset Chips */}
              <div className={`btn-grid-3 control-row-spaced-below`}>
                {[
                  { label: '25 DPI', val: 25, desc: 'Lo-Fi Pixel' },
                  { label: '50 DPI', val: 50, desc: 'Retro 8-Bit' },
                  { label: '72 DPI', val: 72, desc: 'Standard' },
                  { label: '100 DPI', val: 100, desc: 'Native 1:1' },
                  { label: '150 DPI', val: 150, desc: 'High Detail' },
                  { label: '200 DPI', val: 200, desc: 'Ultra HD' },
                ].map((p) => {
                  const isActive = (dpi ?? 72) === p.val;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      className={`btn btn-sm btn-stacked ${isActive ? 'btn-primary' : ''}`}
                      onClick={() => handleDpiChange(p.val)}
                    >
                      <span className="btn-stacked-main">{p.label}</span>
                      <span className="btn-stacked-sub">{p.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Pixel Output Dimensions Info Card */}
              <div
                className="info-card"
              >
                <div className="info-card-row">
                  <span className="info-card-label">Source Image:</span>
                  <span className="info-card-value info-card-value-accent">
                    {srcWidth} × {srcHeight} px
                  </span>
                </div>
                <div className="info-card-row">
                  <span className="info-card-label">Output Canvas:</span>
                  <span className="info-card-value info-card-value-strong">
                    {cols} × {rows} px (1:1 Square)
                  </span>
                </div>
              </div>
            </CollapsibleSection>
          ) : (
            /* 1. ASCII Mode: Grid Resolution */
            <CollapsibleSection
              title="Grid Resolution"
              icon={<Grid size={12} />}
              badge={
                <span className="collapsible-badge-inline">
                  {cols}×{rows} ({totalCells.toLocaleString()} chars)
                </span>
              }
              persistKey="OptimizeControls-grid-resolution"
              defaultOpen={false}
              headerRight={
                onToggleAutoRes && (
                  <AutoResToggle active={autoRes} onToggle={onToggleAutoRes} noun="grid" />
                )
              }
            >
              {/* Media Source & Ratio Info Card */}
              <div
                className="info-card control-row-spaced-below"
              >
                <div className="info-card-row">
                  <span className="info-card-label info-card-value-strong">Media File:</span>
                  <span className="info-card-value info-card-value-accent info-card-value-truncate">
                    {mediaConfig?.fileName || `${srcWidth}×${srcHeight}px`}
                  </span>
                </div>

                <div className="info-card-row">
                  <span className="info-card-label">Resolution:</span>
                  <span className="info-card-value info-card-value-accent">
                    {srcWidth} × {srcHeight} px
                  </span>
                </div>

                <div className="info-card-row">
                  <span className="info-card-label">Image Ratio:</span>
                  <span className="info-card-value">
                    {srcAspect >= 1 ? `${srcAspect.toFixed(2)}:1` : `1:${(1 / srcAspect).toFixed(2)}`}
                  </span>
                </div>

                <div className="info-card-row">
                  <span className="info-card-label">Framing Fit:</span>
                  <span
                    className={`info-card-value info-card-value-strong control-label-icon${
                      isRatioMatched ? ' info-card-value-accent' : ''
                    }`}
                  >
                    {isRatioMatched ? (
                      <>
                        <CheckCircle2 size={11} /> PERFECT (NO BORDERS)
                      </>
                    ) : (
                      'CUSTOM RATIO'
                    )}
                  </span>
                </div>
              </div>

              {/* Fractional Scale Presets (1/2, 1/4, 1/5, 1/6, 1/8, 1/16, 1/32, FIT) */}
              <p className="control-hint control-row-spaced-below">
                Scale resolutions proportional to image size with monospace aspect compensation:
              </p>

              <div className={`btn-grid-4 control-row-spaced-below`}>
                {mediaFractionPresets.map((preset) => {
                  const isActive = cols === preset.cols && rows === preset.rows;
                  return (
                    <button
                      key={preset.label}
                      className={`btn btn-sm btn-stacked ${isActive ? 'btn-primary' : ''}`}
                      onClick={() => onChangeResolution(preset.cols, preset.rows)}
                    >
                      <span className="btn-stacked-main">{preset.label}</span>
                      <span className="btn-stacked-sub">
                        {preset.cols}×{preset.rows}
                      </span>
                    </button>
                  );
                })}
                {onMatchViewfinderRatio && (
                  <button
                    className="btn btn-sm btn-stacked"
                    onClick={onMatchViewfinderRatio}
                    title="Fit viewport aspect ratio"
                  >
                    <span className="btn-stacked-main">FIT</span>
                    <span className="btn-stacked-sub">VIEWPORT</span>
                  </button>
                )}
              </div>

              {/* Match Aspect Ratio & Lock Ratio Toggle */}
              <div className="btn-group control-row-spaced-below">
                <button
                  className={`btn btn-sm control-fill ${lockAspectRatio ? 'btn-primary' : ''}`}
                  onClick={() => setLockAspectRatio(!lockAspectRatio)}
                  title="When locked, changing columns automatically adjusts rows to maintain the image's exact ratio without borders"
                >
                  {lockAspectRatio ? <Lock size={11} /> : <Unlock size={11} />}
                  RATIO LOCK {lockAspectRatio ? '[ON]' : '[OFF]'}
                </button>

                <button
                  className="btn btn-sm"
                  onClick={handleMatchRatio}
                  title="Instantly snap rows to match the image aspect ratio"
                >
                  <Scale size={11} />
                  MATCH RATIO
                </button>
              </div>

              {/* Columns Slider */}
              <div className={`control-row`}>
                <span className="control-label">Columns (Width)</span>
                <div className="control-input-wrapper">
                  <input
                    type="range"
                    className="range-slider"
                    min={20}
                    max={Math.max(480, draftCols)}
                    step={2}
                    value={draftCols}
                    onChange={(e) => handleMediaColsChange(parseInt(e.target.value, 10) || 120)}
                  />
                  <NumberInput
                    value={draftCols}
                    min={10}
                    step={2}
                    onChange={handleMediaColsChange}
                  />
                </div>
              </div>

              {/* Rows Slider */}
              <div className={`control-row`}>
                <span className="control-label">Rows (Height)</span>
                <div className="control-input-wrapper">
                  <input
                    type="range"
                    className="range-slider"
                    min={10}
                    max={Math.max(260, draftRows)}
                    step={1}
                    value={draftRows}
                    onChange={(e) => handleMediaRowsChange(parseInt(e.target.value, 10) || 60)}
                  />
                  <NumberInput
                    value={draftRows}
                    min={5}
                    step={1}
                    onChange={handleMediaRowsChange}
                  />
                </div>
              </div>
            </CollapsibleSection>
          )}
        </>
      ) : (
        /* SYNTH & MODEL RESOLUTION CONTROLS */
        <>
          {/* Resolution & Grid Dimensions */}
          <CollapsibleSection
            title={isPixelMode ? 'Pixel Resolution' : 'Grid Resolution'}
            icon={<Grid size={12} />}
            badge={<><span className={`collapsible-badge-inline${isPixelMode ? ' is-accent' : ''}`}>
                {cols}x{rows} ({totalCells.toLocaleString()} {isPixelMode ? 'px' : 'chars'})
              </span></>}
            persistKey="OptimizeControls-grid-resolution"
            defaultOpen={false}
            headerRight={
              onToggleAutoRes && (
                <AutoResToggle
                  active={autoRes}
                  onToggle={onToggleAutoRes}
                  noun={isPixelMode ? 'pixel resolution' : 'grid'}
                />
              )
            }
          >
            {/* Quick Resolution buttons */}
            <div className={`btn-group btn-group-wrap control-row-spaced-below`}>
              {synthResolutionPresets.map((preset) => (
                <button
                  key={preset.label}
                  className={`btn btn-sm ${cols === preset.c && rows === preset.r ? 'btn-primary' : ''}`}
                  onClick={() => onChangeResolution(preset.c, preset.r)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/*
              * The AUTO RES button that used to sit here is now the AUTO latch
              * in this section's header, beside RESET — the same place every
              * other panel keeps its header controls, and where the media DPI
              * and grid panels now carry theirs too. One switch per panel, in
              * one predictable spot, rather than a full-width button in the
              * middle of the controls it disables.
              */}

            {/* Viewfinder Ratio Lock — how the sliders behave once you use them */}
            <div className="btn-group control-row-spaced-below">
              <button
                className={`btn btn-sm control-fill ${
                  lockViewfinderRatio ? 'btn-primary' : ''
                }`}
                onClick={() => setLockViewfinderRatio(!lockViewfinderRatio)}
                title="When locked, moving either slider adjusts the other so the grid keeps the viewfinder's aspect ratio"
              >
                {lockViewfinderRatio ? <Lock size={11} /> : <Unlock size={11} />}
                RATIO LOCK {lockViewfinderRatio ? '[ON]' : '[OFF]'}
              </button>

              <button
                className="btn btn-sm"
                onClick={handleMatchViewfinder}
                title="Snap rows to match the viewfinder aspect ratio at the current column count"
              >
                <Scale size={11} />
                MATCH RATIO
              </button>
            </div>

            <div className={`control-row`}>
              <span className="control-label">Columns (Width)</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={30}
                  max={Math.max(isPixelMode ? 512 : 180, draftCols)}
                  step={2}
                  value={draftCols}
                  onChange={(e) => handleSynthColsChange(parseInt(e.target.value, 10) || 100)}
                />
                <NumberInput
                  value={draftCols}
                  min={10}
                  step={2}
                  onChange={handleSynthColsChange}
                />
              </div>
            </div>

            <div className={`control-row`}>
              <span className="control-label">Rows (Height)</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={15}
                  max={Math.max(isPixelMode ? 384 : 90, draftRows)}
                  step={1}
                  value={draftRows}
                  onChange={(e) => handleSynthRowsChange(parseInt(e.target.value, 10) || 50)}
                />
                <NumberInput
                  value={draftRows}
                  min={5}
                  step={1}
                  onChange={handleSynthRowsChange}
                />
              </div>
            </div>

            {/* High Resolution Confirmation Warning */}
            {isPendingHighRes && (
              <div className="warn-card">
                <div className="warn-card-title">
                  <AlertTriangle size={12} />
                  <span>High Resolution Warning</span>
                </div>
                <p className="warn-card-body">
                  {draftCols}x{draftRows} ({(draftCols * draftRows).toLocaleString()} {isPixelMode ? 'pixels' : 'characters'}) exceeds standard {liveColsCeiling}x{liveRowsCeiling}. Rendering high cell counts may reduce framerate on lower-powered devices.
                </p>
                <button
                  className="btn btn-primary btn-sm warn-card-action"
                  onClick={handleApplyPendingResolution}
                >
                  APPLY RESOLUTION ({draftCols}x{draftRows})
                </button>
              </div>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
};
