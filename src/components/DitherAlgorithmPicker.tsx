import React, { useMemo } from 'react';
import { DitherAlgorithm, DitherFamily } from '../types/ascii';
import {
  DITHER_ALGORITHMS,
  DITHER_FAMILY_LABELS,
  DitherAlgorithmMeta,
} from '../engine/ditherAlgorithms';
import { ChevronLeft, ChevronRight, Cpu } from 'lucide-react';

interface DitherAlgorithmPickerProps {
  value?: DitherAlgorithm;
  onChange: (algo: DitherAlgorithm) => void;
}

const HERO_PRESETS: { label: string; id: DitherAlgorithm; title: string }[] = [
  { label: 'THRESHOLD', id: 'none', title: 'Direct threshold quantization' },
  { label: 'FLOYD-STEINBERG', id: 'floyd-steinberg', title: 'Classic 4-neighbor balanced error diffusion' },
  { label: 'ATKINSON', id: 'atkinson', title: 'Bill Atkinson 1984 MacPaint diffusion' },
  { label: 'BAYER 4×4', id: 'bayer-4x4', title: '16-level classic ordered matrix' },
  { label: 'BAYER 8×8', id: 'bayer-8x8', title: '64-level smooth ordered matrix' },
  { label: 'BLUE NOISE', id: 'blue-noise', title: 'High-frequency stochastic blue noise stipple' },
  { label: 'HALFTONE', id: 'halftone-dot', title: 'Newsprint-style clustered dot screen' },
  { label: 'KNUTH DOT', id: 'dot-diffusion', title: 'Donald Knuth space-filling tile diffusion' },
  { label: 'HILBERT', id: 'hilbert', title: '1D error diffusion along 2D Hilbert fractal curve' },
];

export const DitherAlgorithmPicker: React.FC<DitherAlgorithmPickerProps> = ({
  value = 'floyd-steinberg',
  onChange,
}) => {
  const currentIdx = useMemo(() => {
    const idx = DITHER_ALGORITHMS.findIndex((a) => a.id === value);
    return idx >= 0 ? idx : 0;
  }, [value]);

  const currentMeta: DitherAlgorithmMeta = DITHER_ALGORITHMS[currentIdx] || DITHER_ALGORITHMS[0];

  const handleStep = (direction: -1 | 1) => {
    const total = DITHER_ALGORITHMS.length;
    const nextIdx = (currentIdx + direction + total) % total;
    onChange(DITHER_ALGORITHMS[nextIdx].id);
  };

  const groupedByFamily = useMemo(() => {
    const map = new Map<DitherFamily, DitherAlgorithmMeta[]>();
    for (const algo of DITHER_ALGORITHMS) {
      if (!map.has(algo.family)) {
        map.set(algo.family, []);
      }
      map.get(algo.family)!.push(algo);
    }
    return map;
  }, []);

  return (
    <div style={{ marginBottom: '10px' }}>
      {/* 1. Stepper Bar & Dropdown Select */}
      <div className="control-row" style={{ marginBottom: '6px' }}>
        <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Cpu size={11} style={{ color: 'var(--accent)' }} />
          <span>Algorithm</span>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Quick Prev Button */}
          <button
            type="button"
            className="slider-nudge-btn"
            onClick={() => handleStep(-1)}
            title="Previous algorithm (wraps around)"
          >
            <ChevronLeft size={12} />
          </button>

          {/* Grouped Select Dropdown */}
          <select
            className="number-input"
            style={{
              width: '160px',
              textAlign: 'left',
              padding: '2px 4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
            value={value}
            onChange={(e) => onChange(e.target.value as DitherAlgorithm)}
          >
            {Array.from(groupedByFamily.entries()).map(([family, algos]) => (
              <optgroup key={family} label={DITHER_FAMILY_LABELS[family] || family}>
                {algos.map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Quick Next Button */}
          <button
            type="button"
            className="slider-nudge-btn"
            onClick={() => handleStep(1)}
            title="Next algorithm (wraps around)"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* 2. Hero Quick-Select Chips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          marginBottom: '6px',
        }}
      >
        {HERO_PRESETS.map((preset) => {
          const isSelected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`quantize-chip ${isSelected ? 'active' : ''}`}
              style={{
                fontSize: '8.5px',
                padding: '4px 2px',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              onClick={() => onChange(preset.id)}
              title={preset.title}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 3. Telemetry & Algorithm Description Footer */}
      <div
        style={{
          padding: '4px 6px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '2px',
          fontSize: '8.5px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.25',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          <strong style={{ color: 'var(--text-muted)' }}>{currentMeta.name}</strong>: {currentMeta.description}
        </span>
        <span
          style={{
            fontSize: '8px',
            color: 'var(--accent)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {currentIdx + 1}/{DITHER_ALGORITHMS.length}
        </span>
      </div>
    </div>
  );
};
