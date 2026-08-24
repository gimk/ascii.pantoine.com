import React from 'react';
import { ToneMappingConfig, DEFAULT_TONE_MAPPING_CONFIG } from '../types/ascii';
import { RotateCcw } from 'lucide-react';

interface ToneControlsProps {
  config: ToneMappingConfig;
  onChangeConfig: (newConfig: ToneMappingConfig) => void;
}

const TONAL_PRESETS = [
  { name: 'Linear', black: 0, white: 100, mid: 50 },
  { name: 'High Contrast', black: 15, white: 85, mid: 50 },
  { name: 'Shadow Crush', black: 30, white: 95, mid: 40 },
  { name: 'Highlight Boost', black: 5, white: 70, mid: 60 },
  { name: 'S-Curve', black: 10, white: 90, mid: 45 },
];

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

  const handleResetAll = () => {
    onChangeConfig({ ...DEFAULT_TONE_MAPPING_CONFIG });
  };

  const posterizeBits = config.posterizeBits || 0;
  const levelsBlack = config.levelsBlack ?? 0;
  const levelsWhite = config.levelsWhite ?? 100;
  const levelsMidtones = config.levelsMidtones ?? 50;

  // Build gradient preview stops based on levels and quantization
  const inBlack = levelsBlack / 100.0;
  const inWhite = Math.max(inBlack + 0.05, levelsWhite / 100.0);
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, levelsMidtones / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const rampStops = React.useMemo(() => {
    const stops: string[] = [];
    const sampleCount = 64;
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      let val = Math.max(0, Math.min(1, (t - inBlack) / (inWhite - inBlack)));
      if (gamma !== 1.0 && val > 0 && val < 1) {
        val = Math.pow(val, 1 / gamma);
      }
      if (posterizeBits > 0) {
        const steps = Math.pow(2, posterizeBits) - 1;
        val = Math.round(val * steps) / steps;
      }
      const byte = Math.round(Math.max(0, Math.min(1, val)) * 255);
      stops.push(`rgb(${byte},${byte},${byte}) ${(t * 100).toFixed(1)}%`);
    }
    return stops.join(', ');
  }, [inBlack, inWhite, gamma, posterizeBits]);

  return (
    <div>
      {/* 1. Live Visual Tone Ramp Bar */}
      <div style={{ marginBottom: '10px' }}>
        <div
          style={{
            height: '16px',
            width: '100%',
            borderRadius: '2px',
            background: `linear-gradient(to right, ${rampStops})`,
            border: '1px solid var(--border-color)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
            marginBottom: '4px',
            position: 'relative',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          <span>0 (SHADOWS)</span>
          <span>MIDTONES</span>
          <span>255 (HIGHLIGHTS)</span>
        </div>
      </div>

      {/* 2. Quantization Steps / Bit-Depth */}
      <div className="control-row" style={{ marginBottom: '8px' }}>
        <span className="control-label">Tonal Steps</span>
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { bits: 0, label: 'RAW' },
            { bits: 1, label: '2' },
            { bits: 2, label: '4' },
            { bits: 3, label: '8' },
            { bits: 4, label: '16' },
            { bits: 5, label: '32' },
            { bits: 6, label: '64' },
          ].map((item) => (
            <button
              key={item.bits}
              type="button"
              className={`chip-btn ${posterizeBits === item.bits ? 'active' : ''}`}
              onClick={() => updateField('posterizeBits', item.bits)}
              title={item.bits === 0 ? 'Full continuous 8-bit gradient' : `${Math.pow(2, item.bits)} quantized tone steps`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Tonal Presets */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
        {TONAL_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="chip-btn"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() =>
              onChangeConfig({
                ...config,
                levelsBlack: p.black,
                levelsWhite: p.white,
                levelsMidtones: p.mid,
              })
            }
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* 4. Input Levels Sliders */}
      <div className="control-row">
        <span className="control-label">Shadow Cut</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min={0}
            max={60}
            value={levelsBlack}
            onChange={(e) => updateField('levelsBlack', parseInt(e.target.value, 10) || 0)}
          />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
            {levelsBlack}%
          </span>
        </div>
      </div>

      <div className="control-row">
        <span className="control-label">Midtones Gamma</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min={10}
            max={90}
            value={levelsMidtones}
            onChange={(e) => updateField('levelsMidtones', parseInt(e.target.value, 10) || 50)}
          />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
            {(levelsMidtones / 50.0).toFixed(2)}x
          </span>
        </div>
      </div>

      <div className="control-row">
        <span className="control-label">Highlight Cut</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min={40}
            max={100}
            value={levelsWhite}
            onChange={(e) => updateField('levelsWhite', parseInt(e.target.value, 10) || 100)}
          />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
            {levelsWhite}%
          </span>
        </div>
      </div>

      {/* 5. RGB Channel Mixer */}
      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em', fontWeight: 600 }}>
          Channel Mixer (RGB Weights)
        </div>

        <div className="control-row">
          <span className="control-label" style={{ color: '#ff5555' }}>Red Weight</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={200}
              value={config.channelMixerR ?? 100}
              onChange={(e) => updateField('channelMixerR', parseInt(e.target.value, 10) || 0)}
            />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
              {config.channelMixerR ?? 100}%
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label" style={{ color: '#55ff55' }}>Green Weight</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={200}
              value={config.channelMixerG ?? 100}
              onChange={(e) => updateField('channelMixerG', parseInt(e.target.value, 10) || 0)}
            />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
              {config.channelMixerG ?? 100}%
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label" style={{ color: '#55aaff' }}>Blue Weight</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={200}
              value={config.channelMixerB ?? 100}
              onChange={(e) => updateField('channelMixerB', parseInt(e.target.value, 10) || 0)}
            />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
              {config.channelMixerB ?? 100}%
            </span>
          </div>
        </div>
      </div>

      {/* 6. Full-Width Bottom Reset Button */}
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
        onClick={handleResetAll}
      >
        <RotateCcw size={11} /> RESET TONE MAPPING
      </button>
    </div>
  );
};
