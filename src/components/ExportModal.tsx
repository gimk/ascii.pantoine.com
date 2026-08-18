import React, { useState } from 'react';
import { X, Copy, Download, Check, Bot } from 'lucide-react';
import { generateAstroComponent, generateStandaloneHtml, generateAiPrompt } from '../engine/exporter';
import { WaveParams, ParticleConfig, OptimizeConfig } from '../types/ascii';

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
  initialTab?: 'prompt' | 'astro' | 'html' | 'json' | 'ascii';
}

type ExportTab = 'prompt' | 'astro' | 'html' | 'json' | 'ascii';

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
  initialTab = 'prompt',
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>(initialTab);
  const [copied, setCopied] = useState<boolean>(false);
  const [customBaseName, setCustomBaseName] = useState<string>('');

  const defaultBaseName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ascii-wave';

  // Initialize or reset base filename when preset name or modal open state changes
  React.useEffect(() => {
    setCustomBaseName(defaultBaseName);
  }, [name, isOpen]);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
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
    }
  };

  const effectiveFileName = `${(customBaseName.trim() || defaultBaseName).replace(/\.[^/.]+$/, '')}${getExtension()}`;

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
    }
  };

  const { text, mimeType } = getExportContent();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
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
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button className="btn" onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED TO CLIPBOARD' : 'COPY CODE'}
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            <Download size={12} />
            DOWNLOAD {effectiveFileName}
          </button>
        </div>
      </div>
    </div>
  );
};
