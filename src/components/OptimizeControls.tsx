import React from 'react';
import { OptimizeConfig } from '../types/ascii';
import { Cpu, Zap, BatteryCharging, Gauge, MonitorPlay } from 'lucide-react';

interface OptimizeControlsProps {
  config: OptimizeConfig;
  onChangeConfig: (cfg: OptimizeConfig) => void;
  cols: number;
  rows: number;
  onChangeResolution: (cols: number, rows: number) => void;
}

export const OptimizeControls: React.FC<OptimizeControlsProps> = ({
  config,
  onChangeConfig,
  cols,
  rows,
  onChangeResolution,
}) => {
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

        <div className="control-row">
          <span className="control-label">Columns (Width)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={30}
              max={180}
              step={2}
              value={cols}
              onChange={(e) => onChangeResolution(parseInt(e.target.value) || 100, rows)}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>{cols}</span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Rows (Height)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={15}
              max={90}
              step={1}
              value={rows}
              onChange={(e) => onChangeResolution(cols, parseInt(e.target.value) || 50)}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>{rows}</span>
          </div>
        </div>
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
