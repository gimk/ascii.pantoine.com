# ASCII Animation Builder

> An interactive, brutalist terminal-styled ASCII animation synthesizer and live formula sandbox. Inspired by the wave mathematics of `HeroAscii.astro`.

---

## ✦ Features

- **100% Parametric Wave Synthesizer (`SYNTH`)**:
  - Primary & Secondary Harmonic Radial Waves
  - Directional Orthogonal Swells ($X$, $Y$, and Diagonal $X+Y$)
  - Angular Spiral Vortex with twist factors ($\sin(\theta \cdot \text{arms})$)
  - 3D Depth / Inverse Distance Tunnel Warping ($k / \text{dist}$)
  - Concentric Harmonic Rings & Pulsing Core
  - Dual Emitter Frequency Interference (Moiré patterns)
  - Calibrated true-circle aspect ratio compensation (`0.55`)

- **Dynamic Vector-Field Particle Physics (`PARTICLES`)**:
  - Real-time finite difference spatial gradient ($\nabla f$) and tangential curl flow advection
  - Particles dynamically ride and swirl along the contours of any active wave simulation
  - Framerate-independent lifespan and velocity integration using delta-time physics
  - Interactive click burst generation & customizable trail character sets

- **Live Bi-Directional Formula Sandbox (`FORMULA`)**:
  - Real-time JavaScript formula editor with live keystroke compilation
  - Seamless bi-directional synchronization: mathematical parameters edited in code automatically parse and update synth sliders without animation interruption
  - Instant syntax & runtime error catching

- **Performance & CPU Optimization (`OPTIMIZE`)**:
  - **1-Click Performance Profiles**: `MAIN / HERO` (60 FPS), `BACKGROUND` (30 FPS), `SECONDARY` (20 FPS), `ECO / MOBILE` (15 FPS)
  - Framerate Limiter with high-precision interval pacing
  - Smart power saving: pause on inactive tabs (0% background CPU) & idle framerate throttling
  - Decoupled grid resolution matrix with quick presets (`50x25`, `70x35`, `100x50`, `120x60`, `150x75`)

- **Retro Aesthetic & Customization (`THEME`)**:
  - 6 Phosphor CRT color palettes: *Matrix Green*, *Amber CRT*, *Cyber Cyan*, *Mono White*, *Crimson Red*, *Paper Print*
  - 8 Character density ramps + custom character ramp input

- **Multi-Format Code Exporters (`EXPORT CODE`)**:
  - Drop-in Astro component (`.astro`) with self-contained field advection loop
  - Standalone single-file HTML (`.html`)
  - JSON configuration presets (`.json`)
  - Instant text snapshot copy (`.txt`)

- **State History & Controls**:
  - Undo & Redo stack with keyboard shortcuts (`Cmd+Z` / `Ctrl+Z`, `Cmd+Shift+Z` / `Ctrl+Y`)
  - Play / Pause, single-frame step, time reset, and interactive mouse coordinates

---

## ✦ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm` / `yarn`

### Installation

```bash
# Clone the repository
git clone https://github.com/gimk/ascii.pantoine.com.git
cd ascii.pantoine.com

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production Build

```bash
npm run build
npm run preview
```

---

## ✦ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler**: [Vite 6](https://vitejs.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Typography**: [JetBrains Mono](https://www.jetbrains.com/lp/mono/)

---

## ✦ License

MIT © [gimk](https://github.com/gimk)
