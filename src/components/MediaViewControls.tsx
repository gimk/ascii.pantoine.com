import React, { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  MediaViewConfig,
  ImageAdjustConfig,
  BackgroundMode,
  PhosphorTheme,
  MediaColorConfig,
  AppMode,
  DitherAlgorithm,
  ResamplingMode,
  DEFAULT_MEDIA_COLOR_CONFIG,
} from '../types/ascii';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
import { PaletteControls } from './PaletteControls';
import { ImageAdjustControls } from './ImageAdjustControls';
import { getDitherAlgorithmGroups } from '../engine/ditherAlgorithms';
import { Settings } from 'lucide-react';

// Single source of truth for the dither dropdown: derived from the algorithm registry.
const DITHER_ALGORITHM_GROUPS = getDitherAlgorithmGroups();

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
  currentTheme?: PhosphorTheme;
  onChangeTheme?: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  appMode?: AppMode;
}

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
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  appMode = 'media',
}) => {
  const resetRenderSettings = () => {
    onChangeConfig({
      ...config,
      resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
      algorithm: DEFAULT_MEDIA_VIEW_CONFIG.algorithm,
      invert: DEFAULT_MEDIA_VIEW_CONFIG.invert,
      background: DEFAULT_MEDIA_VIEW_CONFIG.background,
    });
  };

  const applyStylePreset = (preset: 'retro_mac' | 'cyberpunk' | 'newspaper') => {
    if (preset === 'retro_mac') {
      onChangeConfig({
        ...config,
        algorithm: 'atkinson',
        tonalMapping: '1color',
        background: 'white',
        highlightColor: '#000000',
        shadowColor: '#000000',
      });
    } else if (preset === 'cyberpunk') {
      // The neon look is a built-in palette now, not a hardcoded tonal preset.
      onChangeConfig({ ...config, algorithm: 'bayer-4x4', tonalMapping: '1color' });
      onChangeMediaColorConfig?.({
        ...(mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG),
        paletteMode: 'indexed',
        mode: 'fixed',
        activePaletteId: 'cyberpunk-neon',
      });
    } else if (preset === 'newspaper') {
      onChangeConfig({
        ...config,
        algorithm: 'halftone-dot',
        tonalMapping: '1color',
        background: 'white',
        highlightColor: '#111827',
        shadowColor: '#111827',
      });
    }
  };

  const toggleNoiseTexture = () => {
    update('noise', config.noise > 0 ? 0 : 35);
  };

  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const backgroundModes: { id: BackgroundMode; label: string }[] = [
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
    { id: 'transparent', label: 'Transparent' },
  ];

  return (
    <div className="tab-content">
      {/* 1. RENDER SETTINGS */}
      <CollapsibleSection
        title="RENDER SETTINGS"
        icon={<Settings size={12} />}
        persistKey="MediaViewControls-render-settings"
        defaultOpen={true}
      >
        {/* Resampling */}
        <div className="control-row">
          <span className="control-label">Resampling</span>
          <select
            className="number-input"
            style={{ width: '140px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.resampling || 'preserve-details'}
            onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
          >
            <option value="preserve-details">Preserve Details</option>
            <option value="nearest">Nearest (Pixel Art)</option>
            <option value="bilinear">Bilinear Smooth</option>
          </select>
        </div>

        {/* Algorithm */}
        <div className="control-row">
          <span className="control-label">Algorithm</span>
          <select
            className="number-input"
            style={{ width: '140px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.algorithm || 'floyd-steinberg'}
            onChange={(e) => update('algorithm', e.target.value as DitherAlgorithm)}
          >
            {DITHER_ALGORITHM_GROUPS.map((group) => (
              <optgroup key={group.family} label={group.label}>
                {group.algorithms.map((algorithm) => (
                  <option key={algorithm.id} value={algorithm.id} title={algorithm.description}>
                    {algorithm.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Background Handling (media-only: not part of ImageAdjustConfig) */}
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

        {/* Quick Actions & Style Toolbar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginTop: '6px' }}>
          <button
            type="button"
            className={`chip-btn ${config.invert ? 'active' : ''}`}
            onClick={() => update('invert', !config.invert)}
            title="Invert Colors"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            INVERT
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => applyStylePreset('retro_mac')}
            title="Classic Mac 1984 1-Bit Dither"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            MAC
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => applyStylePreset('cyberpunk')}
            title="Cyberpunk 80s Neon Dither"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            CYBER
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => applyStylePreset('newspaper')}
            title="Newspaper Halftone Screen"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            NEWS
          </button>
          <button
            type="button"
            className={`chip-btn ${config.noise > 0 ? 'active' : ''}`}
            onClick={toggleNoiseTexture}
            title="Toggle Texture Noise"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            NOISE
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={resetRenderSettings}
            title="Reset Render Settings"
            style={{ fontSize: '9px', padding: '4px 2px' }}
          >
            RESET
          </button>
        </div>
      </CollapsibleSection>

      {/* 2. EFFECT CONTROLS + 3. TONAL CONTROLS (shared across every app mode) */}
      <ImageAdjustControls
        config={config}
        onChangeConfig={(next: ImageAdjustConfig) => onChangeConfig({ ...config, ...next })}
        resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
        showAlphaCutoff={config.background === 'transparent'}
        paletteSlot={
          onChangeTheme ? (
            <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <PaletteControls
                currentTheme={currentTheme || 'green'}
                onChangeTheme={onChangeTheme}
                customThemeColor={customThemeColor}
                onChangeCustomColor={onChangeCustomColor}
                mediaColorConfig={mediaColorConfig}
                onChangeMediaColorConfig={onChangeMediaColorConfig}
                appMode={appMode}
                tonalMapping={config.tonalMapping}
                onChangeTonalMapping={(t) => onChangeConfig({ ...config, tonalMapping: t })}
              />
            </div>
          ) : null
        }
        levelsSlot={
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
        }
      />
    </div>
  );
};
