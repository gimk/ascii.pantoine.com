import React, { useState, useEffect } from 'react';
import { MediaViewConfig, BackgroundMode } from '../types/ascii';
import { Sliders, Sparkles, RotateCcw } from 'lucide-react';

interface MediaViewControlsProps {
  config: MediaViewConfig;
  onChangeConfig: (newConfig: MediaViewConfig) => void;
  onResetDefaults?: () => void;
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

const ToneCurveGraph: React.FC<ToneCurveGraphProps> = ({ config, onChangeConfig }) => {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [activeDrag, setActiveDrag] = useState<'black' | 'mid' | 'white' | 'curve' | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const inBlack = Math.max(0, Math.min(0.95, (config.levelBlack ?? 0) / 100.0));
  const inWhite = Math.max(inBlack + 0.05, Math.min(1.0, (config.levelWhite ?? 100) / 100.0));
  const inMid = Math.max(inBlack + 0.01, Math.min(inWhite - 0.01, (config.levelMidtones ?? 50) / 100.0));
  const midNorm = (inMid - inBlack) / (inWhite - inBlack);
  const levelsGamma = Math.log(0.5) / Math.log(Math.max(0.01, Math.min(0.99, midNorm)));

  const contrastFactor = Math.tan(((config.contrast + 100) * Math.PI) / 400);
  const brightnessOffset = config.brightness / 100.0;
  const shadowAdj = (config.shadows || 0) / 100.0;
  const highlightAdj = (config.highlights || 0) / 100.0;
  const midtoneGamma = Math.pow(2.0, -(config.midtones || 0) / 50.0);

  const samples = 64;
  const points: [number, number][] = [];

  const evaluateTransfer = (x: number) => {
    let val = x;
    val = Math.max(0, Math.min(1, (val - inBlack) / (inWhite - inBlack)));
    if (levelsGamma !== 1.0 && val > 0 && val < 1) {
      val = Math.pow(val, 1 / levelsGamma);
    }
    val = (val - 0.5) * contrastFactor + 0.5 + brightnessOffset;
    if (shadowAdj !== 0) {
      val = val + shadowAdj * (1.0 - val) * (1.0 - val) * 0.5;
    }
    if (highlightAdj !== 0) {
      val = val + highlightAdj * val * val * 0.5;
    }
    if (midtoneGamma !== 1.0 && val > 0 && val < 1) {
      val = Math.pow(val, midtoneGamma);
    }
    if (config.invert) {
      val = 1.0 - val;
    }
    return Math.max(0, Math.min(1, val));
  };

  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = evaluateTransfer(x);
    points.push([x * 100, 100 - y * 100]);
  }

  const pathD = points.reduce((acc, [px, py], idx) => {
    return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  const getSvgCoordinates = (e: React.PointerEvent<SVGSVGElement | HTMLDivElement>) => {
    if (!svgRef.current) return { normX: 0.5, normY: 0.5 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    return { normX, normY };
  };

  const handlePointerDown = (type: 'black' | 'mid' | 'white' | 'curve', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag(type);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { normX, normY } = getSvgCoordinates(e);
    setHoverPos({ x: normX * 100, y: 100 - normY * 100 });

    if (!activeDrag) return;

    if (activeDrag === 'black') {
      const newBlack = Math.max(0, Math.min(Math.round((config.levelMidtones ?? 50) - 2), Math.round(normX * 100)));
      onChangeConfig({ ...config, levelBlack: newBlack });
    } else if (activeDrag === 'white') {
      const newWhite = Math.max(Math.round((config.levelMidtones ?? 50) + 2), Math.min(100, Math.round(normX * 100)));
      onChangeConfig({ ...config, levelWhite: newWhite });
    } else if (activeDrag === 'mid') {
      const minM = (config.levelBlack ?? 0) + 1;
      const maxM = (config.levelWhite ?? 100) - 1;
      const newMid = Math.max(minM, Math.min(maxM, Math.round(normX * 100)));
      onChangeConfig({ ...config, levelMidtones: newMid });
    } else if (activeDrag === 'curve') {
      const targetY = normY;
      const linearY = normX;
      const delta = Math.round((targetY - linearY) * 200);

      if (normX < 0.35) {
        onChangeConfig({
          ...config,
          shadows: Math.max(-100, Math.min(100, delta)),
        });
      } else if (normX > 0.65) {
        onChangeConfig({
          ...config,
          highlights: Math.max(-100, Math.min(100, delta)),
        });
      } else {
        onChangeConfig({
          ...config,
          midtones: Math.max(-100, Math.min(100, delta)),
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveDrag(null);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handleReset = () => {
    onChangeConfig({
      ...config,
      levelBlack: 0,
      levelMidtones: 50,
      levelWhite: 100,
      shadows: 0,
      midtones: 0,
      highlights: 0,
      brightness: 0,
      contrast: 0,
    });
  };

  const blackPointY = 100 - evaluateTransfer(inBlack) * 100;
  const midPointY = 100 - evaluateTransfer(inMid) * 100;
  const whitePointY = 100 - evaluateTransfer(inWhite) * 100;

  let curveType = 'LINEAR (1:1)';
  if (config.invert) curveType = 'INVERTED';
  else if (config.contrast > 15) curveType = 'S-CURVE (CONTRAST)';
  else if (config.contrast < -15) curveType = 'COMPRESSED';
  else if (inBlack > 0.05 || inWhite < 0.95) curveType = 'CLIPPED';
  else if (config.midtones !== 0 || (config.levelMidtones ?? 50) !== 50) curveType = 'GAMMA LIFT';
  else if (config.shadows !== 0 || config.highlights !== 0) curveType = 'TONAL SHAPED';

  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '10px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '3px',
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
        <span>TONE CURVE GRAPH</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--accent)', fontSize: '8.5px' }}>{curveType}</span>
          <button
            className="btn btn-sm"
            style={{ padding: '1px 5px', fontSize: '8.5px', height: '18px', color: 'var(--text-muted)' }}
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
          maxWidth: '220px',
          aspectRatio: '1 / 1',
          margin: '0 auto',
          position: 'relative',
          background: '#040404',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          overflow: 'hidden',
          cursor: activeDrag ? 'grabbing' : 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onDoubleClick={handleReset}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={(e) => handlePointerDown('curve', e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            setHoverPos(null);
            if (!activeDrag) setActiveDrag(null);
          }}
        >
          <defs>
            <linearGradient id="interactiveCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines (25%, 50%, 75%) */}
          <line x1="25" y1="0" x2="25" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.1)" strokeWidth="0.7" strokeDasharray="2 2" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

          <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="0.7" strokeDasharray="2 2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" strokeDasharray="2 2" />

          {/* 45-degree Neutral 1:1 Diagonal */}
          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.22)" strokeWidth="0.75" strokeDasharray="3 3" />

          {/* Fill under Curve */}
          <path d={areaD} fill="url(#interactiveCurveGrad)" pointerEvents="none" />

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

          {/* Interactive Handle: Black Point (Left) */}
          <g
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown('black', e)}
          >
            <circle
              cx={inBlack * 100}
              cy={blackPointY}
              r="4.5"
              fill="#000000"
              stroke="var(--accent)"
              strokeWidth="1.8"
            />
            <circle
              cx={inBlack * 100}
              cy={blackPointY}
              r="8"
              fill="transparent"
            />
          </g>

          {/* Interactive Handle: Midtones / Gamma (Center) */}
          <g
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown('mid', e)}
          >
            <circle
              cx={inMid * 100}
              cy={midPointY}
              r="4.5"
              fill="var(--accent)"
              stroke="#ffffff"
              strokeWidth="1.2"
            />
            <circle
              cx={inMid * 100}
              cy={midPointY}
              r="8"
              fill="transparent"
            />
          </g>

          {/* Interactive Handle: White Point (Right) */}
          <g
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown('white', e)}
          >
            <circle
              cx={inWhite * 100}
              cy={whitePointY}
              r="4.5"
              fill="#ffffff"
              stroke="var(--accent)"
              strokeWidth="1.8"
            />
            <circle
              cx={inWhite * 100}
              cy={whitePointY}
              r="8"
              fill="transparent"
            />
          </g>

          {/* Hover Crosshair / Cursor position */}
          {hoverPos && (
            <circle
              cx={hoverPos.x}
              cy={100 - evaluateTransfer(hoverPos.x / 100) * 100}
              r="2.5"
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
          maxWidth: '220px',
          margin: '4px auto 0',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '8px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>IN: 0 (BLACK)</span>
        <span>128 (MID)</span>
        <span>255 (WHITE)</span>
      </div>
    </div>
  );
};

export const MediaViewControls: React.FC<MediaViewControlsProps> = ({
  config,
  onChangeConfig,
  onResetDefaults,
}) => {
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
      <div className="control-section">
        <div className="section-header">
          <span>EFFECT CONTROLS</span>
          <Sliders size={12} />
        </div>

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
      </div>

      {/* 3. TONAL CONTROLS */}
      <div className="control-section">
        <div className="section-header">
          <span>TONAL CONTROLS</span>
          <Sparkles size={12} />
        </div>

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
              <span style={{ fontSize: '10px', minWidth: '28px', textAlign: 'right' }}>
                {config.alphaThreshold}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Reset Defaults */}
      {onResetDefaults && (
        <button
          className="btn btn-sm"
          style={{ width: '100%', color: 'var(--text-muted)' }}
          onClick={onResetDefaults}
        >
          <RotateCcw size={11} />
          RESET VIEW & EFFECT DEFAULTS
        </button>
      )}
    </div>
  );
};
