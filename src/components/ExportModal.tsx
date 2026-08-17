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

  const getExportContent = (): { text: string; filename: string; mimeType: string } => {
    switch (activeTab) {
      case 'astro':
        return {
          text: generateAstroComponent(exportCfg),
          filename: `${name.toLowerCase().replace(/\s+/g, '-')}.astro`,
          mimeType: 'text/plain',
        };
      case 'html':
        return {
          text: generateStandaloneHtml(exportCfg),
          filename: `${name.toLowerCase().replace(/\s+/g, '-')}.html`,
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
          filename: `${name.toLowerCase().replace(/\s+/g, '-')}.json`,
          mimeType: 'application/json',
        };
      case 'ascii':
        return {
          text: currentAsciiFrame,
          filename: `${name.toLowerCase().replace(/\s+/g, '-')}-frame.txt`,
          mimeType: 'text/plain',
        };
    }
  };

  const { text, filename, mimeType } = getExportContent();

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
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>EXPORT ANIMATION: [{name.toUpperCase()}]</span>
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
          <textarea
            className="code-editor-area"
            style={{ minHeight: '320px', fontFamily: 'var(--font-mono)' }}
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
            DOWNLOAD {filename}
          </button>
        </div>
      </div>
    </div>
  );
};
