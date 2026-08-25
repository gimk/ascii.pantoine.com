import React, { useState, useRef, useMemo } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { ModelConfig, BuiltinModelId } from '../types/ascii';
import { parseModelFile } from '../engine/modelLoader';
import {
  KHRONOS_CATEGORIES,
  KhronosCategory,
  Khronos3DModel,
  searchKhronosModels,
} from '../engine/khronos3dModels';
import {
  Upload,
  FileCode,
  Sliders,
  Box,
  AlertCircle,
  Globe,
  Search,
  Check,
  Loader2,
} from 'lucide-react';
import { BufferGeometry } from 'three';

export interface ModelImportControlsProps {
  config: ModelConfig;
  onLoadCustomGeometry: (
    geometry: BufferGeometry,
    fileName: string,
    fileType: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply',
    stats: { vertices: number; faces: number }
  ) => void;
  onSelectBuiltinGeometry?: (id: BuiltinModelId) => void;
  onLoadRemoteModel: (model: Khronos3DModel) => Promise<void>;
  onStartLoading?: (fileName: string, statusText?: string) => void;
  onEndLoading?: () => void;
}

export const ModelImportControls: React.FC<ModelImportControlsProps> = ({
  config,
  onLoadCustomGeometry,
  onSelectBuiltinGeometry: _onSelectBuiltinGeometry,
  onLoadRemoteModel,
  onStartLoading,
  onEndLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KhronosCategory>('All');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const displayedOnlineModels = useMemo(() => {
    return searchKhronosModels(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const handleProcessFile = async (file: File) => {
    setIsLoadingFile(true);
    onStartLoading?.(file.name, 'Parsing');
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
    setErrorMsg(null);
    try {
      await onLoadRemoteModel(model);
    } catch (err: any) {
      setErrorMsg(err?.message || `Failed to load 3D model ${model.title}.`);
    } finally {
      setLoadingModelId(null);
    }
  };

  return (
    <div className="tab-content">
      {/* 1. Online 3D Library (Khronos & Open CDN - Text Cards) */}
      <CollapsibleSection
        title="Online 3D Library"
        icon={<Globe size={12} />}
        badge={<span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold' }}>KHRONOS &amp; THREE.JS</span>}
        persistKey="ModelSettingsControls-online-3d-library"
        defaultOpen={true}
      >
        <p style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: 1.35 }}>
          Explore official Khronos glTF benchmark assets &amp; open 3D models. Click any model to render in ASCII.
        </p>

        {/* Search Input */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="number-input"
              style={{ width: '100%', textAlign: 'left', padding: '5px 8px 5px 24px', fontSize: '11px' }}
              placeholder="Search 3D models (duck, ferrari, robot, helmet)..."
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

        {/* Category Pills */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            paddingBottom: '4px',
            marginBottom: '8px',
            scrollbarWidth: 'none',
          }}
        >
          {KHRONOS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
              style={{ whiteSpace: 'nowrap', fontSize: '9px', padding: '2px 8px' }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="alert-box alert-error" style={{ marginBottom: '8px', padding: '6px 8px', fontSize: '10px' }}>
            <AlertCircle size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dense Text-List / Card Grid */}
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '2px',
          }}
        >
          {displayedOnlineModels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-dim)', fontSize: '10px' }}>
              No models matched "{searchQuery}"
            </div>
          ) : (
            displayedOnlineModels.map((model) => {
              const isSelected =
                config.sourceType === 'url' &&
                (config.remoteUrl === model.downloadUrl || config.modelId === model.id);
              const isItemLoading = loadingModelId === model.id;

              return (
                <div
                  key={model.id}
                  onClick={() => !isItemLoading && handleLoadRemote(model)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: isSelected ? 'rgba(0, 255, 65, 0.08)' : 'var(--bg-control)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-color)'}`,
                    borderRadius: '3px',
                    cursor: isItemLoading ? 'wait' : 'pointer',
                    transition: 'all 0.12s ease-in-out',
                    gap: '8px',
                  }}
                  className="online-model-item"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {model.title}
                      </span>
                    </div>
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', lineHeight: 1.2 }}>
                      by {model.author} ({model.license})
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: '8.5px',
                        color: 'var(--text-dim)',
                        background: 'var(--bg-primary)',
                        padding: '1px 4px',
                        borderRadius: '2px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {model.triCount.toLocaleString()} tris
                    </span>
                    {isItemLoading ? (
                      <Loader2 size={12} className="dice-spin" color="var(--accent)" />
                    ) : isSelected ? (
                      <Check size={12} color="var(--accent)" />
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CollapsibleSection>

      {/* 2. Custom 3D File Upload (Dropzone) */}
      <CollapsibleSection
        title="Upload Custom 3D File"
        icon={<Upload size={12} />}
        persistKey="ModelSettingsControls-upload-custom-3d-file"
        defaultOpen={false}
      >
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
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".obj,.stl,.gltf,.glb,.ply"
            onChange={handleFileChange}
          />
          {isLoadingFile ? (
            <Loader2 size={24} className="dice-spin" color="var(--accent)" style={{ marginBottom: '8px' }} />
          ) : (
            <FileCode size={24} color="var(--accent)" style={{ marginBottom: '8px' }} />
          )}
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {isLoadingFile ? 'PARSING 3D GEOMETRY...' : 'DROP 3D MODEL FILE HERE'}
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
            Supports .OBJ, .STL, .GLTF, .GLB, .PLY or click to browse
          </div>
        </div>

        {/* Current Active Geometry & Polycount Specs */}
        <div
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'var(--bg-control)',
            border: '1px solid var(--border-color)',
            borderRadius: '3px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={config.fileName || 'Default Mesh'}>
              {config.fileName || (config.sourceType === 'url' ? 'Online 3D Model' : 'Built-in 3D Model')}
            </span>
            <span className="brand-badge" style={{ fontSize: '8px' }}>
              {config.sourceType === 'file'
                ? config.fileType?.toUpperCase()
                : config.sourceType === 'url'
                ? 'ONLINE 3D'
                : 'BUILT-IN'}
            </span>
          </div>
          {config.polyStats && (
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
              <span>VERTICES: <strong>{config.polyStats.vertices.toLocaleString()}</strong></span>
              <span>FACES: <strong>{config.polyStats.faces.toLocaleString()}</strong></span>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};

export interface ModelMeshControlsProps {
  config: ModelConfig;
  onChangeConfig: (newConfig: ModelConfig) => void;
}

export const ModelMeshControls: React.FC<ModelMeshControlsProps> = ({
  config,
  onChangeConfig,
}) => {
  const update = <K extends keyof ModelConfig>(key: K, val: ModelConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  return (
    <div className="tab-content">
      {/* 1. Transformations & Scaling */}
      <CollapsibleSection
        title="Transformations &amp; Scale"
        icon={<Sliders size={12} />}
        persistKey="ModelSettingsControls-transformations-scale"
        defaultOpen={true}
        onReset={() => {
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
        resetTitle="Reset model transformation and scaling"
      >
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
      </CollapsibleSection>

      {/* 2. Geometry Processing & Mesh Options */}
      <CollapsibleSection
        title="Mesh &amp; Normal Settings"
        icon={<Box size={12} />}
        persistKey="ModelSettingsControls-mesh-normal-settings"
        defaultOpen={false}
      >
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
      </CollapsibleSection>
    </div>
  );
};

export type ModelSettingsControlsProps = ModelImportControlsProps & ModelMeshControlsProps;

export const ModelSettingsControls: React.FC<ModelSettingsControlsProps> = (props) => {
  return (
    <>
      <ModelImportControls {...props} />
      <ModelMeshControls config={props.config} onChangeConfig={props.onChangeConfig} />
    </>
  );
};
