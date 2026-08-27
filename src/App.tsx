import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  WaveParams,
  Preset,
  PhosphorTheme,
  TrailPoint,
  ParticleConfig,
  OptimizeConfig,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  ModelPreset,
  BuiltinModelId,
  MediaConfig,
  MediaViewConfig,
  MediaPreset,
  RenderSettings,
  MediaColorConfig,
  DEFAULT_MEDIA_COLOR_CONFIG,
  LEGACY_TONAL_PRESET_PALETTES,
  DEFAULT_TONE_MAPPING_CONFIG,
  DEFAULT_IMAGE_ADJUST_CONFIG,
  POST_PROCESS_DEFAULTS,
  ImageAdjustConfig,
  PostProcessConfig,
  ToneMappingConfig,
  RasterOutputMode,
  UiThemeSettings,
  UiMode,
  VectorConfig,
  VectorFrame,
  VECTOR_CONFIG_DEFAULTS,
} from './types/ascii';
import { resolvePhosphorTint, DEFAULT_PHOSPHOR_TINT, BUILTIN_PALETTES } from './engine/palettes';
import {
  DEFAULT_WAVE_PARAMS,
  compileCustomCode,
  evaluateParametricWave,
  generateFormulaCode,
  parseFormulaCodeToParams,
  checkFormulaDivergence,
} from './engine/math';
import { PRESETS } from './engine/presets';
import {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_VIEW_CONFIG,
  MODEL_PRESETS,
} from './engine/modelPresets';
import {
  DEFAULT_MEDIA_CONFIG,
  DEFAULT_MEDIA_VIEW_CONFIG,
} from './engine/mediaPresets';
import { getBuiltinGeometry, loadBuiltinGeometryAsync, getGeometryStats, fetchRemoteGeometry } from './engine/modelLoader';
import { Khronos3DModel } from './engine/khronos3dModels';
import { renderModelFrameData, applyTrackballRotationWithTime } from './engine/modelRenderer';
import { renderAsciiMediaFrameData } from './engine/mediaRenderer';
import { migratePostProcess } from './engine/postProcess';
/*
 * The overlay's source layer comes from the exporter's helpers, not from a
 * second copy here. They are the one thing the still, GIF and video exporters
 * share, and the viewport producing its own would be a fourth definition of
 * "what the source looks like at this resolution" — see invariant 4.
 */
import { overlaySourceLayer, overlaySourcePpc, exportCellSize } from './engine/imageExporter';
import { PostProcessControls } from './components/PostProcessControls';
import { previewVectorConfig, scaleVectorFrame } from './engine/vectorEngine';
import { choosePreviewDivisor, upscaleFrame } from './engine/framePreview';
import { CHARSETS, renderSynthFrameData } from './engine/renderer';
import {

  createTrailPoint,
  updateParticleWithField,
  generateClickParticles,
  DEFAULT_PARTICLE_CONFIG,
} from './engine/particles';


import { AsciiViewport, AsciiViewportHandle } from './components/AsciiViewport';
import { SynthControls } from './components/SynthControls';
import { PresetSelector } from './components/PresetSelector';
import { ParticleControls } from './components/ParticleControls';
import { OptimizeControls } from './components/OptimizeControls';
import { CharsetThemeBar } from './components/CharsetThemeBar';
import { PaletteControls } from './components/PaletteControls';
import { ModelImportControls, ModelMeshControls } from './components/ModelSettingsControls';
import { ModelViewControls } from './components/ModelViewControls';
import { MediaUploadControls } from './components/MediaFileControls';
import { MediaViewControls } from './components/MediaViewControls';
import { NToneRampEditor } from './components/NToneRampEditor';
import {
  ColorAdjustControls,
  TonalAdjustControls,
  resolveToneStops,
  applyToneStops,
  DEFAULT_STOP_WEIGHT,
} from './components/ImageAdjustControls';
import { CollapsibleSection, AccordionProvider } from './components/CollapsibleSection';
import { BasicPanel } from './components/BasicPanel';
import { UiModeSwitch } from './components/UiModeSwitch';
import { DitherAlgorithmPicker } from './components/DitherAlgorithmPicker';
import { OutputModeCards } from './components/outputModes';
import { WorkflowStep } from './components/controlPrimitives';
import { VectorControls } from './components/VectorControls';
import { ExportModal, ExportTab } from './components/ExportModal';
import { ShareModal } from './components/ShareModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { DITHER_ALGORITHMS } from './engine/ditherAlgorithms';
import { generateRandomAnimation } from './engine/randomizer';
import {
  FullAnimationState,
  decodeShareFromUrl,
  ShareView,
  updateUrlMode,
} from './engine/share';

import {
  Sliders,
  Share2,
  Download,
  Undo2,
  Redo2,
  Box,
  Image as ImageIcon,
  Settings,
  Keyboard,
} from 'lucide-react';

const LOCAL_STORAGE_RENDER_SETTINGS_KEY = 'ascii_studio_render_settings_by_mode';
const LOCAL_STORAGE_UI_THEME_KEY = 'ascii_studio_ui_theme_settings';

/**
 * Pick the sidebar layout to open with.
 *
 * A first-time visitor gets BASIC -- that is the whole point of it. Someone
 * who has used the app before does not: their stored settings predate the
 * switch, and swapping the layout out from under them would read as the app
 * having lost half its controls. The absence of the key is the only signal
 * that separates the two, so it is used for exactly that once, after which
 * the choice is theirs and is stored.
 */
const resolveUiMode = (stored: Record<string, unknown> | null): UiMode => {
  if (!stored) return 'basic';
  if (stored.uiMode === 'basic' || stored.uiMode === 'advanced') return stored.uiMode;
  return 'advanced';
};

/** DPI a freshly loaded media source starts at: 1:1 with the source pixels. */
const MEDIA_DEFAULT_DPI = 100;
/*
 * Sampling width for vector output. The grid stops being a display raster in
 * that mode and becomes the resolution the beam reads luminance at; this is the
 * studio's own working buffer size.
 */
const VECTOR_SAMPLE_COLS = 800;
/** Radians of carrier phase per second of loop time. */
const VECTOR_PHASE_RATE = 2.2;

/**
 * How recently the last static render must have finished for the next change to
 * count as part of the same gesture, and so be drawn as a cheap preview.
 *
 * Generous on purpose: a slow grid renders at a few frames a second, so a
 * tighter window would classify the middle of a drag as "idle" and go back to
 * full-resolution passes, which is the stall this exists to avoid.
 */
const EDIT_BURST_MS = 500;

/** Quiet period after the last change before the sharp pass runs. */
const EDIT_SETTLE_MS = 220;

/** Parse a #rgb / #rrggbb accent into channels, falling back to phosphor green. */
const parseAccentChannels = (hex: string): [number, number, number] => {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num) || cleaned.length !== 6) return [0, 255, 102];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

/**
 * Derive the whole interface palette from one accent colour.
 *
 * A dark accent gets a paper-white interface (dark ink on light stock); every
 * other accent gets the CRT treatment, where each surface is a progressively
 * less severe tint of the accent itself.
 *
 * This used to be inlined at four call sites. The copies had drifted: in both
 * dark-mode ones the blue channel was computed from `g`, so a green accent
 * produced a teal interface. One implementation, one place to be wrong.
 */
const buildInterfaceTint = (r: number, g: number, b: number, usePaperTheme: boolean) => {
  if (!usePaperTheme) {
    // CRT: scale the accent towards black, with a floor so the darkest
    // surfaces never collapse into a single indistinguishable black.
    const surface = (k: number, base: number, floor: number) =>
      `rgb(${Math.max(floor, Math.round(r * k + base))}, ` +
      `${Math.max(floor, Math.round(g * k + base))}, ` +
      `${Math.max(floor, Math.round(b * k + base))})`;
    return {
      bgPrimary: surface(0.035, 2, 2),
      bgPanel: surface(0.06, 5, 5),
      bgControl: surface(0.11, 9, 10),
      bgControlHover: surface(0.16, 14, 16),
      borderColor: surface(0.24, 18, 24),
      textMuted: `rgb(${Math.round(r * 0.65 + 30)}, ${Math.round(g * 0.65 + 30)}, ${Math.round(b * 0.65 + 30)})`,
      textDim: `rgb(${Math.round(r * 0.35 + 15)}, ${Math.round(g * 0.35 + 15)}, ${Math.round(b * 0.35 + 15)})`,
      glowAlpha: 0.11,
    };
  }
  // Paper: pull each neutral stop towards the accent by a small amount.
  const stock = (nr: number, ng: number, nb: number, k: number) =>
    `rgb(${Math.round(nr - (255 - r) * k)}, ` +
    `${Math.round(ng - (255 - g) * k)}, ` +
    `${Math.round(nb - (255 - b) * k)})`;
  return {
    bgPrimary: stock(244, 242, 236, 0.05),
    bgPanel: stock(234, 232, 224, 0.08),
    bgControl: stock(224, 220, 210, 0.12),
    bgControlHover: stock(212, 207, 197, 0.16),
    borderColor: stock(186, 182, 172, 0.22),
    textMuted: `rgb(${Math.round(r * 0.6 + 65)}, ${Math.round(g * 0.6 + 65)}, ${Math.round(b * 0.6 + 65)})`,
    textDim: `rgb(${Math.round(r * 0.4 + 115)}, ${Math.round(g * 0.4 + 115)}, ${Math.round(b * 0.4 + 115)})`,
    glowAlpha: 0.05,
  };
};

/**
 * The three content sources. Kept as data so the picker, its badge and the
 * per-source panel switches all read from one place.
 */
const SOURCES: {
  id: AppMode;
  name: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
}[] = [
  {
    id: 'media',
    name: 'MEDIA',
    badge: '2D',
    description: 'Image & Video',
    icon: ImageIcon,
    title: '2D Image & Video ASCII Rasterizer [1]',
  },
  {
    id: 'synth',
    name: 'SYNTH',
    badge: 'MATH',
    description: 'Waves & Particles',
    icon: Sliders,
    title: 'Parametric Wave & Particle Synthesizer [2]',
  },
  {
    id: 'model',
    name: 'MODEL',
    badge: '3D',
    description: 'WebGL Mesh',
    icon: Box,
    title: '3D Model to 2D ASCII Visualizer [3]',
  },
];

interface HistorySnapshot {
  waveParams: WaveParams;
  customCode: string;
  customPrepare?: string;
  presetName: string;
  presetType?: 'parametric' | 'custom';
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  density?: string;
  crtConfig?: CrtConfig;
  optimizeConfig?: OptimizeConfig;
}

interface ModelHistorySnapshot {
  modelConfig: ModelConfig;
  modelViewConfig: ModelViewConfig;
  activePreset?: ModelPreset;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  density?: string;
  crtConfig?: CrtConfig;
  optimizeConfig?: OptimizeConfig;
}

interface MediaHistorySnapshot {
  mediaConfig: MediaConfig;
  mediaViewConfig: MediaViewConfig;
  activePreset?: MediaPreset;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  density?: string;
  crtConfig?: CrtConfig;
  optimizeConfig?: OptimizeConfig;
}

export const App: React.FC = () => {
  // Decode URL state on initialization if present
  const initialUrlData = useMemo(() => decodeShareFromUrl(), []);
  const sharedState = initialUrlData.state;

  // App Mode State: 'media' (2D Image/Video), 'synth' (Wave Synthesizer), or 'model' (3D Model Visualizer)
  const [appMode, setAppMode] = useState<AppMode>(sharedState?.appMode || 'media');

  // Preset & Configuration State for Synth Mode
  const [activePreset, setActivePreset] = useState<Preset>(() => {
    if (sharedState?.name && sharedState.appMode !== 'model') {
      const match = PRESETS.find((p) => p.name.toLowerCase() === sharedState.name.toLowerCase());
      if (match) return match;
      return {
        id: `shared-${Date.now()}`,
        name: sharedState.name,
        description: 'Shared ASCII animation',
        type: sharedState.type || 'parametric',
        params: sharedState.params || DEFAULT_WAVE_PARAMS,
        customCode: sharedState.customCode,
        customPrepare: sharedState.customPrepare,
        densityCharset: sharedState.density,
      };
    }
    return PRESETS[0];
  });

  const [presetType, setPresetType] = useState<'parametric' | 'custom'>(
    sharedState?.type || 'parametric'
  );

  const [waveParams, setWaveParams] = useState<WaveParams>(() => ({
    ...DEFAULT_WAVE_PARAMS,
    ...(sharedState?.params || PRESETS[0].params || {}),
  }));

  // Custom Code State
  const [customCode, setCustomCode] = useState<string>(() => {
    if (sharedState?.customCode) return sharedState.customCode;
    return generateFormulaCode({ ...DEFAULT_WAVE_PARAMS, ...(PRESETS[0].params || {}) });
  });
  const [customPrepare, setCustomPrepare] = useState<string>(sharedState?.customPrepare || '');
  const [compileError, setCompileError] = useState<string | null>(null);
  const compiledFnRef = useRef<any>(null);
  const prepareFnRef = useRef<any>(null);
  const customContextRef = useRef<Record<string, any>>({});

  // 3D Model State for Model Mode
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => ({
    ...DEFAULT_MODEL_CONFIG,
    ...(sharedState?.modelConfig || MODEL_PRESETS[0].modelConfig || {}),
  }));

  const [modelViewConfig, setModelViewConfig] = useState<ModelViewConfig>(() => ({
    ...DEFAULT_MODEL_VIEW_CONFIG,
    ...(sharedState?.modelViewConfig || MODEL_PRESETS[0].viewConfig || {}),
  }));

  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [modelLoadingFileName, setModelLoadingFileName] = useState<string>('3D Model');
  const [modelLoadingStatusText, setModelLoadingStatusText] = useState<string>('Downloading');

  // Active Three.js geometry reference
  const currentGeometryRef = useRef<THREE.BufferGeometry>(
    getBuiltinGeometry(
      ((sharedState?.modelConfig?.modelId as BuiltinModelId) || 'torus-knot')
    )
  );

  // 2D Media State for Media Mode
  const [mediaConfig, setMediaConfig] = useState<MediaConfig>(() => ({
    ...DEFAULT_MEDIA_CONFIG,
    ...(sharedState?.mediaConfig || {}),
  }));

  const [mediaViewConfig, setMediaViewConfig] = useState<MediaViewConfig>(() => {
    const merged = { ...DEFAULT_MEDIA_VIEW_CONFIG, ...(sharedState?.mediaViewConfig || {}) };
    // A shared link made before the tonal presets became palettes can still
    // carry 'gameboy' / 'cyberpunk' / 'amber'.
    if (LEGACY_TONAL_PRESET_PALETTES[merged.tonalMapping as string]) {
      merged.tonalMapping = '1color';
    }
    return merged;
  });

  const [mediaRenderTrigger, setMediaRenderTrigger] = useState<number>(0);
  const triggerMediaRender = useCallback(() => setMediaRenderTrigger((v) => v + 1), []);

  // Active HTML image/video/canvas element reference for media rasterizer
  const mediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>(null);

  /*
   * The source layer for the post-processing overlay.
   *
   * Travels to the viewport as an argument to `setFrame`, alongside the frame
   * it belongs to — *not* as a React prop. The mode renderers redraw the same
   * canvas in place every tick, so a prop would either never appear to change
   * (reference comparison) or re-render App sixty times a second to say that
   * it had. `setFrame` is already the imperative per-frame channel.
   */
  const sourceLayerRef = useRef<HTMLCanvasElement | null>(null);

  // Isolated Render Settings for each mode (Synth, Media, Model)
  const [renderSettingsByMode, setRenderSettingsByMode] = useState<Record<AppMode, RenderSettings>>(() => {
    let savedSettings: Partial<Record<AppMode, Partial<RenderSettings>>> = {};
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RENDER_SETTINGS_KEY);
      if (raw) {
        savedSettings = JSON.parse(raw);
      }
    } catch {}

    // Synth mode exposes no dither control, so a persisted 'floyd-steinberg' can
    // only be the old default. Error diffusion is temporally unstable on an
    // animated field and made the output flicker, so drop it.
    if (savedSettings.synth?.ditherAlgorithm === 'floyd-steinberg') {
      savedSettings.synth.ditherAlgorithm = 'none';
    }

    // The 'gameboy' / 'cyberpunk' / 'amber' tonal presets are built-in palettes
    // now. Move a persisted preset onto its palette so the look survives.
    for (const modeKey of ['synth', 'media', 'model'] as const) {
      const saved = savedSettings[modeKey];
      const legacy = saved?.adjustConfig?.tonalMapping as string | undefined;
      const paletteId = legacy ? LEGACY_TONAL_PRESET_PALETTES[legacy] : undefined;
      if (!saved || !paletteId) continue;
      saved.adjustConfig = { ...saved.adjustConfig!, tonalMapping: '1color' };
      saved.mediaColorConfig = {
        ...(saved.mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG),
        paletteMode: 'indexed',
        mode: 'fixed',
        activePaletteId: paletteId,
      };
    }

    const isSynthShared = sharedState?.appMode === 'synth' || !sharedState?.appMode;
    const isMediaShared = sharedState?.appMode === 'media';
    const isModelShared = sharedState?.appMode === 'model';

    const defaultSynthSettings: RenderSettings = {
      cols: (isSynthShared && sharedState?.cols) || savedSettings.synth?.cols || 100,
      rows: (isSynthShared && sharedState?.rows) || savedSettings.synth?.rows || 50,
      autoRes: (isSynthShared && sharedState?.autoRes !== undefined) ? sharedState.autoRes : (savedSettings.synth?.autoRes !== undefined ? savedSettings.synth.autoRes : true),
      density: (isSynthShared && sharedState?.density) || savedSettings.synth?.density || CHARSETS[0].chars,
      rasterMode: (isSynthShared && sharedState?.rasterMode) || savedSettings.synth?.rasterMode || 'pixel',
      ditherAlgorithm: (isSynthShared && sharedState?.ditherAlgorithm) || savedSettings.synth?.ditherAlgorithm || 'none',
      ditherParams: (isSynthShared && sharedState?.ditherParams) || savedSettings.synth?.ditherParams,
      vectorConfig: (isSynthShared && sharedState?.vectorConfig) || savedSettings.synth?.vectorConfig,
      toneConfig: (isSynthShared && sharedState?.toneConfig) || savedSettings.synth?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      adjustConfig: (isSynthShared && sharedState?.adjustConfig) || savedSettings.synth?.adjustConfig || DEFAULT_IMAGE_ADJUST_CONFIG,
      /*
       * `migratePostProcess` folds a pre-2.3 `vectorConfig.glow` forward: the
       * halo used to be a beam parameter and is now one post stage shared with
       * ASCII and pixel, so an old link or a persisted session keeps its bloom
       * rather than silently losing it.
       */
      postProcess: migratePostProcess(
        (isSynthShared ? sharedState?.postProcess : undefined) || savedSettings.synth?.postProcess,
        (isSynthShared && sharedState?.vectorConfig) || savedSettings.synth?.vectorConfig
      ),
      theme: (isSynthShared && sharedState?.theme) || savedSettings.synth?.theme || 'monochrome',
      customThemeColor: (isSynthShared && sharedState?.customThemeColor) || savedSettings.synth?.customThemeColor || '',
      gradientConfig: (isSynthShared && sharedState?.gradientConfig !== undefined) ? sharedState.gradientConfig : (savedSettings.synth?.gradientConfig ?? null),
      crtConfig: (isSynthShared && sharedState?.crtConfig) || savedSettings.synth?.crtConfig || {
        scanlines: true,
        crtGlow: true,
        vignette: false,
        phosphorBloom: false,
      },
      optimizeConfig: (isSynthShared && sharedState?.optimizeConfig) || savedSettings.synth?.optimizeConfig || {
        targetFps: 60,
        pauseWhenHidden: true,
        idleThrottle: false,
      },
    };

    const defaultMediaSettings: RenderSettings = {
      cols: (isMediaShared && sharedState?.cols) || savedSettings.media?.cols || 240,
      rows: (isMediaShared && sharedState?.rows) || savedSettings.media?.rows || 120,
      autoRes: (isMediaShared && sharedState?.autoRes !== undefined) ? sharedState.autoRes : (savedSettings.media?.autoRes !== undefined ? savedSettings.media.autoRes : false),
      density: (isMediaShared && sharedState?.density) || savedSettings.media?.density || CHARSETS[0].chars,
      rasterMode: (isMediaShared && sharedState?.rasterMode) || savedSettings.media?.rasterMode || 'pixel',
      ditherAlgorithm: (isMediaShared && sharedState?.ditherAlgorithm) || savedSettings.media?.ditherAlgorithm || 'floyd-steinberg',
      ditherParams: (isMediaShared && sharedState?.ditherParams) || savedSettings.media?.ditherParams,
      vectorConfig: (isMediaShared && sharedState?.vectorConfig) || savedSettings.media?.vectorConfig,
      toneConfig: (isMediaShared && sharedState?.toneConfig) || savedSettings.media?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      adjustConfig: (isMediaShared && sharedState?.adjustConfig) || savedSettings.media?.adjustConfig || DEFAULT_IMAGE_ADJUST_CONFIG,
      postProcess: migratePostProcess(
        (isMediaShared ? sharedState?.postProcess : undefined) || savedSettings.media?.postProcess,
        (isMediaShared && sharedState?.vectorConfig) || savedSettings.media?.vectorConfig
      ),
      theme: (isMediaShared && sharedState?.theme) || savedSettings.media?.theme || 'monochrome',
      customThemeColor: (isMediaShared && sharedState?.customThemeColor) || savedSettings.media?.customThemeColor || '',
      gradientConfig: (isMediaShared && sharedState?.gradientConfig !== undefined) ? sharedState.gradientConfig : (savedSettings.media?.gradientConfig ?? null),
      crtConfig: (isMediaShared && sharedState?.crtConfig) || savedSettings.media?.crtConfig || {
        scanlines: true,
        crtGlow: true,
        vignette: false,
        phosphorBloom: false,
      },
      optimizeConfig: (isMediaShared && sharedState?.optimizeConfig) || savedSettings.media?.optimizeConfig || {
        targetFps: 60,
        pauseWhenHidden: true,
        idleThrottle: false,
      },
      mediaColorConfig: (isMediaShared && sharedState?.mediaColorConfig) || savedSettings.media?.mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG,
    };

    const defaultModelSettings: RenderSettings = {
      cols: (isModelShared && sharedState?.cols) || savedSettings.model?.cols || 100,
      rows: (isModelShared && sharedState?.rows) || savedSettings.model?.rows || 50,
      autoRes: (isModelShared && sharedState?.autoRes !== undefined) ? sharedState.autoRes : (savedSettings.model?.autoRes !== undefined ? savedSettings.model.autoRes : true),
      density: (isModelShared && sharedState?.density) || savedSettings.model?.density || CHARSETS[0].chars,
      rasterMode: (isModelShared && sharedState?.rasterMode) || savedSettings.model?.rasterMode || 'pixel',
      ditherAlgorithm: (isModelShared && sharedState?.ditherAlgorithm) || savedSettings.model?.ditherAlgorithm || 'none',
      ditherParams: (isModelShared && sharedState?.ditherParams) || savedSettings.model?.ditherParams,
      vectorConfig: (isModelShared && sharedState?.vectorConfig) || savedSettings.model?.vectorConfig,
      toneConfig: (isModelShared && sharedState?.toneConfig) || savedSettings.model?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      adjustConfig: (isModelShared && sharedState?.adjustConfig) || savedSettings.model?.adjustConfig || DEFAULT_IMAGE_ADJUST_CONFIG,
      postProcess: migratePostProcess(
        (isModelShared ? sharedState?.postProcess : undefined) || savedSettings.model?.postProcess,
        (isModelShared && sharedState?.vectorConfig) || savedSettings.model?.vectorConfig
      ),
      theme: (isModelShared && sharedState?.theme) || savedSettings.model?.theme || 'monochrome',
      customThemeColor: (isModelShared && sharedState?.customThemeColor) || savedSettings.model?.customThemeColor || '',
      gradientConfig: (isModelShared && sharedState?.gradientConfig !== undefined) ? sharedState.gradientConfig : (savedSettings.model?.gradientConfig ?? null),
      crtConfig: (isModelShared && sharedState?.crtConfig) || savedSettings.model?.crtConfig || {
        scanlines: true,
        crtGlow: true,
        vignette: false,
        phosphorBloom: false,
      },
      optimizeConfig: (isModelShared && sharedState?.optimizeConfig) || savedSettings.model?.optimizeConfig || {
        targetFps: 60,
        pauseWhenHidden: true,
        idleThrottle: false,
      },
    };


    return {
      synth: defaultSynthSettings,
      media: defaultMediaSettings,
      model: defaultModelSettings,
    };
  });

  // Current active render settings derived from active appMode
  const currentRenderSettings = renderSettingsByMode[appMode];
  const {
    cols,
    rows,
    autoRes,
    density,
    theme,
    customThemeColor,
    gradientConfig,
    crtConfig,
    optimizeConfig,
    mediaColorConfig,
  } = currentRenderSettings;

  // Active appMode ref for stable callback access
  const appModeRef = useRef<AppMode>(appMode);
  appModeRef.current = appMode;

  const renderSettingsRef = useRef<RenderSettings>(currentRenderSettings);
  renderSettingsRef.current = currentRenderSettings;

  /*
   * Read by `buildViewportSourceLayer`, which is a stable `useCallback([])`
   * called from both the animation loop and the static-image scheduler.
   */
  const mediaConfigRef = useRef<MediaConfig>(mediaConfig);
  mediaConfigRef.current = mediaConfig;
  const mediaViewConfigRef = useRef<MediaViewConfig>(mediaViewConfig);
  mediaViewConfigRef.current = mediaViewConfig;


  // Standalone interface theme settings (managed in Viewfinder Settings Modal)
  const [uiThemeSettings, setUiThemeSettings] = useState<UiThemeSettings>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_UI_THEME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          uiTheme: parsed.uiTheme || 'green',
          customUiColor: parsed.customUiColor || '',
          syncUiWithAscii: parsed.syncUiWithAscii !== undefined ? parsed.syncUiWithAscii : true,
          autoCollapsePanels: parsed.autoCollapsePanels !== undefined ? parsed.autoCollapsePanels : true,
          lowResPreview: parsed.lowResPreview !== undefined ? parsed.lowResPreview : true,
          uiMode: resolveUiMode(parsed),
        };
      }
    } catch {}
    return {
      uiTheme: 'green',
      customUiColor: '',
      syncUiWithAscii: true,
      autoCollapsePanels: true,
      lowResPreview: true,
      uiMode: resolveUiMode(null),
    };
  });

  const uiMode: UiMode = uiThemeSettings.uiMode ?? 'advanced';

  /*
   * Read out as a plain boolean so the render effect can depend on it without
   * depending on the whole settings object -- otherwise picking an accent
   * colour would re-raster the image.
   */
  const lowResPreview = uiThemeSettings.lowResPreview ?? true;

  // Persist interface theme settings in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_UI_THEME_KEY, JSON.stringify(uiThemeSettings));
    } catch {}
  }, [uiThemeSettings]);

  /*
   * Reconcile a stored BASIC preference against a shared link that opens on a
   * source BASIC cannot show.
   *
   * The link is the more specific intent -- someone sent a particular synth or
   * model scene -- so ADVANCED wins here, rather than coercing the source to
   * media and dropping the thing the link was for. Mount only: once the app is
   * running, BASIC offers no way to leave media, and handleChangeUiMode
   * batches its own coercion.
   */
  useEffect(() => {
    if (uiThemeSettings.uiMode === 'basic' && appMode !== 'media') {
      setUiThemeSettings((prev) => ({ ...prev, uiMode: 'advanced' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist render settings per mode in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_RENDER_SETTINGS_KEY, JSON.stringify(renderSettingsByMode));
    } catch {}
  }, [renderSettingsByMode]);

  // Render setting setters operating on the current appMode
  const setDensity = useCallback((d: string | ((prev: string) => string)) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof d === 'function' ? d(prev[mode].density) : d;
      return {
        ...prev,
        [mode]: { ...prev[mode], density: val },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setTheme = useCallback((t: PhosphorTheme | ((prev: PhosphorTheme) => PhosphorTheme)) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof t === 'function' ? t(prev[mode].theme) : t;
      return {
        ...prev,
        [mode]: { ...prev[mode], theme: val },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setCustomThemeColor = useCallback((c: string | ((prev: string) => string)) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof c === 'function' ? c(prev[mode].customThemeColor) : c;
      return {
        ...prev,
        [mode]: { ...prev[mode], customThemeColor: val },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setGradientConfig = useCallback((g: (PhosphorGradient | null) | ((prev: PhosphorGradient | null) => (PhosphorGradient | null))) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof g === 'function' ? g(prev[mode].gradientConfig) : g;
      return {
        ...prev,
        [mode]: { ...prev[mode], gradientConfig: val },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setCrtConfig = useCallback((cfg: CrtConfig | ((prev: CrtConfig) => CrtConfig)) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof cfg === 'function' ? cfg(prev[mode].crtConfig) : cfg;
      return {
        ...prev,
        [mode]: { ...prev[mode], crtConfig: val },
      };
    });
  }, []);

  const setOptimizeConfig = useCallback((opt: OptimizeConfig | ((prev: OptimizeConfig) => OptimizeConfig)) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const val = typeof opt === 'function' ? opt(prev[mode].optimizeConfig) : opt;
      return {
        ...prev,
        [mode]: { ...prev[mode], optimizeConfig: val },
      };
    });
  }, []);

  const handleSelectTheme = useCallback((t: PhosphorTheme) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          theme: t,
          customThemeColor: '',
          gradientConfig: null,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const handleSelectCustomColor = useCallback((c: string) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          customThemeColor: c,
          gradientConfig: null,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const handleSelectMediaColorConfig = useCallback((cfg: MediaColorConfig) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          mediaColorConfig: cfg,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);



  /** Live viewfinder aspect, reported by the viewport, for ratio-locking the grid. */
  const [viewfinderAspect, setViewfinderAspect] = useState<number>(16 / 9);

  // Particles & Interaction
  const [particleConfig, setParticleConfig] = useState<ParticleConfig>(
    sharedState?.particleConfig || DEFAULT_PARTICLE_CONFIG
  );
  const trailPointsRef = useRef<TrailPoint[]>([]);

  // View Mode: 'editor' or 'fullscreen'
  const [viewMode, setViewMode] = useState<'editor' | 'fullscreen'>(
    initialUrlData.mode === 'fullscreen' ? 'fullscreen' : 'editor'
  );
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  /** Viewfinder framing sampled when SHARE is pressed; see the button below. */
  const [shareView, setShareView] = useState<ShareView | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const viewportRef = useRef<AsciiViewportHandle>(null);
  const currentFpsRef = useRef<number>(30);

  // UI state
  /**
   * Which sidebar section the rail is pointing at.
   *
   * CONTENT and RENDER used to be two tabs, and choosing an image meant
   * leaving the controls that made it look like anything — a round trip you
   * paid on every adjustment. They are one scrolling column now, so this is no
   * longer a filter on what renders: it is scroll position, read back from the
   * headings, and the rail scrolls to them rather than swapping them in.
   */
  /* ======================================================================
     Luminance histogram, for the Levels control.

     processRasterFrame hands its histogram back on every frame, as a live
     module buffer it overwrites next time round. Two consequences shape this:
     it has to be copied to be held, and it must not be promoted to state per
     frame -- a synth loop runs at 60fps and would re-render the whole sidebar
     that often to redraw 256 bars.

     So: sampled while the editor is active, throttled to 200ms, and copied on
     the way out.
     ====================================================================== */
  const [histogramSnapshot, setHistogramSnapshot] =
    useState<{ bins: Uint32Array; opaque: number } | null>(null);
  const wantsHistogramRef = useRef<boolean>(true);
  const lastHistogramPushRef = useRef<number>(0);

  const captureHistogram = useCallback(
    (res: { histogram: Uint32Array; histogramOpaque: number }) => {
      if (!wantsHistogramRef.current) return;
      const now = performance.now();
      if (now - lastHistogramPushRef.current < 200) return;
      lastHistogramPushRef.current = now;
      setHistogramSnapshot({
        bins: new Uint32Array(res.histogram),
        opaque: res.histogramOpaque,
      });
    },
    []
  );

  useEffect(() => {
    wantsHistogramRef.current = viewMode === 'editor';
  }, [viewMode]);

  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportInitialTab, setExportInitialTab] = useState<ExportTab>('image');
  const [isRandomizing, setIsRandomizing] = useState<boolean>(false);

  // Undo / Redo History Stack (Separate stacks for Synth, Media, and Model modes)
  const synthHistoryRef = useRef<HistorySnapshot[]>([]);
  const synthHistoryIndexRef = useRef<number>(-1);
  const synthHistoryDebounceTimer = useRef<any>(null);

  const modelHistoryRef = useRef<ModelHistorySnapshot[]>([]);
  const modelHistoryIndexRef = useRef<number>(-1);
  const modelHistoryDebounceTimer = useRef<any>(null);

  const mediaHistoryRef = useRef<MediaHistorySnapshot[]>([]);
  const mediaHistoryIndexRef = useRef<number>(-1);
  const mediaHistoryDebounceTimer = useRef<any>(null);

  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const updateHistoryButtons = useCallback(() => {
    if (appMode === 'synth') {
      setCanUndo(synthHistoryIndexRef.current > 0);
      setCanRedo(synthHistoryIndexRef.current < synthHistoryRef.current.length - 1);
    } else if (appMode === 'media') {
      setCanUndo(mediaHistoryIndexRef.current > 0);
      setCanRedo(mediaHistoryIndexRef.current < mediaHistoryRef.current.length - 1);
    } else {
      setCanUndo(modelHistoryIndexRef.current > 0);
      setCanRedo(modelHistoryIndexRef.current < modelHistoryRef.current.length - 1);
    }
  }, [appMode]);

  useEffect(() => {
    updateHistoryButtons();
  }, [appMode, updateHistoryButtons]);

  // Check if current parameters or formula differ from the active preset
  const isEdited = useMemo(() => {
    if (!activePreset) return false;
    if (presetType !== activePreset.type) return true;
    if (presetType === 'custom') {
      if (customCode !== activePreset.customCode) return true;
      if ((customPrepare || '') !== (activePreset.customPrepare || '')) return true;
    }
    const base = activePreset.params || DEFAULT_WAVE_PARAMS;
    const keys = Object.keys(DEFAULT_WAVE_PARAMS) as (keyof WaveParams)[];
    for (const k of keys) {
      if (waveParams[k] !== base[k]) return true;
    }
    return false;
  }, [activePreset, presetType, customCode, customPrepare, waveParams]);

  const pushHistorySnapshot = useCallback(
    (
      params: WaveParams,
      code: string,
      name: string,
      prepare?: string,
      type?: 'parametric' | 'custom',
      optConfig?: OptimizeConfig,
      crt?: CrtConfig,
      thm?: PhosphorTheme,
      cColor?: string,
      grad?: PhosphorGradient | null,
      dens?: string
    ) => {
      const nextIndex = synthHistoryIndexRef.current + 1;
      const newHistory = synthHistoryRef.current.slice(0, nextIndex);
      const curSynth = renderSettingsByMode.synth;
      newHistory.push({
        waveParams: { ...params },
        customCode: code,
        customPrepare: prepare || '',
        presetName: name,
        presetType: type || 'parametric',
        theme: thm !== undefined ? thm : curSynth.theme,
        customThemeColor: cColor !== undefined ? cColor : curSynth.customThemeColor,
        gradientConfig: grad !== undefined ? grad : curSynth.gradientConfig,
        density: dens !== undefined ? dens : curSynth.density,
        crtConfig: crt !== undefined ? { ...crt } : { ...curSynth.crtConfig },
        optimizeConfig: optConfig !== undefined ? { ...optConfig } : { ...curSynth.optimizeConfig },
      });
      if (newHistory.length > 50) newHistory.shift();
      synthHistoryRef.current = newHistory;
      synthHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [renderSettingsByMode.synth, updateHistoryButtons]
  );

  const pushModelHistorySnapshot = useCallback(
    (
      mConfig: ModelConfig,
      vConfig: ModelViewConfig,
      preset?: ModelPreset,
      optConfig?: OptimizeConfig,
      crt?: CrtConfig,
      thm?: PhosphorTheme,
      cColor?: string,
      grad?: PhosphorGradient | null,
      dens?: string
    ) => {
      const nextIndex = modelHistoryIndexRef.current + 1;
      const newHistory = modelHistoryRef.current.slice(0, nextIndex);
      const curModel = renderSettingsByMode.model;
      newHistory.push({
        modelConfig: { ...mConfig },
        modelViewConfig: { ...vConfig },
        activePreset: preset ? { ...preset } : undefined,
        theme: thm !== undefined ? thm : curModel.theme,
        customThemeColor: cColor !== undefined ? cColor : curModel.customThemeColor,
        gradientConfig: grad !== undefined ? grad : curModel.gradientConfig,
        density: dens !== undefined ? dens : curModel.density,
        crtConfig: crt !== undefined ? { ...crt } : { ...curModel.crtConfig },
        optimizeConfig: optConfig !== undefined ? { ...optConfig } : { ...curModel.optimizeConfig },
      });
      if (newHistory.length > 50) newHistory.shift();
      modelHistoryRef.current = newHistory;
      modelHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [renderSettingsByMode.model, updateHistoryButtons]
  );

  const pushMediaHistorySnapshot = useCallback(
    (
      mConfig: MediaConfig,
      vConfig: MediaViewConfig,
      preset?: MediaPreset,
      optConfig?: OptimizeConfig,
      crt?: CrtConfig,
      thm?: PhosphorTheme,
      cColor?: string,
      grad?: PhosphorGradient | null,
      dens?: string
    ) => {
      const nextIndex = mediaHistoryIndexRef.current + 1;
      const newHistory = mediaHistoryRef.current.slice(0, nextIndex);
      const curMedia = renderSettingsByMode.media;
      newHistory.push({
        mediaConfig: { ...mConfig },
        mediaViewConfig: { ...vConfig },
        activePreset: preset ? { ...preset } : undefined,
        theme: thm !== undefined ? thm : curMedia.theme,
        customThemeColor: cColor !== undefined ? cColor : curMedia.customThemeColor,
        gradientConfig: grad !== undefined ? grad : curMedia.gradientConfig,
        density: dens !== undefined ? dens : curMedia.density,
        crtConfig: crt !== undefined ? { ...crt } : { ...curMedia.crtConfig },
        optimizeConfig: optConfig !== undefined ? { ...optConfig } : { ...curMedia.optimizeConfig },
      });
      if (newHistory.length > 50) newHistory.shift();
      mediaHistoryRef.current = newHistory;
      mediaHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [renderSettingsByMode.media, updateHistoryButtons]
  );

  // Initialize initial media element on mount
  useEffect(() => {
    const dataUrl = mediaConfig.fileData;
    if (dataUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        triggerMediaRender();
      };
      img.src = dataUrl;
    }
  }, []);

  // Initialize first history entries
  useEffect(() => {
    if (synthHistoryRef.current.length === 0) {
      const initialCode = generateFormulaCode(DEFAULT_WAVE_PARAMS);
      synthHistoryRef.current = [
        {
          waveParams: { ...DEFAULT_WAVE_PARAMS },
          customCode: initialCode,
          customPrepare: '',
          presetName: PRESETS[0].name,
          presetType: 'parametric',
          theme: renderSettingsByMode.synth.theme,
          customThemeColor: renderSettingsByMode.synth.customThemeColor,
          gradientConfig: renderSettingsByMode.synth.gradientConfig,
          density: renderSettingsByMode.synth.density,
          crtConfig: { ...renderSettingsByMode.synth.crtConfig },
          optimizeConfig: { ...renderSettingsByMode.synth.optimizeConfig },
        },
      ];
      synthHistoryIndexRef.current = 0;
    }
    if (modelHistoryRef.current.length === 0) {
      modelHistoryRef.current = [
        {
          modelConfig: { ...modelConfig },
          modelViewConfig: { ...modelViewConfig },
          theme: renderSettingsByMode.model.theme,
          customThemeColor: renderSettingsByMode.model.customThemeColor,
          gradientConfig: renderSettingsByMode.model.gradientConfig,
          density: renderSettingsByMode.model.density,
          crtConfig: { ...renderSettingsByMode.model.crtConfig },
          optimizeConfig: { ...renderSettingsByMode.model.optimizeConfig },
        },
      ];
      modelHistoryIndexRef.current = 0;
    }
    if (mediaHistoryRef.current.length === 0) {
      mediaHistoryRef.current = [
        {
          mediaConfig: { ...mediaConfig },
          mediaViewConfig: { ...mediaViewConfig },
          theme: renderSettingsByMode.media.theme,
          customThemeColor: renderSettingsByMode.media.customThemeColor,
          gradientConfig: renderSettingsByMode.media.gradientConfig,
          density: renderSettingsByMode.media.density,
          crtConfig: { ...renderSettingsByMode.media.crtConfig },
          optimizeConfig: { ...renderSettingsByMode.media.optimizeConfig },
        },
      ];
      mediaHistoryIndexRef.current = 0;
    }
    updateHistoryButtons();
  }, [updateHistoryButtons]);

  // Compile custom code when changed
  const recompileCustomCode = useCallback((code: string, prepare?: string) => {
    const res = compileCustomCode(code, prepare);
    if (res.error) {
      setCompileError(res.error);
    } else {
      setCompileError(null);
      compiledFnRef.current = res.fn;
      prepareFnRef.current = res.prepareFn;
    }
  }, []);

  const restoreModelSnapshot = useCallback((snapshot: ModelHistorySnapshot) => {
    setModelConfig({ ...snapshot.modelConfig });
    setModelViewConfig({ ...snapshot.modelViewConfig });

    if (snapshot.modelConfig.sourceType === 'preset') {
      const modelId = (snapshot.modelConfig.modelId || 'torus-knot') as BuiltinModelId;
      const initialGeo = getBuiltinGeometry(modelId);
      currentGeometryRef.current = initialGeo;
      loadBuiltinGeometryAsync(modelId).then((geo) => {
        currentGeometryRef.current = geo;
      });
    }

    setRenderSettingsByMode((prev) => ({
      ...prev,
      model: {
        ...prev.model,
        theme: snapshot.theme !== undefined ? snapshot.theme : prev.model.theme,
        customThemeColor: snapshot.customThemeColor !== undefined ? snapshot.customThemeColor : prev.model.customThemeColor,
        gradientConfig: snapshot.gradientConfig !== undefined ? snapshot.gradientConfig : prev.model.gradientConfig,
        density: snapshot.density !== undefined ? snapshot.density : prev.model.density,
        crtConfig: snapshot.crtConfig ? { ...snapshot.crtConfig } : prev.model.crtConfig,
        optimizeConfig: snapshot.optimizeConfig ? { ...snapshot.optimizeConfig } : prev.model.optimizeConfig,
      },
    }));
  }, []);

  const restoreMediaSnapshot = useCallback((snapshot: MediaHistorySnapshot) => {
    setMediaConfig({ ...snapshot.mediaConfig });
    setMediaViewConfig({ ...snapshot.mediaViewConfig });

    if (snapshot.mediaConfig.fileData) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        triggerMediaRender();
      };
      img.src = snapshot.mediaConfig.fileData;
    }

    setRenderSettingsByMode((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        theme: snapshot.theme !== undefined ? snapshot.theme : prev.media.theme,
        customThemeColor: snapshot.customThemeColor !== undefined ? snapshot.customThemeColor : prev.media.customThemeColor,
        gradientConfig: snapshot.gradientConfig !== undefined ? snapshot.gradientConfig : prev.media.gradientConfig,
        density: snapshot.density !== undefined ? snapshot.density : prev.media.density,
        crtConfig: snapshot.crtConfig ? { ...snapshot.crtConfig } : prev.media.crtConfig,
        optimizeConfig: snapshot.optimizeConfig ? { ...snapshot.optimizeConfig } : prev.media.optimizeConfig,
      },
    }));
  }, []);

  const handleUndo = useCallback(() => {
    if (appMode === 'synth') {
      if (synthHistoryIndexRef.current > 0) {
        synthHistoryIndexRef.current -= 1;
        const snapshot = synthHistoryRef.current[synthHistoryIndexRef.current];
        setWaveParams({ ...snapshot.waveParams });
        setCustomCode(snapshot.customCode);
        setCustomPrepare(snapshot.customPrepare || '');
        setPresetType(snapshot.presetType || 'parametric');
        setRenderSettingsByMode((prev) => ({
          ...prev,
          synth: {
            ...prev.synth,
            theme: snapshot.theme !== undefined ? snapshot.theme : prev.synth.theme,
            customThemeColor: snapshot.customThemeColor !== undefined ? snapshot.customThemeColor : prev.synth.customThemeColor,
            gradientConfig: snapshot.gradientConfig !== undefined ? snapshot.gradientConfig : prev.synth.gradientConfig,
            density: snapshot.density !== undefined ? snapshot.density : prev.synth.density,
            crtConfig: snapshot.crtConfig ? { ...snapshot.crtConfig } : prev.synth.crtConfig,
            optimizeConfig: snapshot.optimizeConfig ? { ...snapshot.optimizeConfig } : prev.synth.optimizeConfig,
          },
        }));
        recompileCustomCode(snapshot.customCode, snapshot.customPrepare);
        updateHistoryButtons();
      }
    } else if (appMode === 'media') {
      if (mediaHistoryIndexRef.current > 0) {
        mediaHistoryIndexRef.current -= 1;
        const snapshot = mediaHistoryRef.current[mediaHistoryIndexRef.current];
        restoreMediaSnapshot(snapshot);
        updateHistoryButtons();
      }
    } else {
      if (modelHistoryIndexRef.current > 0) {
        modelHistoryIndexRef.current -= 1;
        const snapshot = modelHistoryRef.current[modelHistoryIndexRef.current];
        restoreModelSnapshot(snapshot);
        updateHistoryButtons();
      }
    }
  }, [appMode, recompileCustomCode, restoreModelSnapshot, restoreMediaSnapshot, updateHistoryButtons]);

  const handleRedo = useCallback(() => {
    if (appMode === 'synth') {
      if (synthHistoryIndexRef.current < synthHistoryRef.current.length - 1) {
        synthHistoryIndexRef.current += 1;
        const snapshot = synthHistoryRef.current[synthHistoryIndexRef.current];
        setWaveParams({ ...snapshot.waveParams });
        setCustomCode(snapshot.customCode);
        setCustomPrepare(snapshot.customPrepare || '');
        setPresetType(snapshot.presetType || 'parametric');
        setRenderSettingsByMode((prev) => ({
          ...prev,
          synth: {
            ...prev.synth,
            theme: snapshot.theme !== undefined ? snapshot.theme : prev.synth.theme,
            customThemeColor: snapshot.customThemeColor !== undefined ? snapshot.customThemeColor : prev.synth.customThemeColor,
            gradientConfig: snapshot.gradientConfig !== undefined ? snapshot.gradientConfig : prev.synth.gradientConfig,
            density: snapshot.density !== undefined ? snapshot.density : prev.synth.density,
            crtConfig: snapshot.crtConfig ? { ...snapshot.crtConfig } : prev.synth.crtConfig,
            optimizeConfig: snapshot.optimizeConfig ? { ...snapshot.optimizeConfig } : prev.synth.optimizeConfig,
          },
        }));
        recompileCustomCode(snapshot.customCode, snapshot.customPrepare);
        updateHistoryButtons();
      }
    } else if (appMode === 'media') {
      if (mediaHistoryIndexRef.current < mediaHistoryRef.current.length - 1) {
        mediaHistoryIndexRef.current += 1;
        const snapshot = mediaHistoryRef.current[mediaHistoryIndexRef.current];
        restoreMediaSnapshot(snapshot);
        updateHistoryButtons();
      }
    } else {
      if (modelHistoryIndexRef.current < modelHistoryRef.current.length - 1) {
        modelHistoryIndexRef.current += 1;
        const snapshot = modelHistoryRef.current[modelHistoryIndexRef.current];
        restoreModelSnapshot(snapshot);
        updateHistoryButtons();
      }
    }
  }, [appMode, recompileCustomCode, restoreModelSnapshot, restoreMediaSnapshot, updateHistoryButtons]);

  // Effective UI theme and sync calculations
  const currentRasterMode: RasterOutputMode =
    (appMode === 'media'
      ? mediaViewConfig.rasterMode || currentRenderSettings.rasterMode
      : currentRenderSettings.rasterMode) || 'pixel';

  const currentTonalMapping =
    (appMode === 'media' ? mediaViewConfig.tonalMapping : currentRenderSettings.adjustConfig?.tonalMapping) || '1color';
  const currentPaletteMode =
    (appMode === 'media' ? mediaColorConfig?.paletteMode : currentRenderSettings.mediaColorConfig?.paletteMode) || 'phosphor';

  /*
   * The colour config the renderers actually receive, with the monochrome tint
   * resolved in. Derived rather than stored: the tint lives in theme /
   * customThemeColor, and duplicating it into the config would let the two
   * drift apart.
   */
  const renderColorConfig = useMemo(
    () => ({
      ...(mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG),
      monoTint: resolvePhosphorTint(theme, customThemeColor),
    }),
    [mediaColorConfig, theme, customThemeColor]
  );

  const isSingleColorAscii =
    currentRasterMode === 'ascii' &&
    currentTonalMapping === '1color' &&
    currentPaletteMode === 'phosphor';

  const isSyncActive = uiThemeSettings.syncUiWithAscii && isSingleColorAscii;

  const effectiveUiTheme: PhosphorTheme = isSyncActive ? theme : uiThemeSettings.uiTheme;
  const effectiveCustomUiColor: string = isSyncActive ? (customThemeColor || '') : uiThemeSettings.customUiColor;
  const effectiveGradientConfig = isSyncActive ? gradientConfig : null;

  // Update theme class and custom color CSS variables on body
  useEffect(() => {
    const allVars = [
      '--bg-primary',
      '--bg-panel',
      '--bg-control',
      '--bg-control-hover',
      '--border-color',
      '--border-active',
      '--text-primary',
      '--text-muted',
      '--text-dim',
      '--accent',
      '--accent-glow',
      '--text-gradient',
      '--grad-color-1',
      '--grad-color-2',
    ];

    /*
     * Both custom paths tint the interface from a single seed: a gradient
     * leads with its first stop, otherwise the chosen accent stands alone.
     * Only the gradient path additionally publishes the gradient variables.
     */
    const seed = effectiveGradientConfig ? effectiveGradientConfig.color1 : effectiveCustomUiColor;

    if (!seed) {
      document.body.className = `theme-${effectiveUiTheme}`;
      allVars.forEach((v) => document.body.style.removeProperty(v));
      return;
    }

    const [r, g, b] = parseAccentChannels(seed);

    // A dark accent cannot carry an interface on black, so it flips to paper.
    const usePaperTheme = 0.299 * r + 0.587 * g + 0.114 * b < 80;
    document.body.className = usePaperTheme ? 'theme-custom theme-paper' : 'theme-custom';

    const tint = buildInterfaceTint(r, g, b, usePaperTheme);
    const accent = `rgb(${r}, ${g}, ${b})`;

    document.body.style.setProperty('--bg-primary', tint.bgPrimary);
    document.body.style.setProperty('--bg-panel', tint.bgPanel);
    document.body.style.setProperty('--bg-control', tint.bgControl);
    document.body.style.setProperty('--bg-control-hover', tint.bgControlHover);
    document.body.style.setProperty('--border-color', tint.borderColor);
    document.body.style.setProperty('--border-active', accent);
    document.body.style.setProperty('--text-primary', accent);
    document.body.style.setProperty('--text-muted', tint.textMuted);
    document.body.style.setProperty('--text-dim', tint.textDim);
    document.body.style.setProperty('--accent', accent);
    document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, ${tint.glowAlpha})`);

    if (effectiveGradientConfig) {
      document.body.style.setProperty(
        '--text-gradient',
        `linear-gradient(${effectiveGradientConfig.angle}deg, ${effectiveGradientConfig.color1}, ${effectiveGradientConfig.color2})`
      );
      document.body.style.setProperty('--grad-color-1', effectiveGradientConfig.color1);
      document.body.style.setProperty('--grad-color-2', effectiveGradientConfig.color2);
    } else {
      document.body.style.removeProperty('--text-gradient');
      document.body.style.removeProperty('--grad-color-1');
      document.body.style.removeProperty('--grad-color-2');
    }
  }, [effectiveUiTheme, effectiveCustomUiColor, effectiveGradientConfig]);

  // If shared state had custom code on load, compile it immediately
  useEffect(() => {
    if (sharedState?.customCode) {
      recompileCustomCode(sharedState.customCode, sharedState.customPrepare);
    }
  }, [recompileCustomCode, sharedState]);

  // Handle Preset Selection
  const handleSelectPreset = (preset: Preset) => {
    setActivePreset(preset);

    const isCustom = preset.type === 'custom' || Boolean(preset.customCode && checkFormulaDivergence(preset.customCode, preset.customPrepare || '', preset.params));
    setPresetType(isCustom ? 'custom' : 'parametric');

    if (preset.theme) {
      setTheme(preset.theme);
    }

    if (preset.customThemeColor !== undefined) {
      setCustomThemeColor(preset.customThemeColor || '');
    } else {
      setCustomThemeColor('');
    }

    if (preset.gradientConfig !== undefined) {
      setGradientConfig(preset.gradientConfig || null);
    } else {
      setGradientConfig(null);
    }

    if (preset.crtConfig) {
      setCrtConfig({
        scanlines: preset.crtConfig.scanlines ?? true,
        crtGlow: preset.crtConfig.crtGlow ?? (preset.crtConfig.glow ?? false),
        vignette: preset.crtConfig.vignette ?? false,
        phosphorBloom: preset.crtConfig.phosphorBloom ?? (preset.crtConfig.glow ?? false),
      });
    }

    if (preset.densityCharset) {
      setDensity(preset.densityCharset);
    }

    if (preset.particleConfig) {
      setParticleConfig({ ...preset.particleConfig });
    }

    if (preset.optimizeConfig) {
      setOptimizeConfig({ ...preset.optimizeConfig });
    }

    const newParams: WaveParams = {
      ...DEFAULT_WAVE_PARAMS,
      ...(preset.params || {}),
    };
    setWaveParams(newParams);

    const formula = preset.customCode || generateFormulaCode(newParams);
    const prepare = preset.customPrepare || '';
    setCustomCode(formula);
    setCustomPrepare(prepare);
    recompileCustomCode(formula, prepare);

    pushHistorySnapshot(newParams, formula, preset.name, prepare, isCustom ? 'custom' : 'parametric');
  };

  // When tweaking sliders in Synth tab
  const handleParamChange = (updated: WaveParams) => {
    setWaveParams(updated);
    if (presetType !== 'parametric') {
      setPresetType('parametric');
    }

    const formula = generateFormulaCode(updated);
    setCustomCode(formula);
    recompileCustomCode(formula, customPrepare);

    clearTimeout(synthHistoryDebounceTimer.current);
    synthHistoryDebounceTimer.current = setTimeout(() => {
      pushHistorySnapshot(updated, formula, activePreset.name, customPrepare, 'parametric');
    }, 400);
  };

  // When editing code in Formula tab
  const handleFormulaCodeChange = (newCode: string, newPrepare?: string) => {
    setCustomCode(newCode);
    setCustomPrepare(newPrepare || '');

    const parsed = parseFormulaCodeToParams(newCode, waveParams);
    setWaveParams(parsed);

    const isDivergent = checkFormulaDivergence(newCode, newPrepare || '', parsed);
    setPresetType(isDivergent ? 'custom' : 'parametric');
    recompileCustomCode(newCode, newPrepare);

    clearTimeout(synthHistoryDebounceTimer.current);
    synthHistoryDebounceTimer.current = setTimeout(() => {
      pushHistorySnapshot(parsed, newCode, isDivergent ? 'Custom Formula' : activePreset.name, newPrepare, isDivergent ? 'custom' : 'parametric');
    }, 600);
  };

  const handleOverrideFormulaWithSliders = () => {
    const pureFormula = generateFormulaCode(waveParams);
    setCustomCode(pureFormula);
    setCustomPrepare('');
    setPresetType('parametric');
    recompileCustomCode(pureFormula, '');
    pushHistorySnapshot(waveParams, pureFormula, activePreset.name, '', 'parametric');
  };

  // Initial async geometry loader (for Torus Knot & remote models)
  useEffect(() => {
    if (modelConfig.sourceType === 'preset') {
      setIsModelLoading(true);
      setModelLoadingFileName('Torus Knot');
      setModelLoadingStatusText('Loading');
      loadBuiltinGeometryAsync('torus-knot')
        .then((geo) => {
          currentGeometryRef.current = geo;
          const stats = getGeometryStats(geo);
          setModelConfig((prev) => ({
            ...prev,
            polyStats: stats,
          }));
        })
        .finally(() => setIsModelLoading(false));
    } else if (modelConfig.sourceType === 'url' && modelConfig.remoteUrl) {
      setIsModelLoading(true);
      setModelLoadingFileName(modelConfig.fileName || 'Online Model');
      setModelLoadingStatusText('Downloading');
      const ext = modelConfig.fileType || 'glb';
      fetchRemoteGeometry(modelConfig.remoteUrl, ext as any)
        .then((res) => {
          currentGeometryRef.current = res.geometry;
          setModelConfig((prev) => ({
            ...prev,
            polyStats: res.stats,
          }));
        })
        .catch((e) => console.warn('Failed to load remote model on initialization:', e))
        .finally(() => setIsModelLoading(false));
    }
  }, []);

  const handleLoadRemoteModel = useCallback(
    async (model: Khronos3DModel) => {
      setIsModelLoading(true);
      setModelLoadingFileName(model.title);
      setModelLoadingStatusText('Downloading');
      try {
        const result = await fetchRemoteGeometry(model.downloadUrl, 'glb');
        currentGeometryRef.current = result.geometry;
        const newConfig: ModelConfig = {
          ...modelConfig,
          sourceType: 'url',
          modelId: model.id,
          fileName: model.title,
          fileType: 'glb',
          remoteUrl: model.downloadUrl,
          remoteAttribution: `${model.author} (${model.license})`,
          polyStats: result.stats,
        };
        setModelConfig(newConfig);
        pushModelHistorySnapshot(newConfig, modelViewConfig);
      } catch (err) {
        console.error('Failed to load remote 3D model:', err);
        alert(`Could not download 3D model "${model.title}".`);
      } finally {
        setIsModelLoading(false);
      }
    },
    [modelConfig, modelViewConfig, pushModelHistorySnapshot]
  );

  const handleLoadCustomGeometry = (
    geometry: THREE.BufferGeometry,
    fileName: string,
    fileType: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply',
    stats: { vertices: number; faces: number }
  ) => {
    currentGeometryRef.current = geometry;
    const newConfig: ModelConfig = {
      ...modelConfig,
      sourceType: 'file',
      fileName,
      fileType,
      polyStats: stats,
    };
    setModelConfig(newConfig);
    pushModelHistorySnapshot(newConfig, modelViewConfig);
  };

  const handleSelectBuiltinGeometry = (_id?: BuiltinModelId) => {
    loadBuiltinGeometryAsync('torus-knot')
      .then((geo) => {
        currentGeometryRef.current = geo;
        const stats = getGeometryStats(geo);
        const newConfig: ModelConfig = {
          ...modelConfig,
          sourceType: 'preset',
          modelId: 'torus-knot',
          fileName: undefined,
          polyStats: stats,
        };
        setModelConfig(newConfig);
        pushModelHistorySnapshot(newConfig, modelViewConfig);
      });
  };

  const handleChangeModelConfig = useCallback((newConfig: ModelConfig) => {
    setModelConfig(newConfig);
    clearTimeout(modelHistoryDebounceTimer.current);
    modelHistoryDebounceTimer.current = setTimeout(() => {
      pushModelHistorySnapshot(newConfig, modelViewConfig);
    }, 400);
  }, [modelViewConfig, pushModelHistorySnapshot]);

  const handleChangeModelViewConfig = useCallback((newViewConfig: ModelViewConfig) => {
    setModelViewConfig(newViewConfig);
    clearTimeout(modelHistoryDebounceTimer.current);
    modelHistoryDebounceTimer.current = setTimeout(() => {
      pushModelHistorySnapshot(modelConfig, newViewConfig);
    }, 400);
  }, [modelConfig, pushModelHistorySnapshot]);

  const handleOrbitRotate = useCallback(
    (prevX: number, prevY: number, currX: number, currY: number, width: number, height: number) => {
      setModelViewConfig((prev) => {
        const nextRot = applyTrackballRotationWithTime(
          prev,
          timeRef.current,
          prevX,
          prevY,
          currX,
          currY,
          width,
          height
        );
        return {
          ...prev,
          ...nextRot,
        };
      });
    },
    []
  );

  const handleResetModelRotation = useCallback(() => {
    const updated = {
      ...modelViewConfig,
      manualRotationX: 0,
      manualRotationY: 0,
      manualRotationZ: 0,
    };
    setModelViewConfig(updated);
    pushModelHistorySnapshot(modelConfig, updated);
  }, [modelConfig, modelViewConfig, pushModelHistorySnapshot]);

  // Media Handlers
  /**
   * Size the media grid to a freshly loaded (or freshly re-rastered) source.
   *
   * `resetDpi` is only for the upload paths: callers that are mid-way through
   * their own setMediaViewConfig would have the DPI write batched away by the
   * update that follows, so they opt out rather than silently losing it.
   */
  const autoSetMediaResolution = useCallback((
    w: number,
    h: number,
    rasterModeOverride?: RasterOutputMode,
    resetDpi = false
  ) => {
    if (w <= 0 || h <= 0) return;
    const srcAspect = w / h;
    // Media keeps its raster mode in two places and mediaViewConfig.rasterMode is
    // often undefined, so fall back the same way currentRasterMode does. Reading
    // only the first source silently took the ASCII branch and sized the grid at
    // roughly a sixth of the source.
    const effectiveMode =
      rasterModeOverride ||
      mediaViewConfig.rasterMode ||
      renderSettingsByMode.media.rasterMode;
    const isPixel = effectiveMode === 'pixel';
    const isVector = effectiveMode === 'vector';
    /* Vector shares pixel's square cells: polylines are geometry, not glyphs. */
    const cellAspect = isPixel || isVector ? 1.0 : 0.55;

    let targetCols: number;
    let targetRows: number;
    if (isVector) {
      /*
       * The grid is the beam's sampling resolution here, not a display raster,
       * so it wants to be generous — a coarse one makes a deflected line
       * visibly faceted. 800 across matches the studio's own
       * `min(800, source.width)` working buffer.
       */
      const targetWidth = Math.min(VECTOR_SAMPLE_COLS, Math.max(200, w));
      targetCols = Math.round(targetWidth);
      targetRows = Math.max(10, Math.round(targetCols / srcAspect));
    } else if (isPixel) {
      /*
       * Derive from the default DPI using the same mapping the DPI panel uses
       * (cols = source px * dpi / 100), so the grid and the DPI readout agree
       * the moment media lands instead of the readout describing a resolution
       * nothing actually set.
       */
      const scale = MEDIA_DEFAULT_DPI / 100;
      targetCols = Math.max(10, Math.min(2048, Math.round(w * scale)));
      targetRows = Math.max(10, Math.round(h * scale));
    } else {
      targetCols = Math.max(20, Math.round(w * (1 / 6)));
      targetRows = Math.max(10, Math.round((targetCols * cellAspect) / srcAspect));
    }

    setRenderSettingsByMode((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        cols: targetCols,
        rows: targetRows,
        autoRes: false,
      },
    }));

    if (resetDpi) {
      setMediaViewConfig((prev) => (prev.dpi === MEDIA_DEFAULT_DPI ? prev : { ...prev, dpi: MEDIA_DEFAULT_DPI }));
    }

    setTimeout(() => {
      viewportRef.current?.autoFit();
    }, 60);
  }, [mediaViewConfig.rasterMode, renderSettingsByMode.media.rasterMode]);

  const handleChangeMediaConfig = useCallback((newConfig: MediaConfig) => {
    setMediaConfig(newConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    }, 400);
  }, [mediaViewConfig, pushMediaHistorySnapshot]);

  const handleChangeAdjustConfig = useCallback((next: ImageAdjustConfig) => {
    setRenderSettingsByMode((prev) => ({
      ...prev,
      [appMode]: { ...prev[appMode], adjustConfig: next },
    }));
  }, [appMode]);

  /*
   * Levels lives in toneConfig, this record's other grading store. Nothing
   * wrote it before the Levels control existed, so it had no setter.
   */
  const handleChangeToneConfig = useCallback((next: ToneMappingConfig) => {
    setRenderSettingsByMode((prev) => ({
      ...prev,
      [appMode]: { ...prev[appMode], toneConfig: next },
    }));
    triggerMediaRender();
  }, [appMode, triggerMediaRender]);

  /**
   * The overlay's source layer for one viewport frame, at the raster's display
   * resolution rather than the grid's.
   *
   * Goes through the exporters' own helpers so the screen and the file cannot
   * disagree about what "the source" is — the same reason the still and
   * separation exports share `renderExportFrame`.
   *
   * `sourceCapture` for a model frame has to be requested *before* the render,
   * so `modelSourcePpc` below is read inside the animation loop and this only
   * collects the result.
   */
  const buildViewportSourceLayer = useCallback(
    (luminance: Float32Array | null): HTMLCanvasElement | null => {
      const settings = renderSettingsRef.current;
      const mode = appModeRef.current;
      const raster =
        (mode === 'media' ? mediaViewConfigRef.current?.rasterMode : undefined) ||
        settings.rasterMode ||
        'ascii';
      const cell = exportCellSize(raster, 1);
      const layer = overlaySourceLayer({
        postProcess: settings.postProcess,
        appMode: mode,
        rasterMode: raster,
        cols: settings.cols,
        rows: settings.rows,
        ppc: overlaySourcePpc(settings.postProcess, cell.cellWidth, cell.cellHeight),
        mediaElement: mediaElementRef.current,
        mediaConfig: mediaConfigRef.current,
        resampling: mediaViewConfigRef.current?.resampling,
        luminance,
      });
      const canvas = layer instanceof HTMLCanvasElement ? layer : null;
      sourceLayerRef.current = canvas;
      return canvas;
    },
    []
  );

  const handleChangePostProcess = useCallback((next: PostProcessConfig) => {
    setRenderSettingsByMode((prev) => ({
      ...prev,
      [appMode]: { ...prev[appMode], postProcess: next },
    }));
    triggerMediaRender();
  }, [appMode, triggerMediaRender]);


  /**
   * Reset the colour state that lives outside adjustConfig.
   *
   * The Color Mode selector reads paletteMode first and only falls back to
   * tonalMapping, so a reset that touches only the adjust config cannot move
   * it off a palette or off content colour.
   */
  const handleResetPalette = useCallback(() => {
    handleSelectMediaColorConfig({
      ...(mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG),
      paletteMode: DEFAULT_MEDIA_COLOR_CONFIG.paletteMode,
      mode: DEFAULT_MEDIA_COLOR_CONFIG.mode,
      activePaletteId: DEFAULT_MEDIA_COLOR_CONFIG.activePaletteId,
      paletteMatch: DEFAULT_MEDIA_COLOR_CONFIG.paletteMatch,
    });
    handleSelectCustomColor(DEFAULT_PHOSPHOR_TINT);
  }, [mediaColorConfig, handleSelectMediaColorConfig, handleSelectCustomColor]);

  const handleChangeMediaViewConfig = useCallback((newViewConfig: MediaViewConfig) => {
    if (newViewConfig.rasterMode !== mediaViewConfig.rasterMode) {
      const el = mediaElementRef.current;
      let w = 256;
      let h = 256;
      if (el instanceof HTMLImageElement) {
        w = el.naturalWidth || el.width || 256;
        h = el.naturalHeight || el.height || 256;
      } else if (el instanceof HTMLVideoElement) {
        w = el.videoWidth || el.width || 256;
        h = el.videoHeight || el.height || 256;
      }
      autoSetMediaResolution(w, h, newViewConfig.rasterMode);
    }

    setMediaViewConfig(newViewConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(mediaConfig, newViewConfig);
    }, 400);
  }, [mediaConfig, mediaViewConfig, pushMediaHistorySnapshot, autoSetMediaResolution]);

  /*
   * ASCII output starts in MONO colour.
   *
   * N-TONE is the right default for pixel output, where every cell is a solid
   * block and the ramp reads as a gradient. Over glyphs it reads as mud, and
   * per-cell colour is the most expensive part of an ASCII frame -- most of a
   * coloured paint is fillStyle churn (pipeline.md 4.6). So entering ASCII
   * output seeds MONO, which is exactly what the MONO tab in PaletteControls
   * writes: '1color' tonal mapping over the phosphor tint, no palette.
   *
   * Once per mode per session, not on every switch, because this is a default
   * rather than a rule: a colour chosen afterwards -- or restored from
   * localStorage -- has to survive a trip through pixel mode and back.
   */
  const asciiMonoSeededRef = useRef<Set<AppMode>>(new Set<AppMode>());

  const applyMonoColorMode = useCallback(() => {
    const mode = appModeRef.current;
    // Media keeps its tonal mapping in mediaViewConfig; synth and model read it
    // off adjustConfig. Write both so the two never disagree for a mode.
    if (mode === 'media') {
      setMediaViewConfig((prev) =>
        prev.tonalMapping === '1color' ? prev : { ...prev, tonalMapping: '1color' }
      );
    }
    setRenderSettingsByMode((prev) => {
      const cur = prev[mode];
      const baseColor = cur.mediaColorConfig || DEFAULT_MEDIA_COLOR_CONFIG;
      return {
        ...prev,
        [mode]: {
          ...cur,
          adjustConfig: {
            ...(cur.adjustConfig || DEFAULT_IMAGE_ADJUST_CONFIG),
            tonalMapping: '1color',
          },
          mediaColorConfig: { ...baseColor, paletteMode: 'phosphor', mode: 'fixed' },
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const handleSelectRasterMode = useCallback(
    (newMode: RasterOutputMode) => {
      setRenderSettingsByMode((prev) => ({
        ...prev,
        [appMode]: {
          ...prev[appMode],
          rasterMode: newMode,
        },
      }));
      if (newMode === 'ascii' && !asciiMonoSeededRef.current.has(appMode)) {
        asciiMonoSeededRef.current.add(appMode);
        applyMonoColorMode();
      }
      if (appMode === 'media') {
        if (mediaViewConfig.rasterMode !== newMode) {
          const el = mediaElementRef.current;
          let w = 256;
          let h = 256;
          if (el instanceof HTMLImageElement) {
            w = el.naturalWidth || el.width || 256;
            h = el.naturalHeight || el.height || 256;
          } else if (el instanceof HTMLVideoElement) {
            w = el.videoWidth || el.width || 256;
            h = el.videoHeight || el.height || 256;
          }
          autoSetMediaResolution(w, h, newMode);
        }
        setMediaViewConfig((prev) => ({ ...prev, rasterMode: newMode }));
      }
    },
    [appMode, mediaViewConfig.rasterMode, autoSetMediaResolution, applyMonoColorMode]
  );

  /*
   * The density ramp sits directly above RENDER SETTINGS in every mode, which
   * is two different places in the tree: media carries its own RENDER SETTINGS
   * inside MediaViewControls, while synth and model share the block below.
   * Neither non-ASCII mode consults the charset -- pixel paints solid cells,
   * vector strokes polylines -- so the section is omitted outright rather than
   * shown disabled.
   */
  const densityRampSection =
    currentRasterMode !== 'ascii' ? null : (
      <CharsetThemeBar
        currentCharset={density}
        onChangeCharset={setDensity}
        appMode={appMode}
      />
    );

  /**
   * Drop the grading a new source must not inherit, and hand back the view
   * config to record alongside it.
   *
   * Levels, the tone curve and the brightness/contrast family are all fitted to
   * one image's histogram: a black point at 40 and a white point at 190 rescue
   * a washed-out photo and crush the next one to a silhouette. Auto Levels
   * makes that worse, not better — it reads the histogram it is given, so its
   * numbers are the most image-specific values in the whole config.
   *
   * The look choices are deliberately left alone. Algorithm, output mode,
   * resolution, tone ramp, palette and charset say how you want *any* image
   * rendered, and carrying them across is the reason for setting them.
   *
   * Levels live in renderSettingsByMode.media.toneConfig rather than in the
   * view config, so they are reset separately below. That bucket is addressed
   * as 'media' literally rather than through appMode: a clipboard paste flips
   * the mode in this same tick, and appMode still reads as whichever mode is
   * being left.
   */
  const resetGradingForNewSource = useCallback((): MediaViewConfig => {
    const graded: MediaViewConfig = {
      ...mediaViewConfig,
      // Tonal — fitted to the previous image's histogram.
      curvePoints: DEFAULT_MEDIA_VIEW_CONFIG.curvePoints?.map((pt) => [...pt] as [number, number]),
      highlights: DEFAULT_MEDIA_VIEW_CONFIG.highlights,
      midtones: DEFAULT_MEDIA_VIEW_CONFIG.midtones,
      shadows: DEFAULT_MEDIA_VIEW_CONFIG.shadows,
      alphaThreshold: DEFAULT_MEDIA_VIEW_CONFIG.alphaThreshold,
      colorLevels: DEFAULT_MEDIA_VIEW_CONFIG.colorLevels ?? 0,
      // Effects — the +60 contrast that saved a flat photo flattens a contrasty one.
      brightness: DEFAULT_MEDIA_VIEW_CONFIG.brightness,
      contrast: DEFAULT_MEDIA_VIEW_CONFIG.contrast,
      sharpenStrength: DEFAULT_MEDIA_VIEW_CONFIG.sharpenStrength,
      sharpenRadius: DEFAULT_MEDIA_VIEW_CONFIG.sharpenRadius,
      noise: DEFAULT_MEDIA_VIEW_CONFIG.noise,
      denoise: DEFAULT_MEDIA_VIEW_CONFIG.denoise,
      blur: DEFAULT_MEDIA_VIEW_CONFIG.blur,
      invert: DEFAULT_MEDIA_VIEW_CONFIG.invert,
    };

    setMediaViewConfig(graded);
    setRenderSettingsByMode((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        toneConfig: {
          ...(prev.media.toneConfig ?? DEFAULT_TONE_MAPPING_CONFIG),
          levelsBlack: DEFAULT_TONE_MAPPING_CONFIG.levelsBlack,
          levelsMidtones: DEFAULT_TONE_MAPPING_CONFIG.levelsMidtones,
          levelsWhite: DEFAULT_TONE_MAPPING_CONFIG.levelsWhite,
        },
      },
    }));

    return graded;
  }, [mediaViewConfig]);

  const handleMediaFileUpload = useCallback((file: File) => {
    const isVid = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.webm') || file.name.endsWith('.mov');
    const objectUrl = URL.createObjectURL(file);
    /* A different source, so the previous image's grading no longer applies. */
    const freshView = resetGradingForNewSource();

    if (isVid) {
      const vid = document.createElement('video');
      vid.src = objectUrl;
      vid.crossOrigin = 'anonymous';
      vid.autoplay = true;
      vid.loop = mediaConfig.loop;
      vid.muted = true;
      vid.playsInline = true;

      let hasSetResolution = false;
      const onVideoReady = () => {
        if (!hasSetResolution && (vid.videoWidth || vid.videoHeight)) {
          hasSetResolution = true;
          autoSetMediaResolution(vid.videoWidth || 1920, vid.videoHeight || 1080, undefined, true);
        }
      };

      vid.onloadedmetadata = onVideoReady;
      vid.onloadeddata = onVideoReady;
      vid.oncanplay = onVideoReady;
      vid.play().catch(() => {});
      mediaElementRef.current = vid;

      const newConfig: MediaConfig = {
        ...mediaConfig,
        sourceType: 'file',
        mediaType: 'video',
        fileName: file.name,
        fileData: objectUrl,
      };
      setMediaConfig(newConfig);
      pushMediaHistorySnapshot(newConfig, freshView);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        autoSetMediaResolution(img.naturalWidth || img.width, img.naturalHeight || img.height, undefined, true);
        triggerMediaRender();
      };
      img.src = objectUrl;

      const newConfig: MediaConfig = {
        ...mediaConfig,
        sourceType: 'file',
        mediaType: 'image',
        fileName: file.name,
        fileData: objectUrl,
      };
      setMediaConfig(newConfig);
      pushMediaHistorySnapshot(newConfig, freshView);
    }
  }, [mediaConfig, resetGradingForNewSource, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  /**
   * @param preserveGrading Skip the new-source grading reset.
   *
   * Set only by the shared-link loader below. A share link carries levels and
   * the rest of the grading on purpose, and it arrives as a remote URL, so
   * rehydrating one would otherwise erase exactly what was shared.
   */
  const handleMediaUrlLoad = useCallback((url: string, preserveGrading = false) => {
    const isVid = url.match(/\.(mp4|webm|mov|ogg)($|\?)/i);
    /* Same reasoning as the file path: a remote URL is a new source too. */
    const freshView = preserveGrading ? mediaViewConfig : resetGradingForNewSource();
    if (isVid) {
      const vid = document.createElement('video');
      vid.src = url;
      vid.crossOrigin = 'anonymous';
      vid.autoplay = true;
      vid.loop = mediaConfig.loop;
      vid.muted = true;
      vid.playsInline = true;

      let hasSetResolution = false;
      const onVideoReady = () => {
        if (!hasSetResolution && (vid.videoWidth || vid.videoHeight)) {
          hasSetResolution = true;
          autoSetMediaResolution(vid.videoWidth || 1920, vid.videoHeight || 1080, undefined, true);
        }
      };

      vid.onloadedmetadata = onVideoReady;
      vid.onloadeddata = onVideoReady;
      vid.oncanplay = onVideoReady;
      vid.play().catch(() => {});
      mediaElementRef.current = vid;

      let cleanName = 'Remote Video';
      try {
        const u = new URL(url);
        const lastPart = u.pathname.split('/').filter(Boolean).pop()?.split('?')[0] || '';
        cleanName = lastPart || u.hostname;
      } catch {
        cleanName = url.split('/').pop()?.split('?')[0] || 'Remote Video';
      }

      const newConfig: MediaConfig = {
        ...mediaConfig,
        sourceType: 'url',
        mediaType: 'video',
        fileName: cleanName,
        fileData: url,
        remoteUrl: url,
      };
      setMediaConfig(newConfig);
      pushMediaHistorySnapshot(newConfig, freshView);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        autoSetMediaResolution(img.naturalWidth || img.width, img.naturalHeight || img.height, undefined, true);
        triggerMediaRender();
      };
      img.src = url;

      let cleanName = 'Remote Image';
      try {
        const u = new URL(url);
        const lastPart = u.pathname.split('/').filter(Boolean).pop()?.split('?')[0] || '';
        cleanName = lastPart || u.hostname;
      } catch {
        cleanName = url.split('/').pop()?.split('?')[0] || 'Remote Image';
      }

      const newConfig: MediaConfig = {
        ...mediaConfig,
        sourceType: 'url',
        mediaType: 'image',
        fileName: cleanName,
        fileData: url,
        remoteUrl: url,
      };
      setMediaConfig(newConfig);
      pushMediaHistorySnapshot(newConfig, freshView);
    }
  }, [mediaConfig, mediaViewConfig, resetGradingForNewSource, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  // Initial loader for shared remote media URLs
  useEffect(() => {
    if (appMode === 'media' && mediaConfig.sourceType === 'url') {
      const url = mediaConfig.remoteUrl || mediaConfig.fileData;
      if (url && url.startsWith('http')) {
        /* Shared state, not a new source -- keep the grading the link carries. */
        handleMediaUrlLoad(url, true);
      }
    }
  }, []);

  // Global Clipboard Paste Listener (Image/Video Paste)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          e.preventDefault();
          setAppMode('media');
          handleMediaFileUpload(file);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleMediaFileUpload]);

  // Fun Randomizer Handler
  const handleRandomize = useCallback(() => {
    setIsRandomizing(true);
    setTimeout(() => setIsRandomizing(false), 400);

    if (appMode === 'model') {
      const themes: PhosphorTheme[] = ['green', 'amber', 'cyan', 'monochrome', 'matrix', 'blood'];
      const randTheme = themes[Math.floor(Math.random() * themes.length)];
      const randCharset = CHARSETS[Math.floor(Math.random() * CHARSETS.length)].chars;
      setTheme(randTheme);
      setDensity(randCharset);
      return;
    }

    if (appMode === 'media') {
      const themes: PhosphorTheme[] = ['green', 'amber', 'cyan', 'monochrome', 'matrix', 'blood'];
      const randTheme = themes[Math.floor(Math.random() * themes.length)];
      const randCharset = CHARSETS[Math.floor(Math.random() * CHARSETS.length)].chars;
      setTheme(randTheme);
      setDensity(randCharset);
      return;
    }

    const randomized = generateRandomAnimation();
    setWaveParams(randomized.params);
    setTheme(randomized.theme);
    setDensity(randomized.density);

    const formula = generateFormulaCode(randomized.params);
    setCustomCode(formula);
    setCustomPrepare('');
    setPresetType('parametric');
    recompileCustomCode(formula, '');

    const randomPreset: Preset = {
      id: `random-${Date.now()}`,
      name: randomized.name,
      description: `Procedurally generated ${randomized.archetype}`,
      type: 'parametric',
      params: { ...randomized.params },
      densityCharset: randomized.density,
      theme: randomized.theme,
    };
    setActivePreset(randomPreset);
    pushHistorySnapshot(randomized.params, formula, randomized.name, '', 'parametric');
  }, [appMode, recompileCustomCode, pushHistorySnapshot]);

  const handleWheelZoom = useCallback((deltaZoom: number) => {
    setModelViewConfig((prev) => {
      const updated = {
        ...prev,
        cameraDistance: Math.max(1.2, Math.min(8.0, prev.cameraDistance + deltaZoom)),
      };
      clearTimeout(modelHistoryDebounceTimer.current);
      modelHistoryDebounceTimer.current = setTimeout(() => {
        pushModelHistorySnapshot(modelConfig, updated);
      }, 500);
      return updated;
    });
  }, [modelConfig, pushModelHistorySnapshot]);

  // Interaction tracking for idle throttling
  const lastInteractionTimeRef = useRef<number>(Date.now());

  const handleMouseMove = (x: number, y: number) => {
    lastInteractionTimeRef.current = Date.now();
    if (!particleConfig.enabled) return;
    const pt = createTrailPoint(x, y, 1.0, 0, 0, density);
    trailPointsRef.current.push(pt);
    if (trailPointsRef.current.length > 250) {
      trailPointsRef.current.shift();
    }
  };

  const handleClick = (x: number, y: number) => {
    lastInteractionTimeRef.current = Date.now();
    if (!particleConfig.enabled) return;
    const particles = generateClickParticles(
      x,
      y,
      particleConfig.burstCount,
      particleConfig.burstSpeed,
      density
    );
    particles.forEach((p) => trailPointsRef.current.push(p));
    if (trailPointsRef.current.length > 350) {
      trailPointsRef.current.splice(0, trailPointsRef.current.length - 350);
    }
  };

  /*
   * Cost of the last static-image rasterization, and when it finished.
   *
   * A still image has no animation loop to ride, so it re-renders straight off
   * React state -- which means a slider drag fires one full rasterization per
   * pointer event, synchronously, with nothing coalescing them. On a large
   * source that is far more than a frame's worth of work each time, so the
   * queue never drains and the whole UI stalls until the drag ends.
   *
   * These two let the render pace itself against its own measured cost instead
   * of a fixed rate that would be wrong for both a 200px thumbnail and a 24MP
   * photo. See the scheduler below.
   */
  const lastStaticRenderMsRef = useRef<number>(0);
  const lastStaticRenderEndRef = useRef<number>(0);

  // Animation Frame Loop with FPS Limiter & Power Optimizations
  const timeRef = useRef<number>(0);
  const lastFrameRenderTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(performance.now());

  useEffect(() => {
    let animFrameId: number;

    const isStaticImage = appMode === 'media' && mediaConfig.mediaType === 'image';
    const curSettings = renderSettingsRef.current;

    /*
     * Static 2D image: no RAF loop, re-rendered reactively from state.
     *
     * Scheduled rather than run inline. Every effect re-run cancels the render
     * the previous one queued, so a burst of slider events collapses to a
     * single rasterization of the final value -- intermediate states are
     * dropped rather than queued, which is what the viewer wants anyway.
     *
     * The delay before it runs is the last render's own duration, capped. That
     * keeps the rasterizer to roughly half the wall clock and leaves the rest
     * for input and paint, so dragging stays responsive whether a frame costs
     * 2ms or 200ms. A fixed interval cannot do that: tuned for a big photo it
     * makes small ones feel sluggish, tuned for small ones it still stalls on
     * big ones.
     */
    if (isStaticImage) {
      let cancelled = false;
      let previewRaf = 0;
      let finalRaf = 0;

      const renderStaticFrame = (divisor: number) => {
        if (cancelled) return;
        const startedAt = performance.now();

        const renderCols = divisor > 1 ? Math.max(16, Math.round(cols / divisor)) : cols;
        const renderRows = divisor > 1 ? Math.max(16, Math.round(rows / divisor)) : rows;

        const result = renderAsciiMediaFrameData({
          cols: renderCols,
          rows: renderRows,
          mediaElement: mediaElementRef.current,
          mediaConfig,
          viewConfig: mediaViewConfig,
          density: curSettings.density,
          colorConfig: renderColorConfig,
          rasterMode: mediaViewConfig.rasterMode || curSettings.rasterMode || 'ascii',
          algorithm: mediaViewConfig.algorithm || curSettings.ditherAlgorithm || 'floyd-steinberg',
          ditherParams: mediaViewConfig.ditherParams || curSettings.ditherParams,
          /*
           * Beam parameters are in grid cells, and a draft preview moves
           * the grid underneath them -- see previewVectorConfig. Retuned
           * going in and the geometry scaled back out below, so the preview
           * is the same picture sampled more coarsely rather than a
           * different one.
           */
          vectorConfig: previewVectorConfig(
            mediaViewConfig.vectorConfig || curSettings.vectorConfig || VECTOR_CONFIG_DEFAULTS,
            divisor
          ),
          toneConfig: curSettings.toneConfig,
        });

        /*
         * The viewport lays out from its cols/rows props, so a preview has to
         * come back out at full size -- see framePreview.ts. Only a
         * full-resolution pass feeds the histogram; a preview's would be
         * sampled from a quarter of the cells and make the Levels graph twitch
         * for no benefit.
         */
        /*
         * The overlay is built at the *full* grid even during a draft preview.
         * It is one `drawImage`, so it does not benefit from the coarse pass,
         * and rebuilding it at the reduced grid would make the source visibly
         * change resolution under the raster on every drag.
         */
        const sourceLayer = buildViewportSourceLayer(result.luminance);

        if (divisor > 1) {
          const scaled = upscaleFrame(result.text, result.colors, renderCols, renderRows, cols, rows);
          /*
           * Geometry is multiplied back into full grid space rather than
           * expanded cell by cell -- exact, and it keeps the preview the same
           * physical size as the pass that replaces it.
           */
          const scaledVector = result.vector ? scaleVectorFrame(result.vector, cols, rows) : null;
          viewportRef.current?.setFrame(scaled.text, 0, 0, scaled.colors, result.bgColor, result.rasterMode, scaledVector, sourceLayer);
        } else {
          captureHistogram(result);
          viewportRef.current?.setFrame(result.text, 0, 0, result.colors, result.bgColor, result.rasterMode, result.vector, sourceLayer);
          lastStaticRenderMsRef.current = performance.now() - startedAt;
        }

        lastStaticRenderEndRef.current = performance.now();
      };

      /*
       * Two passes, and the cheap one is what makes dragging feel live.
       *
       * Rasterizing is superlinear in cell count, so on a large grid a single
       * full pass costs many frames and no amount of throttling makes a drag
       * feel responsive -- it only makes it stale instead of stuck. So while
       * changes keep arriving, render a fraction of the grid and expand it:
       * chunky, but live and roughly divisor^2 cheaper. When the changes stop,
       * one full-resolution pass replaces it.
       *
       * `isEditing` keys off whether the previous render finished recently
       * enough that another change is plausibly part of the same gesture.
       * Nothing needs to know about pointers or which control moved.
       */
      const sinceLast = performance.now() - lastStaticRenderEndRef.current;
      const isEditing = sinceLast < EDIT_BURST_MS;
      const divisor =
        isEditing && lowResPreview ? choosePreviewDivisor(lastStaticRenderMsRef.current) : 1;

      if (divisor > 1) {
        previewRaf = requestAnimationFrame(() => renderStaticFrame(divisor));
        /* And the sharp one, once the gesture has actually stopped. */
        const settleId = window.setTimeout(() => {
          finalRaf = requestAnimationFrame(() => renderStaticFrame(1));
        }, EDIT_SETTLE_MS);
        return () => {
          cancelled = true;
          window.clearTimeout(settleId);
          if (previewRaf) cancelAnimationFrame(previewRaf);
          if (finalRaf) cancelAnimationFrame(finalRaf);
        };
      }

      previewRaf = requestAnimationFrame(() => renderStaticFrame(1));
      return () => {
        cancelled = true;
        if (previewRaf) cancelAnimationFrame(previewRaf);
      };
    }

    const loop = (timestamp: number) => {
      // Check if tab is hidden and optimization is enabled
      if (optimizeConfig.pauseWhenHidden && document.hidden) {
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      // Check Idle status
      const isIdle = optimizeConfig.idleThrottle && (Date.now() - lastInteractionTimeRef.current > 4000);
      const effectiveTargetFps = isIdle ? 12 : optimizeConfig.targetFps;

      // FPS Limiter check with precise pacing
      if (effectiveTargetFps > 0) {
        const interval = 1000 / effectiveTargetFps;
        const elapsed = timestamp - lastFrameRenderTimeRef.current;
        if (elapsed < interval) {
          animFrameId = requestAnimationFrame(loop);
          return;
        }
        lastFrameRenderTimeRef.current = timestamp - (elapsed % interval);
      } else {
        lastFrameRenderTimeRef.current = timestamp;
      }

      // Compute FPS dynamically
      frameCountRef.current++;
      const now = performance.now();
      if (now - fpsTimerRef.current >= 500) {
        currentFpsRef.current = Math.round((frameCountRef.current * 1000) / (now - fpsTimerRef.current));
        frameCountRef.current = 0;
        fpsTimerRef.current = now;
      }

      // Advance clock time
      if (isPlaying) {
        const dt = lastTimeRef.current ? Math.min(0.1, (now - lastTimeRef.current) / 1000) : 0.016;
        timeRef.current += dt * (waveParams.timeSpeed || 1.0);

        // Particle physics update
        if (particleConfig.enabled) {
          const pts = trailPointsRef.current;
          const t = timeRef.current;
          const sampleField = (px: number, py: number, sampleT: number): number => {
            const cx = cols / 2;
            const cy = rows / 2;
            const dx = (px - cx) * (waveParams.aspectRatio || 0.55);
            const dy = py - cy;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            if (presetType === 'custom' && compiledFnRef.current) {
              try {
                return compiledFnRef.current(
                  px,
                  py,
                  sampleT,
                  dist,
                  dx,
                  dy,
                  cols,
                  rows,
                  angle,
                  customContextRef.current
                );
              } catch {
                return 0;
              }
            }
            return evaluateParametricWave(
              px,
              py,
              sampleT,
              dist,
              dx,
              dy,
              cols,
              rows,
              angle,
              waveParams
            );
          };

          for (let i = 0; i < pts.length; i++) {
            updateParticleWithField(
              pts[i],
              cols,
              rows,
              t,
              sampleField,
              particleConfig,
              dt
            );
          }
          let aliveCount = 0;
          for (let i = 0; i < pts.length; i++) {
            if (pts[i].age > 0) {
              pts[aliveCount++] = pts[i];
            }
          }
          pts.length = aliveCount;
        }
      }
      lastTimeRef.current = now;

      const activeSettings = renderSettingsRef.current;

      // Render raster / ASCII frame
      let frameText = '';
      let frameColors: Uint8ClampedArray | null = null;
      let frameBgColor: string | undefined = undefined;
      let frameVector: VectorFrame | null = null;
      let frameLuminance: Float32Array | null = null;

      /*
       * Phase is an input to the trace, not stored state -- see
       * vector-pipeline.md 3.3. Advancing it from the loop clock is what makes
       * the carrier and ripple drift, and it costs nothing in the cell modes
       * because nothing reads it there.
       */
      const animatedVectorConfig = (cfg: VectorConfig | undefined): VectorConfig | undefined =>
        cfg ? { ...cfg, phase: cfg.phase + timeRef.current * VECTOR_PHASE_RATE } : cfg;

      if (appMode === 'model') {
        /*
         * A second GPU pass at overlay resolution, and the only reason it is
         * requested here rather than collected afterwards: the capture happens
         * inside the renderer, before the pipeline's own point-sampled read.
         * `undefined` when the overlay is off, which is the whole cost gate.
         */
        const modelCell = exportCellSize(activeSettings.rasterMode || 'ascii', 1);
        const res = renderModelFrameData({
          cols,
          rows,
          time: timeRef.current,
          density: activeSettings.density,
          geometry: currentGeometryRef.current,
          modelConfig,
          viewConfig: modelViewConfig,
          colorConfig: renderColorConfig,
          rasterMode: activeSettings.rasterMode || 'ascii',
          algorithm: activeSettings.ditherAlgorithm || 'none',
          ditherParams: activeSettings.ditherParams,
          vectorConfig: animatedVectorConfig(activeSettings.vectorConfig),
          toneConfig: activeSettings.toneConfig,
          adjustConfig: activeSettings.adjustConfig,
          sourceCapture: overlaySourcePpc(
            activeSettings.postProcess,
            modelCell.cellWidth,
            modelCell.cellHeight
          ),
        });
        captureHistogram(res);
        frameText = res.text;
        frameColors = res.colors;
        frameVector = res.vector || null;
        frameLuminance = res.luminance;
      } else if (appMode === 'media') {
        const result = renderAsciiMediaFrameData({
          cols,
          rows,
          mediaElement: mediaElementRef.current,
          mediaConfig,
          viewConfig: mediaViewConfig,
          density: activeSettings.density,
          colorConfig: renderColorConfig,
          rasterMode: mediaViewConfig.rasterMode || activeSettings.rasterMode || 'ascii',
          algorithm: mediaViewConfig.algorithm || activeSettings.ditherAlgorithm || 'floyd-steinberg',
          ditherParams: mediaViewConfig.ditherParams || activeSettings.ditherParams,
          vectorConfig: animatedVectorConfig(mediaViewConfig.vectorConfig || activeSettings.vectorConfig),
          toneConfig: activeSettings.toneConfig,
        });
        captureHistogram(result);
        frameText = result.text;
        frameColors = result.colors;
        frameBgColor = result.bgColor;
        frameVector = result.vector || null;
        frameLuminance = result.luminance;
      } else {
        const res = renderSynthFrameData({
          cols,
          rows,
          time: timeRef.current,
          density: activeSettings.density,
          trailPoints: trailPointsRef.current,
          waveParams,
          customRenderFn: presetType === 'custom' ? compiledFnRef.current : undefined,
          prepareFn: presetType === 'custom' ? prepareFnRef.current : undefined,
          customContext: customContextRef.current,
          interactiveInfluence: true,
          luminanceBoost: particleConfig.luminanceBoost,
          colorConfig: renderColorConfig,
          rasterMode: activeSettings.rasterMode || 'ascii',
          algorithm: activeSettings.ditherAlgorithm || 'none',
          ditherParams: activeSettings.ditherParams,
          vectorConfig: animatedVectorConfig(activeSettings.vectorConfig),
          toneConfig: activeSettings.toneConfig,
          adjustConfig: activeSettings.adjustConfig,
        });
        captureHistogram(res);
        frameText = res.text;
        frameColors = res.colors;
        frameBgColor = res.bgColor;
        frameVector = res.vector || null;
        frameLuminance = res.luminance;
      }


      viewportRef.current?.setFrame(
        frameText,
        timeRef.current,
        currentFpsRef.current,
        frameColors,
        frameBgColor,
        appMode === 'media' ? (mediaViewConfig.rasterMode || activeSettings.rasterMode) : activeSettings.rasterMode,
        frameVector,
        buildViewportSourceLayer(frameLuminance)
      );
      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameId);
  }, [
    isPlaying,
    cols,
    rows,
    density,
    appMode,
    modelConfig,
    modelViewConfig,
    mediaConfig,
    mediaViewConfig,
    renderColorConfig,
    mediaRenderTrigger,
    waveParams,
    presetType,
    particleConfig,
    optimizeConfig,
    lowResPreview,
    // The RAF loop reads renderSettingsRef, but the static-image branch renders
    // once and must re-run when settings change. Only the active mode's slice
    // matters, so renderSettingsByMode itself is not a dependency.
    currentRenderSettings,
  ]);


  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      lastInteractionTimeRef.current = Date.now();
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (!isInput) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (!isInput) {
          e.preventDefault();
          handleRedo();
        }
      } else if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        if (!(appMode === 'media' && mediaConfig.mediaType === 'image')) {
          setIsPlaying((p) => !p);
        }
      } else if (e.key === '?' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Shift is part of typing '?' on most layouts, so it is not excluded.
        e.preventDefault();
        setIsShortcutsOpen((o) => !o);
      } else if (e.key.toLowerCase() === 'r' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (appMode === 'synth') {
          e.preventDefault();
          handleRandomize();
        }
      } else if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          handleSelectRasterMode('ascii');
        } else if (e.key === '2') {
          e.preventDefault();
          handleSelectRasterMode('pixel');
        } else if (e.key === '3') {
          e.preventDefault();
          handleSelectRasterMode('vector');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleRandomize,
    appMode,
    mediaConfig.mediaType,
    handleSelectRasterMode,
  ]);

  // Toggle between editor and fullscreen viewfinder
  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === 'editor' ? 'fullscreen' : 'editor';
      updateUrlMode(next);
      return next;
    });
  }, []);

  const isModelEdited = useMemo(() => {
    if (modelConfig.sourceType !== 'preset' || modelConfig.modelId !== 'torus-knot') return true;
    if (modelConfig.scale !== 1.05) return true;
    if (modelViewConfig.shadingMode !== 'shaded') return true;
    return false;
  }, [modelConfig, modelViewConfig]);

  const isMediaEdited = useMemo(() => {
    if (mediaConfig.scale !== 1.0) return true;
    if (mediaConfig.offsetX !== 0 || mediaConfig.offsetY !== 0) return true;
    if (mediaConfig.rotation !== 0) return true;
    if (mediaConfig.flipX || mediaConfig.flipY) return true;
    if (mediaViewConfig.algorithm !== 'floyd-steinberg') return true;
    return false;
  }, [mediaConfig, mediaViewConfig]);

  // Complete snapshot of the current animation state for sharing / deep-linking
  const currentFullState: FullAnimationState = useMemo(
    () => ({
      appMode,
      name: appMode === 'model'
        ? (isModelEdited ? `${modelConfig.fileName || 'Torus Knot'} (Edited)` : (modelConfig.fileName || 'Torus Knot'))
        : appMode === 'media'
        ? (isMediaEdited ? `${mediaConfig.fileName || '2D Media'} (Edited)` : (mediaConfig.fileName || '2D Media'))
        : (isEdited ? `${activePreset.name} (Edited)` : activePreset.name),
      type: appMode === 'synth' ? presetType : undefined,
      params: appMode === 'synth' ? waveParams : undefined,
      customCode: appMode === 'synth' && presetType === 'custom' ? customCode : undefined,
      customPrepare: appMode === 'synth' && presetType === 'custom' ? customPrepare : undefined,
      density,
      theme,
      customThemeColor: customThemeColor || undefined,
      gradientConfig,
      cols,
      rows,
      autoRes,
      particleConfig: appMode === 'synth' ? particleConfig : undefined,
      optimizeConfig,
      crtConfig,
      modelConfig: appMode === 'model' ? modelConfig : undefined,
      modelViewConfig: appMode === 'model' ? modelViewConfig : undefined,
      mediaConfig: appMode === 'media' ? mediaConfig : undefined,
      mediaViewConfig: appMode === 'media' ? mediaViewConfig : undefined,

      /*
       * The render settings, which decodeShareFromUrl has always read back but
       * this snapshot never sent. A link therefore arrived with the recipient's
       * defaults for all of them -- no dither algorithm, no grading, no palette.
       *
       * Media was the accidental exception: its raster mode, algorithm and whole
       * adjust config ride along inside mediaViewConfig, which was already here.
       * The other two modes lost everything. Sourced exactly as the ExportModal
       * call site does, media fallback included, so a link and an export of the
       * same state agree.
       */
      rasterMode: appMode === 'media'
        ? (mediaViewConfig.rasterMode || currentRenderSettings.rasterMode)
        : currentRenderSettings.rasterMode,
      ditherAlgorithm: appMode === 'media'
        ? (mediaViewConfig.algorithm || currentRenderSettings.ditherAlgorithm)
        : currentRenderSettings.ditherAlgorithm,
      ditherParams: appMode === 'media'
        ? (mediaViewConfig.ditherParams || currentRenderSettings.ditherParams)
        : currentRenderSettings.ditherParams,
      vectorConfig: appMode === 'media'
        ? (mediaViewConfig.vectorConfig || currentRenderSettings.vectorConfig)
        : currentRenderSettings.vectorConfig,
      toneConfig: currentRenderSettings.toneConfig,
      adjustConfig: currentRenderSettings.adjustConfig,
      /*
       * One home for the composite stage in every mode, media included — it is
       * not grading, so the mediaViewConfig fallback above does not apply.
       */
      postProcess: currentRenderSettings.postProcess,

      /*
       * Not gated on media mode: synth and model both hand this to the engine as
       * `colorConfig`, so it carries the palette and saturation for every mode.
       * Gating it dropped the palette from every non-media link.
       */
      mediaColorConfig,
    }),
    [
      appMode,
      currentRenderSettings,
      modelConfig,
      isModelEdited,
      mediaConfig,
      isMediaEdited,
      activePreset.name,
      isEdited,
      presetType,
      waveParams,
      customCode,
      customPrepare,
      density,
      theme,
      customThemeColor,
      gradientConfig,
      cols,
      rows,
      autoRes,
      particleConfig,
      optimizeConfig,
      crtConfig,
      modelViewConfig,
      mediaViewConfig,
      mediaColorConfig,
    ]
  );

  /** Natural pixel size of the loaded media, or null when there is none. */
  const getMediaSourceSize = useCallback((): { w: number; h: number } | null => {
    const el = mediaElementRef.current;
    let w = 0;
    let h = 0;
    if (el instanceof HTMLImageElement) {
      w = el.naturalWidth || el.width;
      h = el.naturalHeight || el.height;
    } else if (el instanceof HTMLVideoElement) {
      w = el.videoWidth || el.width;
      h = el.videoHeight || el.height;
    } else if (el instanceof HTMLCanvasElement) {
      w = el.width;
      h = el.height;
    }
    return w > 0 && h > 0 ? { w, h } : null;
  }, []);

  /**
   * Keep the DPI readout honest when something else sets the grid.
   *
   * In media pixel mode DPI is not an independent setting -- it is the grid
   * expressed against the source, `cols = srcWidth * dpi / 100`. Auto-res
   * writes cols/rows straight from the viewfinder size, so without this the
   * panel keeps reporting whatever DPI was last dialled in by hand, describing
   * a resolution nothing is using.
   */
  const syncMediaDpiToGrid = useCallback((nextCols: number) => {
    if (appModeRef.current !== 'media' || nextCols <= 0) return;
    const size = getMediaSourceSize();
    if (!size) return;
    setMediaViewConfig((prev) => {
      const isPixel = (prev.rasterMode || renderSettingsRef.current.rasterMode) === 'pixel';
      if (!isPixel) return prev;
      // Same 10-300 range the DPI slider clamps to.
      const nextDpi = Math.max(10, Math.min(300, Math.round((nextCols / size.w) * 100)));
      return prev.dpi === nextDpi ? prev : { ...prev, dpi: nextDpi };
    });
  }, [getMediaSourceSize]);

  const handleToggleAutoRes = useCallback(() => {
    const mode = appModeRef.current;
    const turningOn = !renderSettingsRef.current.autoRes;
    // Resolved before the updater rather than inside it: the updater can be
    // replayed, and this both reads the DOM and drives a second setState.
    const optimal = turningOn ? viewportRef.current?.getOptimalResolution() : null;

    setRenderSettingsByMode((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        autoRes: turningOn,
        ...(optimal ? { cols: optimal.cols, rows: optimal.rows } : {}),
      },
    }));

    if (optimal) syncMediaDpiToGrid(optimal.cols);
  }, [syncMediaDpiToGrid]);

  const handleManualResolutionChange = useCallback((c: number, r: number) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          cols: c,
          rows: r,
          autoRes: false,
        },
      };
    });
  }, []);

  /**
   * Switches content source.
   *
   * Media carries an extra step: if its grid is still at the synth default it
   * has never been sized to a real image, so derive a resolution from whatever
   * is loaded rather than rasterizing at 100 columns.
   */
  const handleSelectSource = useCallback(
    (id: AppMode) => {
      setAppMode(id);

      if (id === 'media' && mediaElementRef.current) {
        const el = mediaElementRef.current;
        let w = 256;
        let h = 256;
        if (el instanceof HTMLImageElement) {
          w = el.naturalWidth || el.width || 256;
          h = el.naturalHeight || el.height || 256;
        } else if (el instanceof HTMLVideoElement) {
          w = el.videoWidth || el.width || 256;
          h = el.videoHeight || el.height || 256;
        }
        if (!renderSettingsByMode.media.cols || renderSettingsByMode.media.cols === 100) {
          autoSetMediaResolution(w, h, undefined, true);
        }
      }

      setTimeout(() => {
        viewportRef.current?.autoFit();
      }, 50);
    },
    [renderSettingsByMode.media.cols, autoSetMediaResolution]
  );

  /*
   * Flip the sidebar layout.
   *
   * BASIC only speaks media, so entering it from SYNTH or MODEL switches the
   * source. Nothing is lost doing so: render settings are held per mode
   * (renderSettingsByMode), and the synth params and model config are their
   * own state, so returning to ADVANCED and picking the source back up finds
   * it exactly as it was.
   */
  const handleChangeUiMode = useCallback(
    (nextMode: UiMode) => {
      setUiThemeSettings((prev) => ({ ...prev, uiMode: nextMode }));
      if (nextMode === 'basic' && appModeRef.current !== 'media') {
        handleSelectSource('media');
      }
    },
    [handleSelectSource]
  );

  const handleAutoResolutionChange = useCallback((c: number, r: number) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      if (prev[mode].cols === c && prev[mode].rows === r) return prev;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          cols: c,
          rows: r,
        },
      };
    });
    // Auto-res keeps re-sizing the grid as the viewfinder changes, so the DPI
    // has to follow it there too, not only on the initial toggle.
    syncMediaDpiToGrid(c);
  }, [syncMediaDpiToGrid]);

  return (
    <div className={`app-container ${viewMode === 'fullscreen' ? 'app-fullscreen' : ''}`}>
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-title">
          <span className="brand-logo">▓▒░</span>
          <div className="brand-text-block">
            <div className="brand-main">
              <span className="brand-full">DITHER STUDIO</span>
            </div>
          </div>
          <span className="brand-version">v2.2</span>
        </div>

        {/*
         * Absolutely centred rather than a third flex child: the flanking
         * groups change width as UNDO/REDO appear and as labels collapse on
         * narrow viewports, which would otherwise drag the switch off centre.
         * Hidden in fullscreen, where there is no sidebar for it to govern.
         */}
        {viewMode === 'editor' && (
          <div className="header-mode-switch">
            <UiModeSwitch value={uiMode} onChange={handleChangeUiMode} />
          </div>
        )}

        {/* Header Tools: Undo, Redo, Export, Share */}
        <div className="header-actions">
          {viewMode === 'editor' && (
            <>
              <button
                className="btn btn-sm header-btn-undo"
                onClick={handleUndo}
                disabled={!canUndo}
                title={typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
              >
                <Undo2 size={13} className="header-btn-icon" />
                <span className="btn-label">UNDO</span>
              </button>
              <button
                className="btn btn-sm header-btn-redo"
                onClick={handleRedo}
                disabled={!canRedo}
                title={typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Shift+Z / Ctrl+Y)'}
              >
                <Redo2 size={13} className="header-btn-icon" />
                <span className="btn-label">REDO</span>
              </button>
            </>
          )}

          {/* SHARE then EXPORT: the export is the primary action, so it sits last. */}
          <button
            className="btn btn-sm btn-header-share"
            onClick={() => {
              /*
               * Framing is read here, not held in currentFullState. The camera
               * lives inside the viewport and changes on every wheel notch and
               * drag; threading it up as reactive state would re-encode the
               * share payload throughout a pan. Sampled at the moment the user
               * asks to share, which is also exactly the view they mean.
               */
              setShareView(viewportRef.current?.getViewFraming() ?? null);
              setIsShareOpen(true);
            }}
            title="Share Fullscreen Viewfinder link"
          >
            <Share2 size={13} className="header-btn-icon" />
            <span className="btn-label">SHARE</span>
          </button>

          <button
            className="btn btn-sm btn-header-export"
            onClick={() => {
              setExportInitialTab('image');
              setIsExportOpen(true);
            }}
            title="Download the render as an image, colour plates, GIF or video"
          >
            <Download size={13} className="header-btn-icon" />
            <span className="btn-label">EXPORT</span>
          </button>

          <button
            className={`btn btn-sm ${isShortcutsOpen ? 'btn-primary' : ''}`}
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard & pointer shortcuts (?)"
            aria-label="Keyboard and pointer shortcuts"
          >
            <Keyboard size={13} className="header-btn-icon" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className={`main-workspace ${viewMode === 'fullscreen' ? 'workspace-fullscreen' : ''}`}>
        {/* Left / Center Viewport */}
        <AsciiViewport
          ref={viewportRef}
          cols={cols}
          rows={rows}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onResetTime={() => {
            timeRef.current = 0;
          }}
          onStepFrame={() => {
            timeRef.current += 0.03;
          }}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          presetName={
            appMode === 'model'
              ? modelConfig.sourceType === 'url'
                ? modelConfig.fileName || 'Online 3D Model'
                : modelConfig.sourceType === 'file'
                ? modelConfig.fileName || 'Custom 3D File'
                : 'Torus Knot'
              : appMode === 'media'
              ? mediaConfig.fileName || '2D Media'
              : activePreset.name
          }
          isEdited={appMode === 'model' ? isModelEdited : appMode === 'media' ? isMediaEdited : isEdited}
          viewMode={viewMode}
          onToggleViewMode={handleToggleViewMode}
          autoRes={autoRes}
          onToggleAutoRes={handleToggleAutoRes}
          onAutoResolutionChange={handleAutoResolutionChange}
          onViewfinderAspectChange={setViewfinderAspect}
          crtConfig={crtConfig}
          onChangeCrtConfig={setCrtConfig}
          optimizeConfig={optimizeConfig}
          onChangeOptimizeConfig={setOptimizeConfig}
          gradientConfig={gradientConfig}
          theme={theme}
          customThemeColor={customThemeColor}
          uiThemeSettings={uiThemeSettings}
          onChangeUiThemeSettings={setUiThemeSettings}
          isSyncEligible={isSingleColorAscii}
          appMode={appMode}
          mediaType={appMode === 'media' ? mediaConfig.mediaType : undefined}
          showMediaPlaceholder={appMode === 'media' && !mediaConfig.fileData}
          initialView={sharedState?.view ?? null}
          postProcess={currentRenderSettings.postProcess}

          isLoading={appMode === 'model' && isModelLoading}
          loadingFileName={modelLoadingFileName}
          loadingStatusText={modelLoadingStatusText}
          onOrbitRotate={handleOrbitRotate}
          onWheelZoom={handleWheelZoom}
        />

        {/* Right Sidebar Control Panel */}
        {viewMode === 'editor' && (
          <div className={`sidebar-pane ${uiMode === 'basic' ? 'sidebar-pane-basic' : ''}`}>
            {uiMode === 'basic' ? (
              /* No AccordionProvider: BASIC has no disclosures to coordinate. */
              <BasicPanel
                  mediaConfig={mediaConfig}
                  onChangeMediaConfig={handleChangeMediaConfig}
                  mediaElement={mediaElementRef.current}
                  onFileUpload={handleMediaFileUpload}
                  onUrlLoad={handleMediaUrlLoad}
                  viewConfig={mediaViewConfig}
                  onChangeViewConfig={handleChangeMediaViewConfig}
                  rasterMode={currentRasterMode}
                  onChangeRasterMode={handleSelectRasterMode}
                  cols={cols}
                  rows={rows}
                  onChangeResolution={handleManualResolutionChange}
                  density={density}
                  onChangeDensity={setDensity}
                  theme={theme}
                  onChangeTheme={handleSelectTheme}
                  customThemeColor={customThemeColor}
                  onChangeCustomColor={handleSelectCustomColor}
                  mediaColorConfig={mediaColorConfig ?? DEFAULT_MEDIA_COLOR_CONFIG}
                  onChangeMediaColorConfig={handleSelectMediaColorConfig}
                  toneConfig={currentRenderSettings.toneConfig ?? DEFAULT_TONE_MAPPING_CONFIG}
                  onChangeToneConfig={handleChangeToneConfig}
                  postProcess={currentRenderSettings.postProcess ?? POST_PROCESS_DEFAULTS}
                  onChangePostProcess={handleChangePostProcess}
                  onExport={(tab) => {
                    setExportInitialTab(tab);
                    setIsExportOpen(true);
                  }}
                />
            ) : (
            <AccordionProvider autoCollapse={!!uiThemeSettings.autoCollapsePanels}>
              {/* ---------------------------------------------------------- */}
              {/* 01 · SOURCE: define & configure the visual subject         */}
              {/* ---------------------------------------------------------- */}
              <WorkflowStep n="01" label="Source" />

              <div className="source-selector-wrapper">
                <div className="source-grid">
                  {SOURCES.map((source) => {
                    const Icon = source.icon;
                    const isActive = appMode === source.id;
                    return (
                      <button
                        key={source.id}
                        className={`source-card ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectSource(source.id)}
                        title={source.title}
                      >
                        <div className="source-card-header">
                          <div className="source-card-icon-wrap">
                            <Icon size={14} />
                          </div>
                          <span className="source-card-badge">{source.badge}</span>
                        </div>
                        <div className="source-card-body">
                          <span className="source-card-name">{source.name}</span>
                          <span className="source-card-desc">{source.description}</span>
                        </div>
                        <div className="source-card-footer">
                          <span className="source-card-dot" />
                          <span className="source-card-status">{isActive ? 'ACTIVE' : 'READY'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {appMode === 'media' && (
                <MediaUploadControls
                  config={mediaConfig}
                  onChangeConfig={handleChangeMediaConfig}
                  mediaElement={mediaElementRef.current}
                  onFileUpload={handleMediaFileUpload}
                  onUrlLoad={handleMediaUrlLoad}
                />
              )}

              {appMode === 'synth' && (
                <>
                  <PresetSelector
                    activePresetId={activePreset.id}
                    onSelectPreset={handleSelectPreset}
                    onRandomize={handleRandomize}
                    isRandomizing={isRandomizing}
                  />
                  <SynthControls
                    params={waveParams}
                    onChangeParams={handleParamChange}
                    onResetDynamics={() =>
                      handleParamChange({
                        ...waveParams,
                        timeSpeed: DEFAULT_WAVE_PARAMS.timeSpeed,
                        aspectRatio: DEFAULT_WAVE_PARAMS.aspectRatio,
                        contrast: DEFAULT_WAVE_PARAMS.contrast,
                        bias: DEFAULT_WAVE_PARAMS.bias,
                        invert: DEFAULT_WAVE_PARAMS.invert,
                      })
                    }
                    code={customCode}
                    prepareCode={customPrepare}
                    compileError={compileError}
                    onChangeFormula={handleFormulaCodeChange}
                    isFormulaDivergent={presetType === 'custom'}
                    onOverrideFormulaWithSliders={handleOverrideFormulaWithSliders}
                  />
                  <ParticleControls
                    config={particleConfig}
                    onChange={setParticleConfig}
                    onClearParticles={() => {
                      trailPointsRef.current = [];
                    }}
                  />
                </>
              )}

              {appMode === 'model' && (
                <>
                  <ModelImportControls
                    config={modelConfig}
                    onLoadCustomGeometry={handleLoadCustomGeometry}
                    onSelectBuiltinGeometry={handleSelectBuiltinGeometry}
                    onLoadRemoteModel={handleLoadRemoteModel}
                    onStartLoading={(fileName, statusText) => {
                      setIsModelLoading(true);
                      if (fileName) setModelLoadingFileName(fileName);
                      if (statusText) setModelLoadingStatusText(statusText);
                    }}
                    onEndLoading={() => setIsModelLoading(false)}
                  />

                  <ModelMeshControls
                    config={modelConfig}
                    onChangeConfig={handleChangeModelConfig}
                  />
                </>
              )}

              {/* ---------------------------------------------------------- */}
              {/* 02 · OUTPUT: raster mode, resolution & grid density        */}
              {/* ---------------------------------------------------------- */}
              <WorkflowStep n="02" label="Output" />

              <div className="source-selector-wrapper">
                <OutputModeCards
                  value={currentRasterMode}
                  onChange={handleSelectRasterMode}
                />
              </div>

              <OptimizeControls
                cols={cols}
                rows={rows}
                onChangeResolution={handleManualResolutionChange}
                autoRes={autoRes}
                onToggleAutoRes={handleToggleAutoRes}
                appMode={appMode}
                mediaElement={mediaElementRef.current}
                mediaConfig={mediaConfig}
                isPixelMode={currentRasterMode !== 'ascii'}
                viewfinderAspect={viewfinderAspect}
                dpi={mediaViewConfig.dpi ?? 72}
                onChangeDpi={(newDpi) => handleChangeMediaViewConfig({ ...mediaViewConfig, dpi: newDpi })}
              />

              {densityRampSection}

              {/* ---------------------------------------------------------- */}
              {/* 03 · AESTHETIC                                             */}
              {/* ---------------------------------------------------------- */}
              <WorkflowStep n="03" label="Aesthetic" />

              {appMode === 'media' && (
                <MediaViewControls
                  config={mediaViewConfig}
                  onChangeConfig={handleChangeMediaViewConfig}
                  rasterMode={currentRasterMode}
                  currentTheme={theme}
                  onChangeTheme={handleSelectTheme}
                  customThemeColor={customThemeColor}
                  onChangeCustomColor={handleSelectCustomColor}
                  mediaColorConfig={mediaColorConfig}
                  onChangeMediaColorConfig={handleSelectMediaColorConfig}
                  appMode={appMode}
                />
              )}

              {appMode === 'model' && (
                <>
                  <ModelViewControls
                    config={modelViewConfig}
                    onChangeConfig={handleChangeModelViewConfig}
                    onResetRotation={handleResetModelRotation}
                  />
                  <div className="tab-content">
                    <CollapsibleSection
                      title="RENDER SETTINGS"
                      icon={<Settings size={12} />}
                      badge={
                        currentRasterMode === 'vector'
                          ? 'Beam Deflection'
                          : DITHER_ALGORITHMS.find(
                              (a) => a.id === (currentRenderSettings.ditherAlgorithm || 'floyd-steinberg')
                            )?.name || 'Floyd-Steinberg'
                      }
                      persistKey={`${appMode}-render-settings`}
                      onReset={() => {
                        setRenderSettingsByMode((prev) => ({
                          ...prev,
                          [appMode]: {
                            ...prev[appMode],
                            ditherAlgorithm: 'floyd-steinberg',
                            ditherParams: undefined,
                            vectorConfig: undefined,
                          },
                        }));
                      }}
                      resetTitle={
                        currentRasterMode === 'vector'
                          ? 'Reset every beam parameter'
                          : 'Reset dither algorithm and parameters'
                      }
                    >
                      {currentRasterMode === 'vector' ? (
                        <VectorControls
                          config={currentRenderSettings.vectorConfig || VECTOR_CONFIG_DEFAULTS}
                          onChange={(next) => {
                            setRenderSettingsByMode((prev) => ({
                              ...prev,
                              [appMode]: {
                                ...prev[appMode],
                                vectorConfig: next,
                              },
                            }));
                          }}
                          onChangePresetGlow={(glow) => {
                            setRenderSettingsByMode((prev) => {
                              const base = prev[appMode].postProcess ?? POST_PROCESS_DEFAULTS;
                              return {
                                ...prev,
                                [appMode]: {
                                  ...prev[appMode],
                                  postProcess: { ...base, glow: { ...base.glow, ...glow } },
                                },
                              };
                            });
                          }}
                        />
                      ) : (
                        <DitherAlgorithmPicker
                          value={currentRenderSettings.ditherAlgorithm || 'floyd-steinberg'}
                          onChange={(algo) => {
                            setRenderSettingsByMode((prev) => ({
                              ...prev,
                              [appMode]: {
                                ...prev[appMode],
                                ditherAlgorithm: algo,
                              },
                            }));
                          }}
                          params={currentRenderSettings.ditherParams}
                          onChangeParams={(next) => {
                            setRenderSettingsByMode((prev) => ({
                              ...prev,
                              [appMode]: {
                                ...prev[appMode],
                                ditherParams: next,
                              },
                            }));
                          }}
                        />
                      )}
                    </CollapsibleSection>

                    {(() => {
                      const synthModelAdjustConfig = currentRenderSettings.adjustConfig ?? DEFAULT_IMAGE_ADJUST_CONFIG;
                      const { colors: synthModelRampColors, weights: synthModelRampWeights } = resolveToneStops(synthModelAdjustConfig);

                      return (
                        <ColorAdjustControls
                          config={synthModelAdjustConfig}
                          onChangeConfig={handleChangeAdjustConfig}
                          persistKeyPrefix={`${appMode}-image-adjust`}
                          onResetPalette={handleResetPalette}
                          mediaColorConfig={mediaColorConfig}
                          paletteSlot={
                            <PaletteControls
                              currentTheme={theme}
                              onChangeTheme={handleSelectTheme}
                              customThemeColor={customThemeColor}
                              onChangeCustomColor={handleSelectCustomColor}
                              mediaColorConfig={mediaColorConfig}
                              onChangeMediaColorConfig={handleSelectMediaColorConfig}
                              appMode={appMode}
                              tonalMapping={synthModelAdjustConfig.tonalMapping}
                              onChangeTonalMapping={(t) =>
                                handleChangeAdjustConfig({
                                  ...synthModelAdjustConfig,
                                  tonalMapping: t,
                                })
                              }
                              isPixelMode={currentRasterMode !== 'ascii'}
                              isVectorMode={currentRasterMode === 'vector'}
                              colorLevels={synthModelAdjustConfig.colorLevels}
                              onChangeColorLevels={(val) =>
                                handleChangeAdjustConfig({
                                  ...synthModelAdjustConfig,
                                  colorLevels: val,
                                })
                              }
                              rampEditorSlot={
                                <NToneRampEditor
                                  stops={synthModelRampColors}
                                  weights={synthModelRampWeights}
                                  onChangeRamp={(stops, nextWeights) =>
                                    handleChangeAdjustConfig({
                                      ...synthModelAdjustConfig,
                                      ...applyToneStops(synthModelAdjustConfig, stops),
                                      toneStopWeights: nextWeights,
                                    })
                                  }
                                />
                              }
                              onEditPaletteAsRamp={
                                mediaColorConfig?.paletteMode === 'indexed'
                                  ? () => {
                                      const pal = BUILTIN_PALETTES.find(
                                        (p) => p.id === mediaColorConfig.activePaletteId
                                      );
                                      if (!pal || pal.colors.length < 2) return;
                                      const stops = [...pal.colors];
                                      handleSelectMediaColorConfig({
                                        ...mediaColorConfig,
                                        paletteMode: 'phosphor',
                                        mode: 'fixed',
                                      });
                                      handleChangeAdjustConfig({
                                        ...synthModelAdjustConfig,
                                        ...applyToneStops(synthModelAdjustConfig, stops),
                                        toneStopWeights: stops.map(() => DEFAULT_STOP_WEIGHT),
                                        tonalMapping: 'ntone',
                                      });
                                    }
                                  : undefined
                              }
                            />
                          }
                        />
                      );
                    })()}
                  </div>
                </>
              )}

              {appMode === 'synth' && (
                <div className="tab-content">
                  <CollapsibleSection
                    title="RENDER SETTINGS"
                    icon={<Settings size={12} />}
                    badge={
                      currentRasterMode === 'vector'
                        ? 'Beam Deflection'
                        : DITHER_ALGORITHMS.find(
                            (a) => a.id === (currentRenderSettings.ditherAlgorithm || 'floyd-steinberg')
                          )?.name || 'Floyd-Steinberg'
                    }
                    persistKey={`${appMode}-render-settings`}
                    onReset={() => {
                      setRenderSettingsByMode((prev) => ({
                        ...prev,
                        [appMode]: {
                          ...prev[appMode],
                          ditherAlgorithm: 'floyd-steinberg',
                          ditherParams: undefined,
                          vectorConfig: undefined,
                        },
                      }));
                    }}
                    resetTitle={
                      currentRasterMode === 'vector'
                        ? 'Reset every beam parameter'
                        : 'Reset dither algorithm and parameters'
                    }
                  >
                    {currentRasterMode === 'vector' ? (
                      <VectorControls
                        config={currentRenderSettings.vectorConfig || VECTOR_CONFIG_DEFAULTS}
                        onChange={(next) => {
                          setRenderSettingsByMode((prev) => ({
                            ...prev,
                            [appMode]: {
                              ...prev[appMode],
                              vectorConfig: next,
                            },
                          }));
                        }}
                        onChangePresetGlow={(glow) => {
                          setRenderSettingsByMode((prev) => {
                            const base = prev[appMode].postProcess ?? POST_PROCESS_DEFAULTS;
                            return {
                              ...prev,
                              [appMode]: {
                                ...prev[appMode],
                                postProcess: { ...base, glow: { ...base.glow, ...glow } },
                              },
                            };
                          });
                        }}
                      />
                    ) : (
                      <DitherAlgorithmPicker
                        value={currentRenderSettings.ditherAlgorithm || 'floyd-steinberg'}
                        onChange={(algo) => {
                          setRenderSettingsByMode((prev) => ({
                            ...prev,
                            [appMode]: {
                              ...prev[appMode],
                              ditherAlgorithm: algo,
                            },
                          }));
                        }}
                        params={currentRenderSettings.ditherParams}
                        onChangeParams={(next) => {
                          setRenderSettingsByMode((prev) => ({
                            ...prev,
                            [appMode]: {
                              ...prev[appMode],
                              ditherParams: next,
                            },
                          }));
                        }}
                      />
                    )}
                  </CollapsibleSection>

                  {(() => {
                    const synthModelAdjustConfig = currentRenderSettings.adjustConfig ?? DEFAULT_IMAGE_ADJUST_CONFIG;
                    const { colors: synthModelRampColors, weights: synthModelRampWeights } = resolveToneStops(synthModelAdjustConfig);

                    return (
                      <ColorAdjustControls
                        config={synthModelAdjustConfig}
                        onChangeConfig={handleChangeAdjustConfig}
                        persistKeyPrefix={`${appMode}-image-adjust`}
                        onResetPalette={handleResetPalette}
                        mediaColorConfig={mediaColorConfig}
                        paletteSlot={
                          <PaletteControls
                            currentTheme={theme}
                            onChangeTheme={handleSelectTheme}
                            customThemeColor={customThemeColor}
                            onChangeCustomColor={handleSelectCustomColor}
                            mediaColorConfig={mediaColorConfig}
                            onChangeMediaColorConfig={handleSelectMediaColorConfig}
                            appMode={appMode}
                            tonalMapping={synthModelAdjustConfig.tonalMapping}
                            onChangeTonalMapping={(t) =>
                              handleChangeAdjustConfig({
                                ...synthModelAdjustConfig,
                                tonalMapping: t,
                              })
                            }
                            isPixelMode={currentRasterMode !== 'ascii'}
                            isVectorMode={currentRasterMode === 'vector'}
                            colorLevels={synthModelAdjustConfig.colorLevels}
                            onChangeColorLevels={(val) =>
                              handleChangeAdjustConfig({
                                ...synthModelAdjustConfig,
                                colorLevels: val,
                              })
                            }
                            rampEditorSlot={
                              <NToneRampEditor
                                stops={synthModelRampColors}
                                weights={synthModelRampWeights}
                                onChangeRamp={(stops, nextWeights) =>
                                  handleChangeAdjustConfig({
                                    ...synthModelAdjustConfig,
                                    ...applyToneStops(synthModelAdjustConfig, stops),
                                    toneStopWeights: nextWeights,
                                  })
                                }
                              />
                            }
                            onEditPaletteAsRamp={
                              mediaColorConfig?.paletteMode === 'indexed'
                                ? () => {
                                    const pal = BUILTIN_PALETTES.find(
                                      (p) => p.id === mediaColorConfig.activePaletteId
                                    );
                                    if (!pal || pal.colors.length < 2) return;
                                    const stops = [...pal.colors];
                                    handleSelectMediaColorConfig({
                                      ...mediaColorConfig,
                                      paletteMode: 'phosphor',
                                      mode: 'fixed',
                                    });
                                    handleChangeAdjustConfig({
                                      ...synthModelAdjustConfig,
                                      ...applyToneStops(synthModelAdjustConfig, stops),
                                      toneStopWeights: stops.map(() => DEFAULT_STOP_WEIGHT),
                                      tonalMapping: 'ntone',
                                    });
                                  }
                                : undefined
                            }
                          />
                        }
                      />
                    );
                  })()}
                </div>
              )}

              {/* ---------------------------------------------------------- */}
              {/* 04 · ADJUST                                                */}
              {/* ---------------------------------------------------------- */}
              <WorkflowStep n="04" label="Adjust" />

              <div className="tab-content">
                {appMode === 'media' ? (
                  <TonalAdjustControls
                    config={mediaViewConfig}
                    onChangeConfig={(next: ImageAdjustConfig) => handleChangeMediaViewConfig({ ...mediaViewConfig, ...next })}
                    resetDefaults={DEFAULT_MEDIA_VIEW_CONFIG}
                    showAlphaCutoff={mediaViewConfig.background === 'transparent'}
                    showInvert
                    toneConfig={currentRenderSettings.toneConfig ?? DEFAULT_TONE_MAPPING_CONFIG}
                    onChangeToneConfig={handleChangeToneConfig}
                    histogram={histogramSnapshot?.bins ?? null}
                    histogramOpaque={histogramSnapshot?.opaque ?? 0}
                  />
                ) : (
                  (() => {
                    const synthModelAdjustConfig = currentRenderSettings.adjustConfig ?? DEFAULT_IMAGE_ADJUST_CONFIG;
                    return (
                      <TonalAdjustControls
                        config={synthModelAdjustConfig}
                        onChangeConfig={handleChangeAdjustConfig}
                        persistKeyPrefix={`${appMode}-image-adjust`}
                        toneConfig={currentRenderSettings.toneConfig ?? DEFAULT_TONE_MAPPING_CONFIG}
                        onChangeToneConfig={handleChangeToneConfig}
                        histogram={histogramSnapshot?.bins ?? null}
                        histogramOpaque={histogramSnapshot?.opaque ?? 0}
                        showAlphaCutoff={false}
                      />
                    );
                  })()
                )}
              </div>

              {/* ---------------------------------------------------------- */}
              {/* 05 · COMPOSITING                                           */}
              {/* ---------------------------------------------------------- */}
              <PostProcessControls
                config={currentRenderSettings.postProcess ?? POST_PROCESS_DEFAULTS}
                onChange={handleChangePostProcess}
                appMode={appMode}
                rasterMode={currentRasterMode}
                sourceUnavailable={appMode === 'media' && !mediaElementRef.current}
                persistKeyPrefix={`${appMode}-post`}
                step="05"
              />
            </AccordionProvider>
            )}

            {/* Bottom Footer Area */}
            {uiMode === 'advanced' ? (
              <div className="sidebar-floating-export">
                <button
                  type="button"
                  className="btn basic-export-primary"
                  onClick={() => {
                    setExportInitialTab('image');
                    setIsExportOpen(true);
                  }}
                  title="Export as PNG, JPG or SVG"
                >
                  <Download size={15} />
                  <span>EXPORT IMAGE</span>
                </button>
                <div className="basic-export-secondary">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setExportInitialTab('gif');
                      setIsExportOpen(true);
                    }}
                    title="Export an animated GIF"
                  >
                    GIF
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setExportInitialTab('video');
                      setIsExportOpen(true);
                    }}
                    title="Export a video file"
                  >
                    VIDEO
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setExportInitialTab('separation');
                      setIsExportOpen(true);
                    }}
                    title="Export one image per colour plate"
                  >
                    PLATES
                  </button>
                </div>
                <div className="sidebar-credits">
                  <span>
                    Made with dedication by{' '}
                    <a
                      href="https://www.pantoine.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Antoine Pouligny
                    </a>
                  </span>
                </div>
              </div>
            ) : (
              <div className="sidebar-credits">
                <span>
                  Made with dedication by{' '}
                  <a
                    href="https://www.pantoine.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Antoine Pouligny
                  </a>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        name={
          appMode === 'model'
            ? (isModelEdited ? `${modelConfig.fileName || 'Torus Knot'} (Edited)` : (modelConfig.fileName || 'Torus Knot'))
            : appMode === 'media'
            ? (isMediaEdited ? `${mediaConfig.fileName || '2D Media'} (Edited)` : (mediaConfig.fileName || '2D Media'))
            : (isEdited ? `${activePreset.name} (Edited)` : activePreset.name)
        }
        type={appMode === 'synth' ? presetType : 'parametric'}
        params={waveParams}
        customCode={customCode}
        customPrepare={customPrepare}
        cols={cols}
        rows={rows}
        density={density}
        currentAsciiFrame={viewportRef.current?.getFrameText() || ''}
        currentTime={timeRef.current}
        theme={theme}
        customThemeColor={customThemeColor}
        gradientConfig={gradientConfig}
        crtConfig={crtConfig}
        initialTab={exportInitialTab}
        appMode={appMode}
        modelConfig={modelConfig}
        modelViewConfig={modelViewConfig}
        geometry={currentGeometryRef.current}
        mediaConfig={mediaConfig}
        mediaViewConfig={mediaViewConfig}
        mediaColorConfig={mediaColorConfig}
        mediaElement={mediaElementRef.current}
        rasterMode={appMode === 'media' ? (mediaViewConfig.rasterMode || currentRenderSettings.rasterMode) : currentRenderSettings.rasterMode}
        ditherAlgorithm={appMode === 'media' ? (mediaViewConfig.algorithm || currentRenderSettings.ditherAlgorithm) : currentRenderSettings.ditherAlgorithm}
        ditherParams={appMode === 'media' ? (mediaViewConfig.ditherParams || currentRenderSettings.ditherParams) : currentRenderSettings.ditherParams}
        vectorConfig={appMode === 'media' ? (mediaViewConfig.vectorConfig || currentRenderSettings.vectorConfig) : currentRenderSettings.vectorConfig}
        toneConfig={currentRenderSettings.toneConfig}
        adjustConfig={currentRenderSettings.adjustConfig}
        postProcess={currentRenderSettings.postProcess}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        state={shareView ? { ...currentFullState, view: shareView } : currentFullState}
        onOpenExport={() => {
          setExportInitialTab('image');
          setIsExportOpen(true);
        }}
      />

      {/* Keyboard & Pointer Reference */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        appMode={appMode}
      />
    </div>
  );
};
