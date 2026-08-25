import React, { useState, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { NumberInput } from './controlPrimitives';
import {
  ImageAdjustConfig,
  DEFAULT_IMAGE_ADJUST_CONFIG,
} from '../types/ascii';
import { evaluateMonotoneCubicSpline } from '../engine/mediaRenderer';
import { Sliders, Sparkles } from 'lucide-react';

interface ColorPickerInputProps {
  label: string;
  value?: string;
  onChange: (val: string) => void;
}

const ColorPickerInput: React.FC<ColorPickerInputProps> = ({ label, value = '#ffffff', onChange }) => {
  const [hex, setHex] = useState(value);

  React.useEffect(() => {
    setHex(value);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    setHex(val);
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div className="control-row">
      <span className="control-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            width: '24px',
            height: '22px',
            borderRadius: '2px',
            border: '1px solid var(--border-color)',
            background: value || '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
        >
          <input
            type="color"
            value={value || '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </div>
        <input
          type="text"
          className="text-input"
          value={hex}
          onChange={handleHexChange}
          style={{
            width: '82px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        />
      </div>
    </div>
  );
};

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

interface ImageAdjustControlsProps {
  config: ImageAdjustConfig;
  onChangeConfig: (next: ImageAdjustConfig) => void;
  /**
   * Optional extras rendered inside TONAL CONTROLS by callers that own state
   * outside `ImageAdjustConfig` (media's palette block and levels slider).
   * Modes without them simply leave the slots empty.
   */
  paletteSlot?: React.ReactNode;
  levelsSlot?: React.ReactNode;
  /**
   * Alpha cutoff only matters where a transparent background is selectable,
   * which is a media-only concept; other modes show it unconditionally.
   */
  showAlphaCutoff?: boolean;
  /**
   * Values the RESET buttons restore. Defaults to the shared neutral config;
   * media overrides it so RESET keeps its own tuned defaults (e.g. sharpen).
   */
  resetDefaults?: ImageAdjustConfig;
  /** Distinguishes the persisted collapse state per host sidebar. */
  persistKeyPrefix?: string;
}

export const ImageAdjustControls: React.FC<ImageAdjustControlsProps> = ({
  config,
  onChangeConfig,
  paletteSlot,
  levelsSlot,
  resetDefaults = DEFAULT_IMAGE_ADJUST_CONFIG,
  showAlphaCutoff = true,
  persistKeyPrefix = 'MediaViewControls',
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
    });
  };

  const resetTonal = () => {
    onChangeConfig({
      ...config,
      curvePoints: DEFAULT_CURVE_POINTS.map((pt) => [...pt] as [number, number]),
      highlights: resetDefaults.highlights,
      midtones: resetDefaults.midtones,
      shadows: resetDefaults.shadows,
      alphaThreshold: resetDefaults.alphaThreshold,
      tonalMapping: resetDefaults.tonalMapping,
      colorLevels: resetDefaults.colorLevels ?? 0,
      highlightColor: resetDefaults.highlightColor,
      midtoneColor: resetDefaults.midtoneColor,
      shadowColor: resetDefaults.shadowColor,
    });
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

        {/* Denoise */}
        <div className="control-row">
          <span className="control-label">Denoise</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              step={1}
              value={config.denoise || 0}
              onChange={(e) => update('denoise', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.denoise || 0}
              min={0}
              max={100}
              step={1}
              onChange={(val) => update('denoise', val)}
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
          <button className="btn btn-sm" onClick={resetEffects} title="Reset sharpen, blur, noise, denoise, brightness and contrast">
            RESET EFFECTS
          </button>
        </div>
      </CollapsibleSection>

      {/* TONAL CONTROLS */}
      <CollapsibleSection
        title="TONAL CONTROLS"
        icon={<Sparkles size={12} />}
        persistKey={`${persistKeyPrefix}-tonal-controls`}
        defaultOpen={false}
      >
        {/* Color Palettes & Themes (host-provided) */}
        {paletteSlot}

        {/* Colour stops for the duotone / tritone ramps. The mode itself is
            chosen in the unified Color Mode list rendered by paletteSlot. */}
        {config.tonalMapping !== '1color' && (
          <ColorPickerInput
            label="Highlights"
            value={config.highlightColor || '#FFFFFF'}
            onChange={(c) => update('highlightColor', c)}
          />
        )}

        {config.tonalMapping === '3color' && (
          <ColorPickerInput
            label="Midtones"
            value={config.midtoneColor || '#3B82F6'}
            onChange={(c) => update('midtoneColor', c)}
          />
        )}

        {config.tonalMapping !== '1color' && (
          <ColorPickerInput
            label="Shadows"
            value={config.shadowColor || '#000000'}
            onChange={(c) => update('shadowColor', c)}
          />
        )}

        {/* Quantize depth. The charset length / palette size is only the
            default: four tones out of a sixteen-colour palette, or four glyphs
            out of a ten-character ramp, are both real looks. Values above the
            natural depth saturate. */}
        <div className="control-row">
          <span className="control-label" title="Tones the dither pass resolves. 0 = auto: the charset length, or the palette size.">
            Quantize Levels
          </span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={64}
              step={1}
              value={Math.min(64, config.colorLevels ?? 0)}
              onChange={(e) => update('colorLevels', parseInt(e.target.value))}
            />
            <NumberInput
              value={config.colorLevels ?? 0}
              min={0}
              max={256}
              step={1}
              onChange={(val) => update('colorLevels', val)}
            />
          </div>
        </div>

        {/* Real-time Interactive Tonal Transfer Curve Graph */}
        <ToneCurveGraph config={config} onChangeConfig={onChangeConfig} />

        {/* Levels 3-Point Multi-Stop Gradient Slider (host-provided) */}
        {levelsSlot}

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

        {/* Alpha Threshold */}
        {showAlphaCutoff && (
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
    </>
  );
};
