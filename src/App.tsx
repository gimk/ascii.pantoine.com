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
  DEFAULT_MEDIA_PRESET,
  MEDIA_PRESETS,
} from './engine/mediaPresets';
import { getBuiltinGeometry, loadBuiltinGeometryAsync, getGeometryStats, fetchRemoteGeometry } from './engine/modelLoader';
import { Khronos3DModel } from './engine/khronos3dModels';
import { renderModelAsciiFrame, applyTrackballRotationWithTime } from './engine/modelRenderer';
import { renderAsciiMediaFrame } from './engine/mediaRenderer';
import { CHARSETS, renderAsciiFrame } from './engine/renderer';
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
import { ModelPresetSelector } from './components/ModelPresetSelector';
import { ModelSettingsControls } from './components/ModelSettingsControls';
import { ModelViewControls } from './components/ModelViewControls';
import { MediaPresetSelector } from './components/MediaPresetSelector';
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
  Sparkles,
  Palette,
  Share2,
  Download,
  Layers,
  Undo2,
  Redo2,
  Cpu,
  Box,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';

const LOCAL_STORAGE_PRESETS_KEY = 'ascii_builder_user_presets';
const LOCAL_STORAGE_MODEL_PRESETS_KEY = 'ascii_builder_user_model_presets';
const LOCAL_STORAGE_MEDIA_PRESETS_KEY = 'ascii_builder_user_media_presets';

interface HistorySnapshot {
  waveParams: WaveParams;
  customCode: string;
  customPrepare?: string;
  presetName: string;
  presetType?: 'parametric' | 'custom';
}

interface ModelHistorySnapshot {
  modelConfig: ModelConfig;
  modelViewConfig: ModelViewConfig;
  activePreset: ModelPreset;
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
  activePreset: MediaPreset;
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
  const [activeModelPreset, setActiveModelPreset] = useState<ModelPreset>(() => {
    if (sharedState?.modelConfig?.modelId) {
      const match = MODEL_PRESETS.find(
        (p) => p.modelConfig.modelId === sharedState.modelConfig?.modelId
      );
      if (match) return match;
    }
    return MODEL_PRESETS[0];
  });

  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => ({
    ...DEFAULT_MODEL_CONFIG,
    ...(sharedState?.modelConfig || MODEL_PRESETS[0].modelConfig || {}),
  }));

  const [modelViewConfig, setModelViewConfig] = useState<ModelViewConfig>(() => ({
    ...DEFAULT_MODEL_VIEW_CONFIG,
    ...(sharedState?.modelViewConfig || MODEL_PRESETS[0].viewConfig || {}),
  }));

  const [userModelPresets, setUserModelPresets] = useState<ModelPreset[]>([]);
  const [modelTab, setModelTab] = useState<'presets' | 'model' | 'view' | 'render' | 'visuals'>('presets');
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
  const [activeMediaPreset, setActiveMediaPreset] = useState<MediaPreset>(() => {
    if (sharedState?.mediaConfig?.mediaId) {
      const match = MEDIA_PRESETS.find(
        (p) => p.mediaConfig.mediaId === sharedState.mediaConfig?.mediaId
      );
      if (match) return match;
    }
    return DEFAULT_MEDIA_PRESET;
  });

  const [mediaConfig, setMediaConfig] = useState<MediaConfig>(() => ({
    ...DEFAULT_MEDIA_CONFIG,
    ...(sharedState?.mediaConfig || {}),
  }));

  const [mediaViewConfig, setMediaViewConfig] = useState<MediaViewConfig>(() => ({
    ...DEFAULT_MEDIA_VIEW_CONFIG,
    ...(sharedState?.mediaViewConfig || {}),
  }));

  const [userMediaPresets, setUserMediaPresets] = useState<MediaPreset[]>([]);
  const [mediaTab, setMediaTab] = useState<'presets' | 'file' | 'render' | 'visuals'>('presets');
  const [mediaRenderTrigger, setMediaRenderTrigger] = useState<number>(0);
  const triggerMediaRender = useCallback(() => setMediaRenderTrigger((v) => v + 1), []);

  // Active HTML image/video/canvas element reference for media rasterizer
  const mediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>(null);

  // Display & Resolution
  const [cols, setCols] = useState<number>(sharedState?.cols || 100);
  const [rows, setRows] = useState<number>(sharedState?.rows || 50);
  const [density, setDensity] = useState<string>(sharedState?.density || CHARSETS[0].chars);
  const [theme, setTheme] = useState<PhosphorTheme>(sharedState?.theme || 'green');
  const [customThemeColor, setCustomThemeColor] = useState<string>(sharedState?.customThemeColor || '');
  const [gradientConfig, setGradientConfig] = useState<PhosphorGradient | null>(sharedState?.gradientConfig || null);

  // CRT Display Effects
  const [crtConfig, setCrtConfig] = useState<CrtConfig>(() => ({
    scanlines: sharedState?.crtConfig?.scanlines ?? true,
    crtGlow: sharedState?.crtConfig?.crtGlow ?? true,
    vignette: sharedState?.crtConfig?.vignette ?? false,
    phosphorBloom: sharedState?.crtConfig?.phosphorBloom ?? false,
  }));

  // Particles & Interaction
  const [particleConfig, setParticleConfig] = useState<ParticleConfig>(
    sharedState?.particleConfig || DEFAULT_PARTICLE_CONFIG
  );
  const trailPointsRef = useRef<TrailPoint[]>([]);

  // Optimization & Performance Config
  const [optimizeConfig, setOptimizeConfig] = useState<OptimizeConfig>(
    sharedState?.optimizeConfig || {
      targetFps: 60,
      pauseWhenHidden: true,
      idleThrottle: false,
    }
  );

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
  const [activeTab, setActiveTab] = useState<'presets' | 'synth' | 'particles' | 'render' | 'visuals'>('presets');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportInitialTab, setExportInitialTab] = useState<'prompt' | 'astro' | 'html' | 'json' | 'ascii' | 'image' | 'gif' | 'video'>('image');
  const [isRandomizing, setIsRandomizing] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<Preset[]>([]);

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
      type?: 'parametric' | 'custom'
    ) => {
      const nextIndex = synthHistoryIndexRef.current + 1;
      const newHistory = synthHistoryRef.current.slice(0, nextIndex);
      newHistory.push({
        waveParams: { ...params },
        customCode: code,
        customPrepare: prepare || '',
        presetName: name,
        presetType: type || 'parametric',
      });
      if (newHistory.length > 50) newHistory.shift();
      synthHistoryRef.current = newHistory;
      synthHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [updateHistoryButtons]
  );

  const pushModelHistorySnapshot = useCallback(
    (
      mConfig: ModelConfig,
      vConfig: ModelViewConfig,
      preset: ModelPreset,
      optConfig?: OptimizeConfig,
      crt?: CrtConfig,
      thm?: PhosphorTheme,
      cColor?: string,
      grad?: PhosphorGradient | null,
      dens?: string
    ) => {
      const nextIndex = modelHistoryIndexRef.current + 1;
      const newHistory = modelHistoryRef.current.slice(0, nextIndex);
      newHistory.push({
        modelConfig: { ...mConfig },
        modelViewConfig: { ...vConfig },
        activePreset: { ...preset },
        theme: thm !== undefined ? thm : theme,
        customThemeColor: cColor !== undefined ? cColor : customThemeColor,
        gradientConfig: grad !== undefined ? grad : gradientConfig,
        density: dens !== undefined ? dens : density,
        crtConfig: crt !== undefined ? { ...crt } : { ...crtConfig },
        optimizeConfig: optConfig !== undefined ? { ...optConfig } : { ...optimizeConfig },
      });
      if (newHistory.length > 50) newHistory.shift();
      modelHistoryRef.current = newHistory;
      modelHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [theme, customThemeColor, gradientConfig, density, crtConfig, optimizeConfig, updateHistoryButtons]
  );

  const pushMediaHistorySnapshot = useCallback(
    (
      mConfig: MediaConfig,
      vConfig: MediaViewConfig,
      preset: MediaPreset,
      optConfig?: OptimizeConfig,
      crt?: CrtConfig,
      thm?: PhosphorTheme,
      cColor?: string,
      grad?: PhosphorGradient | null,
      dens?: string
    ) => {
      const nextIndex = mediaHistoryIndexRef.current + 1;
      const newHistory = mediaHistoryRef.current.slice(0, nextIndex);
      newHistory.push({
        mediaConfig: { ...mConfig },
        mediaViewConfig: { ...vConfig },
        activePreset: { ...preset },
        theme: thm !== undefined ? thm : theme,
        customThemeColor: cColor !== undefined ? cColor : customThemeColor,
        gradientConfig: grad !== undefined ? grad : gradientConfig,
        density: dens !== undefined ? dens : density,
        crtConfig: crt !== undefined ? { ...crt } : { ...crtConfig },
        optimizeConfig: optConfig !== undefined ? { ...optConfig } : { ...optimizeConfig },
      });
      if (newHistory.length > 50) newHistory.shift();
      mediaHistoryRef.current = newHistory;
      mediaHistoryIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    [theme, customThemeColor, gradientConfig, density, crtConfig, optimizeConfig, updateHistoryButtons]
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
        },
      ];
      synthHistoryIndexRef.current = 0;
    }
    if (modelHistoryRef.current.length === 0) {
      modelHistoryRef.current = [
        {
          modelConfig: { ...modelConfig },
          modelViewConfig: { ...modelViewConfig },
          activePreset: activeModelPreset,
          theme,
          customThemeColor,
          gradientConfig,
          density,
          crtConfig: { ...crtConfig },
          optimizeConfig: { ...optimizeConfig },
        },
      ];
      modelHistoryIndexRef.current = 0;
    }
    if (mediaHistoryRef.current.length === 0) {
      mediaHistoryRef.current = [
        {
          mediaConfig: { ...mediaConfig },
          mediaViewConfig: { ...mediaViewConfig },
          activePreset: activeMediaPreset,
          theme,
          customThemeColor,
          gradientConfig,
          density,
          crtConfig: { ...crtConfig },
          optimizeConfig: { ...optimizeConfig },
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
    setActiveModelPreset(snapshot.activePreset);

    if (snapshot.modelConfig.sourceType === 'preset') {
      const modelId = snapshot.modelConfig.modelId as BuiltinModelId;
      const initialGeo = getBuiltinGeometry(modelId);
      currentGeometryRef.current = initialGeo;
      loadBuiltinGeometryAsync(modelId).then((geo) => {
        currentGeometryRef.current = geo;
      });
    }

    if (snapshot.theme) setTheme(snapshot.theme);
    if (snapshot.customThemeColor !== undefined) setCustomThemeColor(snapshot.customThemeColor);
    if (snapshot.gradientConfig !== undefined) setGradientConfig(snapshot.gradientConfig);
    if (snapshot.density) setDensity(snapshot.density);
    if (snapshot.crtConfig) setCrtConfig({ ...snapshot.crtConfig });
    if (snapshot.optimizeConfig) setOptimizeConfig({ ...snapshot.optimizeConfig });
  }, []);

  const restoreMediaSnapshot = useCallback((snapshot: MediaHistorySnapshot) => {
    setMediaConfig({ ...snapshot.mediaConfig });
    setMediaViewConfig({ ...snapshot.mediaViewConfig });
    setActiveMediaPreset(snapshot.activePreset);

    if (snapshot.mediaConfig.fileData) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        triggerMediaRender();
      };
      img.src = snapshot.mediaConfig.fileData;
    }

    if (snapshot.theme) setTheme(snapshot.theme);
    if (snapshot.customThemeColor !== undefined) setCustomThemeColor(snapshot.customThemeColor);
    if (snapshot.gradientConfig !== undefined) setGradientConfig(snapshot.gradientConfig);
    if (snapshot.density) setDensity(snapshot.density);
    if (snapshot.crtConfig) setCrtConfig({ ...snapshot.crtConfig });
    if (snapshot.optimizeConfig) setOptimizeConfig({ ...snapshot.optimizeConfig });
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

  // Load user presets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PRESETS_KEY);
      if (saved) {
        setUserPresets(JSON.parse(saved));
      }
      const savedModels = localStorage.getItem(LOCAL_STORAGE_MODEL_PRESETS_KEY);
      if (savedModels) {
        setUserModelPresets(JSON.parse(savedModels));
      }
      const savedMedia = localStorage.getItem(LOCAL_STORAGE_MEDIA_PRESETS_KEY);
      if (savedMedia) {
        setUserMediaPresets(JSON.parse(savedMedia));
      }
    } catch {
      // LocalStorage error ignored
    }
  }, []);

  // Update theme class and custom color CSS variables on body
  useEffect(() => {
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
        const bgPrimary = `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(b * 0.035 + 2))})`;
        const bgPanel = `rgb(${Math.max(5, Math.round(r * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))}, ${Math.max(5, Math.round(b * 0.06 + 5))})`;
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
  }, [theme, customThemeColor, gradientConfig]);

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

  // Handle 3D Model Preset Selection
  const handleSelectModelPreset = useCallback((preset: ModelPreset) => {
    setActiveModelPreset(preset);
    setModelConfig({ ...preset.modelConfig });
    setModelViewConfig({ ...preset.viewConfig });

    if (preset.modelConfig.sourceType === 'preset') {
      const modelId = preset.modelConfig.modelId as BuiltinModelId;
      const initialGeo = getBuiltinGeometry(modelId);
      currentGeometryRef.current = initialGeo;
      const initialStats = getGeometryStats(initialGeo);
      setModelConfig((prev) => ({
        ...prev,
        polyStats: initialStats,
      }));

      loadBuiltinGeometryAsync(modelId).then((geo) => {
        currentGeometryRef.current = geo;
        const stats = getGeometryStats(geo);
        setModelConfig((prev) => ({
          ...prev,
          polyStats: stats,
        }));
      });
    }

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
    if (preset.densityCharset) {
      setDensity(preset.densityCharset);
    }
    if (preset.crtConfig) {
      setCrtConfig({
        scanlines: preset.crtConfig.scanlines ?? true,
        crtGlow: preset.crtConfig.crtGlow ?? (preset.crtConfig.glow ?? false),
        vignette: preset.crtConfig.vignette ?? false,
        phosphorBloom: preset.crtConfig.phosphorBloom ?? (preset.crtConfig.glow ?? false),
      });
    }
    if (preset.optimizeConfig) {
      setOptimizeConfig({ ...preset.optimizeConfig });
    }

    if (preset.modelConfig.sourceType === 'preset') {
      setIsModelLoading(true);
      setModelLoadingFileName(preset.name);
      setModelLoadingStatusText('Loading');
      loadBuiltinGeometryAsync(preset.modelConfig.modelId as BuiltinModelId)
        .then((geo) => {
          currentGeometryRef.current = geo;
          const stats = getGeometryStats(geo);
          setModelConfig((prev) => ({
            ...prev,
            polyStats: stats,
          }));
        })
        .finally(() => setIsModelLoading(false));
    }

    pushModelHistorySnapshot(
      preset.modelConfig,
      preset.viewConfig,
      preset,
      preset.optimizeConfig,
      preset.crtConfig,
      preset.theme,
      preset.customThemeColor,
      preset.gradientConfig,
      preset.densityCharset
    );
  }, [pushModelHistorySnapshot]);

  // Initial async geometry loader (for OBJ presets & remote models)
  useEffect(() => {
    if (modelConfig.sourceType === 'preset') {
      setIsModelLoading(true);
      setModelLoadingFileName(modelConfig.fileName || '3D Preset');
      setModelLoadingStatusText('Loading');
      loadBuiltinGeometryAsync(modelConfig.modelId as BuiltinModelId)
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
      fetchRemoteGeometry(modelConfig.remoteUrl, 'glb')
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

  const handleLoadOnlineModel = useCallback(
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
          remoteAttribution: `${model.title} by ${model.author} (${model.license})`,
          polyStats: result.stats,
        };
        setModelConfig(newConfig);
        pushModelHistorySnapshot(newConfig, modelViewConfig, activeModelPreset);
      } catch (err) {
        console.error('Failed to load remote 3D model:', err);
        alert(`Could not load 3D model "${model.title}". Please try another model.`);
      } finally {
        setIsModelLoading(false);
      }
    },
    [modelConfig, modelViewConfig, activeModelPreset, pushModelHistorySnapshot]
  );

  // Save Custom User Model Preset
  const handleSaveCustomModelPreset = (name: string) => {
    const newPreset: ModelPreset = {
      id: `user-model-${Date.now()}`,
      name,
      description: `Custom 3D model preset created on ${new Date().toLocaleDateString()}`,
      modelConfig: { ...modelConfig },
      viewConfig: { ...modelViewConfig },
      theme,
      customThemeColor: customThemeColor || undefined,
      densityCharset: density,
      optimizeConfig: { ...optimizeConfig },
      crtConfig: { ...crtConfig },
    };

    const updated = [newPreset, ...userModelPresets];
    setUserModelPresets(updated);
    setActiveModelPreset(newPreset);
    try {
      localStorage.setItem(LOCAL_STORAGE_MODEL_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteUserModelPreset = (id: string) => {
    const updated = userModelPresets.filter((p) => p.id !== id);
    setUserModelPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_MODEL_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

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
    pushModelHistorySnapshot(newConfig, modelViewConfig, activeModelPreset);
  };

  const handleSelectBuiltinGeometry = (id: BuiltinModelId) => {
    if (id === 'skull') {
      setIsModelLoading(true);
      setModelLoadingFileName('Skull');
      setModelLoadingStatusText('Loading');
    }
    loadBuiltinGeometryAsync(id)
      .then((geo) => {
        currentGeometryRef.current = geo;
        const stats = getGeometryStats(geo);
        const newConfig: ModelConfig = {
          ...modelConfig,
          sourceType: 'preset',
          modelId: id,
          fileName: undefined,
          polyStats: stats,
        };
        setModelConfig(newConfig);
        pushModelHistorySnapshot(newConfig, modelViewConfig, activeModelPreset);
      })
      .finally(() => {
        if (id === 'skull') {
          setIsModelLoading(false);
        }
      });
  };

  const handleChangeModelConfig = useCallback((newConfig: ModelConfig) => {
    setModelConfig(newConfig);
    clearTimeout(modelHistoryDebounceTimer.current);
    modelHistoryDebounceTimer.current = setTimeout(() => {
      pushModelHistorySnapshot(newConfig, modelViewConfig, activeModelPreset);
    }, 400);
  }, [modelViewConfig, activeModelPreset, pushModelHistorySnapshot]);

  const handleChangeModelViewConfig = useCallback((newViewConfig: ModelViewConfig) => {
    setModelViewConfig(newViewConfig);
    clearTimeout(modelHistoryDebounceTimer.current);
    modelHistoryDebounceTimer.current = setTimeout(() => {
      pushModelHistorySnapshot(modelConfig, newViewConfig, activeModelPreset);
    }, 400);
  }, [modelConfig, activeModelPreset, pushModelHistorySnapshot]);

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
          height,
          2.0
        );
        const updated = {
          ...prev,
          manualRotationX: nextRot.manualRotationX,
          manualRotationY: nextRot.manualRotationY,
          manualRotationZ: nextRot.manualRotationZ,
        };
        clearTimeout(modelHistoryDebounceTimer.current);
        modelHistoryDebounceTimer.current = setTimeout(() => {
          pushModelHistorySnapshot(modelConfig, updated, activeModelPreset);
        }, 500);
        return updated;
      });
    },
    [modelConfig, activeModelPreset, pushModelHistorySnapshot]
  );

  const handleWheelZoom = useCallback((deltaZoom: number) => {
    setModelViewConfig((prev) => {
      const updated = {
        ...prev,
        cameraDistance: Math.max(1.2, Math.min(8.0, prev.cameraDistance + deltaZoom)),
      };
      clearTimeout(modelHistoryDebounceTimer.current);
      modelHistoryDebounceTimer.current = setTimeout(() => {
        pushModelHistorySnapshot(modelConfig, updated, activeModelPreset);
      }, 500);
      return updated;
    });
  }, [modelConfig, activeModelPreset, pushModelHistorySnapshot]);

  const handleResetModelRotation = useCallback(() => {
    const updated = {
      ...modelViewConfig,
      manualRotationX: 0,
      manualRotationY: 0,
      manualRotationZ: 0,
    };
    setModelViewConfig(updated);
    pushModelHistorySnapshot(modelConfig, updated, activeModelPreset);
  }, [modelConfig, modelViewConfig, activeModelPreset, pushModelHistorySnapshot]);

  // Media Handlers
  const autoSetMediaResolution = useCallback((w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    setAutoRes(false);
    const srcAspect = w / h;
    // Pick high crisp detail by default (targeting 180-280 cols)
    let targetCols = 240;
    if (w >= 1600) targetCols = Math.round(w / 8);
    else if (w >= 800) targetCols = Math.round(w / 4);
    else if (w >= 400) targetCols = Math.round(w / 2);
    else targetCols = Math.max(80, w);

    if (targetCols < 140) targetCols = Math.min(280, Math.round(targetCols * 2));
    if (targetCols > 320) targetCols = 320;

    const targetRows = Math.max(10, Math.round((targetCols * 0.55) / srcAspect));
    setCols(targetCols);
    setRows(targetRows);

    setTimeout(() => {
      viewportRef.current?.autoFit();
    }, 60);
  }, []);

  const handleSelectMediaPreset = useCallback((preset: MediaPreset) => {
    setActiveMediaPreset(preset);
    setMediaConfig({ ...preset.mediaConfig });
    setMediaViewConfig({ ...preset.viewConfig });

    if (preset.mediaConfig.fileData) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mediaElementRef.current = img;
        autoSetMediaResolution(img.naturalWidth || img.width, img.naturalHeight || img.height);
        triggerMediaRender();
      };
      img.src = preset.mediaConfig.fileData;
    }

    if (preset.theme) setTheme(preset.theme);
    if (preset.customThemeColor !== undefined) setCustomThemeColor(preset.customThemeColor || '');
    if (preset.gradientConfig !== undefined) setGradientConfig(preset.gradientConfig || null);
    if (preset.densityCharset) setDensity(preset.densityCharset);
    if (preset.crtConfig) setCrtConfig({ ...preset.crtConfig });
    if (preset.optimizeConfig) setOptimizeConfig({ ...preset.optimizeConfig });
    pushMediaHistorySnapshot(preset.mediaConfig, preset.viewConfig, preset);
  }, [pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  const handleSaveCustomMediaPreset = (name: string) => {
    const newPreset: MediaPreset = {
      id: `user-media-${Date.now()}`,
      name,
      description: `Custom 2D media preset created on ${new Date().toLocaleDateString()}`,
      mediaConfig: { ...mediaConfig },
      viewConfig: { ...mediaViewConfig },
      theme,
      customThemeColor: customThemeColor || undefined,
      densityCharset: density,
      optimizeConfig: { ...optimizeConfig },
      crtConfig: { ...crtConfig },
    };

    const updated = [newPreset, ...userMediaPresets];
    setUserMediaPresets(updated);
    setActiveMediaPreset(newPreset);
    try {
      localStorage.setItem(LOCAL_STORAGE_MEDIA_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteUserMediaPreset = (id: string) => {
    const updated = userMediaPresets.filter((p) => p.id !== id);
    setUserMediaPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_MEDIA_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleChangeMediaConfig = useCallback((newConfig: MediaConfig) => {
    setMediaConfig(newConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(newConfig, mediaViewConfig, activeMediaPreset);
    }, 400);
  }, [mediaViewConfig, activeMediaPreset, pushMediaHistorySnapshot]);

  const handleChangeMediaViewConfig = useCallback((newViewConfig: MediaViewConfig) => {
    setMediaViewConfig(newViewConfig);
    clearTimeout(mediaHistoryDebounceTimer.current);
    mediaHistoryDebounceTimer.current = setTimeout(() => {
      pushMediaHistorySnapshot(mediaConfig, newViewConfig, activeMediaPreset);
    }, 400);
  }, [mediaConfig, activeMediaPreset, pushMediaHistorySnapshot]);

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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig, activeMediaPreset);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig, activeMediaPreset);
    }
  }, [mediaConfig, mediaViewConfig, activeMediaPreset, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig, activeMediaPreset);
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
      pushMediaHistorySnapshot(newConfig, mediaViewConfig, activeMediaPreset);
    }
  }, [mediaConfig, mediaViewConfig, activeMediaPreset, pushMediaHistorySnapshot, autoSetMediaResolution, triggerMediaRender]);

  const handleResetMediaDefaults = useCallback(() => {
    setMediaViewConfig({ ...DEFAULT_MEDIA_VIEW_CONFIG });
    pushMediaHistorySnapshot(mediaConfig, DEFAULT_MEDIA_VIEW_CONFIG, activeMediaPreset);
  }, [mediaConfig, activeMediaPreset, pushMediaHistorySnapshot]);

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
      const randomPreset = MODEL_PRESETS[Math.floor(Math.random() * MODEL_PRESETS.length)];
      handleSelectModelPreset(randomPreset);
      return;
    }

    if (appMode === 'media') {
      if (userMediaPresets.length > 0) {
        const randomPreset = userMediaPresets[Math.floor(Math.random() * userMediaPresets.length)];
        handleSelectMediaPreset(randomPreset);
      } else {
        const themes: PhosphorTheme[] = ['green', 'amber', 'cyan', 'monochrome', 'matrix', 'blood'];
        const randTheme = themes[Math.floor(Math.random() * themes.length)];
        const randCharset = CHARSETS[Math.floor(Math.random() * CHARSETS.length)].chars;
        setTheme(randTheme);
        setDensity(randCharset);
      }
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
  }, [appMode, handleSelectModelPreset, handleSelectMediaPreset, recompileCustomCode, pushHistorySnapshot]);

  // Save Custom User Preset
  const handleSaveCustomPreset = (name: string) => {
    const newPreset: Preset = {
      id: `user-${Date.now()}`,
      name,
      description:
        presetType === 'custom'
          ? `Custom formula preset created on ${new Date().toLocaleDateString()}`
          : `Custom preset created on ${new Date().toLocaleDateString()}`,
      type: presetType,
      params: { ...waveParams },
      customCode: customCode,
      customPrepare: customPrepare || undefined,
      theme,
      customThemeColor: customThemeColor || undefined,
      densityCharset: density,
      particleConfig: { ...particleConfig },
      optimizeConfig: { ...optimizeConfig },
      crtConfig: { ...crtConfig },
    };

    const updated = [newPreset, ...userPresets];
    setUserPresets(updated);
    setActivePreset(newPreset);
    try {
      localStorage.setItem(LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteUserPreset = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

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

    // If static 2D image mode, render once reactively on state changes without continuous RAF polling
    if (isStaticImage) {
      const frameText = renderAsciiMediaFrame({
        cols,
        rows,
        mediaElement: mediaElementRef.current,
        mediaConfig,
        viewConfig: mediaViewConfig,
        density,
      });
      viewportRef.current?.setFrame(frameText, 0, 0);
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

      // FPS Calculation (measured rolling every 500ms)
      frameCountRef.current++;
      const timeSinceLastFpsCalc = timestamp - fpsTimerRef.current;
      if (timeSinceLastFpsCalc >= 500) {
        currentFpsRef.current = Math.round((frameCountRef.current * 1000) / timeSinceLastFpsCalc);
        frameCountRef.current = 0;
        fpsTimerRef.current = timestamp;
      }

      if (isPlaying) {
        const delta = lastTimeRef.current ? Math.min(0.1, (timestamp - lastTimeRef.current) / 1000) : 0.016;
        timeRef.current += delta * (waveParams.timeSpeed || 1.0);
        lastTimeRef.current = timestamp;

        // Vector field sampling function
        const sampleField = (px: number, py: number, t: number): number => {
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
                t,
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
            t,
            dist,
            dx,
            dy,
            cols,
            rows,
            angle,
            waveParams
          );
        };

        // Update trail particles
        if (particleConfig.enabled) {
          const pts = trailPointsRef.current;
          const t = timeRef.current;
          for (let i = 0; i < pts.length; i++) {
            updateParticleWithField(
              pts[i],
              cols,
              rows,
              t,
              sampleField,
              particleConfig,
              delta
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
      } else {
        lastTimeRef.current = timestamp;
      }

      // Render ASCII frame
      let frameText = '';
      if (appMode === 'model') {
        frameText = renderModelAsciiFrame({
          cols,
          rows,
          time: timeRef.current,
          density,
          geometry: currentGeometryRef.current,
          modelConfig,
          viewConfig: modelViewConfig,
        });
      } else if (appMode === 'media') {
        frameText = renderAsciiMediaFrame({
          cols,
          rows,
          mediaElement: mediaElementRef.current,
          mediaConfig,
          viewConfig: mediaViewConfig,
          density,
        });
      } else {
        frameText = renderAsciiFrame({
          cols,
          rows,
          time: timeRef.current,
          density,
          trailPoints: trailPointsRef.current,
          waveParams,
          customRenderFn: presetType === 'custom' ? compiledFnRef.current : undefined,
          prepareFn: presetType === 'custom' ? prepareFnRef.current : undefined,
          customContext: customContextRef.current,
          interactiveInfluence: particleConfig.enabled,
          luminanceBoost: particleConfig.luminanceBoost,
        });
      }

      viewportRef.current?.setFrame(frameText, timeRef.current, currentFpsRef.current);
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
    mediaRenderTrigger,
    waveParams,
    presetType,
    particleConfig,
    optimizeConfig,
  ]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      lastInteractionTimeRef.current = Date.now();
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleRandomize, appMode, mediaConfig.mediaType]);

  // Toggle between editor and fullscreen viewfinder
  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === 'editor' ? 'fullscreen' : 'editor';
      updateUrlMode(next);
      return next;
    });
  }, []);

  const [autoRes, setAutoRes] = useState<boolean>(
    sharedState?.autoRes !== undefined ? sharedState.autoRes : true
  );

  const isModelEdited = useMemo(() => {
    if (!activeModelPreset) return false;
    if (modelConfig.modelId !== activeModelPreset.modelConfig.modelId) return true;
    if (modelConfig.sourceType !== activeModelPreset.modelConfig.sourceType) return true;
    if (modelConfig.scale !== activeModelPreset.modelConfig.scale) return true;
    if (modelViewConfig.shadingMode !== activeModelPreset.viewConfig.shadingMode) return true;
    return false;
  }, [activeModelPreset, modelConfig, modelViewConfig]);

  const isMediaEdited = useMemo(() => {
    if (!activeMediaPreset) return false;
    if (mediaConfig.scale !== activeMediaPreset.mediaConfig.scale) return true;
    if (mediaConfig.offsetX !== activeMediaPreset.mediaConfig.offsetX) return true;
    if (mediaConfig.offsetY !== activeMediaPreset.mediaConfig.offsetY) return true;
    if (mediaConfig.rotation !== activeMediaPreset.mediaConfig.rotation) return true;
    if (mediaConfig.flipX !== activeMediaPreset.mediaConfig.flipX) return true;
    if (mediaConfig.flipY !== activeMediaPreset.mediaConfig.flipY) return true;
    if (mediaConfig.fit !== activeMediaPreset.mediaConfig.fit) return true;
    if (mediaViewConfig.algorithm !== activeMediaPreset.viewConfig.algorithm) return true;
    if (mediaViewConfig.sharpenStrength !== activeMediaPreset.viewConfig.sharpenStrength) return true;
    if (mediaViewConfig.contrast !== activeMediaPreset.viewConfig.contrast) return true;
    return false;
  }, [activeMediaPreset, mediaConfig, mediaViewConfig]);

  // Complete snapshot of the current animation state for sharing / deep-linking
  const currentFullState: FullAnimationState = useMemo(
    () => ({
      appMode,
      name: appMode === 'model'
        ? (isModelEdited ? `${activeModelPreset.name} (Edited)` : activeModelPreset.name)
        : appMode === 'media'
        ? (isMediaEdited ? `${activeMediaPreset.name} (Edited)` : activeMediaPreset.name)
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
    }),
    [
      appMode,
      activeModelPreset.name,
      isModelEdited,
      activeMediaPreset.name,
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
      modelConfig,
      modelViewConfig,
      mediaConfig,
      mediaViewConfig,
    ]
  );

  // Match viewport aspect ratio to optimal grid dimensions
  const handleMatchViewfinderRatio = useCallback(() => {
    const optimal = viewportRef.current?.getOptimalResolution();
    if (optimal) {
      setCols(optimal.cols);
      setRows(optimal.rows);
      setTimeout(() => {
        viewportRef.current?.autoFit();
      }, 50);
    }
  }, []);

  const handleToggleAutoRes = useCallback(() => {
    setAutoRes((prev) => {
      const next = !prev;
      if (next) {
        handleMatchViewfinderRatio();
      }
      return next;
    });
  }, [handleMatchViewfinderRatio]);

  const handleManualResolutionChange = useCallback((c: number, r: number) => {
    setAutoRes(false);
    setCols(c);
    setRows(r);
  }, []);

  return (
    <div className={`app-container ${viewMode === 'fullscreen' ? 'app-fullscreen' : ''}`}>
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-title">
          <span className="brand-logo" style={{ color: 'var(--accent)' }}>▓▒░</span>
          <div className="brand-text-block">
            <div className="brand-main">
              <span className="brand-full">ASCII STUDIO</span>
            </div>
          </div>
          <span className="brand-version">v1.3</span>
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
                : activeModelPreset.name
              : appMode === 'media'
              ? mediaConfig.fileName || activeMediaPreset.name
              : activePreset.name
          }
          isEdited={appMode === 'model' ? isModelEdited : appMode === 'media' ? isMediaEdited : isEdited}
          targetFps={optimizeConfig.targetFps}
          viewMode={viewMode}
          onToggleViewMode={handleToggleViewMode}
          autoRes={autoRes}
          onToggleAutoRes={handleToggleAutoRes}
          onAutoResolutionChange={(c, r) => {
            setCols(c);
            setRows(r);
          }}
          crtConfig={crtConfig}
          gradientConfig={gradientConfig}
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
            {/* Primary Mode Switcher (Full Width at Top of Right Panel) */}
            <div className="sidebar-mode-switcher">
              <button
                className={`sidebar-mode-btn ${appMode === 'synth' ? 'active' : ''}`}
                onClick={() => setAppMode('synth')}
                title="Parametric Wave & Particle Synthesizer"
              >
                <Sliders size={13} style={{ marginRight: '6px' }} />
                SYNTH
              </button>
              <button
                className={`sidebar-mode-btn ${appMode === 'media' ? 'active' : ''}`}
                onClick={() => {
                  setAppMode('media');
                  if (mediaElementRef.current) {
                    let w = 256;
                    let h = 256;
                    if (mediaElementRef.current instanceof HTMLImageElement) {
                      w = mediaElementRef.current.naturalWidth || mediaElementRef.current.width || 256;
                      h = mediaElementRef.current.naturalHeight || mediaElementRef.current.height || 256;
                    } else if (mediaElementRef.current instanceof HTMLVideoElement) {
                      w = mediaElementRef.current.videoWidth || mediaElementRef.current.width || 256;
                      h = mediaElementRef.current.videoHeight || mediaElementRef.current.height || 256;
                    }
                    if (cols <= 120) {
                      autoSetMediaResolution(w, h);
                    }
                  }
                }}
                title="2D Image & Video ASCII Rasterizer"
              >
                <ImageIcon size={13} style={{ marginRight: '6px' }} />
                MEDIA
              </button>
              <button
                className={`sidebar-mode-btn ${appMode === 'model' ? 'active' : ''}`}
                onClick={() => setAppMode('model')}
                title="3D Model to 2D ASCII Visualizer (Beta)"
              >
                <Box size={13} style={{ marginRight: '6px' }} />
                MODEL
              </button>
            </div>

            {appMode === 'synth' ? (
              /* SYNTH MODE TABS */
              <>
                <div className="tab-nav">
                  <button
                    className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
                    onClick={() => setActiveTab('presets')}
                    title="Presets Library"
                  >
                    <Layers size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    PRESETS
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'synth' ? 'active' : ''}`}
                    onClick={() => setActiveTab('synth')}
                    title="Wave Synthesizer & Advanced Formula Code"
                  >
                    <Sliders size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    SYNTH
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'particles' ? 'active' : ''}`}
                    onClick={() => setActiveTab('particles')}
                    title="Particle Physics & Mouse Trail"
                  >
                    <Sparkles size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    PHYSICS
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'visuals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('visuals')}
                    title="Charsets & Color Themes"
                  >
                    <Palette size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    THEME
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'render' ? 'active' : ''}`}
                    onClick={() => setActiveTab('render')}
                    title="Render Settings, Framerate Limiter & Resolution"
                  >
                    <Cpu size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    RENDER
                  </button>
                </div>

                {/* Active Tab View */}
                {activeTab === 'presets' && (
                  <PresetSelector
                    activePresetId={activePreset.id}
                    onSelectPreset={handleSelectPreset}
                    onSaveCustomPreset={handleSaveCustomPreset}
                    userPresets={userPresets}
                    onDeleteUserPreset={handleDeleteUserPreset}
                    onRandomize={handleRandomize}
                    isRandomizing={isRandomizing}
                  />
                )}

                {activeTab === 'synth' && (
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
                )}

                {activeTab === 'particles' && (
                  <ParticleControls
                    config={particleConfig}
                    onChange={setParticleConfig}
                    onClearParticles={() => {
                      trailPointsRef.current = [];
                    }}
                  />
                )}

                {activeTab === 'render' && (
                  <OptimizeControls
                    config={optimizeConfig}
                    onChangeConfig={setOptimizeConfig}
                    cols={cols}
                    rows={rows}
                    onChangeResolution={handleManualResolutionChange}
                    autoRes={autoRes}
                    onToggleAutoRes={handleToggleAutoRes}
                    appMode={appMode}
                    mediaElement={mediaElementRef.current}
                    mediaConfig={mediaConfig}
                  />
                )}

                {activeTab === 'visuals' && (
                  <CharsetThemeBar
                    currentCharset={density}
                    onChangeCharset={setDensity}
                    currentTheme={theme}
                    onChangeTheme={(t) => {
                      setCustomThemeColor('');
                      setGradientConfig(null);
                      setTheme(t);
                    }}
                    customThemeColor={customThemeColor}
                    onChangeCustomColor={(c) => {
                      setGradientConfig(null);
                      setCustomThemeColor(c);
                    }}
                    gradientConfig={gradientConfig}
                    onChangeGradient={(g) => {
                      setCustomThemeColor('');
                      setGradientConfig(g);
                    }}
                    crtConfig={crtConfig}
                    onChangeCrtConfig={setCrtConfig}
                  />
                )}
              </>
            ) : appMode === 'media' ? (
              /* MEDIA MODE TABS */
              <>
                <div className="tab-nav">
                  <button
                    className={`tab-btn ${mediaTab === 'presets' ? 'active' : ''}`}
                    onClick={() => setMediaTab('presets')}
                    title="2D Media Presets"
                  >
                    <Layers size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    PRESETS
                  </button>
                  <button
                    className={`tab-btn ${mediaTab === 'file' ? 'active' : ''}`}
                    onClick={() => setMediaTab('file')}
                    title="Upload Image/Video, Transforms, Effects & Tonal Controls"
                  >
                    <ImageIcon size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    FILE
                  </button>
                  <button
                    className={`tab-btn ${mediaTab === 'visuals' ? 'active' : ''}`}
                    onClick={() => setMediaTab('visuals')}
                    title="Charsets & Color Themes"
                  >
                    <Palette size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    THEME
                  </button>
                  <button
                    className={`tab-btn ${mediaTab === 'render' ? 'active' : ''}`}
                    onClick={() => setMediaTab('render')}
                    title="Render Settings, Framerate Limiter & Resolution"
                  >
                    <Cpu size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    RENDER
                  </button>
                </div>

                {/* Active 2D Media Tab Views */}
                {mediaTab === 'presets' && (
                  <MediaPresetSelector
                    activePresetId={activeMediaPreset.id}
                    activeMediaConfig={mediaConfig}
                    onSelectPreset={handleSelectMediaPreset}
                    onSaveCustomPreset={handleSaveCustomMediaPreset}
                    userPresets={userMediaPresets}
                    onDeleteUserPreset={handleDeleteUserMediaPreset}
                  />
                )}

                {mediaTab === 'file' && (
                  <MediaFileControls
                    config={mediaConfig}
                    onChangeConfig={handleChangeMediaConfig}
                    viewConfig={mediaViewConfig}
                    onChangeViewConfig={handleChangeMediaViewConfig}
                    onResetViewDefaults={handleResetMediaDefaults}
                    mediaElement={mediaElementRef.current}
                    onFileUpload={handleMediaFileUpload}
                    onUrlLoad={handleMediaUrlLoad}
                  />
                )}

                {mediaTab === 'render' && (
                  <OptimizeControls
                    config={optimizeConfig}
                    onChangeConfig={setOptimizeConfig}
                    cols={cols}
                    rows={rows}
                    onChangeResolution={handleManualResolutionChange}
                    autoRes={autoRes}
                    onToggleAutoRes={handleToggleAutoRes}
                    appMode={appMode}
                    mediaElement={mediaElementRef.current}
                    mediaConfig={mediaConfig}
                    mediaViewConfig={mediaViewConfig}
                    onChangeMediaViewConfig={handleChangeMediaViewConfig}
                  />
                )}

                {mediaTab === 'visuals' && (
                  <CharsetThemeBar
                    currentCharset={density}
                    onChangeCharset={setDensity}
                    currentTheme={theme}
                    onChangeTheme={(t) => {
                      setCustomThemeColor('');
                      setGradientConfig(null);
                      setTheme(t);
                    }}
                    customThemeColor={customThemeColor}
                    onChangeCustomColor={(c) => {
                      setGradientConfig(null);
                      setCustomThemeColor(c);
                    }}
                    gradientConfig={gradientConfig}
                    onChangeGradient={(g) => {
                      setCustomThemeColor('');
                      setGradientConfig(g);
                    }}
                    crtConfig={crtConfig}
                    onChangeCrtConfig={setCrtConfig}
                  />
                )}
              </>
            ) : (
              /* MODEL MODE TABS */
              <>
                <div className="tab-nav">
                  <button
                    className={`tab-btn ${modelTab === 'presets' ? 'active' : ''}`}
                    onClick={() => setModelTab('presets')}
                    title="3D Model Presets"
                  >
                    <Layers size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    PRESETS
                  </button>
                  <button
                    className={`tab-btn ${modelTab === 'model' ? 'active' : ''}`}
                    onClick={() => setModelTab('model')}
                    title="Upload & 3D Geometry Settings"
                  >
                    <Box size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    FILE
                  </button>
                  <button
                    className={`tab-btn ${modelTab === 'view' ? 'active' : ''}`}
                    onClick={() => setModelTab('view')}
                    title="ASCII Shading, Rotation & Lighting"
                  >
                    <Eye size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    SCENE
                  </button>
                  <button
                    className={`tab-btn ${modelTab === 'visuals' ? 'active' : ''}`}
                    onClick={() => setModelTab('visuals')}
                    title="Charsets & Color Themes"
                  >
                    <Palette size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    THEME
                  </button>
                  <button
                    className={`tab-btn ${modelTab === 'render' ? 'active' : ''}`}
                    onClick={() => setModelTab('render')}
                    title="Render Settings, Framerate Limiter & Resolution"
                  >
                    <Cpu size={11} style={{ display: 'inline', marginRight: '4px' }} />
                    RENDER
                  </button>
                </div>

                {/* Active 3D Model Tab Views */}
                {modelTab === 'presets' && (
                  <ModelPresetSelector
                    activePresetId={activeModelPreset.id}
                    activeModelConfig={modelConfig}
                    onSelectPreset={handleSelectModelPreset}
                    onSaveCustomPreset={handleSaveCustomModelPreset}
                    userPresets={userModelPresets}
                    onDeleteUserPreset={handleDeleteUserModelPreset}
                  />
                )}

                {modelTab === 'model' && (
                  <ModelSettingsControls
                    config={modelConfig}
                    onChangeConfig={handleChangeModelConfig}
                    onLoadCustomGeometry={handleLoadCustomGeometry}
                    onSelectBuiltinGeometry={handleSelectBuiltinGeometry}
                    onLoadRemoteModel={handleLoadOnlineModel}
                    onStartLoading={(fileName, statusText) => {
                      setIsModelLoading(true);
                      if (fileName) setModelLoadingFileName(fileName);
                      if (statusText) setModelLoadingStatusText(statusText);
                    }}
                    onEndLoading={() => setIsModelLoading(false)}
                  />
                )}

                {modelTab === 'view' && (
                  <ModelViewControls
                    config={modelViewConfig}
                    onChangeConfig={handleChangeModelViewConfig}
                    onResetRotation={handleResetModelRotation}
                  />
                )}

                {modelTab === 'render' && (
                  <OptimizeControls
                    config={optimizeConfig}
                    onChangeConfig={setOptimizeConfig}
                    cols={cols}
                    rows={rows}
                    onChangeResolution={handleManualResolutionChange}
                    autoRes={autoRes}
                    onToggleAutoRes={handleToggleAutoRes}
                    appMode={appMode}
                    mediaElement={mediaElementRef.current}
                    mediaConfig={mediaConfig}
                  />
                )}

                {modelTab === 'visuals' && (
                  <CharsetThemeBar
                    currentCharset={density}
                    onChangeCharset={setDensity}
                    currentTheme={theme}
                    onChangeTheme={(t) => {
                      setCustomThemeColor('');
                      setGradientConfig(null);
                      setTheme(t);
                    }}
                    customThemeColor={customThemeColor}
                    onChangeCustomColor={(c) => {
                      setGradientConfig(null);
                      setCustomThemeColor(c);
                    }}
                    gradientConfig={gradientConfig}
                    onChangeGradient={(g) => {
                      setCustomThemeColor('');
                      setGradientConfig(g);
                    }}
                    crtConfig={crtConfig}
                    onChangeCrtConfig={setCrtConfig}
                  />
                )}
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
            ? (isModelEdited ? `${activeModelPreset.name} (Edited)` : activeModelPreset.name)
            : appMode === 'media'
            ? (isMediaEdited ? `${activeMediaPreset.name} (Edited)` : activeMediaPreset.name)
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
