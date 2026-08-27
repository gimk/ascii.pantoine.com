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
        badge={<span className="collapsible-badge-inline is-accent">KHRONOS &amp; THREE.JS</span>}
        persistKey="ModelSettingsControls-online-3d-library"
      >
        <p className="control-hint control-hint-dim control-row-spaced-below">
          Explore official Khronos glTF benchmark assets &amp; open 3D models. Click any model to render in ASCII.
        </p>

        {/* Search Input */}
        <div className="model-search-row">
          <div className="model-search-field">
            <input
              type="text"
              className="number-input"
              placeholder="Search 3D models (duck, ferrari, robot, helmet)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={12} className="model-search-icon" />
          </div>
          {searchQuery && (
            <button className="btn btn-sm" onClick={() => setSearchQuery('')} title="Clear search">
              CLEAR
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="model-category-rail">
          {KHRONOS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`chip-btn model-category-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="alert-box alert-error alert-box-sm">
            <AlertCircle size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dense Text-List / Card Grid */}
        <div className="model-result-list">
          {displayedOnlineModels.length === 0 ? (
            <div className="model-result-empty">
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
                  className={`online-model-item${isSelected ? ' is-selected' : ''}${
                    isItemLoading ? ' is-loading' : ''
                  }`}
                >
                  <div className="online-model-main">
                    <div className="control-inline">
                      <span
                        className="online-model-name"
                      >
                        {model.title}
                      </span>
                    </div>
                    <span className="online-model-credit">
                      by {model.author} ({model.license})
                    </span>
                  </div>

                  <div className="online-model-meta">
                    <span className="online-model-tris">
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
            className="file-input-hidden"
            accept=".obj,.stl,.gltf,.glb,.ply"
            onChange={handleFileChange}
          />
          {isLoadingFile ? (
            <Loader2 size={24} className="dice-spin dropzone-icon" color="var(--accent)" />
          ) : (
            <FileCode size={24} className="dropzone-icon" color="var(--accent)" />
          )}
          <div className="dropzone-title">
            {isLoadingFile ? 'PARSING 3D GEOMETRY...' : 'DROP 3D MODEL FILE HERE'}
          </div>
          <div className="dropzone-hint">
            Supports .OBJ, .STL, .GLTF, .GLB, .PLY or click to browse
          </div>
        </div>

        {/* Current Active Geometry & Polycount Specs */}
        <div className="geometry-card">
          <div className="info-card-row">
            <span className="geometry-card-name" title={config.fileName || 'Default Mesh'}>
              {config.fileName || (config.sourceType === 'url' ? 'Online 3D Model' : 'Built-in 3D Model')}
            </span>
            <span className="brand-badge geometry-card-badge">
              {config.sourceType === 'file'
                ? config.fileType?.toUpperCase()
                : config.sourceType === 'url'
                ? 'ONLINE 3D'
                : 'BUILT-IN'}
            </span>
          </div>
          {config.polyStats && (
            <div className="geometry-card-stats">
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
            className={`btn btn-sm btn-toggle btn-toggle-wide ${config.autoCenter ? 'btn-primary' : ''}`}
            onClick={() => update('autoCenter', !config.autoCenter)}
          >
            {config.autoCenter ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Normalize Bounding Size</span>
          <button
            className={`btn btn-sm btn-toggle btn-toggle-wide ${config.normalizeSize ? 'btn-primary' : ''}`}
            onClick={() => update('normalizeSize', !config.normalizeSize)}
          >
            {config.normalizeSize ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Flat Shading (Faceted Normals)</span>
          <button
            className={`btn btn-sm btn-toggle btn-toggle-wide ${config.flatShading ? 'btn-primary' : ''}`}
            onClick={() => update('flatShading', !config.flatShading)}
          >
            {config.flatShading ? 'FLAT' : 'SMOOTH'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Wireframe Edges Mode</span>
          <button
            className={`btn btn-sm btn-toggle btn-toggle-wide ${config.wireframe ? 'btn-primary' : ''}`}
            onClick={() => update('wireframe', !config.wireframe)}
          >
            {config.wireframe ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Double-Sided Faces</span>
          <button
            className={`btn btn-sm btn-toggle btn-toggle-wide ${config.doubleSided ? 'btn-primary' : ''}`}
            onClick={() => update('doubleSided', !config.doubleSided)}
          >
            {config.doubleSided ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="control-row">
          <span className="control-label">Invert Face Normals</span>
          <button
            className={`btn btn-sm ${config.invertNormals ? 'btn-primary' : ''}`}
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
