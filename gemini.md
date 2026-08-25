# ASCII Studio — Developer & AI Reference (`gemini.md`)

> **Project**: [ASCII Studio](https://ascii.pantoine.com)  
> **Repository**: [github.com/gimk/ascii.pantoine.com](https://github.com/gimk/ascii.pantoine.com)  
> **Live Web App**: [ascii.pantoine.com](https://ascii.pantoine.com)  
> **Tech Stack**: React 19, TypeScript 5, Vite 6, Three.js, gifenc, Lucide React, Monospace Fonts (JetBrains Mono, JuliaMono)

---

## 1. Executive Overview

**ASCII Studio** is an interactive, brutalist terminal-styled ASCII synthesis suite, 3D model rasterizer, 2D image/video processing engine, particle physics simulator, and live formula sandbox. It allows users to design, manipulate, code, and export complex, real-time procedural ASCII field animations, rasterized 3D geometry, high-fidelity media conversions, animated GIFs, and HD videos directly in the browser without any software installation.

---

## 2. Architecture & Directory Structure

```
ascii.pantoine.com/
├── public/
│   ├── favicon.svg
│   └── fonts/                     # Monospace webfonts (JuliaMono, JetBrains Mono, etc.)
├── src/
│   ├── components/                # React UI components
│   │   ├── AsciiLoadingSpinner.tsx    # Minimalist square loading indicator with 4-corner braille pulses
│   │   ├── AsciiViewport.tsx          # Canvas/Text ASCII viewport, high-DPI zoom & Fullscreen Viewfinder
│   │   ├── CharsetThemeBar.tsx        # Phosphor themes, gradient builder, rotary dial
│   │   ├── CollapsibleSection.tsx     # Brutalist collapsible UI container for sidebar sections
│   │   ├── ExportModal.tsx            # Multi-format media & code exporters (GIF, MP4, WebM, PNG, SVG, Astro, HTML, JSON, TXT)
│   │   ├── MediaFileControls.tsx      # Media upload (file, URL, clipboard) & transforms (scale, offset, fit, rotation)
│   │   ├── MediaViewControls.tsx      # Dithering algorithms, tone curves, levels, sharpening, noise & edge detection
│   │   ├── ModelSettingsControls.tsx  # 3D model loaders (OBJ, STL, GLTF/GLB, PLY, URL, default Torus Knot) & mesh settings
│   │   ├── ModelViewControls.tsx      # Shading mode, auto-rotation, wobble, lighting, camera & FOV
│   │   ├── OptimizeControls.tsx       # Grid resolution, auto-res toggle & aspect ratio presets
│   │   ├── ParticleControls.tsx       # Vector field & particle physics controls
│   │   ├── PresetSelector.tsx         # Wave preset selector & randomizer hero
│   │   ├── ShareModal.tsx             # Base64 URL state sharing dialog
│   │   ├── SynthControls.tsx          # 8-channel parametric wave sliders & live formula editor
│   │   └── ViewfinderSettingsModal.tsx# Viewfinder hardware dialog (CRT scanlines, bloom, vignette & FPS limiter)
│   ├── engine/                    # Pure TypeScript computational engine (zero React deps)
│   │   ├── exporter.ts            # Code generator for .astro, .html, .json, .txt
│   │   ├── gif.ts                 # High-performance client-side animated GIF rendering via gifenc
│   │   ├── imageExporter.ts       # High-DPI PNG and vector SVG ASCII frame exporter
│   │   ├── khronos3dModels.ts     # Curated Khronos 3D sample repository catalogue & search
│   │   ├── math.ts                # Parametric wave equations, AST/code parser & live JS compiler
│   │   ├── mediaMetadata.ts       # Video and image dimension & duration extraction utilities
│   │   ├── mediaPresets.ts        # Default 2D media configuration constants
│   │   ├── mediaRenderer.ts       # 2D image/video frame sampling, dithering algorithms & color extraction
│   │   ├── modelLoader.ts         # Three.js 3D mesh loaders for OBJ, STL, GLTF/GLB, and PLY
│   │   ├── modelPresets.ts        # Default 3D Torus Knot presets & configuration constants
│   │   ├── modelRenderer.ts       # Offscreen Three.js WebGL renderer, shading shaders & ASCII grid projection
│   │   ├── particles.ts           # Vector-field particle physics & curl flow advection
│   │   ├── presets.ts             # Built-in curated parametric & custom formula presets
│   │   ├── randomizer.ts          # Generative procedural parameter synthesis
│   │   ├── renderer.ts            # Character ramp density mapping & ASCII frame rendering
│   │   ├── share.ts               # UTF-8 Base64 state serialization/deserialization
│   │   └── video.ts               # Canvas MediaRecorder / WebCodecs video capture (.webm / .mp4)
│   ├── styles/
│   │   └── terminal.css           # Brutalist terminal theme, CRT scanlines, phosphor glow & bloom
│   ├── types/
│   │   ├── ascii.ts               # Central TypeScript interface & type definitions
│   │   └── gifenc.d.ts            # Type definitions for gifenc library
│   ├── App.tsx                    # Main state manager, mode switcher, undo/redo history, keyboard bindings
│   └── main.tsx                   # React DOM root entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 3. Core Engine Mechanics & Modes

### 3.1. App Modes (`AppMode = 'synth' | 'media' | 'model'`)
ASCII Studio operates across three dedicated synthesis pipelines with isolated render settings:
1. **Wave Synthesizer (`synth`)**: Mathematical parametric wave generator, particle physics, and live JS sandbox.
2. **2D Media (`media`)**: Real-time rasterizer for images (PNG, JPG, WebP, SVG) and videos (MP4, WebM) with dithering and color sampling.
3. **3D Models (`model`)**: Offscreen Three.js WebGL rasterizer for 3D meshes (OBJ, STL, GLTF/GLB, PLY) with real-time lighting and multiple shading modes.

### 3.2. Parametric Wave Synthesizer (`src/engine/math.ts`)
Calculates a normalized scalar intensity field $I(x, y, t) \in [0, 1]$ over an aspect-ratio-corrected coordinate space ($x \in [-1, 1], y \in [-1, 1]$ with $y' = y \cdot 0.55$).
- **Primary & Secondary Radial**: $A \cdot \sin(\text{dist} \cdot \omega - t \cdot s)$
- **Directional Swells**: $A \cdot \sin(x \cdot \omega_x - t \cdot s_x) + A \cdot \sin(y \cdot \omega_y - t \cdot s_y) + A \cdot \sin((x+y) \cdot \omega_d - t \cdot s_d)$
- **Spiral Vortex**: $A \cdot \sin(\theta \cdot \text{arms} + \text{twist} \cdot \text{dist} - t \cdot s)$ where $\theta = \operatorname{atan2}(y', x)$
- **Depth / Tunnel**: $A \cdot \left(\frac{k}{\text{dist}^\gamma}\right) \cdot \sin(t \cdot s)$
- **Moiré Dual Emitter**: Interference between two focal emitters offset horizontally by $\Delta x$
- **Starfield & Cosmic Sparkle Matrix**: Procedural spatial hash with density thresholding, persistent base luminosity ($45\%-80\%$), and atmospheric sinusoidal twinkle scintillation.
- **Contrast & Bias Normalization**: $I_{\text{final}} = \operatorname{clamp}((I - 0.5) \cdot \text{contrast} + 0.5 + \text{bias}, 0, 1)$

### 3.3. Vector-Field Particle Advection (`src/engine/particles.ts`)
- **Spatial Gradient**: $\nabla f(x, y) = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}\right)$ via central finite differences:
  $$\frac{\partial f}{\partial x} \approx \frac{f(x + \epsilon, y) - f(x - \epsilon, y)}{2\epsilon}$$
- **Tangential Curl Field**: $\vec{v}_{\text{curl}} = \left(-\frac{\partial f}{\partial y}, \frac{\partial f}{\partial x}\right)$ creates rotational streamlines along wave contours.
- **Delta-Time Euler Integration**: Particle position $\vec{p}$ and velocity $\vec{v}$ update per frame with drag damping:
  $$\vec{v}_{t+\Delta t} = \vec{v}_t \cdot (1 - \mu) + (\alpha \nabla f + \beta \vec{v}_{\text{curl}}) \cdot \Delta t$$
- **Particle Lifespan & Stamping**: Particles deposit luminance onto the ASCII grid and sample character ramps based on age decay.

### 3.4. 2D Media Processing & Dithering Engine (`src/engine/mediaRenderer.ts`)
- **Input Sources**: Local file uploads, remote web URLs, direct clipboard paste, or built-in presets.
- **Geometry & Transform**: Aspect fitting (`contain`, `cover`, `stretch`, `original`), scale zoom, 2D offsets, rotation, and axis flipping (`flipX`, `flipY`).
- **Color Extraction**:
  - **Fixed Theme Mode**: Maps luminance to active CRT phosphor theme or gradient ramp.
  - **Colored ASCII Mode**: Extracts cell RGB values via `center`, `average`, or `weighted` sampling, with adjustable saturation boosting and custom/dark/light backgrounds.
- **Image Filters**: Unsharp masking convolution, Gaussian blur, procedural noise injection, and Sobel edge detection with adjustable threshold/strength.
- **Dithering Pipeline**: Error diffusion and ordered matrix algorithms:
  - Floyd-Steinberg
  - Bayer $4 \times 4$ and Bayer $8 \times 8$
  - Atkinson
  - Sierra
  - Random Noise Dither
- **Tonal Adjustment**: 3-point black/mid/white level clipping, highlight/mid/shadow balance, and non-linear spline curve point evaluation.

### 3.5. 3D Model Rasterizer (`src/engine/modelRenderer.ts`, `src/engine/modelLoader.ts`)
- **Geometry Loaders**: Built-in Three.js loaders supporting `.obj`, `.stl`, `.gltf`, `.glb`, and `.ply`, along with remote Khronos GLTF sample assets.
- **Auto-Normalization & Centering**: Automatically calculates bounding boxes and re-centers/normalizes mesh geometries.
- **Shading Modes**:
  - `shaded`: Blinn-Phong/Lambertian illumination with directional and ambient lighting, specular highlights, and shadow bias.
  - `wireframe`: Edges and polygon wireframes.
  - `depth`: Linearized Z-depth gradient mapping.
  - `normals`: World-space surface normal orientation mapping.
  - `outline`: Sobel normal/depth edge outline extraction.
  - `points`: Projected point-cloud vertex rendering.
- **Dynamics**: Parametric multi-axis auto-rotation, harmonic wobble oscillation, and toggleable orthographic vs. perspective projection cameras.

### 3.6. Live Bi-Directional Formula Sandbox
- The sandbox accepts arbitrary JavaScript formulas `fn(x, y, t, ...)` and `prepare(t, ...)`.
- Uses `compileCustomCode` to safely construct executable functions with runtime error trapping.
- Bi-directional sync parses mathematical constants from user code back into parametric sliders via AST / regex mapping.

### 3.7. Sidebar Architecture (`CONTENT` / `RENDER`)
The control panel is organized into two distinct, purposeful tabs via `CollapsibleSection.tsx`:
1. **CONTENT**: Defines the subject, source data, and spatial/geometric setup:
   - *Synth*: Mode picker, wave presets, 8-channel parametric sliders, custom formula sandbox, and particle physics.
   - *Media*: Mode picker, clipboard/file/URL loaders, video playback, and transform/framing (fit, zoom, offset, rotation, flip).
   - *Model*: Mode picker, Khronos online 3D library, 3D file/URL import, scale/offset transforms, and mesh/normal properties.
2. **RENDER**: Defines the visual shading, image filtering, palette, and ASCII rasterization pipeline:
   - *Media Filters*: Unsharp masking, blur, noise, edge outline boost, and tone curves/levels.
   - *Model Shading*: Shading modes (shaded, outlines, wireframe, depth, normals, points), auto-rotation & dynamics, lighting & specular, and camera & optics.
   - *Universal Styling*: Color palettes & themes (Single color CRT, indexed hardware palettes, RGB content color), character density ramp, grid resolution, and CRT display FX.

### 3.8. State Serialization & Sharing (`src/engine/share.ts`)
- Entire animation state (active mode, formulas, wave parameters, media/model configs, theme, particles, grid settings, and CRT FX) is compressed to a UTF-8 safe Base64 URL parameter.
- Opening a shared URL automatically switches the view into Fullscreen Viewfinder mode while allowing 1-click toggling back to editor mode.

---

## 4. Key Data Structures (`src/types/ascii.ts`)

| Interface / Type | Purpose |
| :--- | :--- |
| `AppMode` | Active engine mode: `'synth'` \| `'media'` \| `'model'` |
| `WaveParams` | Complete mathematical configuration for parametric wave generation |
| `ParticleConfig` | Lifespan, burst count, swirl/flow strength, and drag settings |
| `MediaConfig` | Source file, URL, fit mode, scale, offset, rotation, and playback speed |
| `MediaViewConfig` | Dithering algorithm, resampling, edge detection, blur, noise, sharpen, and levels |
| `MediaColorConfig` | Color mode (`'fixed'` \| `'content'`), sampling method, saturation, and background |
| `ModelConfig` | 3D model source, format, scale, auto-centering, and polygon stats |
| `ModelViewConfig` | Shading mode, rotation speeds, wobble, lighting, specular, FOV, and camera distance |
| `RenderSettings` | Mode-isolated rendering configuration (cols, rows, density, theme, CRT FX, optimize) |
| `PhosphorTheme` | CRT color modes: `'green'`, `'amber'`, `'cyan'`, `'monochrome'`, `'matrix'`, `'paper'`, `'blood'` |
| `PhosphorGradient` | Linear phosphor gradient with dual color hexes and angle in degrees |
| `CrtConfig` | Scanlines, CRT ambient radial glow, phosphor bloom, and vignette toggles |
| `OptimizeConfig` | Target FPS, tab visibility throttling, and idle power saving |
| `Preset` / `MediaPreset` / `ModelPreset` | Bundled configuration presets for each synthesis mode |

---

## 5. Development Workflows & Scripts

```bash
# Start Vite development server with HMR
npm run dev

# Typecheck and build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 6. Coding & Performance Guidelines

1. **Zero-Allocation Render Loops**:
   - Avoid creating closures, arrays, or object allocations inside `evaluateParametricWave`, `mediaRenderer`, or the per-cell renderer loop.
   - Pre-allocate scratch vectors or reuse typed buffers where possible.
2. **Brutalist Retro Aesthetic**:
   - Maintain the monospace CRT phosphor aesthetic defined in `src/styles/terminal.css`.
   - Ensure high contrast, scanline overlays, and responsive typography across all screen resolutions.
3. **State Integrity & Preset Compatibility**:
   - When modifying `WaveParams`, `MediaConfig`, `ModelConfig`, or `RenderSettings`, update `src/types/ascii.ts`, `src/engine/share.ts`, and preset files in sync.
   - User presets stored in `localStorage` (`ascii_builder_user_presets`, etc.) must remain backward compatible with optional property fallbacks.
4. **Keyboard Accessibility**:
   - Global hotkeys (`Space`, `F`, `R`, `1`, `2`, `3`, `Cmd+Z`, `Cmd+Shift+Z`) must not trigger when the user is actively typing in text inputs or code editors.
5. **Git & Push Constraint**:
   - When creating commits, stage and commit changes locally only.
   - **NEVER push to remote** (`git push`) unless explicitly requested by the user.

