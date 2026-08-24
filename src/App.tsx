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
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
  DEFAULT_TONE_MAPPING_CONFIG,
  DEFAULT_HALFTONE_CONFIG,
} from './types/ascii';
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
import { ModelSettingsControls } from './components/ModelSettingsControls';
import { ModelViewControls } from './components/ModelViewControls';
import { MediaFileControls } from './components/MediaFileControls';
import { ExportModal } from './components/ExportModal';
import { ShareModal } from './components/ShareModal';
import { generateRandomAnimation } from './engine/randomizer';
import {
  FullAnimationState,
  decodeShareFromUrl,
  updateUrlMode,
} from './engine/share';

import {
  Sliders,
  Palette,
  Share2,
  Download,
  Layers,
  Undo2,
  Redo2,
  Box,
  Image as ImageIcon,
} from 'lucide-react';

const LOCAL_STORAGE_RENDER_SETTINGS_KEY = 'ascii_studio_render_settings_by_mode';

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
    id: 'synth',
    name: 'SYNTH',
    badge: 'MATH',
    description: 'Waves & Particles',
    icon: Sliders,
    title: 'Parametric Wave & Particle Synthesizer [1]',
  },
  {
    id: 'media',
    name: 'MEDIA',
    badge: '2D',
    description: 'Image & Video',
    icon: ImageIcon,
    title: '2D Image & Video ASCII Rasterizer [2]',
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

  // App Mode State: 'synth' (Wave Synthesizer) or 'model' (3D Model Visualizer)
  const [appMode, setAppMode] = useState<AppMode>(sharedState?.appMode || 'synth');

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

  const [mediaViewConfig, setMediaViewConfig] = useState<MediaViewConfig>(() => ({
    ...DEFAULT_MEDIA_VIEW_CONFIG,
    ...(sharedState?.mediaViewConfig || {}),
  }));

  const [mediaRenderTrigger, setMediaRenderTrigger] = useState<number>(0);
  const triggerMediaRender = useCallback(() => setMediaRenderTrigger((v) => v + 1), []);

  // Active HTML image/video/canvas element reference for media rasterizer
  const mediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>(null);

  // Isolated Render Settings for each mode (Synth, Media, Model)
  const [renderSettingsByMode, setRenderSettingsByMode] = useState<Record<AppMode, RenderSettings>>(() => {
    let savedSettings: Partial<Record<AppMode, Partial<RenderSettings>>> = {};
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RENDER_SETTINGS_KEY);
      if (raw) {
        savedSettings = JSON.parse(raw);
      }
    } catch {}

    const isSynthShared = sharedState?.appMode === 'synth' || !sharedState?.appMode;
    const isMediaShared = sharedState?.appMode === 'media';
    const isModelShared = sharedState?.appMode === 'model';

    const defaultSynthSettings: RenderSettings = {
      cols: (isSynthShared && sharedState?.cols) || savedSettings.synth?.cols || 100,
      rows: (isSynthShared && sharedState?.rows) || savedSettings.synth?.rows || 50,
      autoRes: (isSynthShared && sharedState?.autoRes !== undefined) ? sharedState.autoRes : (savedSettings.synth?.autoRes !== undefined ? savedSettings.synth.autoRes : true),
      density: (isSynthShared && sharedState?.density) || savedSettings.synth?.density || CHARSETS[0].chars,
      rasterMode: (isSynthShared && sharedState?.rasterMode) || savedSettings.synth?.rasterMode || 'ascii',
      ditherAlgorithm: (isSynthShared && sharedState?.ditherAlgorithm) || savedSettings.synth?.ditherAlgorithm || 'floyd-steinberg',
      toneConfig: (isSynthShared && sharedState?.toneConfig) || savedSettings.synth?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      halftoneConfig: (isSynthShared && sharedState?.halftoneConfig) || savedSettings.synth?.halftoneConfig || DEFAULT_HALFTONE_CONFIG,
      theme: (isSynthShared && sharedState?.theme) || savedSettings.synth?.theme || 'green',
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
      rasterMode: (isMediaShared && sharedState?.rasterMode) || savedSettings.media?.rasterMode || 'ascii',
      ditherAlgorithm: (isMediaShared && sharedState?.ditherAlgorithm) || savedSettings.media?.ditherAlgorithm || 'floyd-steinberg',
      toneConfig: (isMediaShared && sharedState?.toneConfig) || savedSettings.media?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      halftoneConfig: (isMediaShared && sharedState?.halftoneConfig) || savedSettings.media?.halftoneConfig || DEFAULT_HALFTONE_CONFIG,
      theme: (isMediaShared && sharedState?.theme) || savedSettings.media?.theme || 'green',
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
      rasterMode: (isModelShared && sharedState?.rasterMode) || savedSettings.model?.rasterMode || 'ascii',
      ditherAlgorithm: (isModelShared && sharedState?.ditherAlgorithm) || savedSettings.model?.ditherAlgorithm || 'none',
      toneConfig: (isModelShared && sharedState?.toneConfig) || savedSettings.model?.toneConfig || DEFAULT_TONE_MAPPING_CONFIG,
      halftoneConfig: (isModelShared && sharedState?.halftoneConfig) || savedSettings.model?.halftoneConfig || DEFAULT_HALFTONE_CONFIG,
      theme: (isModelShared && sharedState?.theme) || savedSettings.model?.theme || 'green',
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

  const handleSelectGradient = useCallback((g: PhosphorGradient | null) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          gradientConfig: g,
          customThemeColor: '',
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

  const setRasterMode = useCallback((r: RasterOutputMode) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          rasterMode: r,
        },
      };
    });
    setTimeout(() => {
      if (renderSettingsRef.current.autoRes && viewportRef.current) {
        const optimal = viewportRef.current.getOptimalResolution();
        if (optimal) {
          setRenderSettingsByMode((prev) => {
            const mode = appModeRef.current;
            return {
              ...prev,
              [mode]: {
                ...prev[mode],
                cols: optimal.cols,
                rows: optimal.rows,
              },
            };
          });
        }
        viewportRef.current.autoFit();
      }
    }, 20);
    triggerMediaRender();
  }, [triggerMediaRender]);



  const setDitherAlgorithm = useCallback((a: DitherAlgorithm) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          ditherAlgorithm: a,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setToneConfig = useCallback((t: ToneMappingConfig) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          toneConfig: t,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);

  const setHalftoneConfig = useCallback((h: HalftoneConfig) => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          halftoneConfig: h,
        },
      };
    });
    triggerMediaRender();
  }, [triggerMediaRender]);



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

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const viewportRef = useRef<AsciiViewportHandle>(null);
  const currentFpsRef = useRef<number>(30);

  // UI state
  /**
   * The sidebar panel, shared across every content source.
   *
   * Previously this was three independent variables (one per source), so
   * switching source silently threw away which panel you were on.
   */
  const [panel, setPanel] = useState<'content' | 'controls' | 'render'>('content');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportInitialTab, setExportInitialTab] = useState<'prompt' | 'astro' | 'html' | 'json' | 'ascii' | 'image' | 'gif' | 'video'>('image');
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

  // Update theme class and custom color CSS variables on body
  useEffect(() => {
    const isContentColor = appMode === 'media' && mediaColorConfig?.mode === 'content';

    if (isContentColor) {
      document.body.style.removeProperty('--text-gradient');
      document.body.style.removeProperty('--grad-color-1');
      document.body.style.removeProperty('--grad-color-2');

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
      ];

      if (mediaColorConfig.bgPreset === 'white') {
        document.body.className = 'theme-paper';
        allVars.forEach((v) => document.body.style.removeProperty(v));
      } else if (mediaColorConfig.bgPreset === 'dark') {
        // Pure Neutral Monochrome White-on-Black UI for Content Color Dark mode (no green tint)
        document.body.className = 'theme-custom';
        document.body.style.setProperty('--bg-primary', '#0a0a0a');
        document.body.style.setProperty('--bg-panel', '#141414');
        document.body.style.setProperty('--bg-control', '#1c1c1c');
        document.body.style.setProperty('--bg-control-hover', '#262626');
        document.body.style.setProperty('--border-color', '#2a2a2a');
        document.body.style.setProperty('--border-active', '#e6e6e6');
        document.body.style.setProperty('--text-primary', '#f0f0f0');
        document.body.style.setProperty('--text-muted', '#8e8e8e');
        document.body.style.setProperty('--text-dim', '#585858');
        document.body.style.setProperty('--accent', '#ffffff');
        document.body.style.setProperty('--accent-glow', 'rgba(255, 255, 255, 0.08)');
      } else {
        // Custom background color mode
        let cleaned = (mediaColorConfig.customBg || '#0a0a0a').replace('#', '').trim();
        if (cleaned.length === 3) {
          cleaned = cleaned.split('').map((c) => c + c).join('');
        }
        const num = parseInt(cleaned, 16);
        const [r, g, b] = (Number.isNaN(num) || cleaned.length !== 6)
          ? [10, 10, 10]
          : [(num >> 16) & 255, (num >> 8) & 255, num & 255];

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const isLightMode = luminance > 128;

        document.body.className = isLightMode ? 'theme-custom theme-paper' : 'theme-custom';

        if (isLightMode) {
          // Custom Light Mode: Custom BG, dark text and controls
          const bgPrimary = `rgb(${r}, ${g}, ${b})`;
          const bgPanel = `rgb(${Math.max(0, Math.round(r * 0.93 - 4))}, ${Math.max(0, Math.round(g * 0.93 - 4))}, ${Math.max(0, Math.round(b * 0.93 - 4))})`;
          const bgControl = `rgb(${Math.max(0, Math.round(r * 0.86 - 8))}, ${Math.max(0, Math.round(g * 0.86 - 8))}, ${Math.max(0, Math.round(b * 0.86 - 8))})`;
          const bgControlHover = `rgb(${Math.max(0, Math.round(r * 0.78 - 12))}, ${Math.max(0, Math.round(g * 0.78 - 12))}, ${Math.max(0, Math.round(g * 0.78 - 12))})`;
          const borderColor = `rgb(${Math.max(0, Math.round(r * 0.68 - 16))}, ${Math.max(0, Math.round(g * 0.68 - 16))}, ${Math.max(0, Math.round(g * 0.68 - 16))})`;

          document.body.style.setProperty('--bg-primary', bgPrimary);
          document.body.style.setProperty('--bg-panel', bgPanel);
          document.body.style.setProperty('--bg-control', bgControl);
          document.body.style.setProperty('--bg-control-hover', bgControlHover);
          document.body.style.setProperty('--border-color', borderColor);
          document.body.style.setProperty('--border-active', '#151515');
          document.body.style.setProperty('--text-primary', '#151515');
          document.body.style.setProperty('--text-muted', '#444238');
          document.body.style.setProperty('--text-dim', '#787364');
          document.body.style.setProperty('--accent', '#151515');
          document.body.style.setProperty('--accent-glow', 'rgba(0, 0, 0, 0.05)');
        } else {
          // Custom Dark Mode: Custom BG, neutral white-on-dark text and controls
          const bgPrimary = `rgb(${r}, ${g}, ${b})`;
          const bgPanel = `rgb(${Math.min(255, Math.round(r * 1.25 + 6))}, ${Math.min(255, Math.round(g * 1.25 + 6))}, ${Math.min(255, Math.round(b * 1.25 + 6))})`;
          const bgControl = `rgb(${Math.min(255, Math.round(r * 1.5 + 14))}, ${Math.min(255, Math.round(g * 1.5 + 14))}, ${Math.min(255, Math.round(b * 1.5 + 14))})`;
          const bgControlHover = `rgb(${Math.min(255, Math.round(r * 1.75 + 24))}, ${Math.min(255, Math.round(g * 1.75 + 24))}, ${Math.min(255, Math.round(b * 1.75 + 24))})`;
          const borderColor = `rgb(${Math.min(255, Math.round(r * 2.0 + 38))}, ${Math.min(255, Math.round(g * 2.0 + 38))}, ${Math.min(255, Math.round(b * 2.0 + 38))})`;

          document.body.style.setProperty('--bg-primary', bgPrimary);
          document.body.style.setProperty('--bg-panel', bgPanel);
          document.body.style.setProperty('--bg-control', bgControl);
          document.body.style.setProperty('--bg-control-hover', bgControlHover);
          document.body.style.setProperty('--border-color', borderColor);
          document.body.style.setProperty('--border-active', '#e6e6e6');
          document.body.style.setProperty('--text-primary', '#f0f0f0');
          document.body.style.setProperty('--text-muted', '#8e8e8e');
          document.body.style.setProperty('--text-dim', '#585858');
          document.body.style.setProperty('--accent', '#ffffff');
          document.body.style.setProperty('--accent-glow', 'rgba(255, 255, 255, 0.08)');
        }
      }
      return;
    }

    if (gradientConfig) {
      let cleaned = gradientConfig.color1.replace('#', '').trim();
      if (cleaned.length === 3) {
        cleaned = cleaned.split('').map((c) => c + c).join('');
      }
      const num = parseInt(cleaned, 16);
      const [r, g, b] = (Number.isNaN(num) || cleaned.length !== 6)
        ? [0, 255, 102]
        : [(num >> 16) & 255, (num >> 8) & 255, num & 255];

      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isLightMode = luminance < 80;

      document.body.className = isLightMode ? 'theme-custom theme-paper' : 'theme-custom';

      if (!isLightMode) {
        // Dark CRT mode: very dark tint of color1
        const bgPrimary = `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))})`;
        const bgPanel = `rgb(${Math.max(5, Math.round(r * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))})`;
        const bgControl = `rgb(${Math.max(10, Math.round(r * 0.11 + 9))}, ${Math.max(10, Math.round(g * 0.11 + 9))}, ${Math.max(10, Math.round(g * 0.11 + 9))})`;
        const bgControlHover = `rgb(${Math.max(16, Math.round(r * 0.16 + 14))}, ${Math.max(16, Math.round(g * 0.16 + 14))}, ${Math.max(16, Math.round(g * 0.16 + 14))})`;
        const borderColor = `rgb(${Math.max(24, Math.round(r * 0.24 + 18))}, ${Math.max(24, Math.round(g * 0.24 + 18))}, ${Math.max(24, Math.round(g * 0.24 + 18))})`;
        const textMuted = `rgb(${Math.round(r * 0.65 + 30)}, ${Math.round(g * 0.65 + 30)}, ${Math.round(b * 0.65 + 30)})`;
        const textDim = `rgb(${Math.round(r * 0.35 + 15)}, ${Math.round(g * 0.35 + 15)}, ${Math.round(b * 0.35 + 15)})`;

        document.body.style.setProperty('--bg-primary', bgPrimary);
        document.body.style.setProperty('--bg-panel', bgPanel);
        document.body.style.setProperty('--bg-control', bgControl);
        document.body.style.setProperty('--bg-control-hover', bgControlHover);
        document.body.style.setProperty('--border-color', borderColor);
        document.body.style.setProperty('--border-active', gradientConfig.color1);
        document.body.style.setProperty('--text-primary', gradientConfig.color1);
        document.body.style.setProperty('--text-muted', textMuted);
        document.body.style.setProperty('--text-dim', textDim);
        document.body.style.setProperty('--accent', gradientConfig.color1);
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.11)`);
      } else {
        // Light / White mode: background is a very light tint of color1
        const bgPrimary = `rgb(${Math.round(244 - (255 - r) * 0.05)}, ${Math.round(242 - (255 - g) * 0.05)}, ${Math.round(236 - (255 - b) * 0.05)})`;
        const bgPanel = `rgb(${Math.round(234 - (255 - r) * 0.08)}, ${Math.round(232 - (255 - g) * 0.08)}, ${Math.round(224 - (255 - b) * 0.08)})`;
        const bgControl = `rgb(${Math.round(224 - (255 - r) * 0.12)}, ${Math.round(220 - (255 - g) * 0.12)}, ${Math.round(210 - (255 - b) * 0.12)})`;
        const bgControlHover = `rgb(${Math.round(212 - (255 - r) * 0.16)}, ${Math.round(207 - (255 - g) * 0.16)}, ${Math.round(197 - (255 - b) * 0.16)})`;
        const borderColor = `rgb(${Math.round(186 - (255 - r) * 0.22)}, ${Math.round(182 - (255 - g) * 0.22)}, ${Math.round(172 - (255 - b) * 0.22)})`;
        const textMuted = `rgb(${Math.round(r * 0.6 + 65)}, ${Math.round(g * 0.6 + 65)}, ${Math.round(b * 0.6 + 65)})`;
        const textDim = `rgb(${Math.round(r * 0.4 + 115)}, ${Math.round(g * 0.4 + 115)}, ${Math.round(b * 0.4 + 115)})`;

        document.body.style.setProperty('--bg-primary', bgPrimary);
        document.body.style.setProperty('--bg-panel', bgPanel);
        document.body.style.setProperty('--bg-control', bgControl);
        document.body.style.setProperty('--bg-control-hover', bgControlHover);
        document.body.style.setProperty('--border-color', borderColor);
        document.body.style.setProperty('--border-active', gradientConfig.color1);
        document.body.style.setProperty('--text-primary', gradientConfig.color1);
        document.body.style.setProperty('--text-muted', textMuted);
        document.body.style.setProperty('--text-dim', textDim);
        document.body.style.setProperty('--accent', gradientConfig.color1);
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.05)`);
      }

      document.body.style.setProperty('--text-gradient', `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`);
      document.body.style.setProperty('--grad-color-1', gradientConfig.color1);
      document.body.style.setProperty('--grad-color-2', gradientConfig.color2);
    } else if (customThemeColor) {
      document.body.style.removeProperty('--text-gradient');
      document.body.style.removeProperty('--grad-color-1');
      document.body.style.removeProperty('--grad-color-2');
      let cleaned = customThemeColor.replace('#', '').trim();
      if (cleaned.length === 3) {
        cleaned = cleaned.split('').map((c) => c + c).join('');
      }
      const num = parseInt(cleaned, 16);
      const [r, g, b] = (Number.isNaN(num) || cleaned.length !== 6)
        ? [0, 255, 102]
        : [(num >> 16) & 255, (num >> 8) & 255, num & 255];

      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isLightMode = luminance < 80;

      document.body.className = isLightMode ? 'theme-custom theme-paper' : 'theme-custom';

      if (!isLightMode) {
        // Dark CRT mode: very dark tint of the selected color
        const bgPrimary = `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))})`;
        const bgPanel = `rgb(${Math.max(5, Math.round(r * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))})`;
        const bgControl = `rgb(${Math.max(10, Math.round(r * 0.11 + 9))}, ${Math.max(10, Math.round(g * 0.11 + 9))}, ${Math.max(10, Math.round(g * 0.11 + 9))})`;
        const bgControlHover = `rgb(${Math.max(16, Math.round(r * 0.16 + 14))}, ${Math.max(16, Math.round(g * 0.16 + 14))}, ${Math.max(16, Math.round(g * 0.16 + 14))})`;
        const borderColor = `rgb(${Math.max(24, Math.round(r * 0.24 + 18))}, ${Math.max(24, Math.round(g * 0.24 + 18))}, ${Math.max(24, Math.round(g * 0.24 + 18))})`;
        const textMuted = `rgb(${Math.round(r * 0.65 + 30)}, ${Math.round(g * 0.65 + 30)}, ${Math.round(b * 0.65 + 30)})`;
        const textDim = `rgb(${Math.round(r * 0.35 + 15)}, ${Math.round(g * 0.35 + 15)}, ${Math.round(b * 0.35 + 15)})`;

        document.body.style.setProperty('--bg-primary', bgPrimary);
        document.body.style.setProperty('--bg-panel', bgPanel);
        document.body.style.setProperty('--bg-control', bgControl);
        document.body.style.setProperty('--bg-control-hover', bgControlHover);
        document.body.style.setProperty('--border-color', borderColor);
        document.body.style.setProperty('--border-active', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--text-primary', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--text-muted', textMuted);
        document.body.style.setProperty('--text-dim', textDim);
        document.body.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.11)`);
      } else {
        // Light / White mode: background is a very light tint of the selected color, dark text
        const bgPrimary = `rgb(${Math.round(244 - (255 - r) * 0.05)}, ${Math.round(242 - (255 - g) * 0.05)}, ${Math.round(236 - (255 - b) * 0.05)})`;
        const bgPanel = `rgb(${Math.round(234 - (255 - r) * 0.08)}, ${Math.round(232 - (255 - g) * 0.08)}, ${Math.round(224 - (255 - b) * 0.08)})`;
        const bgControl = `rgb(${Math.round(224 - (255 - r) * 0.12)}, ${Math.round(220 - (255 - g) * 0.12)}, ${Math.round(210 - (255 - b) * 0.12)})`;
        const bgControlHover = `rgb(${Math.round(212 - (255 - r) * 0.16)}, ${Math.round(207 - (255 - g) * 0.16)}, ${Math.round(197 - (255 - b) * 0.16)})`;
        const borderColor = `rgb(${Math.round(186 - (255 - r) * 0.22)}, ${Math.round(182 - (255 - g) * 0.22)}, ${Math.round(172 - (255 - b) * 0.22)})`;
        const textMuted = `rgb(${Math.round(r * 0.6 + 65)}, ${Math.round(g * 0.6 + 65)}, ${Math.round(b * 0.6 + 65)})`;
        const textDim = `rgb(${Math.round(r * 0.4 + 115)}, ${Math.round(g * 0.4 + 115)}, ${Math.round(b * 0.4 + 115)})`;

        document.body.style.setProperty('--bg-primary', bgPrimary);
        document.body.style.setProperty('--bg-panel', bgPanel);
        document.body.style.setProperty('--bg-control', bgControl);
        document.body.style.setProperty('--bg-control-hover', bgControlHover);
        document.body.style.setProperty('--border-color', borderColor);
        document.body.style.setProperty('--border-active', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--text-primary', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--text-muted', textMuted);
        document.body.style.setProperty('--text-dim', textDim);
        document.body.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.05)`);
      }
    } else {
      document.body.className = `theme-${theme}`;
      const vars = [
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
      vars.forEach((v) => document.body.style.removeProperty(v));
    }
  }, [appMode, theme, customThemeColor, gradientConfig, mediaColorConfig]);

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
  const autoSetMediaResolution = useCallback((w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    const srcAspect = w / h;
    // Default grid resolution to 1/6 fraction of original media dimensions
    const targetCols = Math.max(20, Math.round(w * (1 / 6)));
    const targetRows = Math.max(10, Math.round((targetCols * 0.55) / srcAspect));
    setRenderSettingsByMode((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        cols: targetCols,
        rows: targetRows,
        autoRes: false,
      },
    }));

    setTimeout(() => {
      viewportRef.current?.autoFit();
    }, 60);
  }, []);

  const handleChangeMediaConfig = useCallback((newConfig: MediaConfig) => {
    setMediaConfig(newConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    }, 400);
  }, [mediaViewConfig, pushMediaHistorySnapshot]);

  const handleChangeMediaViewConfig = useCallback((newViewConfig: MediaViewConfig) => {
    setMediaViewConfig(newViewConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(mediaConfig, newViewConfig);
    }, 400);
  }, [mediaConfig, pushMediaHistorySnapshot]);

  const handleMediaFileUpload = useCallback((file: File) => {
    const isVid = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.webm') || file.name.endsWith('.mov');
    const objectUrl = URL.createObjectURL(file);

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
          autoSetMediaResolution(vid.videoWidth || 1920, vid.videoHeight || 1080);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        autoSetMediaResolution(img.naturalWidth || img.width, img.naturalHeight || img.height);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    }
  }, [mediaConfig, mediaViewConfig, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  const handleMediaUrlLoad = useCallback((url: string) => {
    const isVid = url.match(/\.(mp4|webm|mov|ogg)($|\?)/i);
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
          autoSetMediaResolution(vid.videoWidth || 1920, vid.videoHeight || 1080);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        autoSetMediaResolution(img.naturalWidth || img.width, img.naturalHeight || img.height);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig);
    }
  }, [mediaConfig, mediaViewConfig, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  // Initial loader for shared remote media URLs
  useEffect(() => {
    if (appMode === 'media' && mediaConfig.sourceType === 'url') {
      const url = mediaConfig.remoteUrl || mediaConfig.fileData;
      if (url && url.startsWith('http')) {
        handleMediaUrlLoad(url);
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

    // If static 2D image mode, render once reactively on state changes without continuous RAF polling
    if (isStaticImage) {
      const result = renderAsciiMediaFrameData({
        cols,
        rows,
        mediaElement: mediaElementRef.current,
        mediaConfig,
        viewConfig: mediaViewConfig,
        density: curSettings.density,
        colorConfig: mediaColorConfig,
        rasterMode: curSettings.rasterMode || 'ascii',
        algorithm: curSettings.ditherAlgorithm || 'floyd-steinberg',
        toneConfig: curSettings.toneConfig,
        halftoneConfig: curSettings.halftoneConfig,
      });
      viewportRef.current?.setFrame(
        result.text,
        0,
        0,
        result.colors,
        result.bgColor,
        result.luminance,
        curSettings.rasterMode || 'ascii',
        curSettings.halftoneConfig || mediaViewConfig.halftoneConfig
      );
      return;
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
      const activeRasterMode: RasterOutputMode = activeSettings.rasterMode || 'ascii';

      // Render raster / ASCII frame
      let frameText = '';
      let frameColors: Uint8ClampedArray | null = null;
      let frameBgColor: string | undefined = undefined;
      let frameLuminance: Float32Array | null = null;

      if (appMode === 'model') {
        const res = renderModelFrameData({
          cols,
          rows,
          time: timeRef.current,
          density: activeSettings.density,
          geometry: currentGeometryRef.current,
          modelConfig,
          viewConfig: modelViewConfig,
          colorConfig: mediaColorConfig,
          rasterMode: activeSettings.rasterMode || 'ascii',
          algorithm: activeSettings.ditherAlgorithm || 'none',
          toneConfig: activeSettings.toneConfig,
          halftoneConfig: activeSettings.halftoneConfig,
        });
        frameText = res.text;
        frameColors = res.colors;
        frameLuminance = res.luminance;
      } else if (appMode === 'media') {
        const result = renderAsciiMediaFrameData({
          cols,
          rows,
          mediaElement: mediaElementRef.current,
          mediaConfig,
          viewConfig: mediaViewConfig,
          density: activeSettings.density,
          colorConfig: mediaColorConfig,
          rasterMode: activeSettings.rasterMode || 'ascii',
          algorithm: activeSettings.ditherAlgorithm || 'floyd-steinberg',
          toneConfig: activeSettings.toneConfig,
          halftoneConfig: activeSettings.halftoneConfig,
        });
        frameText = result.text;
        frameColors = result.colors;
        frameBgColor = result.bgColor;
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
          interactiveInfluence: particleConfig.enabled,
          luminanceBoost: particleConfig.luminanceBoost,
          colorConfig: mediaColorConfig,
          rasterMode: activeSettings.rasterMode || 'ascii',
          algorithm: activeSettings.ditherAlgorithm || 'none',
          toneConfig: activeSettings.toneConfig,
        });
        frameText = res.text;
        frameColors = res.colors;
        frameLuminance = res.luminance;
      }


      viewportRef.current?.setFrame(
        frameText,
        timeRef.current,
        currentFpsRef.current,
        frameColors,
        frameBgColor,
        frameLuminance,
        activeRasterMode,
        activeSettings.halftoneConfig || mediaViewConfig.halftoneConfig
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
    mediaColorConfig,
    mediaRenderTrigger,
    waveParams,
    presetType,
    particleConfig,
    optimizeConfig,
    currentRenderSettings,
    renderSettingsByMode,
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
      } else if (e.key.toLowerCase() === 'r' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (appMode === 'synth') {
          e.preventDefault();
          handleRandomize();
        }
      } else if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setPanel('content');
        } else if (e.key === '2') {
          e.preventDefault();
          setPanel('controls');
        } else if (e.key === '3') {
          e.preventDefault();
          setPanel('render');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleRandomize, appMode, mediaConfig.mediaType, setPanel]);

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
      mediaColorConfig: appMode === 'media' ? mediaColorConfig : undefined,
    }),
    [
      appMode,
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

  const handleToggleAutoRes = useCallback(() => {
    setRenderSettingsByMode((prev) => {
      const mode = appModeRef.current;
      const nextAutoRes = !prev[mode].autoRes;
      if (nextAutoRes) {
        const optimal = viewportRef.current?.getOptimalResolution();
        if (optimal) {
          return {
            ...prev,
            [mode]: {
              ...prev[mode],
              autoRes: true,
              cols: optimal.cols,
              rows: optimal.rows,
            },
          };
        }
      }
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          autoRes: nextAutoRes,
        },
      };
    });
  }, []);

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
          autoSetMediaResolution(w, h);
        }
      }

      setTimeout(() => {
        viewportRef.current?.autoFit();
      }, 50);
    },
    [renderSettingsByMode.media.cols, autoSetMediaResolution]
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
  }, []);

  return (
    <div className={`app-container ${viewMode === 'fullscreen' ? 'app-fullscreen' : ''}`}>
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-title">
          <span className="brand-logo" style={{ color: 'var(--accent)' }}>▓▒░</span>
          <div className="brand-text-block">
            <div className="brand-main">
              <span className="brand-full">RASTER STUDIO</span>
            </div>
          </div>
          <span className="brand-version">v1.6</span>
        </div>


        {/* Header Tools: Undo, Redo, Export, Share */}
        <div className="header-actions">
          {viewMode === 'editor' && (
            <>
              <button
                className="btn btn-sm header-btn-undo"
                onClick={handleUndo}
                disabled={!canUndo}
                style={{ opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'not-allowed' }}
                title={typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
              >
                <Undo2 size={13} className="header-btn-icon" />
                <span className="btn-label">UNDO</span>
              </button>
              <button
                className="btn btn-sm header-btn-redo"
                onClick={handleRedo}
                disabled={!canRedo}
                style={{ opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'not-allowed' }}
                title={typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Shift+Z / Ctrl+Y)'}
              >
                <Redo2 size={13} className="header-btn-icon" />
                <span className="btn-label">REDO</span>
              </button>
            </>
          )}

          <button
            className="btn btn-sm btn-header-export"
            onClick={() => {
              setExportInitialTab('image');
              setIsExportOpen(true);
            }}
            title="Download or Export Media & Code"
          >
            <Download size={13} className="header-btn-icon" />
            <span className="btn-label">EXPORT</span>
          </button>

          <button
            className="btn btn-sm btn-header-share"
            onClick={() => setIsShareOpen(true)}
            title="Share Fullscreen Viewfinder link"
          >
            <Share2 size={13} className="header-btn-icon" />
            <span className="btn-label">SHARE</span>
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
          onChangeResolution={handleManualResolutionChange}
          crtConfig={crtConfig}
          onChangeCrtConfig={setCrtConfig}
          optimizeConfig={optimizeConfig}
          onChangeOptimizeConfig={setOptimizeConfig}
          gradientConfig={gradientConfig}
          theme={theme}
          customThemeColor={customThemeColor}
          appMode={appMode}
          mediaType={appMode === 'media' ? mediaConfig.mediaType : undefined}

          isLoading={appMode === 'model' && isModelLoading}
          loadingFileName={modelLoadingFileName}
          loadingStatusText={modelLoadingStatusText}
          onOrbitRotate={handleOrbitRotate}
          onWheelZoom={handleWheelZoom}
        />

        {/* Right Sidebar Control Panel */}
        {viewMode === 'editor' && (
          <div className="sidebar-pane">
            <div className="tab-nav">
              <button
                className={`tab-btn ${panel === 'content' ? 'active' : ''}`}
                onClick={() => setPanel('content')}
                title="Choose content source & presets [Hotkeys: 1]"
              >
                <span className="tab-btn-index">1</span>
                <Layers size={12} className="tab-btn-icon" />
                <span className="tab-btn-label">CONTENT</span>
              </button>
              <button
                className={`tab-btn ${panel === 'controls' ? 'active' : ''}`}
                onClick={() => setPanel('controls')}
                title="Adjust active source parameters [Hotkeys: 2]"
              >
                <span className="tab-btn-index">2</span>
                <Sliders size={12} className="tab-btn-icon" />
                <span className="tab-btn-label">CONTROLS</span>
                <span className="tab-btn-subbadge">{appMode.toUpperCase()}</span>
              </button>
              <button
                className={`tab-btn ${panel === 'render' ? 'active' : ''}`}
                onClick={() => setPanel('render')}
                title="Charset, CRT display effects, resolution & performance [Hotkeys: 3]"
              >
                <span className="tab-btn-index">3</span>
                <Palette size={12} className="tab-btn-icon" />
                <span className="tab-btn-label">RENDER</span>
              </button>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* CONTENT: what am I looking at                              */}
            {/* ---------------------------------------------------------- */}
            {panel === 'content' && (
              <>
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

                {appMode === 'synth' && (
                  <PresetSelector
                    activePresetId={activePreset.id}
                    onSelectPreset={handleSelectPreset}
                    onRandomize={handleRandomize}
                    isRandomizing={isRandomizing}
                  />
                )}

                {appMode === 'media' && (
                  <MediaFileControls
                    section="source"
                    config={mediaConfig}
                    onChangeConfig={handleChangeMediaConfig}
                    viewConfig={mediaViewConfig}
                    onChangeViewConfig={handleChangeMediaViewConfig}
                    mediaElement={mediaElementRef.current}
                    onFileUpload={handleMediaFileUpload}
                    onUrlLoad={handleMediaUrlLoad}
                  />
                )}

                {appMode === 'model' && (
                  <ModelSettingsControls
                    section="source"
                    config={modelConfig}
                    onChangeConfig={handleChangeModelConfig}
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
                )}
              </>
            )}

            {/* ---------------------------------------------------------- */}
            {/* CONTROLS: shape the active source                          */}
            {/* ---------------------------------------------------------- */}
            {panel === 'controls' && (
              <>
                {appMode === 'synth' && (
                  <>
                    <SynthControls
                      params={waveParams}
                      onChangeParams={handleParamChange}
                      onResetParams={() => handleParamChange(DEFAULT_WAVE_PARAMS)}
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

                {appMode === 'media' && (
                  <MediaFileControls
                    section="adjust"
                    config={mediaConfig}
                    onChangeConfig={handleChangeMediaConfig}
                    viewConfig={mediaViewConfig}
                    onChangeViewConfig={handleChangeMediaViewConfig}
                    mediaElement={mediaElementRef.current}
                    onFileUpload={handleMediaFileUpload}
                    onUrlLoad={handleMediaUrlLoad}
                  />
                )}

                {appMode === 'model' && (
                  <>
                    <ModelSettingsControls
                      section="adjust"
                      config={modelConfig}
                      onChangeConfig={handleChangeModelConfig}
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
                    <ModelViewControls
                      config={modelViewConfig}
                      onChangeConfig={handleChangeModelViewConfig}
                      onResetRotation={handleResetModelRotation}
                    />
                  </>
                )}
              </>
            )}

            {/* ---------------------------------------------------------- */}
            {/* RENDER: how it is drawn                                    */}
            {/* ---------------------------------------------------------- */}
            {panel === 'render' && (
              <>
                <CharsetThemeBar
                  currentCharset={density}
                  onChangeCharset={setDensity}
                  currentTheme={theme}
                  onChangeTheme={handleSelectTheme}
                  customThemeColor={customThemeColor}
                  onChangeCustomColor={handleSelectCustomColor}
                  gradientConfig={gradientConfig}
                  onChangeGradient={handleSelectGradient}
                  appMode={appMode}
                  mediaColorConfig={mediaColorConfig}
                  onChangeMediaColorConfig={handleSelectMediaColorConfig}
                  rasterMode={currentRenderSettings.rasterMode || 'ascii'}
                  onChangeRasterMode={setRasterMode}
                  ditherAlgorithm={currentRenderSettings.ditherAlgorithm || 'floyd-steinberg'}
                  onChangeDitherAlgorithm={setDitherAlgorithm}
                  toneConfig={currentRenderSettings.toneConfig}
                  onChangeToneConfig={setToneConfig}
                  halftoneConfig={currentRenderSettings.halftoneConfig}
                  onChangeHalftoneConfig={setHalftoneConfig}
                  noise={appMode === 'media' ? mediaViewConfig.noise : 0}
                  onChangeNoise={appMode === 'media' ? (n) => handleChangeMediaViewConfig({ ...mediaViewConfig, noise: n }) : undefined}
                />


                <OptimizeControls
                  cols={cols}
                  rows={rows}
                  onChangeResolution={handleManualResolutionChange}
                  autoRes={autoRes}
                  onToggleAutoRes={handleToggleAutoRes}
                  appMode={appMode}
                  mediaElement={mediaElementRef.current}
                  mediaConfig={mediaConfig}
                  mediaViewConfig={appMode === 'media' ? mediaViewConfig : undefined}
                  onChangeMediaViewConfig={appMode === 'media' ? handleChangeMediaViewConfig : undefined}
                />
              </>
            )}
            {/* Sidebar Credits Line */}
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
        particleConfig={particleConfig}
        optimizeConfig={optimizeConfig}
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
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        state={currentFullState}
        onOpenExport={() => {
          setExportInitialTab('image');
          setIsExportOpen(true);
        }}
      />
    </div>
  );
};
