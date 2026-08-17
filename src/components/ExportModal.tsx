import React, { useState } from 'react';
import { X, Copy, Download, Check } from 'lucide-react';
import { generateAstroComponent, generateStandaloneHtml } from '../engine/exporter';
import { WaveParams, ParticleConfig } from '../types/ascii';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  particleConfig: ParticleConfig;
  cols: number;
  rows: number;
  density: string;
  currentAsciiFrame: string;
}

type ExportTab = 'astro' | 'html' | 'json' | 'ascii';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  name,
  type,
  params,
  customCode,
  customPrepare,
  particleConfig,
  cols,
  rows,
  density,
  currentAsciiFrame,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('astro');
  const [copied, setCopied] = useState<boolean>(false);
  const [customBaseName, setCustomBaseName] = useState<string>('');

  const defaultBaseName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ascii-wave';

  // Initialize or reset base filename when preset name or modal open state changes
  React.useEffect(() => {
    setCustomBaseName(defaultBaseName);
  }, [name, isOpen]);

  if (!isOpen) return null;

  const exportCfg = {
    name,
    type,
    params,
    customCode,
    customPrepare,
    particleConfig,
    cols,
    rows,
    density,
    fps: 30,
  };

  const getExtension = (): string => {
    switch (activeTab) {
      case 'astro': return '.astro';
      case 'html': return '.html';
      case 'json': return '.json';
      case 'ascii': return '-frame.txt';
    }
  };

  const effectiveFileName = `${(customBaseName.trim() || defaultBaseName).replace(/\.[^/.]+$/, '')}${getExtension()}`;

  const getExportContent = (): { text: string; mimeType: string } => {
    switch (activeTab) {
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
            className={`tab-btn ${activeTab === 'astro' ? 'active' : ''}`}
            onClick={() => setActiveTab('astro')}
          >
            Astro Component (.astro)
          </button>
          <button
            className={`tab-btn ${activeTab === 'html' ? 'active' : ''}`}
            onClick={() => setActiveTab('html')}
          >
            Standalone HTML (.html)
          </button>
          <button
            className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            Preset JSON (.json)
          </button>
          <button
            className={`tab-btn ${activeTab === 'ascii' ? 'active' : ''}`}
            onClick={() => setActiveTab('ascii')}
          >
            Current Frame (.txt)
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
            style={{ minHeight: '280px', fontFamily: 'var(--font-mono)' }}
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
