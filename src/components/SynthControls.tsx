import React, { useState, useEffect } from 'react';
import { WaveParams } from '../types/ascii';
import { DEFAULT_WAVE_PARAMS } from '../engine/math';
import {
  Sliders,
  Code2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface SynthControlsProps {
  params: WaveParams;
  onChangeParams: (updated: WaveParams) => void;
  onResetParams: () => void;
  code: string;
  prepareCode?: string;
  compileError: string | null;
  onChangeFormula: (code: string, prepareCode?: string) => void;
  isFormulaDivergent: boolean;
  onOverrideFormulaWithSliders: () => void;
}

const NumberField: React.FC<{
  value: number;
  decimals?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({ value, decimals = 2, disabled = false, onChange }) => {
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
    if (disabled) return;
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
    if (disabled) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFloat(text);
      const base = isNaN(current) ? value : current;
      const stepVal = e.shiftKey ? 1.0 : decimals === 0 ? 1 : 0.1;
      const nextVal = Number((base + stepVal).toFixed(Math.max(1, decimals)));
      setText(nextVal.toString());
      onChange(nextVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFloat(text);
      const base = isNaN(current) ? value : current;
      const stepVal = e.shiftKey ? 1.0 : decimals === 0 ? 1 : 0.1;
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
      disabled={disabled}
      value={text}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export const SynthControls: React.FC<SynthControlsProps> = ({
  params,
  onChangeParams,
  onResetParams,
  code,
  prepareCode,
  compileError,
  onChangeFormula,
  isFormulaDivergent,
  onOverrideFormulaWithSliders,
}) => {
  // Collapsible section state
  const [isSlidersOpen, setIsSlidersOpen] = useState<boolean>(true);
  const [isFormulaOpen, setIsFormulaOpen] = useState<boolean>(true);

  const update = <K extends keyof WaveParams>(key: K, value: WaveParams[K]) => {
    onChangeParams({
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
            disabled={isFormulaDivergent}
            min={min}
            max={max}
            step={step}
            value={sliderVal}
            onChange={(e) => update(key, parseFloat(e.target.value) as any)}
          />
          <NumberField
            value={val}
            decimals={decimals}
            disabled={isFormulaDivergent}
            onChange={(newVal) => update(key, newVal as any)}
          />
        </div>
      </div>
    );
  };

  const insertSnippet = (snippet: string) => {
    const clean = (code || '').trim();

    if (!clean) {
      onChangeFormula(`let val = 0;\n\n${snippet}\n\nreturn val;`, prepareCode);
      return;
    }

    const returnRegex = /(?:\/\/\s*Final Output\s*\n)?\s*return\b/i;
    const match = clean.match(returnRegex);

    if (match && match.index !== undefined) {
      const insertPos = match.index;
      const before = clean.slice(0, insertPos).trimEnd();
      const after = clean.slice(insertPos).trimStart();

      const needsValInit = !before.includes('let val') && !before.includes('var val');
      const prefix = needsValInit ? 'let val = 0;\n\n' : '';

      const newCode = `${prefix}${before}\n\n${snippet}\n\n${after}`;
      onChangeFormula(newCode, prepareCode);
    } else {
      const needsValInit = !clean.includes('let val') && !clean.includes('var val');
      const prefix = needsValInit ? 'let val = 0;\n\n' : '';
      const newCode = `${prefix}${clean}\n\n${snippet}\n\nreturn val;`;
      onChangeFormula(newCode, prepareCode);
    }
  };

  return (
    <div className="tab-content" style={{ gap: '12px' }}>
      {/* ========================================================================= */}
      {/* SECTION 1: PARAMETRIC CONTROLS (SLIDERS) */}
      {/* ========================================================================= */}
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-panel)',
          overflow: 'hidden',
        }}
      >
        {/* Section Header Toggle */}
        <button
          onClick={() => setIsSlidersOpen(!isSlidersOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--bg-control)',
            border: 'none',
            borderBottom: isSlidersOpen ? '1px solid var(--border-color)' : 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={13} style={{ color: 'var(--accent)' }} />
            <span>PARAMETRIC CONTROLS</span>
            {isFormulaDivergent && (
              <span
                style={{
                  fontSize: '9px',
                  color: '#ffb000',
                  border: '1px solid rgba(255,176,0,0.4)',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  marginLeft: '4px',
                }}
              >
                OVERRIDDEN
              </span>
            )}
          </div>
          {isSlidersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Sliders Content */}
        {isSlidersOpen && (
          <div style={{ padding: '10px' }}>
            {/* Custom Formula Divergence / Greyed out Notice */}
            {isFormulaDivergent && (
              <div
                style={{
                  background: 'rgba(255, 176, 0, 0.08)',
                  border: '1px solid rgba(255, 176, 0, 0.35)',
                  borderRadius: '4px',
                  padding: '10px 12px',
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
                  <span>CUSTOM FORMULA OVERRIDE ACTIVE</span>
                </div>
                <p
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.35,
                    margin: '0 0 8px 0',
                  }}
                >
                  The formula code contains custom expressions that do not match these sliders.
                  Sliders are currently disabled to prevent accidental formula corruption.
                </p>
                <button
                  className="btn btn-sm btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                  }}
                  onClick={onOverrideFormulaWithSliders}
                  title="Strip custom formula expressions and regenerate from slider parameters"
                >
                  <RefreshCw size={11} /> OVERRIDE FORMULA WITH SLIDERS
                </button>
              </div>
            )}

            {/* Sliders Area (Greyed out when divergent) */}
            <div
              style={{
                opacity: isFormulaDivergent ? 0.38 : 1,
                filter: isFormulaDivergent ? 'grayscale(0.85)' : 'none',
                pointerEvents: isFormulaDivergent ? 'none' : 'auto',
                transition: 'opacity 0.2s ease, filter 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Global & Matrix Settings */}
              <div className="control-section" style={{ padding: 0 }}>
                <div className="section-header">
                  <span>Global Dynamics</span>
                  <button className="btn btn-sm" onClick={onResetParams} disabled={isFormulaDivergent}>
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
                    disabled={isFormulaDivergent}
                    onClick={() => update('invert', !params.invert)}
                  >
                    {params.invert ? 'INVERTED [ON]' : 'NORMAL [OFF]'}
                  </button>
                </div>
              </div>

              {/* 1. Primary Radial Wave */}
              <div className="control-section" style={{ padding: 0 }}>
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
              <div className="control-section" style={{ padding: 0 }}>
                <div className="section-header">
                  <span>2. Secondary Harmonic Ripple</span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Cell Interference</span>
                </div>
                {renderSlider('Harmonic Amplitude', 'radial2Amp', 0.0, 2.0, 0.05)}
                {renderSlider('Harmonic Frequency', 'radial2Freq', 0.02, 0.6, 0.01)}
                {renderSlider('Harmonic Speed', 'radial2Speed', -4.0, 4.0, 0.1)}
              </div>

              {/* 3. Directional Waves */}
              <div className="control-section" style={{ padding: 0 }}>
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
              <div className="control-section" style={{ padding: 0 }}>
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
              <div className="control-section" style={{ padding: 0 }}>
                <div className="section-header">
                  <span>5. Wormhole Tunnel [1 / dist]</span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>3D Perspective</span>
                </div>
                {renderSlider('Tunnel Amplitude', 'tunnelAmp', 0.0, 2.0, 0.05)}
                {renderSlider('Warp Power', 'tunnelPower', 5, 80, 1, 0)}
                {renderSlider('Tunnel Speed', 'tunnelSpeed', -4.0, 4.0, 0.1)}
              </div>

              {/* 6. Concentric Rings */}
              <div className="control-section" style={{ padding: 0 }}>
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
              <div className="control-section" style={{ padding: 0 }}>
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
              <div className="control-section" style={{ padding: 0 }}>
                <div className="section-header">
                  <span>8. Starfield / Sparkle Texture</span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Noise Matrix</span>
                </div>
                {renderSlider('Starfield Sparkle', 'starfieldIntensity', 0.0, 1.0, 0.05)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: ADVANCED (FORMULA CODE) */}
      {/* ========================================================================= */}
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-panel)',
          overflow: 'hidden',
        }}
      >
        {/* Section Header Toggle */}
        <button
          onClick={() => setIsFormulaOpen(!isFormulaOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--bg-control)',
            border: 'none',
            borderBottom: isFormulaOpen ? '1px solid var(--border-color)' : 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Code2 size={13} style={{ color: 'var(--accent)' }} />
            <span>ADVANCED (FORMULA CODE)</span>
            {compileError ? (
              <span
                style={{
                  fontSize: '9px',
                  color: '#ff3344',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  marginLeft: '4px',
                }}
              >
                <AlertTriangle size={10} /> SYNTAX ERROR
              </span>
            ) : (
              <span
                style={{
                  fontSize: '9px',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  marginLeft: '4px',
                }}
              >
                <CheckCircle2 size={10} /> LIVE SYNC
              </span>
            )}
          </div>
          {isFormulaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Formula Editor Content */}
        {isFormulaOpen && (
          <div style={{ padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Inputs: <code>x, y, time, dist, dx, dy, cols, rows, angle, ctx</code>
              </span>
              <button
                className="btn btn-sm"
                onClick={onOverrideFormulaWithSliders}
                title="Reset formula to match current Synth sliders"
                style={{ fontSize: '9.5px', padding: '2px 6px' }}
              >
                <RotateCcw size={10} /> RESET TO SLIDERS
              </button>
            </div>

            {/* Main Render Code Editor */}
            <textarea
              className="code-editor-area"
              style={{ minHeight: '220px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              value={code}
              onChange={(e) => onChangeFormula(e.target.value, prepareCode)}
              spellCheck={false}
              placeholder="return Math.sin(dist * 0.1 - time);"
            />

            {compileError && (
              <div className="code-error-box" style={{ marginTop: '6px' }}>
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                <strong>Runtime / Syntax Error:</strong> {compileError}
              </div>
            )}

            {/* Quick math helper buttons */}
            <div style={{ marginTop: '8px' }}>
              <div
                style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Insert Wave Snippet
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += Math.sin(dist * 0.15 - time * 1.5) * 0.5;')}
                  title="Insert Radial Sine Wave"
                >
                  <Plus size={10} /> sin(dist)
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += Math.cos(dx * 0.10 + time * 1.0) * 0.4;')}
                  title="Insert Horizontal Swell"
                >
                  <Plus size={10} /> cos(dx)
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += Math.sin(dy * 0.10 + time * 1.0) * 0.4;')}
                  title="Insert Vertical Swell"
                >
                  <Plus size={10} /> sin(dy)
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += Math.sin(angle * 4.0 - time * 2.0) * 0.4;')}
                  title="Insert Spiral Arms"
                >
                  <Plus size={10} /> sin(angle)
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    insertSnippet('val += Math.sin(Math.hypot(dx - 15, dy - 8) * 0.2 - time * 2.0) * 0.5;')
                  }
                  title="Insert Offset Emitter Interference"
                >
                  <Plus size={10} /> hypot
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += Math.sin(35 / Math.max(0.1, dist + 2) - time * 2.0) * 0.6;')}
                  title="Insert 3D Depth Tunnel"
                >
                  <Plus size={10} /> tunnel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => insertSnippet('val += (1 / (Math.abs(dist - 25) + 1)) * 0.8;')}
                  title="Insert Concentric Harmonic Ring"
                >
                  <Plus size={10} /> rings
                </button>
              </div>
            </div>

            {/* Optional ctx.prepare frame state */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                Optional Frame State (<code>ctx.prepare</code>):
              </div>
              <textarea
                className="code-editor-area"
                style={{ minHeight: '55px', fontSize: '10.5px' }}
                value={prepareCode || ''}
                onChange={(e) => onChangeFormula(code, e.target.value)}
                spellCheck={false}
                placeholder="// e.g. ctx.activeWaves = [...];"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
