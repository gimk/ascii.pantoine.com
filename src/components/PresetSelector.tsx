import React, { useState } from 'react';
import { Preset } from '../types/ascii';
import { PRESETS } from '../engine/presets';
import { BookmarkPlus, Trash2, Dices } from 'lucide-react';

interface PresetSelectorProps {
  activePresetId: string;
  onSelectPreset: (preset: Preset) => void;
  onSaveCustomPreset: (name: string) => void;
  userPresets: Preset[];
  onDeleteUserPreset: (id: string) => void;
  onRandomize?: () => void;
  isRandomizing?: boolean;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  activePresetId,
  onSelectPreset,
  onSaveCustomPreset,
  userPresets,
  onDeleteUserPreset,
  onRandomize,
  isRandomizing = false,
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
      {/* 0. Large Randomize Synthesizer Button */}
      {onRandomize && (
        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className="btn btn-randomize"
            style={{
              width: '100%',
              padding: '11px 14px',
              fontSize: '11.5px',
              fontWeight: 800,
              letterSpacing: '0.07em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderRadius: '4px',
            }}
            onClick={onRandomize}
            title="Synthesize a completely new random parametric wave animation (Press R)"
          >
            <Dices size={16} className={`header-btn-icon ${isRandomizing ? 'dice-spin' : ''}`} />
            <span>RANDOMIZE WAVE ANIMATION (R)</span>
          </button>
        </div>
      )}

      {/* Built-in Presets */}
      <div className="control-section">
        <div className="section-header">
          <span>Example wave presets</span>
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

        <p style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: 1.35 }}>
          Presets are stored locally in your browser and will be cleared if cookies or website storage are deleted.
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '22px', marginBottom: '2px' }}>
                    <div className="preset-card-title">{preset.name}</div>
                    {preset.type === 'custom' && (
                      <span style={{ fontSize: '8px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '2px', fontWeight: 700 }}>
                        CODE
                      </span>
                    )}
                  </div>
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
