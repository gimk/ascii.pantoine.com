import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Sliders,
  Palette,
  Cpu,
  Crop,
  Box,
  Image as ImageIcon,
  AlertTriangle,
  Download,
  Globe,
} from 'lucide-react';
import { encodeShareUrl, FullAnimationState } from '../engine/share';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: FullAnimationState;
  onOpenExport?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  state,
  onOpenExport,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [shareAutoRes, setShareAutoRes] = useState<boolean>(state.autoRes ?? false);

  if (!isOpen) return null;

  const isSynthMode = !state.appMode || state.appMode === 'synth';
  const isMediaMode = state.appMode === 'media';

  const isBuiltinModel =
    state.appMode === 'model' &&
    (!state.modelConfig?.sourceType || state.modelConfig?.sourceType === 'preset');

  const modelUrl = (state.modelConfig?.remoteUrl || '').trim();
  const isOnlineModel =
    state.appMode === 'model' &&
    (state.modelConfig?.sourceType === 'url' || Boolean(modelUrl.startsWith('http://') || modelUrl.startsWith('https://'))) &&
    !modelUrl.startsWith('blob:') &&
    !modelUrl.startsWith('data:');

  const isShareableModel = isBuiltinModel || isOnlineModel;

  const mediaUrl = (state.mediaConfig?.remoteUrl || state.mediaConfig?.fileData || '').trim();
  const isRemoteMedia =
    state.appMode === 'media' &&
    (state.mediaConfig?.sourceType === 'url' ||
      Boolean(mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') || mediaUrl.startsWith('//'))) &&
    !mediaUrl.startsWith('blob:') &&
    !mediaUrl.startsWith('data:');

  const isShareable = isSynthMode || isShareableModel || isRemoteMedia;

  const shareUrl = isShareable
    ? encodeShareUrl(
        {
          ...state,
          autoRes: isMediaMode ? false : shareAutoRes,
        },
        'fullscreen'
      )
    : '';

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenPreview = () => {
    if (!shareUrl) return;
    window.open(shareUrl, '_blank');
  };

  const modeTitle =
    state.appMode === 'model'
      ? 'SHARE 3D MODEL'
      : state.appMode === 'media'
      ? 'SHARE MEDIA RASTERIZER'
      : 'SHARE FULLSCREEN ANIMATION';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{modeTitle}</span>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isShareable ? (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>
                Anyone with this link will open this ASCII animation directly in the{' '}
                <strong style={{ color: 'var(--text-primary)' }}>Fullscreen Viewfinder</strong> with all
                parameters, shaders, theme, and lighting preserved.
              </p>

              {/* Mode-Aware Animation Specs Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px',
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  fontSize: '10.5px',
                  overflow: 'hidden',
                }}
              >
                {isSynthMode && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Sliders size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>PRESET:</span>
                      <strong
                        style={{
                          color: 'var(--text-primary)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: 1,
                        }}
                        title={state.name}
                      >
                        {state.name}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Palette size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>THEME:</span>
                      <strong
                        style={{
                          color: 'var(--text-primary)',
                          textTransform: 'capitalize',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {state.theme}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Sparkles size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>GRID:</span>
                      <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                        {state.cols}x{state.rows}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Cpu size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>PERF:</span>
                      <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                        {state.optimizeConfig.targetFps || 60} FPS
                      </strong>
                    </div>
                  </>
                )}

                {state.appMode === 'model' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Box size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>MODEL:</span>
                      <strong
                        style={{
                          color: 'var(--text-primary)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: 1,
                        }}
                        title={state.modelConfig?.fileName || state.name}
                      >
                        {state.modelConfig?.fileName || state.name}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Globe size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>SOURCE:</span>
                      <strong style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                        {isBuiltinModel ? 'Built-in Preset' : 'Online Library'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Palette size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>THEME:</span>
                      <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize', flexShrink: 0 }}>
                        {state.theme}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Sparkles size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>GRID:</span>
                      <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                        {state.cols}x{state.rows}
                      </strong>
                    </div>
                  </>
                )}

                {state.appMode === 'media' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <ImageIcon size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>MEDIA:</span>
                      <strong
                        style={{
                          color: 'var(--text-primary)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: 1,
                        }}
                        title={state.mediaConfig?.fileName || 'Remote Image'}
                      >
                        {state.mediaConfig?.fileName || 'Remote Image'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Globe size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>SOURCE:</span>
                      <strong style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                        Public URL
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Palette size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>THEME:</span>
                      <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize', flexShrink: 0 }}>
                        {state.theme}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Sparkles size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>GRID:</span>
                      <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                        {state.cols}x{state.rows}
                      </strong>
                    </div>
                  </>
                )}
              </div>

              {/* Auto Resolution Switch */}
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
                  opacity: isMediaMode ? 0.35 : 1,
                  cursor: isMediaMode ? 'not-allowed' : 'default',
                  filter: isMediaMode ? 'grayscale(1)' : 'none',
                }}
                title={
                  isMediaMode
                    ? 'Auto Resolution is disabled for Media mode to preserve exact pixel aspect ratio.'
                    : undefined
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Share with Auto Resolution{' '}
                    {isMediaMode && (
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        [FIXED ASPECT RATIO]
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    {isMediaMode
                      ? `Preserves fixed media aspect ratio (${state.cols}x${state.rows}) on recipient’s screen.`
                      : shareAutoRes
                      ? 'Recipient’s screen will automatically adapt grid resolution to match their device size.'
                      : `Preserves fixed grid resolution (${state.cols}x${state.rows}) on the recipient’s screen.`}
                  </span>
                </div>
                <button
                  disabled={isMediaMode}
                  className={`btn btn-sm ${!isMediaMode && shareAutoRes ? 'btn-primary' : ''}`}
                  onClick={() => !isMediaMode && setShareAutoRes((v) => !v)}
                  style={{
                    whiteSpace: 'nowrap',
                    minWidth: '105px',
                    opacity: isMediaMode ? 0.5 : 1,
                    cursor: isMediaMode ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Crop size={11} style={{ marginRight: '4px' }} />
                  {isMediaMode ? 'AUTO RES [OFF]' : shareAutoRes ? 'AUTO RES [ON]' : 'AUTO RES [OFF]'}
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
            </>
          ) : (
            /* Local File / In-Memory Asset Notice */
            <div
              style={{
                padding: '16px 18px',
                background: 'rgba(255, 176, 0, 0.05)',
                border: '1.5px solid var(--accent)',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="var(--accent)" />
                <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--accent)', letterSpacing: '0.04em' }}>
                  {state.appMode === 'model'
                    ? 'LOCAL 3D MODEL NOT SHAREABLE VIA WEB LINK'
                    : 'LOCAL MEDIA NOT SHAREABLE VIA WEB LINK'}
                </span>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                {state.appMode === 'model'
                  ? 'This 3D model was loaded from your local computer and exists only in your browser memory. Because local files cannot be sent through web URL links, live web sharing is unavailable for local 3D assets.'
                  : 'This image or video was pasted from your clipboard or uploaded from your computer and exists only in your browser memory. Because local files cannot be sent through web URL links, live web sharing is unavailable for local media.'}
              </p>

              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Recommended Alternatives:
                </div>
                <div>
                  • <strong>Export Rendered Art</strong>: Open the Export dialog to download your artwork as an <strong>Image (PNG/JPG)</strong>, <strong>GIF Loop</strong>, <strong>Video Clip</strong>, or <strong>HTML &lt;pre&gt; Embed</strong>.
                </div>
                <div>
                  • <strong>Live Link Sharing</strong>:{' '}
                  {state.appMode === 'model'
                    ? 'Load a 3D model from the Online 3D Library (glTF / Open CDN) to generate a shareable web link.'
                    : 'Load your image or video from a public web URL to generate a live shareable web link.'}
                </div>
              </div>

              {onOpenExport && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '9px 14px', fontSize: '11.5px', fontWeight: 700 }}
                  onClick={() => {
                    onClose();
                    onOpenExport();
                  }}
                >
                  <Download size={13} />
                  OPEN EXPORT DIALOG (IMAGE / GIF / VIDEO / HTML)
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {isShareable ? (
            <>
              <button className="btn" onClick={handleOpenPreview} title="Open link in a new tab">
                <ExternalLink size={12} />
                PREVIEW
              </button>
              <button className="btn btn-primary" onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED TO CLIPBOARD' : 'COPY SHARE LINK'}
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
              CLOSE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
