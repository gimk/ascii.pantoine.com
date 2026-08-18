import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  WaveParams,
  Preset,
  PhosphorTheme,
  TrailPoint,
  ParticleConfig,
  OptimizeConfig,
  CrtConfig,
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
  Dices,
  Bot,
} from 'lucide-react';

const LOCAL_STORAGE_PRESETS_KEY = 'ascii_builder_user_presets';

interface HistorySnapshot {
  waveParams: WaveParams;
  customCode: string;
  customPrepare?: string;
  presetName: string;
  presetType?: 'parametric' | 'custom';
}

export const App: React.FC = () => {
  // Decode URL state on initialization if present
  const initialUrlData = useMemo(() => decodeShareFromUrl(), []);
  const sharedState = initialUrlData.state;

  // Preset & Configuration State
  const [activePreset, setActivePreset] = useState<Preset>(() => {
    if (sharedState?.name) {
      const match = PRESETS.find((p) => p.name.toLowerCase() === sharedState.name.toLowerCase());
      if (match) return match;
      return {
        id: `shared-${Date.now()}`,
        name: sharedState.name,
        description: 'Shared ASCII animation',
        type: sharedState.type || 'parametric',
        params: sharedState.params,
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

  // Display & Resolution
  const [cols, setCols] = useState<number>(sharedState?.cols || 100);
  const [rows, setRows] = useState<number>(sharedState?.rows || 50);
  const [density, setDensity] = useState<string>(sharedState?.density || CHARSETS[0].chars);
  const [theme, setTheme] = useState<PhosphorTheme>(sharedState?.theme || 'green');
  const [customThemeColor, setCustomThemeColor] = useState<string>(sharedState?.customThemeColor || '');

  // CRT Display Effects
  const [crtConfig, setCrtConfig] = useState<CrtConfig>(() => ({
    scanlines: sharedState?.crtConfig?.scanlines ?? true,
    glow: sharedState?.crtConfig?.glow ?? false,
    vignette: sharedState?.crtConfig?.vignette ?? false,
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
  const [activeTab, setActiveTab] = useState<'presets' | 'synth' | 'particles' | 'optimize' | 'visuals'>('presets');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [exportInitialTab, setExportInitialTab] = useState<'prompt' | 'astro' | 'html' | 'json' | 'ascii'>('prompt');
  const [isRandomizing, setIsRandomizing] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<Preset[]>([]);

  // Undo / Redo History Stack
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const historyDebounceTimer = useRef<any>(null);

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

  const updateHistoryButtons = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const pushHistorySnapshot = useCallback(
    (
      params: WaveParams,
      code: string,
      name: string,
      prepare?: string,
      type?: 'parametric' | 'custom'
    ) => {
      const nextIndex = historyIndexRef.current + 1;
      const newHistory = historyRef.current.slice(0, nextIndex);
      newHistory.push({
        waveParams: { ...params },
        customCode: code,
        customPrepare: prepare || '',
        presetName: name,
        presetType: type || 'parametric',
      });
      if (newHistory.length > 50) newHistory.shift();
      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;
      updateHistoryButtons();
    },
    []
  );

  // Initialize first history entry
  useEffect(() => {
    if (historyRef.current.length === 0) {
      const initialCode = generateFormulaCode(DEFAULT_WAVE_PARAMS);
      historyRef.current = [
        {
          waveParams: { ...DEFAULT_WAVE_PARAMS },
          customCode: initialCode,
          customPrepare: '',
          presetName: PRESETS[0].name,
          presetType: 'parametric',
        },
      ];
      historyIndexRef.current = 0;
      updateHistoryButtons();
    }
  }, []);

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

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setWaveParams({ ...snapshot.waveParams });
      setCustomCode(snapshot.customCode);
      setCustomPrepare(snapshot.customPrepare || '');
      setPresetType(snapshot.presetType || 'parametric');
      recompileCustomCode(snapshot.customCode, snapshot.customPrepare);
      updateHistoryButtons();
    }
  }, [recompileCustomCode]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setWaveParams({ ...snapshot.waveParams });
      setCustomCode(snapshot.customCode);
      setCustomPrepare(snapshot.customPrepare || '');
      setPresetType(snapshot.presetType || 'parametric');
      recompileCustomCode(snapshot.customCode, snapshot.customPrepare);
      updateHistoryButtons();
    }
  }, [recompileCustomCode]);

  // Load user presets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PRESETS_KEY);
      if (saved) {
        setUserPresets(JSON.parse(saved));
      }
    } catch {
      // LocalStorage error ignored
    }
  }, []);

  // Update theme class and custom color CSS variables on body
  useEffect(() => {
    if (customThemeColor) {
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
        const bgPrimary = `rgb(${Math.max(2, Math.round(r * 0.035 + 2))}, ${Math.max(2, Math.round(g * 0.035 + 2))}, ${Math.max(2, Math.round(b * 0.035 + 2))})`;
        const bgPanel = `rgb(${Math.max(5, Math.round(r * 0.06 + 5))}, ${Math.max(5, Math.round(g * 0.06 + 5))}, ${Math.max(5, Math.round(b * 0.06 + 5))})`;
        const bgControl = `rgb(${Math.max(10, Math.round(r * 0.11 + 9))}, ${Math.max(10, Math.round(g * 0.11 + 9))}, ${Math.max(10, Math.round(b * 0.11 + 9))})`;
        const bgControlHover = `rgb(${Math.max(16, Math.round(r * 0.16 + 14))}, ${Math.max(16, Math.round(g * 0.16 + 14))}, ${Math.max(16, Math.round(b * 0.16 + 14))})`;
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
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.2)`);
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
        document.body.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.12)`);
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
      ];
      vars.forEach((v) => document.body.style.removeProperty(v));
    }
  }, [theme, customThemeColor]);

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

    if (preset.crtConfig) {
      setCrtConfig({ ...preset.crtConfig });
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

    clearTimeout(historyDebounceTimer.current);
    historyDebounceTimer.current = setTimeout(() => {
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

    clearTimeout(historyDebounceTimer.current);
    historyDebounceTimer.current = setTimeout(() => {
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

  // Fun Randomizer Handler
  const handleRandomize = useCallback(() => {
    setIsRandomizing(true);
    setTimeout(() => setIsRandomizing(false), 400);

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
  }, [recompileCustomCode, pushHistorySnapshot]);

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
      const frameText = renderAsciiFrame({
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
        setIsPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'r' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleRandomize();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleRandomize]);

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

  // Complete snapshot of the current animation state for sharing / deep-linking
  const currentFullState: FullAnimationState = useMemo(
    () => ({
      name: isEdited ? `${activePreset.name} (Edited)` : activePreset.name,
      type: presetType,
      params: waveParams,
      customCode: presetType === 'custom' ? customCode : undefined,
      customPrepare: presetType === 'custom' ? customPrepare : undefined,
      density,
      theme,
      customThemeColor: customThemeColor || undefined,
      cols,
      rows,
      autoRes,
      particleConfig,
      optimizeConfig,
      crtConfig,
    }),
    [
      activePreset.name,
      isEdited,
      presetType,
      waveParams,
      customCode,
      customPrepare,
      density,
      theme,
      customThemeColor,
      cols,
      rows,
      autoRes,
      particleConfig,
      optimizeConfig,
      crtConfig,
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
              <span className="brand-full">
                <span className="brand-word">ASCII</span> <span className="brand-sub">ANIMATION BUILDER</span>
              </span>
              <span className="brand-short">A.A.B</span>
            </div>
          </div>
          <span className="brand-badge">v1.1</span>
        </div>

        {/* Header Tools: Randomize, Undo, Redo, AI Prompt, Export, Share */}
        <div className="header-actions">
          <button
            className="btn btn-randomize btn-sm"
            onClick={handleRandomize}
            title="Randomize animation, theme & charset (Press R)"
          >
            <Dices size={14} className={`header-btn-icon ${isRandomizing ? 'dice-spin' : ''}`} />
            <span className="btn-label">RANDOMIZE</span>
          </button>

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
            className="btn btn-sm"
            onClick={() => {
              setExportInitialTab('prompt');
              setIsExportOpen(true);
            }}
            title="Export as standardized prompt for AI (Claude, ChatGPT, Gemini, etc.)"
          >
            <Bot size={13} className="header-btn-icon" />
            <span className="btn-label">AI PROMPT</span>
          </button>

          <button
            className="btn btn-sm"
            onClick={() => {
              setExportInitialTab('astro');
              setIsExportOpen(true);
            }}
            title="Download or Export Code (Astro / HTML / JSON / Frame)"
          >
            <Download size={13} className="header-btn-icon" />
            <span className="btn-label">EXPORT</span>
          </button>

          <button
            className="btn btn-sm"
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
          presetName={activePreset.name}
          isEdited={isEdited}
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
        />

        {/* Right Sidebar Control Panel */}
        {viewMode === 'editor' && (
          <div className="sidebar-pane">
            {/* Tabs */}
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
                PARTICLES
              </button>
              <button
                className={`tab-btn ${activeTab === 'optimize' ? 'active' : ''}`}
                onClick={() => setActiveTab('optimize')}
                title="Performance Profiles & CPU Optimization"
              >
                <Cpu size={11} style={{ display: 'inline', marginRight: '4px' }} />
                OPTIMIZE
              </button>
              <button
                className={`tab-btn ${activeTab === 'visuals' ? 'active' : ''}`}
                onClick={() => setActiveTab('visuals')}
                title="Charsets & Color Themes"
              >
                <Palette size={11} style={{ display: 'inline', marginRight: '4px' }} />
                THEME
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

            {activeTab === 'optimize' && (
              <OptimizeControls
                config={optimizeConfig}
                onChangeConfig={setOptimizeConfig}
                cols={cols}
                rows={rows}
                onChangeResolution={handleManualResolutionChange}
                autoRes={autoRes}
                onToggleAutoRes={handleToggleAutoRes}
              />
            )}

            {activeTab === 'visuals' && (
              <CharsetThemeBar
                currentCharset={density}
                onChangeCharset={setDensity}
                currentTheme={theme}
                onChangeTheme={(t) => {
                  setCustomThemeColor('');
                  setTheme(t);
                }}
                customThemeColor={customThemeColor}
                onChangeCustomColor={setCustomThemeColor}
                crtConfig={crtConfig}
                onChangeCrtConfig={setCrtConfig}
              />
            )}
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        name={isEdited ? `${activePreset.name} (Edited)` : activePreset.name}
        type={presetType}
        params={waveParams}
        customCode={customCode}
        customPrepare={customPrepare}
        particleConfig={particleConfig}
        optimizeConfig={optimizeConfig}
        cols={cols}
        rows={rows}
        density={density}
        currentAsciiFrame={viewportRef.current?.getFrameText() || ''}
        initialTab={exportInitialTab}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        state={currentFullState}
      />
    </div>
  );
};
