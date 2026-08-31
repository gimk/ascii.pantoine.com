import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { CHARSETS } from '../engine/renderer';
import { AppMode } from '../types/ascii';
import { Type } from 'lucide-react';

interface CharsetThemeBarProps {
  currentCharset: string;
  onChangeCharset: (chars: string) => void;
  appMode?: AppMode;
}

/**
 * Character density ramp. Only meaningful for ASCII output, so the caller omits
 * this section entirely in pixel mode rather than rendering it disabled.
 */
export const CharsetThemeBar: React.FC<CharsetThemeBarProps> = ({
  currentCharset,
  onChangeCharset,
}) => {
  const activeCharsetName = CHARSETS.find((cs) => cs.chars === currentCharset)?.name || 'Custom';

  return (
    <CollapsibleSection
      title="CHARACTER DENSITY RAMP"
      icon={<Type size={12} />}
      persistKey="CharsetThemeBar-character-density-presets"
      badge={activeCharsetName}
      defaultOpen={false}
      onReset={() => onChangeCharset(CHARSETS[0].chars)}
      resetTitle="Reset character density ramp to default"
    >
      <div className="charset-list">
        {CHARSETS.map((cs) => {
          const isSelected = currentCharset === cs.chars;
          return (
            <button
              key={cs.id}
              className={`preset-card charset-card ${isSelected ? 'active' : ''}`}
              onClick={() => onChangeCharset(cs.chars)}
            >
              <div className="charset-card-row">
                <span className="preset-card-title charset-card-name">{cs.name}</span>
                <code className="charset-card-chars">"{cs.chars}"</code>
              </div>
            </button>
          );
        })}
      </div>

      <div className="tonal-subheading" style={{ marginTop: '8px', marginBottom: '4px' }}>
        <span>Custom</span>
      </div>

      <input
        type="text"
        className="text-input charset-custom-input"
        value={currentCharset}
        onChange={(e) => onChangeCharset(e.target.value || ' ')}
        placeholder="e.g.  .:-=+*#%@"
      />
    </CollapsibleSection>
  );
};
