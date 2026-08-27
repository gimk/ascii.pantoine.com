# Render Pipeline

How a frame gets from a source — a maths function, an uploaded image, a 3D mesh — to
pixels on screen or bytes in a file.

The governing idea: **there is exactly one image-processing pipeline**
(`processRasterFrame` in [`src/engine/rasterEngine.ts`](src/engine/rasterEngine.ts)).
Every mode and every export path funnels through it. Modes differ only in how they
produce the raw frame that goes in, and in how the result is painted afterwards.

```
                 ┌───────────────────┐
  synth ────────►│                   │                            ┌──► viewport
  media ────────►│  processRasterFrame├──► ProcessedRasterResult ──┼──► image export
  model ────────►│   6 stages        │                            ├──► colour separation
                 └───────────────────┘                            ├──► GIF export
                          ▲                                       └──► video export
                          │
                    ascii | pixel run all six. **vector** forks after step 3
                    and returns polylines instead — see §2.3.6.
                    all state arrives as
                    UnifiedPipelineOptions

  A shared link is the same contract by another route: it carries the state that
  produces the frame rather than the frame, and drops the same way if a field is
  missing. See §4.
```

---

## 1. Sources

### 1.1 Synth — `renderSynthFrameData` ([`renderer.ts`](src/engine/renderer.ts))

No input file. Luminance is evaluated analytically per cell.

1. Optional `prepareFn(time, cols, rows, sharedCtx)` runs once per frame for custom
   presets that need shared setup.
2. Particles/trails are rasterized first into two scratch buffers:
   - `trailInfluenceBuffer` — additive luminance, radial falloff within 2.5 cells
   - `trailCharBuffer` — a literal glyph per cell, the youngest trail point wins
3. For each cell, either `customRenderFn(...)` (user JS) or
   `evaluateParametricWave(...)` ([`math.ts`](src/engine/math.ts), 8 layered wave
   generators) returns a value in `[-1, 1]`.
4. Normalized: `(v + 1) * 0.5 + trailInfluence`, optional invert, clamped to `[0, 1]`.

18 built-in charsets are defined in the same file, each ordered dark to light. Every
glyph must share ASCII's advance width in the terminal font stack or the grid shears;
Block Elements, Geometric Shapes and 6-dot Braille are safe, CJK and emoji are not.

**Aspect handling.** Cell geometry is baked into the field here, not later:
`aspectRatio = 1.0` in pixel mode, `MONOSPACE_CELL_ASPECT ≈ 0.6015` in ASCII mode,
applied to `dx` before distance/angle are computed. A circle stays a circle in both.

**Hands to the engine:** `luminance` (pre-filled `Float32Array`), an empty `rgba`,
and `charOverrides` when trails are active. Because `luminance` is supplied, the
engine skips its own luminance extraction — **synth has no RGBA data at all**, so any
colour has to come from a palette or tonal mapping, never from the source. This is
why Content Color is disabled in synth mode.

### 1.2 Media — `renderAsciiMediaFrameData` ([`mediaRenderer.ts`](src/engine/mediaRenderer.ts))

**Input files:** anything the browser can decode into an `<img>` or `<video>` — PNG,
JPG, WebP, GIF, MP4, WebM. Also accepts an `HTMLCanvasElement`. Drag-drop, paste,
file picker, or remote URL.

1. A module-level offscreen canvas is resized to exactly `cols × rows` — **the
   downsample to grid resolution happens in the browser's image scaler, not in our
   code**. `willReadFrequently: true` is set.
2. Background cleared (transparent, or white if `viewConfig.background === 'white'`).
3. Fit maths: `contain` / `cover` / `original` / stretch, against a *virtual* canvas
   of `cols × (rows / cellAspect)`. Then scale, offset, rotation, flips.
4. `imageSmoothingEnabled` follows `viewConfig.resampling`
   (`nearest` → off; `preserve-details` → `high`; otherwise `medium`).
5. `ctx.scale(1, cellAspect)` squashes vertically so a monospace cell reads square.
   `cellAspect` is `1.0` in pixel mode, `MONOSPACE_CELL_ASPECT` in ASCII mode.
6. `getImageData(0, 0, cols, rows)` → RGBA.

**Hands to the engine:** `rgba` only. No `luminance`, so the engine computes it.

**Single source of truth:** media's adjustments live in `mediaViewConfig`, which
*is* an `ImageAdjustConfig` (`MediaViewConfig extends ImageAdjustConfig`). The
renderer forwards `...toPipelineAdjustments(viewConfig)`. `RenderMediaContext`
deliberately has no `adjustConfig` field — an earlier version had both, and the
empty one silently shadowed the real one, killing every effect and tonal control in
media mode. Keeping only one field makes that unrepresentable.

### 1.3 Model — `renderModelFrameData` ([`modelRenderer.ts`](src/engine/modelRenderer.ts))

**Input files:** `.obj`, `.stl`, `.ply`, `.gltf`, `.glb` via
[`modelLoader.ts`](src/engine/modelLoader.ts), plus built-in Khronos sample models.

A singleton `HeadlessModelRenderer` owns an offscreen `THREE.WebGLRenderer` sized to
`cols × rows`.

1. Geometry is centred and normalized; a trackball rotation quaternion plus optional
   wobble is applied.
2. Material selected by `viewConfig.shadingMode`:

   | mode | material | what the RGBA means |
   |---|---|---|
   | `shaded` / `outline` | `MeshPhongMaterial` | lit surface |
   | `wireframe` | basic, `wireframe: true` | edges only |
   | `depth` | `MeshDepthMaterial` | distance from camera |
   | `normals` | `MeshNormalMaterial` | surface normal as RGB — genuinely chromatic |
   | `points` | `THREE.Points` | vertex cloud |

3. `renderer.render(...)`, then `gl.readPixels(...)` into a scratch buffer.
4. **Vertical flip.** WebGL reads bottom-up; the loop copies row `rows-1-y` → `y`.
   Skipping this is the classic upside-down-model bug.

**Hands to the engine:** `rgba`.

**Precedence.** The model renderer sets `contrast` / `brightness` / `invert` from
`viewConfig` *before* spreading `...toPipelineAdjustments(ctx.adjustConfig)`, so the
shared adjust config wins. Then `...shadingEdges` is spread last and wins over
everything, because outline shading and edge weight are structural to the shading
mode, not a post-effect.

---

## 2. The unified pipeline

`processRasterFrame(rawFrame, options) → ProcessedRasterResult`

### Buffers

All module-level and reallocated only when `cols × rows` changes — a steady-state
frame allocates nothing.

| buffer | size | holds |
|---|---|---|
| `lumBuffer` | `N` | working luminance, mutated in place by every step |
| `srcLumBuffer` | `N` | snapshot of luminance *before* any filter (see §2.4) |
| `blurBuffer`, `tempBlurBuffer` | `N` | separable box-blur scratch |
| `edgeBuffer` | `N` | Sobel magnitudes |
| `colorsBuffer` | `N × 3` | output RGB |
| `paletteWorkBuffer` | `N × 3` | palette-space error diffusion accumulator |
| `paletteIndexBuffer` | `N` | chosen palette index per cell |
| `cachedLines`, `lineBuffer` | `rows`, `cols` | string assembly |

**The `-1` sentinel.** Throughout the pipeline, `lumBuffer[i] < 0` means *this cell is
transparent*. Every loop must skip those cells rather than treat them as black. Valid
opaque values are `[0, 1]`.

### Step 1 — Channel mixing and luminance extraction

If the source supplied `luminance` (synth), it is copied verbatim and steps 1's RGBA
maths is skipped entirely.

Otherwise, per cell:
- `alpha <= alphaThreshold` (default 10) → `lumBuffer[i] = -1`, done.
- Otherwise Rec. 709 weights, scaled by the tone config's channel mixer and
  renormalized so a neutral mixer is a no-op:
  ```
  lum = (0.2126·r·mixR + 0.7152·g·mixG + 0.0722·b·mixB) / (255 · normWeight)
  ```

**`srcLumBuffer.set(lumBuffer)` happens here.** This snapshot is the pipeline's only
record of what the source looked like, and §2.4 depends on it.

> **State:** `lumBuffer` = raw scene luminance in `[0,1]`, or `-1`.

### Step 2 — Spatial filters

Order is fixed: **denoise → blur → sharpen → edges**.

- **Denoise** is a self-guided filter, not a blur. It fits `out = a·I + b` over a
  local window with `a = var / (var + eps)`, so a flat window (`var ≪ eps`) collapses
  to its mean while a window holding real structure (`var ≫ eps`) passes through
  untouched; `a` and `b` are themselves blurred before being applied, which is what
  keeps the boundary between those regimes from showing as a seam.

  `eps = (0.015 · strength)²` reads as a contrast threshold — 4 treats anything under
  ~6% local contrast as grain — and radius runs 2..5 cells across the normal range.
  Four box blurs whatever the radius, where a bilateral would be quadratic in it.

  These two used to be summed into one radius and run through the same box kernel,
  which made denoise a second blur slider. Measured on a step wedge under 20% grain,
  matched on grain removed: at 51% of the grain gone the guided filter keeps 82% of
  the edge contrast against the box blur’s 58%, and at 79% gone, 53% against 20%.
- **Blur** is the separable box average, applied after denoise, and is meant to take
  edges with it. It is alpha-aware: it averages only over cells with `val >= 0`, so a
  silhouette does not bleed into transparency.
- **Sharpen** is unsharp masking against a second box blur:
  `orig + strength · edgeFade · (orig - blurred)`. Two guards matter:
  - cells on the outermost perimeter, or adjacent to a transparent cell, are skipped
    entirely — sharpening across a silhouette produces a bright halo
  - `edgeFade = min(1, minEdgeDistance / radius)` tapers the effect near borders to
    stop ringing
- **Sobel edges** compute a 3×3 gradient magnitude, subtract the threshold, scale by
  strength, and **add** into `lumBuffer` (edges brighten, they don't replace).

> **State:** `lumBuffer` = filtered luminance.

### Step 3 — Tone

In this exact order. **Exposure runs first, in its own guarded pass**; everything
after it is one pass, per cell.

0. **Exposure — contrast / brightness** — `(v - 0.5)·tan((c+100)·π/400) + 0.5 + b`,
   clamped
1. **Tone curve** — monotone cubic spline through `curvePoints`, baked to a 256-entry
   LUT once per frame
2. **Levels** — black/white clip plus a gamma derived from the midtone position
   (`toneConfig.levelsBlack / levelsMidtones / levelsWhite`)
3. **Shadows / highlights** — split at 0.5, each half pushed independently
4. **Midtones** — `pow(v, 2^(-m/50))`
5. **Noise** — uniform, amplitude `noise/200`
6. **Posterize** — `2^bits - 1` steps, when `posterizeBits` is set
7. **Invert**

**Why exposure is first, and not third.** It used to run between levels and the
tonal balance, which meant the two coarsest controls in the panel silently
overrode the two most precise ones. Levels clips black to exactly 0; contrast
then pivots the whole range about 0.5 and brightness adds a flat offset, so a
positive brightness turns that clipped black into `brightness` and a negative
contrast lifts it to `0.5(1 - factor)`. Levels ran earlier, so **nothing could
recover it — dragging the black point simply stopped producing black**, at any
setting.

Upstream is also the conventional place: Lightroom and Camera Raw both apply
Exposure and Contrast ahead of the tone curve. And it is the only order that
lets the sidebar read top to bottom, which is the rule the rest of this section
is built on.

It is a separate pass rather than a branch inside the loop because **both** the
loop and the histogram tap have to see it. Skipped entirely at neutral.

> **State:** `lumBuffer` = fully graded luminance. This is the last step that sees
> continuous tone in the general case.

#### The histogram tap

A short dedicated pass runs **between steps 1 and 2 of the list above** — after
the tone curve, before levels — filling a 256-bin `histogramBuffer` and counting
opaque cells into `histogramOpaque`. Both ride out on `ProcessedRasterResult` as live
module buffers, the same contract as `luminance`.

That position is the whole point. **AUTO LEVELS is idempotent because nothing
downstream of the tap feeds back upstream of it**, so the reading does not move when
the levels it produced are applied, and pressing the button twice is a no-op.
Exposure moving to step 0 keeps that: it is now *upstream* of the tap, and levels
is still the only thing the button writes and still sits below.
Sampling the fully graded luminance instead would walk the image toward pure black
and white on every press. Sampling `srcLumBuffer` would be idempotent too but would
ignore blur, sharpen and edges, so the endpoints would not match what levels actually
sees.

`computeAutoLevels` ([`autoLevels.ts`](src/engine/autoLevels.ts)) takes the endpoints
at a percentile — 0.1% each end by default, the same figure Photoshop uses — not at
the absolute min and max. One specular highlight is otherwise enough to pin white at
100 and the button appears to do nothing on exactly the images that most need it. It
returns `null` when the span is under 5 bins; a flat image should be left alone
rather than stretched into noise.

Midtones are left at 50. The operation is a contrast stretch, not a re-gamma. In the
UI, dragging an endpoint carries the midtone with it so the derived gamma stays fixed
— otherwise stretching an image would silently re-gamma it too.

`ImageAdjustControls` renders the whole group in engine order — exposure, curve,
levels, tonal balance — so the histogram under the handles is always the tone the
handles operate on. Exposure used to sit in EFFECT CONTROLS, visually last and
below a collapsed disclosure, while running third; that is what made the bug
invisible. It also means the histogram now includes exposure, so on a lifted
image the handles sit over data that actually exists rather than over the
pre-exposure distribution.

### Step 3.5 — Quantization depth and dithering

**Depth resolution.** `ditherLevels` is how many tones the dither is allowed to
resolve. The output's natural depth is the *default*, never a ceiling:

```
auto = ASCII output          → density.length      (one level per glyph)
       indexed palette       → palette.colors.length
       2color / 3color / ntone → 2 / 3 / N (customToneColors.length)
       otherwise (pixel)     → 256                 (continuous)

ditherLevels = max(2, explicit colorLevels || auto)
```

`colorLevels` is user-facing as **Quantize Levels** (`0` = auto). Setting it below the
natural depth is a real look — four glyphs out of a ten-character ramp, four colours
out of a sixteen-colour palette. Above it, it saturates harmlessly.

**Who does the quantizing.** Palettes are handled specially:

```
paletteOwnsQuantization =
      pixel mode
  &&  an indexed palette is active
  &&  no explicit colorLevels
  &&  the algorithm's family is 'error-diffusion'
```

When true, **this step does nothing** — the tone stays at full precision and the
palette quantizes it in step 4. Rationale in §2.4.

When false, `applyDitherAlgorithm` runs one of 44 algorithms
([`ditherAlgorithms.ts`](src/engine/ditherAlgorithms.ts), families: error-diffusion,
ordered, blue-noise, algorithmic, modulation). With `none` plus an explicit level
count, a plain posterize runs instead — "none" means no *error distribution*, not
"ignore the requested depth".

**Parameters.** `options.ditherParams` tunes the selected algorithm — intensity,
mask scale and screen angle, carrier frequency, pattern seed, and serpentine scan
for the diffusion family. It is sparse: an absent field takes that parameter's
default, so an omitted object renders exactly as the hardcoded behaviour did, which
is what keeps links and presets written before it existed rendering unchanged.
Which parameters a given algorithm honours comes from `getDitherParamIds`, derived
from the shape of the implementation rather than declared beside the registry entry
— a list kept by hand next to 44 entries drifts from the code the first time a
branch changes, and the failure mode is a slider that visibly does nothing.

Each spec carries a **track range and a wider hard range** (`hardMin` / `hardMax`):
the slider spans what is worth dragging through, the number field beside it accepts
the extremes. `resolveDitherParams` clamps to the *hard* range, not the track — a
typed value that the field accepted and the engine snapped back would read as a
broken control rather than a bounded one. The floors that do not move are
structural: `scale` is a divisor and `frequency` multiplies a carrier rate, so
neither may reach zero however far the field is pushed.

**Clamp and sentinel restore.** Error diffusion pays accumulated error back onto
cells and can overshoot outside `[0, 1]`. An undershoot below zero would collide with
the transparency sentinel and punch holes through opaque pixels. So immediately after
dithering:

```
lumBuffer[i] = srcLumBuffer[i] < 0 ? -1 : clamp(lumBuffer[i], 0, 1)
```

`srcLumBuffer` is the only authority on what was actually cut out.

> **State:** `lumBuffer` = quantized to `ditherLevels`, or still continuous if the
> palette owns quantization. Sentinel intact.

#### Tonal band weights

Runs immediately *before* the dither, only when a user ramp is driving colour —
never for an indexed palette, which owns its own spacing, nor for mono, which
never buckets.

A ramp's bands were never equal to begin with. Quantization is round-to-nearest,
so level $i$ claims everything within half a step of it: the two end levels get
half-width bands and the interior ones full-width. A four-stop ramp is really
1/6, 1/3, 1/3, 1/6 — shadows and highlights cover half as much of the image as
the middle two. `naturalBandBoundaries` computes this.

`buildToneBandLut` scales those natural widths by `toneStopWeights`,
renormalises, and emits a 256-entry piecewise-linear LUT mapping each stop's
*requested* slice of the input range onto the slice the quantizer actually gives
it. Three consequences worth keeping in mind:

- **Neutral is an exact identity.** All-equal weights return `null` and the pass
  is skipped, so every existing ramp renders bit-identically. Scaling the
  natural widths rather than assigning absolute shares is what avoids a
  discontinuity at neutral — otherwise a one-step nudge would jump the ramp from
  its legacy distribution to a flat one.
- **The warp goes here, not in step 4.** The colour branch buckets with
  `floor(lum * N)` and this step quantizes to $N$ even levels; the two are
  aligned, and that alignment is why an $N$-stop ramp reproduces exactly $N$
  tones. Moving the *bucket* boundaries instead would collide quantized levels
  into some bands and skip others, leaving dead colours — §2.4's palette failure
  in reverse.
- **Bands are floored at 1%.** A zero-width band is not just invisible; it makes
  the warp non-invertible and hands the dither a flat segment to turn into a
  hard edge.

**The slider response is a power curve**, `(v / 50) ^ 2.5`, not linear. Weights
are normalised against each other, which eats most of the upward travel: with a
linear mapping, raising one stop of four from 50 to 100 lifted its share of the
*total* only from 25% to 40%, so half the slider bought a band 16.7% → 28.4% of
the image, while downward reached 1% easily. The control was weak and lopsided.
A two-piece linear curve fixed the reach but put a visible kink at neutral — the
same drag worth +7 below 50 and +30 above. The power curve is smooth through
neutral, still reaches exactly 0 so a band can be suppressed, and spans roughly
1% → 53% on a four-stop ramp in even steps.

`toneBandShares` exposes the normalised widths so the UI can draw the ramp at
its true proportions. Measured against a simulated render it tracks within 0.2
points. Both panels consume it, differently:

- **BASIC** draws hard segments above the band rows — one block per colour,
  sized to its share.
- **ADVANCED** keeps its smooth gradient bar and moves the colour *stops* along
  it instead. Each stop sits at its band's centre, with the ends pinned to 0%
  and 100%. Because the natural bands are symmetric, that works out to exactly
  `i / (count - 1)` whenever the weights are neutral — the even spacing the bar
  has always drawn — so an unweighted ramp looks precisely as it did before
  weights existed, and only starts moving once a slider does. The tick marks and
  the per-stop `%` badge come from the same positions.

**Both editors resample through one helper.** `resampleRamp` (in
`NToneRampEditor`) changes the stop count, interpolating the colours and
carrying the weights across by position, padded with neutral. Colours and
weights are matched by *array length* — `resolveToneStops` falls back to neutral
the instant they disagree — so any path that changes the count and forgets the
weights wipes them silently. One helper means that can only be got wrong once.
Its `maxStops` argument is a caller's layout limit, not an engine one.

Neutral itself is defined once, by the engine (`TONE_WEIGHT_NEUTRAL`), and
re-exported down the chain. A UI that disagreed about which value is neutral
would leave the warp quietly switched on after a "reset".

#### The vector fork

**Vector output leaves the pipeline here**, immediately after `resolveRampStops`
and before the depth resolution above — tone fully graded, nothing quantized. It
returns a `VectorFrame` of polylines instead of `text` and `colors`, and
everything below this point (depth, the band warp, the dither, the colour buffer,
the glyph ramp) is cell machinery with no vector meaning.

The seam sits at 3.5 rather than at the top of the function because steps 1–3 are
*exactly* the field a beam wants to read: vector mode inherits the tone curve,
levels, AUTO LEVELS, blur, sharpen and Sobel edges without a line of new code.
`luminance` and `histogram` still ride out on the result, so the histogram tap
keeps working — it is upstream of the fork and never depended on the quantizer.

In that mode `cols × rows` stops being a display raster and becomes the
resolution the beam *samples* luminance at, and the coordinate space the
polylines live in. Cells are square, and the grid is much larger (800 across for
media, a 400k auto-resolution budget against pixel mode's 40k) because only
steps 1–3 run over it. Nothing downstream quantizes to that grid, so a coarse
one costs a visibly faceted deflection curve rather than visible cells — which
is why both resolution controls give vector its own preset range around 800
rather than the 60–240 a glyph grid wants.

The tracer reads each line into a scratch series *before* drawing any of it, so a
**Smoothing** radius can low-pass the luminance before it becomes a displacement.
That is a different control from `sampleStep`, which decimates rather than filters:
raising the step drops vertices while the survivors keep the same point-sampled
noise. Measured on a grainy field, mean vertex curvature is 12.46 at step 1 and
12.08 at step 6, against 0.49 at a 4-cell smoothing radius.

Colour is resolved once per beam, from the run's mean luminance, through the same
single selector every other mode reads (§4): the tint for mono, a ramp stop, or
the palette's tone match. Hue matching does not apply — it needs per-cell RGB to
compare against, and a beam's colour is a property of the whole run.

Full argument, the divergences from the reference studio, and every call site the
third output mode touched: [`vector-pipeline.md`](vector-pipeline.md).

---

### Step 4 — Colour

Exactly one branch runs, chosen by `paletteMode` (from `MediaColorConfig`) and
`tonalMapping` (from `ImageAdjustConfig`). The UI presents these as **one**
dropdown — see §4.

#### The grade ratio

Colour modes that sample source RGB need the grading applied to them, or every
filter, curve, level and dither would be invisible in those modes (they only ever
moved `lumBuffer`, which those modes never read). So:

```js
gradeRatio(i) = lumBuffer[i] / srcLumBuffer[i]
```

Sampled RGB is multiplied by this, which preserves hue while applying the full tonal
pipeline. Near-black source cells fall back to an additive lift to avoid dividing by
zero.

#### `content` — true source colour

Source RGB × grade ratio, then saturation applied around the Rec. 601 grey point,
then rounded and clamped once at the end.

#### `indexed` — a built-in palette

First, is the *palette* capable of representing hue?

```js
paletteIsMonochrome(q)   // chroma-weighted circular mean resultant length of hue
                         // 1.0 = one hue; threshold 0.93
```

Measuring spread in the Lab a/b plane directly does **not** work — it confuses chroma
variation with hue variation and labels Game Boy's dark-green-to-yellow-green ramp as
chromatic. Under the circular metric every single-hue ramp scores ≥ 0.95 and the
nearest genuine two-hue palette scores 0.86.

A single-hue palette is forced down the tone path regardless of the source, because
scoring a colour photo on how near its hue is to the one available hue is noise.

Then, is the *source* chromatic? Sampled ~40 pixels, mean `max(|r-g|, |g-b|, |r-b|)`
> 10.

| palette | source | path |
|---|---|---|
| multi-hue | chromatic | RGB error diffusion against the palette (CIELAB ΔE match) |
| multi-hue | achromatic | tone error diffusion against the palette's own luminances |
| single-hue | either | tone error diffusion |

**Why palette-space diffusion.** A palette's tones are not evenly spaced. Game Boy
Classic sits at `0.153 / 0.304 / 0.566 / 0.621`. Quantizing tone to four *even* steps
and then indexing the ramp gives the top two colours a third of the range each when
they are 0.055 apart — the shadows stretch, the highlights collapse, and the whole
image renders dark. Diffusing against the palette's real positions fixes the tonal
reach and lets a four-colour ramp reproduce a smooth gradient.

Both variants are serpentine Floyd–Steinberg (`7/16, 3/16, 5/16, 1/16`, mirrored on
right-to-left rows), and both **clamp the accumulator, not just the lookup**. A
palette that does not span colour space — Game Boy is four greens — can never absorb
red and blue error, so it compounds until every pixel pins to one extreme and the
image collapses to a single colour.

With `dither = none`, the same code runs with error propagation switched off: nearest
palette entry, no carry.

#### `2color` / `3color` / `ntone` — user N-tone multi-color ramp

Discrete tonal mapping across $N$ custom color stops ($N = 2 \dots 8$ in `customToneColors`, or `[shadowColor, midtoneColor, highlightColor]`):
$$\text{stopIdx} = \min(N - 1, \lfloor \text{lum} \times N \rfloor)$$
Transparent cells take the shadow colour (stop 0) rather than the sentinel, since these ramps
are opaque by definition.

#### phosphor / `1color`

No branch runs. `colorsOut` stays `null` and colour is applied downstream by CSS
(`--accent`, gradients) on the `<pre>` element.

> **State:** `colorsBuffer` filled, or `colorsOut === null` for the mono path.

### Step 5 — Glyphs

If pixel mode reached here with no colour buffer, luminance is expanded to grey RGB
so the viewport always has something to paint.

Per cell:
- `lumBuffer[i] < 0` → `' '`
- **pixel mode** → always `'█'`. Tone lives in the colour buffer, not the glyph.
  Thresholding here would drop dark cells and leave holes in the shadows.
- **ASCII mode** → `density[floor(val · density.length)]`, clamped
- `charOverrides[i]` (synth trails) wins over both

**Invariant:** in pixel mode a space means *transparent* and nothing else. The
viewport relies on this.

### Result

```ts
{ text, colors, luminance, cols, rows, rasterMode, bgColor, isColored,
  histogram, histogramOpaque }
```

`luminance` and `histogram` are the live module buffers — not copies. Consumers must
read them before the next frame overwrites them. App copies the histogram on its way
into React state, throttled to 200 ms and only while the Render panel is open: a
synth loop produces 60 frames a second and would otherwise re-render the sidebar that
often to redraw 256 bars nobody is looking at.

Every source has a degenerate early exit — no grid, no media element, no WebGL
context — and they were four hand-copied object literals that all broke the moment a
field was added. They now share `emptyRasterResult(rasterMode)`, exported from the
engine.

---

## 3. Output

### 3.1 Viewport ([`AsciiViewport.tsx`](src/components/AsciiViewport.tsx))

Three mutually exclusive paths. `isColoredView` picks DOM from canvas, and it
is true whenever the frame carries a colour buffer **or** the raster mode is
pixel or vector — vector has no colour buffer at all, so neither of the other
tests would catch it.

**Mono → DOM.** `text` is written to a `<pre>`, CSS-scaled by zoom. Colour comes from
CSS custom properties, which is what makes phosphor tints, gradients, glow, bloom,
scanlines and vignette possible. An optional second `<pre>` sits underneath as a
blurred bloom layer.

**Vector → canvas, re-stroked.** `drawVector` paints the polylines under the
view transform. Unlike the two cell paths it **repaints on every zoom** rather
than magnifying a bitmap — that is the whole point of the mode, and a bitmap
cache here would throw it away. A *pan* is still free: the canvas holds the whole
raster and carries the translate in CSS, and only past `MAX_BACKING_DIM` does it
fall back to a viewport-sized canvas that repaints as it moves. CSS CRT effects
do not reach a canvas, so the phosphor halo is `ctx.shadowBlur` instead, scaled
by the zoom because canvas measures shadow radius in device pixels and ignores
the transform.

**Coloured → canvas.** `drawCanvas` has two branches:

*ASCII:* backing store `unscaledW × zoom × dpr`, `ctx.scale(zoom·dpr)`, then
`fillText` per cell at `MONOSPACE_CELL_WIDTH × MONOSPACE_CELL_HEIGHT`
(`6.015 × 10.0`). Spaces are skipped.

> **This is the most expensive stage of a normal frame.** Measured at 7,680 cells
> it costs ~7.1 ms, against 1–3 ms for the whole raster pipeline and ~0.2 ms for
> the media readback (§4.6). Holding `fillStyle` constant for the frame drops it
> to 2.97 ms, so **58% of the cost is style churn**, not glyph rasterization —
> a `rgb(…)` template string is built and assigned per cell. Coalescing each row
> into runs of identical colour and drawing each run as one
> `fillText(line.slice(x, end), …)` measured 3.10 ms, a 43% cut. It works because
> quantized output holds very few distinct colours: 4–16 for an indexed palette,
> 2–8 for an n-tone ramp. Only `content` colour is high-cardinality, and it still
> improves (7.53 → 6.32 ms). A pre-rendered glyph atlas with one `drawImage` per
> cell was also measured and is *slower* (9.09 ms) — don't.

*Pixel:* rasterizes into a `cols × rows` `ImageData` on an offscreen buffer canvas,
then blits it up with `imageSmoothingEnabled = false`. The visible canvas is snapped
to `cols × round(zoom · dpr)` so every cell is a whole number of device pixels.

Both details are load-bearing:
- `imageSmoothingEnabled` only affects `drawImage`, **not** `fillRect`. Painting
  scaled `fillRect`s antialiases every cell edge whenever `zoom · dpr` is fractional.
- Without integer snapping, nearest-neighbour still alternates 2px/3px cells, which
  is its own shimmer.

Together these were the cause of the moiré on flat backgrounds.

### 3.2 Still image ([`imageExporter.ts`](src/engine/imageExporter.ts))

Formats: `png`, `jpg`, `svg`.

Re-renders the frame at export resolution through the *same* mode renderer, so
`rasterMode`, `ditherAlgorithm`, `ditherParams`, `toneConfig` and `adjustConfig`
must all be forwarded — an export path that skips one silently produces a different
image than the viewport.

- **Cell Aspect & Dimensions**:
  - *ASCII mode*: Character cells are calculated using monospace aspect
    (`MONOSPACE_CELL_WIDTH * scale = 6.015 * scale`, `MONOSPACE_CELL_HEIGHT * scale = 10.0 * scale`),
    giving a $0.6015:1$ cell aspect ratio that un-squashes font glyphs.
  - *Pixel mode*: Character cells are calculated as **$1:1$ square cells**
    (`cellWidth = cellHeight = Math.max(1, Math.round(scale))`).
    $1\times$ scale maps to $1\text{px/cell}$ ($cols \times rows$ native match with the viewfinder).
    Canvas size is `cols * cellWidth` by `rows * cellHeight`, ensuring pixel art is undistorted.
- **CRT Effects in Pixel Mode**: CRT effects (scanlines, CRT glow, vignette, phosphor bloom) are
  strictly bypassed/disabled in Pixel mode across all export engines (PNG, JPG, SVG, GIF, MP4/WebM),
  ensuring raw dithered pixels remain crisp and unblurred.
- **SVG** — ASCII emits `<text>` runs; pixel goes through `exportPixelRasterToSvg`
  (see below).
- **PNG/JPG** — ASCII draws text to a canvas; pixel goes through
  `drawPixelRasterToCanvas` with square cell dimensions. JPG forces an opaque background.

`pixelRasterRenderer.ts` skips a cell only on `lum < 0`. A brightness threshold there
would punch holes through the shadows, the same class of bug as step 5.

**SVG geometry — why it is paths and not rects.** `exportPixelRasterToSvg` used to
emit one `<rect>` per cell. On a $500 \times 400$ grid that is 200,000 elements and an
18 MB file, but the byte count was the lesser problem: 200,000 vector *nodes* is what
made Figma fall over on import. Three compactions, in order of how much they buy:

1. **Merge cells into rectangles** (`mergeCellRects`). Two-pass greedy mesh — horizontal
   runs within a row, then vertical merging wherever the run directly above shares the
   same fill, start and width. Not minimal (that problem is NP-hard in general) but it
   collapses what actually occurs: flat grounds, palette regions, dither runs.
2. **One `<path>` per fill**, not per rectangle. Node count then equals the number of
   distinct colours, so a separation plate — one colour by definition — is *one node*.
3. **Integer cell units** with `transform="scale(sx sy)"` on the wrapping group, plus
   `h`/`v` over `l` and relative `m` between subpaths (`z` returns the point to the
   subpath start). `M3 4h5v1h-5z`, not `x="18.05" y="40.00" width="30.08"`.

The group carries `shape-rendering="crispEdges"` to suppress hairline seams between
abutting subpaths at fractional zoom.

The fill key is the merge key, so it must carry everything that makes two cells
non-mergeable. With a colour buffer that is the RGB triple. Without one, tone lives in
per-cell opacity, **quantized to 2 dp** — left continuous, every distinct float would
be its own group and nothing would merge at all.

### 3.3 Animation ([`gif.ts`](src/engine/gif.ts), [`video.ts`](src/engine/video.ts))

Loop over frames, dispatch to the mode renderer, funnel each result through
`ExportFrameResult = Pick<ProcessedRasterResult, 'text' | 'colors' | 'luminance' | 'bgColor' | 'isColored'>`.
- *ASCII mode*: Canvas paints background, optional phosphor glow, and sharp monospace text lines.
- *Pixel mode*: Canvas paints directly through `drawPixelRasterToCanvas` with $1:1$ square cell bounds
  ($1\times = 1\text{px/cell}$) and no CRT filters, avoiding monospace font spacing anomalies and preserving sharp dithered pixel output.
Same forwarding requirement as stills (`rasterMode`, `ditherAlgorithm`, `ditherParams`, `toneConfig`, `adjustConfig`).

### 3.4 Colour separation ([`separation.ts`](src/engine/separation.ts), [`separationExporter.ts`](src/engine/separationExporter.ts))

One file per ink, so each colour can be edited independently in Illustrator, Figma,
or on a press.

**It costs almost nothing structurally, because of invariant 1.** `luminance[i] < 0`
means transparent and every painter already skips those cells. Masking a plate is
therefore just writing `-1` into the cells belonging to other inks — the canvas and
SVG painters needed no changes at all.

```
renderExportFrame(opts)          ← one render, shared with the still export
      │
      ├── analyzeSeparation()    → the distinct colours, dark to light
      │
      └── per plate: maskLuminance() / maskText()  → existing painters → ZIP
```

**Rendered once, re-masked per plate.** A per-plate re-render would be N times the
work and, worse, would give the dither N chances to land differently — the plates
would no longer add back up to the original.

**The plates partition the opaque cells exactly**: every opaque cell is in exactly
one plate, none is doubled or missed, no transparent cell leaks in, and no plate is
empty. That property is what the separation *is*, so it is verified directly rather
than assumed.

**Two styles.** `color` puts each plate in its own colour on transparency, so
stacking them rebuilds the image. `ink` drops the colour buffer entirely, which makes
the painters fall back to `fgColor` — black on white, a coverage mask. JPG has no
alpha, so choosing it forces `ink`; a colour plate on an opaque ground cannot stack
and would silently not work.

**No CRT effects, either raster mode.** Scanlines or bloom on a separation bake a
screen artefact into every plate and compound N times when they are stacked back up.

**ASCII needs its own SVG path.** `exportPixelRasterToSvg` draws rects; running an
ASCII separation through it emits squares where the glyphs belong — plates that are
right as masks and wrong as artwork. `buildAsciiPlateSvg` emits `<text>` runs
instead, one per row, since a plate is a single ink and needs only one fill.

**Layered SVG.** `exportPixelRasterToSvg` gained an opt-in `groupId` that emits a
bare `<g>` rather than a whole document, so the plates can be stacked into one file
as named layers — what Illustrator and Figma read on import. The background rect is
skipped in group mode; a layer painting its own opaque ground would hide everything
beneath it. An ink-style layered SVG gets its white ground on the root instead.

**Refusals carry a reason** rather than producing an empty archive:

| refusal | when | what the UI says to do |
|---|---|---|
| `mono` | `colors === null` — the 1color path leaves colour to CSS (§2.4) | pick a palette or duotone in COLORS |
| `too-many` | more than `MAX_PLATES` (64) distinct colours | choose an indexed palette, or set Quantize Levels |
| `empty` | nothing opaque in the frame | — |
| `vector` | the frame is beam geometry, which has no cells to partition | export the SVG, which is already one path per stroke colour |

In practice the count is right by construction: an indexed palette yields exactly its
own entries, `2color`/`3color` yield 2 or 3, pixel output with an explicit
`colorLevels` yields that many greys. Only `content` colour, being continuous, runs
past the cap.

Packaging is [`zip.ts`](src/engine/zip.ts), a stored-method ZIP writer with no
dependency — PNG and JPG already carry their own deflate. It exists because firing N
downloads from a single gesture is throttled or blocked by Chrome and Safari.

---

## 4. State

### Per-mode isolation

`renderSettingsByMode: Record<AppMode, RenderSettings>` — synth, media and model each
keep their own copy of essentially everything: resolution, charset, raster mode,
dither algorithm, tone config, `adjustConfig`, phosphor theme, custom tint, gradient,
CRT config and `mediaColorConfig` (palette mode, active palette, saturation).
Persisted to `localStorage` under one key. Switching modes swaps the whole set, so a
palette chosen in media does not follow you into synth.

`mediaViewConfig` sits outside that record as its own `useState`. It is media's
store in practice, since nothing else reads it, but it is not keyed by mode and it is
**not** persisted to `localStorage` — it only survives via shared links.

Media is also the exception to the `adjustConfig` rule: its grading lives in
`mediaViewConfig`, not in `RenderSettings.adjustConfig`. See §1.2.

Levels is the one piece of grading that is **not** in `adjustConfig` in any mode: it
lives in `RenderSettings.toneConfig`, alongside it. `ImageAdjustControls` therefore
takes `toneConfig` and `onChangeToneConfig` as separate props rather than merging the
two stores, and `MediaViewControls` forwards them through.

> A near-identical `levelBlack` / `levelMidtones` / `levelWhite` triple used to sit on
> `MediaViewConfig` as well, written by the media preset defaults and read by nothing.
> It is gone. Two grading triples one letter apart is precisely the shape of the
> `adjustConfig` shadowing bug in §1.2.

### The share payload ([`share.ts`](src/engine/share.ts))

`FullAnimationState` is the wire format. **Everything the engine needs must be put
into it explicitly** — this is invariant 4 applied to links rather than exports, and
it has already been violated once: `rasterMode`, `ditherAlgorithm`, `toneConfig` and
`adjustConfig` were declared on the interface and read back on load, but
`currentFullState` never wrote them, so every link opened with the recipient's
defaults. Media was the accidental exception, since its raster mode, algorithm and
whole adjust config ride inside `mediaViewConfig`. `mediaColorConfig` was separately
gated on media mode despite synth and model both feeding it to the engine as
`colorConfig`.

**Two codecs.**

| version | parameter | encoding |
|---|---|---|
| v1 | `data=` | raw JSON, base64. Read only; never written now |
| v2 | `s=` | JSON → `deflate-raw` → base64url, payload stamped `v: 2` |

Separate parameter names rather than one with a version marker: the two forms cannot
be told apart from their contents, because a legacy base64 payload can begin with any
character, so any marker chosen is one a v1 link might already start with. base64url
(`+/` → `-_`, padding dropped) because `+` and `=` get percent-escaped or split by
the chat clients and mail readers these links travel through.

**Decoding happens before mount.** `DecompressionStream` has no synchronous form, and
`App` reads the decoded link from a `useMemo` that seeds twenty `useState`
initializers. `main.tsx` awaits `prepareShareFromUrl()` and renders after it settles;
`decodeShareFromUrl()` then answers from the cache. Without that call it still reads
v1 links, so a caller that forgets loses compressed links but nothing misbehaves
silently.

**Framing** (`view: { scale, cx, cy }`) is the scale plus the point at the centre of
the viewport **as a fraction of the raster**. A pixel offset is meaningless on
another screen — the same `tx` frames a completely different part of the image on a
3440px monitor and a 1280px laptop. Sampled when SHARE is pressed rather than held in
`currentFullState`, because the camera changes on every wheel notch and would
otherwise re-encode the payload throughout a pan. `AsciiViewport` applies it once via
`initialView`, riding the auto-fit effect's existing `skipNextAutoFitRef`.

### The single colour selector

Colour output is backed by two fields in two different stores:

| field | store | covers |
|---|---|---|
| `MediaColorConfig.paletteMode` | `renderSettingsByMode[mode]` | `phosphor` / `indexed` / `content` |
| `ImageAdjustConfig.tonalMapping` | `adjustConfig`, or `mediaViewConfig` in media | `1color` / `2color` / `3color` |

The engine treats them as one if/else chain, so they were always mutually exclusive —
but the UI used to expose them as two independent controls, which meant picking a
palette silently disabled tonal mapping and vice versa.
[`PaletteControls`](src/components/PaletteControls.tsx) now renders **one** dropdown
that derives its value from both and writes both:

```
'content'          → paletteMode='content', mode='content', tonalMapping='1color'
'palette:<id>'     → paletteMode='indexed', activePaletteId=<id>, tonalMapping='1color'
'1|2|3color'       → paletteMode='phosphor', tonalMapping=<value>
```

Selecting a palette or content also clears the phosphor tint, which would otherwise
re-colour a result that already carries its own colour.

The old hardcoded `gameboy` / `cyberpunk` / `amber` tonal presets were three-stop
ramps duplicating built-in palettes. They are gone; `LEGACY_TONAL_PRESET_PALETTES`
migrates persisted settings and shared links onto the equivalent palette.

### The two sidebar layouts

`uiThemeSettings.uiMode` picks between two arrangements of the *same* state. This
is the invariant that matters: BASIC and ADVANCED read and write identical
config objects, so switching never converts, resets or drops anything. A
control BASIC does not show is still live in the render and still set to
whatever ADVANCED left it at.

- **ADVANCED** ([`App.tsx`](src/App.tsx)) — the Content / Render tab tree
  documented below. Every source, every control.
- **BASIC** ([`BasicPanel.tsx`](src/components/BasicPanel.tsx)) — six numbered
  steps in a flat column: import → output → dither → adjust → colour → export.
  **No disclosures anywhere.** Every control is visible the moment the panel is;
  section rhythm comes from `.sidebar-workflow-title`, the same numbered header
  ADVANCED uses. Media only; entering it from synth or model switches the source,
  which is lossless because render settings are per-mode and the synth/model
  configs are separate state.

BASIC reaches its minimum by asking the shared controls for a reduced form,
not by reimplementing them: `MediaUploadControls minimal` (paste + dropzone,
no filename / URL / video timeline), `DitherAlgorithmPicker compact` (arrows,
dropdown, dice — no family filter, swatch grid or description card),
`VectorControls compact` (eight beam controls — no presets, Sample Step, Bias,
carrier deck, Ripple Freq, Phase, Glow or Aberration), preset chips instead of
the DPI slider, a charset `<select>` instead of `CharsetThemeBar`, and two plain
clip-point sliders instead of the histogram Levels editor. One implementation,
two levels of detail.

The compact beam deck is the one reduction that **writes** as well as hides:
`carrierEnabled` defaults to on, so hiding its deck alone would leave a BASIC
user with a dashed beam and no control that explains it. Compact switches it off
and touches nothing else — the three tuning values stay in the config, so
ADVANCED still has them when it comes back. That is a deliberate exception to
the hidden-not-reset rule below, and the only one.

Two couplings are load-bearing and easy to break:

1. **Output mode sits above the resolution chips.** `handleSelectRasterMode`
   re-derives the grid via `autoSetMediaResolution`, and `syncMediaDpiToGrid`
   then re-derives DPI from the column count. With DPI first, setting it and
   then picking ASCII/PIXEL silently discards the DPI.
2. **Quantize depth is hidden, not forced.** BASIC omits the control and expects
   Auto, but a share link serialises `colorLevels` and so does arriving from
   ADVANCED. `QuantizeDepthNotice` surfaces a non-Auto value with a reset rather
   than either hiding it silently or overwriting a deliberate setting.
3. **The resolution chips are per output mode, in range *and* in cell aspect.**
   `handleColsChange` derives rows from the columns, so it needs
   `cellAspectFor(rasterMode)` and a per-mode ceiling. It applied the monospace
   0.55 unconditionally for a while and vector rendered at 55% height from BASIC
   only — ADVANCED routes through `OptimizeControls`, which already took
   `isPixelMode={rasterMode !== 'ascii'}`. The 400-column ceiling compounded it,
   pinning every preset above 400 to one grid. See §5.7.

The histogram tap stays gated on `panel === 'render'` alone: BASIC's levels are
two numeric sliders with no histogram to feed, so waking the per-frame
histogram pass for it would be pure cost.

#### Tonal bands, and palettes as preset ramps

Both panels give **one control per ramp stop** for its colour and its share of
the tonal range, in the same place — BASIC as `ToneBandRows`, ADVANCED inside
the `N-Tone Ramp Editor`'s existing stop cards. Splitting them (stops under
COLORS, distribution nowhere) meant a ramp you could recolour but not
redistribute.

The slider is a **band width**, not an opacity and not a luminance push: it
widens the slice of the luminance range that maps to that stop, so dragging
shadows up genuinely resolves more of the image to the shadow colour. Stored as
`adjustConfig.toneStopWeights`, one positive number per stop, relative (only the
ratios matter). See §2.3.5 for how it is applied.

**A palette is a preset ramp**, so there is one library rather than two. The
ramp editor's own preset dropdown is gone; its 14 ramps live in
`BUILTIN_PALETTES` under a `ramp` category, alongside the hardware and print
palettes. Selecting one and pressing **Edit in Ramp Editor** copies its colours
into the stops. BASIC has the same operation as `EDIT AS RAMP`, worded for its
own layout.

The conversion is **always an explicit button**, never a side effect of moving a
control. In BASIC the bands are shown disabled while a palette is selected; in
ADVANCED the ramp editor stays live under a note saying the palette is winning,
because what is set there does apply the moment the palette comes off. That is a
real divergence between the panels, listed in §6.

That is not fussiness. The two are different render paths and `indexed` is
usually the better one:

- it error-diffuses in palette space against the palette's *real* luminances,
  where a ramp buckets evenly — §2.4 is the whole argument
- on a multi-hue palette with a chromatic source it matches in CIELAB, choosing
  colours **by hue**, where luminance position plays no part at all

That second case is why band weights and palettes cannot be combined even in
principle: with hue matching there is no band to widen. The engine already
refuses to apply weights to any active palette (`!activePalette` guards the
warp), so the render was never wrong — but sliders that silently do nothing, and
a drag that silently discards hue matching, were. Hence the explicit conversion
button in both panels.

`isHueMatched` in BASIC errs toward reporting hue matching whenever the palette
*could* do it, since source chromaticity is sampled inside the engine and is not
visible to the UI. Claiming "tone-matched" and then hue-matching would be the
worse way to be wrong.

Grading rows are declared once in `ADJUST_SLIDERS`
([`ImageAdjustControls.tsx`](src/components/ImageAdjustControls.tsx)) and rendered
through `AdjustSlider`. The two layouts group those rows differently, so a single
declaration is what stops their ranges from drifting apart.

### Render tab hierarchy & control architecture

The **Render** tab follows a strict vertical workflow across all three input sources:

1. **Output Mode Command Selector** ([`App.tsx`](src/App.tsx))
   - Permanent 3-card tactical grid at the top: `ASCII` (`TEXT`), `PIXEL` (`DITHER`), `VECTOR` (`BEAM`).
   - Switches `rasterMode` universally. In media mode, switching mode triggers `autoSetMediaResolution` to adapt the virtual canvas aspect ratio between monospace (`~0.6015`) and square (`1.0`) — and, for vector, to resize the grid to the beam sampling width (800 columns).
   - In VECTOR the Dither Algorithm Picker below is replaced by [`VectorControls`](src/components/VectorControls.tsx), and Quantize Depth and the charset ramp are hidden. All three are **hidden, not reset**: the state stays put and switching back restores it, the same invariant BASIC and ADVANCED hold (§4).

2. **Resolution & DPI Optimizer** ([`OptimizeControls.tsx`](src/components/OptimizeControls.tsx))
   - Placed directly under the Output Mode selector.
   - Houses grid dimensions (`Cols × Rows`), Auto-Resolution toggle, Aspect Ratio lock, and print DPI scaling (`72`–`1200` DPI).
   - Cell aspect follows the output mode, not the panel — see §5.7.

3. **RENDER SETTINGS** ([`MediaViewControls.tsx`](src/components/MediaViewControls.tsx))
   - **Resampling sits first, behind a rule** (`.render-settings-source`). It is the only control in the section acting on the *source* rather than on the render — it picks the filter the browser downsamples with on the way into the grid (§1.2) — and it applies in every output mode. Sitting last, under a dither picker or the beam deck, made it read as one of their parameters.
   - Below the rule, **exactly one** of the two decks, chosen by `rasterMode`. Hidden, not disabled: the other deck’s state stays put.
   - **Every numeric field in the section reaches past its slider.** `PrecisionSlider` takes a track range and a wider `hardMin`/`hardMax`; the track spans what is worth dragging through and the field accepts the extremes, with the track growing to reach a typed value so it stays draggable. The engine has to honour the same hard range or the field accepts a value and the render snaps it back — see §2.3.5.

   **Dither Algorithm Picker** ([`DitherAlgorithmPicker.tsx`](src/components/DitherAlgorithmPicker.tsx)) — ASCII and pixel
   - Universal across all three sources (`synth`, `media`, `model`).
   - Rapid-cycle `<` and `>` stepper buttons for live auditioning of all 44 algorithms with wrap-around and counter telemetry (`[X / 44]`).
   - 1-click hero presets (`THRESHOLD`, `FLOYD-STEINBERG`, `ATKINSON`, `BAYER 4×4`, `BAYER 8×8`, `BLUE NOISE`, `HALFTONE`, `KNUTH DOT`, `HILBERT`).
   - Categorized `<optgroup>` select covering all 5 families, and an **Algorithm Tuning** deck whose rows come from `getDitherParamIds` — derived from the implementation, so a row never appears for a parameter the algorithm ignores.

   **Beam deflection** ([`VectorControls.tsx`](src/components/VectorControls.tsx)) — vector
   - Renders as a bare fragment, not a nested deck: it *is* the whole content of the section in vector mode, so a bordered panel with its own title and reset repeated the heading above it.
   - Five presets, a scan-axis toggle, geometry (lines, sample step, smoothing, deflection, bias, cutoff), occlusion, then three tuning decks — carrier modulation, analog ripple, beam optics.
   - BASIC takes `compact` and keeps eight of these; see §4.

4. **Tonal Controls & Grading** ([`ImageAdjustControls.tsx`](src/components/ImageAdjustControls.tsx))
   - **Color & Tonal Palette**: Single color mode dropdown (`1color`, `2color`, `3color`, `content`, or indexed `palette:<id>`). When in Pixel mode, CRT phosphor theme buttons are hidden to keep the interface neutral white.
   - **Quantize Levels**: Logarithmic warp slider ($2^1$ to $2^8$) giving smooth fine control across $2\dots 16$ levels, 1-click bit-depth pills (`[AUTO]`, `[2 (1b)]`, `[4 (2b)]`... `[256 (8b)]`), fine steppers (`-`/`+`), and direct numeric entry.
   - **Exposure & Contrast**: Brightness and contrast, at the *top* of the group because the engine applies them first. Moved here from EFFECT CONTROLS, where sitting visually last while running third let them silently undo the levels black point. See §2.3.
   - **Tone Curve Spline**: Monotone cubic spline editor with 5 instant presets (`LINEAR`, `S-CURVE`, `LIFT`, `CONTRAST`, `INVERT`) and live `IN: x • OUT: y` telemetry.
   - **Levels & Auto Range**: Square-root-scaled histogram of the luminance entering the levels stage, with draggable black / midtone / white handles and an `AUTO LEVELS` button. Placed *after* the curve, and after exposure, because that is the engine's order — the whole group reads top to bottom in pipeline order. Writes `toneConfig`, not `adjustConfig`. See §2.3.
   - **Tonal Balance**: Highlights, Midtones, and Shadows sliders with double-click quick-zero.

5. **Character Set Ramp** ([`CharsetThemeBar.tsx`](src/components/CharsetThemeBar.tsx))
   - Monospace density ramps: active in ASCII, dimmed in pixel, omitted entirely in vector — a beam has no glyphs.

---

## 4.5 Driving the render

Three sources, two scheduling regimes.

**Synth, model and video** run a `requestAnimationFrame` loop in `App.tsx` with
an FPS limiter (`optimizeConfig.targetFps`), an idle throttle that drops to 12fps
after 4s without interaction, and a pause when the tab is hidden.

**A static image has no loop** — it re-renders reactively from React state, which
is the right shape (nothing to animate) but was unthrottled. The rasterization
ran *synchronously inside the effect*, so a slider drag fired one full re-raster
per pointer event with nothing coalescing them. On a large source each costs far
more than a frame, the queue never drains, and the tab stalls until the drag
ends.

It is now **preview-then-refine**, because throttling alone does not fix this.
Rasterizing is superlinear in cell count, so on a large grid a single full pass
costs many frames — pacing it only makes a drag stale instead of stuck.

- while changes keep arriving, render **a fraction of the grid** and expand the
  result back to full size (`framePreview.ts`). Roughly `divisor²` cheaper,
  visibly chunky, but live.
- `EDIT_SETTLE_MS` (220ms) after the last change, one **full-resolution pass**
  replaces it.
- every effect re-run cancels both pending passes, so a burst of slider events
  collapses rather than queues.

The divisor comes from what the last *full* render actually cost
(`choosePreviewDivisor`: 4 above 120ms, 3 above 45ms, 2 above 18ms, otherwise
1). Self-measuring rather than fixed, because the right answer differs by two
orders of magnitude between a thumbnail and a 24MP photo — and at divisor 1 the
preview path switches off entirely, so small images never pay for chunkiness
they do not need. Preview passes deliberately do not update the measured cost,
so the estimate stays anchored to real full-frame work.

**Why expand instead of handing the viewport a smaller frame.** `AsciiViewport`
lays out from its `cols`/`rows` props, not from the frame it is given, and those
values feed culling, hit-testing, auto-fit and the pixel-mode `ImageData`. A
frame whose dimensions disagreed would mis-index the colour buffer and draw
garbage. Expanding keeps the contract intact and confines the whole change to
the render path.

The expansion is a straight copy — no dither, filters or colour matching — and
reuses each source row across the output rows that map to it (a `copyWithin`
for the colour buffer, one cached string for the text). That took a
533×400 → 1600×1200 expansion from 39ms to 14ms; building every row
independently had made the expansion a real fraction of the pass it replaces.

**Editing state is inferred, not tracked.** If the previous render finished
within `EDIT_BURST_MS` (500ms), the next change is treated as part of the same
gesture. Nothing needs to know about pointers or which control moved. The window
is generous on purpose: a slow grid renders a few times a second, and a tighter
one would classify mid-drag as idle and go back to full passes — the stall this
exists to avoid.

**It can be switched off.** Viewfinder Settings -> Performance -> *Draft
Preview While Editing*. The setting lives on `UiThemeSettings`
(`lowResPreview`, localStorage, default on) rather than on `OptimizeConfig`,
because it describes the machine rather than the artwork: `OptimizeConfig` is
per-mode and rides along inside presets and shared links, and one person's need
for a coarse preview should not follow their work onto someone else's screen.
It is the only row in that section that acts on static images, which is why it
is the one row not dimmed when a static image is loaded. Note the whitelist in
the `uiThemeSettings` state initializer: a field not named there is silently
dropped on reload.

**Grid ceiling.** DPI multiplies source width by a percentage and had no bound
of its own, so a 4000px photo at 200 DPI asked for 8000×6000 — 48M cells, which
is not slow but unresponsive. Both DPI controls now route through
`clampGridToBudget` (`MAX_GRID_COLS = 2048`, matching the ceiling
`autoSetMediaResolution` already applied). Typed cols/rows stay uncapped:
someone entering 4000 in a number field means it, and may be setting up an
export.

### 4.6 Where a media frame's time actually goes

Measured in Chromium, `devicePixelRatio` 1, medians over 15–40 iterations after
a warm-up. Worth reading before optimising anything in this file, because the
intuitive answer is wrong.

| stage | 40k cells (auto-res) | 2.6M cells (DPI ceiling) |
|---|---|---|
| `drawImage` + `getImageData` ([`mediaRenderer.ts`](src/engine/mediaRenderer.ts)) | **~0.2 ms** | ~1 ms |
| `processRasterFrame` | 3–7 ms | 100–550 ms |
| viewport paint, coloured ASCII | ~7 ms | — |

**The readback is not the bottleneck. It is a rounding error.** Chromium scales
a decoded `HTMLImageElement` on a fast path: drawing a 3840×2160 `<img>` down to
250×160 costs **0.18 ms**, and it stays 0.18 ms with the offset and scale jittered
every iteration, so it is not a cached-scaled-bitmap artefact. `getImageData` at
that size is ~0.01 ms.

**The source *type* matters far more than its size.** Identical pixels, identical
destination:

| source | cost |
|---|---|
| `HTMLImageElement`, 3840×2160 | 0.18 ms |
| `ImageBitmap`, 3840×2160 | 1.18 ms |
| `HTMLCanvasElement`, 3840×2160 | **14.4 ms** |
| `HTMLCanvasElement`, 500×320 | 1.83 ms |

A live canvas may have pending draws, so it cannot be cached the way a decoded
image can, and every `drawImage` re-reads it. Since every load path in `App.tsx`
— file, paste, drag-drop, remote URL, shared link — builds a `new Image()`, the
app is always on the 0.18 ms path.

#### Two optimisations that were tried and reverted

Both were designed against a benchmark that used a **canvas** source, and both
evaporated or inverted once measured against the `<img>` the app actually uses.
Recorded here so the next person does not rediscover them.

**A downscaled "source proxy."** Build a small canvas once from the original and
draw every frame from it. Against a canvas source this looks like a 22.6 ms →
2.8 ms win. In reality it replaces a 0.18 ms `<img>` draw with a 1.83 ms *canvas*
draw — **~10× slower**, because the proxy is itself the slow source type. The
size arithmetic was sound (demand taken from `drawW`/`drawH` so fit, scale and
`fit: 'original'` fall out correctly; one shared scale factor to preserve aspect;
√2 headroom when rotated) and none of it mattered. There is no version of this
that helps an `<img>`.

**A framing-keyed RGBA cache.** The dependency analysis is correct and worth
keeping in mind: the downsampled RGBA depends only on the element, `cols`,
`rows`, `rasterMode`, `background`, `resampling` and the seven framing fields
(`fit`, `scale`, `offsetX/Y`, `rotation`, `flipX/Y`) — *not* on `toneConfig`,
`colorConfig`, the algorithm, or any field of `toPipelineAdjustments`. So a tone
drag genuinely does re-derive a bit-identical buffer. Caching it was verified
byte-identical on hit, with every invalidating input correctly detected. It is
still not worth it:

| grid | saved | share of frame |
|---|---|---|
| 250×160 (40k) | −0.6 ms | net negative, within noise |
| 800×500 (400k) | 0.9 ms | 3.3% |
| 1600×1000 (1.6M) | 7.7 ms | 7.1% |

At the default grid it pays nothing; at large grids it pays 3–7% of a frame that
is 100 ms+ and dominated by `processRasterFrame` regardless. That bought roughly
180 lines of module state and key-building, plus a retained buffer of
`cols × rows × 4` bytes (6 MB at 1.6M cells) and a staleness surface for any
future canvas or video source. Reverted.

**What this implies for the real bottlenecks.** The grid, not the source, is what
costs — so the preview-then-refine machinery in §4.5 is aimed correctly, and
`processRasterFrame` at high DPI is the workload that would actually justify
moving rendering into a worker. Every module the pipeline touches
(`rasterEngine`, `ditherAlgorithms`, `palettes`, `autoLevels`, `math`,
`separation`) is already free of `document` and `window`, so it would port
unmodified; measured round-trip overhead for a transferred frame at 40k cells is
~0 ms of main-thread blocking and ~1.7 ms of added latency, which is a good trade
against a 100 ms frame and a bad one against a 3 ms frame. The other measured
cost, the ~7 ms coloured-ASCII paint, is 58% `fillStyle` churn — see the note in
§3.1.

## 5. Invariants

Things that will silently break rendering if violated.

1. **`lumBuffer[i] < 0` means transparent, everywhere.** Any loop that treats it as a
   number instead of a sentinel produces holes or black speckle. Dithering must clamp
   opaque cells back into `[0,1]` afterwards.
2. **In pixel mode a space means transparent and nothing else.** The viewport's
   `ch !== ' '` guard depends on it.
3. **`srcLumBuffer` is the only pre-filter record.** The grade ratio and the sentinel
   restore both read it. It must be snapshotted before step 2 and never written
   afterwards.
4. **Every path out must forward all four render settings** — `rasterMode`,
   `ditherAlgorithm`, `toneConfig`, `adjustConfig`. Missing one produces an export,
   or a shared link, that differs from what the user sees. This is why the still and
   separation exports share `renderExportFrame` rather than each dispatching to the
   mode renderers themselves, and why the share payload is checked field by field.
5. **`ProcessedRasterResult.luminance` and `.histogram` are live module buffers, not
   copies.** Read them before the next frame, or copy them to hold on.
6. **Quantization depth must track real output depth.** Dithering at 256 levels is
   invisible by construction; dithering a photo at charset depth turns flat areas
   into texture.
7. **Cell aspect is applied at the source, not at paint time** — `0.6015` for
   ASCII, `1.0` for pixel **and vector**. The test is always "are the cells
   square?", which is `!== 'ascii'`, never `=== 'pixel'`. Every site that derives
   rows from columns has to ask it: `autoSetMediaResolution`, `OptimizeControls`,
   `mediaRenderer`, and `BasicPanel.handleColsChange`. The last of those is the one
   that got missed, because it had no mode test to widen — it applied the
   monospace figure unconditionally, so a search for branches never surfaced it.
   Widening a union finds the code that branches on it, not the code that assumed
   the old value so completely it never branched.
8. **Media grading has exactly one home** (`mediaViewConfig`). A second `adjustConfig`
   field on the media context will shadow it with neutral defaults. Levels is the
   documented exception and lives in `toneConfig` for every mode; see §4.
9. **A separation's plates partition the opaque cells exactly.** Every opaque cell in
   exactly one plate, no plate empty, no transparent cell included. Anything else and
   the plates no longer reassemble into the image, which is the only thing they are
   for.

---

## 6. Known gaps

- Only the **error-diffusion** family gets palette-space quantization. Ordered,
  blue-noise, algorithmic and modulation masks still quantize in tone space and then
  index the ramp, so they retain the uneven-spacing artefact described in §2.4. The
  correct treatment for ordered masks is a threshold perturbation before palette
  matching, which needs the mask value exposed from `applyDitherAlgorithm`.
- `2color` / `3color` ignore Quantize Levels in effect — the hard threshold pins the
  output to 2 or 3 colours regardless. The setting still shifts the dither pattern,
  so it is not inert, just weak.
- `three` is imported eagerly (~566 kB, ~142 kB gzipped) for all users including
  those who never open model mode.
- `App.tsx` is ~3000 lines and owns all orchestration.
- ADVANCED still groups levels and the tone curve under `TONAL CONTROLS` while
  brightness/contrast/invert sit under `EFFECT CONTROLS`, which cuts across the
  engine's own split (§2 steps 2–4: spatial filters, then tone, then colour).
  BASIC uses the engine's line instead — ADJUST for everything shaping the
  greyscale, COLOR for what it comes out as. Regrouping ADVANCED to match would
  churn the `persistKey`s holding each section's collapsed state, so it was left
  for its own pass.
- BASIC drops the midtone handle from Levels because the tonal bands already
  expose Midtones, and two gamma pivots a section apart is confusing. They are
  not the same control though — levels midtones is a pivot between the clip
  points, `adjustConfig.midtones` a `pow` on the whole range — so the reduction
  is a simplification, not an equivalence.
- Band weights assume `ditherLevels === numStops` (the auto case). An explicit
  Quantize Levels detunes the proportionality — the warp stays monotone and the
  sliders still read as more/less, but the shares stop tracking the numbers.
- BASIC caps the ramp at `BASIC_MAX_TONE_STOPS` (8) where the engine and
  ADVANCED allow 256. A layout limit, not an engine one: each stop is a full row
  there. A longer ramp arriving from a preset, a shared link or an ADVANCED
  session renders in full and steps down one at a time; only `+` stops.
- ADVANCED shows the ramp editor whenever the mapping is past `1color`, even
  with an indexed palette selected — the palette wins in the engine and the ramp
  is skipped. A note says so, but the stops and sliders stay live rather than
  being disabled, because what is set there does apply the moment the palette
  comes off. BASIC handles the same situation differently (disabled bands plus
  an explicit `EDIT AS RAMP`), which is a real divergence between the panels.
- `resolveToneStops` must be given `paletteColors` to show a palette's colours,
  because `customToneColors` is never empty — `DEFAULT_IMAGE_ADJUST_CONFIG`
  seeds it with three greens. Checking the config first is why the bands
  originally ignored the selected palette entirely.
- **`content` colour cannot be separated** without quantizing first — it is
  continuous, so it blows past the 64-plate cap. Quantize Levels or an indexed
  palette is the workaround; automatic k-means clustering down to N inks would be the
  fix.
- Halftone *geometry* (dot/diamond/square screens, SVG dot output) was removed with
  the dead output modes and has not returned; §3.4 covers ink separation but not
  screening. Recoverable from git history:
  `git show <sha>:src/engine/halftoneRenderer.ts`.
- The share link has no route for locally-uploaded media or models. They exist only
  in browser memory, and `ShareModal` says so rather than producing a link that
  cannot work.
- SVG rectangle merging degrades to roughly one rectangle per cell on a true
  checkerboard, where no two neighbours share a fill. Node count still collapses to
  one path per colour, so editors cope, but the file stays large (~2.3 MB at
  $500 \times 400$). Real images do not hit this; a heavy high-frequency dither
  approaches it. A proper fix would be per-colour marching-squares outlining rather
  than a rectangle mesh.
- Whether `shape-rendering="crispEdges"` fully removes the seams between abutting
  subpaths **in Figma specifically** has not been confirmed by import. The geometry
  is verified exact (cells reconstruct cell-for-cell); the rendering is not.
