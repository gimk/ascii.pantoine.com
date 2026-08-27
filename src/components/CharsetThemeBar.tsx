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
    <div className="tab-content">
      {/* Palette / theme controls now live in TONAL CONTROLS for every mode. */}
      <CollapsibleSection
        title="Character Density Ramp"
        icon={<Type size={12} />}
        persistKey="CharsetThemeBar-character-density-presets"
        badge={activeCharsetName}
        defaultOpen={false}
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

        <input
          type="text"
          className="text-input charset-custom-input"
          value={currentCharset}
          onChange={(e) => onChangeCharset(e.target.value || ' ')}
          placeholder="e.g.  .:-=+*#%@"
        />
      </CollapsibleSection>
    </div>
  );
};
