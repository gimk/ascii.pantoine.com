import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { Wand2 } from 'lucide-react';
import {
  SHADER_PRESETS,
  ShaderPreset,
  ShaderPresetConfig,
  isShaderPresetActive,
} from '../engine/shaderPresets';

interface ShaderPresetControlsProps {
  /** Current values of the fields the presets own, for the active highlight. */
  current: Partial<ShaderPresetConfig>;
  onApply: (preset: ShaderPreset) => void;
}

/**
 * Shader preset picker.
 *
 * These used to be three unlabelled chips (MAC / CYBER / NEWS) buried in the
 * render settings, next to controls they overwrite. A look spans render, effect
 * and tonal settings, so it gets its own panel at the top of the shading
 * section: pick the look first, then refine it in the panels below.
 */
export const ShaderPresetControls: React.FC<ShaderPresetControlsProps> = ({
  current,
  onApply,
}) => {
  const activePreset = SHADER_PRESETS.find((p) => isShaderPresetActive(p, current));

  return (
    <CollapsibleSection
      title="SHADER PRESETS"
      icon={<Wand2 size={12} />}
      persistKey="ShaderPresetControls-shader-presets"
      defaultOpen={true}
      badge={activePreset ? activePreset.label : 'CUSTOM'}
    >
      <p
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          margin: '0 0 8px',
          lineHeight: 1.35,
        }}
      >
        Sets render, effect and tonal controls together. Resolution, framing and
        palette are left alone.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '4px',
        }}
      >
        {SHADER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`chip-btn ${activePreset?.id === preset.id ? 'active' : ''}`}
            onClick={() => onApply(preset)}
            title={preset.description}
            style={{ fontSize: '9px', padding: '5px 3px' }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {activePreset && (
        <p
          style={{
            fontSize: '9.5px',
            color: 'var(--text-dim)',
            margin: '8px 0 0',
            lineHeight: 1.35,
          }}
        >
          {activePreset.description}
        </p>
      )}
    </CollapsibleSection>
  );
};
