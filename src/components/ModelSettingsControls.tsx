import React, { useState, useRef } from 'react';
import { ModelConfig, BuiltinModelId } from '../types/ascii';
import { parseModelFile } from '../engine/modelLoader';
import { Upload, FileCode, RotateCcw, Sliders, Box, AlertCircle } from 'lucide-react';
import { BufferGeometry } from 'three';

interface ModelSettingsControlsProps {
  config: ModelConfig;
  onChangeConfig: (newConfig: ModelConfig) => void;
  onLoadCustomGeometry: (geometry: BufferGeometry, fileName: string, fileType: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply', stats: { vertices: number; faces: number }) => void;
  onSelectBuiltinGeometry: (id: BuiltinModelId) => void;
}

export const ModelSettingsControls: React.FC<ModelSettingsControlsProps> = ({
  config,
  onChangeConfig,
  onLoadCustomGeometry,
  onSelectBuiltinGeometry,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = <K extends keyof ModelConfig>(key: K, val: ModelConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const handleProcessFile = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await parseModelFile(file);
      onLoadCustomGeometry(res.geometry, res.fileName, res.fileType, res.stats);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse 3D file.');
    } finally {
      setIsLoading(false);
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

  const builtinOptions: { id: BuiltinModelId; label: string }[] = [
    { id: 'torus-knot', label: 'Torus Knot' },
    { id: 'teapot', label: 'Teapot' },
    { id: 'skull', label: 'Cyber Skull' },
    { id: 'dna', label: 'DNA Helix' },
    { id: 'spaceship', label: 'Starfighter' },
    { id: 'crystal', label: 'Crystal' },
    { id: 'saturn', label: 'Saturn' },
    { id: 'suzanne', label: 'Suzanne' },
    { id: 'dome', label: 'Dome' },
    { id: 'mobius', label: 'Möbius' },
    { id: 'sphere', label: 'Sphere' },
    { id: 'cube', label: 'Cube' },
    { id: 'cylinder', label: 'Cylinder' },
  ];

  return (
    <div className="tab-content">
      {/* 1. 3D Model File Upload */}
      <div className="control-section">
        <div className="section-header">
          <span>Upload 3D Model</span>
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
          <Upload size={20} style={{ color: 'var(--accent)', marginBottom: '4px' }} />
          <div style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-primary)' }}>
            {isLoading ? 'PARSING 3D MODEL...' : 'DROP 3D FILE OR CLICK TO BROWSE'}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
            Supports .OBJ, .STL, .GLTF, .GLB, .PLY
          </div>
        </div>

        {errorMsg && (
          <div className="control-error-box" style={{ marginTop: '8px' }}>
            <AlertCircle size={12} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Active Model Info */}
        <div className="model-info-card" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileCode size={12} />
              {config.sourceType === 'file' ? config.fileName || 'Custom 3D Model' : `Built-in: ${config.modelId.toUpperCase()}`}
            </span>
            <span className="brand-badge" style={{ fontSize: '8px' }}>
              {config.sourceType === 'file' ? config.fileType?.toUpperCase() : 'PRIMITIVE'}
            </span>
          </div>
          {config.polyStats && (
            <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
              <span>VERTICES: <strong>{config.polyStats.vertices.toLocaleString()}</strong></span>
              <span>FACES: <strong>{config.polyStats.faces.toLocaleString()}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Built-in Shape Selector */}
      <div className="control-section">
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

      {/* 3. Transformations & Scaling */}
      <div className="control-section">
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
              max={3.5}
              step={0.05}
              value={config.scale}
              onChange={(e) => update('scale', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.scale.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Per-axis Scale */}
        <div className="control-row">
          <span className="control-label">Scale X / Y / Z</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="number"
              className="number-input"
              style={{ width: '42px', padding: '2px', fontSize: '10px' }}
              step={0.1}
              min={0.1}
              max={5.0}
              value={config.scaleX}
              onChange={(e) => update('scaleX', parseFloat(e.target.value) || 1)}
            />
            <input
              type="number"
              className="number-input"
              style={{ width: '42px', padding: '2px', fontSize: '10px' }}
              step={0.1}
              min={0.1}
              max={5.0}
              value={config.scaleY}
              onChange={(e) => update('scaleY', parseFloat(e.target.value) || 1)}
            />
            <input
              type="number"
              className="number-input"
              style={{ width: '42px', padding: '2px', fontSize: '10px' }}
              step={0.1}
              min={0.1}
              max={5.0}
              value={config.scaleZ}
              onChange={(e) => update('scaleZ', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Translation Offsets */}
        <div className="control-row">
          <span className="control-label">Position Offset X</span>
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
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.offsetX.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Position Offset Y</span>
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
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.offsetY.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Position Offset Z</span>
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
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.offsetZ.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Reset Transforms */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button
            className="btn btn-sm"
            style={{ flex: 1 }}
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
            <RotateCcw size={11} /> RESET TRANSFORMS
          </button>
        </div>
      </div>

      {/* 4. Surface & Geometry Properties */}
      <div className="control-section">
        <div className="section-header">
          <span>Surface & Geometry</span>
        </div>

        <div className="control-row">
          <span className="control-label">
            Flat Shading
            <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Faceted low-poly polygon faces</div>
          </span>
          <button
            className={`btn btn-sm ${config.flatShading ? 'btn-primary' : ''}`}
            onClick={() => update('flatShading', !config.flatShading)}
          >
            {config.flatShading ? 'ENABLED' : 'SMOOTH'}
          </button>
        </div>

        <div className="control-row" style={{ marginTop: '6px' }}>
          <span className="control-label">
            Double-Sided Rendering
            <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Render inside and outside faces</div>
          </span>
          <button
            className={`btn btn-sm ${config.doubleSided ? 'btn-primary' : ''}`}
            onClick={() => update('doubleSided', !config.doubleSided)}
          >
            {config.doubleSided ? 'DOUBLE' : 'SINGLE'}
          </button>
        </div>
      </div>
    </div>
  );
};
