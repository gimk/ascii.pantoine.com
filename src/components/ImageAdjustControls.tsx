import React, { useState, useRef, useMemo, useEffect } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { NumberInput, PrecisionSlider, DeferredColorInput } from './controlPrimitives';
import {
  ImageAdjustConfig,
  ToneMappingConfig,
  DEFAULT_IMAGE_ADJUST_CONFIG,
} from '../types/ascii';
import { evaluateMonotoneCubicSpline } from '../engine/mediaRenderer';
import { computeAutoLevels } from '../engine/autoLevels';
import { Sliders, Sparkles, Minus, Plus, Palette, BarChart3 } from 'lucide-react';

interface ColorPickerInputProps {
  label: string;
  value?: string;
  onChange: (val: string) => void;
}

/**
 * Labelled row wrapper around DeferredColorInput. The picker no longer emits a
 * value per mouse move, so dragging a tone stop does not re-rasterize the
 * frame on every frame of the drag.
 */
const ColorPickerInput: React.FC<ColorPickerInputProps> = ({ label, value = '#ffffff', onChange }) => (
  <div className="control-row">
    <span className="control-label">{label}</span>
    <DeferredColorInput
      value={value}
      fallback="#ffffff"
      hexFieldWidth="82px"
      onChange={onChange}
    />
  </div>
);

// ---------------------------------------------------------------------------
// High-Accuracy Quantize Levels Control
// ---------------------------------------------------------------------------
interface QuantizeLevelsControlProps {
  value?: number; // 0 (auto) or 2..256
  onChange: (val: number) => void;
}

const QUANTIZE_PRESETS: { label: string; value: number; title: string }[] = [
  { label: 'AUTO', value: 0, title: 'Auto (Natural depth from charset or palette)' },
  { label: '2 (1b)', value: 2, title: '2 Levels — 1-bit Monochrome' },
  { label: '4 (2b)', value: 4, title: '4 Levels — 2-bit (Game Boy / CGA)' },
  { label: '8 (3b)', value: 8, title: '8 Levels — 3-bit Color' },
  { label: '16 (4b)', value: 16, title: '16 Levels — 4-bit (C64 / PICO-8)' },
  { label: '32', value: 32, title: '32 Levels — 5-bit Depth' },
  { label: '64', value: 64, title: '64 Levels — 6-bit Posterization' },
  { label: '128', value: 128, title: '128 Levels — 7-bit Semi-continuous' },
  { label: '256', value: 256, title: '256 Levels — 8-bit Continuous Tone' },
];

export const QuantizeLevelsControl: React.FC<QuantizeLevelsControlProps> = ({
  value = 0,
  onChange,
}) => {
  const normalizedVal = value ?? 0;

  // Logarithmic slider warp mapping:
  // pos 0 -> 0 (Auto)
  // pos 1..100 -> exponential 2^1..2^8 (2 to 256)
  const sliderPos = useMemo(() => {
    if (normalizedVal <= 0) return 0;
    const clamped = Math.max(2, Math.min(256, normalizedVal));
    const exp = Math.log2(clamped); // 1 to 8
    const t = (exp - 1) / 7; // 0 to 1
    return Math.round(1 + t * 99);
  }, [normalizedVal]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseInt(e.target.value, 10);
    if (pos === 0) {
      onChange(0);
      return;
    }
    const t = (pos - 1) / 99; // 0 to 1
    const exp = 1 + t * 7; // 1 to 8
    const rawVal = Math.round(Math.pow(2, exp));
    onChange(Math.max(2, Math.min(256, rawVal)));
  };

  const handleStep = (delta: number) => {
    if (normalizedVal === 0) {
      if (delta > 0) onChange(2);
      return;
    }
    const next = normalizedVal + delta;
    if (next < 2) {
      onChange(0); // Underflow to Auto
    } else {
      onChange(Math.min(256, next));
    }
  };

  const getReadoutBadge = () => {
    if (normalizedVal === 0) {
      return 'AUTO (NATURAL)';
    }
    if (normalizedVal === 2) return '2 LEVELS (1-BIT)';
    if (normalizedVal === 4) return '4 LEVELS (2-BIT)';
    if (normalizedVal === 8) return '8 LEVELS (3-BIT)';
    if (normalizedVal === 16) return '16 LEVELS (4-BIT)';
    if (normalizedVal === 32) return '32 LEVELS (5-BIT)';
    if (normalizedVal === 64) return '64 LEVELS (6-BIT)';
    if (normalizedVal === 128) return '128 LEVELS (7-BIT)';
    if (normalizedVal === 256) return '256 LEVELS (8-BIT)';
    return `${normalizedVal} LEVELS`;
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="control-row" style={{ marginBottom: '4px' }}>
        <span
          className="control-label"
          title="Quantization depth fed to the dither pass. 0 = auto (charset ramp or palette length)."
        >
          Quantize Levels
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '8.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              padding: '2px 6px',
              borderRadius: '2px',
              background: normalizedVal === 0 ? 'var(--accent-glow)' : 'var(--bg-control)',
              border: `1px solid ${normalizedVal === 0 ? 'var(--accent)' : 'var(--border-color)'}`,
              color: normalizedVal === 0 ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            {getReadoutBadge()}
          </span>
        </div>
      </div>

      {/* Quick Bit-Depth Preset Chips */}
      <div className="quantize-chip-row">
        {QUANTIZE_PRESETS.map((p) => {
          const isSelected = normalizedVal === p.value;
          return (
            <button
              key={p.value}
              type="button"
              className={`quantize-chip ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(p.value)}
              title={p.title}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Stepper + Warp Slider + Numeric Direct Entry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          className="slider-nudge-btn"
          onClick={() => handleStep(-1)}
          title="Decrease levels by 1"
        >
          <Minus size={10} />
        </button>

        <input
          type="range"
          className="range-slider"
          min={0}
          max={100}
          step={1}
          value={sliderPos}
          onChange={handleSliderChange}
          title={`Quantize level: ${normalizedVal === 0 ? 'Auto' : normalizedVal}`}
        />

        <button
          type="button"
          className="slider-nudge-btn"
          onClick={() => handleStep(1)}
          title="Increase levels by 1"
        >
          <Plus size={10} />
        </button>

        <NumberInput
          value={normalizedVal}
          min={0}
          max={256}
          step={1}
          onChange={(val) => onChange(val === 1 ? 2 : val)}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tone Curve Spline Graph with Preset Bar
// ---------------------------------------------------------------------------
interface ToneCurveGraphProps {
  config: ImageAdjustConfig;
  onChangeConfig: (newConfig: ImageAdjustConfig) => void;
}

const DEFAULT_CURVE_POINTS: [number, number][] = [
  [0, 0],
  [0.25, 0.25],
  [0.5, 0.5],
  [0.75, 0.75],
  [1, 1],
];

const CURVE_PRESETS: { name: string; points: [number, number][]; title: string }[] = [
  {
    name: 'LINEAR',
    title: '1:1 Neutral Linear Transfer',
    points: [
      [0, 0],
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
      [1, 1],
    ],
  },
  {
    name: 'S-CURVE',
    title: 'S-Curve Contrast Boost',
    points: [
      [0, 0],
      [0.25, 0.12],
      [0.5, 0.5],
      [0.75, 0.88],
      [1, 1],
    ],
  },
  {
    name: 'LIFT',
    title: 'Lift Shadow Tones',
    points: [
      [0, 0.16],
      [0.25, 0.42],
      [0.5, 0.65],
      [0.75, 0.85],
      [1, 1],
    ],
  },
  {
    name: 'CONTRAST',
    title: 'High Contrast Punch',
    points: [
      [0, 0],
      [0.2, 0.04],
      [0.5, 0.5],
      [0.8, 0.96],
      [1, 1],
    ],
  },
  {
    name: 'INVERT',
    title: 'Invert Curve Spline',
    points: [
      [0, 1],
      [0.25, 0.75],
      [0.5, 0.5],
      [0.75, 0.25],
      [1, 0],
    ],
  },
];

const ToneCurveGraph: React.FC<ToneCurveGraphProps> = ({ config, onChangeConfig }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activePointIdx, setActivePointIdx] = useState<number | null>(null);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ inVal: number; outVal: number } | null>(null);

  const rawPoints = config.curvePoints && config.curvePoints.length >= 2 ? config.curvePoints : DEFAULT_CURVE_POINTS;
  // Ensure points are sorted by X coordinate
  const sortedPoints = [...rawPoints].sort((a, b) => a[0] - b[0]);

  const samples = 96;
  const pathPoints: [number, number][] = [];

  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = evaluateMonotoneCubicSpline(sortedPoints, x);
    pathPoints.push([x * 100, 100 - y * 100]);
  }

  const pathD = pathPoints.reduce((acc, [px, py], idx) => {
    return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  const getSvgNormalizedCoords = (e: React.PointerEvent<SVGSVGElement | HTMLDivElement>) => {
    if (!svgRef.current) return { normX: 0.5, normY: 0.5 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)); // 0=bottom, 1=top
    return { normX, normY };
  };

  const handlePointPointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActivePointIdx(idx);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointIdx !== null) return;
    const { normX, normY } = getSvgNormalizedCoords(e);
    if (sortedPoints.length >= 12) return;

    // Check if clicking close to an existing point
    const threshold = 0.04;
    for (let k = 0; k < sortedPoints.length; k++) {
      const dist = Math.hypot(sortedPoints[k][0] - normX, sortedPoints[k][1] - normY);
      if (dist < threshold) return;
    }

    const newPoints = [...sortedPoints, [normX, normY] as [number, number]].sort((a, b) => a[0] - b[0]);
    onChangeConfig({ ...config, curvePoints: newPoints });
    const insertedIdx = newPoints.findIndex((p) => Math.abs(p[0] - normX) < 0.001 && Math.abs(p[1] - normY) < 0.001);
    if (insertedIdx >= 0) {
      setActivePointIdx(insertedIdx);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { normX, normY } = getSvgNormalizedCoords(e);
    setCursorPos({
      inVal: Math.round(normX * 255),
      outVal: Math.round(normY * 255),
    });

    if (activePointIdx === null || activePointIdx < 0 || activePointIdx >= sortedPoints.length) return;

    const n = sortedPoints.length;
    let clampedX = normX;

    if (activePointIdx === 0) {
      clampedX = Math.max(0, Math.min(sortedPoints[1][0] - 0.01, normX));
    } else if (activePointIdx === n - 1) {
      clampedX = Math.max(sortedPoints[n - 2][0] + 0.01, Math.min(1, normX));
    } else {
      const minX = sortedPoints[activePointIdx - 1][0] + 0.01;
      const maxX = sortedPoints[activePointIdx + 1][0] - 0.01;
      clampedX = Math.max(minX, Math.min(maxX, normX));
    }

    const clampedY = Math.max(0, Math.min(1, normY));
    const newPoints = [...sortedPoints];
    newPoints[activePointIdx] = [Number(clampedX.toFixed(4)), Number(clampedY.toFixed(4))];

    onChangeConfig({ ...config, curvePoints: newPoints });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActivePointIdx(null);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handlePointDoubleClick = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (idx === 0 || idx === sortedPoints.length - 1) return;
    const newPoints = sortedPoints.filter((_, i) => i !== idx);
    onChangeConfig({ ...config, curvePoints: newPoints });
    setActivePointIdx(null);
  };

  const handleApplyPreset = (points: [number, number][]) => {
    onChangeConfig({
      ...config,
      curvePoints: points.map((p) => [...p] as [number, number]),
    });
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      curvePoints: [...DEFAULT_CURVE_POINTS],
    });
  };

  const activeOrHoveredPoint =
    activePointIdx !== null
      ? sortedPoints[activePointIdx]
      : hoveredPointIdx !== null
      ? sortedPoints[hoveredPointIdx]
      : null;

  return (
    <div
      style={{
        marginBottom: '14px',
        padding: '10px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '3px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '9.5px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: '6px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>TONE CURVE (SPLINE)</span>
          {activeOrHoveredPoint && (
            <span style={{ color: 'var(--accent)', fontSize: '9px', fontWeight: 600 }}>
              IN: {Math.round(activeOrHoveredPoint[0] * 255)} • OUT: {Math.round(activeOrHoveredPoint[1] * 255)}
            </span>
          )}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8.5px', color: 'var(--text-dim)' }}>
            {sortedPoints.length} PTS
          </span>
          <button
            className="btn btn-sm"
            style={{ padding: '1px 6px', fontSize: '8.5px', height: '18px', color: 'var(--text-muted)' }}
            onClick={handleReset}
            title="Reset Tone Curve to Linear 1:1"
          >
            RESET
          </button>
        </div>
      </div>

      {/* Quick Curve Presets Toolbar */}
      <div className="curve-preset-bar">
        {CURVE_PRESETS.map((cp) => (
          <button
            key={cp.name}
            type="button"
            className="curve-preset-btn"
            onClick={() => handleApplyPreset(cp.points)}
            title={cp.title}
          >
            {cp.name}
          </button>
        ))}
      </div>

      {/* SQUARED 1:1 Aspect Ratio Graph */}
      <div
        style={{
          width: '100%',
          maxWidth: '260px',
          aspectRatio: '1 / 1',
          margin: '0 auto',
          position: 'relative',
          background: '#040404',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          overflow: 'hidden',
          cursor: activePointIdx !== null ? 'grabbing' : 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onDoubleClick={handleReset}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            setCursorPos(null);
            setHoveredPointIdx(null);
            if (activePointIdx === null) setActivePointIdx(null);
          }}
        >
          <defs>
            <linearGradient id="interactiveSplineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines (25%, 50%, 75%) */}
          <line x1="25" y1="0" x2="25" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" strokeDasharray="2 2" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

          <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" strokeDasharray="2 2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

          {/* 45-degree Neutral 1:1 Diagonal */}
          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.24)" strokeWidth="0.75" strokeDasharray="3 3" />

          {/* Fill under Curve */}
          <path d={areaD} fill="url(#interactiveSplineGrad)" pointerEvents="none" />

          {/* Active Transfer Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />

          {/* Interactive Editable Control Points (Draggable in both X and Y!) */}
          {sortedPoints.map((pt, idx) => {
            const svgX = pt[0] * 100;
            const svgY = 100 - pt[1] * 100;
            const isSelected = activePointIdx === idx || hoveredPointIdx === idx;
            const isEndpoint = idx === 0 || idx === sortedPoints.length - 1;

            return (
              <g
                key={idx}
                style={{ cursor: isSelected ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => handlePointPointerDown(idx, e)}
                onDoubleClick={(e) => handlePointDoubleClick(idx, e)}
                onPointerEnter={() => setHoveredPointIdx(idx)}
                onPointerLeave={() => setHoveredPointIdx(null)}
              >
                {/* Outer Glow Ring on Hover/Active */}
                {isSelected && (
                  <circle
                    cx={svgX}
                    cy={svgY}
                    r="7"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.2"
                    strokeOpacity="0.7"
                  />
                )}

                {/* Main Point Handle */}
                <circle
                  cx={svgX}
                  cy={svgY}
                  r={isEndpoint ? 4.2 : 3.8}
                  fill={isEndpoint ? (idx === 0 ? '#000000' : '#ffffff') : 'var(--accent)'}
                  stroke={isEndpoint ? 'var(--accent)' : '#ffffff'}
                  strokeWidth={1.5}
                />

                {/* Hit target extension for easy grabbing */}
                <circle cx={svgX} cy={svgY} r="10" fill="transparent" />
              </g>
            );
          })}

          {/* Hover Crosshair / Cursor position */}
          {cursorPos && (
            <circle
              cx={(cursorPos.inVal / 255) * 100}
              cy={100 - evaluateMonotoneCubicSpline(sortedPoints, cursorPos.inVal / 255) * 100}
              r="2.2"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="0.8"
              strokeDasharray="1 1"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>

      {/* Axis Reference Scale */}
      <div
        style={{
          width: '100%',
          maxWidth: '260px',
          margin: '4px auto 0',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '8px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>IN: 0</span>
        <span>128</span>
        <span>255</span>
      </div>
    </div>
  );
};

/* ========================================================================
   LEVELS

   Drives ToneMappingConfig.levelsBlack / levelsMidtones / levelsWhite, which
   the engine has always applied (rasterEngine step 3) but which nothing could
   reach until now.

   Placed *after* the tone curve because that is the pipeline order: the curve
   runs first and levels reads its output. The histogram shown is sampled at
   exactly that point, so the bars under the handles are the tone the handles
   actually operate on.
   ======================================================================== */

interface LevelsControlProps {
  config: ToneMappingConfig;
  onChangeConfig: (next: ToneMappingConfig) => void;
  /** 256 bins of the luminance entering this stage, or null when no frame has been seen. */
  histogram: Uint32Array | null;
  histogramOpaque: number;
}

/** Track geometry, in the SVG's own user units. */
const LV_W = 256;
const LV_HIST_H = 56;
const LV_TRACK_Y = 60;
const LV_TRACK_H = 12;

type LevelsHandle = 'black' | 'mid' | 'white';

const LevelsControl: React.FC<LevelsControlProps> = ({
  config,
  onChangeConfig,
  histogram,
  histogramOpaque,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<LevelsHandle | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

  const black = config.levelsBlack ?? 0;
  const mid = config.levelsMidtones ?? 50;
  const white = config.levelsWhite ?? 100;

  /*
   * Where the midtone sits between the endpoints. The engine turns exactly
   * this into the levels gamma, so holding it fixed while an endpoint moves is
   * what stops a stretch from silently also re-gamma-ing the image.
   */
  const midNorm = white > black ? (mid - black) / (white - black) : 0.5;
  const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const flash = (msg: string) => {
    setNote(msg);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  };

  useEffect(
    () => () => {
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    },
    []
  );

  /** Commit endpoints, carrying the midtone so the gamma survives the move. */
  const commit = (nextBlack: number, nextWhite: number, keepGamma = true) => {
    const b = Math.max(0, Math.min(95, nextBlack));
    const w = Math.max(b + 5, Math.min(100, nextWhite));
    const m = keepGamma
      ? b + midNorm * (w - b)
      : Math.max(b + 1, Math.min(w - 1, mid));
    onChangeConfig({
      ...config,
      levelsBlack: Number(b.toFixed(2)),
      levelsWhite: Number(w.toFixed(2)),
      levelsMidtones: Number(Math.max(b + 1, Math.min(w - 1, m)).toFixed(2)),
    });
  };

  const handleAuto = () => {
    if (!histogram || histogramOpaque <= 0) {
      flash('NO FRAME SAMPLED YET');
      return;
    }
    const res = computeAutoLevels(histogram, histogramOpaque);
    if (!res) {
      flash('IMAGE HAS NO RANGE TO STRETCH');
      return;
    }
    commit(res.black, res.white);
    flash(`SET ${res.black.toFixed(0)} → ${res.white.toFixed(0)}`);
  };

  const handleReset = () => {
    onChangeConfig({ ...config, levelsBlack: 0, levelsMidtones: 50, levelsWhite: 100 });
  };

  const posToPercent = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(rect.right, e.clientX));
    return ((x - rect.left) / rect.width) * 100;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = posToPercent(e);
    // Nearest handle wins. Midtone loses ties so the endpoints, which are what
    // people reach for, stay grabbable when all three bunch up.
    const d = {
      black: Math.abs(p - black),
      white: Math.abs(p - white),
      mid: Math.abs(p - mid) + 0.001,
    };
    const pick = (Object.keys(d) as LevelsHandle[]).reduce((a, b) => (d[b] < d[a] ? b : a));
    setActive(pick);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    const p = posToPercent(e);
    if (active === 'black') {
      commit(Math.min(p, white - 5), white);
    } else if (active === 'white') {
      commit(black, Math.max(p, black + 5));
    } else {
      // The midtone is an absolute position, not a ratio, so it moves alone.
      onChangeConfig({
        ...config,
        levelsMidtones: Number(Math.max(black + 1, Math.min(white - 1, p)).toFixed(2)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setActive(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  /*
   * Bars are scaled by the square root of their count. A linear histogram of a
   * real image is one spike and 255 invisible bins -- the flat background is
   * usually an order of magnitude more cells than everything else combined.
   */
  const bars = useMemo(() => {
    if (!histogram || histogramOpaque <= 0) return null;
    let peak = 0;
    for (let i = 0; i < 256; i++) if (histogram[i] > peak) peak = histogram[i];
    if (peak <= 0) return null;
    const scale = Math.sqrt(peak);
    const out: number[] = new Array(256);
    for (let i = 0; i < 256; i++) {
      out[i] = (Math.sqrt(histogram[i]) / scale) * LV_HIST_H;
    }
    return out;
  }, [histogram, histogramOpaque]);

  const isNeutral = black === 0 && white === 100 && Math.abs(mid - 50) < 0.01;
  const px = (pct: number) => (pct / 100) * LV_W;

  const handleMark = (pct: number, fill: string, stroke: string, id: LevelsHandle) => (
    <g
      key={id}
      transform={`translate(${px(pct).toFixed(2)}, 0)`}
      style={{ cursor: 'ew-resize' }}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={LV_TRACK_Y + LV_TRACK_H}
        stroke={stroke}
        strokeWidth={active === id ? 1.6 : 0.8}
        opacity={active === id ? 0.9 : 0.5}
      />
      <path
        d={`M 0 ${LV_TRACK_Y} L -5 ${LV_TRACK_Y + LV_TRACK_H} L 5 ${LV_TRACK_Y + LV_TRACK_H} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.8}
      />
    </g>
  );

  return (
    <div
      style={{
        marginBottom: '14px',
        padding: '10px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '3px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '9.5px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: '6px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>LEVELS</span>
          {!isNeutral && (
            <span style={{ color: 'var(--accent)', fontSize: '9px', fontWeight: 600 }}>
              ACTIVE
            </span>
          )}
        </span>
        <button
          className="btn btn-sm"
          style={{ padding: '1px 6px', fontSize: '8.5px', height: '18px', color: 'var(--text-muted)' }}
          onClick={handleReset}
          title="Reset black, midtone and white points to 0 / 50 / 100"
        >
          RESET
        </button>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '260px',
          margin: '0 auto',
          background: '#040404',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LV_W} ${LV_TRACK_Y + LV_TRACK_H + 2}`}
          preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: '84px', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Everything outside [black, white] is clipped flat by the engine. */}
          <rect x={0} y={0} width={px(black)} height={LV_HIST_H} fill="rgba(0,0,0,0.55)" />
          <rect
            x={px(white)}
            y={0}
            width={LV_W - px(white)}
            height={LV_HIST_H}
            fill="rgba(255,255,255,0.07)"
          />

          {bars ? (
            <g fill="var(--accent)" opacity={0.75}>
              {bars.map((h, i) =>
                h > 0 ? (
                  <rect key={i} x={i} y={LV_HIST_H - h} width={1} height={h} />
                ) : null
              )}
            </g>
          ) : (
            <text
              x={LV_W / 2}
              y={LV_HIST_H / 2 + 3}
              textAnchor="middle"
              fontSize={9}
              fill="var(--text-dim)"
              fontFamily="var(--font-mono)"
            >
              NO FRAME SAMPLED
            </text>
          )}

          {/* Black-to-white gradient strip: the output ramp the handles map onto. */}
          <defs>
            <linearGradient id="levels-ramp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000000" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <rect x={0} y={LV_TRACK_Y - 3} width={LV_W} height={2} fill="url(#levels-ramp)" />

          {handleMark(black, '#000000', 'var(--text-muted)', 'black')}
          {handleMark(mid, '#808080', 'var(--text-muted)', 'mid')}
          {handleMark(white, '#ffffff', 'var(--text-muted)', 'white')}
        </svg>
      </div>

      <div
        style={{
          maxWidth: '260px',
          margin: '6px auto 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '8.5px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          {note ? (
            <span style={{ color: 'var(--accent)' }}>{note}</span>
          ) : (
            <>
              BLACK {black.toFixed(0)} &bull; MID {mid.toFixed(0)} &bull; WHITE {white.toFixed(0)}
              {' '}&bull; &gamma; {gamma.toFixed(2)}
            </>
          )}
        </span>
        <button
          className="btn btn-sm"
          style={{ padding: '1px 8px', fontSize: '8.5px', height: '18px', whiteSpace: 'nowrap' }}
          onClick={handleAuto}
          title="Set the black and white points from the image's own histogram, clipping 0.1% at each end"
        >
          <BarChart3 size={9} style={{ marginRight: '3px' }} />
          AUTO LEVELS
        </button>
      </div>
    </div>
  );
};

interface ImageAdjustControlsProps {
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  paletteSlot?: React.ReactNode;
  showAlphaCutoff?: boolean;
  /**
   * Show the luminance invert toggle.
   *
   * Off by default: synth and model each already carry their own "Invert
   * Characters" control over a different backing field, so surfacing this one
   * there would be two near-identical toggles. Media has none of its own.
   */
  showInvert?: boolean;
  /**
   * Reset the half of the colour state this component does not own: the
   * palette mode and the tint both live in MediaColorConfig, held by the host.
   *
   * Without it RESET COLORS could only clear tonalMapping, which the Color Mode
   * selector ignores while a palette or content mode is active -- so the reset
   * revealed the multi-tone stops without moving the selector that governs them.
   */
  onResetPalette?: () => void;
  resetDefaults?: ImageAdjustConfig;
  persistKeyPrefix?: string;

  /*
   * Levels lives in ToneMappingConfig, not ImageAdjustConfig -- a second store,
   * held alongside this one in RenderSettings. Passed in rather than merged so
   * the two keep their existing homes and their existing persistence.
   *
   * Omit all three and the Levels block simply does not render, which is how
   * any host that has no tone config stays working.
   */
  toneConfig?: ToneMappingConfig;
  onChangeToneConfig?: (next: ToneMappingConfig) => void;
  /** Latest luminance histogram from the render loop; see ProcessedRasterResult. */
  histogram?: Uint32Array | null;
  histogramOpaque?: number;
}

export const ImageAdjustControls: React.FC<ImageAdjustControlsProps> = ({
  config,
  onChangeConfig,
  paletteSlot,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  showAlphaCutoff = true,
  showInvert = false,
  onResetPalette,
  persistKeyPrefix = 'MediaViewControls',
  toneConfig,
  onChangeToneConfig,
  histogram = null,
  histogramOpaque = 0,
}) => {
  const update = <K extends keyof ImageAdjustConfig>(key: K, val: ImageAdjustConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const resetEffects = () => {
    onChangeConfig({
      ...config,
      sharpenStrength: resetDefaults.sharpenStrength,
      sharpenRadius: resetDefaults.sharpenRadius,
      noise: resetDefaults.noise,
      denoise: resetDefaults.denoise,
      blur: resetDefaults.blur,
      brightness: resetDefaults.brightness,
      contrast: resetDefaults.contrast,
      ...(showInvert ? { invert: resetDefaults.invert } : {}),
    });
  };
  /*
   * The two resets follow the two panels. Before the split this was one action
   * that also cleared the colour mode and the tone stops -- harmless while they
   * shared a panel, a cross-panel surprise now that they do not.
   */
  const resetTonal = () => {
    onChangeConfig({
      ...config,
      curvePoints: DEFAULT_CURVE_POINTS.map((pt) => [...pt] as [number, number]),
      highlights: resetDefaults.highlights,
      midtones: resetDefaults.midtones,
      shadows: resetDefaults.shadows,
      alphaThreshold: resetDefaults.alphaThreshold,
      colorLevels: resetDefaults.colorLevels ?? 0,
    });
    // Levels is in this panel, so RESET TONAL has to clear it too -- otherwise
    // the reset leaves the one control that clips the image still clipping it.
    if (toneConfig && onChangeToneConfig) {
      onChangeToneConfig({ ...toneConfig, levelsBlack: 0, levelsMidtones: 50, levelsWhite: 100 });
    }
  };

  const resetColors = () => {
    onChangeConfig({
      ...config,
      tonalMapping: resetDefaults.tonalMapping,
      highlightColor: resetDefaults.highlightColor,
      midtoneColor: resetDefaults.midtoneColor,
      shadowColor: resetDefaults.shadowColor,
    });
    onResetPalette?.();
  };

  return (
    <>
      {/* EFFECT CONTROLS */}
      <CollapsibleSection
        title="EFFECT CONTROLS"
        icon={<Sliders size={12} />}
        persistKey={`${persistKeyPrefix}-effect-controls`}
        defaultOpen={false}
      >
        {/*
          Invert sits with the other per-pixel operations rather than in the
          render settings, which are about how the raster is produced rather
          than how it is graded.
        */}
        {showInvert && (
          <div className="control-row">
            <span className="control-label">Invert Luminance</span>
            <button
              className={`btn btn-sm ${config.invert ? 'btn-primary' : ''}`}
              onClick={() => update('invert', !config.invert)}
              title="Swap highlights and shadows"
            >
              {config.invert ? 'INVERTED [ON]' : 'NORMAL [OFF]'}
            </button>
          </div>
        )}

        {/* SHARPENING */}
        <div className="tonal-subheading">
          <span>Sharpening &amp; Edge Definition</span>
        </div>

        {/* Sharpen Strength */}
        <div className="control-row">
          <span className="control-label">Sharpen Strength</span>
          <PrecisionSlider
            value={config.sharpenStrength}
            sliderMin={0}
            sliderMax={300}
            hardMax={1000}
            step={5}
            resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.sharpenStrength}
            onChange={(val) => update('sharpenStrength', val)}
          />
        </div>

        {/* Sharpen Radius */}
        <div className="control-row">
          <span className="control-label">Sharpen Radius</span>
          <PrecisionSlider
            value={config.sharpenRadius}
            sliderMin={0.1}
            sliderMax={4}
            hardMax={10}
            step={0.1}
            resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.sharpenRadius}
            onChange={(val) => update('sharpenRadius', val)}
          />
        </div>

        {/* TEXTURE & GRAIN */}
        <div className="tonal-subheading">
          <span>Texture &amp; Noise</span>
        </div>

        {/* Noise */}
        <div className="control-row">
          <span className="control-label">Noise / Grain</span>
          <PrecisionSlider
            value={config.noise}
            sliderMin={0}
            sliderMax={100}
            hardMax={200}
            step={1}
            resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.noise}
            onChange={(val) => update('noise', val)}
          />
        </div>

        {/* Denoise */}
        <div className="control-row">
          <span className="control-label">Denoise</span>
          <PrecisionSlider
            value={config.denoise || 0}
            sliderMin={0}
            sliderMax={8}
            hardMax={100}
            step={0.1}
            resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.denoise ?? 0}
            onChange={(val) => update('denoise', val)}
          />
        </div>

        {/* OPTICAL FILTERS */}
        <div className="tonal-subheading">
          <span>Optical Filters</span>
        </div>

        {/* Blur */}
        <div className="control-row">
          <span className="control-label">Blur</span>
          <PrecisionSlider
            value={config.blur}
            sliderMin={0}
            sliderMax={8}
            hardMax={40}
            step={0.1}
            resetTo={DEFAULT_IMAGE_ADJUST_CONFIG.blur}
            onChange={(val) => update('blur', val)}
          />
        </div>

        {/* EXPOSURE & CONTRAST */}
        <div className="tonal-subheading">
          <span>Exposure &amp; Contrast</span>
        </div>

        {/* Brightness */}
        <div className="control-row">
          <span className="control-label">Brightness</span>
          <PrecisionSlider
            value={config.brightness}
            sliderMin={-25}
            sliderMax={25}
            hardMin={-100}
            hardMax={100}
            step={0.1}
            resetTo={0}
            onChange={(val) => update('brightness', val)}
          />
        </div>

        {/* Contrast */}
        <div className="control-row">
          <span className="control-label">Contrast</span>
          <PrecisionSlider
            value={config.contrast}
            sliderMin={-25}
            sliderMax={25}
            hardMin={-100}
            hardMax={100}
            step={0.1}
            resetTo={0}
            onChange={(val) => update('contrast', val)}
          />
        </div>

        <div className="collapsible-actions">
          <button className="btn btn-sm" onClick={resetEffects} title="Reset invert, sharpen, blur, noise, denoise, brightness and contrast">
            RESET EFFECTS
          </button>
        </div>
      </CollapsibleSection>

      {/*
        COLORS — which colours come out.
        Split from the tonal panel because these are two different decisions on
        opposite sides of the pipeline: the engine shapes tone (levels, gamma,
        curve) and only then assigns colour. The old single panel interleaved
        them and led with colour, which is the step that happens last. Keeping
        the mode selector and the stops it reveals adjacent also makes their
        dependency legible -- the stops only exist for duotone and tritone.
      */}
      <CollapsibleSection
        title="COLORS"
        icon={<Palette size={12} />}
        persistKey={`${persistKeyPrefix}-colors`}
        defaultOpen={true}
      >
        {/* Color mode, palette and tint (host-provided) */}
        {paletteSlot}

        {/* Colour stops for duotone / tritone ramps */}
        {config.tonalMapping !== '1color' && (
          <div style={{ marginTop: '4px' }}>
            <div className="tonal-subheading">
              <span>Multi-Tone Stops</span>
            </div>
            <ColorPickerInput
              label="Highlights"
              value={config.highlightColor || '#FFFFFF'}
              onChange={(c) => update('highlightColor', c)}
            />
            {config.tonalMapping === '3color' && (
              <ColorPickerInput
                label="Midtones"
                value={config.midtoneColor || '#3B82F6'}
                onChange={(c) => update('midtoneColor', c)}
              />
            )}
            <ColorPickerInput
              label="Shadows"
              value={config.shadowColor || '#000000'}
              onChange={(c) => update('shadowColor', c)}
            />
          </div>
        )}

        <div className="collapsible-actions">
          <button
            className="btn btn-sm"
            onClick={resetColors}
            title="Reset color mode and the duotone / tritone stops"
          >
            RESET COLORS
          </button>
        </div>
      </CollapsibleSection>

      {/*
        TONAL CONTROLS — how tone is distributed before colours are assigned.
        Quantize depth lives here rather than in COLORS: it is named colorLevels
        and its auto value comes from the palette size, but it reduces the tone
        ramp, and it is the control that makes the dither algorithm matter.
      */}
      <CollapsibleSection
        title="TONAL CONTROLS"
        icon={<Sparkles size={12} />}
        persistKey={`${persistKeyPrefix}-tonal-controls`}
        defaultOpen={true}
      >
        {/* Quantize depth with High-Accuracy Control */}
        <div className="tonal-subheading">
          <span>Quantization &amp; Dither Depth</span>
        </div>
        <QuantizeLevelsControl
          value={config.colorLevels}
          onChange={(val) => update('colorLevels', val)}
        />

        {/* Real-time Interactive Tonal Transfer Curve Graph */}
        <div className="tonal-subheading">
          <span>Tonal Transfer Curve</span>
        </div>
        <ToneCurveGraph config={config} onChangeConfig={onChangeConfig} />

        {/*
          Levels follows the curve because the engine applies them in that
          order, and the histogram drawn here is sampled between the two.
        */}
        {toneConfig && onChangeToneConfig && (
          <>
            <div className="tonal-subheading">
              <span>Levels &amp; Auto Range</span>
            </div>
            <LevelsControl
              config={toneConfig}
              onChangeConfig={onChangeToneConfig}
              histogram={histogram}
              histogramOpaque={histogramOpaque}
            />
          </>
        )}

        {/* Tonal Balance: Highlights, Midtones, Shadows */}
        <div className="tonal-subheading">
          <span>Tonal Balance</span>
        </div>

        {/* Highlights */}
        <div className="control-row">
          <span className="control-label">Highlights</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.highlights}
              onChange={(e) => update('highlights', parseInt(e.target.value, 10))}
              onDoubleClick={() => update('highlights', 0)}
              title="Double-click to reset to 0"
            />
            <NumberInput
              value={config.highlights}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('highlights', val)}
            />
          </div>
        </div>

        {/* Midtones */}
        <div className="control-row">
          <span className="control-label">Midtones</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.midtones}
              onChange={(e) => update('midtones', parseInt(e.target.value, 10))}
              onDoubleClick={() => update('midtones', 0)}
              title="Double-click to reset to 0"
            />
            <NumberInput
              value={config.midtones}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('midtones', val)}
            />
          </div>
        </div>

        {/* Shadows */}
        <div className="control-row">
          <span className="control-label">Shadows</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.shadows}
              onChange={(e) => update('shadows', parseInt(e.target.value, 10))}
              onDoubleClick={() => update('shadows', 0)}
              title="Double-click to reset to 0"
            />
            <NumberInput
              value={config.shadows}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('shadows', val)}
            />
          </div>
        </div>

        {/* Alpha Threshold */}
        {showAlphaCutoff && (
          <>
            <div className="tonal-subheading">
              <span>Alpha Cutoff</span>
            </div>
            <div className="control-row">
              <span className="control-label">Threshold</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={0}
                  max={255}
                  step={5}
                  value={config.alphaThreshold}
                  onChange={(e) => update('alphaThreshold', parseInt(e.target.value, 10))}
                />
                <span className="numeral-badge">
                  {config.alphaThreshold}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="collapsible-actions">
          <button className="btn btn-sm" onClick={resetTonal} title="Reset curve, quantize depth, highlights, midtones and shadows">
            RESET TONAL
          </button>
        </div>
      </CollapsibleSection>
    </>
  );
};

