import React, { useState, useEffect, useMemo } from 'react';
import { OptimizeConfig, AppMode, MediaConfig } from '../types/ascii';
import { Cpu, Zap, BatteryCharging, Gauge, MonitorPlay, Crop, AlertTriangle, Lock, Unlock, Scale, CheckCircle2 } from 'lucide-react';

interface OptimizeControlsProps {
  config: OptimizeConfig;
  onChangeConfig: (cfg: OptimizeConfig) => void;
  cols: number;
  rows: number;
  onChangeResolution: (cols: number, rows: number) => void;
  onMatchViewfinderRatio?: () => void;
  autoRes?: boolean;
  onToggleAutoRes?: () => void;
  appMode?: AppMode;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig?: MediaConfig;
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
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
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
      className="number-input"
      style={{
        width: '56px',
        padding: '2px 4px',
        fontSize: '11px',
        textAlign: 'right',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
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
  config,
  onChangeConfig,
  cols,
  rows,
  onChangeResolution,
  onMatchViewfinderRatio,
  autoRes = false,
  onToggleAutoRes,
  appMode = 'synth',
  mediaElement,
  mediaConfig,
}) => {
  const [draftCols, setDraftCols] = useState<number>(cols);
  const [draftRows, setDraftRows] = useState<number>(rows);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);

  useEffect(() => {
    setDraftCols(cols);
    setDraftRows(rows);
  }, [cols, rows]);

  // Monospace cell aspect ratio (width / height)
  const cellAspect = 0.55;

  // Compute Source Media Dimensions & Native Aspect Ratio
  const { srcWidth, srcHeight, srcAspect } = useMemo(() => {
    let w = 256;
    let h = 256;
    if (mediaElement instanceof HTMLImageElement) {
      w = mediaElement.naturalWidth || mediaElement.width || 256;
      h = mediaElement.naturalHeight || mediaElement.height || 256;
    } else if (mediaElement instanceof HTMLVideoElement) {
      w = mediaElement.videoWidth || mediaElement.width || 256;
      h = mediaElement.videoHeight || mediaElement.height || 256;
    } else if (mediaElement instanceof HTMLCanvasElement) {
      w = mediaElement.width || 256;
      h = mediaElement.height || 256;
    }
    return {
      srcWidth: w,
      srcHeight: h,
      srcAspect: w / Math.max(1, h),
    };
  }, [mediaElement]);

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
  }, [srcWidth, srcAspect]);

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

  const handleSynthColsChange = (newCols: number) => {
    setDraftCols(newCols);
    if (newCols <= 240 && draftRows <= 120) {
      onChangeResolution(newCols, draftRows);
    }
  };

  const handleSynthRowsChange = (newRows: number) => {
    setDraftRows(newRows);
    if (draftCols <= 240 && newRows <= 120) {
      onChangeResolution(draftCols, newRows);
    }
  };

  const isPendingHighRes =
    appMode !== 'media' &&
    (draftCols > 240 || draftRows > 120) &&
    (draftCols !== cols || draftRows !== rows);

  const handleApplyPendingResolution = () => {
    onChangeResolution(draftCols, draftRows);
  };

  const update = <K extends keyof OptimizeConfig>(key: K, val: OptimizeConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  // Performance Profile Presets (For Synth & Model modes)
  const applyProfile = (profile: 'main' | 'background' | 'secondary' | 'eco') => {
    if (profile === 'main') {
      onChangeResolution(120, 60);
      onChangeConfig({
        targetFps: 60,
        pauseWhenHidden: true,
        idleThrottle: false,
      });
    } else if (profile === 'background') {
      onChangeResolution(90, 45);
      onChangeConfig({
        targetFps: 30,
        pauseWhenHidden: true,
        idleThrottle: true,
      });
    } else if (profile === 'secondary') {
      onChangeResolution(70, 35);
      onChangeConfig({
        targetFps: 20,
        pauseWhenHidden: true,
        idleThrottle: true,
      });
    } else if (profile === 'eco') {
      onChangeResolution(50, 25);
      onChangeConfig({
        targetFps: 15,
        pauseWhenHidden: true,
        idleThrottle: true,
      });
    }
  };

  const totalCells = cols * rows;

  return (
    <div className="tab-content">
      {appMode === 'media' ? (
        /* MEDIA SPECIFIC RESOLUTION CONTROLS */
        <>
          <div className="control-section">
            <div className="section-header">
              <span>Grid Resolution</span>
              <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                {cols}×{rows} ({totalCells.toLocaleString()} chars)
              </span>
            </div>

            {/* Media Source & Ratio Info Card */}
            <div
              style={{
                padding: '8px 10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '3px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Media File:</span>
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mediaConfig?.fileName || `${srcWidth}×${srcHeight}px`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Resolution:</span>
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {srcWidth} × {srcHeight} px
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Image Ratio:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {srcAspect >= 1 ? `${srcAspect.toFixed(2)}:1` : `1:${(1 / srcAspect).toFixed(2)}`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Framing Fit:</span>
                <span
                  style={{
                    color: isRatioMatched ? 'var(--accent)' : '#ffb000',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
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
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.4 }}>
              Scale resolutions proportional to image size with monospace aspect compensation:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', marginBottom: '10px' }}>
              {mediaFractionPresets.map((preset) => {
                const isActive = cols === preset.cols && rows === preset.rows;
                return (
                  <button
                    key={preset.label}
                    className={`btn btn-sm ${isActive ? 'btn-primary' : ''}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '5px 4px',
                      gap: '2px',
                    }}
                    onClick={() => onChangeResolution(preset.cols, preset.rows)}
                  >
                    <span style={{ fontWeight: 700, fontSize: '11px' }}>{preset.label}</span>
                    <span style={{ fontSize: '8.5px', opacity: 0.8 }}>
                      {preset.cols}×{preset.rows}
                    </span>
                  </button>
                );
              })}
              {onMatchViewfinderRatio && (
                <button
                  className="btn btn-sm"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '5px 4px',
                    gap: '2px',
                  }}
                  onClick={onMatchViewfinderRatio}
                  title="Fit viewport aspect ratio"
                >
                  <span style={{ fontWeight: 700, fontSize: '11px' }}>FIT</span>
                  <span style={{ fontSize: '8.5px', opacity: 0.8 }}>VIEWPORT</span>
                </button>
              )}
            </div>

            {/* Match Aspect Ratio & Lock Ratio Toggle */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <button
                className={`btn btn-sm ${lockAspectRatio ? 'btn-primary' : ''}`}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
                title="When locked, changing columns automatically adjusts rows to maintain the image's exact ratio without borders"
              >
                {lockAspectRatio ? <Lock size={11} /> : <Unlock size={11} />}
                RATIO LOCK {lockAspectRatio ? '[ON]' : '[OFF]'}
              </button>

              <button
                className="btn btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleMatchRatio}
                title="Instantly snap rows to match the image aspect ratio"
              >
                <Scale size={11} />
                MATCH RATIO
              </button>
            </div>

            {/* Columns Slider */}
            <div className="control-row">
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
            <div className="control-row">
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
          </div>
        </>
      ) : (
        /* SYNTH & MODEL RESOLUTION CONTROLS */
        <>
          {/* 1. Target Performance Profiles */}
          <div className="control-section">
            <div className="section-header">
              <span>Performance Profiles</span>
              <Cpu size={12} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.4 }}>
              1-click presets optimized for different website contexts and CPU budgets.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                className="btn btn-sm"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 8px', gap: '2px', textAlign: 'left' }}
                onClick={() => applyProfile('main')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 700 }}>
                  <Zap size={11} /> MAIN / HERO
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>60 FPS • 120x60 • High Fidelity</div>
              </button>

              <button
                className="btn btn-sm"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 8px', gap: '2px', textAlign: 'left' }}
                onClick={() => applyProfile('background')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 700 }}>
                  <MonitorPlay size={11} /> BACKGROUND
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>30 FPS • 90x45 • Balanced Ambient</div>
              </button>

              <button
                className="btn btn-sm"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 8px', gap: '2px', textAlign: 'left' }}
                onClick={() => applyProfile('secondary')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 700 }}>
                  <Gauge size={11} /> SECONDARY
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>20 FPS • 70x35 • Light Widget</div>
              </button>

              <button
                className="btn btn-sm"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 8px', gap: '2px', textAlign: 'left' }}
                onClick={() => applyProfile('eco')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 700 }}>
                  <BatteryCharging size={11} /> ECO / MOBILE
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>15 FPS • 50x25 • Min Battery</div>
              </button>
            </div>
          </div>

          {/* 2. Resolution & Grid Dimensions */}
          <div className="control-section">
            <div className="section-header">
              <span>Grid Resolution</span>
              <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                {cols}x{rows} ({totalCells.toLocaleString()} chars)
              </span>
            </div>

            {/* Quick Resolution buttons */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px', opacity: autoRes ? 0.45 : 1 }}>
              {[
                { label: '50x25', c: 50, r: 25 },
                { label: '70x35', c: 70, r: 35 },
                { label: '100x50', c: 100, r: 50 },
                { label: '120x60', c: 120, r: 60 },
                { label: '150x75', c: 150, r: 75 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  disabled={autoRes}
                  style={{ cursor: autoRes ? 'not-allowed' : 'pointer' }}
                  className={`btn btn-sm ${cols === preset.c && rows === preset.r ? 'btn-primary' : ''}`}
                  onClick={() => onChangeResolution(preset.c, preset.r)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {(onToggleAutoRes || onMatchViewfinderRatio) && (
              <button
                className={`btn btn-sm ${autoRes ? 'btn-primary' : ''}`}
                style={{
                  width: '100%',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={onToggleAutoRes || onMatchViewfinderRatio}
                title={
                  autoRes
                    ? 'Auto Resolution is ON (adapts to window/viewfinder size). Click to lock current resolution.'
                    : 'Auto Resolution is OFF (fixed size). Click to toggle Auto Resolution.'
                }
              >
                <Crop size={11} color={autoRes ? 'var(--bg-primary)' : 'var(--accent)'} />
                AUTO RES {autoRes ? '[ENABLED]' : '[DISABLED]'}
              </button>
            )}

            <div className="control-row" style={{ opacity: autoRes ? 0.45 : 1 }}>
              <span className="control-label">Columns (Width)</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={30}
                  max={Math.max(180, draftCols)}
                  step={2}
                  value={draftCols}
                  disabled={autoRes}
                  style={{ cursor: autoRes ? 'not-allowed' : 'pointer' }}
                  onChange={(e) => handleSynthColsChange(parseInt(e.target.value, 10) || 100)}
                />
                <NumberInput
                  value={draftCols}
                  min={10}
                  step={2}
                  disabled={autoRes}
                  onChange={handleSynthColsChange}
                />
              </div>
            </div>

            <div className="control-row" style={{ opacity: autoRes ? 0.45 : 1 }}>
              <span className="control-label">Rows (Height)</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={15}
                  max={Math.max(90, draftRows)}
                  step={1}
                  value={draftRows}
                  disabled={autoRes}
                  style={{ cursor: autoRes ? 'not-allowed' : 'pointer' }}
                  onChange={(e) => handleSynthRowsChange(parseInt(e.target.value, 10) || 50)}
                />
                <NumberInput
                  value={draftRows}
                  min={5}
                  step={1}
                  disabled={autoRes}
                  onChange={handleSynthRowsChange}
                />
              </div>
            </div>

            {/* High Resolution Confirmation Warning */}
            {isPendingHighRes && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  background: 'rgba(255, 176, 0, 0.1)',
                  border: '1px solid #ffb000',
                  borderRadius: '3px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ffb000', fontWeight: 700, fontSize: '10.5px' }}>
                  <AlertTriangle size={12} />
                  <span>High Resolution Warning</span>
                </div>
                <p style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  {draftCols}x{draftRows} ({(draftCols * draftRows).toLocaleString()} characters) exceeds standard 240x120. Rendering high cell counts may reduce framerate on lower-powered devices.
                </p>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', marginTop: '2px', fontWeight: 700 }}
                  onClick={handleApplyPendingResolution}
                >
                  APPLY RESOLUTION ({draftCols}x{draftRows})
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 3. Framerate Limiter */}
      <div className="control-section">
        <div className="section-header">
          <span>FPS Limiter</span>
          <span style={{ fontSize: '9.5px', color: 'var(--accent)' }}>
            {config.targetFps === 0 ? 'UNCAPPED (VSYNC)' : `${config.targetFps} FPS`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {[15, 20, 24, 30, 45, 60, 0].map((fpsVal) => (
            <button
              key={fpsVal}
              className={`btn btn-sm ${config.targetFps === fpsVal ? 'btn-primary' : ''}`}
              onClick={() => update('targetFps', fpsVal)}
            >
              {fpsVal === 0 ? 'MAX' : `${fpsVal}`}
            </button>
          ))}
        </div>

        <div className="control-row">
          <span className="control-label">Target Framerate</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={10}
              max={60}
              step={1}
              value={config.targetFps || 60}
              onChange={(e) => update('targetFps', parseInt(e.target.value, 10) || 60)}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.targetFps === 0 ? 'MAX' : `${config.targetFps}fps`}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Smart CPU & Battery Throttling */}
      <div className="control-section">
        <div className="section-header">
          <span>Smart Throttling</span>
        </div>

        <div className="control-row">
          <span className="control-label">
            Pause when Tab is Inactive
            <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>0% CPU when switched away</div>
          </span>
          <button
            className={`btn btn-sm ${config.pauseWhenHidden ? 'btn-primary' : ''}`}
            onClick={() => update('pauseWhenHidden', !config.pauseWhenHidden)}
          >
            {config.pauseWhenHidden ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label">
            Idle Framerate Throttle
            <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Drops to 12 FPS when user is idle</div>
          </span>
          <button
            className={`btn btn-sm ${config.idleThrottle ? 'btn-primary' : ''}`}
            onClick={() => update('idleThrottle', !config.idleThrottle)}
          >
            {config.idleThrottle ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>
    </div>
  );
};
