import React, { useRef, useState, useEffect } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { MediaConfig } from '../types/ascii';
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

interface MediaUploadControlsProps {
  config: MediaConfig;
  onChangeConfig: (cfg: MediaConfig) => void;
  mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  onFileUpload: (file: File) => void;
  onUrlLoad: (url: string) => void;
  /**
   * Just the paste button and the dropzone, with no section chrome.
   *
   * Drops the filename readout, the URL loader and the video timeline. The
   * host section header already names the step, the viewport already carries
   * transport controls, and the filename is on the viewport too -- repeating
   * any of it here is the padding BASIC is meant to be free of.
   */
  minimal?: boolean;
}

export const MediaUploadControls: React.FC<MediaUploadControlsProps> = ({
  config,
  onChangeConfig,
  mediaElement,
  onFileUpload,
  onUrlLoad,
  minimal = false,
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
    let url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      url = 'https://' + url;
    }
    onUrlLoad(url);
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

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isMac = typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '');

  const handleClipboardPaste = async () => {
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
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  if (minimal) {
    return (
      <>
        <button
          type="button"
          className="btn btn-randomize btn-hero"
          onClick={handleClipboardPaste}
          title="Paste image directly from clipboard"
        >
          <ClipboardPaste size={15} />
          <span>PASTE ({isMac ? 'CMD+V' : 'CTRL+V'})</span>
        </button>

        <div
          className={`model-dropzone dropzone-lg ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="file-input-hidden"
            accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,.gif,.svg"
            onChange={handleFileInputChange}
          />
          {config.mediaType === 'video' ? (
            <Video size={22} color="var(--accent)" className="dropzone-icon" />
          ) : (
            <ImageIcon size={22} color="var(--accent)" className="dropzone-icon" />
          )}
          <div className="dropzone-title">
            DROP IMAGE OR VIDEO HERE
          </div>
          <div className="dropzone-hint">
            or click to browse
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="tab-content">
      {/* Large Clipboard Paste Hero Button */}
      <div className="btn-hero-wrap">
        <button
          type="button"
          className="btn btn-randomize btn-hero"
          onClick={handleClipboardPaste}
          title="Paste image directly from clipboard (or press Cmd+V / Ctrl+V)"
        >
          <ClipboardPaste size={16} className="header-btn-icon" />
          <span>PASTE FROM CLIPBOARD ({isMac ? '⌘V' : 'CTRL+V'})</span>
        </button>
      </div>

      {/* File Upload & Source Dropzone */}
      <CollapsibleSection title="Import From File / URL" icon={<Upload size={12} />} persistKey="MediaFileControls-import-from-file-url" defaultOpen={true}>
        <div
          className={`model-dropzone dropzone-lg ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="file-input-hidden"
            accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,.gif,.svg"
            onChange={handleFileInputChange}
          />
          {config.mediaType === 'video' ? (
            <Video size={22} color="var(--accent)" className="dropzone-icon" />
          ) : (
            <ImageIcon size={22} color="var(--accent)" className="dropzone-icon" />
          )}
          <div className="dropzone-title">
            DROP IMAGE OR VIDEO HERE
          </div>
          <div className="dropzone-hint">
            PNG, JPG, WebP, GIF, SVG, MP4, WebM, MOV or click to browse
          </div>
        </div>

        {/* Current File Info */}
        <div className="media-file-card">
          <div className="media-file-card-left">
            {config.mediaType === 'video' ? (
              <Film size={12} color="var(--accent)" className="control-fixed" />
            ) : (
              <ImageIcon size={12} color="var(--accent)" className="control-fixed" />
            )}
            <span className="media-file-name" title={config.fileName || 'Active Media File'}>
              {config.fileName || 'Active Media File'}
            </span>
          </div>
          <span className="brand-version media-file-source">{config.sourceType}</span>
        </div>

        {/* URL Import */}
        <form onSubmit={handleUrlSubmit} className="media-url-form">
          <input
            type="text"
            className="number-input media-url-input"
            placeholder="Load media from URL (http://...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button type="submit" className="btn btn-sm">
            <Link2 size={11} />
            LOAD
          </button>
        </form>
      </CollapsibleSection>

      {/* Video Playback & Timeline Controls (if video source) */}
      {isVideo && (
        <CollapsibleSection title="Video Playback" icon={<Film size={12} />} persistKey="MediaFileControls-video-playback">
          <div className="video-transport">
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

            <div className="video-timecode">
              {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
            </div>
          </div>

          {/* Timeline scrubber */}
          <div className="control-row">
            <span className="control-label video-timeline-label">Timeline</span>
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
          <div className="control-row control-row-tight">
            <span className="control-label">Speed</span>
            <div className="btn-group">
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
        </CollapsibleSection>
      )}
    </div>
  );
};

interface MediaFramingControlsProps {
  config: MediaConfig;
  onChangeConfig: (cfg: MediaConfig) => void;
}

export const MediaFramingControls: React.FC<MediaFramingControlsProps> = ({
  config,
  onChangeConfig,
}) => {
  const update = <K extends keyof MediaConfig>(key: K, val: MediaConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
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

  return (
    <div className="tab-content">
      <CollapsibleSection
        title="Transform &amp; Framing"
        icon={<Maximize2 size={12} />}
        persistKey="MediaFileControls-transform-framing"
        onReset={resetTransforms}
        resetTitle="Reset transforms to default fit and framing"
      >
        {/* Fit Mode */}
        <div className="control-row">
          <span className="control-label">Fit Mode</span>
          <div className="btn-group">
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
          <span className="control-label control-label-icon">
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
            <span className="numeral-badge">
              {config.scale.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Pan Offset X */}
        <div className="control-row">
          <span className="control-label control-label-icon">
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
            <span className="numeral-badge">
              {config.offsetX}%
            </span>
          </div>
        </div>

        {/* Pan Offset Y */}
        <div className="control-row">
          <span className="control-label control-label-icon">
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
            <span className="numeral-badge">
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
            <span className="numeral-badge">
              {config.rotation}°
            </span>
          </div>
        </div>

        {/* Quick Rotation & Flip Action Buttons */}
        <div className="btn-group btn-row-even control-row-spaced">
          <button className="btn btn-sm" onClick={() => rotateBy(-90)} title="Rotate Left 90°">
            <RotateCcw size={11} /> -90°
          </button>
          <button className="btn btn-sm" onClick={() => rotateBy(90)} title="Rotate Right 90°">
            <RotateCw size={11} /> +90°
          </button>
          <button
            className={`btn btn-sm ${config.flipX ? 'btn-primary' : ''}`}
            onClick={() => update('flipX', !config.flipX)}
            title="Flip Horizontal"
          >
            <FlipHorizontal size={11} /> FLIP X
          </button>
          <button
            className={`btn btn-sm ${config.flipY ? 'btn-primary' : ''}`}
            onClick={() => update('flipY', !config.flipY)}
            title="Flip Vertical"
          >
            <FlipVertical size={11} /> FLIP Y
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export const MediaFileControls: React.FC<MediaUploadControlsProps> = (props) => {
  return (
    <>
      <MediaUploadControls {...props} />
      <MediaFramingControls config={props.config} onChangeConfig={props.onChangeConfig} />
    </>
  );
};
