import React from 'react';
import { ToneMappingConfig } from '../types/ascii';


interface ToneControlsProps {
  config: ToneMappingConfig;
  onChangeConfig: (newConfig: ToneMappingConfig) => void;
}

export const ToneControls: React.FC<ToneControlsProps> = ({
  config,
  onChangeConfig,
}) => {
  const updateField = <K extends keyof ToneMappingConfig>(key: K, value: ToneMappingConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: value,
    });
  };

  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          TONE MAPPING & BIT DEPTH
        </span>
        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
          {config.posterizeBits > 0 ? `${config.posterizeBits}-BIT` : '8-BIT RAW'}
        </span>
      </div>

      {/* 1. Bit-Depth Posterizer */}
      <div className="control-row" style={{ marginBottom: '6px' }}>
        <span className="control-label" title="Quantize tonal precision before dithering">
          Bit-Depth Posterize
        </span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {[
            { bits: 0, label: 'OFF' },
            { bits: 1, label: '1-BIT' },
            { bits: 2, label: '2-BIT' },
            { bits: 3, label: '3-BIT' },
            { bits: 4, label: '4-BIT' },
          ].map((item) => (
            <button
              key={item.bits}
              type="button"
              className={`chip-btn ${config.posterizeBits === item.bits ? 'active' : ''}`}
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '2px',
                background: config.posterizeBits === item.bits ? 'var(--accent)' : 'var(--bg-control)',
                color: config.posterizeBits === item.bits ? '#000' : 'var(--text-muted)',
                fontWeight: config.posterizeBits === item.bits ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => updateField('posterizeBits', item.bits)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. RGB Channel Mixer */}
      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Channel Mixer (R / G / B Weights)
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '4px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#ff5555' }}>
              <span>RED</span>
              <span>{config.channelMixerR}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={config.channelMixerR}
              onChange={(e) => updateField('channelMixerR', parseInt(e.target.value, 10) || 0)}
              className="range-input"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#55ff55' }}>
              <span>GREEN</span>
              <span>{config.channelMixerG}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={config.channelMixerG}
              onChange={(e) => updateField('channelMixerG', parseInt(e.target.value, 10) || 0)}
              className="range-input"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#55aaff' }}>
              <span>BLUE</span>
              <span>{config.channelMixerB}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={config.channelMixerB}
              onChange={(e) => updateField('channelMixerB', parseInt(e.target.value, 10) || 0)}
              className="range-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
