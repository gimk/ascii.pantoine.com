import React, { useState } from 'react';
import { ModelPreset, ModelConfig } from '../types/ascii';
import { MODEL_PRESETS } from '../engine/modelPresets';
import { BookmarkPlus, Trash2, Box } from 'lucide-react';

interface ModelPresetSelectorProps {
  activePresetId: string;
  activeModelConfig?: ModelConfig;
  onSelectPreset: (preset: ModelPreset) => void;
  onSaveCustomPreset: (name: string) => void;
  userPresets: ModelPreset[];
  onDeleteUserPreset: (id: string) => void;
}

export const ModelPresetSelector: React.FC<ModelPresetSelectorProps> = ({
  activePresetId,
  activeModelConfig,
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
      {/* 1. Built-in 3D Model Presets */}
      <div className="control-section">
        <div className="section-header">
          <span>Standard 3D Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {MODEL_PRESETS.length} presets
          </span>
        </div>
        <div className="presets-grid">
          {MODEL_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id && activeModelConfig?.sourceType === 'preset';
            return (
              <button
                key={preset.id}
                className={`preset-card ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPreset(preset)}
              >
                <div className="preset-card-title">
                  <Box size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  {preset.name}
                </div>
                <div className="preset-card-desc">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. User Saved 3D Presets */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>User Saved 3D Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {userPresets.length} saved
          </span>
        </div>

        <p style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: 1.35 }}>
          Custom 3D model setups and transformations saved in local browser storage.
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
            No custom 3D presets saved yet.
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
