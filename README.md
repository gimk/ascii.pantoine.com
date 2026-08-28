# Dither Studio

[![Live App](https://img.shields.io/badge/Live_App-studio.pantoine.com-00FF66?style=flat-square&logo=google-chrome&logoColor=black)](https://studio.pantoine.com)
[![Version](https://img.shields.io/badge/version-2.3-00FF66?style=flat-square)](https://github.com/gimk/studio.pantoine.com/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A brutalist, terminal-styled dithering studio in the browser. Feed it an image, a video, a 3D
model or a procedural wave field, and it rasterizes into ASCII, Braille, halftone screens,
1-bit pixel art or a deflected CRT beam — then exports as vector SVG, PNG, GIF, video or
print-ready colour plates.

**No install, no account: [studio.pantoine.com](https://studio.pantoine.com)**

---

## Features

### Sources

- **Media** — images and video. Fit modes, scale, pan, rotate, flip, resampling, and a
  **crop marquee** you drag on the uncropped picture, so a crop can always be widened again.
  Cropping in spends the whole grid on what you kept, so it gains detail instead of zooming.
- **3D models** — OBJ, STL, GLTF/GLB, PLY, plus the Khronos glTF sample library. Orbit,
  dolly, transform; shaded, wireframe, depth, normals, outline or point shading.
- **Synth** — an 8-channel parametric wave field: radial harmonics, orthogonal swells,
  spiral vortex, tunnel warp, moiré emitters, starfield.
- **Particles** — click or drag to spawn bursts that ride the field's gradient and curl.

### Rasterizer

- **Three output modes** — glyph grid (ASCII), square-pixel dither, or vector beam.
- **20+ character ramps** — density, blocks, quadrants, box-drawing, Braille, hex, math.
- **44 dither algorithms** — error diffusion (Floyd–Steinberg, Atkinson, Stucki, Sierra,
  Ostromoukhov…), ordered matrices (Bayer, clustered dot, crosshatch, spiral), blue noise
  and void-and-cluster, space-filling curves (Hilbert, Peano), plus modulation and glitch
  families. Each is tunable — intensity, mask scale, screen angle, carrier frequency, seed,
  serpentine scan — and every numeric field reaches past its slider when you want the extreme.
- **38 palettes** — Game Boy, CGA, C64, Apple II, ZX Spectrum, PICO-8, Risograph, CMYK
  process, Bauhaus, Solarized, Nord, Vaporwave — matched in CIELAB (ΔE\*), not raw RGB.
- **Tone** — 1–4 bit posterize, an n-tone ramp editor with a band-width slider per stop,
  spline tone curves, RGB channel mixer.
- **Levels** — live 256-bin histogram, draggable black/gamma/white, percentile auto levels.
- **Grading** — exposure, tonal balance, unsharp mask, Sobel edges, grain, blur, and an
  edge-preserving denoise (a self-guided filter, not a second blur: at half the grain
  removed it keeps 82% of the edge contrast where a box blur keeps 58%).

### Beam mode

Rutt-Etra scan processing as geometry rather than cells. Vector output forks out of the
raster pipeline before quantization, so the beam reads a fully graded luminance field and
returns polylines — curves, not squares, all the way to the SVG.

- Scan lines deflected by luminance on either axis, with occlusion (a painter's fill, so a
  nearer ridge hides what is behind it), analog ripple, and a chromatic aberration that
  splits the *trace* into three real channel passes.
- **Carrier modulation** breaks the beam into pulses where the image is dark — the Joy
  Division dot-break — with beam cutoff kept as a separate control, so a background can be
  cleared without dissolving the subject into dots.
- **Smoothing** low-passes the luminance along the beam only, so lines settle without
  bleeding into each other.
- Five presets: Unknown Pleasures, Oscilloscope, Pulsar, Contour, Rutt-Etra.

### Compositing

The stage after the raster, shared by all three output modes.

- **Source overlay** — the original composited back over its own rasterization, under or
  over, with any of the sixteen CSS blend modes, an opacity and a Gaussian blur. Framed
  through the identical maths the raster used, so it registers cell for cell at any zoom.
  Feed it the raw source or the graded greyscale the dither actually quantized.
- **Phosphor glow** — one blur of the finished frame rather than a halo per glyph or per
  stroke, so it costs the same on a three-line beam and a three-hundred-line one, reaches
  ASCII and pixel, and comes out in the SVG as a real filter.
- **Chromatic aberration** on the composed frame, for the modes with no geometry to split.

### Interface

- **BASIC / ADVANCED** over one shared state — flip freely, nothing is converted or lost.
  Both read as the same five steps: source → output → aesthetic → adjust → compositing.
- **Auto-resolution** — the grid is solved from the display, the source, the output mode
  and the machine's measured frame cost, rather than from one tuned constant. Touch any
  resolution control and it hands over.
- Fullscreen viewfinder with floating HUD and FPS readout; framerate profiles, tab-inactive
  and idle throttling.
- **Shareable links** — the whole render state deflate-compressed into one URL, framing
  included.
- Undo/redo and a RESET ALL that returns every setting to a first-visit state while keeping
  the loaded image, model or preset. Press <kbd>?</kbd> for the full shortcut list.

### Export

- **SVG** — cells merged into one `<path>` per colour, so a full render lands in Figma or
  Illustrator as a handful of nodes. Beam mode emits true `<polyline>` runs instead, open
  and ready for a plotter.
- **PNG / JPG** at multiple scales.
- **Colour separation** — one plate per ink as a `.zip` or layered SVG, ready for screen
  print. Cell modes only: a beam has no cells to partition.
- **GIF** and **MP4 / WebM** capture.

---

## Tech

React 19 · TypeScript 5.7 · Vite 6 · three.js · gifenc · WebCodecs / MediaRecorder ·
Canvas 2D · lucide-react · JetBrains Mono & JuliaMono

Zero-allocation single-pass raster pipeline. No backend, no telemetry.

Every mode and every export funnels through one function, `processRasterFrame`.
[`pipeline.md`](pipeline.md) documents its six stages, the buffers, and the invariants that
break rendering when violated; [`vector-pipeline.md`](vector-pipeline.md) covers the beam
fork and why the effect cannot be a member of the dither family.

---

MIT © [gimk](https://github.com/gimk)
