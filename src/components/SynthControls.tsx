import React, { useState, useEffect } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { WaveParams } from '../types/ascii';
import { DEFAULT_WAVE_PARAMS } from '../engine/math';
import {
  Sliders,
  Code2,
  AlertTriangle,
  Plus,
  RefreshCw,
  CircleDot,
  Waves,
  Move,
  RotateCw,
  Eye,
  Disc,
  Radio,
  Sparkles,
} from 'lucide-react';

interface SynthControlsProps {
  params: WaveParams;
  onChangeParams: (updated: WaveParams) => void;
  onResetDynamics?: () => void;
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
  onResetDynamics,
  code,
  prepareCode,
  compileError,
  onChangeFormula,
  isFormulaDivergent,
  onOverrideFormulaWithSliders,
}) => {
  const handleResetDynamics = () => {
    if (onResetDynamics) {
      onResetDynamics();
    } else {
      onChangeParams({
        ...params,
        timeSpeed: DEFAULT_WAVE_PARAMS.timeSpeed,
        aspectRatio: DEFAULT_WAVE_PARAMS.aspectRatio,
        contrast: DEFAULT_WAVE_PARAMS.contrast,
        bias: DEFAULT_WAVE_PARAMS.bias,
        invert: DEFAULT_WAVE_PARAMS.invert,
      });
    }
  };

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
      <CollapsibleSection
        title="PARAMETRIC CONTROLS"
        icon={<Sliders size={13} />}
        badge={
          isFormulaDivergent ? (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                padding: '1px 4px',
                borderRadius: '2px',
              }}
            >
              OVERRIDDEN
            </span>
          ) : undefined
        }
        persistKey="SynthControls-parametric-controls"
        defaultOpen={true}
      >
        {/* Custom Formula Divergence / Greyed out Notice */}
        {isFormulaDivergent && (
          <div
            style={{
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent)',
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
                color: 'var(--accent)',
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
                margin: 0,
                fontSize: '10.5px',
                lineHeight: '1.4',
                color: 'var(--text-secondary)',
              }}
            >
              The visual output is currently driven by the custom JavaScript formula in the
              &quot;Advanced Formula&quot; section below. Sliders are disconnected from the canvas.
            </p>
            <button
              onClick={onOverrideFormulaWithSliders}
              className="btn btn-sm btn-primary"
              style={{ marginTop: '8px', width: '100%', fontSize: '10.5px' }}
            >
              <RefreshCw size={11} style={{ marginRight: '4px' }} />
              Re-link Sliders (Reset to Parametric Mode)
            </button>
          </div>
        )}

        {/* Nested Wave Generators */}
        <div className="collapsible-nest" style={{ marginTop: 0 }}>
          <CollapsibleSection
            title="Global Dynamics"
            icon={<Sliders size={12} />}
            persistKey="SynthControls-global-dynamics"
            onReset={isFormulaDivergent ? undefined : handleResetDynamics}
            resetTitle="Reset global dynamics parameters"
            defaultOpen={true}
          >
            {renderSlider('Time Speed', 'timeSpeed', 0.0, 5.0, 0.05)}
            {renderSlider('Aspect Stretch', 'aspectRatio', 0.2, 3.0, 0.05)}
            {renderSlider('Contrast / Gain', 'contrast', 0.2, 4.0, 0.05)}
            {renderSlider('Luminance Bias', 'bias', -1.0, 1.0, 0.05)}
            <div className="control-row">
              <span className="control-label">Invert Output</span>
              <button
                type="button"
                className={`btn btn-sm ${params.invert ? 'btn-primary' : ''}`}
                onClick={() => update('invert', !params.invert)}
              >
                {params.invert ? 'ON' : 'OFF'}
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Primary Radial Wave"
            icon={<CircleDot size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>sin(dist)</span>}
            persistKey="SynthControls-1-primary-radial-wave"
          >
            {renderSlider('Amplitude', 'radialAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Frequency', 'radialFreq', 0.1, 40.0, 0.1)}
            {renderSlider('Speed', 'radialSpeed', -5.0, 5.0, 0.1)}
            {renderSlider('Center Offset X', 'radialCenterOffsetX', -2.0, 2.0, 0.05)}
            {renderSlider('Center Offset Y', 'radialCenterOffsetY', -2.0, 2.0, 0.05)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Secondary Harmonic Ripple"
            icon={<Waves size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cell Interference</span>}
            persistKey="SynthControls-2-secondary-harmonic-ripple"
          >
            {renderSlider('Amplitude', 'radial2Amp', 0.0, 3.0, 0.05)}
            {renderSlider('Frequency', 'radial2Freq', 0.1, 40.0, 0.1)}
            {renderSlider('Speed', 'radial2Speed', -5.0, 5.0, 0.1)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Directional Waves (X, Y, Diagonal)"
            icon={<Move size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Orthogonal / Plasma</span>}
            persistKey="SynthControls-3-directional-waves-x-y-diagonal"
          >
            {renderSlider('X Wave Amplitude', 'xAmp', 0.0, 3.0, 0.05)}
            {renderSlider('X Frequency', 'xFreq', 0.1, 40.0, 0.1)}
            {renderSlider('X Speed', 'xSpeed', -5.0, 5.0, 0.1)}
            <div style={{ height: '4px' }} />
            {renderSlider('Y Wave Amplitude', 'yAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Y Frequency', 'yFreq', 0.1, 40.0, 0.1)}
            {renderSlider('Y Speed', 'ySpeed', -5.0, 5.0, 0.1)}
            <div style={{ height: '4px' }} />
            {renderSlider('Diagonal Amplitude', 'diagAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Diagonal Frequency', 'diagFreq', 0.1, 40.0, 0.1)}
            {renderSlider('Diagonal Speed', 'diagSpeed', -5.0, 5.0, 0.1)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Angular Spiral Vortex"
            icon={<RotateCw size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>sin(θ * arms)</span>}
            persistKey="SynthControls-4-angular-spiral-vortex"
          >
            {renderSlider('Spiral Amplitude', 'spiralAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Spiral Arms', 'spiralArms', 1, 16, 1, 0)}
            {renderSlider('Rotation Speed', 'spiralSpeed', -5.0, 5.0, 0.1)}
            {renderSlider('Twist Tightness', 'spiralTwist', -10.0, 10.0, 0.1)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Wormhole Tunnel [1 / dist]"
            icon={<Eye size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>3D Perspective</span>}
            persistKey="SynthControls-5-wormhole-tunnel-1-dist"
          >
            {renderSlider('Tunnel Amplitude', 'tunnelAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Tunnel Power / Depth', 'tunnelPower', 0.1, 4.0, 0.05)}
            {renderSlider('Tunnel Speed (Zoom)', 'tunnelSpeed', -5.0, 5.0, 0.1)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Concentric Rings"
            icon={<Disc size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Harmonic Bands</span>}
            persistKey="SynthControls-6-concentric-rings"
          >
            {renderSlider('Rings Amplitude', 'ringsAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Rings Radius', 'ringsRadius', 0.1, 2.0, 0.05)}
            {renderSlider('Expansion Speed', 'ringsSpeed', -5.0, 5.0, 0.1)}
            {renderSlider('Rings Count', 'ringsCount', 1, 20, 1, 0)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Dual Interference Moiré"
            icon={<Radio size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Dual Emitters</span>}
            persistKey="SynthControls-7-dual-interference-moir"
          >
            {renderSlider('Dual Amplitude', 'dualEmitterAmp', 0.0, 3.0, 0.05)}
            {renderSlider('Emitter Spacing', 'dualEmitterSpacing', 0.1, 3.0, 0.05)}
            {renderSlider('Emitter Frequency', 'dualEmitterFreq', 0.1, 30.0, 0.1)}
            {renderSlider('Interference Speed', 'dualEmitterSpeed', -5.0, 5.0, 0.1)}
          </CollapsibleSection>

          <CollapsibleSection
            title="Starfield & Cosmic Sparkle"
            icon={<Sparkles size={12} />}
            badge={<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Procedural Sky</span>}
            persistKey="SynthControls-8-starfield-cosmic-sparkle"
          >
            {renderSlider('Star Brightness', 'starfieldIntensity', 0.0, 2.0, 0.05)}
            {renderSlider('Star Quantity', 'starfieldDensity', 0.1, 5.0, 0.1)}
            {renderSlider('Sparkle Frequency', 'starfieldSpeed', 0.0, 8.0, 0.1)}
            {renderSlider('Star Dispersion', 'starfieldScale', 15, 200, 5, 0)}
          </CollapsibleSection>
        </div>
      </CollapsibleSection>

      {/* ========================================================================= */}
      {/* SECTION 2: ADVANCED (FORMULA CODE) */}
      {/* ========================================================================= */}
      <CollapsibleSection
        title="ADVANCED FORMULA"
        icon={<Code2 size={13} />}
        badge={
          compileError ? (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                padding: '1px 4px',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <AlertTriangle size={10} /> SYNTAX ERROR
            </span>
          ) : undefined
        }
        persistKey="SynthControls-advanced-formula"
        defaultOpen={false}
      >
        <div style={{ marginBottom: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Inputs: <code>x, y, time, dist, dx, dy, cols, rows, angle, ctx</code>
          </span>
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
              fontSize: '10px',
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
              type="button"
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(dist * 0.15 - time * 1.5) * 0.5;')}
              title="Insert Radial Sine Wave"
            >
              <Plus size={10} /> sin(dist)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.cos(dx * 0.10 + time * 1.0) * 0.4;')}
              title="Insert Horizontal Swell"
            >
              <Plus size={10} /> cos(dx)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(dy * 0.10 + time * 1.0) * 0.4;')}
              title="Insert Vertical Swell"
            >
              <Plus size={10} /> sin(dy)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(angle * 4.0 - time * 2.0) * 0.4;')}
              title="Insert Spiral Arms"
            >
              <Plus size={10} /> sin(angle)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                insertSnippet('val += Math.sin(Math.hypot(dx - 15, dy - 8) * 0.2 - time * 2.0) * 0.5;')
              }
              title="Insert Offset Emitter Interference"
            >
              <Plus size={10} /> hypot
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(35 / Math.max(0.1, dist + 2) - time * 2.0) * 0.6;')}
              title="Insert 3D Depth Tunnel"
            >
              <Plus size={10} /> tunnel
            </button>
            <button
              type="button"
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
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
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
      </CollapsibleSection>
    </div>
  );
};
