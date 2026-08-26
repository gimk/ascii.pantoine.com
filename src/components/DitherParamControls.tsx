import React from 'react';
import { DitherAlgorithm, DitherParams } from '../types/ascii';
import {
  DITHER_PARAM_SPECS,
  DitherParamId,
  getDitherParamIds,
  resolveDitherParams,
} from '../engine/ditherAlgorithms';
import { PrecisionSlider } from './controlPrimitives';
import { RotateCcw, Sliders } from 'lucide-react';

interface DitherParamControlsProps {
  algorithm: DitherAlgorithm;
  params?: DitherParams;
  onChange: (params: DitherParams) => void;
  embedded?: boolean;
}

/**
 * The tuning controls for whichever algorithm is selected.
 *
 * Which rows appear comes from `getDitherParamIds`, which derives the list from
 * the shape of the algorithm's implementation rather than from a table kept
 * beside the registry — a hand-maintained list next to 44 entries would drift
 * from the code the first time a branch changed, and the failure mode is a
 * slider that visibly does nothing.
 *
 * Values are written through sparsely: a parameter left at its default is
 * deleted from the object rather than stored, so a preset or share link only
 * ever carries what was actually changed, and a default that is later retuned
 * moves everything that never overrode it.
 */
export const DitherParamControls: React.FC<DitherParamControlsProps> = ({
  algorithm,
  params,
  onChange,
  embedded = false,
}) => {
  const ids = getDitherParamIds(algorithm);
  if (ids.length === 0) return null;

  const resolved = resolveDitherParams(params);

  const set = (id: DitherParamId, value: number | boolean) => {
    const next: DitherParams = { ...params };
    const spec = DITHER_PARAM_SPECS[id];
    const isDefault = spec.toggle
      ? value === (spec.fallback === 1)
      : value === spec.fallback;

    if (isDefault) delete next[id];
    else if (id === 'serpentine') next.serpentine = value as boolean;
    else next[id] = value as number;

    onChange(next);
  };

  // Only the rows on screen count as overridden — a stale value left behind by
  // a previous algorithm should not light up the reset button.
  const overridden = ids.filter((id) => params?.[id] !== undefined);

  const reset = () => {
    const next: DitherParams = { ...params };
    for (const id of ids) delete next[id];
    onChange(next);
  };

  return (
    <div className={embedded ? 'dither-param-deck' : 'dither-params'}>
      <div className={embedded ? 'dither-param-deck-header' : 'tonal-subheading'}>
        <div className={embedded ? 'dither-param-deck-title' : undefined}>
          {embedded && <Sliders size={11} />}
          <span>Algorithm Tuning</span>
          {embedded && <span className="dither-param-deck-count">({ids.length})</span>}
        </div>
        {overridden.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={reset}
            title={`Reset ${overridden.length} changed parameter${overridden.length > 1 ? 's' : ''}`}
            style={{
              padding: '1px 6px',
              height: '18px',
              fontSize: '9.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <RotateCcw size={10} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {ids.map((id) => {
        const spec = DITHER_PARAM_SPECS[id];

        if (spec.toggle) {
          const on = resolved[id] as boolean;
          return (
            <div className="control-row" key={id} style={{ alignItems: 'center' }}>
              <span className="control-label" title={spec.hint}>
                {spec.label}
              </span>
              <button
                type="button"
                className={`btn btn-sm ${on ? 'btn-primary' : ''}`}
                onClick={() => set(id, !on)}
                title={spec.hint}
                style={{
                  minWidth: '46px',
                  height: '22px',
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {on ? 'ON' : 'OFF'}
              </button>
            </div>
          );
        }

        return (
          <div className="control-row" key={id}>
            <span className="control-label" title={spec.hint}>
              {spec.label}
            </span>
            <PrecisionSlider
              value={resolved[id] as number}
              sliderMin={spec.min}
              sliderMax={spec.max}
              step={spec.step}
              resetTo={spec.fallback}
              onChange={(val) => set(id, val)}
            />
          </div>
        );
      })}
    </div>
  );
};

