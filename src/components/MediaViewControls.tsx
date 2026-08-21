import React, { useState, useEffect } from 'react';
import { MediaViewConfig, DitherAlgorithm, ResamplingMode, BackgroundMode } from '../types/ascii';
import { Settings2, Sliders, Moon, Sun, Sparkles, Activity, RotateCcw } from 'lucide-react';

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
  onResetDefaults?: () => void;
}

const NumberInput: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({ value, min = 0, max = 100, step = 1, disabled = false, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value.toString());
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    setText(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    setIsFocused(false);
    const parsed = parseInt(text, 10);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      const validVal = Math.max(min, Math.min(max, parsed));
      setText(validVal.toString());
      onChange(validVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      className="number-input"
      style={{
        width: '54px',
        padding: '2px 4px',
        fontSize: '11px',
        textAlign: 'right',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => !disabled && setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export const MediaViewControls: React.FC<MediaViewControlsProps> = ({
  config,
  onChangeConfig,
  onResetDefaults,
}) => {
  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const algorithms: { id: DitherAlgorithm; label: string }[] = [
    { id: 'floyd-steinberg', label: 'Floyd Steinberg' },
    { id: 'atkinson', label: 'Atkinson (Mac 1-Bit)' },
    { id: 'bayer-4x4', label: 'Bayer 4x4 (Matrix)' },
    { id: 'bayer-8x8', label: 'Bayer 8x8 (Smooth)' },
    { id: 'sierra', label: 'Sierra Lite' },
    { id: 'noise', label: 'Random Noise' },
    { id: 'none', label: 'None (Direct Quantize)' },
  ];

  const resamplingModes: { id: ResamplingMode; label: string }[] = [
    { id: 'preserve-details', label: 'Preserve Details (High)' },
    { id: 'bilinear', label: 'Bilinear (Smooth)' },
    { id: 'nearest', label: 'Nearest (Pixelated)' },
  ];

  const backgroundModes: { id: BackgroundMode; label: string }[] = [
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
    { id: 'transparent', label: 'Transparent' },
  ];

  return (
    <div className="tab-content">
      {/* 1. RENDER SETTINGS */}
      <div className="control-section">
        <div className="section-header">
          <span>RENDER SETTINGS</span>
          <Settings2 size={12} />
        </div>

        {/* Input DPI */}
        <div className="control-row">
          <span className="control-label">Input DPI / Sampling</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={36}
              max={300}
              step={6}
              value={config.inputDpi}
              onChange={(e) => update('inputDpi', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.inputDpi}
              min={36}
              max={300}
              step={6}
              onChange={(val) => update('inputDpi', val)}
            />
          </div>
        </div>

        {/* Resampling Mode Dropdown */}
        <div className="control-row">
          <span className="control-label">Resampling</span>
          <select
            className="number-input"
            style={{ width: '150px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.resampling}
            onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
          >
            {resamplingModes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dithering Algorithm Dropdown */}
        <div className="control-row">
          <span className="control-label">Algorithm</span>
          <select
            className="number-input"
            style={{ width: '150px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.algorithm}
            onChange={(e) => update('algorithm', e.target.value as DitherAlgorithm)}
          >
            {algorithms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Toggles: Invert & Edge Detection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
          <button
            className={`btn btn-sm ${config.invert ? 'btn-primary' : ''}`}
            onClick={() => update('invert', !config.invert)}
          >
            {config.invert ? <Sun size={11} /> : <Moon size={11} />}
            INVERT {config.invert ? '[ON]' : '[OFF]'}
          </button>

          <button
            className={`btn btn-sm ${config.edgeDetection ? 'btn-primary' : ''}`}
            onClick={() => update('edgeDetection', !config.edgeDetection)}
          >
            <Activity size={11} />
            OUTLINE {config.edgeDetection ? '[ON]' : '[OFF]'}
          </button>
        </div>

        {/* Edge Detection Threshold & Strength (if active) */}
        {config.edgeDetection && (
          <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-control)', borderRadius: '3px' }}>
            <div className="control-row" style={{ marginBottom: '6px' }}>
              <span className="control-label" style={{ fontSize: '10.5px' }}>Edge Threshold</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={5}
                  max={90}
                  step={1}
                  value={config.edgeThreshold}
                  onChange={(e) => update('edgeThreshold', parseInt(e.target.value))}
                />
                <span style={{ fontSize: '10px', minWidth: '28px', textAlign: 'right' }}>
                  {config.edgeThreshold}
                </span>
              </div>
            </div>

            <div className="control-row">
              <span className="control-label" style={{ fontSize: '10.5px' }}>Edge Strength</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={10}
                  max={200}
                  step={5}
                  value={config.edgeStrength}
                  onChange={(e) => update('edgeStrength', parseInt(e.target.value))}
                />
                <span style={{ fontSize: '10px', minWidth: '28px', textAlign: 'right' }}>
                  {config.edgeStrength}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. EFFECT CONTROLS */}
      <div className="control-section">
        <div className="section-header">
          <span>EFFECT CONTROLS</span>
          <Sliders size={12} />
        </div>

        {/* Sharpen Strength */}
        <div className="control-row">
          <span className="control-label">Sharpen Strength</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={300}
              step={5}
              value={config.sharpenStrength}
              onChange={(e) => update('sharpenStrength', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.sharpenStrength}
              min={0}
              max={300}
              step={5}
              onChange={(val) => update('sharpenStrength', val)}
            />
          </div>
        </div>

        {/* Sharpen Radius */}
        <div className="control-row">
          <span className="control-label">Sharpen Radius</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={1}
              max={10}
              step={1}
              value={config.sharpenRadius}
              onChange={(e) => update('sharpenRadius', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.sharpenRadius}
              min={1}
              max={10}
              step={1}
              onChange={(val) => update('sharpenRadius', val)}
            />
          </div>
        </div>

        {/* Noise */}
        <div className="control-row">
          <span className="control-label">Noise / Grain</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.noise}
              onChange={(e) => update('noise', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.noise}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('noise', val)}
            />
          </div>
        </div>

        {/* Denoise */}
        <div className="control-row">
          <span className="control-label">Denoise</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.denoise}
              onChange={(e) => update('denoise', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.denoise}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('denoise', val)}
            />
          </div>
        </div>

        {/* Blur */}
        <div className="control-row">
          <span className="control-label">Blur</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={20}
              step={1}
              value={config.blur}
              onChange={(e) => update('blur', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.blur}
              min={0}
              max={20}
              step={1}
              onChange={(val) => update('blur', val)}
            />
          </div>
        </div>

        {/* Brightness */}
        <div className="control-row">
          <span className="control-label">Brightness</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.brightness}
              onChange={(e) => update('brightness', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.brightness}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('brightness', val)}
            />
          </div>
        </div>

        {/* Contrast */}
        <div className="control-row">
          <span className="control-label">Contrast</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.contrast}
              onChange={(e) => update('contrast', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.contrast}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('contrast', val)}
            />
          </div>
        </div>
      </div>

      {/* 3. TONAL CONTROLS */}
      <div className="control-section">
        <div className="section-header">
          <span>TONAL CONTROLS</span>
          <Sparkles size={12} />
        </div>

        {/* Tonal Mapping Mode */}
        <div className="control-row">
          <span className="control-label">Tonal Mapping</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {[
              { id: '1-color', label: '1 Color' },
              { id: 'grayscale', label: 'Grayscale' },
            ].map((tm) => (
              <button
                key={tm.id}
                className={`btn btn-sm ${config.tonalMapping === tm.id ? 'btn-primary' : ''}`}
                onClick={() => update('tonalMapping', tm.id as any)}
              >
                {tm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Highlights */}
        <div className="control-row">
          <span className="control-label">Highlights</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.highlights}
              onChange={(e) => update('highlights', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.highlights}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('highlights', val)}
            />
          </div>
        </div>

        {/* Midtones */}
        <div className="control-row">
          <span className="control-label">Midtones</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-50}
              max={50}
              step={1}
              value={config.midtones}
              onChange={(e) => update('midtones', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.midtones}
              min={-50}
              max={50}
              step={1}
              onChange={(val) => update('midtones', val)}
            />
          </div>
        </div>

        {/* Shadows */}
        <div className="control-row">
          <span className="control-label">Shadows</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.shadows}
              onChange={(e) => update('shadows', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.shadows}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('shadows', val)}
            />
          </div>
        </div>

        {/* Background Handling */}
        <div className="control-row">
          <span className="control-label">Background</span>
          <select
            className="number-input"
            style={{ width: '120px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.background}
            onChange={(e) => update('background', e.target.value as BackgroundMode)}
          >
            {backgroundModes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Alpha Threshold */}
        {config.background === 'transparent' && (
          <div className="control-row">
            <span className="control-label">Alpha Cutoff</span>
            <div className="control-input-wrapper">
              <input
                type="range"
                className="range-slider"
                min={0}
                max={255}
                step={5}
                value={config.alphaThreshold}
                onChange={(e) => update('alphaThreshold', parseInt(e.target.value))}
              />
              <span style={{ fontSize: '10px', minWidth: '28px', textAlign: 'right' }}>
                {config.alphaThreshold}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Reset Defaults */}
      {onResetDefaults && (
        <button
          className="btn btn-sm"
          style={{ width: '100%', color: 'var(--text-muted)' }}
          onClick={onResetDefaults}
        >
          <RotateCcw size={11} />
          RESET VIEW & EFFECT DEFAULTS
        </button>
      )}
    </div>
  );
};
