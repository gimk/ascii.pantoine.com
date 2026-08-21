import React, { useState, useRef, useMemo } from 'react';
import { ModelConfig, BuiltinModelId } from '../types/ascii';
import { parseModelFile } from '../engine/modelLoader';
import {
  Khronos3DModel,
  KhronosCategory,
  KHRONOS_CATEGORIES,
  searchKhronosModels,
} from '../engine/khronos3dModels';
import {
  Upload,
  FileCode,
  RotateCcw,
  Sliders,
  Box,
  AlertCircle,
  Globe,
  Search,
  Sparkles,
  Check,
  Loader2,
} from 'lucide-react';
import { BufferGeometry } from 'three';

interface ModelSettingsControlsProps {
  config: ModelConfig;
  onChangeConfig: (newConfig: ModelConfig) => void;
  onLoadCustomGeometry: (
    geometry: BufferGeometry,
    fileName: string,
    fileType: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply',
    stats: { vertices: number; faces: number }
  ) => void;
  onSelectBuiltinGeometry: (id: BuiltinModelId) => void;
  onLoadRemoteModel: (model: Khronos3DModel) => Promise<void>;
  onStartLoading?: (msg?: string) => void;
  onEndLoading?: () => void;
}

export const ModelSettingsControls: React.FC<ModelSettingsControlsProps> = ({
  config,
  onChangeConfig,
  onLoadCustomGeometry,
  onSelectBuiltinGeometry,
  onLoadRemoteModel,
  onStartLoading,
  onEndLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Online Khronos Library state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KhronosCategory>('All');
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);

  const update = <K extends keyof ModelConfig>(key: K, val: ModelConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const handleProcessFile = async (file: File) => {
    setIsLoadingFile(true);
    onStartLoading?.(`PARSING ${file.name.toUpperCase()}...`);
    setErrorMsg(null);
    try {
      const res = await parseModelFile(file);
      onLoadCustomGeometry(res.geometry, res.fileName, res.fileType, res.stats);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse 3D file.');
    } finally {
      setIsLoadingFile(false);
      onEndLoading?.();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleLoadRemote = async (model: Khronos3DModel) => {
    setLoadingModelId(model.id);
    try {
      await onLoadRemoteModel(model);
    } finally {
      setLoadingModelId(null);
    }
  };

  const displayedOnlineModels = useMemo(() => {
    return searchKhronosModels(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const builtinOptions: { id: BuiltinModelId; label: string }[] = [
    { id: 'torus-knot', label: 'Torus Knot' },
    { id: 'skull', label: 'Skull (OBJ)' },
    { id: 'cube', label: 'Cube' },
    { id: 'cylinder', label: 'Cylinder' },
  ];

  return (
    <div className="tab-content">
      {/* 1. Online 3D Library (Khronos & Open CDN - Text Cards) */}
      <div className="control-section">
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe size={12} style={{ color: 'var(--accent)' }} />
            <span>Online 3D Library</span>
          </div>
          <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold' }}>
            KHRONOS glTF & OPEN CDN
          </span>
        </div>

        <p style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: 1.35 }}>
          Explore official Khronos glTF benchmark assets & open 3D models. Click any model to render in ASCII.
        </p>

        {/* Search Input */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="number-input"
              style={{ width: '100%', textAlign: 'left', padding: '5px 8px 5px 24px', fontSize: '11px' }}
              placeholder="Search 3D models (e.g. duck, ferrari, robot, helmet)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search
              size={12}
              style={{
                position: 'absolute',
                left: '7px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
          </div>
          {searchQuery && (
            <button className="btn btn-sm" onClick={() => setSearchQuery('')} title="Clear search">
              CLEAR
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            paddingBottom: '4px',
            marginBottom: '10px',
            scrollbarWidth: 'none',
          }}
        >
          {KHRONOS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : ''}`}
              style={{
                fontSize: '9px',
                padding: '2px 7px',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Models Grid (Clean text cards without images) */}
        {displayedOnlineModels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontSize: '10px' }}>
            No models found matching "{searchQuery}".
          </div>
        ) : (
          <div
            className="presets-grid"
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              paddingRight: '2px',
              marginBottom: '4px',
            }}
          >
            {displayedOnlineModels.map((model) => {
              const isLoaded =
                config.sourceType === 'url' &&
                (config.remoteUrl === model.downloadUrl || config.modelId === model.id);
              const isLoading = loadingModelId === model.id;

              return (
                <button
                  key={model.id}
                  className={`preset-card ${isLoaded ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    minHeight: '62px',
                    padding: '8px 10px',
                  }}
                  disabled={isLoading}
                  onClick={() => handleLoadRemote(model)}
                >
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '2px',
                      }}
                    >
                      <div className="preset-card-title" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Box size={11} style={{ flexShrink: 0 }} />
                        {model.title}
                      </div>
                      <span
                        style={{
                          fontSize: '8px',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-panel)',
                          padding: '1px 4px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '2px',
                        }}
                      >
                        {model.triCount} tris
                      </span>
                    </div>

                    <div className="preset-card-desc" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                      by {model.author} ({model.license})
                    </div>
                  </div>

                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        color: isLoaded ? 'var(--accent)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={9} className="dice-spin" /> FETCHING...
                        </>
                      ) : isLoaded ? (
                        <>
                          <Check size={9} /> ACTIVE
                        </>
                      ) : (
                        <>
                          <Sparkles size={9} /> LOAD ASCII
                        </>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Upload Custom 3D Model */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>Upload Custom 3D File</span>
          <Upload size={12} />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".obj,.stl,.gltf,.glb,.ply"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div
          className={`model-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={18} style={{ color: 'var(--accent)', marginBottom: '4px' }} />
          <div style={{ fontWeight: 700, fontSize: '10.5px', color: 'var(--text-primary)' }}>
            {isLoadingFile ? 'PARSING 3D MODEL...' : 'DROP 3D FILE OR CLICK TO BROWSE'}
          </div>
          <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
            Supports .OBJ, .STL, .GLTF, .GLB, .PLY
          </div>
        </div>

        {errorMsg && (
          <div className="control-error-box" style={{ marginTop: '8px' }}>
            <AlertCircle size={12} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Active Model Info Card */}
        <div className="model-info-card" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
              <FileCode size={12} />
              {config.sourceType === 'file'
                ? config.fileName || 'Custom 3D Model'
                : config.sourceType === 'url'
                ? config.fileName || 'Online Model'
                : `Built-in: ${config.modelId.toUpperCase()}`}
            </span>
            <span className="brand-badge" style={{ fontSize: '8px' }}>
              {config.sourceType === 'file'
                ? config.fileType?.toUpperCase()
                : config.sourceType === 'url'
                ? 'REMOTE GLB'
                : 'PRIMITIVE'}
            </span>
          </div>
          {config.polyStats && (
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
              <span>VERTICES: <strong>{config.polyStats.vertices.toLocaleString()}</strong></span>
              <span>FACES: <strong>{config.polyStats.faces.toLocaleString()}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Built-in Shape Primitives */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>Built-in 3D Primitives</span>
          <Box size={12} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {builtinOptions.map((opt) => (
            <button
              key={opt.id}
              className={`btn btn-sm ${config.sourceType === 'preset' && config.modelId === opt.id ? 'btn-primary' : ''}`}
              onClick={() => onSelectBuiltinGeometry(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Transformations & Scaling */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>Transformations & Scale</span>
          <Sliders size={12} />
        </div>

        {/* Uniform Scale */}
        <div className="control-row">
          <span className="control-label">Uniform Scale</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.1}
              max={4.0}
              step={0.05}
              value={config.scale}
              onChange={(e) => update('scale', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={0.1}
              max={4.0}
              step={0.05}
              value={config.scale}
              onChange={(e) => update('scale', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Scale X */}
        <div className="control-row">
          <span className="control-label">Scale X</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleX}
              onChange={(e) => update('scaleX', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleX}
              onChange={(e) => update('scaleX', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Scale Y */}
        <div className="control-row">
          <span className="control-label">Scale Y</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleY}
              onChange={(e) => update('scaleY', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleY}
              onChange={(e) => update('scaleY', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Scale Z */}
        <div className="control-row">
          <span className="control-label">Scale Z</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleZ}
              onChange={(e) => update('scaleZ', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={0.2}
              max={3.0}
              step={0.05}
              value={config.scaleZ}
              onChange={(e) => update('scaleZ', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Translation Offset X */}
        <div className="control-row">
          <span className="control-label">Offset X</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetX}
              onChange={(e) => update('offsetX', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetX}
              onChange={(e) => update('offsetX', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Translation Offset Y */}
        <div className="control-row">
          <span className="control-label">Offset Y</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetY}
              onChange={(e) => update('offsetY', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetY}
              onChange={(e) => update('offsetY', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Translation Offset Z */}
        <div className="control-row">
          <span className="control-label">Offset Z</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetZ}
              onChange={(e) => update('offsetZ', parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.offsetZ}
              onChange={(e) => update('offsetZ', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Reset Transforms */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <button
            className="btn btn-sm"
            style={{ width: '100%' }}
            onClick={() => {
              onChangeConfig({
                ...config,
                scale: 1.0,
                scaleX: 1.0,
                scaleY: 1.0,
                scaleZ: 1.0,
                offsetX: 0,
                offsetY: 0,
                offsetZ: 0,
              });
            }}
          >
            <RotateCcw size={10} />
            RESET TRANSFORMS
          </button>
        </div>
      </div>

      {/* 5. Geometry Processing & Mesh Options */}
      <div className="control-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-header">
          <span>Mesh & Normal Settings</span>
        </div>

        <div className="control-row">
          <span className="control-label">Auto Center Mesh</span>
          <button
            className={`btn btn-sm ${config.autoCenter ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('autoCenter', !config.autoCenter)}
          >
            {config.autoCenter ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Normalize Bounding Size</span>
          <button
            className={`btn btn-sm ${config.normalizeSize ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('normalizeSize', !config.normalizeSize)}
          >
            {config.normalizeSize ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Flat Shading (Faceted Normals)</span>
          <button
            className={`btn btn-sm ${config.flatShading ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('flatShading', !config.flatShading)}
          >
            {config.flatShading ? 'FLAT' : 'SMOOTH'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Wireframe Edges Mode</span>
          <button
            className={`btn btn-sm ${config.wireframe ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('wireframe', !config.wireframe)}
          >
            {config.wireframe ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Double-Sided Faces</span>
          <button
            className={`btn btn-sm ${config.doubleSided ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('doubleSided', !config.doubleSided)}
          >
            {config.doubleSided ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Invert Face Normals</span>
          <button
            className={`btn btn-sm ${config.invertNormals ? 'btn-primary' : ''}`}
            style={{ minWidth: '80px' }}
            onClick={() => update('invertNormals', !config.invertNormals)}
          >
            {config.invertNormals ? 'INVERTED' : 'NORMAL'}
          </button>
        </div>
      </div>
    </div>
  );
};
