# ASCII Wave Generator

[![Live Demo](https://img.shields.io/badge/Live_App-ascii.pantoine.com-00FF66?style=for-the-badge&logo=google-chrome&logoColor=black)](https://ascii.pantoine.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> An interactive, brutalist terminal-styled ASCII wave synthesizer, particle physics simulator, and live formula sandbox.
>
> 🚀 **No installation or download required — run it directly in your browser at [ascii.pantoine.com](https://ascii.pantoine.com).**

---

## ✦ Overview

**ASCII Wave Generator** (`A.W.G`) lets you synthesize complex, retro-futuristic ASCII wave animations in real time using parametric math equations or dynamic vector fields. Fine-tune your visuals with deep parametric sliders, write raw JavaScript math formulas on the fly, simulate curl-noise particle physics, and export ready-to-use standalone code, animated GIFs, or HD videos directly from your browser.

---

## ✦ Features

### 🌐 Live Online & Zero-Setup
- **Instant Browser Access**: Available 24/7 at [**ascii.pantoine.com**](https://ascii.pantoine.com) — no installation, account, or local setup required.
- **Mobile & Touch-Optimized**: Fully responsive brutalist interface (`A.W.G`) with compact touch-friendly controls for phones, tablets, and desktops.

### 🎛️ 8-Channel Parametric Wave Synthesizer (`SYNTH`)
- **Harmonic Radial Waves**: Primary & secondary radial oscillators with frequency, amplitude, and phase controls.
- **Directional Orthogonal Swells**: $X$, $Y$, and diagonal ($X+Y$) plane waves.
- **Angular Spiral Vortex**: Multi-arm spiral twisters with configurable angular velocity and twist factors ($\sin(\theta \cdot \text{arms})$).
- **3D Depth / Tunnel Warping**: Inverse distance depth warping ($k / \text{dist}$) and concentric pulsating rings.
- **Moiré Dual Emitters**: Dual-emitter frequency interference patterns.
- **Starfield & Cosmic Sparkle Matrix**: Procedural celestial starfield with quantity density, baseline magnitude, and atmospheric twinkle scintillation.
- **Aspect Ratio Compensation**: Calibrated true-circle geometry compensation (`0.55`) for monospace character grids.

### ✨ Vector-Field Particle Physics Engine (`PARTICLES`)
- **Real-Time Advection**: Particles ride finite-difference spatial gradients ($\nabla f$) and tangential curl flow fields derived from any active wave simulation.
- **Delta-Time Physics**: Framerate-independent lifespan, speed integration, and turbulence damping.
- **Interactive Bursts**: Click or drag directly on the canvas to spawn responsive particle bursts.
- **Dynamic Character Trails**: Particle trails automatically adapt to the active character ramp density.

### 💻 Live Bi-Directional Formula Sandbox (`FORMULA`)
- **Real-Time JS Compiler**: Live code editor compiling keystroke-by-keystroke with instant syntax error catching.
- **Bi-Directional Sync**: Mathematical parameters modified in code automatically update UI sliders without interrupting the animation loop.
- **Custom `prepare(t)` & `fn(x, y, t)`**: Define custom per-frame variable computations and per-cell spatial equations.

### 🎨 Retro Phosphor Themes & Gradient System (`THEME`)
- **Single Color & Phosphor Gradients**: 6 classic CRT phosphor themes plus 8 curated two-tone gradients (*Cyberpunk Neon*, *Synthwave Sunset*, *Aurora Borealis*, *Solar Flare*, *Toxic Slime*, etc.).
- **Interactive Rotary Dial Knob**: Drag smoothly around the rotary dial ($0^\circ - 360^\circ$) or snap directly to cardinal angles.
- **Chromatic Phosphor Bloom**: Multi-pass directional character halo radiating directly in the active gradient colors and angle.
- **Subtle CRT Glow & Scanlines**: Ambient radial center glow, cathode-ray scanlines, and corner vignettes.

### 📦 Multi-Format Media & Code Exporters (`EXPORT`)
- **Animated GIF Exporter (`.gif`)**: Client-side animated GIF rendering via `gifenc` with custom duration, FPS, and scale.
- **HD Video Exporter (`.mp4` / `.webm`)**: Direct WebCodecs / MediaRecorder capture for web and social media.
- **Astro Component (`.astro`)**: Self-contained component with embedded animation loop and particle advection.
- **Standalone HTML (`.html`)**: Single-file plug-and-play HTML document.
- **JSON Configuration (`.json`)**: Reusable state configuration object.
- **Text Snapshot (`.txt`)**: Instant ASCII frame clipboard copy.

### 🔗 Shareable URLs & Fullscreen Viewfinder (`SHARE`)
- **Instant URL Sharing**: Compress and encode your entire animation state (formula, wave parameters, particle physics, themes, gradients, grid settings) into a single shareable link.
- **Fullscreen Viewfinder**: Minimalist presentation/zen mode featuring floating HUD controls, real-time FPS readout, and dynamic resolution scaling.

### ⚡ Dynamic Auto-Resolution & Grid Engine (`OPTIMIZE`)
- **Dynamic Auto-Res (`Auto Res`)**: Intelligently calculates the optimal character grid dimensions to fill your browser window or container while preserving aspect ratio.
- **Decoupled Grid Presets**: Quick matrix resolutions (`50x25`, `70x35`, `100x50`, `120x60`, `150x75`) with custom dimension overrides.
- **Performance Profiles**: `MAIN / HERO` (60 FPS), `BACKGROUND` (30 FPS), `SECONDARY` (20 FPS), and `ECO / MOBILE` (15 FPS).
- **Smart Power Saving**: Automatic pausing on inactive tabs (0% CPU) and idle framerate throttling.

---

## ✦ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause animation |
| <kbd>.</kbd> / <kbd>&gt;</kbd> | Step forward 1 frame |
| <kbd>,</kbd> / <kbd>&lt;</kbd> | Step backward / Reset time |
| <kbd>F</kbd> | Toggle Fullscreen Viewfinder |
| <kbd>R</kbd> | Randomize animation parameters |
| <kbd>Cmd</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo last change |
| <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Redo change |
| <kbd>Click / Drag</kbd> | Spawn particle burst at cursor |

---

## ✦ Local Development

If you'd like to clone and run the project locally:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`, `pnpm`, or `yarn`

### Setup

```bash
# Clone the repository
git clone https://github.com/gimk/ascii.pantoine.com.git
cd ascii.pantoine.com

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

---

## ✦ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/)
- **Bundler**: [Vite 6](https://vitejs.dev/)
- **Media Capture**: [gifenc](https://github.com/mattdesl/gifenc) & Canvas MediaStreamRecorder
- **Icons**: [Lucide React](https://lucide.dev/)
- **Typography**: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) & [JuliaMono](https://juliamono.netlify.app/)

---

## ✦ License

MIT © [gimk](https://github.com/gimk)

