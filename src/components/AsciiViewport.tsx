import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, RotateCcw, Copy, ZoomIn, ZoomOut, Maximize2, Edit3 } from 'lucide-react';

export interface AsciiViewportHandle {
  setFrame: (frameText: string, time: number, fps: number) => void;
  getFrameText: () => string;
  autoFit: () => void;
  getOptimalResolution: () => { cols: number; rows: number } | null;
}

interface AsciiViewportProps {
  cols: number;
  rows: number;
  onInitResolution?: (cols: number, rows: number, zoom: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetTime: () => void;
  onStepFrame: () => void;
  onMouseMove: (x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
  presetName: string;
  isEdited?: boolean;
  targetFps?: number;
  viewMode?: 'editor' | 'fullscreen';
  onToggleViewMode?: () => void;
}

export const AsciiViewport = forwardRef<AsciiViewportHandle, AsciiViewportProps>(({
  cols,
  rows,
  onInitResolution,
  isPlaying,
  onTogglePlay,
  onResetTime,
  onStepFrame,
  onMouseMove,
  onClick,
  presetName,
  isEdited,
  targetFps,
  viewMode = 'editor',
  onToggleViewMode,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const timeSpanRef = useRef<HTMLElement>(null);
  const fpsSpanRef = useRef<HTMLElement>(null);
  const latestFrameTextRef = useRef<string>('');
  const hasInitializedResolution = useRef<boolean>(false);

  const [zoom, setZoom] = useState<number>(1.0);
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

  useImperativeHandle(ref, () => ({
    setFrame: (frameText: string, time: number, fps: number) => {
      latestFrameTextRef.current = frameText;
      if (preRef.current) {
        preRef.current.textContent = frameText;
      }
      if (timeSpanRef.current) {
        timeSpanRef.current.textContent = `${time.toFixed(2)}s`;
      }
      if (fpsSpanRef.current) {
        fpsSpanRef.current.textContent = `${fps}`;
      }
    },
    getFrameText: () => latestFrameTextRef.current || '',
    autoFit,
    getOptimalResolution,
  }));

  // Auto-fit zoom on demand based on current cols and rows
  const autoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    // Font character metrics at 10px font-size with 1.0 line-height:
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

  // Trigger autoFit when switching view mode
  useEffect(() => {
    const timer = setTimeout(() => {
      autoFit();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, autoFit]);

  // Once on page load: inspect the viewfinder ratio, find the best matching
  // (cols, rows) pair that matches that aspect ratio, and zoom to fit the space
  useEffect(() => {
    if (hasInitializedResolution.current) return;

    const measureAndInit = () => {
      if (hasInitializedResolution.current || !containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth <= 0 || clientHeight <= 0) {
        requestAnimationFrame(measureAndInit);
        return;
      }

      hasInitializedResolution.current = true;

      if (!onInitResolution) {
        // When onInitResolution is omitted (e.g. shared animation with specific size),
        // preserve the specified cols and rows and only auto-fit the zoom.
        autoFit();
        return;
      }

      const charWidth = 6.015;
      const charHeight = 10.0;
      const pad = 20;
      const availableWidth = Math.max(80, clientWidth - pad);
      const availableHeight = Math.max(60, clientHeight - pad);
      const windowRatio = availableWidth / availableHeight;
      const charAspectCompensation = charHeight / charWidth; // ~1.6625

      // Target density based on container dimensions
      const targetCells = Math.max(2000, Math.min(7500, Math.round((availableWidth * availableHeight) / 95)));

      let bestCols = 100;
      let bestRows = 50;
      let minScore = Infinity;

      // Candidate row counts to explore
      const minRows = Math.max(20, Math.min(35, Math.floor(availableHeight / 20)));
      const maxRows = Math.min(80, Math.max(45, Math.floor(availableHeight / 8)));

      for (let r = minRows; r <= maxRows; r++) {
        let c = Math.round(r * windowRatio * charAspectCompensation);
        if (c % 2 !== 0) c += 1;
        if (c < 36 || c > 180) continue;

        const gridVisualWidth = c * charWidth;
        const gridVisualHeight = r * charHeight;
        const gridRatio = gridVisualWidth / gridVisualHeight;

        // Ratio error relative to available window ratio
        const ratioMismatch = Math.abs(gridRatio - windowRatio) / windowRatio;

        // Density preference (steers towards comfortable visual cell density)
        const cellCount = c * r;
        const densityPenalty = Math.abs(cellCount - targetCells) / targetCells * 0.08;

        const score = ratioMismatch + densityPenalty;

        if (score < minScore) {
          minScore = score;
          bestCols = c;
          bestRows = r;
        }
      }

      // Calculate the zoom factor to fit the entire space
      const scaleX = availableWidth / (bestCols * charWidth);
      const scaleY = availableHeight / (bestRows * charHeight);
      const fitZoom = Number(Math.max(0.3, Math.min(3.5, Math.min(scaleX, scaleY))).toFixed(2));

      setZoom(fitZoom);
      if (onInitResolution) {
        onInitResolution(bestCols, bestRows, fitZoom);
      }
    };

    measureAndInit();
  }, [onInitResolution]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = preRef.current || containerRef.current;
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const mouseX = ((e.clientX - rect.left) / rect.width) * cols;
    const mouseY = ((e.clientY - rect.top) / rect.height) * rows;
    if (mouseX >= 0 && mouseX < cols && mouseY >= 0 && mouseY < rows) {
      onMouseMove(mouseX, mouseY);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = preRef.current || containerRef.current;
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const cx = ((e.clientX - rect.left) / rect.width) * cols;
    const cy = ((e.clientY - rect.top) / rect.height) * rows;
    onClick(cx, cy);
  };

  const copySnapshot = () => {
    const text = latestFrameTextRef.current || preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="viewport-pane">
      {/* Visual Canvas Container */}
      <div
        ref={containerRef}
        className="viewport-canvas-container"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
      >
        <div className="scanline-overlay" />
        <pre
          ref={preRef}
          className="ascii-pre"
          style={{
            transform: `scale(${zoom})`,
            fontSize: '10px',
          }}
        />
      </div>

      {/* Bottom Timeline and Diagnostics Bar */}
      <div className="viewport-bottom-bar">
        <div className="status-group">
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

          <span className="status-tag">
            FPS: <strong ref={fpsSpanRef}>0</strong>{targetFps && targetFps > 0 ? ` (${targetFps})` : ''}
          </span>
          <span className="status-tag">
            T: <strong ref={timeSpanRef}>0.00s</strong>
          </span>
          <span className="status-tag res-tag">
            RES: <strong>{cols}x{rows}</strong>
          </span>
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
    </div>
  );
});
