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
  VectorFrame,
} from '../types/ascii';
import { renderSynthFrameData, MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT, MONOSPACE_CELL_ASPECT } from './renderer';
import { renderModelFrameData, getModelSourceCanvas } from './modelRenderer';
import { renderAsciiMediaFrameData, renderMediaSourceCanvas } from './mediaRenderer';
import {
  buildStages,
  composePostProcess,
  glowActive,
  gradedSourceCanvas,
  overlayActive,
  postProcessSvgFilter,
  resolvePostProcess,
  sourceOverlaySvg,
} from './postProcess';
import { DEFAULT_WAVE_PARAMS } from './math';
import { injectPngMetadata, injectJpegComment } from './mediaMetadata';
import { drawPixelRasterToCanvas, exportPixelRasterToSvg } from './pixelRasterRenderer';
import { paintVectorFrame, vectorFrameToSvg } from './vectorEngine';


export interface ImageExportOptions {
  name: string;
  format?: 'png' | 'jpg' | 'svg';
  quality?: number; // 0.1 to 1.0 (for JPEG)
  scale?: number; // 1.0, 1.5, 2.0, 3.0, 4.0
  transparentBg?: boolean;
  includeCrtGlow?: boolean;
  includeScanlines?: boolean;
  includeVignette?: boolean;
  includePhosphorBloom?: boolean;

  // Animation / Time state
  time?: number;
  currentAsciiFrame?: string;

  // Preset & Configuration
  type?: 'parametric' | 'custom';
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

  // Feature Modes
  appMode?: AppMode;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
  /** The composite stage. Invariant 4 applies: forward it or the file differs. */
  postProcess?: PostProcessConfig;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
}

export interface ImageExportResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  extension: '.png' | '.jpg' | '.svg';
}

export interface PrintPlateResult {
  name: string;
  colorHex: string;
  blob: Blob;
  url: string;
}

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

export interface ExportFrame {
  text: string;
  luminance: Float32Array | null;
  colors: Uint8ClampedArray | null;
  /** Background actually used: the theme's, or the frame's own once it is coloured. */
  bgColor: string;
  /** Foreground for the monochrome paths, where `colors` is null. */
  fgColor: string;
  rasterMode: RasterOutputMode;
  /** Beam geometry in vector mode; null otherwise. Mutually exclusive with `text`. */
  vector: VectorFrame | null;
  /**
   * The ungraded source, framed identically, for the post-processing overlay.
   * Null when the overlay is off, or in synth mode, which has no source
   * distinct from the field it already rendered.
   */
  sourceLayer: CanvasImageSource | null;
}

/** Output pixels per grid cell at a given export scale, per invariant 7. */
export function exportCellSize(
  rasterMode: RasterOutputMode,
  scale: number
): { cellWidth: number; cellHeight: number } {
  if (rasterMode === 'vector') return { cellWidth: scale, cellHeight: scale };
  if (rasterMode === 'pixel') {
    const s = Math.max(1, Math.round(scale));
    return { cellWidth: s, cellHeight: s };
  }
  return { cellWidth: MONOSPACE_CELL_WIDTH * scale, cellHeight: MONOSPACE_CELL_HEIGHT * scale };
}

/**
 * What resolution the overlay's source layer should be rendered at, or
 * `undefined` when nothing needs rendering.
 *
 * `undefined` is the cost gate the whole feature hangs off: the model renderer
 * only does its second GPU pass when handed one of these, and the media
 * renderer only redraws when asked.
 */
export function overlaySourcePpc(
  cfg: PostProcessConfig | undefined,
  cellWidth: number,
  cellHeight: number
): { cellWidth: number; cellHeight: number } | undefined {
  if (!overlayActive(cfg)) return undefined;
  const o = resolvePostProcess(cfg).sourceOverlay;
  if (o.source !== 'original') return undefined;
  return { cellWidth: cellWidth * o.quality, cellHeight: cellHeight * o.quality };
}

/**
 * The overlay layer for one already-rendered frame.
 *
 * Shared by the still, GIF and video exporters. They each dispatch to the mode
 * renderers themselves rather than through `renderExportFrame`, which is
 * exactly the shape that let invariant 4 be violated once already — so the one
 * piece they can share, they share.
 */
export function overlaySourceLayer(params: {
  postProcess?: PostProcessConfig;
  appMode?: AppMode;
  rasterMode: RasterOutputMode;
  cols: number;
  rows: number;
  ppc?: { cellWidth: number; cellHeight: number };
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  mediaConfig?: MediaConfig;
  resampling?: MediaViewConfig['resampling'];
  luminance?: Float32Array | null;
}): CanvasImageSource | null {
  const { postProcess, appMode, rasterMode, cols, rows, ppc } = params;
  if (!overlayActive(postProcess)) return null;

  /*
   * `graded` is source-agnostic — it is the pipeline's own output buffer — so
   * synth gets an overlay through this branch even though it has no original
   * to re-frame.
   */
  if (resolvePostProcess(postProcess).sourceOverlay.source === 'graded') {
    return gradedSourceCanvas(params.luminance ?? null, cols, rows);
  }
  if (!ppc) return null;

  if (appMode === 'media' && params.mediaElement && params.mediaConfig) {
    return renderMediaSourceCanvas({
      mediaElement: params.mediaElement,
      mediaConfig: params.mediaConfig,
      cols,
      rows,
      cellWidth: ppc.cellWidth,
      cellHeight: ppc.cellHeight,
      cellAspect: rasterMode === 'ascii' ? MONOSPACE_CELL_ASPECT : 1.0,
      resampling: params.resampling || 'bilinear',
    });
  }
  if (appMode === 'model') return getModelSourceCanvas();
  return null;
}

/**
 * Renders one frame at export resolution, through the same mode renderer the
 * viewport uses.
 *
 * Extracted so the still export and the colour-separation export cannot drift
 * apart. pipeline.md invariant 4 is that every export path must forward
 * rasterMode, ditherAlgorithm, toneConfig and adjustConfig, and that missing
 * one silently produces an export different from what is on screen -- a second
 * hand-copied dispatch is exactly how that happens again.
 */
export function renderExportFrame(opts: ImageExportOptions): ExportFrame {
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
    time = 0,
    currentAsciiFrame,
  } = opts;

  const rasterMode: RasterOutputMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const { bg, text: fgColor } = getThemeColors(theme, customThemeColor, gradientConfig);

  let frameText = currentAsciiFrame || '';
  let frameLuminance: Float32Array | null = null;
  let frameColors: Uint8ClampedArray | null = null;
  let frameVector: VectorFrame | null = null;
  let sourceLayer: CanvasImageSource | null = null;
  let effectiveBg = bg;

  /*
   * The overlay layer is produced at the *export's* cell size, so a 4x PNG
   * gets a 4x source rather than the viewport's copy blown up. Everything the
   * post chain measures in pixels scales the same way.
   */
  const { cellWidth: exportCellW, cellHeight: exportCellH } = exportCellSize(
    rasterMode,
    opts.scale ?? 2.0
  );
  const sourcePpc = overlaySourcePpc(opts.postProcess, exportCellW, exportCellH);

  if (opts.appMode === 'media' && opts.mediaConfig && opts.mediaViewConfig && opts.mediaElement) {
    const res = renderAsciiMediaFrameData({
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
      toneConfig: opts.toneConfig,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
    frameVector = res.vector || null;
    if (res.isColored || res.vector) effectiveBg = res.bgColor;
  } else if (opts.appMode === 'model' && opts.geometry && opts.modelConfig && opts.modelViewConfig) {
    const res = renderModelFrameData({
      cols,
      rows,
      time,
      density,
      geometry: opts.geometry,
      modelConfig: opts.modelConfig,
      viewConfig: opts.modelViewConfig,
      colorConfig: opts.mediaColorConfig,
      rasterMode,
      algorithm: opts.ditherAlgorithm,
      ditherParams: opts.ditherParams,
      vectorConfig: opts.vectorConfig,
      toneConfig: opts.toneConfig,
      adjustConfig: opts.adjustConfig,
      sourceCapture: sourcePpc,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
    frameVector = res.vector || null;
    if (res.vector) effectiveBg = res.bgColor;
  } else {
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
          prepareFn(time, cols, rows, customContext);
        }
      } catch {}
    }

    const res = renderSynthFrameData({
      cols,
      rows,
      time,
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
      toneConfig: opts.toneConfig,
      adjustConfig: opts.adjustConfig,
    });
    frameText = res.text;
    frameLuminance = res.luminance;
    frameColors = res.colors;
    frameVector = res.vector || null;
    if (res.isColored || res.vector) effectiveBg = res.bgColor;
  }

  sourceLayer = overlaySourceLayer({
    postProcess: opts.postProcess,
    appMode: opts.appMode,
    rasterMode,
    cols,
    rows,
    ppc: sourcePpc,
    mediaElement: opts.mediaElement,
    mediaConfig: opts.mediaConfig,
    resampling: opts.mediaViewConfig?.resampling,
    luminance: frameLuminance,
  });

  return {
    text: frameText,
    luminance: frameLuminance,
    colors: frameColors,
    bgColor: effectiveBg,
    fgColor,
    rasterMode,
    vector: frameVector,
    sourceLayer,
  };
}

/**
 * Wrap a rendered SVG body in a document carrying the source overlay.
 *
 * `mix-blend-mode` is CSS, and the same value the viewport uses, so the two
 * agree by construction. Browsers honour it; Illustrator and Figma are
 * inconsistent about blend on a raster `<image>`, which the export UI says
 * rather than the code pretending otherwise.
 */
function wrapSvgWithOverlay(
  body: string,
  overlayUrl: string,
  width: number,
  height: number,
  placement: 'under' | 'over',
  cfg: PostProcessConfig | undefined,
  background: string | null
): string {
  const image = sourceOverlaySvg(cfg, overlayUrl, width, height);
  const blend = resolvePostProcess(cfg).sourceOverlay.blend;
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  if (background) parts.push(`<rect width="${width}" height="${height}" fill="${background}"/>`);
  /*
   * `isolation: isolate` pins the blend to these two layers. Without it the
   * blend reaches the background rect and, in a browser, whatever the SVG is
   * embedded on top of.
   */
  parts.push(`<g style="isolation:isolate">`);
  if (placement === 'under') {
    // Under: the *content* carries the blend, so the result is blend(source,
    // raster) rather than blend(raster, source). Not the same picture.
    parts.push(sourceOverlaySvgNormal(cfg, overlayUrl, width, height));
    parts.push(`<g style="mix-blend-mode:${blend}">`);
    parts.push(body);
    parts.push(`</g>`);
  } else {
    parts.push(body);
    parts.push(image);
  }
  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join('\n');
}

/**
 * Take the `<svg>` shell and its background rect off a finished document so it
 * can be nested as content. The wrapper supplies both.
 */
function stripSvgWrapper(doc: string): string {
  const open = doc.indexOf('>', doc.indexOf('<svg'));
  const close = doc.lastIndexOf('</svg>');
  if (open === -1 || close === -1) return doc;
  return doc
    .slice(open + 1, close)
    .replace(/<rect\b[^>]*width="100%"[^>]*\/>/, '')
    .trim();
}

/** The overlay image at its opacity but without a blend — the `under` layer. */
function sourceOverlaySvgNormal(
  cfg: PostProcessConfig | undefined,
  dataUrl: string,
  width: number,
  height: number
): string {
  const o = resolvePostProcess(cfg).sourceOverlay;
  const filter = o.blur && o.blur > 0 ? ` style="filter:blur(${o.blur}px)"` : '';
  return `<image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" opacity="${(o.opacity / 100).toFixed(3)}"${filter}/>`;
}

/**
 * Renders a single crisp high-resolution still image (PNG, JPG or Vector SVG) of the current viewport.
 */
export async function exportAsciiImage(opts: ImageExportOptions): Promise<ImageExportResult> {
  const {
    name = 'raster-art',
    format = 'png',
    quality = 0.95,
    scale = 2.0,
    transparentBg = false,
    cols,
    rows,
    gradientConfig,
    crtConfig,
  } = opts;

  // Everything the frame itself needs -- source configs, density, time, the
  // custom-preset code -- is read by renderExportFrame, not here.
  const rasterMode: RasterOutputMode = opts.rasterMode || opts.mediaViewConfig?.rasterMode || 'ascii';
  const isPixel = rasterMode === 'pixel';
  const isVector = rasterMode === 'vector';
  /*
   * CRT effects are bypassed in both non-ASCII modes for the same reason: they
   * are a screen artefact, and baking one into a crisp dither or a plotter path
   * ruins exactly what that output is for.
   */
  const showScanlines = !isPixel && !isVector && (opts.includeScanlines ?? (crtConfig ? crtConfig.scanlines : true));
  const showCrtGlow = !isPixel && !isVector && (opts.includeCrtGlow ?? (crtConfig ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false));
  const showVignette = !isPixel && !isVector && (opts.includeVignette ?? (crtConfig ? crtConfig.vignette : false));
  /*
   * The legacy per-glyph bloom stands down while the post-processing glow is
   * driving. They are two implementations of one effect -- this one a
   * `shadowBlur` per `fillText`, that one a single blur of the finished layer
   * -- and running both stacks two halos of different radii on every glyph.
   * The new one wins because it is the one with controls, and because it is
   * the only one pixel and vector can have.
   */
  const showPhosphorBloom =
    !isPixel &&
    !isVector &&
    !glowActive(opts.postProcess) &&
    (opts.includePhosphorBloom ?? (crtConfig ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false));

  const {
    text: frameText,
    luminance: frameLuminance,
    colors: frameColors,
    bgColor: effectiveBg,
    fgColor: text,
    vector: frameVector,
    sourceLayer,
  } = renderExportFrame(opts);

  const postStages = buildStages(opts.postProcess, sourceLayer);


  // If Vector SVG export is requested
  if (format === 'svg') {
    let svgContent = '';

    /*
     * Optics as filter primitives rather than as a rasterized layer, so the
     * SVG stays vector. This is also a fix: the beam's halo used to be a
     * canvas `shadowBlur` with no SVG counterpart at all, so it was silently
     * absent from every SVG export while being visible in the viewport and in
     * a PNG of the same frame.
     */
    const svgFilter = postProcessSvgFilter(opts.postProcess, 1);
    const overlayUrl =
      overlayActive(opts.postProcess) && sourceLayer instanceof HTMLCanvasElement
        ? sourceLayer.toDataURL('image/png')
        : null;
    const overlayPlacement = resolvePostProcess(opts.postProcess).sourceOverlay.placement;

    /*
     * Vector is the one output whose SVG is not a translation of anything --
     * polylines are already its native form, so this is a lossless export and
     * the flagship reason the mode exists. It must NOT go through
     * exportPixelRasterToSvg: mergeCellRects assumes cells and would emit
     * squares where the beam belongs, the same mistake buildAsciiPlateSvg
     * exists to correct for ASCII plates.
     */
    if (isVector) {
      const vw = Math.round(cols * scale);
      const vh = Math.round(rows * scale);
      const beam = frameVector
        ? vectorFrameToSvg(frameVector, {
            scale,
            background: transparentBg ? null : effectiveBg,
            filter: svgFilter,
            /*
             * Emitted as a group when there is an overlay to wrap it with, so
             * the two layers can be ordered and blended; standalone otherwise,
             * which keeps the plain beam export byte-for-byte what it was.
             */
            groupId: overlayUrl ? 'beam' : undefined,
          })
        : '';
      const content = overlayUrl
        ? wrapSvgWithOverlay(beam, overlayUrl, vw, vh, overlayPlacement, opts.postProcess, transparentBg ? null : effectiveBg)
        : beam;
      const svgBlob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
      return {
        blob: svgBlob,
        url: URL.createObjectURL(svgBlob),
        width: vw,
        height: vh,
        mimeType: 'image/svg+xml',
        extension: '.svg',
      };
    }

    const charWidth = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
    const charHeight = isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
    const width = Math.round(cols * charWidth);
    const height = Math.round(rows * charHeight);

    if (!isPixel) {
      const lines = frameText.split('\n');

      const textNodes: string[] = [];
      textNodes.push(`<?xml version="1.0" encoding="UTF-8"?>`);
      textNodes.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
      if (svgFilter) textNodes.push(`  <defs>${svgFilter.markup}</defs>`);
      if (!transparentBg) {
        textNodes.push(`  <rect width="100%" height="100%" fill="${effectiveBg}"/>`);
      }
      if (overlayUrl) textNodes.push(`  <g style="isolation:isolate">`);
      if (overlayUrl && overlayPlacement === 'under') {
        textNodes.push(`  ${sourceOverlaySvgNormal(opts.postProcess, overlayUrl, width, height)}`);
      }
      const blendStyle =
        overlayUrl && overlayPlacement === 'under'
          ? ` style="mix-blend-mode:${resolvePostProcess(opts.postProcess).sourceOverlay.blend}"`
          : '';
      textNodes.push(
        `  <g font-family="monospace" font-size="${10 * scale}px" fill="${text}" xml:space="preserve"${
          svgFilter ? ` filter="url(#${svgFilter.id})"` : ''
        }${blendStyle}>`
      );

      for (let r = 0; r < lines.length && r < rows; r++) {
        const line = lines[r];
        if (line) {
          const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          textNodes.push(`    <text x="0" y="${((r + 0.8) * charHeight).toFixed(2)}">${escaped}</text>`);
        }
      }
      textNodes.push(`  </g>`);
      if (overlayUrl && overlayPlacement === 'over') {
        textNodes.push(`  ${sourceOverlaySvg(opts.postProcess, overlayUrl, width, height)}`);
      }
      if (overlayUrl) textNodes.push(`  </g>`);
      textNodes.push(`</svg>`);
      svgContent = textNodes.join('\n');
    } else {
      const plate = exportPixelRasterToSvg({
        cols,
        rows,
        luminance: frameLuminance || new Float32Array(cols * rows).fill(0.5),
        colors: frameColors,
        bgColor: transparentBg ? 'transparent' : effectiveBg,
        fgColor: text,
        width,
        height,
      });
      /*
       * Pixel's SVG is a whole document built by the cell merger, so the
       * overlay wraps it rather than being threaded through it -- the merger
       * has no business knowing about compositing. The optics filter is left
       * off here on purpose: blurring a mesh of merged rectangles defeats the
       * point of the merge, and a crisp dither plate is what this format is
       * for. Use PNG if the frame is meant to bloom.
       */
      svgContent = overlayUrl
        ? wrapSvgWithOverlay(
            stripSvgWrapper(plate),
            overlayUrl,
            width,
            height,
            overlayPlacement,
            opts.postProcess,
            transparentBg ? null : effectiveBg
          )
        : plate;
    }

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      width,
      height,
      mimeType: 'image/svg+xml',
      extension: '.svg',
    };
  }

  /*
   * Cell dimensions on canvas. Pixel snaps to whole pixels per cell so edges
   * stay hard; vector keeps the scale fractional, because there are no cell
   * edges to protect and rounding would quantize the geometry it exists to keep
   * continuous.
   */
  const charWidth = isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_WIDTH * scale;
  const charHeight = isVector ? scale : isPixel ? Math.max(1, Math.round(scale)) : MONOSPACE_CELL_HEIGHT * scale;
  const width = Math.round(cols * charWidth);
  const height = Math.round(rows * charHeight);

  // Setup offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

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

  /*
   * Vector strokes the beam at export scale. Resolution independence is real
   * here: an 8x export is genuinely 8x the detail, not an upscale of a 1x
   * raster, which is the one place this mode beats pixel outright.
   */
  if (isVector) {
    composePostProcess({
      ctx,
      width,
      height,
      stages: postStages,
      scale,
      bgColor: !transparentBg || format === 'jpg' ? effectiveBg : null,
      paintRaster: (target) => {
        if (!frameVector) return;
        target.save();
        target.scale(scale, scale);
        paintVectorFrame(target, frameVector);
        target.restore();
      },
    });
  } else if (isPixel && frameLuminance) {
    composePostProcess({
      ctx,
      width,
      height,
      stages: postStages,
      scale,
      /*
       * The ground moves out of the cell painter whenever a stage is active:
       * an opaque plate inside the raster layer would sit on top of an `under`
       * overlay and hide it completely.
       */
      bgColor: transparentBg ? null : effectiveBg,
      paintRaster: (target) => {
        drawPixelRasterToCanvas({
          ctx: target,
          cols,
          rows,
          luminance: frameLuminance,
          colors: frameColors,
          bgColor: 'transparent',
          fgColor: text,
          cellWidth: charWidth,
          cellHeight: charHeight,
          dpr: 1,
        });
      },
    });
  } else {
    // Standard ASCII text rendering
    const lines = frameText.split('\n');

    /*
     * The CRT decorations are ground, not artwork, so they go beneath the
     * source overlay along with the background plate. Only the glyphs are the
     * raster layer.
     */
    const paintBase = (target: CanvasRenderingContext2D) => {
      if (format === 'jpg' || !transparentBg) {
        target.fillStyle = effectiveBg;
        target.fillRect(0, 0, width, height);

        // CRT Glow
        if (showCrtGlow && !frameColors) {
          const ambientGlow = target.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) * 0.7
          );
          ambientGlow.addColorStop(0, `rgba(0, 255, 102, 0.18)`);
          ambientGlow.addColorStop(1, 'transparent');
          target.fillStyle = ambientGlow;
          target.fillRect(0, 0, width, height);
        }

        // CRT Scanlines (rendered directly on background behind content)
        if (showScanlines) {
          target.fillStyle = 'rgba(0, 0, 0, 0.28)';
          const scanlineHeight = Math.max(1, Math.round(1.5 * scale));
          const scanlineStep = Math.max(2, Math.round(3.0 * scale));
          for (let y = 0; y < height; y += scanlineStep) {
            target.fillRect(0, y, width, scanlineHeight);
          }
        }
      } else {
        target.clearRect(0, 0, width, height);
      }
    };

    const paintGlyphs = (target: CanvasRenderingContext2D) => {
      target.font = `${Math.round(10 * scale)}px 'JuliaMono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace`;
      target.textBaseline = 'top';
      target.textAlign = 'left';

      /*
       * The per-glyph shadow bloom stands down as soon as the post-processing
       * glow is driving -- see `showPhosphorBloom` above. Two unrelated
       * implementations of the same effect stack into a double halo.
       */
      if (showPhosphorBloom && !frameColors) {
        target.shadowColor = text;
        target.shadowBlur = Math.round(3 * scale);
      } else {
        target.shadowBlur = 0;
      }

      if (frameColors) {
        for (let row = 0; row < rows; row++) {
          const line = lines[row] || '';
          for (let col = 0; col < cols && col < line.length; col++) {
            const ch = line[col];
            if (ch && ch !== ' ') {
              const cIdx = (row * cols + col) * 3;
              target.fillStyle = `rgb(${frameColors[cIdx]}, ${frameColors[cIdx + 1]}, ${frameColors[cIdx + 2]})`;
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
      stages: postStages,
      scale,
      paintBase,
      paintRaster: paintGlyphs,
    });
  }

  // CRT Vignette
  if (showVignette) {
    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.4,
      width / 2, height / 2, Math.max(width, height) * 0.75
    );
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  // Convert to Blob & Inject Container Metadata
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const extension = format === 'jpg' ? '.jpg' : '.png';

  return new Promise<ImageExportResult>((resolve, reject) => {
    canvas.toBlob(
      (rawBlob) => {
        if (!rawBlob) {
          reject(new Error('Failed to generate image blob'));
          return;
        }

        rawBlob
          .arrayBuffer()
          .then((arrayBuffer) => {
            let finalBlob: Blob = rawBlob;

            if (format === 'png') {
              finalBlob = injectPngMetadata(arrayBuffer, {
                Title: name,
                Author: 'Dither Studio',
                Software: 'Dither Studio (https://ascii.pantoine.com)',
                Source: 'https://ascii.pantoine.com',
                Comment: `Generated with Dither Studio (https://ascii.pantoine.com) - ${cols}x${rows} (${rasterMode})`,
                Description: `Raster visual rendered via Dither Studio: ${name} (${opts.appMode || 'synth'})`,
              });
            } else {
              finalBlob = injectJpegComment(
                arrayBuffer,
                `Dither Studio (https://ascii.pantoine.com) - ${name} (${opts.appMode || 'synth'})`
              );
            }

            const url = URL.createObjectURL(finalBlob);
            resolve({
              blob: finalBlob,
              url,
              width,
              height,
              mimeType,
              extension,
            });
          })
          .catch(() => {
            const url = URL.createObjectURL(rawBlob);
            resolve({
              blob: rawBlob,
              url,
              width,
              height,
              mimeType,
              extension,
            });
          });
      },
      mimeType,
      format === 'jpg' ? quality : undefined
    );
  });
}

