import React from 'react';
import { ToneMappingConfig, DEFAULT_TONE_MAPPING_CONFIG } from '../types/ascii';
import { Layers, RotateCcw } from 'lucide-react';

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
    <div style={{ marginBottom: '8px' }}>
      {/* Header with Title & Reset Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          TONAL RAMP & QUANTIZATION
        </span>
        <button
          type="button"
          onClick={handleResetAll}
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
          title="Reset Tone Mapping to linear defaults"
        >
          <RotateCcw size={9} /> RESET
        </button>
      </div>

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
        <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Layers size={11} /> Steps
        </span>
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
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '2px',
                background: posterizeBits === item.bits ? 'var(--accent)' : 'var(--bg-control)',
                color: posterizeBits === item.bits ? '#000' : 'var(--text-muted)',
                fontWeight: posterizeBits === item.bits ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => updateField('posterizeBits', item.bits)}
              title={item.bits === 0 ? 'Full 8-bit continuous gradient' : `${Math.pow(2, item.bits)} quantized tone steps`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Tonal Presets */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '10px', overflowX: 'auto' }}>
        {TONAL_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="chip-btn"
            style={{
              fontSize: '8.5px',
              padding: '2px 6px',
              borderRadius: '2px',
              background: 'var(--bg-control)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
        <div className="control-row">
          <span className="control-label" style={{ fontSize: '9px' }}>Shadow Cut</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
            <input
              type="range"
              min={0}
              max={60}
              value={levelsBlack}
              onChange={(e) => updateField('levelsBlack', parseInt(e.target.value, 10) || 0)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', width: '28px', textAlign: 'right' }}>
              {levelsBlack}%
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label" style={{ fontSize: '9px' }}>Midtones Gamma</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
            <input
              type="range"
              min={10}
              max={90}
              value={levelsMidtones}
              onChange={(e) => updateField('levelsMidtones', parseInt(e.target.value, 10) || 50)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', width: '28px', textAlign: 'right' }}>
              {(levelsMidtones / 50.0).toFixed(2)}x
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label" style={{ fontSize: '9px' }}>Highlight Cut</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px', minWidth: '80px' }}>
            <input
              type="range"
              min={40}
              max={100}
              value={levelsWhite}
              onChange={(e) => updateField('levelsWhite', parseInt(e.target.value, 10) || 100)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', width: '28px', textAlign: 'right' }}>
              {levelsWhite}%
            </span>
          </div>
        </div>
      </div>

      {/* 5. RGB Channel Mixer */}
      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Channel Mixer (RGB Weights)
          </span>
          <button
            type="button"
            onClick={() =>
              onChangeConfig({
                ...config,
                channelMixerR: 100,
                channelMixerG: 100,
                channelMixerB: 100,
              })
            }
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '8.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontFamily: 'var(--font-mono)',
            }}
            title="Reset RGB mixer to 100%"
          >
            <RotateCcw size={8} /> Reset RGB
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
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

      {/* 6. Main Reset Button */}
      <button
        type="button"
        className="btn btn-sm"
        style={{
          width: '100%',
          marginTop: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          fontSize: '9.5px',
        }}
        onClick={handleResetAll}
      >
        <RotateCcw size={10} /> RESET TONE MAPPING
      </button>
    </div>
  );
};


