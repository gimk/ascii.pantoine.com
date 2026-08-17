import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Copy, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface AsciiViewportProps {
  asciiOutput: string;
  cols: number;
  rows: number;
  fps: number;
  time: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetTime: () => void;
  onStepFrame: () => void;
  onMouseMove: (x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
  presetName: string;
  isEdited?: boolean;
  targetFps?: number;
}

export const AsciiViewport: React.FC<AsciiViewportProps> = ({
  asciiOutput,
  cols,
  rows,
  fps,
  time,
  isPlaying,
  onTogglePlay,
  onResetTime,
  onStepFrame,
  onMouseMove,
  onClick,
  presetName,
  isEdited,
  targetFps,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Auto-fit zoom based on viewport dimensions
  const autoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const neededWidth = cols * 6.5;
    const neededHeight = rows * 10.5;

    const scaleX = (clientWidth * 0.9) / neededWidth;
    const scaleY = (clientHeight * 0.9) / neededHeight;
    const fitScale = Math.max(0.4, Math.min(2.5, Math.min(scaleX, scaleY)));
    setZoom(Number(fitScale.toFixed(2)));
  }, [cols, rows]);

  // Initial auto-fit only once on mount
  const hasInitialFit = useRef(false);
  useEffect(() => {
    if (!hasInitialFit.current && containerRef.current) {
      hasInitialFit.current = true;
      autoFit();
    }
  }, [autoFit]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      // Keep existing zoom on window resize unless requested
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    navigator.clipboard.writeText(asciiOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
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
        >
          {asciiOutput}
        </pre>
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
            FPS: <strong>{fps}</strong>{targetFps && targetFps > 0 ? ` (${targetFps})` : ''}
          </span>
          <span className="status-tag">
            T: <strong>{time.toFixed(2)}s</strong>
          </span>
          <span className="status-tag res-tag">
            RES: <strong>{cols}x{rows}</strong>
          </span>
        </div>

        <div className="status-group">
          <span className="status-tag mode-tag">
            MODE: <strong>{presetName}{isEdited ? ' <edited>' : ''}</strong>
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

          <button
            className={`btn btn-sm ${isFullscreen ? 'btn-primary' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
