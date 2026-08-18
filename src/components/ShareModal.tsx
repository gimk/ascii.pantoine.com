import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Sparkles, Sliders, Palette, Cpu } from 'lucide-react';
import { encodeShareUrl, FullAnimationState } from '../engine/share';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: FullAnimationState;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  state,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [lockResolution, setLockResolution] = useState<boolean>(true);

  if (!isOpen) return null;

  const shareUrl = encodeShareUrl(
    {
      ...state,
      lockResolution,
    },
    'fullscreen'
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenPreview = () => {
    window.open(shareUrl, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>SHARE FULLSCREEN ANIMATION</span>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>
            Anyone with this link will open this ASCII animation directly in the{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Fullscreen Viewfinder</strong> with all
            custom parameters, physics, theme, and formulas preserved.
          </p>

          {/* Animation Specs Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              padding: '10px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '3px',
              fontSize: '10.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={12} color="var(--accent)" />
              <span style={{ color: 'var(--text-muted)' }}>PRESET:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{state.name}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Palette size={12} color="var(--accent)" />
              <span style={{ color: 'var(--text-muted)' }}>THEME:</span>
              <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {state.theme}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={12} color="var(--accent)" />
              <span style={{ color: 'var(--text-muted)' }}>GRID:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {state.cols}x{state.rows}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={12} color="var(--accent)" />
              <span style={{ color: 'var(--text-muted)' }}>PERF:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {state.optimizeConfig.targetFps || 60} FPS
              </strong>
            </div>
          </div>

          {/* Fixed Resolution Switch */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '3px',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Share with fixed resolution ({state.cols}x{state.rows})
              </span>
              <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {lockResolution
                  ? 'Preserves your exact grid size on the recipient’s screen.'
                  : 'Allows recipient’s device to auto-fit grid resolution to their screen ratio.'}
              </span>
            </div>
            <button
              className={`btn btn-sm ${lockResolution ? 'btn-primary' : ''}`}
              onClick={() => setLockResolution((v) => !v)}
              style={{ whiteSpace: 'nowrap', minWidth: '95px' }}
            >
              {lockResolution ? 'FIXED [ON]' : 'AUTO-FIT'}
            </button>
          </div>

          {/* Share URL Box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--accent)' }}>
              FULLSCREEN VIEWFINDER LINK:
            </span>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                background: 'var(--bg-control)',
                border: '1px solid var(--border-color)',
                padding: '6px 8px',
                borderRadius: '3px',
              }}
            >
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={handleOpenPreview} title="Open link in a new tab">
            <ExternalLink size={12} />
            PREVIEW
          </button>
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED TO CLIPBOARD' : 'COPY SHARE LINK'}
          </button>
        </div>
      </div>
    </div>
  );
};
