import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { CHARSETS } from '../engine/renderer';
import {
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  MediaColorConfig,
  AppMode,
  DEFAULT_MEDIA_COLOR_CONFIG,
} from '../types/ascii';
import { Tv, Sparkles, Pipette, Palette, Sliders, Compass, Sun, Moon, BoxSelect, Zap, Paintbrush } from 'lucide-react';

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
  appMode?: AppMode;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

const GRADIENT_PRESETS: PhosphorGradient[] = [
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
  appMode = 'synth',
  mediaColorConfig = DEFAULT_MEDIA_COLOR_CONFIG,
  onChangeMediaColorConfig,
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

  const isContentColorActive = appMode === 'media' && mediaColorConfig.mode === 'content';

  // Shown in the collapsed headers so a shut group still reports its choice.
  const activeCharsetName = CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom';
  const activeColorName = isContentColorActive
    ? 'From Content'
    : gradientConfig
      ? gradientConfig.name || 'Custom Gradient'
      : customThemeColor
        ? 'Custom Colour'
        : THEMES.find((t) => t.id === currentTheme)?.name || '';

  const updateMediaColor = (patch: Partial<MediaColorConfig>) => {
    if (onChangeMediaColorConfig) {
      onChangeMediaColorConfig({
        ...mediaColorConfig,
        ...patch,
      });
    }
  };

  return (
    <div className="tab-content">
      {/* For Media Mode: Master Mode Toggle at very top */}
      {appMode === 'media' && (
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-control)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            padding: '2px',
            marginBottom: '14px',
            gap: '2px',
          }}
        >
          <button
            className={`btn btn-sm ${!isContentColorActive ? 'btn-primary' : ''}`}
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 600,
              border: !isContentColorActive ? '1px solid var(--border-active)' : 'none',
              background: !isContentColorActive ? 'var(--accent)' : 'transparent',
              color: !isContentColorActive ? 'var(--bg-primary)' : 'var(--text-muted)',
              boxShadow: !isContentColorActive ? '0 0 8px var(--accent-glow)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => updateMediaColor({ mode: 'fixed' })}
            title="Use uniform CRT Phosphor themes or linear gradients"
          >
            <Palette size={12} />
            FIXED THEME
          </button>
          <button
            className={`btn btn-sm ${isContentColorActive ? 'btn-primary' : ''}`}
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 600,
              border: isContentColorActive ? '1px solid var(--border-active)' : 'none',
              background: isContentColorActive ? 'var(--accent)' : 'transparent',
              color: isContentColorActive ? 'var(--bg-primary)' : 'var(--text-muted)',
              boxShadow: isContentColorActive ? '0 0 8px var(--accent-glow)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => updateMediaColor({ mode: 'content' })}
            title="Sample character colors directly from source image/video pixels"
          >
            <Sparkles size={12} />
            CONTENT COLOR
          </button>
        </div>
      )}

      {/* 1. Theme or Content Color Section */}
      <CollapsibleSection
        title={isContentColorActive ? 'Content Color Settings' : 'Phosphor Color Theme'}
        icon={<Sparkles size={12} />}
        persistKey="CharsetThemeBar-color"
        badge={activeColorName}
      >

        {isContentColorActive ? (
          /* CONTENT COLOR SETTINGS */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* 1. Color Sampling Algorithm */}
            <div className="control-row">
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <BoxSelect size={11} /> Sampling
              </span>
              <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-control)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <button
                  className={`btn btn-sm ${mediaColorConfig.sampling === 'average' ? 'btn-primary' : ''}`}
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.sampling === 'average' ? 600 : 500,
                    background: mediaColorConfig.sampling === 'average' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.sampling === 'average' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.sampling === 'average' ? 1 : 0.78,
                    border: mediaColorConfig.sampling === 'average' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.sampling === 'average' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ sampling: 'average' })}
                  title="Area Box Average: Smooth spatial pixel average under each character"
                >
                  Area Avg
                </button>
                <button
                  className={`btn btn-sm ${mediaColorConfig.sampling === 'center' ? 'btn-primary' : ''}`}
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.sampling === 'center' ? 600 : 500,
                    background: mediaColorConfig.sampling === 'center' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.sampling === 'center' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.sampling === 'center' ? 1 : 0.78,
                    border: mediaColorConfig.sampling === 'center' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.sampling === 'center' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ sampling: 'center' })}
                  title="Center Pixel: Sharp single-point sample at cell center"
                >
                  Center
                </button>
                <button
                  className={`btn btn-sm ${mediaColorConfig.sampling === 'weighted' ? 'btn-primary' : ''}`}
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.sampling === 'weighted' ? 600 : 500,
                    background: mediaColorConfig.sampling === 'weighted' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.sampling === 'weighted' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.sampling === 'weighted' ? 1 : 0.78,
                    border: mediaColorConfig.sampling === 'weighted' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.sampling === 'weighted' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ sampling: 'weighted' })}
                  title="Luminance Weighted: Preserves sharp foreground details and high-contrast edges"
                >
                  Weighted
                </button>
              </div>
            </div>

            {/* 2. Background Color Controls */}
            <div className="control-row">
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Palette size={11} /> Background
              </span>
              <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-control)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <button
                  className={`btn btn-sm ${mediaColorConfig.bgPreset === 'dark' ? 'btn-primary' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.bgPreset === 'dark' ? 600 : 500,
                    background: mediaColorConfig.bgPreset === 'dark' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.bgPreset === 'dark' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.bgPreset === 'dark' ? 1 : 0.78,
                    border: mediaColorConfig.bgPreset === 'dark' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.bgPreset === 'dark' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ bgPreset: 'dark' })}
                  title="Dark Terminal Background (#0a0a0a) & Terminal Dark UI"
                >
                  <Moon size={11} /> Dark
                </button>
                <button
                  className={`btn btn-sm ${mediaColorConfig.bgPreset === 'white' ? 'btn-primary' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.bgPreset === 'white' ? 600 : 500,
                    background: mediaColorConfig.bgPreset === 'white' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.bgPreset === 'white' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.bgPreset === 'white' ? 1 : 0.78,
                    border: mediaColorConfig.bgPreset === 'white' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.bgPreset === 'white' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ bgPreset: 'white' })}
                  title="White Paper Background (#ffffff) & Paper Light UI"
                >
                  <Sun size={11} /> White
                </button>
                <button
                  className={`btn btn-sm ${mediaColorConfig.bgPreset === 'custom' ? 'btn-primary' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '23px',
                    fontWeight: mediaColorConfig.bgPreset === 'custom' ? 600 : 500,
                    background: mediaColorConfig.bgPreset === 'custom' ? 'var(--accent)' : 'transparent',
                    color: mediaColorConfig.bgPreset === 'custom' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    opacity: mediaColorConfig.bgPreset === 'custom' ? 1 : 0.78,
                    border: mediaColorConfig.bgPreset === 'custom' ? '1px solid var(--border-active)' : '1px solid transparent',
                    boxShadow: mediaColorConfig.bgPreset === 'custom' ? '0 0 6px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => updateMediaColor({ bgPreset: 'custom' })}
                  title="Custom Background Color & Adaptive UI Theme"
                >
                  <Pipette size={11} /> Custom
                </button>
              </div>
            </div>

            {/* Custom Background Color Picker (When 'custom' is active) */}
            {mediaColorConfig.bgPreset === 'custom' && (
              <div className="control-row" style={{ paddingLeft: '8px' }}>
                <span className="control-label" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Custom BG Hex
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="color"
                    style={{
                      width: '24px',
                      height: '20px',
                      padding: 0,
                      border: '1px solid var(--border-color)',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: '2px',
                    }}
                    value={mediaColorConfig.customBg || '#0a0a0a'}
                    onChange={(e) => updateMediaColor({ customBg: e.target.value, bgPreset: 'custom' })}
                  />
                  <input
                    type="text"
                    className="number-input"
                    style={{ width: '68px', textAlign: 'center', padding: '2px 4px', fontSize: '10.5px' }}
                    value={mediaColorConfig.customBg || '#0a0a0a'}
                    onChange={(e) => updateMediaColor({ customBg: e.target.value, bgPreset: 'custom' })}
                    placeholder="#0a0a0a"
                  />
                </div>
              </div>
            )}

            {/* 3. Saturation / Color Vibrance Slider */}
            <div className="control-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Zap size={11} /> Vibrance
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                <input
                  type="range"
                  className="range-slider"
                  min={0}
                  max={400}
                  step={5}
                  value={Math.min(400, mediaColorConfig.saturation !== undefined ? mediaColorConfig.saturation : 200)}
                  onChange={(e) => updateMediaColor({ saturation: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '90px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <input
                    type="number"
                    min={0}
                    className="number-input"
                    style={{ width: '46px', textAlign: 'center', padding: '2px 4px', fontSize: '10.5px' }}
                    value={mediaColorConfig.saturation !== undefined ? mediaColorConfig.saturation : 200}
                    onChange={(e) => updateMediaColor({ saturation: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* FIXED THEME CONTROLS (Single Color vs Gradient) */
          <>
            {/* Coherent Segmented Tabs: Single Color vs Gradient */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-control)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '2px',
                marginBottom: '12px',
                gap: '2px',
              }}
            >
              <button
                className={`btn btn-sm ${themeMode === 'single' ? 'btn-primary' : ''}`}
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  border: themeMode === 'single' ? '1px solid var(--border-active)' : 'none',
                  background: themeMode === 'single' ? 'var(--accent)' : 'transparent',
                  color: themeMode === 'single' ? 'var(--bg-primary)' : 'var(--text-muted)',
                  boxShadow: themeMode === 'single' ? '0 0 8px var(--accent-glow)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                onClick={handleSwitchToSingle}
              >
                <Paintbrush size={11} />
                SINGLE COLOR
              </button>
              <button
                className={`btn btn-sm ${themeMode === 'gradient' ? 'btn-primary' : ''}`}
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  border: themeMode === 'gradient' ? '1px solid var(--border-active)' : 'none',
                  background: themeMode === 'gradient' ? 'var(--accent)' : 'transparent',
                  color: themeMode === 'gradient' ? 'var(--bg-primary)' : 'var(--text-muted)',
                  boxShadow: themeMode === 'gradient' ? '0 0 8px var(--accent-glow)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                onClick={handleSwitchToGradient}
              >
                <Sliders size={11} />
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
          </>
        )}
      </CollapsibleSection>

      {/* 2. Character Density Ramp */}
      <CollapsibleSection
        title="Character Density Presets"
        persistKey="CharsetThemeBar-character-density-presets"
        badge={activeCharsetName}
      >
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
      </CollapsibleSection>

      {/* 3. CRT & Display Effects */}
      <CollapsibleSection title="CRT &amp; Display Effects" icon={<Tv size={12} />} persistKey="CharsetThemeBar-crt-display-effects">
        {/* 1. CRT Scanlines */}
        <div className="control-row">
          <span className="control-label">CRT Scanlines</span>
          <button
            className={`btn btn-sm ${crtConfig.scanlines ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('scanlines', !crtConfig.scanlines)}
          >
            {crtConfig.scanlines ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        {/* 2. CRT Glow (Centered Background Ambient Glow) */}
        <div className="control-row" style={{ opacity: isContentColorActive ? 0.45 : 1 }}>
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            CRT Glow
            {isContentColorActive && <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>(Disabled in Content Color)</span>}
          </span>
          <button
            className={`btn btn-sm ${crtConfig.crtGlow && !isContentColorActive ? 'btn-primary' : ''}`}
            disabled={isContentColorActive}
            onClick={() => updateCrt('crtGlow', !crtConfig.crtGlow)}
          >
            {isContentColorActive ? 'DISABLED [OFF]' : crtConfig.crtGlow ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        {/* 3. CRT Corner Vignette */}
        <div className="control-row">
          <span className="control-label">CRT Corner Vignette</span>
          <button
            className={`btn btn-sm ${crtConfig.vignette ? 'btn-primary' : ''}`}
            onClick={() => updateCrt('vignette', !crtConfig.vignette)}
          >
            {crtConfig.vignette ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>

        {/* 4. Phosphor Bloom (Character Soft Blur) */}
        <div className="control-row" style={{ opacity: isContentColorActive ? 0.45 : 1 }}>
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Phosphor Bloom
            {isContentColorActive && <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>(Disabled in Content Color)</span>}
          </span>
          <button
            className={`btn btn-sm ${crtConfig.phosphorBloom && !isContentColorActive ? 'btn-primary' : ''}`}
            disabled={isContentColorActive}
            onClick={() => updateCrt('phosphorBloom', !crtConfig.phosphorBloom)}
          >
            {isContentColorActive ? 'DISABLED [OFF]' : crtConfig.phosphorBloom ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
};
