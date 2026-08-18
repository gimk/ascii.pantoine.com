import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  WaveParams,
  Preset,
  PhosphorTheme,
  TrailPoint,
  ParticleConfig,
  OptimizeConfig,
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
import { generateRandomAnimation } from './engine/randomizer';

import {
  Sliders,
  Sparkles,
  Palette,
  Share2,
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
  presetName: string;
}

export const App: React.FC = () => {
  // Preset & Configuration State
  const [activePreset, setActivePreset] = useState<Preset>(PRESETS[0]);
  const [presetType, setPresetType] = useState<'parametric' | 'custom'>('parametric');
  const [waveParams, setWaveParams] = useState<WaveParams>({
    ...DEFAULT_WAVE_PARAMS,
    ...(PRESETS[0].params || {}),
  });

  // Custom Code State
  const [customCode, setCustomCode] = useState<string>(
    generateFormulaCode({ ...DEFAULT_WAVE_PARAMS, ...(PRESETS[0].params || {}) })
  );
  const [customPrepare, setCustomPrepare] = useState<string>('');
  const [compileError, setCompileError] = useState<string | null>(null);
  const compiledFnRef = useRef<any>(null);
  const prepareFnRef = useRef<any>(null);
  const customContextRef = useRef<Record<string, any>>({});

  // Display & Resolution
  const [cols, setCols] = useState<number>(100);
  const [rows, setRows] = useState<number>(50);
  const [density, setDensity] = useState<string>(CHARSETS[0].chars);
  const [theme, setTheme] = useState<PhosphorTheme>('green');

  // Particles & Interaction
  const [particleConfig, setParticleConfig] = useState<ParticleConfig>(DEFAULT_PARTICLE_CONFIG);
  const trailPointsRef = useRef<TrailPoint[]>([]);

  // Optimization & Performance Config
  const [optimizeConfig, setOptimizeConfig] = useState<OptimizeConfig>({
    targetFps: 60,
    pauseWhenHidden: true,
    idleThrottle: false,
  });

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
    const base = activePreset.params || DEFAULT_WAVE_PARAMS;
    const keys = Object.keys(DEFAULT_WAVE_PARAMS) as (keyof WaveParams)[];
    for (const k of keys) {
      if (waveParams[k] !== base[k]) return true;
    }
    return false;
  }, [activePreset, waveParams]);

  const updateHistoryButtons = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const pushHistorySnapshot = useCallback((params: WaveParams, code: string, name: string) => {
    const nextIndex = historyIndexRef.current + 1;
    const newHistory = historyRef.current.slice(0, nextIndex);
    newHistory.push({
      waveParams: { ...params },
      customCode: code,
      presetName: name,
    });
    if (newHistory.length > 50) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    updateHistoryButtons();
  }, []);

  // Initialize first history entry
  useEffect(() => {
    if (historyRef.current.length === 0) {
      const initialCode = generateFormulaCode(DEFAULT_WAVE_PARAMS);
      historyRef.current = [{
        waveParams: { ...DEFAULT_WAVE_PARAMS },
        customCode: initialCode,
        presetName: PRESETS[0].name,
      }];
      historyIndexRef.current = 0;
      updateHistoryButtons();
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setWaveParams({ ...snapshot.waveParams });
      setCustomCode(snapshot.customCode);
      const res = compileCustomCode(snapshot.customCode, '');
      compiledFnRef.current = res.fn;
      updateHistoryButtons();
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setWaveParams({ ...snapshot.waveParams });
      setCustomCode(snapshot.customCode);
      const res = compileCustomCode(snapshot.customCode, '');
      compiledFnRef.current = res.fn;
      updateHistoryButtons();
    }
  }, []);

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

  // Update theme class on body
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

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

  // Handle Preset Selection
  const handleSelectPreset = (preset: Preset) => {
    setActivePreset(preset);
    setPresetType('parametric');

    if (preset.densityCharset) {
      setDensity(preset.densityCharset);
    }

    const newParams: WaveParams = {
      ...DEFAULT_WAVE_PARAMS,
      ...(preset.params || {}),
    };
    setWaveParams(newParams);

    const formula = generateFormulaCode(newParams);
    setCustomCode(formula);
    setCustomPrepare('');
    recompileCustomCode(formula, '');

    pushHistorySnapshot(newParams, formula, preset.name);
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
      pushHistorySnapshot(updated, formula, activePreset.name);
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
      pushHistorySnapshot(parsed, newCode, isDivergent ? 'Custom Formula' : activePreset.name);
    }, 600);
  };

  const handleOverrideFormulaWithSliders = () => {
    const pureFormula = generateFormulaCode(waveParams);
    setCustomCode(pureFormula);
    setCustomPrepare('');
    setPresetType('parametric');
    recompileCustomCode(pureFormula, '');
    pushHistorySnapshot(waveParams, pureFormula, activePreset.name);
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
    };
    setActivePreset(randomPreset);
    pushHistorySnapshot(randomized.params, formula, randomized.name);
  }, [recompileCustomCode, pushHistorySnapshot]);

  // Save Custom User Preset
  const handleSaveCustomPreset = (name: string) => {
    const newPreset: Preset = {
      id: `user-${Date.now()}`,
      name,
      description: `Custom preset created on ${new Date().toLocaleDateString()}`,
      type: presetType,
      params: { ...waveParams },
      customCode: presetType === 'custom' ? customCode : undefined,
      customPrepare: presetType === 'custom' ? customPrepare : undefined,
      densityCharset: density,
    };

    const updated = [newPreset, ...userPresets];
    setUserPresets(updated);
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

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-title">
          <span className="brand-logo" style={{ color: 'var(--accent)' }}>▓▒░</span>
          <div className="brand-text-block">
            <div className="brand-main">
              <span className="brand-word">ASCII</span> <span className="brand-sub">ANIMATION BUILDER</span>
            </div>
          </div>
          <span className="brand-badge">v1.0</span>
        </div>

        {/* Header Tools: Randomize, Undo, Redo, Export */}
        <div className="header-actions">
          <button
            className="btn btn-randomize btn-sm"
            onClick={handleRandomize}
            title="Randomize animation, theme & charset (Press R)"
          >
            <Dices size={14} className={`header-btn-icon ${isRandomizing ? 'dice-spin' : ''}`} />
            <span className="btn-label">RANDOMIZE</span>
          </button>

          <button
            className="btn btn-sm header-btn-undo"
            onClick={handleUndo}
            disabled={!canUndo}
            style={{ opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'not-allowed' }}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={13} className="header-btn-icon" />
            <span className="btn-label">UNDO</span>
          </button>
          <button
            className="btn btn-sm header-btn-redo"
            onClick={handleRedo}
            disabled={!canRedo}
            style={{ opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'not-allowed' }}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
          >
            <Redo2 size={13} className="header-btn-icon" />
            <span className="btn-label">REDO</span>
          </button>

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
            className="btn btn-primary btn-sm"
            onClick={() => {
              setExportInitialTab('astro');
              setIsExportOpen(true);
            }}
            title="Export to Astro or Standalone HTML"
          >
            <Share2 size={13} className="header-btn-icon" />
            <span className="btn-label">EXPORT CODE</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="main-workspace">
        {/* Left / Center Viewport */}
        <AsciiViewport
          ref={viewportRef}
          cols={cols}
          rows={rows}
          onInitResolution={(initCols, initRows) => {
            setCols(initCols);
            setRows(initRows);
          }}
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
        />

        {/* Right Sidebar Control Panel */}
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
              onChangeResolution={(c, r) => {
                setCols(c);
                setRows(r);
              }}
            />
          )}

          {activeTab === 'visuals' && (
            <CharsetThemeBar
              currentCharset={density}
              onChangeCharset={setDensity}
              currentTheme={theme}
              onChangeTheme={setTheme}
            />
          )}
        </div>
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
    </div>
  );
};
