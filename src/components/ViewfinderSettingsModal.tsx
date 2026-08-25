import React, { useEffect } from 'react';
import { X, Tv, Cpu, Sliders } from 'lucide-react';
import { CrtConfig, OptimizeConfig } from '../types/ascii';

interface ViewfinderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  crtConfig: CrtConfig;
  onChangeCrtConfig: (cfg: CrtConfig) => void;
  optimizeConfig: OptimizeConfig;
  onChangeOptimizeConfig: (cfg: OptimizeConfig) => void;
  isStaticImage?: boolean;
  isContentColorActive?: boolean;
}

export const ViewfinderSettingsModal: React.FC<ViewfinderSettingsModalProps> = ({
  isOpen,
  onClose,
  crtConfig,
  onChangeCrtConfig,
  optimizeConfig,
  onChangeOptimizeConfig,
  isStaticImage = false,
  isContentColorActive = false,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateCrt = <K extends keyof CrtConfig>(key: K, val: CrtConfig[K]) => {
    onChangeCrtConfig({ ...crtConfig, [key]: val });
  };

  const updateOptimize = <K extends keyof OptimizeConfig>(key: K, val: OptimizeConfig[K]) => {
    onChangeOptimizeConfig({ ...optimizeConfig, [key]: val });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 'min(94vw, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={14} color="var(--accent)" />
            <span style={{ fontSize: '12px', letterSpacing: '0.05em' }}>
              VIEWFINDER &amp; HARDWARE SETTINGS
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '2px 6px' }}
            onClick={onClose}
            title="Close Settings (Esc)"
          >
            <X size={13} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Section 1: CRT & Display Effects */}
          <div className="control-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <Tv size={13} />
              <span>CRT &amp; Display Effects</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 1. CRT Scanlines */}
              <div className="control-row">
                <span className="control-label">CRT Scanline Raster</span>
                <button
                  type="button"
                  className={`btn btn-sm ${crtConfig.scanlines ? 'btn-primary' : ''}`}
                  onClick={() => updateCrt('scanlines', !crtConfig.scanlines)}
                >
                  {crtConfig.scanlines ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
                </button>
              </div>

              {/* 2. CRT Ambient Background Glow */}
              <div className="control-row" style={{ opacity: isContentColorActive ? 0.45 : 1 }}>
                <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  CRT Ambient Glow
                  {isContentColorActive && (
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>(Disabled in Color Mode)</span>
                  )}
                </span>
                <button
                  type="button"
                  className={`btn btn-sm ${crtConfig.crtGlow && !isContentColorActive ? 'btn-primary' : ''}`}
                  disabled={isContentColorActive}
                  onClick={() => updateCrt('crtGlow', !crtConfig.crtGlow)}
                >
                  {isContentColorActive ? 'DISABLED [OFF]' : crtConfig.crtGlow ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
                </button>
              </div>

              {/* 3. Phosphor Bloom */}
              <div className="control-row" style={{ opacity: isContentColorActive ? 0.45 : 1 }}>
                <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Phosphor Character Bloom
                  {isContentColorActive && (
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>(Disabled in Color Mode)</span>
                  )}
                </span>
                <button
                  type="button"
                  className={`btn btn-sm ${crtConfig.phosphorBloom && !isContentColorActive ? 'btn-primary' : ''}`}
                  disabled={isContentColorActive}
                  onClick={() => updateCrt('phosphorBloom', !crtConfig.phosphorBloom)}
                >
                  {isContentColorActive ? 'DISABLED [OFF]' : crtConfig.phosphorBloom ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
                </button>
              </div>

              {/* 4. CRT Corner Vignette */}
              <div className="control-row">
                <span className="control-label">CRT Tube Vignette</span>
                <button
                  type="button"
                  className={`btn btn-sm ${crtConfig.vignette ? 'btn-primary' : ''}`}
                  onClick={() => updateCrt('vignette', !crtConfig.vignette)}
                >
                  {crtConfig.vignette ? 'ENABLED [ON]' : 'DISABLED [OFF]'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Performance & FPS Throttling */}
          <div className="control-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <Cpu size={13} />
              <span>Performance &amp; FPS Limits</span>
            </div>

            {isStaticImage && (
              <div
                style={{
                  fontSize: '9.5px',
                  color: 'var(--text-dim)',
                  marginBottom: '10px',
                  padding: '6px 8px',
                  background: 'var(--bg-control)',
                  borderRadius: '3px',
                }}
              >
                Continuous rendering is paused for static 2D images (rendered once with 0% CPU consumption).
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 1. FPS Presets */}
              <div className="control-row" style={{ opacity: isStaticImage ? 0.35 : 1 }}>
                <span className="control-label">Target Framerate</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {[15, 20, 24, 30, 45, 60, 0].map((fpsVal) => (
                    <button
                      key={fpsVal}
                      disabled={isStaticImage}
                      className={`btn btn-sm ${optimizeConfig.targetFps === fpsVal ? 'btn-primary' : ''}`}
                      style={{ padding: '3px 7px', fontSize: '10px' }}
                      onClick={() => updateOptimize('targetFps', fpsVal)}
                    >
                      {fpsVal === 0 ? 'MAX' : `${fpsVal}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. FPS Slider */}
              <div className="control-row" style={{ opacity: isStaticImage ? 0.35 : 1 }}>
                <span className="control-label">Fine Framerate Tuning</span>
                <div className="control-input-wrapper">
                  <input
                    type="range"
                    className="range-slider"
                    min={10}
                    max={60}
                    step={1}
                    disabled={isStaticImage}
                    value={optimizeConfig.targetFps || 60}
                    onChange={(e) => updateOptimize('targetFps', parseInt(e.target.value, 10) || 60)}
                  />
                  <span className="numeral-badge">
                    {optimizeConfig.targetFps === 0 ? 'MAX' : `${optimizeConfig.targetFps}fps`}
                  </span>
                </div>
              </div>

              {/* 3. Pause when Tab is Inactive */}
              <div className="control-row" style={{ opacity: isStaticImage ? 0.35 : 1, marginTop: '4px' }}>
                <span className="control-label">
                  Pause when Tab is Inactive
                  <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>0% CPU when switched away</div>
                </span>
                <button
                  type="button"
                  disabled={isStaticImage}
                  className={`btn btn-sm ${optimizeConfig.pauseWhenHidden ? 'btn-primary' : ''}`}
                  onClick={() => updateOptimize('pauseWhenHidden', !optimizeConfig.pauseWhenHidden)}
                >
                  {optimizeConfig.pauseWhenHidden ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              {/* 4. Idle Mouse Throttling */}
              <div className="control-row" style={{ opacity: isStaticImage ? 0.35 : 1 }}>
                <span className="control-label">
                  Idle Framerate Throttle
                  <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Drops to 12 FPS on idle mouse</div>
                </span>
                <button
                  type="button"
                  disabled={isStaticImage}
                  className={`btn btn-sm ${optimizeConfig.idleThrottle ? 'btn-primary' : ''}`}
                  onClick={() => updateOptimize('idleThrottle', !optimizeConfig.idleThrottle)}
                >
                  {optimizeConfig.idleThrottle ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '6px 16px', fontSize: '11px', fontWeight: 700 }}
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
