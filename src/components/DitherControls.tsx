import React, { useState, useMemo } from 'react';
import { DitherAlgorithm, DitherFamily } from '../types/ascii';
import { DITHER_ALGORITHMS } from '../engine/ditherAlgorithms';
import { Search } from 'lucide-react';


interface DitherControlsProps {
  algorithm: DitherAlgorithm;
  onChangeAlgorithm: (algo: DitherAlgorithm) => void;
  noise?: number;
  onChangeNoise?: (noise: number) => void;
}

const FAMILIES: { id: DitherFamily | 'all'; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'error-diffusion', label: 'DIFFUSION' },
  { id: 'ordered', label: 'ORDERED' },
  { id: 'blue-noise', label: 'NOISE' },
  { id: 'algorithmic', label: 'FRACTAL' },
  { id: 'modulation', label: 'GLITCH' },
];

export const DitherControls: React.FC<DitherControlsProps> = ({
  algorithm,
  onChangeAlgorithm,
  noise = 0,
  onChangeNoise,
}) => {
  const [activeFamily, setActiveFamily] = useState<DitherFamily | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredAlgorithms = useMemo(() => {
    return DITHER_ALGORITHMS.filter((algo) => {
      const matchesFamily = activeFamily === 'all' || algo.family === activeFamily;
      const matchesSearch =
        !searchTerm ||
        algo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        algo.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFamily && matchesSearch;
    });
  }, [activeFamily, searchTerm]);

  const activeMeta = useMemo(() => {
    return DITHER_ALGORITHMS.find((a) => a.id === algorithm) || DITHER_ALGORITHMS[0];
  }, [algorithm]);

  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>
          DITHERING ALGORITHM
        </span>
        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
          {DITHER_ALGORITHMS.length} ALGORITHMS
        </span>
      </div>

      {/* Search & Family Filter Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={11} style={{ position: 'absolute', left: '6px', top: '7px', color: 'var(--text-dim)' }} />
          <input
            type="text"
            className="text-input"
            placeholder="Search 40+ algorithms (Bayer, Atkinson, JJN...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '22px',
              paddingRight: '6px',
              paddingTop: '3px',
              paddingBottom: '3px',
              fontSize: '10px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '2px' }}>
          {FAMILIES.map((fam) => (
            <button
              key={fam.id}
              type="button"
              className={`chip-btn ${activeFamily === fam.id ? 'active' : ''}`}
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '2px',
                background: activeFamily === fam.id ? 'var(--accent)' : 'var(--bg-control)',
                color: activeFamily === fam.id ? '#000' : 'var(--text-muted)',
                fontWeight: activeFamily === fam.id ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setActiveFamily(fam.id)}
            >
              {fam.label}
            </button>
          ))}
        </div>
      </div>

      {/* Algorithm Dropdown with Categorized Optgroups */}
      <div style={{ marginBottom: '8px' }}>
        <select
          className="select-input"
          value={algorithm}
          onChange={(e) => onChangeAlgorithm(e.target.value as DitherAlgorithm)}
          style={{ width: '100%', fontSize: '11px', padding: '4px 6px', fontFamily: 'var(--font-mono)' }}
        >
          {activeFamily === 'all' && !searchTerm ? (
            <>
              <optgroup label="── ERROR DIFFUSION (13) ──">
                {DITHER_ALGORITHMS.filter((a) => a.family === 'error-diffusion').map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── ORDERED & CLUSTERED (12) ──">
                {DITHER_ALGORITHMS.filter((a) => a.family === 'ordered').map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── BLUE NOISE & STOCHASTIC (5) ──">
                {DITHER_ALGORITHMS.filter((a) => a.family === 'blue-noise').map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── ALGORITHMIC & FRACTAL (4) ──">
                {DITHER_ALGORITHMS.filter((a) => a.family === 'algorithmic').map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── MODULATION & GLITCH (4) ──">
                {DITHER_ALGORITHMS.filter((a) => a.family === 'modulation').map((algo) => (
                  <option key={algo.id} value={algo.id}>
                    {algo.name}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            filteredAlgorithms.map((algo) => (
              <option key={algo.id} value={algo.id}>
                {algo.name} ({algo.family})
              </option>
            ))
          )}
        </select>
      </div>


      {/* Description readout */}
      <div
        style={{
          fontSize: '9.5px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          padding: '4px 6px',
          background: 'rgba(0,0,0,0.3)',
          borderLeft: '2px solid var(--accent)',
          marginBottom: '10px',
          lineHeight: '1.3',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>{activeMeta.name}:</strong> {activeMeta.description}
      </div>

      {/* Noise Injection Slider */}
      {onChangeNoise && (
        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label" title="Injects stochastic procedural noise into dither thresholds">
            Noise Dither Grain
          </span>
          <div className="control-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="range"
              min={0}
              max={100}
              value={noise}
              onChange={(e) => onChangeNoise(parseInt(e.target.value, 10) || 0)}
              className="range-input"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', width: '28px', textAlign: 'right' }}>
              {noise}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
