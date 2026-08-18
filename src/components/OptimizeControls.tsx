import React, { useState, useEffect } from 'react';
import { OptimizeConfig } from '../types/ascii';
import { Cpu, Zap, BatteryCharging, Gauge, MonitorPlay, Maximize2, AlertTriangle } from 'lucide-react';

interface OptimizeControlsProps {
  config: OptimizeConfig;
  onChangeConfig: (cfg: OptimizeConfig) => void;
  cols: number;
  rows: number;
  onChangeResolution: (cols: number, rows: number) => void;
  onMatchViewfinderRatio?: () => void;
}

const NumberInput: React.FC<{
  value: number;
  min?: number;
  step?: number;
  onChange: (val: number) => void;
}> = ({ value, min = 1, step = 1, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value.toString());
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
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
      style={{ width: '56px', padding: '2px 4px', fontSize: '11px', textAlign: 'right' }}
      min={min}
      step={step}
      value={text}
      onFocus={() => setIsFocused(true)}
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
}) => {
  const [draftCols, setDraftCols] = useState<number>(cols);
  const [draftRows, setDraftRows] = useState<number>(rows);

  useEffect(() => {
    setDraftCols(cols);
    setDraftRows(rows);
  }, [cols, rows]);

  const handleColsChange = (newCols: number) => {
    setDraftCols(newCols);
    if (newCols <= 240 && draftRows <= 120) {
      onChangeResolution(newCols, draftRows);
    }
  };

  const handleRowsChange = (newRows: number) => {
    setDraftRows(newRows);
    if (draftCols <= 240 && newRows <= 120) {
      onChangeResolution(draftCols, newRows);
    }
  };

  const isPendingHighRes =
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

  // Performance Profile Presets
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
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {[
            { label: '50x25', c: 50, r: 25 },
            { label: '70x35', c: 70, r: 35 },
            { label: '100x50', c: 100, r: 50 },
            { label: '120x60', c: 120, r: 60 },
            { label: '150x75', c: 150, r: 75 },
          ].map((preset) => (
            <button
              key={preset.label}
              className={`btn btn-sm ${cols === preset.c && rows === preset.r ? 'btn-primary' : ''}`}
              onClick={() => onChangeResolution(preset.c, preset.r)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {onMatchViewfinderRatio && (
          <button
            className="btn btn-sm"
            style={{
              width: '100%',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onClick={onMatchViewfinderRatio}
            title="Automatically compute columns and rows to match the viewfinder resolution"
          >
            <Maximize2 size={11} color="var(--accent)" />
            MATCH VIEWFINDER RES
          </button>
        )}

        <div className="control-row">
          <span className="control-label">Columns (Width)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={30}
              max={Math.max(180, draftCols)}
              step={2}
              value={draftCols}
              onChange={(e) => handleColsChange(parseInt(e.target.value) || 100)}
            />
            <NumberInput
              value={draftCols}
              min={10}
              step={2}
              onChange={handleColsChange}
            />
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Rows (Height)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={15}
              max={Math.max(90, draftRows)}
              step={1}
              value={draftRows}
              onChange={(e) => handleRowsChange(parseInt(e.target.value) || 50)}
            />
            <NumberInput
              value={draftRows}
              min={5}
              step={1}
              onChange={handleRowsChange}
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
              onChange={(e) => update('targetFps', parseInt(e.target.value) || 60)}
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
