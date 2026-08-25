import React, { useState, useMemo } from 'react';
import { DitherAlgorithm, DitherFamily } from '../types/ascii';
import {
  DITHER_ALGORITHMS,
  DITHER_FAMILY_LABELS,
  DitherAlgorithmMeta,
  getRandomAlgorithm,
} from '../engine/ditherAlgorithms';
import { DitherSwatchIcon } from './DitherSwatchIcon';
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  Dices,
} from 'lucide-react';

interface DitherAlgorithmPickerProps {
  value?: DitherAlgorithm;
  onChange: (algo: DitherAlgorithm) => void;
}

export const DitherAlgorithmPicker: React.FC<DitherAlgorithmPickerProps> = ({
  value = 'floyd-steinberg',
  onChange,
}) => {
  const currentIdx = useMemo(() => {
    const idx = DITHER_ALGORITHMS.findIndex((a) => a.id === value);
    return idx >= 0 ? idx : 0;
  }, [value]);

  const currentMeta: DitherAlgorithmMeta = DITHER_ALGORITHMS[currentIdx] || DITHER_ALGORITHMS[0];

  // Default selected family to the current algorithm's family
  const [selectedFamily, setSelectedFamily] = useState<DitherFamily | 'all'>(
    currentMeta.family || 'error-diffusion'
  );
  const [isRolling, setIsRolling] = useState(false);

  const handleStep = (direction: -1 | 1) => {
    const total = DITHER_ALGORITHMS.length;
    const nextIdx = (currentIdx + direction + total) % total;
    const nextAlgo = DITHER_ALGORITHMS[nextIdx];
    onChange(nextAlgo.id);
  };

  const handleRandomize = () => {
    setIsRolling(true);
    setTimeout(() => setIsRolling(false), 450);
    const chosen = getRandomAlgorithm('all', value);
    if (selectedFamily !== 'all') {
      setSelectedFamily(chosen.family);
    }
    onChange(chosen.id);
  };

  // Grouped algorithms for dropdown
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

  // Family counts
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: DITHER_ALGORITHMS.length };
    for (const algo of DITHER_ALGORITHMS) {
      counts[algo.family] = (counts[algo.family] || 0) + 1;
    }
    return counts;
  }, []);

  // Show all 44 algorithms when 'all' is selected, or all algorithms within the selected family
  const visibleChips = useMemo(() => {
    if (selectedFamily === 'all') {
      return DITHER_ALGORITHMS;
    }
    return DITHER_ALGORITHMS.filter((a) => a.family === selectedFamily);
  }, [selectedFamily]);

  return (
    <div className="dither-picker-container" style={{ marginBottom: '10px' }}>
      {/* 1. Main Stepper, Dropdown & Surprise Me Bar */}
      <div className="control-row" style={{ marginBottom: '8px', alignItems: 'center' }}>
        <span
          className="control-label"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
            fontSize: '11px',
          }}
        >
          <Cpu size={13} style={{ color: 'var(--accent)' }} />
          <span>Algorithm</span>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {/* Previous */}
          <button
            type="button"
            className="slider-nudge-btn"
            onClick={() => handleStep(-1)}
            title="Previous algorithm (wraps around)"
            style={{ width: '24px', height: '24px', padding: 0 }}
          >
            <ChevronLeft size={13} />
          </button>

          {/* Grouped Select Dropdown */}
          <select
            className="number-input"
            style={{
              width: '165px',
              textAlign: 'left',
              padding: '2px 6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              height: '24px',
            }}
            value={value}
            onChange={(e) => onChange(e.target.value as DitherAlgorithm)}
          >
            {Array.from(groupedByFamily.entries()).map(([family, algos]) => (
              <optgroup key={family} label={DITHER_FAMILY_LABELS[family] || family}>
                {algos.map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name} {algo.badge ? `[${algo.badge}]` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Next */}
          <button
            type="button"
            className="slider-nudge-btn"
            onClick={() => handleStep(1)}
            title="Next algorithm (wraps around)"
            style={{ width: '24px', height: '24px', padding: 0 }}
          >
            <ChevronRight size={13} />
          </button>

          {/* Surprise Me / Randomizer Button */}
          <button
            type="button"
            className="slider-nudge-btn"
            onClick={handleRandomize}
            title="Surprise Me: pick a random algorithm"
            style={{
              width: '24px',
              height: '24px',
              padding: 0,
              color: 'var(--accent)',
            }}
          >
            <Dices
              size={13}
              style={{
                transform: isRolling ? 'rotate(360deg)' : 'none',
                transition: 'transform 0.45s ease',
              }}
            />
          </button>
        </div>
      </div>

      {/* 2. Family Category Grid (Matches Quantize Level Buttons, No Overflow) */}
      <div className="dither-family-grid">
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'error-diffusion' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('error-diffusion')}
          title="Error diffusion algorithms (Floyd-Steinberg, Atkinson, Stucki...)"
        >
          DIFFUSION ({familyCounts['error-diffusion']})
        </button>
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'ordered' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('ordered')}
          title="Ordered matrices, halftone dot screens, and crosshatch lines"
        >
          ORDERED ({familyCounts['ordered']})
        </button>
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'blue-noise' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('blue-noise')}
          title="Stochastic noise and organic film grain"
        >
          NOISE ({familyCounts['blue-noise']})
        </button>
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'algorithmic' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('algorithmic')}
          title="Fractal space-filling curves and Knuth tiling"
        >
          FRACTAL ({familyCounts['algorithmic']})
        </button>
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'modulation' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('modulation')}
          title="Generative carrier wave, glitch, bitwise demoscene, and ripples"
        >
          GENERATIVE ({familyCounts['modulation']})
        </button>
        <button
          type="button"
          className={`dither-family-tab ${selectedFamily === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedFamily('all')}
          title="Show all 44 algorithms"
          style={{ fontWeight: 800 }}
        >
          ALL ({familyCounts['all']})
        </button>
      </div>

      {/* 3. Dynamic Algorithm Chips Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '5px',
          marginBottom: '8px',
          maxHeight: selectedFamily === 'all' ? '340px' : undefined,
          overflowY: selectedFamily === 'all' ? 'auto' : undefined,
          paddingRight: selectedFamily === 'all' ? '2px' : undefined,
        }}
      >
        {visibleChips.map((algo) => {
          const isSelected = value === algo.id;
          return (
            <button
              key={algo.id}
              type="button"
              className={`quantize-chip dither-algo-chip ${isSelected ? 'active' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '5px 4px',
                minHeight: '44px',
                fontSize: '10px',
                textAlign: 'center',
                overflow: 'hidden',
              }}
              onClick={() => onChange(algo.id)}
              title={`${algo.name}: ${algo.description}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%' }}>
                <DitherSwatchIcon type={algo.patternType} size={12} active={isSelected} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    fontSize: '10px',
                  }}
                >
                  {algo.name.split(' ')[0]}
                </span>
              </div>
              {algo.badge && (
                <span
                  style={{
                    fontSize: '8.5px',
                    opacity: isSelected ? 1 : 0.8,
                    color: isSelected ? 'var(--accent)' : 'var(--text-dim)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {algo.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Telemetry & Algorithm Inspector Footer */}
      <div
        style={{
          padding: '8px 10px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          fontSize: '10.5px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.4',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
            <DitherSwatchIcon type={currentMeta.patternType} size={14} active={true} />
            <strong
              style={{
                color: 'var(--text-primary)',
                fontSize: '11.5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {currentMeta.name}
            </strong>
            {currentMeta.badge && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  border: '1px solid rgba(255, 170, 0, 0.4)',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentMeta.badge}
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--accent)',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {currentIdx + 1}/{DITHER_ALGORITHMS.length}
          </span>
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: '10px', lineHeight: '1.35' }}>
          {currentMeta.description}
        </div>

        {currentMeta.tags && currentMeta.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
            {currentMeta.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: '9px',
                  color: 'var(--text-dim)',
                  background: 'var(--bg-secondary)',
                  padding: '2px 5px',
                  borderRadius: '2px',
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
