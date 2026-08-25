import React, { useState } from 'react';
import { DeferredColorInput, NumberInput } from './controlPrimitives';
import { ArrowLeftRight, Wand2, Plus, Minus } from 'lucide-react';

export interface NTonePreset {
  name: string;
  category?: string;
  stops: string[];
  title: string;
}

export const N_TONE_PRESETS: NTonePreset[] = [
  {
    name: 'Cyberpunk Neon',
    stops: ['#050510', '#7b1fa2', '#00f0ff', '#ff007f'],
    title: '4-Tone Cyberpunk Neon Magenta & Cyan',
  },
  {
    name: 'Game Boy Classic',
    stops: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    title: '4-Tone DMG-01 Nintendo Game Boy Olive Green',
  },
  {
    name: 'Amber CRT',
    stops: ['#080400', '#502500', '#b56500', '#ffb000'],
    title: '4-Tone Vintage Amber Phosphor CRT Monitor',
  },
  {
    name: 'Matrix Terminal',
    stops: ['#000a00', '#003300', '#00aa33', '#55ff55'],
    title: '4-Tone Matrix Phosphor Green',
  },
  {
    name: 'Thermal Heatmap',
    stops: ['#000000', '#0022cc', '#ff0000', '#ffff00', '#ffffff'],
    title: '5-Tone FLIR Thermal Infrared Heatmap',
  },
  {
    name: 'Sunset Horizon',
    stops: ['#0d0415', '#481136', '#9c2a3e', '#e06f3b', '#ffd460'],
    title: '5-Tone Warm Sunset Crimson & Gold',
  },
  {
    name: 'Deep Ocean',
    stops: ['#020b14', '#0a2e4c', '#156187', '#34a5ba', '#a3f0e8'],
    title: '5-Tone Abyssal Navy to Seafoam Aqua',
  },
  {
    name: 'Vaporwave Dream',
    stops: ['#180828', '#501669', '#a22a84', '#e26d9c', '#fce8a6'],
    title: '5-Tone Synthwave Violet, Pink and Cream',
  },
  {
    name: 'Magma Glow',
    stops: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
    title: '6-Tone Volcanic Magma & Plasma Glow',
  },
  {
    name: 'Sepia Print',
    stops: ['#1b1008', '#422a1d', '#785338', '#b58d67', '#f4e4c1'],
    title: '5-Tone Daguerreotype Vintage Sepia Photo',
  },
  {
    name: 'Cyan & Magenta',
    stops: ['#001122', '#00f0ff', '#ff0055'],
    title: '3-Tone Synth Duotone Cyan & Magenta',
  },
  {
    name: 'Monochrome High-Contrast',
    stops: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    title: '4-Tone Pure Neutral Grayscale Ramp',
  },
  {
    name: 'Solarized Dark',
    stops: ['#002b36', '#073642', '#268bd2', '#859900', '#fdf6e3'],
    title: '5-Tone Solarized Terminal Palette',
  },
  {
    name: 'Blueprint Technical',
    stops: ['#00112c', '#003366', '#0066aa', '#33aaff', '#ffffff'],
    title: '5-Tone Architectural Cyanotype Blueprint',
  },
];

function parseHex(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num) || clean.length < 6) return { r: 128, g: 128, b: 128 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function interpolateStops(stops: string[], newCount: number): string[] {
  if (newCount < 2) return stops.slice(0, 1);
  if (stops.length === 0) return ['#000000', '#ffffff'];
  if (stops.length === 1) return [stops[0], stops[0]];

  const parsed = stops.map(parseHex);
  const result: string[] = [];

  for (let i = 0; i < newCount; i++) {
    const t = i / (newCount - 1);
    const p = t * (parsed.length - 1);
    const lowIdx = Math.floor(p);
    const highIdx = Math.min(parsed.length - 1, Math.ceil(p));
    const subT = p - lowIdx;

    const c1 = parsed[lowIdx];
    const c2 = parsed[highIdx];

    const r = c1.r + (c2.r - c1.r) * subT;
    const g = c1.g + (c2.g - c1.g) * subT;
    const b = c1.b + (c2.b - c1.b) * subT;

    result.push(rgbToHex(r, g, b));
  }
  return result;
}

export interface NToneRampEditorProps {
  stops?: string[];
  onChangeStops: (newStops: string[]) => void;
}

export const NToneRampEditor: React.FC<NToneRampEditorProps> = ({
  stops = ['#0a0a0a', '#00a848', '#00ff66'],
  onChangeStops,
}) => {
  const currentStops = stops && stops.length >= 2 ? stops : ['#000000', '#ffffff'];
  const count = currentStops.length;
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  const handleSetCount = (newCount: number) => {
    const clamped = Math.max(2, Math.min(256, newCount));
    if (clamped === count) return;
    onChangeStops(interpolateStops(currentStops, clamped));
  };

  const handleUpdateStop = (index: number, newColor: string) => {
    const updated = [...currentStops];
    updated[index] = newColor;
    onChangeStops(updated);
  };

  const handleReverse = () => {
    onChangeStops([...currentStops].reverse());
  };

  const handleInterpolate = () => {
    if (currentStops.length <= 2) return;
    const first = currentStops[0];
    const last = currentStops[currentStops.length - 1];
    onChangeStops(interpolateStops([first, last], count));
  };

  const handleApplyPreset = (presetName: string) => {
    setSelectedPreset(presetName);
    const p = N_TONE_PRESETS.find((x) => x.name === presetName);
    if (p) {
      onChangeStops([...p.stops]);
    }
  };

  const gradientCss = `linear-gradient(to right, ${currentStops.join(', ')})`;
  const isLargeCount = count > 16;

  return (
    <div style={{ marginTop: '8px' }}>
      {/* 1. Live Gradient Preview Bar */}
      <div className="ntone-gradient-preview" style={{ background: gradientCss }} title="Live N-Tone Color Ramp">
        <div className="ntone-gradient-stops-overlay">
          {count <= 32 ? (
            currentStops.map((_, idx) => (
              <div
                key={idx}
                className="ntone-gradient-stop-tick"
                title={`Tone ${idx + 1} (${Math.round((idx / (count - 1)) * 100)}%)`}
              />
            ))
          ) : (
            <>
              <div className="ntone-gradient-stop-tick" title="0% (Shadow)" />
              <div className="ntone-gradient-stop-tick" title="50% (Mid)" />
              <div className="ntone-gradient-stop-tick" title="100% (Highlight)" />
            </>
          )}
        </div>
      </div>

      {/* 2. Unified TONE COUNT (2–256) with - / manual number field / + */}
      <div className="control-row" style={{ marginTop: '8px', marginBottom: '6px' }}>
        <span className="control-label">
          Tones Count (2–256)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="slider-nudge-btn"
            style={{ width: '24px', height: '24px' }}
            disabled={count <= 2}
            onClick={() => handleSetCount(count - 1)}
            title="Decrease tones count by 1"
          >
            <Minus size={12} />
          </button>

          <NumberInput
            value={count}
            min={2}
            max={256}
            step={1}
            onChange={handleSetCount}
          />

          <button
            type="button"
            className="slider-nudge-btn"
            style={{ width: '24px', height: '24px' }}
            disabled={count >= 256}
            onClick={() => handleSetCount(count + 1)}
            title="Increase tones count by 1"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* 3. Utility Actions & Presets Toolbar */}
      <div className="ntone-toolbar" style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '3px 8px', fontSize: '10px', height: '22px' }}
            onClick={handleReverse}
            title="Reverse Ramp (Invert Highlight & Shadow order)"
          >
            <ArrowLeftRight size={11} style={{ marginRight: '3px' }} />
            REV
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '3px 8px', fontSize: '10px', height: '22px' }}
            onClick={handleInterpolate}
            disabled={count <= 2}
            title="Auto-interpolate intermediate colors between first and last stop"
          >
            <Wand2 size={11} style={{ marginRight: '3px' }} />
            BLEND
          </button>
        </div>

        <select
          className="number-input"
          style={{ width: '150px', textAlign: 'left', padding: '3px 6px', fontSize: '10.5px' }}
          value={selectedPreset}
          onChange={(e) => handleApplyPreset(e.target.value)}
        >
          <option value="" disabled>
            Presets...
          </option>
          {N_TONE_PRESETS.map((p) => (
            <option key={p.name} value={p.name} title={p.title}>
              {p.name} ({p.stops.length}T)
            </option>
          ))}
        </select>
      </div>

      {/* 4. Color Stops List (Uniform Alignment, No Trash button) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          marginTop: '6px',
          ...(isLargeCount ? { maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } : {}),
        }}
      >
        {currentStops.map((stopColor, idx) => {
          const pct = Math.round((idx / (count - 1)) * 100);
          const isFirst = idx === 0;
          const isLast = idx === count - 1;
          const roleLabel = isFirst ? 'SHADOW' : isLast ? 'HIGHLIGHT' : `TONE ${idx + 1}`;

          return (
            <div key={idx} className="ntone-stop-card">
              <div className="ntone-stop-label">
                <span className="ntone-stop-badge">{pct}%</span>
                <span>{roleLabel}</span>
              </div>
              <DeferredColorInput
                value={stopColor}
                fallback="#ffffff"
                hexFieldWidth="84px"
                onChange={(c) => handleUpdateStop(idx, c)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
