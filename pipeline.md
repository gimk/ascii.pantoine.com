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

Order is fixed: **blur/denoise → sharpen → edges**.

- **Blur + denoise** are summed into one radius (`radius = round(total / 2)`, capped
  at 10) and run through a separable box blur. The blur is alpha-aware: it averages
  only over cells with `val >= 0`, so a silhouette does not bleed into transparency.
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

One pass, per cell, in this exact order:

1. **Tone curve** — monotone cubic spline through `curvePoints`, baked to a 256-entry
   LUT once per frame
2. **Levels** — black/white clip plus a gamma derived from the midtone position
   (`toneConfig.levelsBlack / levelsMidtones / levelsWhite`)
3. **Contrast / brightness** — `(v - 0.5)·tan((c+100)·π/400) + 0.5 + b`
4. **Shadows / highlights** — split at 0.5, each half pushed independently
5. **Midtones** — `pow(v, 2^(-m/50))`
6. **Noise** — uniform, amplitude `noise/200`
7. **Posterize** — `2^bits - 1` steps, when `posterizeBits` is set
8. **Invert**

> **State:** `lumBuffer` = fully graded luminance. This is the last step that sees
> continuous tone in the general case.

#### The histogram tap

A short dedicated pass runs **between step 1 and step 2 of the list above** — after
the tone curve, before levels — filling a 256-bin `histogramBuffer` and counting
opaque cells into `histogramOpaque`. Both ride out on `ProcessedRasterResult` as live
module buffers, the same contract as `luminance`.

That position is the whole point. **AUTO LEVELS is idempotent because nothing
downstream of the tap feeds back upstream of it**, so the reading does not move when
the levels it produced are applied, and pressing the button twice is a no-op.
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

`ImageAdjustControls` renders Levels **after** the tone curve, matching the engine
order, so the histogram under the handles is the tone the handles operate on.

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

Two mutually exclusive paths, chosen by `isColoredView` (`result.isColored`):

**Mono → DOM.** `text` is written to a `<pre>`, CSS-scaled by zoom. Colour comes from
CSS custom properties, which is what makes phosphor tints, gradients, glow, bloom,
scanlines and vignette possible. An optional second `<pre>` sits underneath as a
blurred bloom layer.

**Coloured → canvas.** `drawCanvas` has two branches:

*ASCII:* backing store `unscaledW × zoom × dpr`, `ctx.scale(zoom·dpr)`, then
`fillText` per cell at `MONOSPACE_CELL_WIDTH × MONOSPACE_CELL_HEIGHT`
(`6.015 × 10.0`). Spaces are skipped.

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
`rasterMode`, `ditherAlgorithm`, `toneConfig` and `adjustConfig` must all be
forwarded — an export path that skips one silently produces a different image than
the viewport.

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
Same forwarding requirement as stills (`rasterMode`, `ditherAlgorithm`, `toneConfig`, `adjustConfig`).

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

### Render tab hierarchy & control architecture

The **Render** tab follows a strict vertical workflow across all three input sources:

1. **Output Mode Command Selector** ([`App.tsx`](src/App.tsx))
   - Permanent 2-card tactical grid at the top: `ASCII` (`TEXT`) vs `PIXEL` (`DITHER`).
   - Switches `rasterMode` universally. In media mode, switching mode triggers `autoSetMediaResolution` to adapt the virtual canvas aspect ratio between monospace (`~0.6015`) and square (`1.0`).

2. **Resolution & DPI Optimizer** ([`OptimizeControls.tsx`](src/components/OptimizeControls.tsx))
   - Placed directly under the Output Mode selector.
   - Houses grid dimensions (`Cols × Rows`), Auto-Resolution toggle, Aspect Ratio lock, and print DPI scaling (`72`–`1200` DPI).

3. **Dither Algorithm Picker** ([`DitherAlgorithmPicker.tsx`](src/components/DitherAlgorithmPicker.tsx))
   - Universal across all three modes (`synth`, `media`, `model`).
   - Rapid-cycle `<` and `>` stepper buttons for live auditioning of all 44 algorithms with wrap-around and counter telemetry (`[X / 44]`).
   - 1-click hero presets (`THRESHOLD`, `FLOYD-STEINBERG`, `ATKINSON`, `BAYER 4×4`, `BAYER 8×8`, `BLUE NOISE`, `HALFTONE`, `KNUTH DOT`, `HILBERT`).
   - Categorized `<optgroup>` select covering all 5 families.

4. **Tonal Controls & Grading** ([`ImageAdjustControls.tsx`](src/components/ImageAdjustControls.tsx))
   - **Color & Tonal Palette**: Single color mode dropdown (`1color`, `2color`, `3color`, `content`, or indexed `palette:<id>`). When in Pixel mode, CRT phosphor theme buttons are hidden to keep the interface neutral white.
   - **Quantize Levels**: Logarithmic warp slider ($2^1$ to $2^8$) giving smooth fine control across $2\dots 16$ levels, 1-click bit-depth pills (`[AUTO]`, `[2 (1b)]`, `[4 (2b)]`... `[256 (8b)]`), fine steppers (`-`/`+`), and direct numeric entry.
   - **Tone Curve Spline**: Monotone cubic spline editor with 5 instant presets (`LINEAR`, `S-CURVE`, `LIFT`, `CONTRAST`, `INVERT`) and live `IN: x • OUT: y` telemetry.
   - **Levels & Auto Range**: Square-root-scaled histogram of the luminance entering the levels stage, with draggable black / midtone / white handles and an `AUTO LEVELS` button. Placed *after* the curve because that is the engine's order. Writes `toneConfig`, not `adjustConfig`. See §2.3.
   - **Tonal Balance**: Highlights, Midtones, and Shadows sliders with double-click quick-zero.

5. **Character Set Ramp** ([`CharsetThemeBar.tsx`](src/components/CharsetThemeBar.tsx))
   - Monospace density ramps (active in ASCII mode, dimmed in Pixel mode).

---

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
7. **Cell aspect is applied at the source, not at paint time** — `1.0` for pixel,
   `0.6015` for ASCII.
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
