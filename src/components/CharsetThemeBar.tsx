import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { CHARSETS } from '../engine/renderer';
import {
  PhosphorTheme,
  MediaColorConfig,
  AppMode,
  DEFAULT_MEDIA_COLOR_CONFIG,
} from '../types/ascii';
import { PaletteControls } from './PaletteControls';
import { Sparkles, Type } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  appMode?: AppMode;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  isPixelMode?: boolean;
}

const THEMES: { id: PhosphorTheme; name: string; color: string }[] = [
  { id: 'green', name: 'Matrix Green', color: '#00ff66' },
  { id: 'amber', name: 'Amber CRT', color: '#ffb000' },
  { id: 'cyan', name: 'Cyber Cyan', color: '#00f0ff' },
  { id: 'monochrome', name: 'Mono White', color: '#f0f0f0' },
  { id: 'blood', name: 'Crimson Red', color: '#ff3344' },
  { id: 'paper', name: 'Paper Print', color: '#151515' },
];

export const CharsetThemeBar: React.FC<CharsetThemeBarProps> = ({
  currentCharset,
  onChangeCharset,
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  appMode = 'synth',
  mediaColorConfig = DEFAULT_MEDIA_COLOR_CONFIG,
  onChangeMediaColorConfig,
  isPixelMode = false,
}) => {
  const isContentColorActive = appMode === 'media' && mediaColorConfig.mode === 'content';
  const activeCharsetName = isPixelMode ? 'N/A (Pixel Mode)' : (CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom');
  const activeColorName = isContentColorActive
    ? 'From Content'
    : customThemeColor
      ? 'Custom Colour'
      : THEMES.find((t) => t.id === currentTheme)?.name || '';

  return (
    <div className="tab-content">
      {/* 1. Tonal Controls Section (rendered inside TONAL CONTROLS for media mode) */}
      {appMode !== 'media' && (
        <CollapsibleSection
          title="Tonal Controls"
          icon={<Sparkles size={12} />}
          persistKey="CharsetThemeBar-color"
          badge={activeColorName}
          defaultOpen={true}
        >
          <PaletteControls
            currentTheme={currentTheme}
            onChangeTheme={onChangeTheme}
            customThemeColor={customThemeColor}
            onChangeCustomColor={onChangeCustomColor}
            mediaColorConfig={mediaColorConfig}
            onChangeMediaColorConfig={onChangeMediaColorConfig}
            appMode={appMode}
          />
        </CollapsibleSection>
      )}

      {/* 2. Character Density Ramp */}
      <CollapsibleSection
        title="Character Density Ramp"
        icon={<Type size={12} />}
        persistKey="CharsetThemeBar-character-density-presets"
        badge={activeCharsetName}
        defaultOpen={false}
      >
        <div style={{ opacity: isPixelMode ? 0.35 : 1, pointerEvents: isPixelMode ? 'none' : 'auto' }}>
          {isPixelMode && (
            <div style={{ fontSize: '9px', color: 'var(--accent)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
              CHARACTERS BYPASSED IN PIXEL MODE (SOLID PIXELS ONLY)
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {CHARSETS.map((cs) => {
              const isSelected = currentCharset === cs.chars;
              return (
                <button
                  key={cs.id}
                  disabled={isPixelMode}
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
            disabled={isPixelMode}
            className="text-input"
            style={{ width: '100%', fontSize: '10.5px' }}
            value={currentCharset}
            onChange={(e) => onChangeCharset(e.target.value || ' ')}
            placeholder="e.g.  .:-=+*#%@"
          />
        </div>
      </CollapsibleSection>
    </div>
  );
};

