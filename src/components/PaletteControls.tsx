import {
  PhosphorTheme,
  PhosphorGradient,
  PaletteMode,
  ColorPalette,
  MediaColorConfig,
} from '../types/ascii';
import { BUILTIN_PALETTES } from '../engine/palettes';

interface PaletteControlsProps {
  currentTheme: PhosphorTheme;
  onChangeTheme: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  gradientConfig?: PhosphorGradient | null;
  onChangeGradient?: (grad: PhosphorGradient | null) => void;
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

export const PaletteControls: React.FC<PaletteControlsProps> = ({
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  gradientConfig = null,
  mediaColorConfig,
  onChangeMediaColorConfig,
}) => {

  const paletteMode: PaletteMode = mediaColorConfig?.paletteMode || (gradientConfig ? 'gradient' : 'phosphor');
  const activePaletteId = mediaColorConfig?.activePaletteId || 'gameboy-classic';

  const handleSelectPaletteMode = (mode: PaletteMode) => {
    if (!onChangeMediaColorConfig) return;
    onChangeMediaColorConfig({
      ...(mediaColorConfig || {
        mode: 'fixed',
        sampling: 'center',
        bgPreset: 'dark',
        customBg: '#0a0a0a',
        saturation: 200,
      }),
      paletteMode: mode,
      mode: mode === 'content' ? 'content' : 'fixed',
    });
  };

  const handleSelectRetroPalette = (pal: ColorPalette) => {
    if (!onChangeMediaColorConfig) return;
    onChangeMediaColorConfig({
      ...(mediaColorConfig || {
        mode: 'fixed',
        sampling: 'center',
        bgPreset: 'dark',
        customBg: '#0a0a0a',
        saturation: 200,
      }),
      paletteMode: 'indexed',
      activePaletteId: pal.id,
    });
  };

  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          COLOR & PALETTES
        </span>
        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
          [{paletteMode.toUpperCase()}]
        </span>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px', marginBottom: '8px' }}>
        <button
          type="button"
          className={`chip-btn ${paletteMode === 'phosphor' ? 'active' : ''}`}
          style={{
            fontSize: '9.5px',
            padding: '4px 2px',
            borderRadius: '2px',
            background: paletteMode === 'phosphor' ? 'var(--accent)' : 'var(--bg-control)',
            color: paletteMode === 'phosphor' ? '#000' : 'var(--text-muted)',
            fontWeight: paletteMode === 'phosphor' ? 700 : 500,
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => handleSelectPaletteMode('phosphor')}
        >
          PHOSPHOR
        </button>

        <button
          type="button"
          className={`chip-btn ${paletteMode === 'gradient' ? 'active' : ''}`}
          style={{
            fontSize: '9.5px',
            padding: '4px 2px',
            borderRadius: '2px',
            background: paletteMode === 'gradient' ? 'var(--accent)' : 'var(--bg-control)',
            color: paletteMode === 'gradient' ? '#000' : 'var(--text-muted)',
            fontWeight: paletteMode === 'gradient' ? 700 : 500,
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => handleSelectPaletteMode('gradient')}
        >
          GRADIENT
        </button>

        <button
          type="button"
          className={`chip-btn ${paletteMode === 'indexed' ? 'active' : ''}`}
          style={{
            fontSize: '9.5px',
            padding: '4px 2px',
            borderRadius: '2px',
            background: paletteMode === 'indexed' ? 'var(--accent)' : 'var(--bg-control)',
            color: paletteMode === 'indexed' ? '#000' : 'var(--text-muted)',
            fontWeight: paletteMode === 'indexed' ? 700 : 500,
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => handleSelectPaletteMode('indexed')}
        >
          INDEXED
        </button>

        <button
          type="button"
          className={`chip-btn ${paletteMode === 'content' ? 'active' : ''}`}
          style={{
            fontSize: '9.5px',
            padding: '4px 2px',
            borderRadius: '2px',
            background: paletteMode === 'content' ? 'var(--accent)' : 'var(--bg-control)',
            color: paletteMode === 'content' ? '#000' : 'var(--text-muted)',
            fontWeight: paletteMode === 'content' ? 700 : 500,
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => handleSelectPaletteMode('content')}
        >
          RGB COLOR
        </button>
      </div>

      {/* 1. Phosphor Mode */}
      {paletteMode === 'phosphor' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginTop: '6px' }}>
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`theme-btn ${currentTheme === th.id && !customThemeColor ? 'active' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '4px 0',
                gap: '3px',
                background: 'var(--bg-control)',
                borderColor: currentTheme === th.id && !customThemeColor ? th.color : 'var(--border-color)',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (onChangeCustomColor) onChangeCustomColor('');
                onChangeTheme(th.id);
              }}
              title={th.name}
            >
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: th.color }} />
              <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)' }}>{th.id.slice(0, 4).toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}

      {/* 2. Indexed Retro & Print Palettes */}
      {paletteMode === 'indexed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
          {BUILTIN_PALETTES.map((pal) => {
            const isSelected = activePaletteId === pal.id;
            return (
              <button
                key={pal.id}
                type="button"
                className={`palette-row-btn ${isSelected ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  background: isSelected ? 'rgba(0, 255, 102, 0.12)' : 'var(--bg-control)',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => handleSelectRetroPalette(pal)}
              >
                <div>
                  <div style={{ fontSize: '10px', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {pal.name}
                  </div>
                  <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    {pal.category} • {pal.colors.length} COLORS
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2px' }}>
                  {pal.colors.slice(0, 8).map((c, i) => (
                    <div
                      key={i}
                      style={{
                        width: '8px',
                        height: '14px',
                        borderRadius: '1px',
                        background: c,
                        border: '1px solid rgba(0,0,0,0.3)',
                      }}
                    />
                  ))}
                  {pal.colors.length > 8 && (
                    <span style={{ fontSize: '8px', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '2px' }}>
                      +{pal.colors.length - 8}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Full RGB Content Color Adjustments */}
      {paletteMode === 'content' && onChangeMediaColorConfig && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          <div className="control-row">
            <span className="control-label">RGB Saturation</span>
            <div className="control-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="range"
                min={0}
                max={400}
                value={mediaColorConfig?.saturation ?? 200}
                onChange={(e) =>
                  onChangeMediaColorConfig({
                    ...(mediaColorConfig || {
                      mode: 'content',
                      sampling: 'center',
                      bgPreset: 'dark',
                      customBg: '#0a0a0a',
                      saturation: 200,
                    }),
                    saturation: parseInt(e.target.value, 10) || 200,
                  })
                }
                className="range-input"
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '32px', textAlign: 'right' }}>
                {mediaColorConfig?.saturation ?? 200}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
