# Vector Modulation Pipeline

**Status: built.** Phases 1–4 below are implemented; §6 records what landed and
§8 what is deliberately left. The design argument in §1–§4 is why it is shaped
this way.

How the deflection look of
[`public/rutt_etra_scanline_dither_studio.html`](public/rutt_etra_scanline_dither_studio.html)
reaches the app. Companion to [`pipeline.md`](pipeline.md), which documents the
raster pipeline this one branches away from.

---

## 1. Why the current pipeline cannot produce it

There is already a `rutt-etra` entry in the modulation family
([`ditherAlgorithms.ts:1470`](src/engine/ditherAlgorithms.ts:1470)). It is not a
weak version of the studio — it is a different algorithm answering a different
question, and no amount of tuning closes the gap.

**The dither contract is a per-cell tone remap.** `applyDitherAlgorithm(src,
dest, cols, rows, …)` writes `dest[i]` from `src[i]` (plus neighbours, for
diffusion). It runs at step 3.5, between tone and colour, and must hand back a
quantized luminance on the same grid it was given. There is nowhere in that
signature to return *a line*.

So the existing entry does the only thing it can: it evaluates an **implicit
surface**. For each cell it computes the distance to the nearest displaced
scanline and lights the cell if that distance is under a thickness. Three
consequences, all structural:

| studio does | implicit surface cannot |
|---|---|
| deflect by ±180 px, lines crossing several neighbours | `perp % spacing` wraps — displacement is capped at one spacing and aliases onto the next line |
| occlude: a near ridge hides the line behind it | modulo makes every line identical and unordered; there is no depth to sort |
| stroke at 0.5–4.0 px with round caps and antialiasing | a cell is on or off; thickness floors at `0.65` and the minimum mark is one whole cell |
| sample at 800 px along the line | sampling *is* the grid, typically 200 cells wide |
| emit SVG polylines a plotter can draw | step 5 collapses every cell to one glyph or one `█` |

**Resolution is the summary of all of it.** The studio's amplitude slider spans
±180 *pixels*; on a 200-cell grid that is most of the image. Its stroke width
spans 0.5–4.0 px, all of it below one cell. The look lives entirely in the range
between "one cell" and "one line spacing", and the grid pipeline has no
representation for anything in that range.

The parameter bag says the same thing more quietly: `DitherParams` carries six
fields, `getDitherParamIds('rutt-etra')` honours four of them, and the studio
exposes seventeen. Widening `DitherParams` to seventeen would push fifteen dead
fields onto forty-three algorithms that ignore them, and `DitherParamControls`
derives its rows from that list — the failure mode is sliders that visibly do
nothing, which pipeline.md §2.3.5 already names as the thing to avoid.

**Keep the existing algorithm.** It is a real grid-native look, links and presets
reference it, and the picker's `[X / 44]` counter is wired to the count. It just
is not this.

---

## 2. The split, and where it goes

The studio's own preprocessing — `updateSourceBuffer` — is Rec. 709 luminance,
contrast, brightness, invert. That is a subset of what steps 1–3 already do, far
worse. **The graded `lumBuffer` leaving step 3 is exactly the field the tracer
wants.** So the split is not a fork at the top; it is a fork at 3.5:

```
                       steps 1–3               ┌─ 3.5 quantize ─ 4 colour ─ 5 glyphs ─► text + colors
  synth ──┐                                    │
  media ──┼──► processRasterFrame ─► lumBuffer ┤   (ascii | pixel — unchanged)
  model ──┘     channel mix                    │
                filters                        └─ traceVectorField ──────────────────► VectorFrame
                tone / curve / levels                (vector — new)
```

Everything above the fork is shared and untouched. Vector mode inherits the tone
curve, levels, auto-levels, blur, sharpen, Sobel edges, the histogram tap and the
whole grading panel — every one of which the studio lacks. That is the argument
for putting the seam here rather than writing a second front-to-back renderer:
the new code is the tracer and the painters, nothing else.

**The grid becomes a sampling raster.** In vector mode `cols × rows` is no longer
a display grid, it is the resolution at which the tracer reads luminance, and the
geometric space the polylines live in. Two things follow:

- cells are square (`cellAspect = 1.0`, the pixel-mode branch of
  `autoSetMediaResolution` at [`App.tsx:1596`](src/App.tsx:1596)), because
  polylines are geometry and a 0.6 cell would shear them
- the default should be generous — 600–800 cols, matching the studio's
  `min(800, source.width)` — since sampling density is what keeps a deflected
  line smooth

Cost: steps 1–3 over ~600×800 is ~500k cells. pipeline.md §4.6 measures
`processRasterFrame` at 100–550 ms for 2.6M cells, so this lands near 30–100 ms —
inside what the preview-then-refine machinery (§4.5) already absorbs. The tracer
itself is O(lines × samples), roughly 20k point evaluations, which is nothing.

---

## 3. New surfaces

### 3.1 Types ([`types/ascii.ts`](src/types/ascii.ts))

```ts
export type RasterOutputMode = 'ascii' | 'pixel' | 'vector';
```

**The compiler does not help here, and that was the plan's one wrong
assumption.** There is no exhaustive `switch` over this union anywhere in the
codebase — every consumer tests `=== 'pixel'` or `!== 'pixel'`, and all of those
still typecheck. Widening the union produced **zero errors**, and silently routed
vector down the ASCII branch of about a dozen call sites. §5 therefore has to be
worked by hand, and the useful question at each site is not "is this pixel?" but
which of two different questions it was really asking:

- **"are the cells square?"** — `!== 'ascii'`. Cell geometry, auto-fit,
  auto-resolution, the DPI aspect. Vector belongs here.
- **"is this a cell grid at all?"** — `=== 'pixel'`. Whole-device-pixel scale
  snapping, rung-based zoom stepping, `imageRendering: pixelated`. Vector must
  stay out: a beam is continuous and snapping quantizes the one thing it exists
  to keep smooth.

Getting that split wrong is invisible in the type system and obvious on screen.

```ts
export interface VectorPolyline {
  /** Flat x0,y0,x1,y1,… in grid space. One allocation per line. */
  points: Float32Array;
  color: string;
  width: number;
  /** Occlusion polygons close down to the baseline and fill with bgColor. */
  filled?: boolean;
}

export interface VectorFrame {
  width: number;   // = cols
  height: number;  // = rows
  polylines: VectorPolyline[];
  bgColor: string;
  glow: number;
  glowColor: string;
  /** Where an occlusion polygon closes to. Direction-dependent. */
  fillEdge?: { axis: 'x' | 'y'; value: number };
  /** Composite additively — set when aberration split the beam into channels. */
  additive: boolean;
}
```

Flat `Float32Array`, not `{x, y}[]`: 54 lines × 400 samples is 21,600 point
objects per frame, and the phase animation (§3.3) re-traces every frame.

```ts
export interface VectorConfig {
  direction: 'vertical' | 'horizontal';
  lineCount: number;        // 16–180
  sampleStep: number;       // 1–6 grid cells between samples
  amplitude: number;        // −180…180, in grid cells
  bias: number;             // 0–1, deflection zero point
  blanking: number;         // 0–0.5, beam-off cutoff; independent of the carrier
  occlusion: boolean;
  carrierEnabled: boolean;
  carrierFreq: number;      // 0.05–1.5
  carrierThreshold: number; // 0–0.9
  pwm: number;              // 0.2–2.5
  rippleAmp: number;        // 0–20
  rippleFreq: number;       // 0.1–5.0
  phase: number;            // animation input, radians
  strokeWidth: number;      // 0.5–4.0
  glow: number;             // 0–25, canvas shadowBlur
  chroma: number;           // 0–8, aberration offset
}
```

Its own config object, not an extension of `DitherParams`, for the reason in §1.
`VECTOR_CONFIG_DEFAULTS` mirrors the studio's `state` literal so a fresh vector
mode looks like the studio's first paint.

### 3.2 The tracer — `src/engine/vectorEngine.ts` (new)

```ts
export function traceVectorField(
  lum: Float32Array, cols: number, rows: number,
  config: VectorConfig, colors: VectorColorResolver
): VectorFrame
```

A port of the studio's `render()` with the canvas calls removed — it accumulates
points instead of stroking, which is the whole change. Per line `i`, per sample
`t` along it:

1. **Deflection** — `(lum − bias) · amplitude`, perpendicular to the line.
   Horizontal lines negate it (`−(lum − (1 − bias)) · amp`) so bright reads as a
   peak rather than a trough; that asymmetry is deliberate in the studio and is
   what makes the Rutt-Etra terrain read as relief.
2. **Ripple** — `sin(t · rippleFreq · 0.1 + phase + i) · rippleAmp · (1 − lum · k)`,
   with `k = 0.5` vertical, `0.4` horizontal. Scaling by inverse luminance is why
   it reads as analog noise in the shadows and a clean beam in the highlights.
3. **Carrier gate** — `carrier = (sin(t · freq + phase) + 1) / 2`,
   `dynThresh = max(ε, 1 − lum · pwm)`; drop the sample when
   `lum < cutoff && carrier < dynThresh · (1 − threshold)`. This is the
   Joy Division dot-break, and it is why the line dissolves into pulses in the
   dark and stays solid in the light.
4. **Blanking** — `lum ≤ 0.02` breaks the beam.
5. **Sentinel** — `lum < 0` is transparent and must break the beam too. The
   studio has no transparency; the app does, and a line drawn straight through a
   cut-out silhouette is the bug this catches.

Any break **ends the current polyline and starts a new one**, so one line yields
1..n entries in `polylines`. That is the natural representation for a dashed beam
and it exports to SVG unchanged.

Four divergences from the studio, all deliberate:

- The studio's vertical branch calls `beginPath`/`stroke` **once per sample**
  (~`54 × 450` stroke calls), and its `isDrawingSegment` flag is dead — it
  reassigns `segStart` every iteration regardless. Accumulating points removes
  both by construction.
- Occlusion is a painter's fill: each line closes to the far edge and fills with
  `bgColor` before stroking, lines drawn far-to-near. That is correct and cheap,
  and worth keeping — but the studio disables it whenever the carrier is on,
  because a broken polyline cannot close. `filled` is emitted on the first
  *unbroken* run instead, so a partly-dashed frame still occludes where the beam
  stayed continuous, and a dotted one does not stamp a ground under every dash.

  **The fill must be its own path.** Closing the run and then stroking the same
  path draws the two closing legs and the edge run in the beam colour, which
  reads as a hard line dropping off each end of every ridge the moment occlusion
  is switched on. The SVG exporter always emitted a separate `<polygon>`; the
  canvas painter did not, so the artefact appeared on screen and in PNG but
  never in an exported SVG.

  **Which edge it closes to is direction-dependent**, and one hardcoded value is
  wrong for half the cases. The rule that makes a fill read as relief: a line's
  fill extends in the direction of *increasing draw order*, and its bright
  deflection goes the other way — then a line that peaks hard reaches back over
  what is already drawn and hides it, while the lines still to come are painted
  afterwards and survive. Horizontal is the familiar arrangement (draw top to
  bottom, close to the bottom edge, bright peaks up); vertical deflects bright
  to the right, so it needs the mirror image — draw right to left, close to the
  left edge. `VectorFrame.fillEdge` carries this so the painters do not guess,
  and `scaleVectorFrame` scales it, since it is a coordinate. Draw order is
  invisible with occlusion off: strokes do not overlap destructively and the
  additive aberration passes are order-independent.

  **Which side is near is derived, not chosen.** A ridge is solid on the side
  its peak points *away* from — the mountain body is below its skyline — so
  the near edge is always opposite the direction bright deflects, which is the
  sign of `amplitude`. Negate the amplitude and the relief turns over; the
  stack turns with it.

  It was briefly a separate control, which was a mistake: it could then be set
  to disagree with the geometry, and the fill would cover the sky instead of
  the body. Measured by software-rasterizing the painter's algorithm on a
  stripe field tuned so the ridges genuinely cross, all four
  direction/sign combinations hide 48–53% of the beam, while forcing the
  opposite edge hides 89–95% — the frame is destroyed, not merely restyled.
  There is exactly one right answer for any given deflection, so the config no
  longer carries a way to express the wrong one.
- **Blanking is its own control, not a mode of the carrier.** The studio gates
  its blanking on `carrierOn`, and copying that leaves only two reachable looks:
  carrier off draws flat baselines across the entire background, carrier on
  dissolves the whole frame into dots. The one people actually want — background
  cleared, lit subject still a continuous line — is not expressible.

  They are answering different questions. Blanking is *where there is no beam at
  all*; the carrier is *how the beam breaks up where it is dim*. `VectorConfig`
  carries a `blanking` cutoff applied regardless of the carrier, exposed as
  **Beam Cutoff**:

  | carrier | cutoff | result |
  |---|---|---|
  | on | 0.02 | pulses in shadow, solid in light — the studio default |
  | off | 0 | flat baselines everywhere — what a Joy Division relief wants |
  | off | 0.14 | **continuous beams on the subject only, background cleared** |

  The `blanking > 0` guard on the comparison is load-bearing: a pure black
  ground is *exactly* 0, so an unguarded `v <= blanking` cuts the baseline even
  at a cutoff of zero and the control cannot reach its own off position.
  Transparency is separate again and always cuts, whatever either is set to.
- **Bias means the same thing on both axes.** The studio writes the horizontal
  case as `-(lum - (1 - bias))`, which makes one slider mean opposite things per
  direction: 0 is unidirectional vertically, 1 is unidirectional horizontally,
  and only the 0.5 midpoint agrees. Here it is `-(lum - bias)` — same zero point,
  only the sign of the push differs — so the default renders identically and the
  control stops lying at every other value.

Chromatic aberration diverges too, and this one is an improvement rather than a
fix. The studio strokes its three offset passes in flat red/green/blue, which
discards whatever colour was selected. Each pass here keeps only its **own
channel of the resolved colour**, so the copies recombine to the original where
they overlap and fringe into pure channels where they do not — a real RGB split,
and one that works with a palette instead of overriding it.

**Colour** comes from the existing single selector (pipeline.md §4), not from a
second palette dropdown. `VectorColorResolver` maps line index and mean line
luminance onto a stroke colour:

| selector value | vector meaning |
|---|---|
| `1color` / phosphor | one stroke colour, the active tint |
| `2color` / `3color` / `ntone` | ramp stop chosen by the line's mean luminance |
| `palette:<id>` | nearest palette entry to the line's mean luminance |
| `content` | mean source RGB along the line — see §7 |

Reusing the selector is what keeps this a mode of the app rather than a second
app; the studio's own five-palette dropdown is dropped.

### 3.3 Engine branch ([`rasterEngine.ts`](src/engine/rasterEngine.ts))

`ProcessedRasterResult` gains `vector: VectorFrame | null`. In vector mode the
function returns after step 3 with `text: ''`, `colors: null`,
`isColored: false`, `vector` filled, and `luminance` / `histogram` intact — the
histogram tap sits at step 3 and still works, so Levels and AUTO LEVELS keep
functioning. `emptyRasterResult` gains the field so the degenerate exits stay one
shared literal.

`UnifiedPipelineOptions` gains `vectorConfig?: VectorConfig`.

**Phase is an input, not state.** The studio owns a RAF loop that increments
`timePhase`. Here the existing loop in [`App.tsx`](src/App.tsx) already runs for
synth, model and video; feed `config.phase = time · speed` and vector mode
animates in all three, and on a static image the loop stays off exactly as it
does today. That also makes GIF/video export fall out for free (§4.3).

---

## 4. Painters

Four consumers paint a frame today and each needs a vector branch. They are
independent; none blocks the others.

### 4.1 Viewport ([`AsciiViewport.tsx`](src/components/AsciiViewport.tsx))

`setFrame` grows a `vector?: VectorFrame | null` argument, and `isColoredView`
stops being a boolean — it becomes a three-way
`paintMode: 'dom' | 'cells' | 'vector'`. Vector reuses the existing `<canvas>`
and adds a `drawVectorFrame` branch alongside the ASCII and pixel branches of
`drawCanvas`.

**The zoom behaviour is the point.** The existing effect already re-runs
`drawCanvas` whenever `view` changes, so vector output re-strokes at the new
scale instead of magnifying a bitmap — a line stays one device pixel wide at 800%
zoom. Do not add a bitmap cache here; it would throw away the only thing vector
output is for.

Glow is `ctx.shadowBlur` / `shadowColor` on the stroke, and chroma is the
studio's three-pass offset with `globalCompositeOperation = 'lighter'` on passes
1 and 2. CSS CRT effects do not apply, the same as pixel mode — the canvas glow
replaces them.

### 4.2 Still export ([`imageExporter.ts`](src/engine/imageExporter.ts))

- **SVG is the flagship.** Emit one `<polyline points="…">` per entry, or one
  `<path>` per stroke colour with `m`/`l` subpaths, and **do not route through
  `exportPixelRasterToSvg`** — `mergeCellRects` assumes cells and would emit
  squares where the beam belongs, the same class of mistake `buildAsciiPlateSvg`
  exists to fix (pipeline.md §3.4). Output is a true plotter/laser path, which
  the cell pipeline can never produce.
- **PNG/JPG** re-stroke at export scale. Resolution independence means an 8×
  export is genuinely 8× the detail, not an upscale — the one place vector beats
  pixel outright.

`renderExportFrame` must forward `vectorConfig` alongside `rasterMode`,
`ditherParams` and the rest. pipeline.md's invariant 4: an export path that drops
one field silently produces a different image than the viewport.

### 4.3 GIF / video ([`gif.ts`](src/engine/gif.ts), [`video.ts`](src/engine/video.ts))

`ExportFrameResult` picks `text | colors | luminance | bgColor | isColored`; add
`vector`. Each frame strokes to the canvas through the same painter as §4.2.
Because phase is an input (§3.3), the studio's animate button becomes a real
export — the ripple and carrier drift are recorded rather than being a preview
toy.

### 4.4 Colour separation — refuse, for now

`analyzeSeparation` and `maskLuminance` are cell-based, and the plates are
defined as a partition of the opaque *cells*. Vector has none. Add a
`vector-unsupported` refusal to the existing table
([`separation.ts`](src/engine/separation.ts)) rather than producing an empty
archive.

The follow-up is genuinely easy and worth noting: a vector separation is a
`groupBy(polylines, 'color')`, one SVG layer per stroke colour, and it partitions
by construction. It just is not the same code path.

---

## 5. Every site the widening touched

None of these were compiler errors — see §3.1. Each is a hand decision about
which question the old `=== 'pixel'` test was really asking.

**Square cells (`!== 'ascii'`) — vector joins pixel:**

| site | what it does |
|---|---|
| [`App.tsx`](src/App.tsx) `autoSetMediaResolution` | vector takes its own branch: `min(800, source.width)` columns, `cellAspect 1.0` |
| [`App.tsx`](src/App.tsx) `densityRampSection` | charset section omitted — a beam has no glyphs |
| [`App.tsx`](src/App.tsx) `OptimizeControls isPixelMode` | DPI aspect, both mounts |
| [`mediaRenderer.ts`](src/engine/mediaRenderer.ts) `isTextMode` | already `=== 'ascii'`; correct unchanged |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `getContentSize`, `autoFit` | 1:1 cell geometry |
| [`ExportModal.tsx`](src/components/ExportModal.tsx) CRT gating | a screen artefact baked into a plotter path |

**Cell grid only (`=== 'pixel'`) — vector deliberately excluded:**

| site | why vector stays out |
|---|---|
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `snapScaleToCellGrid` | snapping to whole device pixels quantizes continuous geometry |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `stepZoom`, wheel handler | rung-based zoom exists to hold cell edges; a beam has none |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `imageRendering` | `pixelated` on an antialiased stroke is exactly wrong |
| `autoFit`'s whole-number `fitScale` | same reason as the snapping |

**New branches:**

| site | change |
|---|---|
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `drawVector` | re-strokes on zoom, CSS-translates on pan, culls past `MAX_BACKING_DIM` |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `setFrame` | takes `vector`; `isCanvasMode` now also true for vector, which carries neither text nor a colour buffer |
| auto-resolution cell budget | 400k for vector against 40k for pixel — the grid is a *sampling* raster there, only steps 1–3 run over it, and a coarse one makes a deflected line visibly faceted |
| [`imageExporter.ts`](src/engine/imageExporter.ts) | SVG emits polylines; PNG/JPG re-stroke at export scale |
| [`gif.ts`](src/engine/gif.ts), [`video.ts`](src/engine/video.ts) | per-frame stroke through the same painter |
| [`separation.ts`](src/engine/separation.ts) | `vector` refusal, pointing at the SVG export instead |
| [`share.ts`](src/engine/share.ts) | `vectorConfig` on the payload, **written** by `currentFullState` as well as read on load |
| [`BasicPanel.tsx`](src/components/BasicPanel.tsx) | third output button; `!isPixel` for the charset became `isAscii` |
| [`PaletteControls.tsx`](src/components/PaletteControls.tsx) | `isVectorMode` hides Quantize Depth |

Two behavioural rules held throughout, both instances of the BASIC/ADVANCED
invariant (pipeline.md §4) applied to modes: **the dither picker is hidden, not
disabled**, and `ditherAlgorithm` stays in state so switching back restores it;
**Quantize Depth, charset and band weights are hidden, not reset.**

One subtlety the draft-preview path forced: a preview traces a fraction of the
grid, and the viewport lays out from its own `cols`/`rows`, so a preview frame
carrying its own smaller `width`/`height` would paint at a different physical
size and the image would jump mid-drag. The cell modes expand their buffers
(`framePreview.ts`); geometry multiplies instead — `scaleVectorFrame`, which is
exact rather than a nearest-neighbour blow-up.

---

## 6. What landed

1. **Types + tracer + engine fork.** `RasterOutputMode` widened,
   `VectorConfig` / `VectorFrame` / `VectorPolyline` added,
   [`vectorEngine.ts`](src/engine/vectorEngine.ts) written, and
   `processRasterFrame` returns after step 3 in vector mode with
   `luminance` and `histogram` intact — so Levels and AUTO LEVELS keep working.
2. **Controls.** [`VectorControls.tsx`](src/components/VectorControls.tsx) in
   the dither picker's slot, a third output-mode card, per-mode persisted
   `vectorConfig`, and four presets — UNKNOWN PLEASURES, OSCILLOSCOPE, PULSAR,
   RUTT-ETRA.
3. **Exports.** SVG (polylines, the lossless one), PNG/JPG, GIF and video.
4. **Durable.** Share links, the separation refusal, and all three sources —
   synth, media and model — since the fork sits below where they converge.

Verified headlessly rather than in a browser (the browser tooling was not
available): the tracer against a synthetic field, and `processRasterFrame`
end-to-end in all four colour modes. Confirmed that the transparency sentinel
cuts the beam, that carrier-off preserves the black baseline while carrier-on
blanks it, that bias is unidirectional in the same direction on both axes, that
grading reaches the geometry, that the histogram survives the fork, and that
both cell modes come back byte-identical with `vector === null`.

---

## 7. Where the phase animation stops short

Phase is an input, not stored state (§3.3), so the existing render loop advances
it and synth, model and video all animate. **A static image does not**, because
it has no loop — it re-renders reactively from React state.

Running one for it would mean re-grading 500k cells at 60fps to change a value
only the trace reads. The right fix is to cache the graded `lumBuffer` for a
static frame and re-trace alone, which is cheap (~20k point evaluations) — but
that is a new cache with its own staleness surface across every input to steps
1–3, and pipeline.md §4.6 is a record of two such caches being built, measured
and reverted. Not worth it before someone wants it.

Until then the Phase slider scrubs by hand, everywhere.

---

## 8. Open question

**Whether `content` colour is worth building.** It currently resolves to the
mono tint. Averaging source RGB along a run means the tracer would need the RGBA
buffer, not just `lumBuffer`, which is the one thing that would make this design
reach back above the fork; every other colour mode reads luminance alone, so
`traceVectorField` takes a `Float32Array` and nothing else and the seam stays
clean. A deflection beam in true source colour is also a muddy look, and the
studio does not offer it. Left as-is until someone asks.
