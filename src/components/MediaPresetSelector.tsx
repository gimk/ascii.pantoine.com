import React, { useState } from 'react';
import { MediaPreset, MediaConfig } from '../types/ascii';
import { MEDIA_PRESETS } from '../engine/mediaPresets';
import { BookmarkPlus, Trash2, Image as ImageIcon } from 'lucide-react';

interface MediaPresetSelectorProps {
  activePresetId: string;
  activeMediaConfig?: MediaConfig;
  onSelectPreset: (preset: MediaPreset) => void;
  onSaveCustomPreset: (name: string) => void;
  userPresets: MediaPreset[];
  onDeleteUserPreset: (id: string) => void;
}

export const MediaPresetSelector: React.FC<MediaPresetSelectorProps> = ({
  activePresetId,
  activeMediaConfig,
  onSelectPreset,
  onSaveCustomPreset,
  userPresets,
  onDeleteUserPreset,
}) => {
  const [customName, setCustomName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    onSaveCustomPreset(customName.trim());
    setCustomName('');
  };

  return (
    <div className="tab-content">
      {/* 1. Built-in Media Presets */}
      <div className="control-section">
        <div className="section-header">
          <span>Standard 2D Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {MEDIA_PRESETS.length} presets
          </span>
        </div>
        {MEDIA_PRESETS.length === 0 ? (
          <div
            style={{
              padding: '12px 10px',
              background: 'var(--bg-control)',
              border: '1px dashed var(--border-color)',
              borderRadius: '3px',
              textAlign: 'center',
              fontSize: '10px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            <ImageIcon size={18} color="var(--accent)" style={{ display: 'block', margin: '0 auto 6px', opacity: 0.7 }} />
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No Built-in Presets</div>
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
              Import images in the <strong>FILE</strong> tab or press <strong>Cmd+V</strong> to paste, then save your custom presets below!
            </div>
          </div>
        ) : (
          <div className="presets-grid">
            {MEDIA_PRESETS.map((preset) => {
              const isActive = activePresetId === preset.id && activeMediaConfig?.sourceType === 'preset';
              return (
                <button
                  key={preset.id}
                  className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectPreset(preset)}
                >
                  <div className="preset-card-title">
                    <ImageIcon size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                    {preset.name}
                  </div>
                  <div className="preset-card-desc">{preset.description}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. User Saved 2D Presets */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>User Saved 2D Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {userPresets.length} saved
          </span>
        </div>

        <p style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: 1.35 }}>
          Custom 2D media filters, transforms, and dithering presets saved in local browser storage.
        </p>

        {/* Save Current Preset Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            type="text"
            className="number-input"
            style={{ flex: 1, textAlign: 'left', padding: '4px 8px' }}
            placeholder="Preset Name..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            <BookmarkPlus size={12} />
            SAVE
          </button>
        </form>

        {userPresets.length === 0 ? (
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', padding: '8px' }}>
            No custom media presets saved yet.
          </div>
        ) : (
          <div className="presets-grid">
            {userPresets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`preset-card ${isActive ? 'active' : ''}`}
                  style={{ position: 'relative' }}
                  onClick={() => onSelectPreset(preset)}
                >
                  <div className="preset-card-title">{preset.name}</div>
                  <div className="preset-card-desc">{preset.description}</div>
                  <button
                    className="btn btn-sm"
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      padding: '2px 4px',
                      color: 'var(--text-dim)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteUserPreset(preset.id);
                    }}
                    title="Delete Preset"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
