import React, { useState } from 'react';
import {
  PrintConfig,
  InkPlate,
  PressProfile,
  DotShape,
  ScreenFamily,
  PrintTier,
  MAX_INKS,
  DitherAlgorithm,
} from '../types/ascii';
import { PrecisionSlider, ToggleSwitch, DeferredColorInput } from './controlPrimitives';
import {
  PRESS_PROFILES,
  INK_LIBRARY,
  PAPER_STOCKS,
  makeInkPlate,
  applyPressAngles,
  resolveMoireAngles,
  findMoireConflicts,
  MOIRE_ANGLE_TOLERANCE,
  extractImageInks,
} from '../engine/printInks';
import {
  rulingToLpi,
  tierSupersample,
  SUPERSAMPLE_MIN,
  SUPERSAMPLE_MAX,
} from '../engine/printEngine';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  AlertTriangle,
  Pipette,
  RotateCw,
} from 'lucide-react';

import { BUILTIN_PALETTES } from '../engine/palettes';
import { DITHER_ALGORITHMS, hasThresholdMask } from '../engine/ditherAlgorithms';

/**
 * Press, inks and screens — print mode's replacement for the dither picker.
 *
 * Renders as a bare fragment straight into RENDER SETTINGS rather than as its
 * own bordered deck, for the same reason `VectorControls` does: it *is* the
 * whole content of that section in print mode, so a nested panel with its own
 * title would be a box inside a box repeating the heading above it.
 */

export interface PrintPressControlsProps {
  config: PrintConfig;
  onChange: (config: PrintConfig) => void;
  /** Cut down to the handful of controls the basic panel shows. */
  compact?: boolean;
  /** Contone grid, so the panel can quote real plate dimensions. */
  cols: number;
  rows: number;
  /** Kick off a full-quality proof. Absent while one is already running. */
  onRenderProof?: () => void;
  /** Live progress text from a running proof, or null. */
  proofProgress?: string | null;
  /** The tier currently on screen, so the button can say what it would change. */
  tier?: { tier: PrintTier; supersample: number } | null;
  /** Estimated proof cost in ms, stated before the user commits to it. */
  proofEstimateMs?: number;
}

export interface PrintInkStackProps {
  config: PrintConfig;
  onChange: (config: PrintConfig) => void;
  compact?: boolean;
  cols?: number;
  rows?: number;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  onSeedInksFromPalette?: (colors: string[]) => void;
}

export interface PrintControlsProps extends PrintPressControlsProps {
  section?: 'all' | 'press' | 'inks' | 'press-and-inks' | 'settings';
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  onSeedInksFromPalette?: (colors: string[]) => void;
}

/** Per-plate numeric rows, grouped the way a printer would think about them. */
interface PlateRow {
  id: Extract<
    { [K in keyof InkPlate]: InkPlate[K] extends number ? K : never }[keyof InkPlate],
    string
  >;
  label: string;
  hint: string;
  min: number;
  max: number;
  hardMin?: number;
  hardMax?: number;
  step: number;
}

const SCREEN_ROWS: PlateRow[] = [
  {
    id: 'ruling',
    label: 'Ruling',
    hint: 'Halftone cells across the image width. Resolution-free, so the dot keeps its size when the grid, the crop or the render tier changes. Riso lives near 71; newsprint 60; fine offset 150.',
    min: 20,
    max: 200,
    hardMin: 2,
    hardMax: 600,
    step: 1,
  },
  {
    id: 'angle',
    label: 'Screen Angle',
    hint: 'Screen rotation. 30 degrees apart across the stack gives a rosette; anything closer beats into visible moire.',
    min: 0,
    max: 90,
    hardMin: -180,
    hardMax: 180,
    step: 0.5,
  },
  {
    id: 'shiftX',
    label: 'Shift X',
    hint: 'Slides the dot lattice inside a stationary plate, in screen cells. This is what turns a dot-centred rosette into a clear-centred one. Not the same as registration, which moves the whole plate.',
    min: -1,
    max: 1,
    hardMin: -10,
    hardMax: 10,
    step: 0.02,
  },
  {
    id: 'shiftY',
    label: 'Shift Y',
    hint: 'The other axis of the lattice phase.',
    min: -1,
    max: 1,
    hardMin: -10,
    hardMax: 10,
    step: 0.02,
  },
  {
    id: 'dotAspect',
    label: 'Dot Aspect',
    hint: 'Elongation for the chain dot, duty for the line screen. 1 is symmetric.',
    min: 0.2,
    max: 4,
    hardMin: 0.05,
    hardMax: 20,
    step: 0.05,
  },
];

const PRESS_ROWS: PlateRow[] = [
  {
    id: 'regX',
    label: 'Registration X',
    hint: 'How far this plate landed off the sheet, in contone cells. A riso re-grips the paper for every pass, so this is the look rather than a defect.',
    min: -6,
    max: 6,
    hardMin: -60,
    hardMax: 60,
    step: 0.05,
  },
  {
    id: 'regY',
    label: 'Registration Y',
    hint: 'The other axis of the placement error.',
    min: -6,
    max: 6,
    hardMin: -60,
    hardMax: 60,
    step: 0.05,
  },
  {
    id: 'regAngle',
    label: 'Plate Rotation',
    hint: 'Rotational drift of the whole plate. Adds to the effective screen angle, because the screen is on the plate.',
    min: -3,
    max: 3,
    hardMin: -45,
    hardMax: 45,
    step: 0.05,
  },
  {
    id: 'dotGain',
    label: 'Dot Gain',
    hint: 'Tone value increase at 50%. Peaks at midtone and vanishes at both ends, which is what physical dot growth does — paper stays paper, a solid stays solid.',
    min: 0,
    max: 0.4,
    hardMin: -0.4,
    hardMax: 1,
    step: 0.01,
  },
  {
    id: 'minCoverage',
    label: 'Min Ink',
    hint: 'Coverage floor for this plate. Above zero, the ink never fully leaves the sheet.',
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  {
    id: 'maxCoverage',
    label: 'Max Ink',
    hint: 'Coverage ceiling. Below one, the plate never lays a solid.',
    min: 0.5,
    max: 1,
    step: 0.01,
  },
];

const DOT_SHAPES: { id: DotShape; label: string; hint: string }[] = [
  { id: 'round', label: 'ROUND', hint: 'The Euclidean dot: round highlights, checkerboard at 50%, inverse round shadows. What offset actually lays down.' },
  { id: 'ellipse', label: 'CHAIN', hint: 'Elliptical. Joins along one axis first, which avoids the abrupt midtone jump a round dot makes.' },
  { id: 'square', label: 'SQUARE', hint: 'Hard square dot.' },
  { id: 'diamond', label: 'DIAMOND', hint: 'Rotated square.' },
  { id: 'line', label: 'LINE', hint: 'A line screen. Screen Angle rotates it.' },
  { id: 'cross', label: 'CROSS', hint: 'A growing plus, for a mechanical texture.' },
];

const SCREEN_FAMILIES: { id: ScreenFamily; label: string; hint: string }[] = [
  { id: 'am', label: 'AM', hint: 'Amplitude modulation: fixed lattice, the dot grows. Offset, newsprint, screenprint and the riso driver default.' },
  { id: 'fm', label: 'FM', hint: 'Frequency modulation: fixed dot, the count varies. Runs this plate through the dither registry — what a riso thermal master often does.' },
  { id: 'solid', label: 'SOLID', hint: 'No screen. Ink wherever coverage passes half, for line art and spot blocks.' },
];

const FM_TOP_ALGORITHMS: { id: DitherAlgorithm; label: string; hint: string }[] = [
  { id: 'atkinson', label: 'ATKINSON', hint: 'MacPaint 1984 8-neighbor diffusion (75% error): clean highlights and crisp, non-fuzzy borders.' },
  { id: 'blue-noise', label: 'BLUE NOISE', hint: 'High-frequency blue noise stipple: organic, isotropic distribution with zero directional error drag.' },
  { id: 'void-cluster', label: 'VOID-CLUSTER', hint: 'Ulichney void-and-cluster stochastic mask: smoothly dispersed organic dot placement.' },
  { id: 'bayer-8x8', label: 'BAYER 8×8', hint: '64-level smooth ordered matrix: clean, regular geometric micro-grid.' },
  { id: 'sierra-2', label: 'SIERRA-2', hint: 'Two-row Sierra: smooth tones with a compact diffusion kernel.' },
  { id: 'floyd-steinberg', label: 'FLOYD-ST', hint: 'Classic 1976 balanced 4-neighbor error diffusion.' },
];

/**
 * Press settings: Substrate physics (TAC & optical gain), raster quality (Live/Proof), and proof runner.
 */
export const PrintSettingsControls: React.FC<PrintPressControlsProps> = ({
  config,
  onChange,
  compact = false,
  cols,
  rows,
  onRenderProof,
  proofProgress,
  tier,
  proofEstimateMs,
}) => {
  const liveSs = tierSupersample(config, cols, rows, 'live');
  const proofSs = tierSupersample(config, cols, rows, 'proof');
  const plate = (ss: number) => `${cols * ss}×${rows * ss}`;
  const livePlate = plate(liveSs);
  const proofPlate = plate(proofSs);
  const isProofOnScreen = tier?.tier === 'proof';

  const set = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <>
      {/* Substrate Physics */}
      {!compact && (
        <>
          <div className="tonal-subheading">
            <span title="Physical paper and ink drying characteristics.">
              Substrate Physics
            </span>
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="Yule-Nielsen n: optical dot gain from light scattering sideways inside the paper, which is why a halftone reads darker than its ink area. 1 is off, ~1.7 coated, 2-3 uncoated."
            >
              Optical Gain
            </span>
            <PrecisionSlider
              value={config.yuleNielsen}
              sliderMin={1}
              sliderMax={3}
              hardMax={6}
              step={0.05}
              resetTo={1}
              onChange={(val) => set('yuleNielsen', val)}
            />
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="Total area coverage: the cap on all inks summed. A real press limit — past it the sheet cannot dry and the shadows fill in. Applied as a penalty in the separation, so the solve redistributes toward black rather than clipping."
            >
              Ink Limit (TAC)
            </span>
            <PrecisionSlider
              value={config.tacLimit}
              sliderMin={0}
              sliderMax={400}
              hardMax={800}
              step={10}
              onChange={(val) => set('tacLimit', val)}
            />
          </div>
        </>
      )}

      {/* Screen Quality & Proofing */}
      <div className="tonal-subheading" style={{ marginTop: '8px' }}>
        <span title="Device pixels per contone cell. Decides how finely dot shapes and grain are resolved. Live is optimized for fluid viewport interaction; Proof provides high-resolution screening for zoom inspection and exports.">
          Screen Quality & Proof
        </span>
      </div>

      <div className="control-row">
        <span
          className="control-label"
          title="What the viewport draws at during live editing. Keeps panning and zooming responsive."
        >
          Live
          <span className="control-hint-dim"> · ×{liveSs} ({livePlate})</span>
        </span>
        <div className="btn-group">
          {[2, 3, 4, 6].map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm btn-toggle btn-toggle-narrow ${config.supersample === s ? 'btn-primary' : ''}`}
              onClick={() => set('supersample', s)}
              title={`Live supersample ×${s}`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <div className="control-row">
          <span className="control-label" style={{ opacity: 0.7 }}>Live Custom</span>
          <PrecisionSlider
            value={config.supersample || 4}
            sliderMin={SUPERSAMPLE_MIN}
            sliderMax={12}
            hardMax={SUPERSAMPLE_MAX}
            step={1}
            resetTo={4}
            onChange={(val) => set('supersample', val)}
          />
        </div>
      )}

      <div className="control-row">
        <span
          className="control-label"
          title="Target supersample for RENDER PROOF and high-res exports. A dot needs ~8 pixels across for true dot shapes (round, chain, square)."
        >
          Proof
          <span className="control-hint-dim"> · ×{proofSs} ({proofPlate})</span>
        </span>
        <div className="btn-group">
          {[4, 6, 8, 12, 16].map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm btn-toggle btn-toggle-narrow ${config.proofSupersample === s ? 'btn-primary' : ''}`}
              onClick={() => set('proofSupersample', s)}
              title={`Proof supersample ×${s}`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <div className="control-row">
          <span className="control-label" style={{ opacity: 0.7 }}>Proof Custom</span>
          <PrecisionSlider
            value={config.proofSupersample || 8}
            sliderMin={2}
            sliderMax={16}
            hardMax={SUPERSAMPLE_MAX}
            step={1}
            resetTo={8}
            onChange={(val) => set('proofSupersample', val)}
          />
        </div>
      )}

      {/* Render Proof card */}
      {onRenderProof && (
        <div className="print-proof-card">
          <div className="print-proof-head">
            <span>Render Proof</span>
            <span className="control-hint-dim">
              {isProofOnScreen
                ? `Held at ×${proofSs}`
                : proofEstimateMs
                  ? `~${(proofEstimateMs / 1000).toFixed(1)}s at ×${proofSs}`
                  : `×${proofSs}`}
            </span>
          </div>
          <p className="print-proof-copy">
            Escalates the viewport to full proof supersample. Freezes the live render
            pipeline until an ink, screen, or grid setting is changed.
          </p>
          <div className="print-proof-body">
            <button
              type="button"
              className={`btn btn-sm ${isProofOnScreen ? 'btn-disabled' : 'btn-primary'}`}
              disabled={isProofOnScreen || Boolean(proofProgress) || proofSs <= liveSs}
              onClick={onRenderProof}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {proofProgress ? (
                <span>PROOFING ({proofProgress})…</span>
              ) : isProofOnScreen ? (
                <span>PROOF CURRENT (×{proofSs})</span>
              ) : (
                <span>RENDER PROOF (×{proofSs})</span>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Ink Stack: Per-plate ink colors, screening, angle, ruling, shift, opacity, dot shape, dot gain, registration, and drum library.
 */
export const PrintInkStack: React.FC<PrintInkStackProps> = ({
  config,
  onChange,
  compact = false,
  cols = 420,
  rows = 315,
  mediaElement,
  onSeedInksFromPalette,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const proofSs = tierSupersample(config, cols, rows, 'proof');

  const set = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const setInk = (id: string, patch: Partial<InkPlate>) => {
    onChange({
      ...config,
      inks: config.inks.map((k) => (k.id === id ? { ...k, ...patch } : k)),
    });
  };

  const addInk = (hex: string, name: string) => {
    if (config.inks.length >= MAX_INKS) return;
    const angles = PRESS_PROFILES[config.press].angles;
    const next = [
      ...config.inks,
      makeInkPlate({ name, hex }, config.press, angles[Math.min(config.inks.length, angles.length - 1)]),
    ];
    onChange({ ...config, inks: applyPressAngles(next, config.press) });
    setAddOpen(false);
  };

  const removeInk = (id: string) => {
    onChange({
      ...config,
      inks: config.inks.filter((k) => k.id !== id),
      soloInk: config.soloInk === id ? null : config.soloInk,
    });
  };

  const moveInk = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= config.inks.length) return;
    const next = [...config.inks];
    const [row] = next.splice(index, 1);
    next.splice(to, 0, row);
    onChange({ ...config, inks: next });
  };

  const applyPress = (press: PressProfile) => {
    const p = PRESS_PROFILES[press];
    const stamped = config.inks.map((k) => ({
      ...k,
      screen: p.screen,
      ruling: p.ruling,
      dotShape: p.dotShape,
      dotGain: p.dotGain,
    }));
    onChange({
      ...config,
      press,
      paper: p.paper,
      tacLimit: p.tacLimit,
      yuleNielsen: p.yuleNielsen,
      inks: applyPressAngles(stamped, press),
    });
  };

  const conflicts = findMoireConflicts(config.inks);
  const printPalettes = BUILTIN_PALETTES.filter((p) => p.category === 'print');

  const renderRows = (ink: InkPlate, rowsList: PlateRow[]) =>
    rowsList.map((row) => (
      <div className="control-row" key={row.id}>
        <span className="control-label" title={row.hint}>
          {row.label}
          {row.id === 'ruling' && (
            <span className="control-hint-dim"> · {rulingToLpi(ink.ruling, cols * proofSs)} lpi</span>
          )}
        </span>
        <PrecisionSlider
          value={ink[row.id]}
          sliderMin={row.min}
          sliderMax={row.max}
          hardMin={row.hardMin}
          hardMax={row.hardMax}
          step={row.step}
          onChange={(val) => setInk(ink.id, { [row.id]: val } as Partial<InkPlate>)}
        />
      </div>
    ));

  return (
    <>
      {/* Press profile */}
      <div className="control-row">
        <span
          className="control-label"
          title="Stamps ruling, screen family, dot shape, dot gain, paper and the 30-degree angle convention across the whole stack. A starting point, not a lock — change anything after."
        >
          Press
        </span>
      </div>
      <div className="print-press-grid" style={{ marginBottom: '8px' }}>
        {(Object.keys(PRESS_PROFILES) as PressProfile[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm btn-toggle ${config.press === id ? 'btn-primary' : ''}`}
            onClick={() => applyPress(id)}
            title={PRESS_PROFILES[id].description}
          >
            {PRESS_PROFILES[id].name}
          </button>
        ))}
      </div>

      {/* Paper stock */}
      <div className="control-row">
        <span
          className="control-label"
          title="Paper colour. What shows through where no dot lands, and the substrate inks multiply against."
        >
          Paper
        </span>
        <div className="control-cluster control-fixed">
          <DeferredColorInput
            value={config.paper}
            showHexField
            hexFieldWidth="72px"
            onChange={(val) => set('paper', val)}
          />
        </div>
      </div>
      {!compact && (
        <div className="print-paper-grid" style={{ marginBottom: '8px' }}>
          {PAPER_STOCKS.map((s) => (
            <button
              key={s.hex}
              type="button"
              className={`print-paper-chip ${config.paper.toLowerCase() === s.hex.toLowerCase() ? 'active' : ''}`}
              style={{ background: s.hex }}
              onClick={() => set('paper', s.hex)}
              title={`${s.name} · ${s.hex}`}
            />
          ))}
        </div>
      )}

      <div className="tonal-subheading" style={{ marginTop: '4px', marginBottom: '6px' }}>
        <span title="Global color separation physics and multi-plate stochastic screening behavior.">
          Separation & Screening
        </span>
      </div>

      <div className="control-row" style={{ marginBottom: '8px' }}>
        <span
          className="control-label"
          title="Ink purity / crosstalk suppression (0% to 100%): Suppresses secondary ink bleed in tones where a dominant ink is active, keeping flat color fields clean and solid on their own plate."
        >
          Ink Purity
        </span>
        <PrecisionSlider
          value={config.inkPurity ?? 0.5}
          sliderMin={0}
          sliderMax={1}
          step={0.01}
          resetTo={0.5}
          onChange={(val) => set('inkPurity', val)}
        />
      </div>

      <div className="control-row" style={{ marginBottom: '8px' }}>
        <span
          className="control-label"
          title="Grain interlock (joint screening): When enabled, stochastic FM dots on adjacent plates interlock into each other's negative space in gradient transitions, eliminating accidental white paper voids between overlapping colors. Only threshold-mask algorithms can share out an interval this way, so the error diffusion FM algorithms grey out while it is on."
        >
          Grain Interlock
        </span>
        <ToggleSwitch
          checked={config.grainInterlock !== false}
          onChange={(val) => set('grainInterlock', val)}
          title="Interlock dots in gradients to prevent white paper bleed. Greys out the FM algorithms that diffuse error instead of sampling a threshold."
        />
      </div>

      {conflicts.length > 0 && (
        <div className="print-warning" role="status">
          <AlertTriangle size={11} />
          <span>
            {conflicts
              .map(([a, b]) => `${a.name} / ${b.name}`)
              .join(', ')}{' '}
            are within {MOIRE_ANGLE_TOLERANCE}&deg; at a similar ruling. Real presses beat here —
            space the screens 30&deg; apart for a rosette.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary print-warning-action"
            onClick={() => onChange({ ...config, inks: resolveMoireAngles(config.inks, config.press) })}
            title={
              config.inks.filter((k) => k.enabled).length > PRESS_PROFILES[config.press].angles.length
                ? 'Re-angle every enabled plate. Deeper than four inks, so the angles are spread evenly over the 90° the lattice repeats in rather than following the four-colour convention.'
                : `Re-angle every enabled plate to the ${PRESS_PROFILES[config.press].name} convention: darkest ink on 45°, the rest 30° apart, a yellow-leaning ink on the orphan angle.`
            }
          >
            <RotateCw size={10} />
            AUTO ROTATE
          </button>
        </div>
      )}

      {config.inks.map((ink, i) => {
        const isOpen = expanded === ink.id;
        const isSolo = config.soloInk === ink.id;
        /*
         * Interlock only exists for a threshold mask — the plates share out one
         * threshold interval between them — so with it on, every error
         * diffusion algorithm is dead UI: the screening drops to the plain FM
         * path and the grain stops interlocking, silently. Greyed out rather
         * than filtered away, so the reason the choice went missing is legible,
         * and so an existing selection is still shown rather than vanishing.
         */
        const interlockOn = config.grainInterlock !== false;
        const fmAlgorithm = ink.fmAlgorithm || 'atkinson';
        const fmInterlocks = hasThresholdMask(fmAlgorithm);
        return (
          <div className={`print-plate${isOpen ? ' is-open' : ''}`} key={ink.id}>
            <div className="print-plate-head">
              <button
                type="button"
                className="print-plate-disclose"
                onClick={() => setExpanded(isOpen ? null : ink.id)}
                title={isOpen ? 'Collapse this pass' : 'Screen, ink and press settings for this pass'}
              >
                {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
              <span className="print-plate-index">{String(i + 1).padStart(2, '0')}</span>
              <span
                className="print-plate-swatch"
                style={{ background: ink.hex }}
                title={`${ink.hex} at 100% coverage on white`}
              />
              <span className="print-plate-name" title={ink.name}>
                {ink.name}
              </span>
              <span className="print-plate-meta">
                {ink.screen === 'am' ? `${ink.ruling}/${ink.angle}°` : ink.screen.toUpperCase()}
              </span>
              <button
                type="button"
                className={`btn btn-sm btn-micro ${isSolo ? 'btn-primary' : ''}`}
                onClick={() => set('soloInk', isSolo ? null : ink.id)}
                title="Show this pass alone on paper. Free — it filters bits that are already screened, so it is the exact contribution this plate makes to the composite."
              >
                <Eye size={10} />
              </button>
              <ToggleSwitch
                checked={ink.enabled}
                onChange={(val) => setInk(ink.id, { enabled: val })}
                title="Include this pass"
              />
            </div>

            {isOpen && (
              <div className="print-plate-body">
                <div className="control-row">
                  <span className="control-label" title="The ink at 100% coverage on white paper. Read as a density vector by the separation, so a wrong value is a wrong separation and not just a wrong swatch.">
                    Ink
                  </span>
                  <div className="control-cluster control-fixed">
                    <DeferredColorInput
                      value={ink.hex}
                      showHexField
                      hexFieldWidth="72px"
                      onChange={(val) => setInk(ink.id, { hex: val })}
                    />
                  </div>
                </div>
                <div className="control-row">
                  <span
                    className="control-label"
                    title="Film solidity: how much of its own density the ink reaches at full coverage. Riso soy ink is thin around 0.8; process ink near 0.95. This is the term that makes overprints mix rather than just darken."
                  >
                    Solidity
                  </span>
                  <PrecisionSlider
                    value={ink.opacity}
                    sliderMin={0.2}
                    sliderMax={1}
                    step={0.01}
                    onChange={(val) => setInk(ink.id, { opacity: val })}
                  />
                </div>
                <div className="control-row">
                  <span
                    className="control-label"
                    title="Opaque inks cover what is beneath them instead of multiplying — white or metallic on dark stock. This is the only case where print order changes the result."
                  >
                    Opaque
                  </span>
                  <ToggleSwitch
                    checked={ink.opaque}
                    onChange={(val) => setInk(ink.id, { opaque: val })}
                    title="Cover rather than overprint"
                  />
                </div>

                <div className="tonal-subheading">
                  <span>Screen</span>
                </div>
                <div className="control-row">
                  <span className="control-label">Family</span>
                  <div className="btn-group">
                    {SCREEN_FAMILIES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`btn btn-sm btn-toggle btn-toggle-narrow ${ink.screen === f.id ? 'btn-primary' : ''}`}
                        onClick={() => setInk(ink.id, { screen: f.id })}
                        title={f.hint}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {ink.screen === 'am' && (
                  <>
                    <div className="control-row">
                      <span className="control-label" title="The order ink fills a screen cell. Tone stays correct whichever you pick — each shape is calibrated to its own area percentile.">
                        Dot
                      </span>
                    </div>
                    <div className="print-shape-grid">
                      {DOT_SHAPES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`btn btn-sm btn-toggle btn-toggle-narrow ${ink.dotShape === s.id ? 'btn-primary' : ''}`}
                          onClick={() => setInk(ink.id, { dotShape: s.id })}
                          title={s.hint}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {renderRows(ink, SCREEN_ROWS)}
                  </>
                )}

                {ink.screen === 'solid' && (
                  <div className="control-hint control-row">
                    No screen: ink wherever coverage passes half.
                  </div>
                )}

                {ink.screen === 'fm' && (
                  <>
                    <div className="control-row">
                      <span
                        className="control-label"
                        title="Dither algorithm used to generate the stochastic grain pattern for this plate."
                      >
                        Algorithm
                      </span>
                      <select
                        className="number-input stepper-select"
                        value={fmAlgorithm}
                        onChange={(e) => setInk(ink.id, { fmAlgorithm: e.target.value as DitherAlgorithm })}
                      >
                        {DITHER_ALGORITHMS.map((algo) => {
                          const off = interlockOn && !hasThresholdMask(algo.id);
                          return (
                            <option key={algo.id} value={algo.id} disabled={off}>
                              {algo.name}
                              {off ? ' — no interlock' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="print-shape-grid">
                      {FM_TOP_ALGORITHMS.map((a) => {
                        const off = interlockOn && !hasThresholdMask(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            disabled={off}
                            className={`btn btn-sm btn-toggle btn-toggle-narrow ${fmAlgorithm === a.id ? 'btn-primary' : ''}${off ? ' btn-explains-disabled' : ''}`}
                            onClick={() => setInk(ink.id, { fmAlgorithm: a.id })}
                            title={
                              off
                                ? `${a.label} diffuses error instead of sampling a threshold, so it cannot interlock with the other plates. Turn Grain Interlock off to use it.`
                                : a.hint
                            }
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>

                    {interlockOn && !fmInterlocks && (
                      <div className="print-warning" role="status">
                        <AlertTriangle size={11} />
                        <span>
                          Grain Interlock is on, and{' '}
                          {DITHER_ALGORITHMS.find((a) => a.id === fmAlgorithm)?.name ||
                            fmAlgorithm}{' '}
                          has no threshold to share — this plate screens without
                          interlocking. Pick a masked algorithm above, or turn
                          Grain Interlock off.
                        </span>
                      </div>
                    )}

                    <div className="control-row">
                      <span
                        className="control-label"
                        title="Grain cluster size: 1× is ultra-fine single device pixels; 2× clusters pixels to emulate physical ~300 DPI Riso stencil holes (less digital, cleaner borders); 3× and 4× create bold photocopy/zine grain."
                      >
                        Grain Size
                      </span>
                      <div className="btn-group">
                        {[
                          { val: 1, label: '1× Fine', hint: 'Single device pixel (photographic stipple)' },
                          { val: 2, label: '2× Riso', hint: 'Physical stencil dot cluster (~300 DPI)' },
                          { val: 3, label: '3× Coarse', hint: 'Photocopy texture' },
                          { val: 4, label: '4× Chunky', hint: 'Bold zine grain' },
                        ].map((s) => (
                          <button
                            key={s.val}
                            type="button"
                            className={`btn btn-sm btn-toggle btn-toggle-narrow ${(ink.fmScale || 1) === s.val ? 'btn-primary' : ''}`}
                            onClick={() => setInk(ink.id, { fmScale: s.val })}
                            title={s.hint}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="control-hint control-row">
                      {(ink.fmAlgorithm === 'atkinson' || !ink.fmAlgorithm)
                        ? 'Atkinson diffuses 75% error, keeping borders crisp and highlights clean without fuzzy halos.'
                        : ink.fmAlgorithm === 'blue-noise' || ink.fmAlgorithm === 'void-cluster'
                        ? 'Blue noise stipples without error dragging, ensuring sharp shape boundaries.'
                        : `Screened with ${DITHER_ALGORITHMS.find((a) => a.id === ink.fmAlgorithm)?.name || ink.fmAlgorithm} at ${ink.fmScale || 1}× grain scale.`}
                    </div>
                  </>
                )}

                <div className="tonal-subheading">
                  <span>Press</span>
                </div>
                {renderRows(ink, PRESS_ROWS)}

                <div className="control-row control-row-spaced">
                  <button
                    type="button"
                    className="btn btn-sm btn-micro"
                    onClick={() => moveInk(i, -1)}
                    disabled={i === 0}
                    title="Print this pass earlier"
                  >
                    <ArrowUp size={10} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-micro"
                    onClick={() => moveInk(i, 1)}
                    disabled={i === config.inks.length - 1}
                    title="Print this pass later"
                  >
                    <ArrowDown size={10} />
                  </button>
                  <span className="control-fill" />
                  <button
                    type="button"
                    className="btn btn-sm btn-micro"
                    onClick={() => removeInk(ink.id)}
                    disabled={config.inks.length <= 1}
                    title="Remove this pass"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {config.inks.length < MAX_INKS && (
        <>
          <div className="control-row control-row-spaced">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setAddOpen(!addOpen)}
              title="Add a printing pass"
            >
              <Plus size={10} />
              ADD INK
            </button>
          </div>
          {addOpen && (
            <div className="print-ink-library">
              {INK_LIBRARY.map((spec) => (
                <button
                  key={spec.hex + spec.name}
                  type="button"
                  className="print-ink-chip"
                  onClick={() => addInk(spec.hex, spec.name)}
                  title={`${spec.name} · ${spec.hex}`}
                >
                  <span className="print-ink-chip-dot" style={{ background: spec.hex }} />
                  <span>{spec.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Preset Ink Sets */}
      {printPalettes.length > 0 && (
        <>
          <div className="tonal-subheading" style={{ marginTop: '12px' }}>
            <span title="Replaces the ink stack with this set. The lightest entry becomes the paper rather than an ink.">
              Load Preset Ink Set
            </span>
          </div>
          <div className="print-ink-library">
            {printPalettes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="print-ink-chip"
                onClick={() => {
                  if (onSeedInksFromPalette) {
                    onSeedInksFromPalette(p.colors);
                  } else {
                    const angles = PRESS_PROFILES[config.press].angles;
                    const paper = p.colors[0];
                    const inkColors = p.colors.slice(1);
                    const newInks = inkColors.slice(0, MAX_INKS).map((hex, idx) =>
                      makeInkPlate(
                        { name: `Ink ${idx + 1}`, hex },
                        config.press,
                        angles[Math.min(idx, angles.length - 1)]
                      )
                    );
                    onChange({
                      ...config,
                      paper,
                      inks: applyPressAngles(newInks, config.press),
                    });
                  }
                }}
                title={`${p.name} — ${p.colors.length} colours`}
              >
                <span className="control-cluster">
                  {p.colors.map((c) => (
                    <span key={c} className="print-ink-chip-dot" style={{ background: c }} />
                  ))}
                </span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {mediaElement && (
        /* Last, because it *replaces* everything above it. Sitting at the top it
           read as the starting point of the panel, which inverted the flow: the
           press, the stock and the stack are what it overwrites, so the offer to
           derive them from the artwork belongs after the reader has seen what is
           there. */
        <div className="control-row control-row-spaced print-extract-row">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
            onClick={() => {
              const res = extractImageInks(mediaElement, config.press, MAX_INKS);
              onChange({
                ...config,
                paper: res.paper,
                inks: res.inks,
              });
            }}
            title="Samples the loaded image, picks the inks that actually earn a plate, sets the paper stock, and replaces the whole stack."
          >
            <Pipette size={11} />
            <span>EXTRACT INKS FROM IMAGE</span>
          </button>
        </div>
      )}
    </>
  );
};

export const PrintPressAndInksControls = PrintInkStack;

export const PrintControls: React.FC<PrintControlsProps> = ({
  section = 'all',
  ...props
}) => {
  if (section === 'press-and-inks' || section === 'inks') {
    return (
      <PrintPressAndInksControls
        config={props.config}
        onChange={props.onChange}
        cols={props.cols}
        rows={props.rows}
        mediaElement={props.mediaElement}
        onSeedInksFromPalette={props.onSeedInksFromPalette}
        compact={props.compact}
      />
    );
  }
  if (section === 'settings' || section === 'press') {
    return <PrintSettingsControls {...props} />;
  }
  return (
    <>
      <PrintPressAndInksControls
        config={props.config}
        onChange={props.onChange}
        cols={props.cols}
        rows={props.rows}
        mediaElement={props.mediaElement}
        onSeedInksFromPalette={props.onSeedInksFromPalette}
        compact={props.compact}
      />
      <PrintSettingsControls {...props} />
    </>
  );
};
