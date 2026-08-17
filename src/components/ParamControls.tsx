import React, { useState, useEffect } from 'react';
import { WaveParams } from '../types/ascii';
import { DEFAULT_WAVE_PARAMS } from '../engine/math';
import { AlertTriangle, Code2, Trash2 } from 'lucide-react';

interface ParamControlsProps {
  params: WaveParams;
  onChange: (updated: WaveParams) => void;
  onReset: () => void;
  hasCustomFormula?: boolean;
  onGoToFormula?: () => void;
  onRemoveCustomFormula?: () => void;
}

const NumberField: React.FC<{
  value: number;
  decimals?: number;
  onChange: (val: number) => void;
}> = ({ value, decimals = 2, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(
        decimals === 0
          ? Math.round(value).toString()
          : Number(value.toFixed(decimals)).toString()
      );
    }
  }, [value, decimals, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(text);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      onChange(parsed);
      setText(
        decimals === 0
          ? Math.round(parsed).toString()
          : Number(parsed.toFixed(decimals)).toString()
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFloat(text);
      const base = isNaN(current) ? value : current;
      const stepVal = e.shiftKey ? 1.0 : (decimals === 0 ? 1 : 0.1);
      const nextVal = Number((base + stepVal).toFixed(Math.max(1, decimals)));
      setText(nextVal.toString());
      onChange(nextVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFloat(text);
      const base = isNaN(current) ? value : current;
      const stepVal = e.shiftKey ? 1.0 : (decimals === 0 ? 1 : 0.1);
      const nextVal = Number((base - stepVal).toFixed(Math.max(1, decimals)));
      setText(nextVal.toString());
      onChange(nextVal);
    }
  };

  return (
    <input
      type="number"
      step="0.1"
      className="number-input"
      value={text}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export const ParamControls: React.FC<ParamControlsProps> = ({
  params,
  onChange,
  onReset,
  hasCustomFormula,
  onGoToFormula,
  onRemoveCustomFormula,
}) => {
  const update = <K extends keyof WaveParams>(key: K, value: WaveParams[K]) => {
    onChange({
      ...params,
      [key]: value,
    });
  };

  const renderSlider = (
    label: string,
    key: keyof WaveParams,
    min: number,
    max: number,
    step: number,
    decimals: number = 2
  ) => {
    const val = Number(params[key] ?? DEFAULT_WAVE_PARAMS[key] ?? 0);
    const sliderVal = Math.max(min, Math.min(max, val));

    return (
      <div className="control-row">
        <span className="control-label">{label}</span>
        <div className="control-input-wrapper">
          <input
            type="range"
            className="range-slider"
            min={min}
            max={max}
            step={step}
            value={sliderVal}
            onChange={(e) => update(key, parseFloat(e.target.value) as any)}
          />
          <NumberField
            value={val}
            decimals={decimals}
            onChange={(newVal) => update(key, newVal as any)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="tab-content">
      {/* Custom Formula Active Banner */}
      {hasCustomFormula && (
        <div
          style={{
            background: 'rgba(255, 176, 0, 0.08)',
            border: '1px solid rgba(255, 176, 0, 0.35)',
            borderRadius: '4px',
            padding: '8px 10px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#ffb000',
              fontWeight: 700,
              fontSize: '11px',
              marginBottom: '3px',
            }}
          >
            <AlertTriangle size={12} />
            <span>CUSTOM FORMULA ACTIVE</span>
          </div>
          <p
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              lineHeight: 1.35,
              margin: '0 0 8px 0',
            }}
          >
            Some custom formula code is applied and not directly editable here.
            <br />
            Editing the parameters here will remove the custom code.
          </p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-sm"
              style={{
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '10px',
              }}
              onClick={onGoToFormula}
              title="Open Formula tab to view and edit custom math code"
            >
              <Code2 size={11} /> EDIT
            </button>
            <button
              className="btn btn-sm"
              style={{
                color: '#ff3344',
                borderColor: '#ff3344',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '10px',
              }}
              onClick={onRemoveCustomFormula}
              title="Strip custom formula expressions and synchronize strictly to Synth sliders"
            >
              <Trash2 size={11} /> REMOVE
            </button>
          </div>
        </div>
      )}

      {/* Global & Matrix Settings */}
      <div className="control-section">
        <div className="section-header">
          <span>Global Dynamics</span>
          <button className="btn btn-sm" onClick={onReset}>
            DEFAULT
          </button>
        </div>
        {renderSlider('Time Speed', 'timeSpeed', 0.0, 3.0, 0.05)}
        {renderSlider('Aspect Compensation', 'aspectRatio', 0.5, 1.5, 0.025)}
        {renderSlider('Contrast', 'contrast', 0.2, 3.0, 0.1)}
        {renderSlider('Brightness Bias', 'bias', -1.0, 1.0, 0.05)}
        
        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label">Invert Characters</span>
          <button
            className={`btn btn-sm ${params.invert ? 'btn-primary' : ''}`}
            onClick={() => update('invert', !params.invert)}
          >
            {params.invert ? 'INVERTED [ON]' : 'NORMAL [OFF]'}
          </button>
        </div>
      </div>

      {/* 1. Primary Radial Wave */}
      <div className="control-section">
        <div className="section-header">
          <span>1. Primary Radial Wave</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>sin(dist)</span>
        </div>
        {renderSlider('Amplitude', 'radialAmp', 0.0, 2.0, 0.05)}
        {renderSlider('Frequency', 'radialFreq', 0.01, 0.4, 0.01)}
        {renderSlider('Wave Speed', 'radialSpeed', -3.0, 3.0, 0.1)}
        {renderSlider('Center Offset X', 'radialCenterOffsetX', -40, 40, 1, 0)}
        {renderSlider('Center Offset Y', 'radialCenterOffsetY', -20, 20, 1, 0)}
      </div>

      {/* 2. Secondary Harmonic Ripple */}
      <div className="control-section">
        <div className="section-header">
          <span>2. Secondary Harmonic Ripple</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Cell Interference</span>
        </div>
        {renderSlider('Harmonic Amplitude', 'radial2Amp', 0.0, 2.0, 0.05)}
        {renderSlider('Harmonic Frequency', 'radial2Freq', 0.02, 0.6, 0.01)}
        {renderSlider('Harmonic Speed', 'radial2Speed', -4.0, 4.0, 0.1)}
      </div>

      {/* 3. Directional Waves */}
      <div className="control-section">
        <div className="section-header">
          <span>3. Directional Waves (X, Y, Diagonal)</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Orthogonal / Plasma</span>
        </div>
        {renderSlider('X Amplitude', 'xAmp', 0.0, 1.5, 0.05)}
        {renderSlider('X Frequency', 'xFreq', 0.01, 0.3, 0.01)}
        {renderSlider('X Speed', 'xSpeed', -2.0, 2.0, 0.1)}
        <hr style={{ borderColor: 'var(--border-color)', margin: '6px 0' }} />
        {renderSlider('Y Amplitude', 'yAmp', 0.0, 1.5, 0.05)}
        {renderSlider('Y Frequency', 'yFreq', 0.01, 0.3, 0.01)}
        {renderSlider('Y Speed', 'ySpeed', -2.0, 2.0, 0.1)}
        <hr style={{ borderColor: 'var(--border-color)', margin: '6px 0' }} />
        {renderSlider('Diagonal (X+Y) Amp', 'diagAmp', 0.0, 1.5, 0.05)}
        {renderSlider('Diagonal Frequency', 'diagFreq', 0.01, 0.3, 0.01)}
        {renderSlider('Diagonal Speed', 'diagSpeed', -2.0, 2.0, 0.1)}
      </div>

      {/* 4. Spiral / Vortex */}
      <div className="control-section">
        <div className="section-header">
          <span>4. Angular Spiral Vortex</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>sin(θ * arms)</span>
        </div>
        {renderSlider('Spiral Amplitude', 'spiralAmp', 0.0, 2.0, 0.05)}
        {renderSlider('Arm Count', 'spiralArms', 1, 12, 1, 0)}
        {renderSlider('Rotation Speed', 'spiralSpeed', -5.0, 5.0, 0.1)}
        {renderSlider('Spiral Twist', 'spiralTwist', 0.0, 0.4, 0.01)}
      </div>

      {/* 5. Depth / Tunnel Warp */}
      <div className="control-section">
        <div className="section-header">
          <span>5. Wormhole Tunnel [1 / dist]</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>3D Perspective</span>
        </div>
        {renderSlider('Tunnel Amplitude', 'tunnelAmp', 0.0, 2.0, 0.05)}
        {renderSlider('Warp Power', 'tunnelPower', 5, 80, 1, 0)}
        {renderSlider('Tunnel Speed', 'tunnelSpeed', -4.0, 4.0, 0.1)}
      </div>

      {/* 6. Concentric Rings */}
      <div className="control-section">
        <div className="section-header">
          <span>6. Concentric Rings</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Harmonic Bands</span>
        </div>
        {renderSlider('Rings Amplitude', 'ringsAmp', 0.0, 2.0, 0.05)}
        {renderSlider('Base Radius', 'ringsRadius', 5, 80, 1, 0)}
        {renderSlider('Pulse Speed', 'ringsSpeed', -4.0, 4.0, 0.1)}
        {renderSlider('Ring Multiplier', 'ringsCount', 1, 6, 1, 0)}
      </div>

      {/* 7. Dual Interference */}
      <div className="control-section">
        <div className="section-header">
          <span>7. Dual Interference Moiré</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Dual Emitters</span>
        </div>
        {renderSlider('Interference Amp', 'dualEmitterAmp', 0.0, 2.0, 0.05)}
        {renderSlider('Emitter Spacing', 'dualEmitterSpacing', 5, 60, 1, 0)}
        {renderSlider('Wave Frequency', 'dualEmitterFreq', 0.02, 0.4, 0.01)}
        {renderSlider('Wave Speed', 'dualEmitterSpeed', -4.0, 4.0, 0.1)}
      </div>

      {/* 8. Starfield & Sparkle */}
      <div className="control-section">
        <div className="section-header">
          <span>8. Starfield / Sparkle Texture</span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Noise Matrix</span>
        </div>
        {renderSlider('Starfield Sparkle', 'starfieldIntensity', 0.0, 1.0, 0.05)}
      </div>
    </div>
  );
};
