import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  MediaViewConfig,
  ImageAdjustConfig,
  PhosphorTheme,
  MediaColorConfig,
  AppMode,
  ResamplingMode,
} from '../types/ascii';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
import { PaletteControls } from './PaletteControls';
import { ImageAdjustControls } from './ImageAdjustControls';
import { DitherAlgorithmPicker } from './DitherAlgorithmPicker';
import { Settings } from 'lucide-react';

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
  const isPixelMode = config.rasterMode === 'pixel';

  const resetRenderSettings = () => {
    onChangeConfig({
      ...config,
      resampling: DEFAULT_MEDIA_VIEW_CONFIG.resampling,
      algorithm: DEFAULT_MEDIA_VIEW_CONFIG.algorithm,
      invert: DEFAULT_MEDIA_VIEW_CONFIG.invert,
    });
  };

  const applyStylePreset = (preset: 'retro_mac' | 'cyberpunk' | 'newspaper') => {
    if (preset === 'retro_mac') {
      onChangeConfig({
        ...config,
        algorithm: 'atkinson',
        colorLevels: 2,
        sharpenStrength: 120,
        contrast: 30,
        brightness: 5,
        tonalMapping: '1color',
      });
      if (onChangeTheme) onChangeTheme('monochrome');
      if (onChangeCustomColor) onChangeCustomColor('');
    } else if (preset === 'cyberpunk') {
      onChangeConfig({
        ...config,
        algorithm: 'bayer-8x8',
        colorLevels: 4,
        sharpenStrength: 100,
        contrast: 20,
        tonalMapping: '3color',
        highlightColor: '#00F0FF',
        midtoneColor: '#FF0055',
        shadowColor: '#1A0033',
      });
    } else if (preset === 'newspaper') {
      onChangeConfig({
        ...config,
        algorithm: 'halftone-dot',
        colorLevels: 4,
        contrast: 35,
        brightness: 10,
        tonalMapping: '1color',
        highlightColor: '#111827',
        shadowColor: '#111827',
      });
    }
  };

  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  return (
    <div className="tab-content">
      {/* 1. RENDER SETTINGS */}
      <CollapsibleSection
        title="RENDER SETTINGS"
        icon={<Settings size={12} />}
        persistKey="MediaViewControls-render-settings"
        defaultOpen={true}
      >
        {/* Dither Algorithm Selector with Rapid Stepper & Category Filter */}
        <DitherAlgorithmPicker
          value={config.algorithm || 'floyd-steinberg'}
          onChange={(algo) => update('algorithm', algo)}
        />

        {/* Resampling Filter */}
        <div className="control-row" style={{ marginTop: '8px' }}>
          <span className="control-label">Resampling</span>
          <select
            className="number-input"
            style={{ width: '150px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.resampling || 'preserve-details'}
            onChange={(e) => update('resampling', e.target.value as ResamplingMode)}
          >
            <option value="preserve-details">Preserve Details</option>
            <option value="nearest">Nearest (Pixel Art)</option>
            <option value="bilinear">Bilinear Smooth</option>
          </select>
        </div>

        {/* Quick Actions & Style Toolbar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginTop: '8px' }}>
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
          <div />
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

      <ImageAdjustControls
        config={config}
        onChangeConfig={(next: ImageAdjustConfig) => onChangeConfig({ ...config, ...next })}
        resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
        showAlphaCutoff={config.background === 'transparent'}
        paletteSlot={
          onChangeTheme ? (
            <div>
              <div className="tonal-subheading">
                <span>Color &amp; Tonal Palette</span>
              </div>
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
                isPixelMode={isPixelMode}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
};
