# ASCII Studio — Developer & AI Reference (`gemini.md`)

> **Project**: [ASCII Studio](https://ascii.pantoine.com)  
> **Repository**: [github.com/gimk/ascii.pantoine.com](https://github.com/gimk/ascii.pantoine.com)  
> **Live Web App**: [ascii.pantoine.com](https://ascii.pantoine.com)  
> **Tech Stack**: React 19, TypeScript 5, Vite 6, Three.js, gifenc, Lucide React, Monospace Fonts (JetBrains Mono, JuliaMono)

---

## 1. Executive Overview

**ASCII Studio** is an interactive, brutalist terminal-styled ASCII animation synthesizer, 3D model rasterizer, particle physics simulator, and live formula sandbox. It allows users to design, manipulate, code, and export complex, real-time procedural ASCII field animations, animated GIFs, and HD videos directly in the browser without any software installation.

---

## 2. Architecture & Directory Structure

```
ascii.pantoine.com/
├── public/
│   ├── favicon.svg
│   └── fonts/             # Monospace webfonts (JuliaMono, etc.)
├── src/
│   ├── components/        # React UI components
│   │   ├── AsciiViewport.tsx     # Canvas/Text ASCII viewport & Fullscreen Viewfinder
│   │   ├── CharsetThemeBar.tsx   # Phosphor themes, gradient builder, rotary dial, scanlines
│   │   ├── ExportModal.tsx       # Multi-format media & code exporters (GIF, MP4, WebM, Astro, HTML, JSON, TXT)
│   │   ├── OptimizeControls.tsx  # Framerate limiter, auto-res toggle, resolution presets
│   │   ├── ParticleControls.tsx  # Vector field & particle physics controls
│   │   ├── PresetSelector.tsx    # Preset selector & custom preset management
│   │   ├── ShareModal.tsx        # Base64 URL state sharing dialog
│   │   └── SynthControls.tsx     # 8-channel parametric wave sliders & formula editor
│   ├── engine/            # Pure TypeScript computational engine (zero React deps)
│   │   ├── exporter.ts    # Code generator for .astro, .html, .json, .txt
│   │   ├── gif.ts         # High-performance client-side animated GIF rendering via gifenc
│   │   ├── video.ts       # Canvas MediaRecorder / WebCodecs video capture (.webm / .mp4)
│   │   ├── math.ts        # Parametric wave equations, AST/code parser & live JS compiler
│   │   ├── particles.ts   # Vector-field particle physics & curl flow advection
│   │   ├── presets.ts     # Built-in curated parametric & custom formula presets
│   │   ├── randomizer.ts  # Generative procedural parameter synthesis
│   │   ├── renderer.ts    # Character ramp density mapping & ASCII frame rendering
│   │   └── share.ts       # UTF-8 Base64 state serialization/deserialization
│   ├── styles/
│   │   └── terminal.css   # Brutalist terminal theme, CRT scanlines, phosphor glow & bloom
│   ├── types/
│   │   └── ascii.ts       # Central TypeScript interface & type definitions
│   ├── App.tsx            # Main state manager, undo/redo history, keyboard bindings
│   └── main.tsx           # React DOM root entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 3. Core Engine Mechanics

### 3.1. Parametric Wave Synthesizer (`src/engine/math.ts`)
Calculates a normalized scalar intensity field $I(x, y, t) \in [0, 1]$ over an aspect-ratio-corrected coordinate space ($x \in [-1, 1], y \in [-1, 1]$ with $y' = y \cdot 0.55$).
- **Primary & Secondary Radial**: $A \cdot \sin(\text{dist} \cdot \omega - t \cdot s)$
- **Directional Swells**: $A \cdot \sin(x \cdot \omega_x - t \cdot s_x) + A \cdot \sin(y \cdot \omega_y - t \cdot s_y) + A \cdot \sin((x+y) \cdot \omega_d - t \cdot s_d)$
- **Spiral Vortex**: $A \cdot \sin(\theta \cdot \text{arms} + \text{twist} \cdot \text{dist} - t \cdot s)$ where $\theta = \operatorname{atan2}(y', x)$
- **Depth / Tunnel**: $A \cdot \left(\frac{k}{\text{dist}^\gamma}\right) \cdot \sin(t \cdot s)$
- **Moiré Dual Emitter**: Interference between two focal emitters offset horizontally by $\Delta x$
- **Starfield & Cosmic Sparkle Matrix**: Procedural spatial hash with density thresholding, persistent base luminosity ($45\%-80\%$), and atmospheric sinusoidal twinkle scintillation.
- **Contrast & Bias Normalization**: $I_{\text{final}} = \operatorname{clamp}((I - 0.5) \cdot \text{contrast} + 0.5 + \text{bias}, 0, 1)$

### 3.2. Vector-Field Particle Advection (`src/engine/particles.ts`)
- **Spatial Gradient**: $\nabla f(x, y) = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}\right)$ via central finite differences:
  $$\frac{\partial f}{\partial x} \approx \frac{f(x + \epsilon, y) - f(x - \epsilon, y)}{2\epsilon}$$
- **Tangential Curl Field**: $\vec{v}_{\text{curl}} = \left(-\frac{\partial f}{\partial y}, \frac{\partial f}{\partial x}\right)$ creates rotational streamlines along wave contours.
- **Delta-Time Euler Integration**: Particle position $\vec{p}$ and velocity $\vec{v}$ update per frame with drag damping:
  $$\vec{v}_{t+\Delta t} = \vec{v}_t \cdot (1 - \mu) + (\alpha \nabla f + \beta \vec{v}_{\text{curl}}) \cdot \Delta t$$
- **Particle Lifespan & Stamping**: Particles deposit luminance onto the ASCII grid and sample character ramps based on age decay.

### 3.3. Live Bi-Directional Formula Sandbox
- The sandbox accepts arbitrary JavaScript formulas `fn(x, y, t, ...)` and `prepare(t, ...)`.
- Uses `compileCustomCode` to safely construct executable functions with runtime error trapping.
- Bi-directional sync parses mathematical constants from user code back into parametric sliders via AST / regex mapping.

### 3.4. State Serialization & Sharing (`src/engine/share.ts`)
- Entire animation state (formula, wave parameters, theme, particles, grid settings, auto-res preference) is compressed to a UTF-8 safe Base64 URL parameter.
- Opening a shared URL automatically switches the view into Fullscreen Viewfinder mode while allowing 1-click toggling back to editor mode.

---

## 4. Key Data Structures (`src/types/ascii.ts`)

| Interface | Purpose |
| :--- | :--- |
| `WaveParams` | Complete mathematical configuration for parametric wave generation |
| `ParticleConfig` | Lifespan, burst count, swirl/flow strength, and drag settings |
| `Preset` | Bundled configuration for presets (parametric or custom JavaScript) |
| `PhosphorTheme` | CRT color modes: `'green'`, `'amber'`, `'cyan'`, `'monochrome'`, `'matrix'`, `'paper'`, `'blood'` |
| `OptimizeConfig` | Target FPS, tab visibility throttling, and idle power saving |
| `FullAnimationState` | Root serialization interface for user presets and share URLs |

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
   - Avoid creating closures, arrays, or object allocations inside `evaluateParametricWave` or the per-cell renderer loop.
   - Pre-allocate scratch vectors or reuse typed buffers where possible.
2. **Brutalist Retro Aesthetic**:
   - Maintain the monospace CRT phosphor aesthetic defined in `src/styles/terminal.css`.
   - Ensure high contrast, scanline overlays, and responsive typography across all screen resolutions.
3. **State Integrity**:
   - When modifying `WaveParams` or `FullAnimationState`, update `src/types/ascii.ts`, `src/engine/share.ts`, and `src/engine/presets.ts` in sync.
   - User presets stored in `localStorage` under `ascii_builder_user_presets` must remain backward compatible.
4. **Keyboard Accessibility**:
   - Global hotkeys (`Space`, `F`, `R`, `Cmd+Z`, `Cmd+Shift+Z`) must not trigger when the user is actively typing in text inputs or code editors.
5. **Git & Push Constraint**:
   - When creating commits, stage and commit changes locally only.
   - **NEVER push to remote** (`git push`) unless explicitly requested by the user.

