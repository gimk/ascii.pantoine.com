# Raster Studio

[![Live Demo](https://img.shields.io/badge/Live_App-ascii.pantoine.com-00FF66?style=for-the-badge&logo=google-chrome&logoColor=black)](https://ascii.pantoine.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> An interactive, brutalist terminal-styled procedural visual synthesis suite, multi-modality rasterizer (ASCII, Braille, Halftones, Pixel Dither), 3D model engine, 2D media processor, and live mathematical sandbox.
>
> 🚀 **No installation or download required — run it directly in your browser at [ascii.pantoine.com](https://ascii.pantoine.com).**

---

## ✦ Overview

**Raster Studio** (v2.0) lets you synthesize complex procedural visual fields, rasterize 2D media and 3D meshes into real-time ASCII, Braille, Halftone screen prints, and pixel dithered artworks. Fine-tune your visuals with 40+ professional dithering algorithms, 30+ curated color palettes (Game Boy, CGA, C64, Risograph, CMYK, Cyberpunk), live tone mapping curves, vector SVG exporters, animated GIFs, and HD videos directly from your browser.

---

## ✦ Features

### 🌐 Live Online & Zero-Setup
- **Instant Browser Access**: Available 24/7 at [**ascii.pantoine.com**](https://ascii.pantoine.com) — no installation, account, or local setup required.
- **Mobile & Touch-Optimized**: Fully responsive brutalist interface with compact touch-friendly controls for phones, tablets, and desktops.

### 🔲 Universal Multi-Modality Raster Engine (`MODALITIES`)
- **ASCII & Unicode Typographic**: Classic dense character sets, box-drawing glyphs, and quadrant blocks.
- **Unicode Braille Matrix**: $2 \times 4$ subpixel bitmap mapping to authentic Unicode `U+2800..U+28FF` Braille glyphs.
- **Halftone Dot Screen**: Circular, square, and diamond halftone dots with configurable screen frequency, angles, and contrast.
- **Halftone Line & Crosshatch Screens**: Multi-pass engraving and newspaper crosshatch line grids.
- **CMYK 4-Pass Rosette Screens**: Authentic print process color separations (Cyan $15^\circ$, Magenta $75^\circ$, Yellow $0^\circ$, Black $45^\circ$).
- **1-Bit Pixel Dither**: High-contrast pure bitmapped aesthetic for retro pixel-art rendering.

### 🎛️ 40+ Dithering Algorithms Suite (`DITHER`)
- **Error Diffusion**: Floyd-Steinberg, False Floyd-Steinberg, Atkinson, Sierra-3, Two-Row Sierra, Sierra Lite, Stucki, Jarvis-Judice-Ninke, Burkes, Fan, Shiau-Fan, Ostromoukhov.
- **Ordered Matrices**: Bayer 2x2, 4x4, 8x8, 16x16, Clustered Dot 4x4 & 8x8, Diagonal Lines, Crosshatch, Spiral Dot.
- **Blue Noise & Stochastic**: Blue Noise 16x16, Void-and-Cluster, Gaussian Film Grain, Interleaved Gradient Noise.
- **Space-Filling & Algorithmic**: Knuth Dot Diffusion, Hilbert Curve, Peano, R-Sequence.
- **Modulation & Glitch**: Scanline Phase Shift, Sine Wave Drift, Glitch Displacement, Dynamic Thresholding.

### 🎨 30+ Curated Palettes & CIELAB Tone Mapping (`COLOR`)
- **Retro Hardware & Consoles**: Game Boy Classic/Pocket/Light, CGA 1 & 2, Commodore 64, Apple II, ZX Spectrum, PICO-8, Teletext.
- **Print & Inks**: Risograph Fluorescent Pink/Blue/Yellow/Green, CMYK Process Inks.
- **Design & Themes**: Cyberpunk, Acid Techno, Bauhaus, Swiss Design, Solarized, Nord, Dracula, Vaporwave.
- **Perceptual Matching**: Accurate sRGB to CIELAB CIE76 $\Delta E^*$ color distance quantization.
- **Tone Mapping**: 1-bit to 4-bit bit depth posterizer, RGB channel mixer, and monotone cubic spline curve adjustments.

### 🎛️ 8-Channel Parametric Wave Synthesizer (`SYNTH`)
- **Harmonic Radial Waves**: Primary & secondary radial oscillators with frequency, amplitude, and phase controls.
- **Directional Orthogonal Swells**: $X$, $Y$, and diagonal ($X+Y$) plane waves.
- **Angular Spiral Vortex**: Multi-arm spiral twisters with configurable angular velocity and twist factors.
- **3D Depth / Tunnel Warping**: Inverse distance depth warping and concentric pulsating rings.
- **Moiré Dual Emitters**: Dual-emitter frequency interference patterns.
- **Starfield & Cosmic Sparkle Matrix**: Procedural celestial starfield with atmospheric twinkle scintillation.

### ✨ Vector-Field Particle Physics Engine (`PARTICLES`)
- **Real-Time Advection**: Particles ride finite-difference spatial gradients ($\nabla f$) and tangential curl flow fields.
- **Delta-Time Physics**: Framerate-independent lifespan, speed integration, and turbulence damping.
- **Interactive Bursts**: Click or drag directly on the canvas to spawn responsive particle bursts.

### 📦 Multi-Format Media, Vector & Code Exporters (`EXPORT`)
- **Vector SVG (`.svg`)**: Resolution-independent vector SVG exports for halftones, braille, and ASCII.
- **High-DPI PNG & JPG (`.png` / `.jpg`)**: Ultra crisp multi-scale still renders.
- **Animated GIF Exporter (`.gif`)**: Client-side animated GIF rendering via `gifenc` with custom duration and scale.
- **HD Video Exporter (`.mp4` / `.webm`)**: Direct WebCodecs / MediaRecorder capture for web and social media.
- **Astro Component (`.astro`)**: Self-contained component with embedded animation loop.
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

