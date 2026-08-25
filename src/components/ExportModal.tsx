import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Copy,
  Download,
  Check,
  Film,
  Video,
  Loader2,
  Play,
  RotateCcw,
  Camera,
  Layers,
  Info,
} from 'lucide-react';
import { exportAnimatedGif } from '../engine/gif';
import { exportVideoAnimation, getSupportedVideoMimeType } from '../engine/video';
import { exportAsciiImage } from '../engine/imageExporter';
import {
  exportColorSeparation,
  SeparationResult,
  SeparationStyle,
  MAX_PLATES,
} from '../engine/separationExporter';
import { MONOSPACE_CELL_WIDTH, MONOSPACE_CELL_HEIGHT } from '../engine/renderer';
import * as THREE from 'three';
import {
  WaveParams,
  PhosphorTheme,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  ImageAdjustConfig,
} from '../types/ascii';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  type: 'parametric' | 'custom';
  params: WaveParams;
  customCode?: string;
  customPrepare?: string;
  cols: number;
  rows: number;
  density: string;
  currentAsciiFrame: string;
  currentTime?: number;
  theme?: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  crtConfig?: CrtConfig;
  initialTab?: ExportTab;
  appMode?: AppMode;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  geometry?: THREE.BufferGeometry;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
  mediaElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
}

/**
 * Export is rendered media only.
 *
 * The code and data categories -- Astro component, standalone HTML, HTML/
 * Markdown embed, AI prompt, JSON preset, raw ASCII frame -- are gone along
 * with their generators. They belonged to an earlier direction where the
 * output was a snippet to paste into a site; the app is a raster studio now
 * and the output is a picture.
 */
export type ExportTab = 'image' | 'separation' | 'gif' | 'video';

/**
 * Shortens a filename for display while keeping the extension.
 *
 * The name is whatever the user typed, so the download button's width was
 * effectively unbounded and a long one pushed it past the modal edge. Trimmed
 * from the middle rather than the end because the extension is the part that
 * says what you are about to get -- "my-really-long...-plates.zip" is useful,
 * "my-really-long-expo..." is not.
 */
const truncateFileName = (fileName: string, max = 28): string => {
  if (fileName.length <= max) return fileName;
  const dot = fileName.lastIndexOf('.');
  // No extension, or one long enough to be something else entirely.
  if (dot <= 0 || fileName.length - dot > 12) return `${fileName.slice(0, max - 1)}…`;
  const ext = fileName.slice(dot);
  const head = Math.max(4, max - ext.length - 1);
  return `${fileName.slice(0, head)}…${ext}`;
};

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  name,
  type,
  params,
  customCode,
  customPrepare,
  cols,
  rows,
  density,
  currentAsciiFrame,
  currentTime = 0,
  theme = 'green',
  customThemeColor,
  gradientConfig,
  crtConfig,
  initialTab = 'image',
  appMode = 'synth',
  modelConfig,
  modelViewConfig,
  geometry,
  mediaConfig,
  mediaViewConfig,
  mediaColorConfig,
  rasterMode,
  ditherAlgorithm,
  toneConfig,
  adjustConfig,
  mediaElement,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>(initialTab);
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

  /*
   * Colour Separation States.
   *
   * Own format, scale and quality rather than borrowing the still export's.
   * Every other media tab owns its own (gifScale, videoScale), and sharing
   * meant choosing the plate file type on a different tab -- and the choices
   * genuinely differ: a separation is usually wanted as SVG for layered import
   * where the still is usually a PNG.
   */
  const [sepFormat, setSepFormat] = useState<'png' | 'jpg' | 'svg'>('svg');
  const [sepScale, setSepScale] = useState<number>(2.0);
  const [sepQuality, setSepQuality] = useState<number>(0.95);
  const [sepStyle, setSepStyle] = useState<SeparationStyle>('color');
  const [sepLayeredSvg, setSepLayeredSvg] = useState<boolean>(true);
  const [sepResult, setSepResult] = useState<SeparationResult | null>(null);
  const [isSeparating, setIsSeparating] = useState<boolean>(false);
  const [sepError, setSepError] = useState<string | null>(null);

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
    const effectiveRasterMode: RasterOutputMode =
      rasterMode || (appMode === 'media' ? mediaViewConfig?.rasterMode : undefined) || 'ascii';
    const isPixel = effectiveRasterMode === 'pixel';

    try {
      const res = await exportAsciiImage({
        name,
        format: imageFormat,
        quality: imageQuality,
        scale: imageScale,
        transparentBg: (imageFormat === 'png' || imageFormat === 'svg') ? imageTransparentBg : false,
        includeScanlines: !isPixel && imageIncludeCrt ? (crtConfig?.scanlines ?? true) : false,
        includeCrtGlow: !isPixel && imageIncludeCrt ? (crtConfig?.crtGlow ?? (crtConfig?.glow ?? false)) : false,
        includeVignette: !isPixel && imageIncludeCrt ? (crtConfig?.vignette ?? false) : false,
        includePhosphorBloom: !isPixel && imageIncludeCrt ? (crtConfig?.phosphorBloom ?? (crtConfig?.glow ?? false)) : false,
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
        rasterMode,
        ditherAlgorithm,
        toneConfig,
        adjustConfig,
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
    rasterMode,
    ditherAlgorithm,
    toneConfig,
    adjustConfig,
    imageUrl,
  ]);

  /*
   * Separation is generated on demand, not on every option change like the
   * still preview. It renders the frame and then paints one file per ink, so
   * on a sixteen-colour palette that is sixteen canvases and a ZIP -- not
   * something to run on every keystroke in the filename field.
   */
  const handleGenerateSeparation = useCallback(async () => {
    setIsSeparating(true);
    setSepError(null);
    try {
      const res = await exportColorSeparation({
        name,
        format: sepFormat,
        quality: sepQuality,
        scale: sepScale,
        style: sepStyle,
        layeredSvg: sepFormat === 'svg' && sepLayeredSvg,
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
        rasterMode,
        ditherAlgorithm,
        toneConfig,
        adjustConfig,
      });
      setSepResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        prev?.plates.forEach((p) => URL.revokeObjectURL(p.url));
        return res;
      });
    } catch (err: any) {
      console.error('Colour Separation Error:', err);
      setSepError(err?.message || 'Separation failed');
    } finally {
      setIsSeparating(false);
    }
  }, [
    name, sepFormat, sepQuality, sepScale, sepStyle, sepLayeredSvg,
    currentTime, currentAsciiFrame, type, params, customCode, customPrepare,
    density, cols, rows, theme, customThemeColor, gradientConfig, crtConfig,
    appMode, modelConfig, modelViewConfig, geometry, mediaConfig,
    mediaViewConfig, mediaColorConfig, mediaElement, rasterMode,
    ditherAlgorithm, toneConfig, adjustConfig,
  ]);

  useEffect(() => {
    if (isOpen) {
      // Every remaining tab works in every mode, so there is nothing to gate.
      setActiveTab((initialTab as ExportTab) || 'image');
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
  }, [isOpen, initialTab, appMode]);

  // Re-capture image when still image options change while tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'image') {
      handleCaptureImage();
    }
  }, [isOpen, activeTab, imageFormat, imageQuality, imageScale, imageTransparentBg, imageIncludeCrt]);

  /*
   * Drop a generated separation as soon as anything that shaped it changes.
   * Not regenerated automatically -- that is the expensive part -- but a stale
   * archive must never stay downloadable behind controls that no longer
   * describe it.
   */
  useEffect(() => {
    setSepResult((prev) => {
      if (!prev) return prev;
      if (prev.url) URL.revokeObjectURL(prev.url);
      prev.plates.forEach((p) => URL.revokeObjectURL(p.url));
      return null;
    });
    setSepError(null);
  }, [isOpen, sepFormat, sepScale, sepQuality, sepStyle, sepLayeredSvg, cols, rows, rasterMode, appMode]);

  if (!isOpen) return null;

  const effectiveRasterMode: RasterOutputMode =
    rasterMode || (appMode === 'media' ? mediaViewConfig?.rasterMode : undefined) || 'ascii';
  const isPixel = effectiveRasterMode === 'pixel';

  const stillCellW = isPixel ? Math.max(1, Math.round(imageScale)) : MONOSPACE_CELL_WIDTH * imageScale;
  const stillCellH = isPixel ? Math.max(1, Math.round(imageScale)) : MONOSPACE_CELL_HEIGHT * imageScale;
  const stillExportW = Math.round(cols * stillCellW);
  const stillExportH = Math.round(rows * stillCellH);

  // Same cell geometry as the still export, at this tab's own scale.
  const sepCellW = isPixel ? Math.max(1, Math.round(sepScale)) : MONOSPACE_CELL_WIDTH * sepScale;
  const sepCellH = isPixel ? Math.max(1, Math.round(sepScale)) : MONOSPACE_CELL_HEIGHT * sepScale;
  const sepExportW = Math.round(cols * sepCellW);
  const sepExportH = Math.round(rows * sepCellH);

  const gifCellW = isPixel ? Math.max(1, Math.round(gifScale)) : MONOSPACE_CELL_WIDTH * gifScale;
  const gifCellH = isPixel ? Math.max(1, Math.round(gifScale)) : MONOSPACE_CELL_HEIGHT * gifScale;
  const gifExportW = Math.round(cols * gifCellW);
  const gifExportH = Math.round(rows * gifCellH);

  const videoCellW = isPixel ? Math.max(1, Math.round(videoScale)) : MONOSPACE_CELL_WIDTH * videoScale;
  const videoCellH = isPixel ? Math.max(1, Math.round(videoScale)) : MONOSPACE_CELL_HEIGHT * videoScale;
  const videoExportW = Math.round(cols * videoCellW);
  const videoExportH = Math.round(rows * videoCellH);

  const getExtension = (): string => {
    switch (activeTab) {
      case 'image': return imageFormat === 'jpg' ? '.jpg' : imageFormat === 'svg' ? '.svg' : '.png';
      // A layered SVG is one file; everything else is an archive of plates.
      case 'separation': return sepFormat === 'svg' && sepLayeredSvg ? '-plates.svg' : '-plates.zip';
      case 'gif': return '.gif';
      case 'video': return videoExtension;
    }
  };

  const effectiveFileName = `${(customBaseName.trim() || defaultBaseName).replace(/\.[^/.]+$/, '')}${getExtension()}`;

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
          rasterMode,
          ditherAlgorithm,
          toneConfig,
          adjustConfig,
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
          rasterMode,
          ditherAlgorithm,
          toneConfig,
          adjustConfig,
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


  /** Only the still image has a clipboard form; the rest are archives or video. */
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
    }
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
    if (activeTab === 'separation') {
      if (!sepResult?.blob) return;
      const url = URL.createObjectURL(sepResult.blob);
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
    }
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

        {/* Output Tabs */}
        <div className="export-subtab-nav">
          <button
            className={`export-subtab-btn ${activeTab === 'image' ? 'active' : ''}`}
            onClick={() => setActiveTab('image')}
          >
            <Camera size={14} />
            Still Image
          </button>
          <button
            className={`export-subtab-btn ${activeTab === 'separation' ? 'active' : ''}`}
            onClick={() => setActiveTab('separation')}
            title="One file per colour, for editing each ink separately"
          >
            <Layers size={14} />
            Colour Plates
          </button>
          <button
            className={`export-subtab-btn ${activeTab === 'gif' ? 'active' : ''}`}
            onClick={() => setActiveTab('gif')}
          >
            <Film size={14} />
            GIF Animation
          </button>
          <button
            className={`export-subtab-btn ${activeTab === 'video' ? 'active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <Video size={14} />
            Video Clip
          </button>
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
              className="text-input"
              style={{
                flex: 1,
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
                  <span className="gif-config-label">Resolution Scale ({stillExportW}×{stillExportH}px)</span>
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

                {/* Background (PNG & SVG) or Quality (JPG) */}
                {imageFormat === 'png' || imageFormat === 'svg' ? (
                  <div className="gif-config-item">
                    <span className="gif-config-label">Background</span>
                    <div className="gif-btn-group">
                      <button
                        className={`btn ${!imageTransparentBg ? 'btn-primary' : ''}`}
                        onClick={() => setImageTransparentBg(false)}
                        title="Paint the background behind the raster"
                      >
                        FILL
                      </button>
                      <button
                        className={`btn ${imageTransparentBg ? 'btn-primary' : ''}`}
                        onClick={() => setImageTransparentBg(true)}
                        title="Leave the background empty"
                      >
                        TRANSPARENT
                      </button>
                    </div>
                  </div>
                ) : imageFormat === 'jpg' ? (
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
                ) : null}

                {/* CRT Effects (ASCII mode only) */}
                {!isPixel && (
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
                )}
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
          ) : activeTab === 'separation' ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '9px 11px',
                  marginBottom: '10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                <Info size={13} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }} />
                <span>
                  Splits the render into one file per colour, so each ink can be edited on its own.
                  Plates arrive as a <strong style={{ color: 'var(--text-primary)' }}>.zip</strong>,
                  except layered SVG which is a single file.
                </span>
              </div>

              <div className="gif-config-grid">
                {/* Format */}
                <div className="gif-config-item">
                  <span className="gif-config-label">Plate Format</span>
                  <div className="gif-btn-group">
                    {[
                      { id: 'svg', label: 'SVG (Vector)' },
                      { id: 'png', label: 'PNG (Raster)' },
                      { id: 'jpg', label: 'JPG (Photo)' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        disabled={isSeparating}
                        className={`btn ${sepFormat === f.id ? 'btn-primary' : ''}`}
                        onClick={() => setSepFormat(f.id as 'png' | 'jpg' | 'svg')}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution scale */}
                <div className="gif-config-item">
                  <span className="gif-config-label">Resolution Scale ({sepExportW}×{sepExportH}px per plate)</span>
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
                        disabled={isSeparating}
                        className={`btn ${sepScale === s.val ? 'btn-primary' : ''}`}
                        onClick={() => setSepScale(s.val)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality (JPG only) */}
                {sepFormat === 'jpg' && (
                  <div className="gif-config-item">
                    <span className="gif-config-label">JPG Quality ({Math.round(sepQuality * 100)}%)</span>
                    <div className="gif-btn-group">
                      {[0.8, 0.9, 0.95, 1.0].map((q) => (
                        <button
                          key={q}
                          disabled={isSeparating}
                          className={`btn ${sepQuality === q ? 'btn-primary' : ''}`}
                          onClick={() => setSepQuality(q)}
                        >
                          {Math.round(q * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plate style */}
                <div className="gif-config-item">
                  <span className="gif-config-label">Plate Style</span>
                  <div className="gif-btn-group">
                    <button
                      disabled={isSeparating || sepFormat === 'jpg'}
                      className={`btn ${sepStyle === 'color' && sepFormat !== 'jpg' ? 'btn-primary' : ''}`}
                      onClick={() => setSepStyle('color')}
                      title="Each plate in its own colour on transparency. Stack them to rebuild the image."
                    >
                      Colour on Transparent
                    </button>
                    <button
                      disabled={isSeparating}
                      className={`btn ${sepStyle === 'ink' || sepFormat === 'jpg' ? 'btn-primary' : ''}`}
                      onClick={() => setSepStyle('ink')}
                      title="Coverage mask, black on white. What a screen-printing press wants."
                    >
                      Ink Plate (Black on White)
                    </button>
                  </div>
                  {sepFormat === 'jpg' && (
                    <span style={{ fontSize: '9.5px', color: 'var(--accent)', marginTop: '4px', display: 'block' }}>
                      JPG has no transparency, so plates are forced to ink. Use PNG or SVG to stack them.
                    </span>
                  )}
                </div>

                {/* Layered SVG */}
                {sepFormat === 'svg' && (
                  <div className="gif-config-item">
                    <span className="gif-config-label">SVG Layout</span>
                    <div className="gif-btn-group">
                      <button
                        disabled={isSeparating}
                        className={`btn ${sepLayeredSvg ? 'btn-primary' : ''}`}
                        onClick={() => setSepLayeredSvg(true)}
                        title="One SVG with a named layer per ink — what Illustrator and Figma read on import"
                      >
                        One File, Layered
                      </button>
                      <button
                        disabled={isSeparating}
                        className={`btn ${!sepLayeredSvg ? 'btn-primary' : ''}`}
                        onClick={() => setSepLayeredSvg(false)}
                        title="A separate SVG file per ink, in a ZIP"
                      >
                        One File Per Ink
                      </button>
                    </div>
                  </div>
                )}

                {/* Output summary */}
                <div className="gif-config-item">
                  <span className="gif-config-label">
                    Output ({sepExportW}×{sepExportH}px per plate)
                  </span>
                  <div className="gif-btn-group">
                    <button
                      disabled={isSeparating}
                      className="btn btn-primary"
                      onClick={handleGenerateSeparation}
                      style={{ minWidth: '150px', justifyContent: 'center' }}
                    >
                      {isSeparating ? <Loader2 size={11} className="dice-spin" /> : <Layers size={11} />}
                      {isSeparating ? 'SEPARATING…' : sepResult ? 'REGENERATE PLATES' : 'GENERATE PLATES'}
                    </button>
                  </div>
                </div>
              </div>

              {sepError && (
                <div className="gif-progress-box">
                  <div style={{ fontSize: '11px', color: 'var(--accent)' }}>{sepError}</div>
                </div>
              )}

              {/*
                Refusals explain themselves and point at the control that fixes
                it. A separation that cannot run is nearly always a colour-mode
                choice, not a failure.
              */}
              {sepResult?.analysis.refusal && (
                <div className="gif-progress-box">
                  <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                    {sepResult.analysis.refusal === 'mono' && (
                      <>
                        <strong style={{ color: 'var(--accent)' }}>NOTHING TO SEPARATE.</strong>{' '}
                        This render is monochrome — a single tint applied over the whole raster, so
                        there is only one ink. Pick a palette, Duotone, Tritone or Content colour in
                        the <strong>COLORS</strong> panel first.
                      </>
                    )}
                    {sepResult.analysis.refusal === 'too-many' && (
                      <>
                        <strong style={{ color: 'var(--accent)' }}>
                          {sepResult.analysis.distinctColors} DISTINCT COLOURS.
                        </strong>{' '}
                        That is past the {MAX_PLATES}-plate limit and would not be editable by hand
                        anyway. Choose an indexed palette, or set <strong>Quantize Levels</strong> in
                        TONAL CONTROLS to reduce the render to a countable set of inks.
                      </>
                    )}
                    {sepResult.analysis.refusal === 'empty' && (
                      <>
                        <strong style={{ color: 'var(--accent)' }}>FRAME IS EMPTY.</strong>{' '}
                        Every cell is transparent, so there is nothing to split.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Plate list */}
              {sepResult && !sepResult.analysis.refusal && (
                <div className="gif-preview-card" style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      marginBottom: '8px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {sepResult.analysis.plates.length} PLATES •{' '}
                    {sepResult.blob ? (sepResult.blob.size / 1024).toFixed(1) : 0} KB •{' '}
                    {sepFormat === 'svg' && sepLayeredSvg ? 'LAYERED SVG' : 'ZIP ARCHIVE'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {sepResult.analysis.plates.map((plate, i) => (
                      <div
                        key={plate.hex + i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          // Five fields per row; on a phone they need somewhere to go.
                          flexWrap: 'wrap',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span style={{ color: 'var(--text-dim)', minWidth: '20px' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            flexShrink: 0,
                            background: plate.hex,
                            border: '1px solid var(--border-color)',
                            borderRadius: '2px',
                          }}
                        />
                        <span style={{ color: 'var(--text-primary)', minWidth: '64px' }}>{plate.hex}</span>
                        <span>{plate.cellCount.toLocaleString()} cells</span>
                        <span style={{ color: 'var(--text-dim)' }}>
                          {((plate.cellCount / sepResult.analysis.opaqueCells) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
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
                  <span className="gif-config-label">Resolution Scale ({gifExportW}×{gifExportH}px)</span>
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
          ) : (
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
                  <span className="gif-config-label">Resolution Quality ({videoExportW}×{videoExportH}px)</span>
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
                className="btn btn-primary btn-download-file"
                onClick={handleDownload}
                title={`Download ${effectiveFileName}`}
                disabled={!imageBlob || isCapturingImage}
              >
                <Download size={12} />
                DOWNLOAD <span className="download-file-name">{truncateFileName(effectiveFileName)}</span>
              </button>
            </>
          ) : activeTab === 'separation' ? (
            <>
              <button
                className="btn"
                onClick={handleGenerateSeparation}
                disabled={isSeparating}
                title="Re-render the frame and rebuild every plate"
              >
                <RotateCcw size={12} />
                {sepResult ? 'REGENERATE' : 'GENERATE'}
              </button>
              <button
                className="btn btn-primary btn-download-file"
                onClick={handleDownload}
                disabled={!sepResult?.blob || isSeparating}
                title={
                  sepResult?.analysis.refusal
                    ? 'This render has nothing to separate'
                    : !sepResult
                    ? 'Generate the plates first'
                    : `Download ${effectiveFileName}`
                }
              >
                <Download size={12} />
                DOWNLOAD <span className="download-file-name">{truncateFileName(effectiveFileName)}</span>
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
                  className="btn btn-primary btn-download-file"
                  onClick={handleDownload}
                  title={`Download ${effectiveFileName}`}
                >
                  <Download size={12} />
                  DOWNLOAD <span className="download-file-name">{truncateFileName(effectiveFileName)}</span>
                </button>
              )}
            </>
          ) : (
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
                  className="btn btn-primary btn-download-file"
                  onClick={handleDownload}
                  title={`Download ${effectiveFileName}`}
                >
                  <Download size={12} />
                  DOWNLOAD <span className="download-file-name">{truncateFileName(effectiveFileName)}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
