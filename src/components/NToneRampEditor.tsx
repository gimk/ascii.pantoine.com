import React from 'react';
import { DeferredColorInput, NumberInput } from './controlPrimitives';
import {
  ArrowLeftRight,
  Wand2,
  Plus,
  Minus,
  AlignHorizontalDistributeCenter,
} from 'lucide-react';
import { toneBandShares, TONE_WEIGHT_NEUTRAL } from '../engine/rasterEngine';

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

/**
 * Neutral band weight. Weights are relative, so all-equal is an even split.
 *
 * Taken from the engine rather than restated: neutral is the value at which
 * `buildToneBandLut` returns null and the ramp behaves exactly as it did before
 * weights existed. A UI that disagreed would leave the warp quietly on after a
 * reset.
 */
export const NEUTRAL_STOP_WEIGHT = TONE_WEIGHT_NEUTRAL;

/** Most stops the engine and this editor will carry. */
export const MAX_TONE_STOPS = 256;

/**
 * Resample a ramp to a new stop count, keeping colours and weights aligned.
 *
 * Shared by both editors on purpose. Colours and weights are matched by array
 * length -- `resolveToneStops` falls back to neutral the moment they disagree --
 * so any code path that changes the count and forgets the weights silently
 * wipes them. One helper means that can only be got wrong once.
 *
 * Weights carry over by position and pad with neutral. Any mapping is arguable
 * once the stops themselves have moved, but truncate-and-pad at least leaves
 * the shadow end -- the one people actually tune -- where they put it.
 *
 * `maxStops` is a layout limit for the caller, not an engine one. The ceiling
 * is that limit or the current length, whichever is larger, so a ramp that
 * arrived longer than a panel wants to show shortens one step at a time rather
 * than collapsing to the cap on the first press.
 */
export function resampleRamp(
  colors: string[],
  weights: number[],
  nextCount: number,
  maxStops: number = MAX_TONE_STOPS
): { colors: string[]; weights: number[] } {
  const ceiling = Math.max(maxStops, colors.length);
  const clamped = Math.max(2, Math.min(ceiling, nextCount));
  if (clamped === colors.length) return { colors, weights };
  return {
    colors: interpolateStops(colors, clamped),
    weights: Array.from({ length: clamped }, (_, i) => weights[i] ?? NEUTRAL_STOP_WEIGHT),
  };
}

/**
 * Where each stop sits along the tonal range, 0..1.
 *
 * Band *centres*, with the ends pinned to 0 and 1 so the bar starts and
 * finishes on the real end colours. With neutral weights this works out to
 * exactly `i / (count - 1)` -- the even spacing the gradient has always drawn --
 * because the natural bands are symmetric. So the preview is unchanged until a
 * weight is actually moved, and then it moves with it.
 */
function stopPositions(shares: number[], count: number): number[] {
  const bounds: number[] = [];
  let acc = 0;
  for (const s of shares) {
    acc += s;
    bounds.push(acc);
  }
  return shares.map((_, i) => {
    if (i === 0) return 0;
    if (i === count - 1) return 1;
    return (bounds[i - 1] + bounds[i]) / 2;
  });
}

export interface NToneRampEditorProps {
  stops?: string[];
  /**
   * Share of the tonal range each stop covers. One per stop; the engine treats
   * a length mismatch as neutral.
   */
  weights?: number[];
  /**
   * Colours and weights always travel together -- count, reverse and presets
   * all change both, and a caller able to update one alone could desynchronise
   * their lengths.
   */
  onChangeRamp: (newStops: string[], newWeights: number[]) => void;
}

export const NToneRampEditor: React.FC<NToneRampEditorProps> = ({
  stops = ['#0a0a0a', '#00a848', '#00ff66'],
  weights,
  onChangeRamp,
}) => {
  const currentStops = stops && stops.length >= 2 ? stops : ['#000000', '#ffffff'];
  const count = currentStops.length;
  const currentWeights =
    weights && weights.length === count
      ? weights
      : currentStops.map(() => NEUTRAL_STOP_WEIGHT);

  const handleSetCount = (newCount: number) => {
    const next = resampleRamp(currentStops, currentWeights, newCount);
    if (next.colors === currentStops) return;
    onChangeRamp(next.colors, next.weights);
  };

  const handleUpdateStop = (index: number, newColor: string) => {
    const updated = [...currentStops];
    updated[index] = newColor;
    onChangeRamp(updated, currentWeights);
  };

  const handleSetWeight = (index: number, value: number) => {
    const updated = [...currentWeights];
    updated[index] = value;
    onChangeRamp(currentStops, updated);
  };

  /* Reversing the ramp reverses its shape too, or the widths stay behind. */
  const handleReverse = () => {
    onChangeRamp([...currentStops].reverse(), [...currentWeights].reverse());
  };

  const handleInterpolate = () => {
    if (currentStops.length <= 2) return;
    const first = currentStops[0];
    const last = currentStops[currentStops.length - 1];
    onChangeRamp(interpolateStops([first, last], count), currentWeights);
  };

  const isEvenWeighting = currentWeights.every((w) => w === currentWeights[0]);

  const handleEvenWeights = () => {
    onChangeRamp(currentStops, currentStops.map(() => NEUTRAL_STOP_WEIGHT));
  };

  /*
   * Positions come from the engine's own share calculation, so the bar shows
   * the proportions the render will use rather than an even split that would
   * hide the only thing the weights do.
   */
  const positions = stopPositions(toneBandShares(currentWeights, count), count);
  const pctAt = (i: number) => positions[i] * 100;

  const gradientCss = `linear-gradient(to right, ${currentStops
    .map((c, i) => `${c} ${pctAt(i).toFixed(2)}%`)
    .join(', ')})`;
  const isLargeCount = count > 16;

  /*
   * Ticks are absolutely positioned now that they are not evenly spaced. The
   * "minus p% of the tick width" term reproduces exactly what
   * `justify-content: space-between` used to do, so at neutral weights the bar
   * is pixel-identical to before.
   */
  const tickStyle = (p: number): React.CSSProperties => ({
    left: `calc(${p.toFixed(2)}% - ${((p / 100) * 2.5).toFixed(2)}px)`,
  });

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
                style={tickStyle(pctAt(idx))}
                title={`Tone ${idx + 1} (${Math.round(pctAt(idx))}%)`}
              />
            ))
          ) : (
            <>
              <div className="ntone-gradient-stop-tick" style={tickStyle(0)} title="0% (Shadow)" />
              <div className="ntone-gradient-stop-tick" style={tickStyle(50)} title="50% (Mid)" />
              <div className="ntone-gradient-stop-tick" style={tickStyle(100)} title="100% (Highlight)" />
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
          {/*
           * EVEN sits with the other ramp actions rather than appearing beside
           * the sliders, and only once there is something to undo -- BLEND is
           * its counterpart for colour, this one for distribution.
           */}
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '3px 8px', fontSize: '10px', height: '22px' }}
            onClick={handleEvenWeights}
            disabled={isEvenWeighting}
            title="Give every stop an equal share of the tonal range"
          >
            <AlignHorizontalDistributeCenter size={11} style={{ marginRight: '3px' }} />
            EVEN
          </button>
        </div>

        {/*
         * No preset dropdown here any more. Its ramps live in the palette
         * picker above, under "Tone Ramps", and "Edit in Ramp Editor" loads the
         * selected one into these stops. A palette is a preset ramp -- two
         * libraries meant making the same choice in two places.
         */}
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
          /*
           * The badge is where the stop actually sits once the weights are
           * applied, not its index. With neutral weights the two are the same
           * number, so nothing appears to change until a slider is moved.
           */
          const pct = Math.round(pctAt(idx));
          const isFirst = idx === 0;
          const isLast = idx === count - 1;
          const roleLabel = isFirst ? 'SHADOW' : isLast ? 'HIGHLIGHT' : `TONE ${idx + 1}`;

          return (
            <div key={idx} className="ntone-stop-card">
              <div className="ntone-stop-label">
                <span className="ntone-stop-badge">{pct}%</span>
                <span>{roleLabel}</span>
              </div>
              {/*
               * Band width, inline on the same card as the colour it widens.
               * A bare range rather than PrecisionSlider: its number field is
               * 54px that will not shrink, and the card already carries an 84px
               * hex field. The weight is relative anyway -- the figure carries
               * no meaning worth reading, and the bar above shows the result.
               */}
              <input
                type="range"
                className="range-slider ntone-stop-weight"
                min={0}
                max={100}
                step={1}
                value={currentWeights[idx]}
                onChange={(e) => handleSetWeight(idx, parseInt(e.target.value, 10))}
                onDoubleClick={() => handleSetWeight(idx, NEUTRAL_STOP_WEIGHT)}
                title={`Share of the tonal range given to ${roleLabel.toLowerCase()}. Double-click to reset.`}
              />
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
