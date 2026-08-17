import React, { useState } from 'react';
import { Preset } from '../types/ascii';
import { PRESETS } from '../engine/presets';
import { BookmarkPlus, Trash2 } from 'lucide-react';

interface PresetSelectorProps {
  activePresetId: string;
  onSelectPreset: (preset: Preset) => void;
  onSaveCustomPreset: (name: string) => void;
  userPresets: Preset[];
  onDeleteUserPreset: (id: string) => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  activePresetId,
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
      {/* Built-in Presets */}
      <div className="control-section">
        <div className="section-header">
          <span>HeroAscii & Wave Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {PRESETS.length} presets
          </span>
        </div>
        <div className="presets-grid">
          {PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                className={`preset-card ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPreset(preset)}
              >
                <div className="preset-card-title">{preset.name}</div>
                <div className="preset-card-desc">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* User Saved Presets */}
      <div className="control-section">
        <div className="section-header">
          <span>User Presets</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {userPresets.length} saved
          </span>
        </div>

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
            No custom presets saved yet.
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
                      top: '4px',
                      right: '4px',
                      padding: '2px 4px',
                      color: '#ff3344',
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
