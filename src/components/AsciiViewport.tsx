import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, RotateCcw, Copy, ZoomIn, ZoomOut, Maximize2, Edit3, Crop, Settings } from 'lucide-react';
import {
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  OptimizeConfig,
  RasterOutputMode,
  HalftoneConfig,
  DEFAULT_HALFTONE_CONFIG,
} from '../types/ascii';

import { AsciiLoadingSpinner } from './AsciiLoadingSpinner';
import { ViewfinderSettingsModal } from './ViewfinderSettingsModal';
import { drawHalftoneToCanvas } from '../engine/halftoneRenderer';

export interface AsciiViewportHandle {
  setFrame: (
    frameText: string,
    time: number,
    fps: number,
    colors?: Uint8ClampedArray | null,
    bgColor?: string,
    luminance?: Float32Array | null,
    rasterMode?: RasterOutputMode,
    halftoneConfig?: HalftoneConfig
  ) => void;
  getFrameText: () => string;
  autoFit: () => void;
  getOptimalResolution: () => { cols: number; rows: number } | null;
}

interface AsciiViewportProps {
  cols: number;
  rows: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetTime: () => void;
  onStepFrame: () => void;
  onMouseMove: (x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
  presetName: string;
  isEdited?: boolean;
  viewMode?: 'editor' | 'fullscreen';
  onToggleViewMode?: () => void;
  autoRes?: boolean;
  onToggleAutoRes?: () => void;
  onAutoResolutionChange?: (cols: number, rows: number) => void;
  onChangeResolution?: (cols: number, rows: number) => void;
  crtConfig?: CrtConfig;
  onChangeCrtConfig?: (cfg: CrtConfig) => void;
  optimizeConfig?: OptimizeConfig;
  onChangeOptimizeConfig?: (cfg: OptimizeConfig) => void;
  gradientConfig?: PhosphorGradient | null;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  appMode?: 'synth' | 'media' | 'model';

  mediaType?: 'image' | 'video';
  isLoading?: boolean;
  loadingFileName?: string;
  loadingStatusText?: string;
  onOrbitRotate?: (
    prevX: number,
    prevY: number,
    currX: number,
    currY: number,
    width: number,
    height: number
  ) => void;
  onWheelZoom?: (deltaZoom: number) => void;
}

export const AsciiViewport = forwardRef<AsciiViewportHandle, AsciiViewportProps>(({
  cols,
  rows,
  isPlaying,
  onTogglePlay,
  onResetTime,
  onStepFrame,
  onMouseMove,
  onClick,
  presetName,
  isEdited = false,
  viewMode = 'editor',
  onToggleViewMode,
  autoRes = false,
  onToggleAutoRes,
  onAutoResolutionChange,
  onChangeResolution,
  crtConfig,
  onChangeCrtConfig,
  optimizeConfig,
  onChangeOptimizeConfig,
  gradientConfig,
  theme = 'green',
  customThemeColor = '',
  appMode = 'synth',
  mediaType,
  isLoading = false,

  loadingFileName,
  loadingStatusText,
  onOrbitRotate,
  onWheelZoom,
}, ref) => {
  const isTimelineDisabled = appMode === 'media' && mediaType === 'image';
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const bloomPreRef = useRef<HTMLPreElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const timeSpanRef = useRef<HTMLElement>(null);
  const fpsSpanRef = useRef<HTMLElement>(null);
  
  const latestFrameTextRef = useRef<string>('');
  const latestColorsRef = useRef<Uint8ClampedArray | null>(null);
  const latestBgColorRef = useRef<string | undefined>(undefined);
  const latestLuminanceRef = useRef<Float32Array | null>(null);
  const latestRasterModeRef = useRef<RasterOutputMode>('ascii');
  const latestHalftoneConfigRef = useRef<HalftoneConfig>(DEFAULT_HALFTONE_CONFIG);
  
  const [isColoredView, setIsColoredView] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [zoom, setZoom] = useState<number>(1.0);
  const zoomRef = useRef<number>(1.0);
  zoomRef.current = zoom;
  const [copied, setCopied] = useState<boolean>(false);

  const getOptimalResolution = useCallback((): { cols: number; rows: number } | null => {
    if (!containerRef.current) return null;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return null;

    const charWidth = 6.015;
    const charHeight = 10.0;
    const pad = 20;
    const availableWidth = Math.max(80, clientWidth - pad);
    const availableHeight = Math.max(60, clientHeight - pad);
    const windowRatio = availableWidth / availableHeight;
    const charAspectCompensation = charHeight / charWidth; // ~1.6625

    const targetCells = Math.max(2000, Math.min(7500, Math.round((availableWidth * availableHeight) / 95)));

    let bestCols = 100;
    let bestRows = 50;
    let minScore = Infinity;

    const minRows = Math.max(20, Math.min(35, Math.floor(availableHeight / 20)));
    const maxRows = Math.min(80, Math.max(45, Math.floor(availableHeight / 8)));

    for (let r = minRows; r <= maxRows; r++) {
      let c = Math.round(r * windowRatio * charAspectCompensation);
      if (c % 2 !== 0) c += 1;
      if (c < 36 || c > 180) continue;

      const gridVisualWidth = c * charWidth;
      const gridVisualHeight = r * charHeight;
      const gridRatio = gridVisualWidth / gridVisualHeight;

      const ratioMismatch = Math.abs(gridRatio - windowRatio) / windowRatio;
      const cellCount = c * r;
      const densityPenalty = (Math.abs(cellCount - targetCells) / targetCells) * 0.08;

      const score = ratioMismatch + densityPenalty;

      if (score < minScore) {
        minScore = score;
        bestCols = c;
        bestRows = r;
      }
    }

    return { cols: bestCols, rows: bestRows };
  }, []);

  const autoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const charWidth = 6.015;
    const charHeight = 10.0;
    const unscaledWidth = cols * charWidth;
    const unscaledHeight = rows * charHeight;

    const pad = 16;
    const availableWidth = Math.max(10, clientWidth - pad);
    const availableHeight = Math.max(10, clientHeight - pad);

    const scaleX = availableWidth / unscaledWidth;
    const scaleY = availableHeight / unscaledHeight;
    const fitScale = Math.max(0.2, Math.min(5.0, Math.min(scaleX, scaleY)));
    setZoom(Number(fitScale.toFixed(2)));
  }, [cols, rows]);

  const drawCanvas = useCallback(
    (
      frameText: string,
      colors: Uint8ClampedArray | null,
      bgColor: string | undefined,
      luminance: Float32Array | null,
      rasterMode: RasterOutputMode,
      halftoneConfig: HalftoneConfig,
      currentZoom: number
    ) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const charW = 6.015;
      const charH = 10.0;
      const unscaledW = Math.max(1, Math.round(cols * charW));
      const unscaledH = Math.max(1, Math.round(rows * charH));
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

      const targetW = Math.max(1, Math.round(unscaledW * currentZoom * dpr));
      const targetH = Math.max(1, Math.round(unscaledH * currentZoom * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const cssW = `${Math.round(unscaledW * currentZoom)}px`;
      const cssH = `${Math.round(unscaledH * currentZoom)}px`;
      if (canvas.style.width !== cssW) canvas.style.width = cssW;
      if (canvas.style.height !== cssH) canvas.style.height = cssH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const themeHexMap: Record<string, string> = {
        green: '#00ff66',
        amber: '#ffb000',
        cyan: '#00f0ff',
        monochrome: '#f0f0f0',
        blood: '#ff3344',
        paper: '#151515',
      };
      const fgHex = customThemeColor || (gradientConfig ? gradientConfig.color1 : (themeHexMap[theme || 'green'] || '#00ff66'));

      if (rasterMode !== 'ascii' && luminance) {
        drawHalftoneToCanvas({
          canvas,
          ctx,
          cols,
          rows,
          luminance,
          colors,
          bgColor: bgColor || '#0a0a0a',
          fgColor: fgHex,
          config: halftoneConfig,
          mode: rasterMode,
          cellWidth: charW,
          cellHeight: charH,
          dpr: currentZoom * dpr,
        });
      } else if (colors && colors.length > 0) {

        ctx.save();
        ctx.scale(currentZoom * dpr, currentZoom * dpr);
        ctx.fillStyle = bgColor || '#0a0a0a';
        ctx.fillRect(0, 0, unscaledW, unscaledH);
        ctx.font = '10px "JuliaMono", "JetBrains Mono", "Courier New", monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        let curX = 0;
        let curY = 0;
        const len = frameText.length;
        for (let i = 0; i < len; i++) {
          const ch = frameText[i];
          if (ch === '\n') {
            curY++;
            curX = 0;
            continue;
          }
          if (curX < cols && curY < rows) {
            if (ch !== ' ') {
              const cIdx = (curY * cols + curX) * 3;
              const r = colors[cIdx];
              const g = colors[cIdx + 1];
              const b = colors[cIdx + 2];
              ctx.fillStyle = `rgb(${r},${g},${b})`;
              ctx.fillText(ch, curX * charW, curY * charH);
            }
            curX++;
          }
        }
        ctx.restore();
      }
    },
    [cols, rows]
  );

  useEffect(() => {
    if (isColoredView && latestFrameTextRef.current) {
      drawCanvas(
        latestFrameTextRef.current,
        latestColorsRef.current,
        latestBgColorRef.current,
        latestLuminanceRef.current,
        latestRasterModeRef.current,
        latestHalftoneConfigRef.current,
        zoom
      );
    }
  }, [zoom, drawCanvas, isColoredView]);


  useImperativeHandle(ref, () => ({
    setFrame: (
      frameText: string,
      time: number,
      fps: number,
      colors?: Uint8ClampedArray | null,
      bgColor?: string,
      luminance?: Float32Array | null,
      rasterMode: RasterOutputMode = 'ascii',
      halftoneConfig?: HalftoneConfig
    ) => {
      latestFrameTextRef.current = frameText;
      latestColorsRef.current = colors || null;
      latestBgColorRef.current = bgColor;
      latestLuminanceRef.current = luminance || null;
      latestRasterModeRef.current = rasterMode;
      if (halftoneConfig) latestHalftoneConfigRef.current = halftoneConfig;

      const isCanvasMode = Boolean(
        (colors && colors.length > 0) ||
        (rasterMode !== 'ascii' && rasterMode !== 'braille' && luminance)
      );

      if (isCanvasMode) {
        if (!isColoredView) {
          setIsColoredView(true);
        }
        drawCanvas(
          frameText,
          colors || null,
          bgColor,
          luminance || null,
          rasterMode,
          halftoneConfig || latestHalftoneConfigRef.current,
          zoom
        );
      } else {
        if (isColoredView) {
          setIsColoredView(false);
        }
        if (preRef.current) {
          preRef.current.textContent = frameText;
        }
        if (bloomPreRef.current) {
          bloomPreRef.current.textContent = frameText;
        }
      }

      if (timeSpanRef.current) {
        timeSpanRef.current.textContent = `${time.toFixed(2)}s`;
      }
      if (fpsSpanRef.current) {
        fpsSpanRef.current.textContent = `${Math.round(fps)} FPS`;
      }
    },
    getFrameText: () => latestFrameTextRef.current,
    autoFit,
    getOptimalResolution,
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      autoFit();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, autoFit]);

  useEffect(() => {
    if (!autoRes || !containerRef.current || !onAutoResolutionChange) return;
    const el = containerRef.current;
    let resizeTimer: any;

    const runAutoRes = () => {
      const optimal = getOptimalResolution();
      if (optimal) {
        onAutoResolutionChange(optimal.cols, optimal.rows);
        autoFit();
      }
    };

    runAutoRes();

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        runAutoRes();
      }, 120);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [autoRes, getOptimalResolution, onAutoResolutionChange, autoFit]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = preRef.current || containerRef.current;
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (appMode === 'model') {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    } else if (appMode !== 'media') {
      const cx = ((e.clientX - rect.left) / rect.width) * cols;
      const cy = ((e.clientY - rect.top) / rect.height) * rows;
      onClick(cx, cy);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = preRef.current || containerRef.current;
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (appMode === 'model') {
      if (isDraggingRef.current && onOrbitRotate) {
        const prevX = lastPosRef.current.x - rect.left;
        const prevY = lastPosRef.current.y - rect.top;
        const currX = e.clientX - rect.left;
        const currY = e.clientY - rect.top;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        onOrbitRotate(prevX, prevY, currX, currY, rect.width, rect.height);
      }
    } else if (appMode !== 'media') {
      const mouseX = ((e.clientX - rect.left) / rect.width) * cols;
      const mouseY = ((e.clientY - rect.top) / rect.height) * rows;
      if (mouseX >= 0 && mouseX < cols && mouseY >= 0 && mouseY < rows) {
        onMouseMove(mouseX, mouseY);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (appMode === 'model') {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (appMode === 'model' && onWheelZoom) {
      e.preventDefault();
      onWheelZoom(e.deltaY > 0 ? 0.2 : -0.2);
    }
  };

  const copySnapshot = () => {
    const text = latestFrameTextRef.current || preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const showScanlines = crtConfig ? crtConfig.scanlines : true;
  const showCrtGlow = crtConfig && !isColoredView ? (crtConfig.crtGlow ?? (crtConfig.glow ?? false)) : false;
  const showVignette = crtConfig ? crtConfig.vignette : false;
  const showPhosphorBloom = crtConfig && !isColoredView ? (crtConfig.phosphorBloom ?? (crtConfig.glow ?? false)) : false;

  return (
    <div className="viewport-pane">
      {/* Visual Canvas Container */}
      <div
        ref={containerRef}
        className={`viewport-canvas-container ${showCrtGlow ? 'crt-glow-enabled' : ''} ${appMode === 'model' ? 'model-orbit-active' : ''}`}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {showScanlines && <div className="scanline-overlay" />}
        {showVignette && <div className="crt-vignette-overlay" />}
        {/* Hardware-Accelerated Monospace Colored ASCII Canvas */}
        <canvas
          ref={canvasRef}
          className="ascii-canvas"
          style={{
            display: isColoredView ? 'block' : 'none',
          }}
        />

        {/* Directional Phosphor Bloom Underlayer (Character Bloom) */}
        {showPhosphorBloom && !isColoredView && (
          <pre
            ref={bloomPreRef}
            aria-hidden="true"
            className={`ascii-pre ascii-bloom-pre ${gradientConfig ? 'gradient-enabled' : 'single-glow-enabled'}`}
            style={{
              transform: `scale(${zoom})`,
              fontSize: '10px',
              ...(gradientConfig ? ({
                '--text-gradient': `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`,
              } as React.CSSProperties) : {}),
            }}
          />
        )}

        {/* Sharp Foreground ASCII Text */}
        <pre
          ref={preRef}
          className={`ascii-pre ${gradientConfig ? 'gradient-enabled' : ''} ${showPhosphorBloom && !gradientConfig ? 'single-glow-enabled' : ''}`}
          style={{
            display: isColoredView ? 'none' : 'block',
            transform: `scale(${zoom})`,
            fontSize: '10px',
            ...(gradientConfig ? ({
              '--text-gradient': `linear-gradient(${gradientConfig.angle}deg, ${gradientConfig.color1}, ${gradientConfig.color2})`,
            } as React.CSSProperties) : {}),
          }}
        />

        {/* ASCII Loading Spinner Overlay */}
        {isLoading && (
          <AsciiLoadingSpinner fileName={loadingFileName} statusText={loadingStatusText} />
        )}
      </div>

      {/* Bottom Timeline and Diagnostics Bar */}
      <div className="viewport-bottom-bar">
        <div className="status-group">
          {isTimelineDisabled ? (
            <>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Playback disabled for static 2D image"
              >
                <Play size={12} />
                PLAY
              </button>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Step disabled for static 2D image"
              >
                STEP
              </button>
              <button
                className="btn btn-sm"
                disabled
                style={{ opacity: 0.35, cursor: 'not-allowed' }}
                title="Reset disabled for static 2D image"
              >
                <RotateCcw size={12} />
                RESET
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm"
                onClick={onTogglePlay}
                title={isPlaying ? 'Pause Animation (Space)' : 'Play Animation (Space)'}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
              {!isPlaying && (
                <button className="btn btn-sm" onClick={onStepFrame} title="Step 1 Frame">
                  STEP
                </button>
              )}
              <button className="btn btn-sm" onClick={onResetTime} title="Reset Time to 0">
                <RotateCcw size={12} />
                RESET
              </button>
            </>
          )}

          <span className="status-tag">
            FPS: <strong ref={fpsSpanRef}>{isTimelineDisabled ? 'STATIC' : '0'}</strong>
          </span>
          <span className="status-tag">
            T: <strong ref={timeSpanRef}>0s</strong>
          </span>
          <span className="status-tag res-tag">
            RES: <strong>{cols}x{rows}</strong>
          </span>

          {onToggleAutoRes && (
            <button
              className={`btn btn-sm ${autoRes ? 'btn-primary' : ''}`}
              onClick={onToggleAutoRes}
              title={
                autoRes
                  ? 'Auto Resolution is ON (adapts to window/viewfinder size). Click to lock current resolution.'
                  : 'Auto Resolution is OFF (fixed size). Click to toggle Auto Resolution.'
              }
            >
              <Crop size={11} />
              <span className="btn-label-sm">{autoRes ? 'AUTO RES [ON]' : 'AUTO RES'}</span>
            </button>
          )}
        </div>

        <div className="status-group">
          <span className="status-tag mode-tag">
            PRESET: <strong>{presetName}{isEdited ? ' <edited>' : ''}</strong>
          </span>

          <div className="btn-group">
            <button
              className="btn btn-sm"
              onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <button
              className="btn btn-sm"
              onClick={autoFit}
              title="Auto Fit"
            >
              {(zoom * 100).toFixed(0)}%
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.1).toFixed(2))))}
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
          </div>

          <button className="btn btn-sm" onClick={copySnapshot} title="Copy Current Frame">
            <Copy size={12} />
            {copied ? 'COPIED!' : 'SNAP'}
          </button>

          {/* Viewfinder Display & Performance Settings Button */}
          {crtConfig && optimizeConfig && onChangeCrtConfig && onChangeOptimizeConfig && (
            <button
              className={`btn btn-sm ${isSettingsOpen ? 'btn-primary' : ''}`}
              onClick={() => setIsSettingsOpen(true)}
              title="Viewfinder Display & Performance Settings"
            >
              <Settings size={12} />
              <span className="btn-label-sm">SETTINGS</span>
            </button>
          )}

          {onToggleViewMode && (
            <button
              className={`btn btn-sm ${viewMode === 'fullscreen' ? 'btn-primary' : ''}`}
              onClick={onToggleViewMode}
              title={viewMode === 'fullscreen' ? 'Return to Edit Mode' : 'Fullscreen Viewfinder'}
            >
              {viewMode === 'fullscreen' ? (
                <>
                  <Edit3 size={12} />
                  <span className="btn-label-sm">EDIT</span>
                </>
              ) : (
                <Maximize2 size={12} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Viewfinder & Hardware Settings Modal */}
      {crtConfig && optimizeConfig && onChangeCrtConfig && onChangeOptimizeConfig && (
        <ViewfinderSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          crtConfig={crtConfig}
          onChangeCrtConfig={onChangeCrtConfig}
          optimizeConfig={optimizeConfig}
          onChangeOptimizeConfig={onChangeOptimizeConfig}
          onChangeResolution={onChangeResolution}
          isStaticImage={isTimelineDisabled}
          isContentColorActive={isColoredView}
        />
      )}
    </div>
  );
});
