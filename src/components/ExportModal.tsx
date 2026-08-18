import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Check, Bot, Film, Loader2, Play, RotateCcw } from 'lucide-react';
import { generateAstroComponent, generateStandaloneHtml, generateAiPrompt } from '../engine/exporter';
import { exportAnimatedGif } from '../engine/gif';
import { WaveParams, ParticleConfig, OptimizeConfig, PhosphorTheme, CrtConfig } from '../types/ascii';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  particleConfig: ParticleConfig;
  optimizeConfig?: OptimizeConfig;
  cols: number;
  rows: number;
  density: string;
  currentAsciiFrame: string;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  crtConfig?: CrtConfig;
  initialTab?: 'prompt' | 'astro' | 'html' | 'json' | 'ascii' | 'gif';
}

type ExportTab = 'prompt' | 'astro' | 'html' | 'json' | 'ascii' | 'gif';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  name,
  type,
  params,
  customCode,
  customPrepare,
  particleConfig,
  optimizeConfig,
  cols,
  rows,
  density,
  currentAsciiFrame,
  theme = 'green',
  customThemeColor,
  crtConfig,
  initialTab = 'prompt',
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>(initialTab);
  const [copied, setCopied] = useState<boolean>(false);
  const [customBaseName, setCustomBaseName] = useState<string>('');

  // GIF Recording States
  const [gifDuration, setGifDuration] = useState<number>(2.0);
  const [gifFps, setGifFps] = useState<number>(15);
  const [gifScale, setGifScale] = useState<number>(1.0);
  const [gifScanlines, setGifScanlines] = useState<boolean>(crtConfig?.scanlines ?? true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordProgress, setRecordProgress] = useState<number>(0);
  const [recordStatus, setRecordStatus] = useState<string>('');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBlob, setGifBlob] = useState<Blob | null>(null);

  const defaultBaseName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ascii-wave';

  // Initialize or reset base filename when preset name or modal open state changes
  useEffect(() => {
    setCustomBaseName(defaultBaseName);
  }, [name, isOpen]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
    if (!isOpen && gifUrl) {
      URL.revokeObjectURL(gifUrl);
      setGifUrl(null);
      setGifBlob(null);
      setIsRecording(false);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const exportCfg = {
    name,
    type,
    params,
    customCode,
    customPrepare,
    particleConfig,
    optimizeConfig,
    cols,
    rows,
    density,
    fps: optimizeConfig?.targetFps !== undefined ? optimizeConfig.targetFps : 60,
  };

  const getExtension = (): string => {
    switch (activeTab) {
      case 'prompt': return '-ai-prompt.txt';
      case 'astro': return '.astro';
      case 'html': return '.html';
      case 'json': return '.json';
      case 'ascii': return '-frame.txt';
      case 'gif': return '.gif';
    }
  };

  const effectiveFileName = `${(customBaseName.trim() || defaultBaseName).replace(/\.[^/.]+$/, '')}${getExtension()}`;

  const handleRecordGif = async () => {
    setIsRecording(true);
    setRecordProgress(0);
    setRecordStatus('Preparing frames...');
    try {
      const blob = await exportAnimatedGif(
        {
          name,
          type,
          params,
          customCode,
          customPrepare,
          density,
          cols,
          rows,
          theme,
          customThemeColor,
          scanlines: gifScanlines,
          duration: gifDuration,
          fps: gifFps,
          scale: gifScale,
        },
        (progress, frame, total) => {
          setRecordProgress(progress);
          if (progress < 80) {
            setRecordStatus(`Rendering frame ${frame} of ${total} (${progress}%)...`);
          } else {
            setRecordStatus(`Encoding GIF binary stream (${progress}%)...`);
          }
        }
      );

      const url = URL.createObjectURL(blob);
      setGifBlob(blob);
      setGifUrl(url);
    } catch (err: any) {
      alert(`GIF Export Error: ${err?.message || 'Failed to render GIF'}`);
    } finally {
      setIsRecording(false);
    }
  };

  const getExportContent = (): { text: string; mimeType: string } => {
    switch (activeTab) {
      case 'prompt':
        return {
          text: generateAiPrompt(exportCfg),
          mimeType: 'text/plain',
        };
      case 'astro':
        return {
          text: generateAstroComponent(exportCfg),
          mimeType: 'text/plain',
        };
      case 'html':
        return {
          text: generateStandaloneHtml(exportCfg),
          mimeType: 'text/html',
        };
      case 'json':
        return {
          text: JSON.stringify(
            {
              name,
              type,
              params,
              customCode,
              customPrepare,
              particleConfig,
              cols,
              rows,
              density,
            },
            null,
            2
          ),
          mimeType: 'application/json',
        };
      case 'ascii':
        return {
          text: currentAsciiFrame,
          mimeType: 'text/plain',
        };
      case 'gif':
        return {
          text: '',
          mimeType: 'image/gif',
        };
    }
  };

  const { text, mimeType } = getExportContent();

  const handleCopy = () => {
    if (activeTab === 'gif') return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    if (activeTab === 'gif') {
      if (!gifBlob) return;
      const url = URL.createObjectURL(gifBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = effectiveFileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = effectiveFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>EXPORT PRESET: [{name.toUpperCase()}]</span>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Export Tabs */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'gif' ? 'active' : ''}`}
            onClick={() => setActiveTab('gif')}
            title="Record and export animated GIF loop"
          >
            <Film size={11} style={{ display: 'inline', marginRight: '3px' }} />
            GIF (.gif)
          </button>
          <button
            className={`tab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompt')}
            title="Export as standardized prompt for AI (Claude, GPT, Gemini, etc.)"
          >
            <Bot size={11} style={{ display: 'inline', marginRight: '3px' }} />
            AI Prompt (.txt)
          </button>
          <button
            className={`tab-btn ${activeTab === 'astro' ? 'active' : ''}`}
            onClick={() => setActiveTab('astro')}
          >
            Astro (.astro)
          </button>
          <button
            className={`tab-btn ${activeTab === 'html' ? 'active' : ''}`}
            onClick={() => setActiveTab('html')}
          >
            HTML (.html)
          </button>
          <button
            className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            Preset (.json)
          </button>
          <button
            className={`tab-btn ${activeTab === 'ascii' ? 'active' : ''}`}
            onClick={() => setActiveTab('ascii')}
          >
            Frame (.txt)
          </button>
        </div>

        {/* Code Content */}
        <div className="modal-body">
          {/* Filename Customizer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              padding: '8px 10px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
              FILE NAME:
            </span>
            <input
              type="text"
              className="number-input"
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--accent)',
              }}
              value={customBaseName}
              onChange={(e) => setCustomBaseName(e.target.value)}
              placeholder={defaultBaseName}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {getExtension()}
            </span>
          </div>

          {activeTab === 'gif' ? (
            <div>
              {/* GIF Configuration */}
              <div className="gif-config-grid">
                <div className="gif-config-item">
                  <span className="gif-config-label">Loop Duration</span>
                  <div className="gif-btn-group">
                    {[1.0, 2.0, 3.0, 4.0, 6.0].map((d) => (
                      <button
                        key={d}
                        disabled={isRecording}
                        className={`btn ${gifDuration === d ? 'btn-primary' : ''}`}
                        onClick={() => setGifDuration(d)}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Frame Rate</span>
                  <div className="gif-btn-group">
                    {[12, 15, 20, 24].map((f) => (
                      <button
                        key={f}
                        disabled={isRecording}
                        className={`btn ${gifFps === f ? 'btn-primary' : ''}`}
                        onClick={() => setGifFps(f)}
                      >
                        {f}fps
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Resolution Scale</span>
                  <div className="gif-btn-group">
                    {[
                      { val: 1.0, label: '1.0x (Standard)' },
                      { val: 1.5, label: '1.5x (HD)' },
                    ].map((s) => (
                      <button
                        key={s.val}
                        disabled={isRecording}
                        className={`btn ${gifScale === s.val ? 'btn-primary' : ''}`}
                        onClick={() => setGifScale(s.val)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">CRT Scanlines</span>
                  <button
                    disabled={isRecording}
                    className={`btn ${gifScanlines ? 'btn-primary' : ''}`}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setGifScanlines(!gifScanlines)}
                  >
                    {gifScanlines ? 'SCANLINES [ON]' : 'SCANLINES [OFF]'}
                  </button>
                </div>
              </div>

              {/* Progress Box */}
              {isRecording && (
                <div className="gif-progress-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                      <Loader2 size={12} className="dice-spin" />
                      {recordStatus}
                    </span>
                    <span>{recordProgress}%</span>
                  </div>
                  <div className="gif-progress-track">
                    <div className="gif-progress-bar" style={{ width: `${recordProgress}%` }} />
                  </div>
                </div>
              )}

              {/* GIF Preview */}
              {gifUrl ? (
                <div className="gif-preview-card">
                  <img src={gifUrl} alt="Recorded GIF Preview" className="gif-preview-img" />
                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Loop: {gifDuration}s @ {gifFps}fps • Size: {(gifBlob ? (gifBlob.size / 1024).toFixed(1) : 0)} KB
                  </div>
                </div>
              ) : !isRecording && (
                <div className="gif-preview-card" style={{ color: 'var(--text-dim)', fontSize: '11px', textAlign: 'center' }}>
                  <Film size={28} style={{ opacity: 0.3, marginBottom: '6px' }} />
                  <div>Click "RECORD GIF" below to generate a seamless animated loop.</div>
                </div>
              )}
            </div>
          ) : (
            <textarea
              className="code-editor-area"
              style={{
                minHeight: '280px',
                fontFamily: 'var(--font-mono)',
                fontVariantLigatures: 'none',
                WebkitFontVariantLigatures: 'none',
                fontFeatureSettings: '"liga" 0, "calt" 0, "dlig" 0',
              }}
              value={text}
              readOnly
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          {activeTab === 'gif' ? (
            <>
              {gifUrl && (
                <button
                  className="btn"
                  onClick={handleRecordGif}
                  disabled={isRecording}
                >
                  <RotateCcw size={12} />
                  RE-RECORD
                </button>
              )}
              {!gifUrl ? (
                <button
                  className="btn btn-primary"
                  onClick={handleRecordGif}
                  disabled={isRecording}
                >
                  {isRecording ? <Loader2 size={12} className="dice-spin" /> : <Play size={12} />}
                  {isRecording ? 'RECORDING GIF...' : 'START RECORDING GIF'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                >
                  <Download size={12} />
                  DOWNLOAD {effectiveFileName}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn" onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED TO CLIPBOARD' : 'COPY CODE'}
              </button>
              <button className="btn btn-primary" onClick={handleDownload}>
                <Download size={12} />
                DOWNLOAD {effectiveFileName}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
