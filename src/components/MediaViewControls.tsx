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
}> = ({ value, min = -100, max = 100, step = 1, disabled = false, onChange }) => {
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
    if (raw === '-' || raw === '') return;
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

interface LevelsControlProps {
  black: number; // 0..100
  midtones: number; // 0..100
  white: number; // 0..100
  onChange: (black: number, midtones: number, white: number) => void;
}

const LevelsControl: React.FC<LevelsControlProps> = ({
  black = 0,
  midtones = 50,
  white = 100,
  onChange,
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  const calculateNormalizedGamma = (b: number, m: number, w: number) => {
    const midNorm = (m - b) / Math.max(1, w - b);
    const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));
    return (1 / gamma).toFixed(2);
  };

  const handlePointerDown = (handleIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handleIdx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));

    const distBlack = Math.abs(clickPct - black);
    const distMid = Math.abs(clickPct - midtones);
    const distWhite = Math.abs(clickPct - white);

    let closest = 1;
    if (distBlack < distMid && distBlack < distWhite) closest = 0;
    else if (distWhite < distMid && distWhite < distBlack) closest = 2;

    setActiveHandle(closest);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (closest === 0) {
      const newBlack = Math.min(clickPct, midtones - 1);
      onChange(Math.max(0, newBlack), midtones, white);
    } else if (closest === 1) {
      const newMid = Math.max(black + 1, Math.min(white - 1, clickPct));
      onChange(black, newMid, white);
    } else {
      const newWhite = Math.max(clickPct, midtones + 1);
      onChange(black, midtones, Math.min(100, newWhite));
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeHandle === null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));

    if (activeHandle === 0) {
      const newBlack = Math.min(pct, midtones - 1);
      onChange(Math.max(0, newBlack), midtones, white);
    } else if (activeHandle === 1) {
      const newMid = Math.max(black + 1, Math.min(white - 1, pct));
      onChange(black, newMid, white);
    } else if (activeHandle === 2) {
      const newWhite = Math.max(pct, midtones + 1);
      onChange(black, midtones, Math.min(100, newWhite));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveHandle(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleReset = () => {
    onChange(0, 50, 100);
  };

  return (
    <div className="control-row" style={{ marginBottom: '10px' }}>
      <span className="control-label">
        Levels (B/M/W)
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {Math.round((black / 100) * 255)} • γ {calculateNormalizedGamma(black, midtones, white)} • {Math.round((white / 100) * 255)}
        </div>
      </span>

      <div className="control-input-wrapper">
        {/* Multi-Stop Interactive Gradient Track */}
        <div
          ref={trackRef}
          style={{
            flex: 1,
            position: 'relative',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            touchAction: 'none',
            userSelect: 'none',
          }}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Visual Gradient Track */}
          <div
            style={{
              position: 'absolute',
              left: '6px',
              right: '6px',
              height: '4px',
              borderRadius: '2px',
              background: 'linear-gradient(to right, #000000 0%, #777777 50%, #ffffff 100%)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
            }}
          />

          {/* 1. Black Point Thumb (Left) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${black / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'ew-resize',
              zIndex: activeHandle === 0 ? 10 : 2,
            }}
            onPointerDown={(e) => handlePointerDown(0, e)}
            title={`Black: ${Math.round((black / 100) * 255)} (${black}%)`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#000000',
                border: activeHandle === 0 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 0 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>

          {/* 2. Midtones / Gamma Thumb (Center / Middle) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${midtones / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'grab',
              zIndex: activeHandle === 1 ? 10 : 3,
            }}
            onPointerDown={(e) => handlePointerDown(1, e)}
            title={`Midtones / Gamma: ${midtones}%`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#222222',
                border: activeHandle === 1 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 1 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>

          {/* 3. White Point Thumb (Right) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${white / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'ew-resize',
              zIndex: activeHandle === 2 ? 10 : 2,
            }}
            onPointerDown={(e) => handlePointerDown(2, e)}
            title={`White: ${Math.round((white / 100) * 255)} (${white}%)`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#ffffff',
                border: activeHandle === 2 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 2 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>
        </div>

        {/* Small quick reset button */}
        <button
          className="btn btn-sm"
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            height: '22px',
            color: 'var(--text-muted)',
          }}
          onClick={handleReset}
          title="Reset Levels to [0, 50, 100]"
        >
          RESET
        </button>
      </div>
    </div>
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
        <div className="control-row" style={{ marginBottom: '10px' }}>
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

        {/* Levels 3-Point Multi-Stop Gradient Slider */}
        <LevelsControl
          black={config.levelBlack ?? 0}
          midtones={config.levelMidtones ?? 50}
          white={config.levelWhite ?? 100}
          onChange={(black, midtones, white) => {
            onChangeConfig({
              ...config,
              levelBlack: black,
              levelMidtones: midtones,
              levelWhite: white,
            });
          }}
        />

        {/* Highlights */}
        <div className="control-row">
          <span className="control-label">Highlights</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.highlights}
              onChange={(e) => update('highlights', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.highlights}
              min={-100}
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
              min={-100}
              max={100}
              step={1}
              value={config.midtones}
              onChange={(e) => update('midtones', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.midtones}
              min={-100}
              max={100}
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
              min={-100}
              max={100}
              step={1}
              value={config.shadows}
              onChange={(e) => update('shadows', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.shadows}
              min={-100}
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
