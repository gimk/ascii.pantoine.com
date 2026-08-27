import React, { useState, useMemo } from 'react';
import { DitherAlgorithm, DitherFamily, DitherParams } from '../types/ascii';
import {
  DITHER_ALGORITHMS,
  DITHER_FAMILY_LABELS,
  DitherAlgorithmMeta,
  getRandomAlgorithm,
} from '../engine/ditherAlgorithms';
import { DitherSwatchIcon } from './DitherSwatchIcon';
import { DitherParamControls } from './DitherParamControls';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
} from 'lucide-react';

interface DitherAlgorithmPickerProps {
  value?: DitherAlgorithm;
  onChange: (algo: DitherAlgorithm) => void;
  params?: DitherParams;
  onChangeParams?: (params: DitherParams) => void;
  /**
   * Strips everything but the stepper row: arrows, dropdown, randomiser.
   *
   * The family filter, swatch grid and description card are how you *browse*
   * 44 algorithms; BASIC assumes you either step through them or roll the
   * dice, which needs one row rather than half a panel.
   */
  compact?: boolean;
}

export const DitherAlgorithmPicker: React.FC<DitherAlgorithmPickerProps> = ({
  value = 'floyd-steinberg',
  onChange,
  params,
  onChangeParams,
  compact = false,
}) => {
  const currentIdx = useMemo(() => {
    const idx = DITHER_ALGORITHMS.findIndex((a) => a.id === value);
    return idx >= 0 ? idx : 0;
  }, [value]);

  const currentMeta: DitherAlgorithmMeta = DITHER_ALGORITHMS[currentIdx] || DITHER_ALGORITHMS[0];
  const [selectedFamily, setSelectedFamily] = useState<DitherFamily | 'all'>('error-diffusion');
  const [isRolling, setIsRolling] = useState(false);

  // Group algorithms by family for the dropdown
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

  // Compute counts per family for the tabs
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: DITHER_ALGORITHMS.length };
    for (const algo of DITHER_ALGORITHMS) {
      counts[algo.family] = (counts[algo.family] || 0) + 1;
    }
    return counts;
  }, []);

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

  // Show all 44 algorithms when 'all' is selected, or all algorithms within the selected family
  const visibleChips = useMemo(() => {
    if (selectedFamily === 'all') {
      return DITHER_ALGORITHMS;
    }
    return DITHER_ALGORITHMS.filter((a) => a.family === selectedFamily);
  }, [selectedFamily]);

  return (
    <div className={`dither-picker-container${compact ? ' compact' : ''}`}>
      {/* 1. Main Stepper, Dropdown & Surprise Me Bar */}
      <div className="control-row">
        <span className="control-label control-fixed">Algorithm</span>

        <div className="control-cluster">
          {/* Previous */}
          <button
            type="button"
            className="slider-nudge-btn btn-icon-sq"
            onClick={() => handleStep(-1)}
            title="Previous algorithm (wraps around)"
          >
            <ChevronLeft size={13} />
          </button>

          {/* Grouped Select Dropdown */}
          <select
            className="number-input stepper-select"
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
            className="slider-nudge-btn btn-icon-sq"
            onClick={() => handleStep(1)}
            title="Next algorithm (wraps around)"
          >
            <ChevronRight size={13} />
          </button>

          {/* Surprise Me / Randomizer Button */}
          <button
            type="button"
            className={`slider-nudge-btn btn-icon-sq btn-dice${isRolling ? ' rolling' : ''}`}
            onClick={handleRandomize}
            title="Surprise Me: pick a random algorithm"
          >
            <Dices size={13} />
          </button>
        </div>
      </div>

      {compact && null}

      {!compact && (
      <>
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
          className={`dither-family-tab dither-family-tab-all ${
            selectedFamily === 'all' ? 'active' : ''
          }`}
          onClick={() => setSelectedFamily('all')}
          title="Show all 44 algorithms"
        >
          ALL ({familyCounts['all']})
        </button>
      </div>

      {/* 3. Scrollable List of Algorithms for the Active Category */}
      <div className="dither-algo-list">
        {visibleChips.map((algo) => {
          const isSelected = value === algo.id;
          return (
            <button
              key={algo.id}
              type="button"
              className={`dither-algo-row-btn ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(algo.id)}
              title={`${algo.name}: ${algo.description}`}
            >
              <div className="dither-algo-row-left">
                <DitherSwatchIcon type={algo.patternType} size={13} active={isSelected} />
                <span className="dither-algo-row-name">
                  {algo.name}
                </span>
              </div>
              {algo.badge && (
                <span className="dither-algo-row-badge">
                  {algo.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Selected Algorithm Inspector & Parameters (Single Unified Block) */}
      <div className="dither-inspector-card">
        {/* Title Row: Swatch, Name, Badge, Library Index */}
        <div className="dither-inspector-title-row">
          <div className="dither-inspector-title-left">
            <DitherSwatchIcon type={currentMeta.patternType} size={14} active={true} />
            <span className="dither-inspector-title">
              {currentMeta.name}
            </span>
            {currentMeta.badge && (
              <span className="dither-inspector-badge">
                {currentMeta.badge}
              </span>
            )}
          </div>
          <span className="dither-inspector-counter" title="Algorithm index in library">
            #{String(currentIdx + 1).padStart(2, '0')}/{DITHER_ALGORITHMS.length}
          </span>
        </div>

        {/* Algorithm Description */}
        <div className="dither-inspector-desc">
          {currentMeta.description}
        </div>

        {/* Tags */}
        {currentMeta.tags && currentMeta.tags.length > 0 && (
          <div className="dither-inspector-tags">
            {currentMeta.tags.map((t) => (
              <span key={t} className="dither-inspector-tag">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Interactive Parameter Tuning Deck inside the same card */}
        {onChangeParams && (
          <DitherParamControls
            algorithm={value}
            params={params}
            onChange={onChangeParams}
            embedded
          />
        )}
      </div>
      </>
      )}
    </div>
  );
};
