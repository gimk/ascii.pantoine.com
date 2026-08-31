import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import * as THREE from 'three';
import {
  WaveParams,
  PhosphorTheme,
  CustomRenderContext,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  RasterOutputMode,
  DitherAlgorithm,
  DitherParams,
  ToneMappingConfig,
  ImageAdjustConfig,
  PostProcessConfig,
  VectorConfig,
  PrintConfig,
  PrintFrame,
  VectorFrame,
} from '../types/ascii';
import { renderSynthFrameData, MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from './renderer';
import { ProcessedRasterResult } from './rasterEngine';
import { renderModelFrameData } from './modelRenderer';
import { renderAsciiMediaFrameData } from './mediaRenderer';
import { overlaySourceLayer, overlaySourcePpc } from './imageExporter';
import { buildStages, composePostProcess, glowActive } from './postProcess';
import { DEFAULT_WAVE_PARAMS } from './math';
import { injectGifComment } from './mediaMetadata';
import { drawPixelRasterToCanvas } from './pixelRasterRenderer';
import { paintVectorFrame, vectorFrameErasesGround } from './vectorEngine';
import { resolvePrintFrame, printExportCellSize, SUPERSAMPLE_PROOF_DEFAULT } from './printEngine';

export interface GifExportOptions {
  name: string;
  type: 'parametric' | 'custom';
  params?: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  cols: number;
  rows: number;
  theme: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  crtConfig?: CrtConfig;
  duration?: number; // Duration in seconds (default: 2.0s)
  fps?: number; // Framerate (default: 15 fps)
  scale?: number; // Render resolution multiplier (1.0 or 1.5)
  appMode?: AppMode;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  // Live render settings, so exports match what the viewport shows
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  printConfig?: PrintConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
  /** The composite stage. Invariant 4 applies here as much as to a still. */
  postProcess?: PostProcessConfig;
}

/** Minimal shape every render mode returns, used to paint export frames. */
type ExportFrameResult = Pick<ProcessedRasterResult, 'text' | 'colors' | 'bgColor' | 'isColored'> & {
  luminance?: Float32Array | null;
  /** Screened plates in print mode. Resolved instead of text or cells. */
  print?: PrintFrame | null;
  /** Beam geometry in vector mode. Painted instead of text or cells. */
  vector?: VectorFrame | null;
};

const THEME_COLORS: Record<PhosphorTheme, { bg: string; text: string }> = {
  green: { bg: '#040905', text: '#00ff66' },
  amber: { bg: '#090602', text: '#ffb000' },
  cyan: { bg: '#03080a', text: '#00f0ff' },
  monochrome: { bg: '#0a0a0a', text: '#f0f0f0' },
  blood: { bg: '#0a0304', text: '#ff3344' },
  paper: { bg: '#f0eee6', text: '#151515' },
  matrix: { bg: '#040905', text: '#00ff66' },
};

function getThemeColors(
  theme: PhosphorTheme,
  customColor?: string,
  gradientConfig?: PhosphorGradient | null
): { bg: string; text: string } {
  const targetColor = gradientConfig ? gradientConfig.color1 : customColor;
  if (targetColor) {
    let cleaned = targetColor.replace('#', '').trim();
    if (cleaned.length === 3) cleaned = cleaned.split('').map((c) => c + c).join('');
    const num = parseInt(cleaned, 16);
    const [r, g, b] = Number.isNaN(num) ? [0, 255, 102] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 80) {
      return {
        bg: `rgb(${Math.round(244 - (255 - r) * 0.05)}, ${Math.round(242 - (255 - g) * 0.05)}, ${Math.round(236 - (255 - b) * 0.05)})`,
        text: `rgb(${r}, ${g}, ${b})`,
      };
    }
    return {
      bg: `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(b * 0.035 + 2))})`,
      text: `rgb(${r}, ${g}, ${b})`,
    };
  }
  return THEME_COLORS[theme] || THEME_COLORS.green;
}

/**
 * Records an animated GIF loop of the active ASCII animation in the browser.
 */
export async function exportAnimatedGif(
  opts: GifExportOptions,
  onProgress?: (progress: number, frame: number, total: number) => void
): Promise<Blob> {
  const {
    cols,
    rows,
    params,
    density,
    customCode,
    customPrepare,
    type,
    theme,
    customThemeColor,
    gradientConfig,
    crtConfig,
    duration = 2.0,
    fps = 15,
    scale = 1.0,
  } = opts;

  const rasterMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const isPixel = rasterMode === 'pixel';
  const isVector = rasterMode === 'vector';
  const isPrint = rasterMode === 'print';
  /* Same call as the still export: a screen artefact on paper is exactly wrong. */
  const noCrt = isPixel || isVector || isPrint;
  const showScanlines = !noCrt && (crtConfig ? crtConfig.scanlines : true);
  const showCrtGlow = !noCrt && (crtConfig ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false);
  const showVignette = !noCrt && (crtConfig ? crtConfig.vignette : false);
  /* Stands down while the post-processing glow drives — see imageExporter. */
  const showPhosphorBloom =
    !noCrt &&
    !glowActive(opts.postProcess) &&
    (crtConfig ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false);

  // Wait for fonts to be ready so canvas typography is crisp
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const totalFrames = Math.max(2, Math.round(duration * fps));
  // delay in ms for gifenc
  const delayMs = Math.round(1000 / fps);

  // Character cell dimensions on canvas (1:1 square for pixel mode, 0.6015 monospace aspect for ASCII)
  const printProofSs = opts.printConfig?.proofSupersample ?? SUPERSAMPLE_PROOF_DEFAULT;
  const printCell = printExportCellSize(scale, printProofSs);
  const charWidth = isPrint ? printCell : isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
  const charHeight = isPrint ? printCell : isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Setup offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

  const { bg, text } = getThemeColors(theme, customThemeColor, gradientConfig);

  // Pre-generate linear gradient for text if active
  let textFillStyle: string | CanvasGradient = text;
  if (gradientConfig) {
    const rad = (gradientConfig.angle * Math.PI) / 180;
    const x2 = Math.cos(rad) * width;
    const y2 = Math.sin(rad) * height;
    const grad = ctx.createLinearGradient(0, 0, Math.abs(x2) || width, Math.abs(y2) || height);
    grad.addColorStop(0, gradientConfig.color1);
    grad.addColorStop(1, gradientConfig.color2);
    textFillStyle = grad;
  }

  // Compile custom code if needed
  let customRenderFn: any;
  let prepareFn: any;
  let customContext: CustomRenderContext = {};

  if (type === 'custom' && customCode) {
    try {
      customRenderFn = new Function(
        'x', 'y', 'time', 'dist', 'dx', 'dy', 'cols', 'rows', 'angle', 'ctx',
        customCode
      );
      if (customPrepare) {
        prepareFn = new Function('time', 'cols', 'rows', 'ctx', customPrepare);
      }
    } catch {}
  }

  const gif = GIFEncoder();
  const timeSpeed = (params?.timeSpeed || 1.0);

  /*
   * Resolved once, outside the loop: it depends only on the export geometry,
   * not on the frame. The *layer* is rebuilt every frame, because a video
   * source and an orbiting model both move.
   */
  const sourcePpc = overlaySourcePpc(opts.postProcess, charWidth, charHeight);

  for (let i = 0; i < totalFrames; i++) {
    const t = i * (1 / fps) * timeSpeed;

    let frameResult: ExportFrameResult | null = null;

    if (opts.appMode === 'model' && opts.geometry && opts.modelConfig && opts.modelViewConfig) {
      frameResult = renderModelFrameData({
        cols,
        rows,
        time: t,
        density,
        geometry: opts.geometry,
        modelConfig: opts.modelConfig,
        viewConfig: opts.modelViewConfig,
        colorConfig: opts.mediaColorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig,
        printConfig: opts.printConfig,
        printTier: 'proof',
        toneConfig: opts.toneConfig,
        adjustConfig: opts.adjustConfig,
        sourceCapture: sourcePpc,
      });
    } else if (opts.appMode === 'media' && opts.mediaConfig && opts.mediaViewConfig && opts.mediaElement) {
      frameResult = renderAsciiMediaFrameData({
        cols,
        rows,
        mediaElement: opts.mediaElement,
        mediaConfig: opts.mediaConfig,
        viewConfig: opts.mediaViewConfig,
        density,
        colorConfig: opts.mediaColorConfig || opts.mediaViewConfig.colorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig || opts.mediaViewConfig.vectorConfig,
        printConfig: opts.printConfig || opts.mediaViewConfig.printConfig,
        printTier: 'proof',
        toneConfig: opts.toneConfig,
      });
    } else {
      frameResult = renderSynthFrameData({
        cols,
        rows,
        time: t,
        density,
        trailPoints: [],
        waveParams: params || DEFAULT_WAVE_PARAMS,
        customRenderFn,
        prepareFn,
        customContext,
        interactiveInfluence: false,
        colorConfig: opts.mediaColorConfig,
        rasterMode,
        algorithm: opts.ditherAlgorithm,
        ditherParams: opts.ditherParams,
        vectorConfig: opts.vectorConfig,
        printConfig: opts.printConfig,
        printTier: 'proof',
        toneConfig: opts.toneConfig,
        adjustConfig: opts.adjustConfig,
      });
    }

    const lines = (frameResult?.text || '').split('\n');
    const isColored = Boolean(frameResult?.isColored && frameResult?.colors);
    /* A print's ground is its paper, which the frame already carries. */
    const effectiveBg = (isColored || isPrint) && frameResult ? frameResult.bgColor : bg;

    const stages = buildStages(
      opts.postProcess,
      overlaySourceLayer({
        postProcess: opts.postProcess,
        appMode: opts.appMode,
        rasterMode,
        cols,
        rows,
        ppc: sourcePpc,
        mediaElement: opts.mediaElement,
        mediaConfig: opts.mediaConfig,
        resampling: opts.mediaViewConfig?.resampling,
        luminance: frameResult?.luminance ?? null,
      })
    );

    if (isPrint) {
      /*
       * Every animated frame is a proof render, resolved through the same
       * function the viewport and the still export use. Slow by nature —
       * screening scales with device pixels and there is no reusing a plate
       * between frames, because the image under it moved.
       */
      const img = frameResult?.print
        ? resolvePrintFrame(
            frameResult.print,
            width,
            height,
            opts.printConfig?.yuleNielsen ?? 1,
            opts.printConfig?.soloInk ?? null
          )
        : null;
      composePostProcess({
        ctx,
        width,
        height,
        stages,
        scale,
        paintRaster: (target) => {
          if (img) target.putImageData(img, 0, 0);
        },
      });
    } else if (isVector) {
      /*
       * Re-strokes per frame at export scale. Phase is advanced by the caller
       * through vectorConfig, so the carrier and ripple drift across the
       * animation instead of every frame being identical.
       */
      composePostProcess({
        ctx,
        width,
        height,
        stages,
        scale,
        /* The beam erases its occlusion polygons; keep them off the ground. */
        isolateRaster: vectorFrameErasesGround(frameResult?.vector),
        bgColor: effectiveBg,
        paintRaster: (target) => {
          if (!frameResult?.vector) return;
          target.save();
          target.scale(scale, scale);
          paintVectorFrame(target, frameResult.vector);
          target.restore();
        },
      });
    } else if (isPixel && frameResult?.luminance) {
      const lum = frameResult.luminance;
      const cellColors = frameResult.colors;
      composePostProcess({
        ctx,
        width,
        height,
        stages,
        scale,
        /* Ground out of the cell painter, or an `under` overlay is hidden. */
        bgColor: effectiveBg,
        paintRaster: (target) => {
          drawPixelRasterToCanvas({
            ctx: target,
            cols,
            rows,
            luminance: lum,
            colors: cellColors,
            bgColor: 'transparent',
            fgColor: text,
            cellWidth: charWidth,
            cellHeight: charHeight,
            dpr: 1,
          });
        },
      });
    } else {
      // The CRT decorations are ground; only the glyphs are the raster layer.
      const paintBase = (target: CanvasRenderingContext2D) => {
        target.fillStyle = effectiveBg;
        target.fillRect(0, 0, width, height);

        // Optional CRT Centered Ambient Background Glow
        if (showCrtGlow && !isColored) {
          const ambientGlow = target.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) * 0.7
          );
          const baseGlowHex = gradientConfig ? gradientConfig.color1 : (customThemeColor || text);
          let glowColor = baseGlowHex;
          if (baseGlowHex.startsWith('#')) {
            const hex = baseGlowHex.slice(1);
            const fullHex = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
            if (fullHex.length === 6) {
              const r = parseInt(fullHex.slice(0, 2), 16);
              const g = parseInt(fullHex.slice(2, 4), 16);
              const b = parseInt(fullHex.slice(4, 6), 16);
              glowColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
            }
          }
          ambientGlow.addColorStop(0, glowColor);
          ambientGlow.addColorStop(1, 'transparent');
          target.fillStyle = ambientGlow;
          target.fillRect(0, 0, width, height);
        }

        // CRT Scanlines on background
        if (showScanlines) {
          target.fillStyle = 'rgba(0, 0, 0, 0.3)';
          const step = Math.max(2, Math.round(3 * scale));
          for (let y = 0; y < height; y += step) {
            target.fillRect(0, y, width, 1);
          }
        }
      };

      const paintGlyphs = (target: CanvasRenderingContext2D) => {
        target.font = `${Math.round(10 * scale)}px 'JuliaMono', 'Noto Sans Mono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
        target.textBaseline = 'top';
        target.textAlign = 'left';

        if (!isColored && showPhosphorBloom && gradientConfig) {
          // Direct directional gradient bloom matching character gradient
          target.save();
          target.filter = `blur(${Math.max(2, Math.round(3.5 * scale))}px)`;
          target.fillStyle = textFillStyle;
          for (let row = 0; row < lines.length && row < rows; row++) {
            const line = lines[row];
            if (line) target.fillText(line, 0, Math.round(row * charHeight));
          }
          target.restore();
        } else if (!isColored && showPhosphorBloom) {
          target.shadowColor = text;
          target.shadowBlur = Math.round(3 * scale);
        } else {
          target.shadowBlur = 0;
        }

        // Main sharp text render
        if (isColored && frameResult?.colors) {
          const colors = frameResult.colors;
          for (let row = 0; row < rows; row++) {
            const line = lines[row] || '';
            for (let col = 0; col < cols && col < line.length; col++) {
              const ch = line[col];
              if (ch && ch !== ' ') {
                const cIdx = (row * cols + col) * 3;
                target.fillStyle = `rgb(${colors[cIdx]}, ${colors[cIdx + 1]}, ${colors[cIdx + 2]})`;
                target.fillText(ch, Math.round(col * charWidth), Math.round(row * charHeight));
              }
            }
          }
        } else {
          target.fillStyle = textFillStyle;
          for (let row = 0; row < lines.length && row < rows; row++) {
            const line = lines[row];
            if (line) {
              target.fillText(line, 0, Math.round(row * charHeight));
            }
          }
        }

        target.shadowBlur = 0;
      };

      composePostProcess({
        ctx,
        width,
        height,
        stages,
        scale,
        paintBase,
        paintRaster: paintGlyphs,
      });
    }

    // 4. Optional CRT Corner Vignette
    if (showVignette) {
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.35,
        width / 2, height / 2, Math.max(width, height) * 0.7
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 4. Quantize and write frame
    const imgData = ctx.getImageData(0, 0, width, height);
    const palette = quantize(imgData.data, 256);
    const index = applyPalette(imgData.data, palette);

    gif.writeFrame(index, width, height, {
      palette,
      delay: delayMs,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFrames) * 100), i + 1, totalFrames);
    }

    // Yield execution every 2 frames for smooth UI progress
    if (i % 2 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  gif.finish();
  const bytes = gif.bytesView();
  return injectGifComment(
    bytes,
    `Generated with Dither Studio (https://studio.pantoine.com) - ${opts.name} (${opts.appMode || 'synth'})`
  );
}
