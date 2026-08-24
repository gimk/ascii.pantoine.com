import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Copy,
  Download,
  Check,
  Bot,
  Film,
  Video,
  Loader2,
  Play,
  RotateCcw,
  Code2,
  Database,
  FileCode,
  FileText,
  Camera,
  Info,
} from 'lucide-react';
import {
  generateAstroComponent,
  generateStandaloneHtml,
  generateAiPrompt,
  generateHtmlEmbed,
  generateMarkdownSnippet,
  generateAsciiTextFrame,
  generateModeJsonPreset,
} from '../engine/exporter';
import { exportAnimatedGif } from '../engine/gif';
import { exportVideoAnimation, getSupportedVideoMimeType } from '../engine/video';
import { exportAsciiImage } from '../engine/imageExporter';
import * as THREE from 'three';
import {
  WaveParams,
  ParticleConfig,
  OptimizeConfig,
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
} from '../types/ascii';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  particleConfig: ParticleConfig;
  optimizeConfig?: OptimizeConfig;
  cols: number;
  rows: number;
  density: string;
  currentAsciiFrame: string;
  currentTime?: number;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  crtConfig?: CrtConfig;
  initialTab?: 'prompt' | 'astro' | 'html' | 'html_embed' | 'markdown' | 'json' | 'ascii' | 'image' | 'gif' | 'video';
  appMode?: AppMode;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
}

export type ExportTab =
  | 'image'
  | 'gif'
  | 'video'
  | 'html_embed'
  | 'markdown'
  | 'astro'
  | 'html'
  | 'prompt'
  | 'json'
  | 'ascii';

export type ExportCategory = 'media' | 'code' | 'data';

const getCategoryForTab = (tab: ExportTab): ExportCategory => {
  if (tab === 'image' || tab === 'gif' || tab === 'video') return 'media';
  if (tab === 'astro' || tab === 'html' || tab === 'prompt' || tab === 'html_embed' || tab === 'markdown') return 'code';
  return 'data';
};

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  name,
  type,
  params,
  customCode,
  customPrepare,
  particleConfig,
  optimizeConfig,
  cols,
  rows,
  density,
  currentAsciiFrame,
  currentTime = 0,
  theme = 'green',
  customThemeColor,
  gradientConfig,
  crtConfig,
  initialTab = 'prompt',
  appMode = 'synth',
  modelConfig,
  modelViewConfig,
  geometry,
  mediaConfig,
  mediaViewConfig,
  mediaColorConfig,
  mediaElement,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>(initialTab);
  const [activeCategory, setActiveCategory] = useState<ExportCategory>(getCategoryForTab(initialTab));
  const [copied, setCopied] = useState<boolean>(false);
  const [customBaseName, setCustomBaseName] = useState<string>('');

  // Still Image Export States
  const [imageFormat, setImageFormat] = useState<'png' | 'jpg' | 'svg'>('png');

  const [imageQuality, setImageQuality] = useState<number>(0.95);
  const [imageScale, setImageScale] = useState<number>(2.0);
  const [imageTransparentBg, setImageTransparentBg] = useState<boolean>(false);
  const [imageIncludeCrt, setImageIncludeCrt] = useState<boolean>(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isCapturingImage, setIsCapturingImage] = useState<boolean>(false);
  const [imageCopied, setImageCopied] = useState<boolean>(false);

  // GIF Recording States
  const [gifDuration, setGifDuration] = useState<number>(2.0);
  const [gifFps, setGifFps] = useState<number>(15);
  const [gifScale, setGifScale] = useState<number>(1.0);
  const [isRecordingGif, setIsRecordingGif] = useState<boolean>(false);
  const [recordProgressGif, setRecordProgressGif] = useState<number>(0);
  const [recordStatusGif, setRecordStatusGif] = useState<string>('');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBlob, setGifBlob] = useState<Blob | null>(null);

  // Video Recording States
  const supportedDefault = getSupportedVideoMimeType('auto');
  const [videoDuration, setVideoDuration] = useState<number>(3.0);
  const [videoFps, setVideoFps] = useState<number>(30);
  const [videoScale, setVideoScale] = useState<number>(1.5);
  const [videoFormat, setVideoFormat] = useState<'mp4' | 'webm' | 'auto'>('auto');
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [recordProgressVideo, setRecordProgressVideo] = useState<number>(0);
  const [recordStatusVideo, setRecordStatusVideo] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoExtension, setVideoExtension] = useState<'.mp4' | '.webm'>(supportedDefault.extension);

  const defaultBaseName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ascii-studio';

  // Initialize or reset base filename when preset name or modal open state changes
  useEffect(() => {
    setCustomBaseName(defaultBaseName);
  }, [name, isOpen]);

  const handleCaptureImage = useCallback(async () => {
    setIsCapturingImage(true);
    try {
      const res = await exportAsciiImage({
        name,
        format: imageFormat,
        quality: imageQuality,
        scale: imageScale,
        transparentBg: imageFormat === 'png' ? imageTransparentBg : false,
        includeScanlines: imageIncludeCrt ? (crtConfig?.scanlines ?? true) : false,
        includeCrtGlow: imageIncludeCrt ? (crtConfig?.crtGlow ?? (crtConfig?.glow ?? false)) : false,
        includeVignette: imageIncludeCrt ? (crtConfig?.vignette ?? false) : false,
        includePhosphorBloom: imageIncludeCrt ? (crtConfig?.phosphorBloom ?? (crtConfig?.glow ?? false)) : false,
        time: currentTime,
        currentAsciiFrame,
        type,
        params,
        customCode,
        customPrepare,
        density,
        cols,
        rows,
        theme,
        customThemeColor,
        gradientConfig,
        crtConfig,
        appMode,
        modelConfig,
        modelViewConfig,
        geometry,
        mediaConfig,
        mediaViewConfig,
        mediaColorConfig,
        mediaElement,
      });

      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(res.url);
      setImageBlob(res.blob);
      setImageDimensions({ width: res.width, height: res.height });
    } catch (err: any) {
      console.error('Image Capture Error:', err);
    } finally {
      setIsCapturingImage(false);
    }
  }, [
    name,
    imageFormat,
    imageQuality,
    imageScale,
    imageTransparentBg,
    imageIncludeCrt,
    crtConfig,
    currentTime,
    currentAsciiFrame,
    type,
    params,
    customCode,
    customPrepare,
    density,
    cols,
    rows,
    theme,
    customThemeColor,
    gradientConfig,
    appMode,
    modelConfig,
    modelViewConfig,
    geometry,
    mediaConfig,
    mediaViewConfig,
    mediaColorConfig,
    mediaElement,
    imageUrl,
  ]);

  const isTabDisabled = useCallback(
    (tab: ExportTab): boolean => {
      if (tab === 'astro' || tab === 'html' || tab === 'prompt') {
        return appMode !== 'synth';
      }
      return false;
    },
    [appMode]
  );

  useEffect(() => {
    if (isOpen) {
      let targetTab: ExportTab = (initialTab as ExportTab) || 'image';
      if (isTabDisabled(targetTab)) {
        targetTab = 'html_embed';
      }
      setActiveTab(targetTab);
      setActiveCategory(getCategoryForTab(targetTab));
    }
    if (isOpen && (activeTab === 'image' || initialTab === 'image')) {
      handleCaptureImage();
    }
    if (!isOpen) {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
        setImageBlob(null);
        setIsCapturingImage(false);
      }
      if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        setGifUrl(null);
        setGifBlob(null);
        setIsRecordingGif(false);
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setVideoBlob(null);
        setIsRecordingVideo(false);
      }
    }
  }, [isOpen, initialTab, appMode, isTabDisabled]);

  // Re-capture image when still image options change while tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'image') {
      handleCaptureImage();
    }
  }, [isOpen, activeTab, imageFormat, imageQuality, imageScale, imageTransparentBg, imageIncludeCrt]);

  if (!isOpen) return null;

  const exportCfg = {
    name,
    type,
    params,
    customCode,
    customPrepare,
    particleConfig,
    optimizeConfig,
    cols,
    rows,
    density,
    fps: optimizeConfig?.targetFps !== undefined ? optimizeConfig.targetFps : 60,
    appMode,
    theme,
    customThemeColor,
    gradientConfig,
    crtConfig,
    modelConfig,
    modelViewConfig,
    mediaConfig,
    mediaViewConfig,
    mediaColorConfig,
  };

  const getExtension = (): string => {
    switch (activeTab) {
      case 'image': return imageFormat === 'jpg' ? '.jpg' : imageFormat === 'svg' ? '.svg' : '.png';

      case 'prompt': return '-ai-prompt.txt';
      case 'astro': return '.astro';
      case 'html': return '-standalone.html';
      case 'html_embed': return '-embed.html';
      case 'markdown': return '.md';
      case 'json': return '.json';
      case 'ascii': return '-frame.txt';
      case 'gif': return '.gif';
      case 'video': return videoExtension;
    }
  };

  const effectiveFileName = `${(customBaseName.trim() || defaultBaseName).replace(/\.[^/.]+$/, '')}${getExtension()}`;

  const handleSelectCategory = (cat: ExportCategory) => {
    setActiveCategory(cat);
    if (cat === 'media') {
      if (activeTab !== 'image' && activeTab !== 'gif' && activeTab !== 'video') setActiveTab('image');
    } else if (cat === 'code') {
      if (appMode !== 'synth') {
        if (activeTab !== 'html_embed' && activeTab !== 'markdown') setActiveTab('html_embed');
      } else {
        if (
          activeTab !== 'html_embed' &&
          activeTab !== 'markdown' &&
          activeTab !== 'astro' &&
          activeTab !== 'html' &&
          activeTab !== 'prompt'
        ) {
          setActiveTab('html_embed');
        }
      }
    } else if (cat === 'data') {
      if (activeTab !== 'json' && activeTab !== 'ascii') setActiveTab('json');
    }
  };

  const handleSelectSubTab = (tab: ExportTab) => {
    if (isTabDisabled(tab)) return;
    setActiveTab(tab);
  };

  const handleRecordGif = async () => {
    setIsRecordingGif(true);
    setRecordProgressGif(0);
    setRecordStatusGif('Preparing frames...');
    try {
      const blob = await exportAnimatedGif(
        {
          name,
          type,
          params,
          customCode,
          customPrepare,
          density,
          cols,
          rows,
          theme,
          customThemeColor,
          gradientConfig,
          crtConfig,
          duration: gifDuration,
          fps: gifFps,
          scale: gifScale,
          appMode,
          modelConfig,
          modelViewConfig,
          geometry,
          mediaConfig,
          mediaViewConfig,
          mediaColorConfig,
          mediaElement,
        },
        (progress, frame, total) => {
          setRecordProgressGif(progress);
          if (progress < 80) {
            setRecordStatusGif(`Rendering frame ${frame} of ${total} (${progress}%)...`);
          } else {
            setRecordStatusGif(`Encoding GIF binary stream (${progress}%)...`);
          }
        }
      );

      const url = URL.createObjectURL(blob);
      setGifBlob(blob);
      setGifUrl(url);
    } catch (err: any) {
      alert(`GIF Export Error: ${err?.message || 'Failed to render GIF'}`);
    } finally {
      setIsRecordingGif(false);
    }
  };

  const handleRecordVideo = async () => {
    setIsRecordingVideo(true);
    setRecordProgressVideo(0);
    setRecordStatusVideo('Recording video stream in real-time...');
    try {
      const result = await exportVideoAnimation(
        {
          name,
          type,
          params,
          customCode,
          customPrepare,
          density,
          cols,
          rows,
          theme,
          customThemeColor,
          gradientConfig,
          crtConfig,
          duration: videoDuration,
          fps: videoFps,
          scale: videoScale,
          preferredFormat: videoFormat,
          appMode,
          modelConfig,
          modelViewConfig,
          geometry,
          mediaConfig,
          mediaViewConfig,
          mediaColorConfig,
          mediaElement,
        },
        (progress, frame, total) => {
          setRecordProgressVideo(progress);
          setRecordStatusVideo(`Recording frame ${frame} of ${total} (${progress}%)...`);
        }
      );

      const url = URL.createObjectURL(result.blob);
      setVideoBlob(result.blob);
      setVideoUrl(url);
      setVideoExtension(result.extension);
    } catch (err: any) {
      alert(`Video Export Error: ${err?.message || 'Failed to record video'}`);
    } finally {
      setIsRecordingVideo(false);
    }
  };

  const getExportContent = (): { text: string; mimeType: string } => {
    switch (activeTab) {
      case 'image':
        return {
          text: '',
          mimeType: imageFormat === 'jpg' ? 'image/jpeg' : 'image/png',
        };
      case 'html_embed':
        return {
          text: generateHtmlEmbed({
            name,
            frameText: currentAsciiFrame,
            cols,
            rows,
            theme,
            customThemeColor,
          }),
          mimeType: 'text/html',
        };
      case 'markdown':
        return {
          text: generateMarkdownSnippet({
            name,
            frameText: currentAsciiFrame,
            appMode,
            cols,
            rows,
          }),
          mimeType: 'text/markdown',
        };
      case 'prompt':
        return {
          text: generateAiPrompt(exportCfg),
          mimeType: 'text/plain',
        };
      case 'astro':
        return {
          text: generateAstroComponent(exportCfg),
          mimeType: 'text/plain',
        };
      case 'html':
        return {
          text: generateStandaloneHtml(exportCfg),
          mimeType: 'text/html',
        };
      case 'json':
        return {
          text: generateModeJsonPreset({
            appMode,
            name,
            type,
            params,
            customCode,
            customPrepare,
            particleConfig,
            optimizeConfig,
            cols,
            rows,
            density,
            theme,
            customThemeColor,
            gradientConfig,
            crtConfig,
            modelConfig,
            modelViewConfig,
            mediaConfig,
            mediaViewConfig,
          }),
          mimeType: 'application/json',
        };
      case 'ascii':
        return {
          text: generateAsciiTextFrame({
            name,
            frameText: currentAsciiFrame,
            cols,
            rows,
            appMode,
          }),
          mimeType: 'text/plain',
        };
      case 'gif':
        return {
          text: '',
          mimeType: 'image/gif',
        };
      case 'video':
        return {
          text: '',
          mimeType: videoExtension === '.mp4' ? 'video/mp4' : 'video/webm',
        };
    }
  };

  const { text, mimeType } = getExportContent();

  const handleCopy = async () => {
    if (activeTab === 'image') {
      if (!imageBlob) return;
      try {
        if (imageFormat === 'png') {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': imageBlob }),
          ]);
        } else {
          // Convert blob to png for universal browser clipboard support
          const img = new Image();
          img.src = imageUrl!;
          await new Promise((resolve) => {
            img.onload = resolve;
          });
          const cvs = document.createElement('canvas');
          cvs.width = img.width;
          cvs.height = img.height;
          const c = cvs.getContext('2d');
          c?.drawImage(img, 0, 0);
          cvs.toBlob(async (b) => {
            if (b) {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': b }),
              ]);
            }
          }, 'image/png');
        }
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 1800);
      } catch (e) {
        console.warn('Clipboard write failed:', e);
      }
      return;
    }
    if (activeTab === 'gif' || activeTab === 'video') return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    if (activeTab === 'image') {
      if (!imageBlob) return;
      const url = URL.createObjectURL(imageBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = effectiveFileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (activeTab === 'gif') {
      if (!gifBlob) return;
      const url = URL.createObjectURL(gifBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = effectiveFileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (activeTab === 'video') {
      if (!videoBlob) return;
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = effectiveFileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = effectiveFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const modeBadge =
    appMode === 'model' ? '3D MODEL' : appMode === 'media' ? 'MEDIA RASTERIZER' : 'WAVE SYNTH';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>
            EXPORT [{modeBadge}: {name.toUpperCase()}]
          </span>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Level 1: Primary Category Nav */}
        <div className="export-category-nav">
          <button
            className={`export-category-btn ${activeCategory === 'media' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('media')}
          >
            <Film size={13} />
            MEDIA CAPTURE
          </button>
          <button
            className={`export-category-btn ${activeCategory === 'code' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('code')}
          >
            <Code2 size={13} />
            CODE & EMBED
          </button>
          <button
            className={`export-category-btn ${activeCategory === 'data' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('data')}
          >
            <Database size={13} />
            RAW DATA
          </button>
        </div>

        {/* Level 2: Sub-Tabs Nav */}
        <div className="export-subtab-nav">
          {activeCategory === 'media' && (
            <>
              <button
                className={`export-subtab-btn ${activeTab === 'image' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('image')}
              >
                <Camera size={11} />
                Still Image (.png / .jpg)
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'gif' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('gif')}
              >
                <Film size={11} />
                GIF Animation (.gif)
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'video' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('video')}
              >
                <Video size={11} />
                Video Clip (.mp4 / .webm)
              </button>
            </>
          )}

          {activeCategory === 'code' && (
            <>
              <button
                className={`export-subtab-btn ${activeTab === 'html_embed' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('html_embed')}
              >
                <Code2 size={11} />
                HTML &lt;pre&gt; Embed (.html)
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('markdown')}
              >
                <FileText size={11} />
                Markdown Snippet (.md)
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'astro' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('astro')}
                disabled={isTabDisabled('astro')}
                style={
                  isTabDisabled('astro')
                    ? { opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(1)' }
                    : undefined
                }
                title={
                  isTabDisabled('astro')
                    ? 'Only available for Procedural Wave Synthesizer (interactive mathematical formula)'
                    : 'Astro Component (.astro)'
                }
              >
                <FileCode size={11} />
                Astro Component (.astro)
                {isTabDisabled('astro') && (
                  <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '3px' }}>[SYNTH ONLY]</span>
                )}
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'html' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('html')}
                disabled={isTabDisabled('html')}
                style={
                  isTabDisabled('html')
                    ? { opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(1)' }
                    : undefined
                }
                title={
                  isTabDisabled('html')
                    ? 'Only available for Procedural Wave Synthesizer (interactive mathematical formula)'
                    : 'Standalone HTML Wave Engine (.html)'
                }
              >
                <Play size={11} />
                Standalone Engine (.html)
                {isTabDisabled('html') && (
                  <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '3px' }}>[SYNTH ONLY]</span>
                )}
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('prompt')}
                disabled={isTabDisabled('prompt')}
                style={
                  isTabDisabled('prompt')
                    ? { opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(1)' }
                    : undefined
                }
                title={
                  isTabDisabled('prompt')
                    ? 'Only available for Procedural Wave Synthesizer (interactive mathematical formula)'
                    : 'AI Prompt (.txt)'
                }
              >
                <Bot size={11} />
                AI Prompt (.txt)
                {isTabDisabled('prompt') && (
                  <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '3px' }}>[SYNTH ONLY]</span>
                )}
              </button>
            </>
          )}

          {activeCategory === 'data' && (
            <>
              <button
                className={`export-subtab-btn ${activeTab === 'json' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('json')}
              >
                <Database size={11} />
                {appMode === 'model'
                  ? '3D Model Preset (.json)'
                  : appMode === 'media'
                  ? 'Media Preset (.json)'
                  : 'Synth Preset (.json)'}
              </button>
              <button
                className={`export-subtab-btn ${activeTab === 'ascii' ? 'active' : ''}`}
                onClick={() => handleSelectSubTab('ascii')}
              >
                <FileText size={11} />
                ASCII Text Frame (.txt)
              </button>
            </>
          )}
        </div>

        {/* Code Content */}
        <div className="modal-body">
          {/* Filename Customizer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              padding: '8px 10px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
              FILE NAME:
            </span>
            <input
              type="text"
              className="number-input"
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--accent)',
              }}
              value={customBaseName}
              onChange={(e) => setCustomBaseName(e.target.value)}
              placeholder={defaultBaseName}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {getExtension()}
            </span>
          </div>

          {activeTab === 'image' ? (
            <div>
              {/* Still Image Configuration Grid */}
              <div className="gif-config-grid">
                {/* Format */}
                <div className="gif-config-item">
                  <span className="gif-config-label">Image Format</span>
                  <div className="gif-btn-group">
                    {[
                      { id: 'png', label: 'PNG (Raster)' },
                      { id: 'jpg', label: 'JPG (Photo)' },
                      { id: 'svg', label: 'SVG (Vector)' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        className={`btn ${imageFormat === f.id ? 'btn-primary' : ''}`}
                        onClick={() => setImageFormat(f.id as any)}
                      >
                        {f.label}
                      </button>
                    ))}

                  </div>
                </div>

                {/* Resolution Scale */}
                <div className="gif-config-item">
                  <span className="gif-config-label">Resolution Scale</span>
                  <div className="gif-btn-group">
                    {[
                      { val: 1.0, label: '1x' },
                      { val: 1.5, label: '1.5x' },
                      { val: 2.0, label: '2x (HD)' },
                      { val: 3.0, label: '3x' },
                      { val: 4.0, label: '4x (4K)' },
                    ].map((s) => (
                      <button
                        key={s.val}
                        className={`btn ${imageScale === s.val ? 'btn-primary' : ''}`}
                        onClick={() => setImageScale(s.val)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background (PNG) or Quality (JPG) */}
                {imageFormat === 'png' ? (
                  <div className="gif-config-item">
                    <span className="gif-config-label">Background</span>
                    <div className="gif-btn-group">
                      <button
                        className={`btn ${!imageTransparentBg ? 'btn-primary' : ''}`}
                        onClick={() => setImageTransparentBg(false)}
                      >
                        Theme CRT
                      </button>
                      <button
                        className={`btn ${imageTransparentBg ? 'btn-primary' : ''}`}
                        onClick={() => setImageTransparentBg(true)}
                      >
                        Transparent
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="gif-config-item">
                    <span className="gif-config-label">JPG Quality ({Math.round(imageQuality * 100)}%)</span>
                    <div className="gif-btn-group">
                      {[0.8, 0.9, 0.95, 1.0].map((q) => (
                        <button
                          key={q}
                          className={`btn ${imageQuality === q ? 'btn-primary' : ''}`}
                          onClick={() => setImageQuality(q)}
                        >
                          {Math.round(q * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CRT Effects */}
                <div className="gif-config-item">
                  <span className="gif-config-label">CRT Effects</span>
                  <div className="gif-btn-group">
                    <button
                      className={`btn ${imageIncludeCrt ? 'btn-primary' : ''}`}
                      onClick={() => setImageIncludeCrt(!imageIncludeCrt)}
                    >
                      {imageIncludeCrt ? 'Glow & Scanlines [ON]' : 'Clean Text [OFF]'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Loading indicator */}
              {isCapturingImage && (
                <div className="gif-progress-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent)' }}>
                    <Loader2 size={12} className="dice-spin" />
                    Rendering high-resolution viewport frame...
                  </div>
                </div>
              )}

              {/* Still Image Preview Card */}
              {imageUrl && (
                <div
                  className="gif-preview-card"
                  style={{
                    background: imageTransparentBg && imageFormat === 'png'
                      ? 'repeating-conic-gradient(#1f1f1f 0% 25%, #121212 0% 50%) 50% / 16px 16px'
                      : undefined,
                  }}
                >
                  <img src={imageUrl} alt="Captured Still Frame Preview" className="gif-preview-img" style={{ maxHeight: '240px' }} />
                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Dimensions: {imageDimensions?.width}×{imageDimensions?.height}px • Format: {imageFormat.toUpperCase()} • Size: {(imageBlob ? (imageBlob.size / 1024).toFixed(1) : 0)} KB • Time: {currentTime.toFixed(2)}s
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'gif' ? (
            <div>
              {/* GIF Configuration */}
              <div className="gif-config-grid">
                <div className="gif-config-item">
                  <span className="gif-config-label">Loop Duration</span>
                  <div className="gif-btn-group">
                    {[1.0, 2.0, 3.0, 4.0, 6.0].map((d) => (
                      <button
                        key={d}
                        disabled={isRecordingGif}
                        className={`btn ${gifDuration === d ? 'btn-primary' : ''}`}
                        onClick={() => setGifDuration(d)}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Frame Rate</span>
                  <div className="gif-btn-group">
                    {[12, 15, 20, 24].map((f) => (
                      <button
                        key={f}
                        disabled={isRecordingGif}
                        className={`btn ${gifFps === f ? 'btn-primary' : ''}`}
                        onClick={() => setGifFps(f)}
                      >
                        {f}fps
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Resolution Scale</span>
                  <div className="gif-btn-group">
                    {[
                      { val: 1.0, label: '1.0x (Standard)' },
                      { val: 1.5, label: '1.5x (HD)' },
                    ].map((s) => (
                      <button
                        key={s.val}
                        disabled={isRecordingGif}
                        className={`btn ${gifScale === s.val ? 'btn-primary' : ''}`}
                        onClick={() => setGifScale(s.val)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress Box */}
              {isRecordingGif && (
                <div className="gif-progress-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                      <Loader2 size={12} className="dice-spin" />
                      {recordStatusGif}
                    </span>
                    <span>{recordProgressGif}%</span>
                  </div>
                  <div className="gif-progress-track">
                    <div className="gif-progress-bar" style={{ width: `${recordProgressGif}%` }} />
                  </div>
                </div>
              )}

              {/* GIF Preview */}
              {gifUrl ? (
                <div className="gif-preview-card">
                  <img src={gifUrl} alt="Recorded GIF Preview" className="gif-preview-img" />
                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Loop: {gifDuration}s @ {gifFps}fps • Size: {(gifBlob ? (gifBlob.size / 1024).toFixed(1) : 0)} KB
                  </div>
                </div>
              ) : !isRecordingGif && (
                <div className="gif-preview-card" style={{ color: 'var(--text-dim)', fontSize: '11px', textAlign: 'center' }}>
                  <Film size={28} style={{ opacity: 0.3, marginBottom: '6px' }} />
                  <div>Click "START RECORDING GIF" below to generate a seamless animated loop.</div>
                </div>
              )}
            </div>
          ) : activeTab === 'video' ? (
            <div>
              {/* Video Configuration */}
              <div className="gif-config-grid">
                <div className="gif-config-item">
                  <span className="gif-config-label">Video Duration</span>
                  <div className="gif-btn-group">
                    {[2.0, 3.0, 5.0, 8.0, 10.0].map((d) => (
                      <button
                        key={d}
                        disabled={isRecordingVideo}
                        className={`btn ${videoDuration === d ? 'btn-primary' : ''}`}
                        onClick={() => setVideoDuration(d)}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Smooth Frame Rate</span>
                  <div className="gif-btn-group">
                    {[24, 30, 60].map((f) => (
                      <button
                        key={f}
                        disabled={isRecordingVideo}
                        className={`btn ${videoFps === f ? 'btn-primary' : ''}`}
                        onClick={() => setVideoFps(f)}
                      >
                        {f}fps
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Resolution Quality</span>
                  <div className="gif-btn-group">
                    {[
                      { val: 1.0, label: '1.0x (SD)' },
                      { val: 1.5, label: '1.5x (HD)' },
                      { val: 2.0, label: '2.0x (4K)' },
                    ].map((s) => (
                      <button
                        key={s.val}
                        disabled={isRecordingVideo}
                        className={`btn ${videoScale === s.val ? 'btn-primary' : ''}`}
                        onClick={() => setVideoScale(s.val)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gif-config-item">
                  <span className="gif-config-label">Preferred Format</span>
                  <div className="gif-btn-group">
                    {[
                      { id: 'auto', label: 'Auto' },
                      { id: 'mp4', label: 'MP4' },
                      { id: 'webm', label: 'WebM' },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        disabled={isRecordingVideo}
                        className={`btn ${videoFormat === fmt.id ? 'btn-primary' : ''}`}
                        onClick={() => setVideoFormat(fmt.id as any)}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress Box */}
              {isRecordingVideo && (
                <div className="gif-progress-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                      <Loader2 size={12} className="dice-spin" />
                      {recordStatusVideo}
                    </span>
                    <span>{recordProgressVideo}%</span>
                  </div>
                  <div className="gif-progress-track">
                    <div className="gif-progress-bar" style={{ width: `${recordProgressVideo}%` }} />
                  </div>
                </div>
              )}

              {/* Video Preview */}
              {videoUrl ? (
                <div className="gif-preview-card">
                  <video
                    src={videoUrl}
                    autoPlay
                    loop
                    controls
                    playsInline
                    className="gif-preview-img"
                    style={{ maxHeight: '220px', width: 'auto' }}
                  />
                  <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Video: {videoDuration}s @ {videoFps}fps • Format: {videoExtension.toUpperCase().replace('.', '')} • Size: {(videoBlob ? (videoBlob.size / 1024).toFixed(1) : 0)} KB
                  </div>
                </div>
              ) : !isRecordingVideo && (
                <div className="gif-preview-card" style={{ color: 'var(--text-dim)', fontSize: '11px', textAlign: 'center' }}>
                  <Video size={28} style={{ opacity: 0.3, marginBottom: '6px' }} />
                  <div>Click "START RECORDING VIDEO" to generate a smooth {videoDuration}s video clip.</div>
                </div>
              )}
            </div>
          ) : (
            <>
              {activeCategory === 'code' && appMode !== 'synth' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    marginBottom: '8px',
                    background: 'var(--bg-control)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Info size={13} color="var(--accent)" />
                  <span>
                    {appMode === 'model'
                      ? '3D Model mode exports self-contained HTML/Markdown embeds or rendered media captures.'
                      : 'Media mode exports self-contained HTML/Markdown embeds or rendered media captures.'}
                  </span>
                </div>
              )}
              <textarea
                className="code-editor-area"
                style={{
                  minHeight: '280px',
                  fontFamily: 'var(--font-mono)',
                  fontVariantLigatures: 'none',
                  WebkitFontVariantLigatures: 'none',
                  fontFeatureSettings: '"liga" 0, "calt" 0, "dlig" 0',
                }}
                value={text}
                readOnly
              />
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          {activeTab === 'image' ? (
            <>
              <button
                className="btn"
                onClick={handleCaptureImage}
                disabled={isCapturingImage}
                title="Re-render frame with current settings and timestamp"
              >
                <RotateCcw size={12} />
                RE-CAPTURE FRAME
              </button>
              <button
                className="btn"
                onClick={handleCopy}
                disabled={!imageBlob || isCapturingImage}
              >
                {imageCopied ? <Check size={12} /> : <Copy size={12} />}
                {imageCopied ? 'IMAGE COPIED' : 'COPY IMAGE'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDownload}
                disabled={!imageBlob || isCapturingImage}
              >
                <Download size={12} />
                DOWNLOAD {effectiveFileName}
              </button>
            </>
          ) : activeTab === 'gif' ? (
            <>
              {gifUrl && (
                <button
                  className="btn"
                  onClick={handleRecordGif}
                  disabled={isRecordingGif}
                >
                  <RotateCcw size={12} />
                  RE-RECORD
                </button>
              )}
              {!gifUrl ? (
                <button
                  className="btn btn-primary"
                  onClick={handleRecordGif}
                  disabled={isRecordingGif}
                >
                  {isRecordingGif ? <Loader2 size={12} className="dice-spin" /> : <Play size={12} />}
                  {isRecordingGif ? 'RECORDING GIF...' : 'START RECORDING GIF'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                >
                  <Download size={12} />
                  DOWNLOAD {effectiveFileName}
                </button>
              )}
            </>
          ) : activeTab === 'video' ? (
            <>
              {videoUrl && (
                <button
                  className="btn"
                  onClick={handleRecordVideo}
                  disabled={isRecordingVideo}
                >
                  <RotateCcw size={12} />
                  RE-RECORD
                </button>
              )}
              {!videoUrl ? (
                <button
                  className="btn btn-primary"
                  onClick={handleRecordVideo}
                  disabled={isRecordingVideo}
                >
                  {isRecordingVideo ? <Loader2 size={12} className="dice-spin" /> : <Play size={12} />}
                  {isRecordingVideo ? 'RECORDING VIDEO...' : 'START RECORDING VIDEO'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                >
                  <Download size={12} />
                  DOWNLOAD {effectiveFileName}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn" onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED TO CLIPBOARD' : 'COPY CODE'}
              </button>
              <button className="btn btn-primary" onClick={handleDownload}>
                <Download size={12} />
                DOWNLOAD {effectiveFileName}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
