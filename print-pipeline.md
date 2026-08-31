# Print Pipeline

How a frame becomes a set of printing plates, screened and overprinted on paper.

The fourth output mode, and the second one to fork out of the shared pipeline. Read
[`pipeline.md`](pipeline.md) first — this document only covers what print adds, and it
assumes the six stages and the ten invariants.

```
                       ┌─ 3.5 quantize ─ 4 colour ─ 5 glyphs ──► text + colors   (ascii | pixel)
                       │
  steps 1–3 ──lumBuffer┼─ traceVectorField ─────────────────────► VectorFrame     (vector)
    channel mix        │
    filters            └─ separatePrint ─► screenPlates ────────► PrintFrame      (print)
    tone / curve / levels     coverage        binary dots
                              per ink         per ink
```

---

## 1. Why this cannot be a dither algorithm

The obvious place to put a halftone is the dither registry — there are already 44 entries
there, one of them called `halftone-dot`. That entry is real and useful and it is not a
press. The reason is structural, and it is the same shape of argument
[`vector-pipeline.md`](vector-pipeline.md) makes about the beam.

**A dither picks one colour per cell. A press lays down every ink at once.**

Every cell mode in this codebase resolves colour by *choosing*: step 4 picks a palette
entry, a ramp stop, or the source RGB, and step 5 paints it. The existing colour
separation (`pipeline.md` §3.4) then partitions those cells by colour, one ink each, and
the partition is what makes the plates reassemble — invariant 9.

Printing is the opposite operation. Each ink carries its own *continuous coverage* of
the whole image, each is screened independently, and the plates **overlap**. Colour
comes from which inks happen to overprint at a point and from the eye averaging dots
too small to resolve. There is no "the colour of this cell" anywhere in the process.

Three consequences, each of which rules out the dither path on its own:

- **Coverage is per-ink and continuous**, so a frame needs *N* tone fields, not one.
  `lumBuffer` is one field and every dither algorithm reads and writes exactly it.
- **Dots need pixels.** A halftone dot wants ~8 device pixels across before it reads as
  a dot rather than as a cluster of squares. A cell mode has one output pixel per cell
  by construction, so a "dot" would be a single pixel — which is a dither, precisely.
- **Screen angle is not mask rotation.** `DitherParams.angle` rotates a tiled 8×8
  matrix. A press screen is a continuous lattice at an arbitrary angle, arbitrary pitch
  and a sub-cell phase, and the interference between several of them is the whole
  subject (§4).

`pipeline.md` §6 had recorded this as a known gap since the old halftone renderer was
removed: *"§3.4 covers ink separation but not screening."* This is the screening.

---

## 2. What the machines actually do

The facts the engine is answerable to. Sources at the bottom; every number below either
comes from one of them or from a measurement recorded in §8.

### 2.1 Offset, newsprint, screenprint — AM halftone

Each ink gets a plate carrying a clustered-dot screen. **Tone is dot *area*, not dot
density**: the lattice pitch is fixed by the screen ruling and the dot grows inside its
cell. 50% grey is a 50%-covered lattice at the same pitch as 10% grey.

Screens are rotated **30° apart**, and that figure is not a convention someone picked.
A square lattice repeats every 90°, so three screens can be at most 90/3 = 30° apart —
and that maximum is exactly what turns the unavoidable interference into a **rosette**,
the stable, least visible form of moiré, rather than a visible beat. Conventionally
cyan 15°, magenta 75°, black 45°. Yellow takes the orphaned 0°/90° because there is
nowhere else to put it; yellow's 15° separation from cyan and magenta produces the most
visible moiré on a real sheet and is simply the accepted compromise, chosen for yellow
because a light ink's beat is the least noticeable.

Real RIPs cannot hit 15° exactly: its tangent is irrational, and moiré appears with
deviations as small as 0.01°. They use rational-tangent approximations (tan = 3/11 →
15.26°) or supercells. **We use continuous float angles, which is *more* accurate than
a real RIP** — see §7 for why snapping to rational tangents is a deliberate omission
rather than an oversight.

Dots also grow on press. **Dot gain** (tone value increase) is physical spread at the
dot's perimeter: it peaks near midtone and vanishes at both ends, because paper with no
ink cannot spread and a solid has no perimeter left to spread into. On top of that,
**optical** gain — light entering the paper beside a dot, scattering sideways, and
being absorbed under it — makes a halftone read darker than its ink area. That is what
the Yule–Nielsen *n* exponent models.

### 2.2 Risograph

A thermal head burns a stencil (a *master*) per colour; the master wraps an ink drum
and soy ink is pushed through it. **One colour per pass** — the drum is swapped and the
paper fed through again.

Four things follow, and all four are why riso is worth simulating rather than filtering:

- **The inks are semi-transparent**, so overprinting genuinely mixes them rather than
  covering. Two inks give four colours; three give eight.
- **The paper shows through** and is part of the result. The same ink on cream and on
  white are different colours.
- **Many riso pigments are outside CMYK gamut** — fluorescent pink, sun yellow,
  fluorescent green. A separation that assumes a CMY basis cannot use them.
- **Misregistration between passes is normal.** The sheet is physically re-gripped for
  every colour, so the layers land slightly differently. This is the look, not a defect.

Rulings are coarse: 71 lpi is the driver default and much above 120 the master cannot
hold the dot and the print fills in. Riso masters are often screened FM
(error-diffused) rather than AM.

### 2.3 One machine

Both are the same process: *N arbitrary spot inks → per-ink coverage → per-ink screen →
overprint on a coloured substrate.* Offset and riso differ in ruling, angles, screen
family, ink solidity and how much dirt is switched on — all of which are **data**.

That is why there is one `print` mode with press profiles rather than a HALFTONE mode
and a RISO mode. Two render types would have duplicated the separation, the screening,
the plate stack and four export paths in order to express a difference that fits in
`PRESS_PROFILES`.

---

## 3. Two resolutions, which is the whole trick

A RIP holds continuous tone at a few hundred pixels per inch and screens at a few
thousand dots per inch. Same split here, and it is what lets the existing pipeline stay
completely untouched:

| | what it is | typical |
|---|---|---|
| **contone grid** | `cols × rows`. Coverage lives here. Every stage in `pipeline.md` runs over it, unchanged. | 420 × 315 |
| **device raster** | `cols·S × rows·S`, `S` = supersample. Dots live here. | 3360 × 2520 at `S`=8 |

Steps 1–3 therefore cost exactly what they cost in any other mode. Only the two new
passes see the big raster.

**`ruling` is stored as halftone cells across the image *width*, not as LPI.** This is
the single most load-bearing decision in the mode, and it earns its keep four times:

- the dot keeps its size when the contone grid changes
- and when a crop re-solves the grid (`pipeline.md` §4.4)
- and when the same link is opened on a different machine
- and — the important one — **across the three render tiers**, which differ only in
  device pixels per contone cell. Changing tier therefore moves no dot; it only
  resolves the dot's edge more finely. That is what makes the escalation in §6 usable
  rather than disorienting.

The UI shows the derived LPI beside it (`rulingToLpi`), because a printer thinks in LPI
and needs a physical size to think about.

### The composite is never materialised

`PrintFrame` holds a **one-byte-per-device-pixel bitmask** — bit `i` means ink `i` was
deposited — and no RGB buffer. `MAX_INKS = 8` makes that exact rather than a
compromise. At the default grid that is ~4 MB instead of ~16 MB, and it has a second
payoff that matters more than the memory:

**There are only 256 possible stacks of ink at a pixel, however large the raster.** So
`resolvePrintFrame` composites all 256 once into a table and the inner loop becomes a
single table read — no per-pixel `pow`, no loop over inks, and the Yule–Nielsen
exponent folded in for free. It also makes opaque inks *exact* rather than approximate:
an opaque ink is order-dependent, and each of the 256 entries is built by walking the
stack in print order, so ordering is honoured without costing the hot loop a branch.

The composite exists in exactly one function, which the viewport and every export path
call. Screen and file cannot disagree about what the paper looks like.

---

## 4. The three stages

### 4.1 Separation — [`printInks.ts`](src/engine/printInks.ts)

**Why this is a linear least-squares problem, and therefore cheap.**

Translucent ink films multiply transmittance, so *N* inks at coverages $a_i$ over a
substrate of reflectance $P$ give

$$R = P \prod_i T_i^{\,o_i a_i}$$

Take negative logs and the product becomes a sum:

$$-\log R = -\log P + \sum_i a_i \,(o_i D_i), \qquad D_i = -\log T_i$$

which is **linear in the coverages**. Separating a colour is therefore

$$\min_a \lVert A a - b\rVert^2 \quad\text{s.t.}\quad 0 \le a_i \le 1,\ \ \textstyle\sum_i a_i \le \text{TAC}$$

with $A$ the 3×N matrix of per-ink density vectors and $b$ the target density above
paper. Solved by exact box-constrained cyclic coordinate descent, sixteen sweeps. *N* is
at most 8, so the system is tiny.

Four things this buys that channel extraction does not, and they are the reason the
approach was chosen:

- **Black generation is automatic.** With a black ink in the set the solve reaches for
  it on neutrals, because one ink fits a neutral density better than three chromatic
  ones. Grey component replacement falls out of the arithmetic instead of being a
  stage. Measured: a neutral grey separates to K 0.458 / C 0.014 / M 0.012 / Y 0.011.
- **Out-of-gamut inks just work.** Fluorescent pink is another density vector. Nothing
  anywhere assumes a CMY basis. Measured: asking for `#ff48b0` on a pink/blue riso
  stack gives pink 0.987, blue 0.000.
- **Paper is a term, not a backdrop.** Measured: `rgb(180,200,220)` separates to
  0.091/0.069 on white and 0.000/0.022 on kraft — the same colour, different plates.
- **The round trip is verifiable.** Separate, then recomposite through
  `compositeCoverage`, and compare. Measured worst case over ten probes on process
  CMYK: **ΔE76 = 5.5**.

**Work in linear light.** The graded source RGB and every ink and paper hex go through
the real sRGB transfer, not `/255`. This is not pedantry — it is the single largest
source of the muddy, plasticky look that digital "halftone" filters have. In gamma
space the overprints come out far too dark and the midtones collapse.

**Do not solve per pixel.** A contone grid is ~130k cells and the solve is iterative.
Instead a **33³ RGB → N-coverage table** is built once per `(inks, paper, TAC)` change
and trilinear-interpolated per cell — exactly how a RIP carries a separation, and the
same trick `createToneCurveLUT` and the dither mask cache already use. The table is
indexed in *gamma-encoded* sRGB so its nodes spread roughly perceptually; a
linear-spaced grid puts most of its nodes in the highlights, where the answer barely
moves.

One table is cached, not a map: the ink stack changes as a unit and there is one stack
being edited, so a second entry would only ever hold the state just left.

**TAC as a penalty row, not a clip.** Scaling an over-limit solution down
proportionally desaturates it and lifts every shadow. Appending a row $\lambda\mathbf{1}$
with target $\lambda\cdot\text{TAC}$ lets the solve *redistribute* instead — trading
three chromatic inks for one black wherever that costs less total area, which is grey
component replacement arriving for the second time out of the same arithmetic.

### 4.2 Screening — [`printEngine.ts`](src/engine/printEngine.ts)

Per device pixel, per enabled plate:

1. **Registration** — map device → plate space: subtract `(regX·S, regY·S)`, rotate by
   `−regAngle` about the raster centre.
2. **Coverage** — bilinear sample of the plate's coverage plane at `(px/S, py/S)`.
   Bilinear, not nearest: nearest makes dot size step in visible blocks.
3. **Transfer** — ink limits, then dot gain `a' = clamp(a + gain·sin(π·a), 0, 1)`.
4. **Screen threshold** — with `T = width / ruling` device pixels per cell,
   ```
   u = ( px·cosθ + py·sinθ)/T + shiftX
   v = (−px·sinθ + py·cosθ)/T + shiftY
   g = spot(frac(u), frac(v), dotAspect)
   s = areaLut[g]
   ```
5. **Deposit** — set bit `i` if `s < a'`.

**Registration and screen shift are different controls, and step 1 running before step
4 is what makes them different.** Because the screen is evaluated in *plate* space, the
lattice rotates and translates with the plate — which is physically correct, the screen
is *on* the plate — so the effective screen angle is `angle + regAngle` for free.
`shiftX/Y` then slides the dots *within* a stationary plate, which is what turns a
dot-centred rosette into a clear-centred one. Measured on a gradient: `shiftX 0.5`
moves 35% of the inked pixels and changes total ink by 0.008; `regX 8` moves 18% of
them and changes total ink by 0.18 — because the *image* moved.

**The loop is written incrementally.** Stepping X by one advances the plate-space
position and both screen coordinates by constants, so all the trigonometry is hoisted
to the row. This is the difference between the pass costing tens of milliseconds and
costing seconds.

#### The area-calibration table is what makes tone correct

A raw spot value is **not** a threshold. `{ g < a }` does not have area `a` for any of
the spot functions, so thresholding on `g` directly means a plate asked for 50%
coverage prints something else — and something *different for every dot shape*, so
changing shape would silently change exposure.

Replacing `g` with its own **area percentile** fixes it exactly: `P(rank(g) < a) = a`
holds by construction, for any spot function, including ones added later. Sample the
unit cell on a 128×128 grid, histogram, integrate, invert. Cached per
`(shape, quantized aspect)`.

Measured, all six shapes at three levels — worst error 1.0 points:

| shape | 25% | 50% | 75% |
|---|---|---|---|
| round | 24.8 | 49.6 | 74.8 |
| ellipse | 24.8 | 49.6 | 74.8 |
| square | 24.2 | 50.6 | 75.2 |
| diamond | 24.7 | 49.9 | 75.2 |
| line | 24.0 | 49.0 | 74.0 |
| cross | 24.5 | 49.5 | 74.2 |

And the endpoints are *exact* rather than close: coverage 0 inks nothing and coverage 1
inks everything, even with dot gain at 0.2. Paper stays paper, a solid stays solid.

This is the continuous-coordinate analogue of what `buildSpotScreen` in
[`ditherAlgorithms.ts`](src/engine/ditherAlgorithms.ts) does by ranking an 8×8 matrix.
That function stays where it is, serving the `halftone-dot` dither; it cannot be reused
here because its 45° and its 8-pixel pitch are baked into the tile.

#### FM and solid

**FM** skips steps 4–5 and runs the coverage plane through the existing
`applyDitherAlgorithm` at device resolution with two levels. That is the riso
thermal-master path, and it cost **no new dithering code at all** — the whole
44-algorithm registry and its parameter machinery apply per plate. Measured: 40%
coverage lands at 40.0% inked.

Bands are screened as complete strips there rather than incrementally, because error
diffusion is sequential and a band boundary mid-diffusion would leave a visible seam.

**Solid** deposits wherever coverage passes half — line art and spot blocks.

### 4.3 Resolve — `resolvePrintFrame`

`(PrintFrame, targetW, targetH) → ImageData`. The only place a composite exists.

**Downsampling is ours, not the browser's.** A bilinear reduction of an eight-times
raster beats against the dot lattice and produces false moiré that looks exactly like a
bug in the screening. A box filter over the whole source footprint is also the
physically right answer — and it is where optical dot gain lives: averaging reflectance
raised to $1/n$ and raising the mean back to $n$ *is* the Yule–Nielsen transform. At
`n = 1` it is a plain box filter and the `pow` pair is skipped. Measured at n = 2.5 on
a two-ink 50% field: mean level 142.5 → 127.8.

**Magnifying takes the nearest device pixel instead**, so a zoomed-in proof shows its
actual dots. Verified: a 2× magnified resolve of a two-ink frame contains exactly four
distinct colours — paper, each ink, and the overprint — rather than a gradient of
interpolated mush.

**A resolved print is opaque everywhere.** The paper is part of the composite and a
transparent source cell resolves to bare stock, which is what a press would produce. So
print output paints no separate ground and invariant 10 has nothing to guard here. The
one cost is that a source overlay in the `under` position is hidden — see §7.

**`resolvePrintFrame` takes an optional source rectangle** so a deep zoom resolves only
the dots actually on screen. Without it the viewport would have to composite a raster
far larger than the display in order to look at a corner of it, and that is the one
zoom level where the mode is most interesting to inspect closely.

---

## 5. Where it forks, and the one thing it needed

Print leaves `processRasterFrame` at step 3.5, beside vector, and for the same reason:
steps 1–3 are *exactly* the field a press wants to read, so print inherits the tone
curve, levels, AUTO LEVELS, blur, sharpen and Sobel edges without a line of new code.
`luminance` and `histogram` still ride out, so the histogram tap and AUTO LEVELS keep
working — the tap is upstream of the fork.

The one thing print needs that vector does not is **graded source colour**, because the
separation is colorimetric rather than tonal. That is the `gradeRatio` closure, which
was declared beside step 4 and is now **hoisted above both forks**. It depends only on
`lumBuffer` and `srcLumBuffer`, both final at 3.5. A second copy beside the fork would
have drifted the first time the near-black fallback was retuned, and the symptom would
have been print mode quietly ignoring the tone curve in the shadows.

**Synth mode has no RGBA buffer at all** (`pipeline.md` §1.1), so its target colour is
neutral grey from the graded luminance. That is not a degraded path and not a refusal:
a greyscale field separated onto two or three spot inks is a duotone, which is one of
the things the mode is for.

**The paper is the ground, and it comes from `printConfig`, not from `bgColor`.** A
print has no background in the CRT sense — the substrate is a term in the separation
itself — so letting the colour panel's background win would show one paper and separate
against another.

---

## 6. Cost, and the render escalation

This is the most expensive mode in the app, and the tiering is a first-class part of the
design rather than a tuning afterthought.

### Measured

Medians, Node 24 on the reference machine. Everything scales very nearly linearly, so
these are useful as coefficients rather than as absolute figures.

**Separation table build** — once per ink / paper / TAC change, cached:

| inks | 17³ (draft) | 33³ (full) |
|---|---|---|
| 2 | 1.9 ms | 10.6 ms |
| 4 | 4.6 ms | 30.2 ms |
| 6 | 5.7 ms | 43.9 ms |

**Per frame**, 420 × 315 contone:

| pass | scales with | cost |
|---|---|---|
| steps 1–3 | contone cells | 1–3 ms, unchanged |
| separation (table interp) | contone cells × inks | 4.2 ms (2 inks) – 6.6 ms (4 inks) |
| **screening** | **device px × inks** | **~21,000 plate-pixels per ms** |
| **resolve + YN downsample** | **output px** | **~28 ms at 900 × 675** |

**Two measurements changed the design**, which is why they are recorded here:

1. **The resolve was `pow`-bound, not filter-bound.** `encodeSrgb` was called three
   times per *output* pixel and ran `Math.pow` each time — 1.8 million `pow` calls for
   a 900 × 675 viewport, ~55 ms of a ~65 ms resolve. Replacing it with a 16,384-entry
   table took the resolve to **28 ms**, a 2.3× cut on a path that runs on every
   repaint. 16,384 rather than 4,096 because the curve is steep near zero: at 4,096 the
   bottom of the range quantizes to about a whole byte, which bands in exactly the deep
   shadows a print puts most of its ink in.
2. **The WORKING budget was too generous.** At 2.4M device pixels it measured **482 ms**
   at four inks — past the 220 ms `STATIC_BUDGET_MS` that `autoResolution` allows a
   still image, and WORKING is not the tier that is allowed to be slow. At 1.2M it
   measures **271 ms**. It also opened a real gap: at the old figure a 240 × 180 grid
   solved to ×7 against a requested ×8, so pressing RENDER PROOF changed almost nothing.

### The three tiers

Because `ruling` is resolution-free (§3), **dot size and position are invariant across
tiers** — only edge quality moves. Verified directly: a ruling of 10 across the width
gives 11 dot runs along the middle row at 180 × 180 device, at 720 × 720, and at
1440 × 1440, with total ink within 0.1 points.

| tier | when | how | 420 × 315, 4 inks |
|---|---|---|---|
| **DRAFT** | while a control is being dragged — the existing `isEditing` window ([`App.tsx`](src/App.tsx) `EDIT_BURST_MS`) | contone grid reduced by `choosePreviewDivisor`, `S` capped at 3, separation table at 17³ | ~63 ms |
| **WORKING** | `EDIT_SETTLE_MS` after the last change; the normal viewing state | full grid, `S` solved against 1.2M device pixels, table at 33³ | ~271 ms at ×3 |
| **PROOF** | the explicit **RENDER PROOF** button | the requested `S`, budget lifted, chunked and cancellable | ~1.5 s at ×8 |

No `previewPrintConfig` counterpart to `previewVectorConfig` was needed, and no
`scalePrintFrame` counterpart to `scaleVectorFrame`. Both exist for vector because a
draft moves the grid underneath geometry measured in grid cells. Print's ruling is
measured against the *picture*, and `drawPrint` resolves whatever device size it is
handed to the display box — so a draft frame lands at the same on-screen size and the
same dot pitch as the full pass, with nothing to retune going in and nothing to scale
coming out.

At a very large contone grid `S` can solve to 1, where a dot degenerates to a single
thresholded pixel. The dot *lattice* survives — verified, 41 runs at every divisor
tested — so the picture is still the same picture, just crude. The badge says `DRAFT ×1`
when this happens rather than leaving it to be discovered.

### The PROOF mechanism

- **Row bands** from a generator, driven from `requestAnimationFrame` with a 12 ms time
  slice per frame. A band is a row range and `plateMask` is written in place, so there
  is nothing to stitch. The slice is time-based rather than a fixed band count because
  a band's cost scales with the raster width.
- **The separation is not recomputed.** `lastPrintSeparation()` hands back the coverage
  planes the current frame was built from, so a proof is guaranteed to be *the same
  separation* as the working frame it replaces, screened finer. Reimplementing steps 1–3
  in the proof path would have been two code paths that must agree about every filter,
  curve and level. It is `cloneSeparation`d because the proof spans frames and the
  buffer is shared (`pipeline.md` invariant 5).
- **A partial proof paints as bare paper** where it has not reached, which reads as
  progress rather than as a broken render.
- **Anything that invalidates the plates cancels it** — the ink stack, the grid, the
  source, the grading — and WORKING takes over on the next render.
- **A finished proof is held**, so panning and zooming it is free. It is a bitmap.
- The button **states the cost before it runs** (`estimatePrintCost`, within ~10% from
  2.8M to 25M device pixels).

`PROOF` and an export are the same `screenPlates` call at the same supersample. What you
proof is what you get.

---

## 7. Deliberate omissions

Recorded rather than left to be discovered.

- **Ink body**: drum mottle, roller streaks down the sheet, coverage falloff in heavy
  fills. All per-plate noise fields; none implemented.
- **Paper tooth** modulating coverage, and show-through from the reverse.
- **Rational-tangent / supercell angle quantization.** We use continuous float angles,
  which is *more* accurate than a real RIP. The authentic artefact would be to snap to
  rational tangents, and it is a small option to add later.
- **Spectral (Kubelka–Munk) ink mixing.** Beer–Lambert in RGB is right for translucent
  films and wrong at the edges; heavy fluorescent overprints read a little dead.
- **A source overlay in the `under` position is hidden.** A resolved print is opaque
  because paper is opaque (§4.3). Making the uninked area transparent would need alpha
  to carry the *partial* inked fraction through the box filter, which is a real change
  to the resolve rather than a flag.
- **Animation is export-only in practice.** GIF and video screen every frame at PROOF
  through the same painter, so they work and they are slow; the live loop runs at
  WORKING. Nothing caches a plate between frames because the image under it moved.
- **A proof is media-only.** Synth and model animate, so a proof there would be
  superseded before it finished, and a static synth frame is cheap enough that WORKING
  already looks right. Their exports still screen at PROOF.
- **Screening in a worker.** The band generator is deliberately shaped so this is a
  later swap rather than a rewrite: it already works over a row range writing into a
  flat `Uint8Array`.
- **Print SVG's composite is an approximation.** The dot *geometry* is exact — one
  `<path>` per ink, off the same bits the viewport painted — but the layers are stacked
  with `mix-blend-mode: multiply`, which is the closest an SVG viewer gets to
  translucent overprinting. It is also what a designer would set up by hand.

---

## 8. Every site the widening touched

`RasterOutputMode` gained a fourth member. As `vector-pipeline.md` §5 records, that
finds the sites which *branch* on the union — never the sites that assumed the old value
so completely they never branched. `BasicPanel.handleColsChange` was the one missed last
time, and it is on this list for that reason.

**Square cells (`!== 'ascii'`) — print joins pixel and vector:**

| site | change |
|---|---|
| [`App.tsx`](src/App.tsx) `autoSetMediaResolution` | print branch: `PRINT_CONTONE_COLS` (420), `cellAspect` 1.0 |
| [`App.tsx`](src/App.tsx) `densityRampSection` | omitted — a plate has no glyphs |
| [`BasicPanel.tsx`](src/components/BasicPanel.tsx) `cellAspectFor`, `handleColsChange` | the site with no branch to find |
| [`autoResolution.ts`](src/engine/autoResolution.ts) | `MIN_SRC_PX_PER_CELL` 2, `SHAPE_BOUNDS` 150k cells, `BASE_MS_PER_CELL` 0.0025, `MIN_PRINT_CELL_DEVICE_PX` 8 |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) `getContentSize`, `autoFit` | already `!== 'ascii'`; correct unchanged |
| [`imageExporter.ts`](src/engine/imageExporter.ts) `exportCellSize` | fractional square cell, as vector |

**Deliberately excluded from the `=== 'pixel'` sites:** `snapScaleToCellGrid`,
`stepZoom`, the wheel handler, `autoFit`'s whole-number `fitScale`. Print's rung is the
*device* pixel, `S` times finer than the contone cell those exist to hold.

**CRT bypassed, in every path:** [`imageExporter.ts`](src/engine/imageExporter.ts),
[`gif.ts`](src/engine/gif.ts), [`video.ts`](src/engine/video.ts) and — unlike pixel and
vector — the **viewport's CSS overlays** too. Those cost nothing and pixel mode is
welcome to them, but a scanline across a halftone is two incompatible screens beating
against each other, and the viewport agreeing with the file is what keeps them the same
picture.

**New branches:**

| site | change |
|---|---|
| [`outputModes.tsx`](src/components/outputModes.tsx) | fourth entry. Hotkey `4`, the tooltips and the shortcuts sheet all fall out of the array — nothing else had to be told. The card grid went from `repeat(3)` to a 2×2 block |
| [`AsciiViewport.tsx`](src/components/AsciiViewport.tsx) | `drawPrint`; `setFrame` takes `print`; `isCanvasMode` includes it; the tier badge beside RES |
| [`imageExporter.ts`](src/engine/imageExporter.ts) | PNG/JPG resolve at export size; SVG emits one merged `<path>` per ink through `mergeCellRects` |
| [`separation.ts`](src/engine/separation.ts) | **print short-circuits the whole mechanism** — see below |
| [`separationExporter.ts`](src/engine/separationExporter.ts) | `exportPrintSeparation`: one bitmap per ink off `plateMask`, no masking, no re-render |
| [`share.ts`](src/engine/share.ts) | `printConfig` on the payload, **written** by `currentFullState` as well as read on load |
| [`PaletteControls.tsx`](src/components/PaletteControls.tsx) | the panel is *replaced*, not reduced — see below |
| [`App.tsx`](src/App.tsx) | `renderSettingsBody` extracted, so the two RENDER SETTINGS mounts share one three-way branch instead of holding two hand-copied copies of it |

Two behavioural rules from the vector pass hold here too: **the dither picker is hidden,
not disabled**, and `ditherAlgorithm` stays in state so a cell mode restores it;
**charset, quantize depth and band weights are hidden, not reset.**

### Invariant 9 is suspended for print, explicitly

`pipeline.md` invariant 9 says a separation's plates partition the opaque cells exactly.
For print that is **false by design**: the plates overlap, because overprinting is what
the mode is. Measured — two 60% plates at 15° and 75° take both inks on 36.3% of the
sheet, and their coverages sum to more than 100%.

What holds instead is a *coverage* property: plate `p` is exactly the set of device
pixels where bit `p` of `plateMask` is set. No cell arithmetic, nothing to mask, no
`MAX_PLATES` ceiling (the ink count is capped at 8 by construction), and none of the
refusals apply — there is no `mono` case because a print always carries inks, and no
continuous-colour blow-up because the separation is the point.

`PRINT_SEPARATION_IS_NATIVE` in [`separation.ts`](src/engine/separation.ts) is where
that seam is documented, so the exception is stated rather than quietly violated.

### The COLORS panel is replaced, not reduced

Every control in `PaletteControls` answers *what colour should a cell be*, and a press
does not work that way. Leaving a palette tab up would offer a choice the engine ignores
— the failure the vector notes in that file describe, one step further along.

What is genuinely useful is the reverse direction. The palette library already carries
real riso and process ink sets (category `print` in
[`palettes.ts`](src/engine/palettes.ts)), so in print mode it stops being a colour model
and becomes a source of ink stacks. `inksFromPalette` handles the one non-obvious part:
the lightest entry becomes the **paper** rather than an ink, because printing near-white
on near-white spends a whole pass on nothing.

---

## 9. How to check it

The properties below are arithmetic and need no browser; the harness that produced every
measured figure in this document shimmed `ImageData` and imported the two engine modules
directly. It is worth rebuilding rather than keeping, in the same spirit as
`separation.ts` keeping its partition property checkable.

1. **Round trip.** Separate a set of probe colours and recomposite through
   `compositeCoverage`. In-gamut colours should land within a few ΔE. This is the
   property the separation *is*.
2. **Black generation.** A neutral must go mostly to black when black is in the set, and
   a red patch must put near-nothing on cyan. GCR emerging on its own is the sign the
   solve is colorimetric rather than a channel extraction.
3. **Area calibration.** A flat coverage `a` must ink ~`a` of the device pixels for
   **every** dot shape, and the endpoints must be exact under dot gain. If square and
   diamond disagree with round, the calibration table is wrong and all tone is wrong
   with it.
4. **Tier invariance.** Count dot runs along one row at three tiers. Identical counts and
   identical total ink, or `ruling` is leaking a resolution dependency and the whole
   escalation is unusable.
5. **Shift versus registration.** On a gradient, `shiftX` must move dots without changing
   total ink; `regX` must change it. If they behave the same, steps 1 and 4 of the
   screening are reading the same coordinates.
6. **Overlap.** Two plates at 30° must take both inks on a large fraction of the sheet
   and their coverages must sum past 100%. If they partition, something is masking.
7. **Magnified resolve.** A 2× resolve of an *N*-ink frame must contain at most $2^N$
   distinct colours. More means the dots are being interpolated.

In the app: press `4`, then solo each plate; four inks at 15/75/0/45 over a gradient must
show a rosette, and dragging one to 40° must produce gross moiré. Export a PNG at a scale
equal to the supersample and it should be the viewport, exactly. Generate a separation,
stack the plates with multiply over the paper colour, and the print should reassemble.

---

## Sources

[Screen angles: why 15/45/75/90](https://printplanet.com/threads/screen-angles-why-are-they-15-45-75-and-90.10650/) ·
[The Print Guide — halftone screen angles](http://the-print-guide.blogspot.com/2009/05/halftone-screen-angles.html) ·
[Wasatch — moiré and pattern interference](https://www.wasatch.com/htmlHelp/en/color_separations/moire.html) ·
[PrintWiki — screen angles (rational tangent, supercells)](https://printwiki.org/Screen_Angles) ·
[Secret Riso Club — riso basics](https://secretrisoclub.com/Riso-Basics) ·
[RISOTTO Studio — what is risograph printing](https://risottostudio.com/pages/what-is-risograph-printing) ·
[Split Arrow — risograph printing quirks](https://splitarrowprints.com/learn/risograph-printing-quirks-an-intro-into-risograph-imperfections-and-their-causes/) ·
[Exploriso — screen angles](https://en.exploriso.info/exploriso/printing/screen-angles/) ·
[Exploriso — screen width](https://en.exploriso.info/exploriso/printing/screen-width/) ·
[Reed College — risograph tips](https://libguides.reed.edu/c.php?g=1339150&p=9870131) ·
[p5.riso](https://antiboredom.github.io/p5.riso/) ·
[Risograph ink colours with hex codes](https://studio-ity.com/riso/colors/) ·
[Yule–Nielsen effect and ink penetration](https://library.imaging.org/admin/apis/public/api/ist/website/downloadArticle/print4fab/16/1/art00095_1)
