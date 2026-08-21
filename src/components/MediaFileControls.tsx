import React, { useRef, useState, useEffect } from 'react';
import { MediaConfig, MediaViewConfig } from '../types/ascii';
import { MediaViewControls } from './MediaViewControls';
import {
  Upload,
  Image as ImageIcon,
  Video,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  ZoomIn,
  Move,
  Link2,
  ClipboardPaste,
  Film,
} from 'lucide-react';

interface MediaFileControlsProps {
  config: MediaConfig;
  onChangeConfig: (cfg: MediaConfig) => void;
  viewConfig?: MediaViewConfig;
  onChangeViewConfig?: (cfg: MediaViewConfig) => void;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  onFileUpload: (file: File) => void;
  onUrlLoad: (url: string) => void;
  onResetViewDefaults?: () => void;
}

export const MediaFileControls: React.FC<MediaFileControlsProps> = ({
  config,
  onChangeConfig,
  viewConfig,
  onChangeViewConfig,
  mediaElement,
  onFileUpload,
  onUrlLoad,
  onResetViewDefaults,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const isVideo = mediaElement instanceof HTMLVideoElement;

  // Track video progress if source is HTMLVideoElement
  useEffect(() => {
    if (!isVideo || !mediaElement) return;
    const video = mediaElement;

    const handleTimeUpdate = () => {
      setVideoCurrentTime(video.currentTime);
      setVideoDuration(video.duration || 0);
    };

    const handlePlay = () => setIsVideoPlaying(true);
    const handlePause = () => setIsVideoPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleTimeUpdate);

    setIsVideoPlaying(!video.paused);
    setVideoCurrentTime(video.currentTime);
    setVideoDuration(video.duration || 0);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleTimeUpdate);
    };
  }, [isVideo, mediaElement]);

  const update = <K extends keyof MediaConfig>(key: K, val: MediaConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onUrlLoad(urlInput.trim());
    setUrlInput('');
  };

  const toggleVideoPlayback = () => {
    if (!isVideo || !mediaElement) return;
    if (mediaElement.paused) {
      mediaElement.play();
    } else {
      mediaElement.pause();
    }
  };

  const handleSeek = (time: number) => {
    if (!isVideo || !mediaElement) return;
    mediaElement.currentTime = time;
    setVideoCurrentTime(time);
  };

  const handlePlaybackSpeed = (speed: number) => {
    update('playbackSpeed', speed);
    if (isVideo && mediaElement) {
      mediaElement.playbackRate = speed;
    }
  };

  const rotateBy = (deg: number) => {
    let newRot = (config.rotation + deg) % 360;
    if (newRot < 0) newRot += 360;
    update('rotation', newRot);
  };

  const resetTransforms = () => {
    onChangeConfig({
      ...config,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
      fit: 'contain',
    });
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="tab-content">
      {/* 0. High-Visibility Clipboard Paste Hero Banner */}
      <div
        className="control-section"
        style={{
          background: 'rgba(0, 255, 102, 0.05)',
          border: '1.5px solid var(--accent)',
          borderRadius: '4px',
          padding: '12px 14px',
          marginBottom: '12px',
          boxShadow: '0 0 12px rgba(0, 255, 102, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ClipboardPaste size={15} color="var(--accent)" />
            <span style={{ fontWeight: 800, fontSize: '11.5px', letterSpacing: '0.04em', color: 'var(--accent)' }}>
              INSTANT CLIPBOARD PASTE
            </span>
          </div>
          <span
            style={{
              padding: '2px 7px',
              background: 'var(--accent)',
              color: '#000',
              fontWeight: 800,
              fontSize: '10px',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}
          >
            {typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? '⌘ + V' : 'CTRL + V'}
          </span>
        </div>

        <p style={{ fontSize: '10.5px', color: 'var(--text-primary)', lineHeight: 1.45, marginBottom: '8px' }}>
          Copy any image, screenshot, or graphic to your clipboard, then press <strong style={{ color: 'var(--accent)' }}>{typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? 'Cmd+V' : 'Ctrl+V'}</strong> anywhere to rasterize it instantly.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ width: '100%', justifyContent: 'center', padding: '6px 10px', fontSize: '11px', fontWeight: 700 }}
          onClick={async () => {
            try {
              if (navigator.clipboard && navigator.clipboard.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  for (const type of item.types) {
                    if (type.startsWith('image/')) {
                      const blob = await item.getType(type);
                      const file = new File([blob], `clipboard-paste-${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
                      onFileUpload(file);
                      return;
                    }
                  }
                }
              }
            } catch {
              // Browser permission might require shortcut Cmd+V
            }
          }}
          title="Paste image directly from clipboard (or press Cmd+V / Ctrl+V)"
        >
          <ClipboardPaste size={13} />
          PASTE FROM CLIPBOARD ({typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '') ? '⌘V' : 'Ctrl+V'})
        </button>
      </div>

      {/* 1. File Upload & Source Dropzone */}
      <div className="control-section">
        <div className="section-header">
          <span>Or Import From File / URL</span>
          <Upload size={12} />
        </div>

        <div
          className={`model-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ minHeight: '85px', padding: '12px 10px' }}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,.gif,.svg"
            onChange={handleFileInputChange}
          />
          {config.mediaType === 'video' ? (
            <Video size={22} color="var(--accent)" style={{ marginBottom: '6px' }} />
          ) : (
            <ImageIcon size={22} color="var(--accent)" style={{ marginBottom: '6px' }} />
          )}
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
            DROP IMAGE OR VIDEO HERE
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
            PNG, JPG, WebP, GIF, SVG, MP4, WebM, MOV or click to browse
          </div>
        </div>

        {/* Current File Info */}
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'var(--bg-control)',
            border: '1px solid var(--border-color)',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
            {config.mediaType === 'video' ? <Film size={12} color="var(--accent)" /> : <ImageIcon size={12} color="var(--accent)" />}
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {config.fileName || 'Active Media File'}
            </span>
          </div>
          <span className="brand-version" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
            {config.sourceType}
          </span>
        </div>

        {/* URL Import */}
        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <input
            type="text"
            className="number-input"
            style={{ flex: 1, textAlign: 'left', padding: '4px 6px', fontSize: '10.5px' }}
            placeholder="Load media from URL (http://...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button type="submit" className="btn btn-sm">
            <Link2 size={11} />
            LOAD
          </button>
        </form>
      </div>

      {/* 2. Video Playback & Timeline Controls (if video source) */}
      {isVideo && (
        <div className="control-section">
          <div className="section-header">
            <span>Video Playback</span>
            <Film size={12} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <button className="btn btn-primary btn-sm" onClick={toggleVideoPlayback}>
              {isVideoPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isVideoPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            <button
              className={`btn btn-sm ${config.loop ? 'btn-primary' : ''}`}
              onClick={() => {
                const nextLoop = !config.loop;
                update('loop', nextLoop);
                if (mediaElement) mediaElement.loop = nextLoop;
              }}
            >
              LOOP {config.loop ? '[ON]' : '[OFF]'}
            </button>

            <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
            </div>
          </div>

          {/* Timeline scrubber */}
          <div className="control-row">
            <span className="control-label" style={{ flex: 'none', width: '50px' }}>Timeline</span>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={videoDuration || 100}
              step={0.05}
              value={videoCurrentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
            />
          </div>

          {/* Playback speed */}
          <div className="control-row" style={{ marginTop: '6px' }}>
            <span className="control-label">Speed</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                <button
                  key={spd}
                  className={`btn btn-sm ${config.playbackSpeed === spd ? 'btn-primary' : ''}`}
                  onClick={() => handlePlaybackSpeed(spd)}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Transform & Framing Controls */}
      <div className="control-section">
        <div className="section-header">
          <span>Transform & Framing</span>
          <Maximize2 size={12} />
        </div>

        {/* Fit Mode */}
        <div className="control-row">
          <span className="control-label">Fit Mode</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {[
              { id: 'contain', label: 'CONTAIN' },
              { id: 'cover', label: 'COVER' },
              { id: 'stretch', label: 'STRETCH' },
              { id: 'original', label: '1:1' },
            ].map((m) => (
              <button
                key={m.id}
                className={`btn btn-sm ${config.fit === m.id ? 'btn-primary' : ''}`}
                onClick={() => update('fit', m.id as any)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scale / Zoom */}
        <div className="control-row">
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ZoomIn size={11} /> Scale (Zoom)
          </span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.1}
              max={3.0}
              step={0.05}
              value={config.scale}
              onChange={(e) => update('scale', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '34px', textAlign: 'right' }}>
              {config.scale.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Pan Offset X */}
        <div className="control-row">
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Move size={11} /> Pan Offset X
          </span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.offsetX}
              onChange={(e) => update('offsetX', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '34px', textAlign: 'right' }}>
              {config.offsetX}%
            </span>
          </div>
        </div>

        {/* Pan Offset Y */}
        <div className="control-row">
          <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Move size={11} /> Pan Offset Y
          </span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-100}
              max={100}
              step={1}
              value={config.offsetY}
              onChange={(e) => update('offsetY', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '34px', textAlign: 'right' }}>
              {config.offsetY}%
            </span>
          </div>
        </div>

        {/* Rotation */}
        <div className="control-row">
          <span className="control-label">Rotation Angle</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={360}
              step={5}
              value={config.rotation}
              onChange={(e) => update('rotation', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '34px', textAlign: 'right' }}>
              {config.rotation}°
            </span>
          </div>
        </div>

        {/* Quick Rotation & Flip Action Buttons */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => rotateBy(-90)} title="Rotate Left 90°">
            <RotateCcw size={11} /> -90°
          </button>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => rotateBy(90)} title="Rotate Right 90°">
            <RotateCw size={11} /> +90°
          </button>
          <button
            className={`btn btn-sm ${config.flipX ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => update('flipX', !config.flipX)}
            title="Flip Horizontal"
          >
            <FlipHorizontal size={11} /> FLIP X
          </button>
          <button
            className={`btn btn-sm ${config.flipY ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => update('flipY', !config.flipY)}
            title="Flip Vertical"
          >
            <FlipVertical size={11} /> FLIP Y
          </button>
        </div>

        {/* Reset Transforms Button */}
        <button
          className="btn btn-sm"
          style={{ width: '100%', marginTop: '8px', color: 'var(--text-muted)' }}
          onClick={resetTransforms}
        >
          RESET TRANSFORMS
        </button>
      </div>

      {/* 4. EFFECT & TONAL CONTROLS (Tonal curve, Levels, Highlights/Shadows, Background) */}
      {viewConfig && onChangeViewConfig && (
        <MediaViewControls
          config={viewConfig}
          onChangeConfig={onChangeViewConfig}
          onResetDefaults={onResetViewDefaults}
        />
      )}
    </div>
  );
};
