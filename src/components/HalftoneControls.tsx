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
    <div>
      {/* 1. Dot Shape Selection (for halftone-dot) */}
      {rasterMode === 'halftone-dot' && (
        <div className="control-row">
          <span className="control-label">Dot Shape</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['circle', 'square', 'diamond'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                className={`segmented-btn ${dotShape === shape ? 'active' : ''}`}
                onClick={() => updateField('dotShape', shape)}
                style={{ textTransform: 'capitalize' }}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Dot Scale Slider */}
      <div className="control-row">
        <span className="control-label">Dot Scale</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min="0.2"
            max="2.5"
            step="0.05"
            value={dotScale}
            onChange={(e) => updateField('dotScale', parseFloat(e.target.value))}
          />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
            {dotScale.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* 3. Screen Angle (for lines & crosshatch) */}
      {(rasterMode === 'halftone-line' || rasterMode === 'halftone-crosshatch') && (
        <>
          <div className="control-row">
            <span className="control-label">Screen Angle</span>
            <div className="control-input-wrapper">
              <input
                type="range"
                className="range-slider"
                min="0"
                max="180"
                step="5"
                value={lineAngle}
                onChange={(e) => updateField('lineAngle', parseInt(e.target.value, 10))}
              />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                {lineAngle}°
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', marginBottom: '8px' }}>
            {[0, 45, 90, 135].map((deg) => (
              <button
                key={deg}
                type="button"
                className={`chip-btn ${lineAngle === deg ? 'active' : ''}`}
                onClick={() => updateField('lineAngle', deg)}
              >
                {deg}°
              </button>
            ))}
          </div>
        </>
      )}

      {/* 4. CMYK Screen Plate Angles (for halftone-cmyk) */}
      {rasterMode === 'halftone-cmyk' && (
        <div style={{ marginBottom: '9px', padding: '8px', background: 'var(--bg-control)', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.05em' }}>
            CMYK Plate Angles
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {[
              { plate: 'c' as const, label: 'C', col: '#00ffff' },
              { plate: 'm' as const, label: 'M', col: '#ff00ff' },
              { plate: 'y' as const, label: 'Y', col: '#ffff00' },
              { plate: 'k' as const, label: 'K', col: '#aaaaaa' },
            ].map(({ plate, label, col }) => {
              const curAngle = config.cmykAngles?.[plate] ?? DEFAULT_HALFTONE_CONFIG.cmykAngles[plate];
              return (
                <div key={plate} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '9.5px', color: col, fontWeight: 700, marginBottom: '2px' }}>{label}</div>
                  <input
                    type="range"
                    className="range-slider"
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
                  <div style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{curAngle}°</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Cell Geometry Aspect Presets */}
      <div className="control-row">
        <span className="control-label">Cell Ratio</span>
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
              onClick={() => updateField('cellRatio', preset.ratio)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Dot Pitch Slider */}
      <div className="control-row">
        <span className="control-label">Dot Pitch</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min="4"
            max="24"
            step="1"
            value={dotPitch}
            onChange={(e) => updateField('dotPitch', parseInt(e.target.value, 10) || 8)}
          />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
            {dotPitch}px
          </span>
        </div>
      </div>

      {/* 7. Full-Width Bottom Reset Button */}
      <button
        type="button"
        className="btn btn-sm"
        style={{
          width: '100%',
          marginTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
        onClick={handleReset}
      >
        <RotateCcw size={11} /> RESET HALFTONE GEOMETRY
      </button>
    </div>
  );
};
