# Dither Studio

[![Live App](https://img.shields.io/badge/Live_App-ascii.pantoine.com-00FF66?style=flat-square&logo=google-chrome&logoColor=black)](https://ascii.pantoine.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A brutalist, terminal-styled dithering studio in the browser. Feed it an image, a video, a 3D
model or a procedural wave field, and it rasterizes into ASCII, Braille, halftone screens or
1-bit pixel art — then exports as vector SVG, PNG, GIF, video or print-ready colour plates.

**No install, no account: [ascii.pantoine.com](https://ascii.pantoine.com)**

---

## Features

**Sources**
- **Media** — images and video, with fit modes, crop, flip/rotate and resampling.
- **3D models** — OBJ, STL, GLTF/GLB and PLY, plus a built-in library of Khronos glTF sample
  assets. Orbit, dolly, transform; shaded, wireframe, depth, normals, outline or point shading.
- **Synth** — 8-channel parametric wave field: radial harmonics, orthogonal swells, spiral
  vortex, tunnel warp, moiré emitters, starfield.
- **Particles** — click or drag to spawn bursts that ride the field's gradient and curl.

**Rasterizer**
- Two output modes: glyph grid (ASCII) or square-pixel dither.
- 20+ character ramps — density, blocks, quadrants, box-drawing, Braille, hex, math operators.
- **44 dither algorithms** — error diffusion (Floyd-Steinberg, Atkinson, Stucki, Sierra,
  Ostromoukhov…), ordered matrices (Bayer, clustered dot, crosshatch, spiral), blue noise and
  void-and-cluster, space-filling curves (Hilbert, Peano), plus modulation and glitch families.
- **38 palettes** — Game Boy, CGA, C64, Apple II, ZX Spectrum, PICO-8, Risograph, CMYK process,
  Bauhaus, Solarized, Nord, Vaporwave — matched in CIELAB (ΔE*) rather than raw RGB.
- Tone controls: 1–4 bit posterize, n-tone ramp editor, spline tone curves, RGB channel mixer.
- Levels: live 256-bin histogram, draggable black/gamma/white, percentile-clipped auto levels.

**Interface**
- **BASIC / ADVANCED** modes over one shared state — flip freely, nothing is converted or lost.
- Fullscreen viewfinder with floating HUD and FPS readout.
- Auto-resolution grid fitting, framerate profiles, tab-inactive and idle throttling.
- Shareable links: the whole render state deflate-compressed into one URL, framing included.
- Undo/redo; press <kbd>?</kbd> for the full shortcut list.

**Export**
- **SVG** — cells merged into one `<path>` per colour, so a full render lands in Figma or
  Illustrator as a handful of nodes.
- **PNG / JPG** at multiple scales.
- **Colour separation** — one plate per ink as a `.zip` or layered SVG, ready for screen print.
- **GIF** and **MP4 / WebM** capture.

---

## Tech

React 19 · TypeScript 5.7 · Vite 6 · three.js · gifenc · WebCodecs / MediaRecorder ·
Canvas 2D · lucide-react · JetBrains Mono & JuliaMono

Zero-allocation single-pass raster pipeline, no backend, no telemetry.

---

## Local development

```bash
git clone https://github.com/gimk/ascii.pantoine.com.git
cd ascii.pantoine.com
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` type-checks and bundles to `dist/`;
`npm run preview` serves that build.

---

MIT © [gimk](https://github.com/gimk)
