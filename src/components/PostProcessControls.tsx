import React from 'react';
import {
  AppMode,
  PostProcessConfig,
  POST_PROCESS_DEFAULTS,
  RasterOutputMode,
} from '../types/ascii';
import {
  PrecisionSlider,
  DeferredColorInput,
  WorkflowStep,
  BlendModePicker,
  blendLabel,
  ToggleSwitch,
} from './controlPrimitives';
import { CollapsibleSection } from './CollapsibleSection';
import { supportsCanvasFilter } from '../engine/postProcess';
import { Layers, Sparkles } from 'lucide-react';

/**
 * `05 · COMPOSITING` — everything that happens to a frame after the raster
 * pipeline has finished with it.
 *
 * A host, not a single effect. The two decks here are the two shapes a post
 * stage can take (see `PostStage`): the overlay composites an extra layer, the
 * optics filter the composed frame. A third effect is a deck here and a key on
 * `PostProcessConfig` — it does not touch the four paint sites again.
 *
 * Sits last in the Render tab because that is where it happens; the tab reads
 * top to bottom in engine order.
 */

interface PostProcessControlsProps {
  config: PostProcessConfig;
  onChange: (config: PostProcessConfig) => void;
  appMode: AppMode;
  rasterMode: RasterOutputMode;
  /** No source loaded, so there is nothing for the overlay to bring back. */
  sourceUnavailable?: boolean;
  persistKeyPrefix: string;
  /** Workflow number of this section, continuing the sidebar's own count. */
  step: string;
  /** Anchor for the sidebar rail to scroll to. */
  anchorRef?: React.Ref<HTMLDivElement>;
}
const QUALITY_STEPS: Array<1 | 2 | 4> = [1, 2, 4];

export const PostProcessControls: React.FC<PostProcessControlsProps> = ({
  config,
  onChange,
  appMode,
  rasterMode,
  sourceUnavailable = false,
  persistKeyPrefix,
  step,
  anchorRef,
}) => {
  const overlay = config.sourceOverlay;
  const glow = config.glow;
  const aberration = config.aberration;

  const setOverlay = (patch: Partial<PostProcessConfig['sourceOverlay']>) =>
    onChange({ ...config, sourceOverlay: { ...overlay, ...patch } });
  const setGlow = (patch: Partial<PostProcessConfig['glow']>) =>
    onChange({ ...config, glow: { ...glow, ...patch } });
  const setAberration = (patch: Partial<PostProcessConfig['aberration']>) =>
    onChange({ ...config, aberration: { ...aberration, ...patch } });

  /*
   * Synth has no original distinct from the field it already rendered, so the
   * raw source is meaningless there — but the *graded* source is the
   * pipeline's own buffer and works in every mode, so the deck stays.
   */
  const rawSourceAvailable = appMode !== 'synth';
  const overlayDisabled = !overlay.enabled;
  const noFilter = !supportsCanvasFilter();

  return (
    <>
      <WorkflowStep n={step} label="Compositing" anchorRef={anchorRef} />

      {/*
        The decks sit in a `.tab-content`, like every other collapsible in the
        sidebar: that is where the 14px padding and the inter-section gap come
        from. Without it they run edge to edge and read as a different kind of
        control from everything above them.
      */}
      <div className="tab-content">
        <CollapsibleSection
          title="SOURCE OVERLAY"
          icon={<Layers size={12} />}
          persistKey={`${persistKeyPrefix}-overlay`}
          badge={overlay.enabled ? blendLabel(overlay.blend).toUpperCase() : undefined}
          onReset={() => setOverlay(POST_PROCESS_DEFAULTS.sourceOverlay)}
          resetTitle="Reset the overlay"
        >
          <div className="control-row">
            <span
              className="control-label"
              title="Bring the source back in over its own rasterization, framed identically."
            >
              Overlay
            </span>
            <ToggleSwitch
              checked={overlay.enabled}
              onChange={(enabled) => setOverlay({ enabled })}
              disabled={sourceUnavailable}
              title="Bring the source back in over its own rasterization"
            />
          </div>

          {sourceUnavailable && (
            <div className="panel-note">
              {/*
                One `<span>`, always. `.panel-note` is a flex row and only its
                span gets `flex: 1`, so loose text nodes become separate flex
                items and the note lays itself out in columns.
              */}
              <span>Load a source first — there is nothing to bring back.</span>
            </div>
          )}

          <div className="control-row">
            <span
              className="control-label"
              title="Which layer carries the blend. Not a z-order swap: most of these modes are non-commutative, so the two give different pictures."
            >
              Placement
            </span>
            <div className="btn-group">
              {(['under', 'over'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-sm btn-toggle ${overlay.placement === p ? 'btn-primary' : ''}`}
                  onClick={() => setOverlay({ placement: p })}
                  disabled={overlayDisabled}
                  title={
                    p === 'under'
                      ? 'Source beneath; the raster blends onto it'
                      : 'Source on top, blending onto the raster'
                  }
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <span className="control-label control-fixed" title="How the two layers combine.">
              Blend
            </span>
            <BlendModePicker
              value={overlay.blend}
              onChange={(blend) => setOverlay({ blend })}
              disabled={overlayDisabled}
            />
          </div>

          <div className="control-row">
            <span className="control-label">Opacity</span>
            <PrecisionSlider
              value={overlay.opacity}
              sliderMin={0}
              sliderMax={100}
              step={1}
              resetTo={100}
              disabled={overlayDisabled}
              onChange={(v) => setOverlay({ opacity: v })}
            />
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="Gaussian blur radius applied to the source overlay."
            >
              Blur
            </span>
            <PrecisionSlider
              value={overlay.blur ?? 0}
              sliderMin={0}
              sliderMax={40}
              step={1}
              resetTo={0}
              disabled={overlayDisabled}
              onChange={(v) => setOverlay({ blur: v })}
            />
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="Supersample of the raster's display box. An ASCII cell is six pixels wide, so 1x already gives a readable photograph behind the glyphs; a pixel cell is one, so raise it there."
            >
              Detail
            </span>
            <div className="btn-group">
              {QUALITY_STEPS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`btn btn-sm btn-toggle btn-toggle-narrow ${overlay.quality === q ? 'btn-primary' : ''}`}
                  onClick={() => setOverlay({ quality: q })}
                  disabled={overlayDisabled}
                >
                  {q}×
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <span
              className="control-label"
              title="The raw framed source, or the graded luminance field as it left tone mapping — the picture the dither quantized, one step before it was quantized."
            >
              Layer
            </span>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm btn-toggle ${overlay.source === 'original' ? 'btn-primary' : ''}`}
                onClick={() => setOverlay({ source: 'original' })}
                disabled={overlayDisabled || !rawSourceAvailable}
                title={
                  rawSourceAvailable
                    ? 'The untouched source, framed as the raster framed it'
                    : 'A synth field has no source distinct from itself'
                }
              >
                ORIGINAL
              </button>
              <button
                type="button"
                className={`btn btn-sm btn-toggle ${overlay.source === 'graded' ? 'btn-primary' : ''}`}
                onClick={() => setOverlay({ source: 'graded' })}
                disabled={overlayDisabled}
                title="The graded greyscale, pre-dither"
              >
                GRADED
              </button>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="OPTICS"
          icon={<Sparkles size={12} />}
          persistKey={`${persistKeyPrefix}-optics`}
          badge={glow.amount > 0 || aberration.amount > 0 ? 'ON' : undefined}
          onReset={() =>
            onChange({
              ...config,
              glow: POST_PROCESS_DEFAULTS.glow,
              aberration: POST_PROCESS_DEFAULTS.aberration,
            })
          }
          resetTitle="Reset the optics"
        >
          {noFilter && (
            <div className="panel-note">
              <span>This browser has no canvas blur, so the glow is skipped.</span>
            </div>
          )}

          <div className="tonal-subheading">
            <span>Phosphor Glow</span>
          </div>
          <div className="control-row">
            <span
              className="control-label"
              title="How much of the blurred frame is added back. One blur of the whole frame, so it costs the same whether there are ten strokes or ten thousand."
            >
              Intensity
            </span>
            <PrecisionSlider
              value={glow.amount}
              sliderMin={0}
              sliderMax={200}
              hardMin={0}
              hardMax={400}
              step={1}
              resetTo={0}
              onChange={(v) => setGlow({ amount: v })}
            />
          </div>
          <div className="control-row">
            <span className="control-label" title="Halo radius in output pixels, scaled by zoom and export scale.">
              Radius
            </span>
            <PrecisionSlider
              value={glow.radius}
              sliderMin={0}
              sliderMax={40}
              hardMin={0}
              hardMax={200}
              step={0.5}
              resetTo={6}
              disabled={glow.amount <= 0}
              onChange={(v) => setGlow({ radius: v })}
            />
          </div>
          <div className="control-row">
            <span
              className="control-label"
              title="Empty keeps the frame's own colours in the halo, which is what a tinted beam actually does."
            >
              Tint
            </span>
            <div className="btn-group control-fill">
              <DeferredColorInput
                value={glow.tint}
                fallback="#ffffff"
                disabled={glow.amount <= 0}
                onChange={(v) => setGlow({ tint: v })}
              />
              <button
                type="button"
                className={`btn btn-sm btn-toggle ${!glow.tint ? 'btn-primary' : ''}`}
                onClick={() => setGlow({ tint: '' })}
                disabled={glow.amount <= 0}
                title="Bloom in the frame's own colours"
              >
                AUTO
              </button>
            </div>
          </div>

          <div className="tonal-subheading">
            <span>Chromatic Aberration</span>
          </div>
          <div className="control-row">
            <span
              className="control-label"
              title="Offsets the red and blue channels of the finished frame. Available in every output mode, unlike the beam's own — which offsets the trace and so survives into SVG."
            >
              Amount
            </span>
            <PrecisionSlider
              value={aberration.amount}
              sliderMin={0}
              sliderMax={12}
              hardMin={0}
              hardMax={100}
              step={0.5}
              resetTo={0}
              onChange={(v) => setAberration({ amount: v })}
            />
          </div>
          <div className="control-row">
            <span className="control-label" title="Split direction.">
              Angle
            </span>
            <PrecisionSlider
              value={aberration.angle}
              sliderMin={0}
              sliderMax={360}
              step={1}
              resetTo={0}
              disabled={aberration.amount <= 0}
              onChange={(v) => setAberration({ angle: v })}
            />
          </div>

          {rasterMode === 'vector' && (
            <div className="panel-note">
              {/*
                One line. The full version of this — geometry versus pixels,
                and which one survives into an SVG — is a paragraph, and a
                paragraph in a note box under a slider is not where anyone
                reads it. The tooltip on Beam Aberration itself says it, next
                to the control it is about.
              */}
              <span>Stacks with Beam Aberration in RENDER SETTINGS, which splits the geometry.</span>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </>
  );
};
