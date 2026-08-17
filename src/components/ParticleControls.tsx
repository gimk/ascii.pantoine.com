import React from 'react';
import { ParticleConfig } from '../types/ascii';
import { RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_PARTICLE_CONFIG } from '../engine/particles';

interface ParticleControlsProps {
  config: ParticleConfig;
  onChange: (updated: ParticleConfig) => void;
  onClearParticles: () => void;
}

const TRAIL_CHAR_PRESETS = [
  { label: 'Classic ASCII', chars: '@#%*+=-:. ' },
  { label: 'Binary', chars: '10' },
  { label: 'Sparkles', chars: '✦✧★*·.' },
  { label: 'Blocks', chars: '█▓▒░' },
  { label: 'Braille', chars: '⠁⠃⠇⠗⠷⠿' },
  { label: 'Math Glyphs', chars: '+-*/=%' },
];

export const ParticleControls: React.FC<ParticleControlsProps> = ({
  config,
  onChange,
  onClearParticles,
}) => {
  const update = <K extends keyof ParticleConfig>(key: K, val: ParticleConfig[K]) => {
    onChange({
      ...config,
      [key]: val,
    });
  };

  return (
    <div className="tab-content">
      {/* Interaction Status */}
      <div className="control-section">
        <div className="section-header">
          <span>Simulation Particle System</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-sm" onClick={onClearParticles} title="Clear Active Particles">
              <Trash2 size={11} />
              CLEAR
            </button>
            <button
              className="btn btn-sm"
              onClick={() => onChange(DEFAULT_PARTICLE_CONFIG)}
              title="Reset Particle Settings"
            >
              <RotateCcw size={11} />
              RESET
            </button>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Particles Active</span>
          <button
            className={`btn btn-sm ${config.enabled ? 'btn-primary' : ''}`}
            onClick={() => update('enabled', !config.enabled)}
          >
            {config.enabled ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
          Particles automatically evaluate and follow the vector flow of the active simulation wave.
        </p>
      </div>

      {/* Wave Flow & Dynamics */}
      <div className="control-section">
        <div className="section-header">
          <span>Wave Advection & Flow Dynamics</span>
        </div>

        <div className="control-row">
          <span className="control-label">Wave Flow Force</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.0}
              max={3.0}
              step={0.1}
              value={config.flowStrength}
              onChange={(e) => update('flowStrength', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.flowStrength.toFixed(1)}x
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Vortex / Swirl Tendency</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.0}
              max={3.0}
              step={0.1}
              value={config.swirlStrength}
              onChange={(e) => update('swirlStrength', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.swirlStrength.toFixed(1)}x
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Inertial Glide / Drag</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.80}
              max={0.99}
              step={0.01}
              value={config.drag}
              onChange={(e) => update('drag', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {(config.drag * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Lifespan & Emission */}
      <div className="control-section">
        <div className="section-header">
          <span>Lifespan & Click Explosions</span>
        </div>

        <div className="control-row">
          <span className="control-label">Particle Lifespan</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.3}
              max={5.0}
              step={0.1}
              value={config.lifespan}
              onChange={(e) => update('lifespan', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.lifespan.toFixed(1)}s
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Matrix Glow Influence</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.0}
              max={1.0}
              step={0.05}
              value={config.luminanceBoost}
              onChange={(e) => update('luminanceBoost', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {(config.luminanceBoost * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <hr style={{ borderColor: 'var(--border-color)', margin: '6px 0' }} />

        <div className="control-row">
          <span className="control-label">Click Burst Count</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={4}
              max={48}
              step={2}
              value={config.burstCount}
              onChange={(e) => update('burstCount', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.burstCount}
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Burst Explosion Velocity</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.5}
              max={3.0}
              step={0.1}
              value={config.burstSpeed}
              onChange={(e) => update('burstSpeed', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.burstSpeed.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Trail Characters */}
      <div className="control-section">
        <div className="section-header">
          <span>Particle Characters</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
          {TRAIL_CHAR_PRESETS.map((p) => (
            <button
              key={p.label}
              className={`btn btn-sm ${config.trailChars === p.chars ? 'btn-primary' : ''}`}
              style={{ justifyContent: 'flex-start', fontSize: '10px' }}
              onClick={() => update('trailChars', p.chars)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="control-row">
          <span className="control-label">Custom Trail Chars</span>
          <input
            type="text"
            className="number-input"
            style={{ width: '130px', textAlign: 'left', padding: '3px 6px' }}
            value={config.trailChars}
            onChange={(e) => update('trailChars', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
