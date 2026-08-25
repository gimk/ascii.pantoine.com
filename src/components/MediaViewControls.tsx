import React, { useState, useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { MediaViewConfig, BackgroundMode, PhosphorTheme, MediaColorConfig, AppMode } from '../types/ascii';
import { evaluateMonotoneCubicSpline } from '../engine/mediaRenderer';
import { DEFAULT_MEDIA_VIEW_CONFIG } from '../engine/mediaPresets';
import { PaletteControls } from './PaletteControls';
import { Sliders, Sparkles } from 'lucide-react';

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
  currentTheme?: PhosphorTheme;
  onChangeTheme?: (theme: PhosphorTheme) => void;
  customThemeColor?: string;
  onChangeCustomColor?: (color: string) => void;
  mediaColorConfig?: MediaColorConfig;
  onChangeMediaColorConfig?: (cfg: MediaColorConfig) => void;
  appMode?: AppMode;
}

const NumberInput: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}> = ({ value, min = -100, max = 100, step = 1, disabled = false, onChange }) => {
  const [text, setText] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value.toString());
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    setText(raw);
    if (raw === '-' || raw === '') return;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    setIsFocused(false);
    const parsed = parseInt(text, 10);
    if (isNaN(parsed)) {
      setText(value.toString());
    } else {
      const validVal = Math.max(min, Math.min(max, parsed));
      setText(validVal.toString());
      onChange(validVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      className="number-input"
      style={{
        width: '54px',
        padding: '2px 4px',
        fontSize: '11px',
        textAlign: 'right',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => !disabled && setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

interface LevelsControlProps {
  black: number; // 0..100
  midtones: number; // 0..100
  white: number; // 0..100
  onChange: (black: number, midtones: number, white: number) => void;
}

const LevelsControl: React.FC<LevelsControlProps> = ({
  black = 0,
  midtones = 50,
  white = 100,
  onChange,
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  const calculateNormalizedGamma = (b: number, m: number, w: number) => {
    const midNorm = (m - b) / Math.max(1, w - b);
    const gamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));
    return (1 / gamma).toFixed(2);
  };

  const handlePointerDown = (handleIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handleIdx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));

    const distBlack = Math.abs(clickPct - black);
    const distMid = Math.abs(clickPct - midtones);
    const distWhite = Math.abs(clickPct - white);

    let closest = 1;
    if (distBlack < distMid && distBlack < distWhite) closest = 0;
    else if (distWhite < distMid && distWhite < distBlack) closest = 2;

    setActiveHandle(closest);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (closest === 0) {
      const newBlack = Math.min(clickPct, midtones - 1);
      onChange(Math.max(0, newBlack), midtones, white);
    } else if (closest === 1) {
      const newMid = Math.max(black + 1, Math.min(white - 1, clickPct));
      onChange(black, newMid, white);
    } else {
      const newWhite = Math.max(clickPct, midtones + 1);
      onChange(black, midtones, Math.min(100, newWhite));
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeHandle === null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));

    if (activeHandle === 0) {
      const newBlack = Math.min(pct, midtones - 1);
      onChange(Math.max(0, newBlack), midtones, white);
    } else if (activeHandle === 1) {
      const newMid = Math.max(black + 1, Math.min(white - 1, pct));
      onChange(black, newMid, white);
    } else if (activeHandle === 2) {
      const newWhite = Math.max(pct, midtones + 1);
      onChange(black, midtones, Math.min(100, newWhite));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveHandle(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleReset = () => {
    onChange(0, 50, 100);
  };

  return (
    <div className="control-row" style={{ marginBottom: '10px' }}>
      <span className="control-label">
        Levels (B/M/W)
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {Math.round((black / 100) * 255)} • γ {calculateNormalizedGamma(black, midtones, white)} • {Math.round((white / 100) * 255)}
        </div>
      </span>

      <div className="control-input-wrapper">
        {/* Multi-Stop Interactive Gradient Track */}
        <div
          ref={trackRef}
          style={{
            flex: 1,
            position: 'relative',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            touchAction: 'none',
            userSelect: 'none',
          }}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Visual Gradient Track */}
          <div
            style={{
              position: 'absolute',
              left: '6px',
              right: '6px',
              height: '4px',
              borderRadius: '2px',
              background: 'linear-gradient(to right, #000000 0%, #777777 50%, #ffffff 100%)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
            }}
          />

          {/* 1. Black Point Thumb (Left) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${black / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'ew-resize',
              zIndex: activeHandle === 0 ? 10 : 2,
            }}
            onPointerDown={(e) => handlePointerDown(0, e)}
            title={`Black: ${Math.round((black / 100) * 255)} (${black}%)`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#000000',
                border: activeHandle === 0 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 0 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>

          {/* 2. Midtones / Gamma Thumb (Center / Middle) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${midtones / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'grab',
              zIndex: activeHandle === 1 ? 10 : 3,
            }}
            onPointerDown={(e) => handlePointerDown(1, e)}
            title={`Midtones / Gamma: ${midtones}%`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#222222',
                border: activeHandle === 1 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 1 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>

          {/* 3. White Point Thumb (Right) */}
          <div
            style={{
              position: 'absolute',
              left: `calc(6px + (100% - 12px) * ${white / 100})`,
              transform: 'translateX(-50%)',
              top: '3px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'ew-resize',
              zIndex: activeHandle === 2 ? 10 : 2,
            }}
            onPointerDown={(e) => handlePointerDown(2, e)}
            title={`White: ${Math.round((white / 100) * 255)} (${white}%)`}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#ffffff',
                border: activeHandle === 2 ? '2px solid var(--accent)' : '2px solid var(--text-primary)',
                boxShadow: '0 0 4px rgba(0,0,0,0.9)',
                transition: 'border-color 0.15s',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '2px',
                background: activeHandle === 2 ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: '1px',
                marginTop: '1px',
              }}
            />
          </div>
        </div>

        {/* Small quick reset button */}
        <button
          className="btn btn-sm"
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            height: '22px',
            color: 'var(--text-muted)',
          }}
          onClick={handleReset}
          title="Reset Levels to [0, 50, 100]"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

interface ToneCurveGraphProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
}

const DEFAULT_CURVE_POINTS: [number, number][] = [
  [0, 0],
  [0.25, 0.25],
  [0.5, 0.5],
  [0.75, 0.75],
  [1, 1],
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
    // If clicking on graph background (not on an existing point), add a new point
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
      // First point (can move X up to second point - 0.01, and Y freely 0..1)
      clampedX = Math.max(0, Math.min(sortedPoints[1][0] - 0.01, normX));
    } else if (activePointIdx === n - 1) {
      // Last point (can move X down to previous point + 0.01, and Y freely 0..1)
      clampedX = Math.max(sortedPoints[n - 2][0] + 0.01, Math.min(1, normX));
    } else {
      // Intermediate points (can move X freely between neighbors, and Y freely 0..1)
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
    // Cannot delete first or last endpoint
    if (idx === 0 || idx === sortedPoints.length - 1) return;
    const newPoints = sortedPoints.filter((_, i) => i !== idx);
    onChangeConfig({ ...config, curvePoints: newPoints });
    setActivePointIdx(null);
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      curvePoints: [...DEFAULT_CURVE_POINTS],
    });
  };

  const activeOrHoveredPoint = activePointIdx !== null ? sortedPoints[activePointIdx] : hoveredPointIdx !== null ? sortedPoints[hoveredPointIdx] : null;

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
          marginBottom: '8px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>TONE CURVE (X/Y SPLINE)</span>
          {activeOrHoveredPoint && (
            <span style={{ color: 'var(--accent)', fontSize: '9px', fontWeight: 600 }}>
              IN: {Math.round(activeOrHoveredPoint[0] * 255)} • OUT: {Math.round(activeOrHoveredPoint[1] * 255)}
            </span>
          )}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8.5px', color: 'var(--text-dim)' }}>
            {sortedPoints.length} PTS (CLICK TO ADD)
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

export const MediaViewControls: React.FC<MediaViewControlsProps> = ({
  config,
  onChangeConfig,
  currentTheme,
  onChangeTheme,
  customThemeColor = '',
  onChangeCustomColor,
  mediaColorConfig,
  onChangeMediaColorConfig,
  appMode = 'media',
}) => {
  /**
   * Each group resets only its own fields. A single global reset used to sit
   * at the bottom of the panel, far from either group and ambiguous about
   * what it would wipe.
   */
  const resetEffects = () => {
    onChangeConfig({
      ...config,
      sharpenStrength: DEFAULT_MEDIA_VIEW_CONFIG.sharpenStrength,
      sharpenRadius: DEFAULT_MEDIA_VIEW_CONFIG.sharpenRadius,
      noise: DEFAULT_MEDIA_VIEW_CONFIG.noise,
      blur: DEFAULT_MEDIA_VIEW_CONFIG.blur,
      brightness: DEFAULT_MEDIA_VIEW_CONFIG.brightness,
      contrast: DEFAULT_MEDIA_VIEW_CONFIG.contrast,
    });
  };

  const resetTonal = () => {
    onChangeConfig({
      ...config,
      curvePoints: DEFAULT_MEDIA_VIEW_CONFIG.curvePoints
        ? DEFAULT_MEDIA_VIEW_CONFIG.curvePoints.map((pt) => [...pt] as [number, number])
        : undefined,
      levelBlack: DEFAULT_MEDIA_VIEW_CONFIG.levelBlack,
      levelMidtones: DEFAULT_MEDIA_VIEW_CONFIG.levelMidtones,
      levelWhite: DEFAULT_MEDIA_VIEW_CONFIG.levelWhite,
      highlights: DEFAULT_MEDIA_VIEW_CONFIG.highlights,
      midtones: DEFAULT_MEDIA_VIEW_CONFIG.midtones,
      shadows: DEFAULT_MEDIA_VIEW_CONFIG.shadows,
      background: DEFAULT_MEDIA_VIEW_CONFIG.background,
      alphaThreshold: DEFAULT_MEDIA_VIEW_CONFIG.alphaThreshold,
    });
  };
  const update = <K extends keyof MediaViewConfig>(key: K, val: MediaViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const backgroundModes: { id: BackgroundMode; label: string }[] = [
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
    { id: 'transparent', label: 'Transparent' },
  ];

  return (
    <div className="tab-content">
      {/* 1. EFFECT CONTROLS */}
      <CollapsibleSection
        title="EFFECT CONTROLS"
        icon={<Sliders size={12} />}
        persistKey="MediaViewControls-effect-controls"
        defaultOpen={true}
      >
        {/* Sharpen Strength */}
        <div className="control-row">
          <span className="control-label">Sharpen Strength</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={300}
              step={5}
              value={config.sharpenStrength}
              onChange={(e) => update('sharpenStrength', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.sharpenStrength}
              min={0}
              max={300}
              step={5}
              onChange={(val) => update('sharpenStrength', val)}
            />
          </div>
        </div>

        {/* Sharpen Radius */}
        <div className="control-row">
          <span className="control-label">Sharpen Radius</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={1}
              max={10}
              step={1}
              value={config.sharpenRadius}
              onChange={(e) => update('sharpenRadius', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.sharpenRadius}
              min={1}
              max={10}
              step={1}
              onChange={(val) => update('sharpenRadius', val)}
            />
          </div>
        </div>

        {/* Noise */}
        <div className="control-row">
          <span className="control-label">Noise / Grain</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.noise}
              onChange={(e) => update('noise', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.noise}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('noise', val)}
            />
          </div>
        </div>

        {/* Blur */}
        <div className="control-row">
          <span className="control-label">Blur</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={20}
              step={1}
              value={config.blur}
              onChange={(e) => update('blur', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.blur}
              min={0}
              max={20}
              step={1}
              onChange={(val) => update('blur', val)}
            />
          </div>
        </div>

        {/* Brightness */}
        <div className="control-row">
          <span className="control-label">Brightness</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.brightness}
              onChange={(e) => update('brightness', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.brightness}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('brightness', val)}
            />
          </div>
        </div>

        {/* Contrast */}
        <div className="control-row">
          <span className="control-label">Contrast</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.contrast}
              onChange={(e) => update('contrast', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.contrast}
              min={-100}
              max={100}
              step={1}
              onChange={(val) => update('contrast', val)}
            />
          </div>
        </div>
        <div className="collapsible-actions">
          <button className="btn btn-sm" onClick={resetEffects} title="Reset sharpen, blur, noise, brightness and contrast">
            RESET EFFECTS
          </button>
        </div>
      </CollapsibleSection>

      {/* 2. TONAL CONTROLS */}
      <CollapsibleSection
        title="TONAL CONTROLS"
        icon={<Sparkles size={12} />}
        persistKey="MediaViewControls-tonal-controls"
        defaultOpen={false}
      >
        {/* Color Palettes & Themes */}
        {onChangeTheme && (
          <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            <PaletteControls
              currentTheme={currentTheme || 'green'}
              onChangeTheme={onChangeTheme}
              customThemeColor={customThemeColor}
              onChangeCustomColor={onChangeCustomColor}
              mediaColorConfig={mediaColorConfig}
              onChangeMediaColorConfig={onChangeMediaColorConfig}
              appMode={appMode}
            />
          </div>
        )}

        {/* Real-time Interactive Tonal Transfer Curve Graph */}
        <ToneCurveGraph config={config} onChangeConfig={onChangeConfig} />

        {/* Levels 3-Point Multi-Stop Gradient Slider */}
        <LevelsControl
          black={config.levelBlack ?? 0}
          midtones={config.levelMidtones ?? 50}
          white={config.levelWhite ?? 100}
          onChange={(black, midtones, white) => {
            onChangeConfig({
              ...config,
              levelBlack: black,
              levelMidtones: midtones,
              levelWhite: white,
            });
          }}
        />

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
              onChange={(e) => update('highlights', parseInt(e.target.value))}
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
              onChange={(e) => update('midtones', parseInt(e.target.value))}
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
              onChange={(e) => update('shadows', parseInt(e.target.value))}
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

        {/* Background Handling */}
        <div className="control-row">
          <span className="control-label">Background</span>
          <select
            className="number-input"
            style={{ width: '120px', textAlign: 'left', padding: '2px 4px', fontSize: '10.5px' }}
            value={config.background}
            onChange={(e) => update('background', e.target.value as BackgroundMode)}
          >
            {backgroundModes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Alpha Threshold */}
        {config.background === 'transparent' && (
          <div className="control-row">
            <span className="control-label">Alpha Cutoff</span>
            <div className="control-input-wrapper">
              <input
                type="range"
                className="range-slider"
                min={0}
                max={255}
                step={5}
                value={config.alphaThreshold}
                onChange={(e) => update('alphaThreshold', parseInt(e.target.value))}
              />
              <span className="numeral-badge">
                {config.alphaThreshold}
              </span>
            </div>
          </div>
        )}
        <div className="collapsible-actions">
          <button className="btn btn-sm" onClick={resetTonal} title="Reset curve, levels, highlights, midtones, shadows and background">
            RESET TONAL
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
};
