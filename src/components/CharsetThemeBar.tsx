import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CHARSETS } from '../engine/renderer';
import { PhosphorTheme, CrtConfig, PhosphorGradient } from '../types/ascii';
import { Tv, Sparkles, Pipette, Palette, Sliders, Compass } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  gradientConfig?: PhosphorGradient | null;
  onChangeGradient?: (grad: PhosphorGradient | null) => void;
  crtConfig: CrtConfig;
  onChangeCrtConfig: (cfg: CrtConfig) => void;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

export const GRADIENT_PRESETS: PhosphorGradient[] = [
  { id: 'cyberpunk', name: 'Cyberpunk Neon', color1: '#ff007f', color2: '#00f0ff', angle: 135 },
  { id: 'synthwave', name: 'Synthwave Sunset', color1: '#ff7700', color2: '#9900ff', angle: 135 },
  { id: 'aurora', name: 'Aurora Borealis', color1: '#00ff99', color2: '#0066ff', angle: 90 },
  { id: 'solar', name: 'Solar Flare', color1: '#ff2a40', color2: '#ffcc00', angle: 180 },
  { id: 'toxic', name: 'Toxic Slime', color1: '#a8ff00', color2: '#00e5ff', angle: 135 },
  { id: 'deep-ocean', name: 'Deep Ocean', color1: '#00c6ff', color2: '#002661', angle: 180 },
  { id: 'laser-violet', name: 'Laser Violet', color1: '#ff2a85', color2: '#4f00bc', angle: 135 },
  { id: 'matrix-forest', name: 'Matrix Forest', color1: '#00ff88', color2: '#004d25', angle: 180 },
];

/**
 * Interactive rotative knob / dial to smoothly adjust the gradient angle (0°–360°).
 */
const AngleDial: React.FC<{
  value: number;
  onChange: (deg: number) => void;
}> = ({ value, onChange }) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const calculateAngle = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // Angle in degrees clockwise from 12 o'clock (UP) matching CSS linear-gradient
      let deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
      if (deg < 0) deg += 360;
      onChange(deg);
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    calculateAngle(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    calculateAngle(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        ref={dialRef}
        className="angle-dial-knob"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Click & drag around center to rotate angle"
      >
        <div
          className="angle-dial-needle"
          style={{ transform: `rotate(${value}deg)` }}
        />
        <div className="angle-dial-center-dot" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <input
          type="number"
          min={0}
          max={360}
          className="number-input"
          style={{ width: '42px', textAlign: 'center', padding: '2px 4px', fontSize: '10.5px' }}
          value={value}
          onChange={(e) => {
            const v = (parseInt(e.target.value, 10) || 0) % 360;
            onChange(v < 0 ? v + 360 : v);
          }}
        />
        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>°</span>
      </div>
    </div>
  );
};

export const CharsetThemeBar: React.FC<CharsetThemeBarProps> = ({
  currentCharset,
  onChangeCharset,
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  gradientConfig = null,
  onChangeGradient,
  crtConfig,
  onChangeCrtConfig,
}) => {
  const [themeMode, setThemeMode] = useState<'single' | 'gradient'>(gradientConfig ? 'gradient' : 'single');
  const [customHex, setCustomHex] = useState<string>(customThemeColor || '#00ff66');

  // Custom Gradient builder state
  const [customGradColor1, setCustomGradColor1] = useState<string>(gradientConfig?.color1 || '#ff007f');
  const [customGradColor2, setCustomGradColor2] = useState<string>(gradientConfig?.color2 || '#00f0ff');
  const [customGradAngle, setCustomGradAngle] = useState<number>(gradientConfig?.angle || 135);

  useEffect(() => {
    if (gradientConfig) {
      setCustomGradColor1(gradientConfig.color1);
      setCustomGradColor2(gradientConfig.color2);
      setCustomGradAngle(gradientConfig.angle);
      setThemeMode('gradient');
    }
  }, [gradientConfig]);

  const updateCrt = <K extends keyof CrtConfig>(key: K, val: CrtConfig[K]) => {
    onChangeCrtConfig({
      ...crtConfig,
      [key]: val,
    });
  };

  const handleCustomColorChange = (hex: string) => {
    setCustomHex(hex);
    if (onChangeGradient) onChangeGradient(null);
    if (onChangeCustomColor) {
      onChangeCustomColor(hex);
    }
  };

  const handleSelectGradient = (grad: PhosphorGradient) => {
    setCustomGradColor1(grad.color1);
    setCustomGradColor2(grad.color2);
    setCustomGradAngle(grad.angle);
    if (onChangeCustomColor) onChangeCustomColor('');
    if (onChangeGradient) onChangeGradient(grad);
  };

  const handleCustomGradientChange = (c1: string, c2: string, angle: number) => {
    setCustomGradColor1(c1);
    setCustomGradColor2(c2);
    setCustomGradAngle(angle);
    if (onChangeCustomColor) onChangeCustomColor('');
    if (onChangeGradient) {
      onChangeGradient({
        id: 'custom',
        name: 'Custom Gradient',
        color1: c1,
        color2: c2,
        angle,
      });
    }
  };

  const handleSwitchToSingle = () => {
    setThemeMode('single');
    if (onChangeGradient) onChangeGradient(null);
  };

  const handleSwitchToGradient = () => {
    setThemeMode('gradient');
    if (!gradientConfig && onChangeGradient) {
      handleSelectGradient(GRADIENT_PRESETS[0]);
    }
  };

  return (
    <div className="tab-content">
      {/* 1. Phosphor Theme */}
      <div className="control-section">
        <div className="section-header">
          <span>Phosphor Color Theme</span>
          <Sparkles size={12} style={{ color: 'var(--accent)' }} />
        </div>

        {/* Section Segmented Mode Tabs: Single Color vs Gradient */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
          <button
            className={`btn ${themeMode === 'single' ? 'btn-primary' : ''}`}
            style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }}
            onClick={handleSwitchToSingle}
          >
            <Palette size={12} />
            SINGLE COLOR
          </button>
          <button
            className={`btn ${themeMode === 'gradient' ? 'btn-primary' : ''}`}
            style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }}
            onClick={handleSwitchToGradient}
          >
            <Sliders size={12} />
            GRADIENT
          </button>
        </div>

        {themeMode === 'single' ? (
          <div>
            {/* Single Color Theme Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
              {THEMES.map((t) => {
                const isSelected = !customThemeColor && !gradientConfig && currentTheme === t.id;
                return (
                  <button
                    key={t.id}
                    className={`btn ${isSelected ? 'btn-primary' : ''}`}
                    style={{
                      justifyContent: 'flex-start',
                      borderLeft: `4px solid ${t.color}`,
                    }}
                    onClick={() => {
                      if (onChangeGradient) onChangeGradient(null);
                      if (onChangeCustomColor) onChangeCustomColor('');
                      onChangeTheme(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>

            {/* Custom Phosphor Accent Color */}
            <div className="control-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Pipette size={11} /> Custom Color
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  style={{
                    width: '28px',
                    height: '24px',
                    padding: 0,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    cursor: 'pointer',
                    borderRadius: '2px',
                  }}
                  value={customHex}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  title="Pick a custom phosphor color"
                />
                <input
                  type="text"
                  className="number-input"
                  style={{ width: '68px', textAlign: 'center', padding: '2px 4px', fontSize: '10.5px' }}
                  value={customHex}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  placeholder="#00ff66"
                />
                {customThemeColor && (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      if (onChangeCustomColor) onChangeCustomColor('');
                    }}
                    title="Reset to default theme"
                  >
                    RESET
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Gradient Presets Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
              {GRADIENT_PRESETS.map((g) => {
                const isSelected = gradientConfig?.id === g.id || (
                  gradientConfig &&
                  gradientConfig.color1.toLowerCase() === g.color1.toLowerCase() &&
                  gradientConfig.color2.toLowerCase() === g.color2.toLowerCase()
                );
                return (
                  <button
                    key={g.id}
                    className={`btn ${isSelected ? 'btn-primary' : ''}`}
                    style={{
                      justifyContent: 'flex-start',
                      position: 'relative',
                      overflow: 'hidden',
                      paddingLeft: '18px',
                    }}
                    onClick={() => handleSelectGradient(g)}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '8px',
                        background: `linear-gradient(${g.angle}deg, ${g.color1}, ${g.color2})`,
                      }}
                    />
                    <span style={{ fontSize: '10.5px' }}>{g.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Gradient Builder */}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <div className="control-row" style={{ marginBottom: '6px' }}>
                <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Pipette size={11} /> Gradient Colors
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Color 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="color"
                      style={{ width: '22px', height: '22px', padding: 0, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                      value={customGradColor1}
                      onChange={(e) => handleCustomGradientChange(e.target.value, customGradColor2, customGradAngle)}
                    />
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>C1</span>
                  </div>
                  {/* Color 2 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="color"
                      style={{ width: '22px', height: '22px', padding: 0, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                      value={customGradColor2}
                      onChange={(e) => handleCustomGradientChange(customGradColor1, e.target.value, customGradAngle)}
                    />
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>C2</span>
                  </div>
                </div>
              </div>

              {/* Rotative Angle Dial + Presets */}
              <div className="control-row">
                <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Compass size={11} /> Angle Dial
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AngleDial
                    value={customGradAngle}
                    onChange={(deg) => handleCustomGradientChange(customGradColor1, customGradColor2, deg)}
                  />
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[0, 90, 135, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        className={`btn btn-sm ${customGradAngle === deg ? 'btn-primary' : ''}`}
                        style={{ padding: '2px 4px', fontSize: '9px' }}
                        onClick={() => handleCustomGradientChange(customGradColor1, customGradColor2, deg)}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Character Density Ramp */}
      <div className="control-section">
        <div className="section-header">
          <span>Character Density Presets</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
          {CHARSETS.map((cs) => {
            const isSelected = currentCharset === cs.chars;
            return (
              <button
                key={cs.id}
                className={`preset-card ${isSelected ? 'active' : ''}`}
                onClick={() => onChangeCharset(cs.chars)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="preset-card-title">{cs.name}</span>
                  <code style={{ fontSize: '11px', color: 'var(--accent)' }}>"{cs.chars}"</code>
                </div>
              </button>
            );
          })}
        </div>

        <div className="control-row">
          <span className="control-label">Custom Density Ramp</span>
        </div>
        <input
          type="text"
          className="number-input"
          style={{ width: '100%', textAlign: 'left', padding: '6px' }}
          value={currentCharset}
          onChange={(e) => onChangeCharset(e.target.value || ' ')}
          placeholder="e.g.  .:-=+*#%@"
        />
      </div>

      {/* 3. CRT & Display Effects */}
      <div className="control-section">
        <div className="section-header">
          <span>CRT & Display Effects</span>
          <Tv size={12} style={{ color: 'var(--accent)' }} />
        </div>

        <div className="control-row">
          <span className="control-label">CRT Scanlines</span>
          <button
            className={`btn btn-sm ${crtConfig.scanlines ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('scanlines', !crtConfig.scanlines)}
          >
            {crtConfig.scanlines ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Phosphor Glow Bloom</span>
          <button
            className={`btn btn-sm ${crtConfig.glow ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('glow', !crtConfig.glow)}
          >
            {crtConfig.glow ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">CRT Corner Vignette</span>
          <button
            className={`btn btn-sm ${crtConfig.vignette ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('vignette', !crtConfig.vignette)}
          >
            {crtConfig.vignette ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>
      </div>
    </div>
  );
};
