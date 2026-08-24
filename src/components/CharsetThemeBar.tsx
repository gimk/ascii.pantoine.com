import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { CHARSETS } from '../engine/renderer';
import {
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  MediaColorConfig,
  AppMode,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
} from '../types/ascii';

import { RasterModeSelector } from './RasterModeSelector';
import { DitherControls } from './DitherControls';
import { PaletteControls } from './PaletteControls';
import { ToneControls } from './ToneControls';
import { Sparkles, Sliders, Compass, Zap, Type } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  gradientConfig?: PhosphorGradient | null;
  onChangeGradient?: (grad: PhosphorGradient | null) => void;
  crtConfig?: CrtConfig;
  onChangeCrtConfig?: (cfg: CrtConfig) => void;
  appMode?: AppMode;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  rasterMode?: RasterOutputMode;
  onChangeRasterMode?: (mode: RasterOutputMode) => void;
  ditherAlgorithm?: DitherAlgorithm;
  onChangeDitherAlgorithm?: (algo: DitherAlgorithm) => void;
  noise?: number;
  onChangeNoise?: (noise: number) => void;
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (cfg: ToneMappingConfig) => void;
  halftoneConfig?: HalftoneConfig;
  onChangeHalftoneConfig?: (cfg: HalftoneConfig) => void;
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
  appMode = 'synth',
  mediaColorConfig = DEFAULT_MEDIA_COLOR_CONFIG,
  onChangeMediaColorConfig,
  rasterMode = 'ascii',
  onChangeRasterMode,
  ditherAlgorithm = 'floyd-steinberg',
  onChangeDitherAlgorithm,
  noise = 0,
  onChangeNoise,
  toneConfig,
  onChangeToneConfig,
}) => {
  const [themeMode, setThemeMode] = useState<'single' | 'gradient'>(gradientConfig ? 'gradient' : 'single');

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

  const isContentColorActive = appMode === 'media' && mediaColorConfig.mode === 'content';

  const activeCharsetName = CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom';
  const activeColorName = isContentColorActive
    ? 'From Content'
    : gradientConfig
      ? gradientConfig.name || 'Custom Gradient'
      : customThemeColor
        ? 'Custom Colour'
        : THEMES.find((t) => t.id === currentTheme)?.name || '';


  return (

    <div className="tab-content">
      {/* 1. Output Modality Selector */}
      {onChangeRasterMode && (
        <RasterModeSelector
          currentMode={rasterMode || 'ascii'}
          onChangeMode={onChangeRasterMode}
        />
      )}

      {/* 2. Dithering Engine Section (40+ Algorithms) */}
      {ditherAlgorithm && onChangeDitherAlgorithm && (
        <CollapsibleSection
          title="Dithering Algorithms (40+)"
          icon={<Sliders size={12} />}
          persistKey="CharsetThemeBar-dither"
          badge={ditherAlgorithm.toUpperCase()}
        >
          <DitherControls
            algorithm={ditherAlgorithm}
            onChangeAlgorithm={onChangeDitherAlgorithm}
            noise={noise}
            onChangeNoise={onChangeNoise}
          />
        </CollapsibleSection>
      )}

      {/* 3. Color, Themes & Palettes Section */}
      <CollapsibleSection
        title="Color Palettes & Themes"
        icon={<Sparkles size={12} />}
        persistKey="CharsetThemeBar-color"
        badge={activeColorName}
      >
        <PaletteControls
          currentTheme={currentTheme}
          onChangeTheme={onChangeTheme}
          customThemeColor={customThemeColor}
          onChangeCustomColor={onChangeCustomColor}
          gradientConfig={gradientConfig}
          onChangeGradient={onChangeGradient}
          mediaColorConfig={mediaColorConfig}
          onChangeMediaColorConfig={onChangeMediaColorConfig}
        />

        {/* Gradient Presets & Dial when gradient active */}
        {themeMode === 'gradient' && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '8px' }}>
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.id}
                  className="btn btn-sm"
                  style={{
                    justifyContent: 'flex-start',
                    position: 'relative',
                    overflow: 'hidden',
                    paddingLeft: '16px',
                    fontSize: '9.5px',
                  }}
                  onClick={() => handleSelectGradient(g)}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      background: `linear-gradient(${g.angle}deg, ${g.color1}, ${g.color2})`,
                    }}
                  />
                  <span>{g.name}</span>
                </button>
              ))}
            </div>

            <div className="control-row">
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Compass size={11} /> Gradient Angle
              </span>
              <AngleDial
                value={customGradAngle}
                onChange={(deg) => handleCustomGradientChange(customGradColor1, customGradColor2, deg)}
              />
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 4. Tone Mapping & Bit Depth */}
      {toneConfig && onChangeToneConfig && (
        <CollapsibleSection
          title="Tone Mapping & Bit Depth"
          icon={<Zap size={12} />}
          persistKey="CharsetThemeBar-tone"
          badge={toneConfig.posterizeBits > 0 ? `${toneConfig.posterizeBits}-BIT` : '8-BIT'}
        >
          <ToneControls
            config={toneConfig}
            onChangeConfig={onChangeToneConfig}
          />
        </CollapsibleSection>
      )}

      {/* 5. Character Density Ramp (Visible in ASCII mode) */}
      {(!rasterMode || rasterMode === 'ascii') && (
        <CollapsibleSection
          title="Character Density Ramp"
          icon={<Type size={12} />}
          persistKey="CharsetThemeBar-character-density-presets"
          badge={activeCharsetName}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {CHARSETS.map((cs) => {
              const isSelected = currentCharset === cs.chars;
              return (
                <button
                  key={cs.id}
                  className={`preset-card ${isSelected ? 'active' : ''}`}
                  onClick={() => onChangeCharset(cs.chars)}
                  style={{ padding: '4px 6px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="preset-card-title" style={{ fontSize: '10px' }}>{cs.name}</span>
                    <code style={{ fontSize: '10px', color: 'var(--accent)' }}>"{cs.chars}"</code>
                  </div>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            className="number-input"
            style={{ width: '100%', textAlign: 'left', padding: '4px 6px', fontSize: '10.5px' }}
            value={currentCharset}
            onChange={(e) => onChangeCharset(e.target.value || ' ')}
            placeholder="e.g.  .:-=+*#%@"
          />
        </CollapsibleSection>
      )}
    </div>
  );
};

