import React from 'react';
import { HalftoneConfig, DEFAULT_HALFTONE_CONFIG, RasterOutputMode } from '../types/ascii';
import { RotateCcw } from 'lucide-react';


interface HalftoneControlsProps {
  config: HalftoneConfig;
  onChangeConfig: (newConfig: HalftoneConfig) => void;
  rasterMode?: RasterOutputMode;
}

export const HalftoneControls: React.FC<HalftoneControlsProps> = ({
  config,
  onChangeConfig,
  rasterMode = 'halftone-dot',
}) => {
  const updateField = <K extends keyof HalftoneConfig>(key: K, value: HalftoneConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: value,
    });
  };

  const handleReset = () => {
    onChangeConfig({ ...DEFAULT_HALFTONE_CONFIG });
  };

  const dotScale = config.dotScale ?? 1.0;
  const dotShape = config.dotShape || 'circle';
  const lineAngle = config.lineAngle ?? 45;
  const cellRatio = config.cellRatio ?? 1.0;
  const dotPitch = config.dotPitch ?? 8;

  return (
    <div style={{ marginBottom: '8px' }}>
      {/* Header with Title & Quick Reset */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          SCREEN GEOMETRY & ANGLES
        </span>
        <button
          type="button"
          onClick={handleReset}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: '8.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            fontFamily: 'var(--font-mono)',
            padding: '0',
          }}
          title="Reset Halftone Geometry to defaults"
        >
          <RotateCcw size={9} /> RESET
        </button>
      </div>

      {/* 1. Dot Shape Selection (for halftone-dot) */}
      {rasterMode === 'halftone-dot' && (
        <div className="control-row" style={{ marginBottom: '8px' }}>
          <span className="control-label" style={{ fontSize: '9.5px' }}>Dot Shape</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['circle', 'square', 'diamond'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                className={`segmented-btn ${dotShape === shape ? 'active' : ''}`}
                onClick={() => updateField('dotShape', shape)}
                style={{ fontSize: '9px', padding: '2px 7px', textTransform: 'capitalize' }}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Dot Scale Slider */}
      <div className="control-row" style={{ marginBottom: '6px' }}>
        <span className="control-label" style={{ fontSize: '9.5px' }}>Dot Scale</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.05"
            value={dotScale}
            onChange={(e) => updateField('dotScale', parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '9.5px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            {dotScale.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* 3. Screen Angle (for lines & crosshatch) */}
      {(rasterMode === 'halftone-line' || rasterMode === 'halftone-crosshatch') && (
        <div style={{ marginBottom: '8px' }}>
          <div className="control-row" style={{ marginBottom: '4px' }}>
            <span className="control-label" style={{ fontSize: '9.5px' }}>Screen Angle</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
              <input
                type="range"
                min="0"
                max="180"
                step="5"
                value={lineAngle}
                onChange={(e) => updateField('lineAngle', parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '9.5px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {lineAngle}°
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
            {[0, 45, 90, 135].map((deg) => (
              <button
                key={deg}
                type="button"
                className={`chip-btn ${lineAngle === deg ? 'active' : ''}`}
                style={{
                  fontSize: '8.5px',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  background: lineAngle === deg ? 'var(--accent)' : 'var(--bg-control)',
                  color: lineAngle === deg ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => updateField('lineAngle', deg)}
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. CMYK Screen Plate Angles (for halftone-cmyk) */}
      {rasterMode === 'halftone-cmyk' && (
        <div style={{ marginBottom: '8px', padding: '6px', background: 'var(--bg-control)', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '8.5px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            CMYK Plate Angles
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {[
              { plate: 'c' as const, label: 'C (Cyan)', col: '#00ffff' },
              { plate: 'm' as const, label: 'M (Magenta)', col: '#ff00ff' },
              { plate: 'y' as const, label: 'Y (Yellow)', col: '#ffff00' },
              { plate: 'k' as const, label: 'K (Black)', col: '#aaaaaa' },
            ].map(({ plate, label, col }) => {
              const curAngle = config.cmykAngles?.[plate] ?? DEFAULT_HALFTONE_CONFIG.cmykAngles[plate];
              return (
                <div key={plate} style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '8.5px', color: col, fontWeight: 700 }}>{plate.toUpperCase()}</span>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={curAngle}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      updateField('cmykAngles', {
                        ...config.cmykAngles,
                        [plate]: val,
                      });
                    }}
                    style={{ width: '100%' }}
                    title={`${label}: ${curAngle}°`}
                  />
                  <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)' }}>{curAngle}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Cell Geometry Aspect Presets */}
      <div className="control-row" style={{ marginBottom: '6px' }}>
        <span className="control-label" style={{ fontSize: '9.5px' }}>Cell Ratio</span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {[
            { label: '1:1', ratio: 1.0 },
            { label: '0.6', ratio: 0.6 },
            { label: '4:3', ratio: 0.75 },
            { label: '16:9', ratio: 0.5625 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`chip-btn ${Math.abs(cellRatio - preset.ratio) < 0.02 ? 'active' : ''}`}
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '2px',
                background: Math.abs(cellRatio - preset.ratio) < 0.02 ? 'var(--accent)' : 'var(--bg-control)',
                color: Math.abs(cellRatio - preset.ratio) < 0.02 ? '#000' : 'var(--text-muted)',
                fontWeight: Math.abs(cellRatio - preset.ratio) < 0.02 ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => updateField('cellRatio', preset.ratio)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Dot Pitch Slider */}
      <div className="control-row" style={{ marginBottom: '8px' }}>
        <span className="control-label" style={{ fontSize: '9.5px' }}>Dot Pitch</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
          <input
            type="range"
            min="4"
            max="24"
            step="1"
            value={dotPitch}
            onChange={(e) => updateField('dotPitch', parseInt(e.target.value, 10) || 8)}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '9.5px', width: '32px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            {dotPitch}px
          </span>
        </div>
      </div>

      {/* 7. Bottom Reset Button */}
      <button
        type="button"
        className="btn btn-sm"
        style={{
          width: '100%',
          marginTop: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          fontSize: '9.5px',
        }}
        onClick={handleReset}
      >
        <RotateCcw size={10} /> RESET HALFTONE GEOMETRY
      </button>
    </div>
  );
};
