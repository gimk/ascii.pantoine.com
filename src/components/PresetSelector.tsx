import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { Preset } from '../types/ascii';
import { PRESETS } from '../engine/presets';
import { Dices, Waves } from 'lucide-react';

interface PresetSelectorProps {
  activePresetId: string;
  onSelectPreset: (preset: Preset) => void;
  onRandomize?: () => void;
  isRandomizing?: boolean;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  activePresetId,
  onSelectPreset,
  onRandomize,
  isRandomizing = false,
}) => {
  return (
    <div className="tab-content">
      {/* 0. Large Randomize Synthesizer Button */}
      {onRandomize && (
        <div className="btn-hero-wrap">
          <button
            type="button"
            className="btn btn-randomize btn-hero"
            onClick={onRandomize}
            title="Synthesize a completely new random parametric wave animation (Press R)"
          >
            <Dices size={16} className={`header-btn-icon ${isRandomizing ? 'dice-spin' : ''}`} />
            <span>RANDOMIZE WAVE ANIMATION (R)</span>
          </button>
        </div>
      )}

      {/* Built-in Presets */}
      <CollapsibleSection
        title="Example wave presets"
        icon={<Waves size={12} />}
        persistKey="PresetSelector-example-wave-presets"
        badge={PRESETS.find((p) => p.id === activePresetId)?.name || '' + PRESETS.length + ' presets'}
      >
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
      </CollapsibleSection>
    </div>
  );
};
