import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { ParticleConfig } from '../types/ascii';
import { DEFAULT_PARTICLE_CONFIG } from '../engine/particles';
import { Activity, Wind, Zap } from 'lucide-react';

interface ParticleControlsProps {
  config: ParticleConfig;
  onChange: (updated: ParticleConfig) => void;
  onClearParticles: () => void;
}

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
      <CollapsibleSection
        title="Simulation Particle System"
        icon={<Activity size={12} />}
        persistKey="ParticleControls-simulation-particle-system"
        badge={config.enabled ? 'ON' : 'OFF'}
        onReset={() => onChange({ ...DEFAULT_PARTICLE_CONFIG, enabled: config.enabled })}
        resetTitle="Reset particle physics settings"
        headerRight={
          <button
            type="button"
            className="btn-reset"
            onClick={onClearParticles}
            title="Clear all active particles"
          >
            CLEAR
          </button>
        }
      >
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
        <div className="collapsible-nest">
          {/* Wave Flow & Dynamics */}
          <CollapsibleSection
            title="Wave Advection &amp; Flow Dynamics"
            icon={<Wind size={12} />}
            persistKey="ParticleControls-wave-advection-flow-dynamics"
            defaultOpen={false}
          >
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
                  {(config.drag * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </CollapsibleSection>

          {/* Lifespan & Emission */}
          <CollapsibleSection
            title="Lifespan &amp; Click Explosions"
            icon={<Zap size={12} />}
            persistKey="ParticleControls-lifespan-click-explosions"
            defaultOpen={false}
          >
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
                  {config.burstSpeed.toFixed(1)}x
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </CollapsibleSection>
    </div>
  );
};
