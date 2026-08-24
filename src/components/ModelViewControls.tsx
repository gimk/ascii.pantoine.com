import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { ModelViewConfig, ModelShadingMode } from '../types/ascii';
import { Play, Pause, Sun, Camera, Eye, RotateCw } from 'lucide-react';

interface ModelViewControlsProps {
  config: ModelViewConfig;
  onChangeConfig: (newConfig: ModelViewConfig) => void;
  onResetRotation: () => void;
}

export const ModelViewControls: React.FC<ModelViewControlsProps> = ({
  config,
  onChangeConfig,
  onResetRotation,
}) => {
  const update = <K extends keyof ModelViewConfig>(key: K, val: ModelViewConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: val,
    });
  };

  const shadingModes: { mode: ModelShadingMode; label: string }[] = [
    { mode: 'shaded', label: 'SHADED' },
    { mode: 'outline', label: 'OUTLINES' },
    { mode: 'wireframe', label: 'WIREFRAME' },
    { mode: 'depth', label: 'DEPTH MAP' },
    { mode: 'normals', label: 'NORMALS' },
    { mode: 'points', label: 'POINTS' },
  ];

  return (
    <div className="tab-content">
      {/* 1. Shading & Render Mode */}
      <CollapsibleSection
        title="ASCII Shading Mode"
        icon={<Eye size={12} />}
        persistKey="ModelViewControls-ascii-shading-mode"
        badge={shadingModes.find((s) => s.mode === config.shadingMode)?.label}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
          {shadingModes.map((item) => (
            <button
              key={item.mode}
              className={`btn btn-sm ${config.shadingMode === item.mode ? 'btn-primary' : ''}`}
              onClick={() => update('shadingMode', item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* 2. Auto-Rotation & Dynamics */}
      <CollapsibleSection title="Rotation &amp; Dynamics" icon={<RotateCw size={12} />} persistKey="ModelViewControls-rotation-dynamics">
        <div className="control-row">
          <span className="control-label">Auto-Rotation</span>
          <button
            className={`btn btn-sm ${config.autoRotate ? 'btn-primary' : ''}`}
            onClick={() => update('autoRotate', !config.autoRotate)}
          >
            {config.autoRotate ? <Pause size={10} /> : <Play size={10} />}
            {config.autoRotate ? 'SPINNING' : 'PAUSED'}
          </button>
        </div>

        {/* Speed X */}
        <div className="control-row">
          <span className="control-label">X Speed (Pitch)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.autoRotateSpeedX}
              onChange={(e) => update('autoRotateSpeedX', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.autoRotateSpeedX.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Speed Y */}
        <div className="control-row">
          <span className="control-label">Y Speed (Yaw)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.autoRotateSpeedY}
              onChange={(e) => update('autoRotateSpeedY', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.autoRotateSpeedY.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Speed Z */}
        <div className="control-row">
          <span className="control-label">Z Speed (Roll)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-2.0}
              max={2.0}
              step={0.05}
              value={config.autoRotateSpeedZ}
              onChange={(e) => update('autoRotateSpeedZ', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.autoRotateSpeedZ.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ borderTop: '1px solid var(--border-color)', margin: '6px 0', opacity: 0.7 }} />

        {/* Manual Angle Adjustments */}
        <div className="control-row">
          <span className="control-label">Manual Pitch (X Angle)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-3.14}
              max={3.14}
              step={0.05}
              value={config.manualRotationX}
              onChange={(e) => update('manualRotationX', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {Math.round((config.manualRotationX * 180) / Math.PI)}°
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Manual Yaw (Y Angle)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-3.14}
              max={3.14}
              step={0.05}
              value={config.manualRotationY}
              onChange={(e) => update('manualRotationY', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {Math.round((config.manualRotationY * 180) / Math.PI)}°
            </span>
          </div>
        </div>

        <div className="control-row">
          <span className="control-label">Manual Roll (Z Angle)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-3.14}
              max={3.14}
              step={0.05}
              value={config.manualRotationZ}
              onChange={(e) => update('manualRotationZ', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {Math.round((config.manualRotationZ * 180) / Math.PI)}°
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={onResetRotation}>
            RESET ANGLES (0°)
          </button>
        </div>
      </CollapsibleSection>

      {/* 3. Lighting & Contrast */}
      <CollapsibleSection title="Lighting &amp; Contrast" icon={<Sun size={12} />} persistKey="ModelViewControls-lighting-contrast">
        {/* Light Azimuth */}
        <div className="control-row">
          <span className="control-label">Light Azimuth (Angle)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0}
              max={360}
              step={5}
              value={config.lightAngleX}
              onChange={(e) => update('lightAngleX', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.lightAngleX}°
            </span>
          </div>
        </div>

        {/* Light Elevation */}
        <div className="control-row">
          <span className="control-label">Light Elevation</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-80}
              max={85}
              step={5}
              value={config.lightAngleY}
              onChange={(e) => update('lightAngleY', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.lightAngleY}°
            </span>
          </div>
        </div>

        {/* Light Intensity */}
        <div className="control-row">
          <span className="control-label">Direct Light Strength</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.1}
              max={2.5}
              step={0.05}
              value={config.lightIntensity}
              onChange={(e) => update('lightIntensity', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.lightIntensity.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Ambient Light */}
        <div className="control-row">
          <span className="control-label">Ambient Fill Light</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.0}
              max={1.0}
              step={0.05}
              value={config.ambientLight}
              onChange={(e) => update('ambientLight', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.ambientLight.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Contrast */}
        <div className="control-row">
          <span className="control-label">ASCII Contrast</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.5}
              max={2.5}
              step={0.05}
              value={config.contrast}
              onChange={(e) => update('contrast', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.contrast.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Brightness / Bias */}
        <div className="control-row">
          <span className="control-label">Brightness Bias</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={-0.5}
              max={0.5}
              step={0.02}
              value={config.brightness}
              onChange={(e) => update('brightness', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.brightness > 0 ? `+${config.brightness.toFixed(2)}` : config.brightness.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Invert Characters */}
        <div className="control-row">
          <span className="control-label">Invert Characters</span>
          <button
            className={`btn btn-sm ${config.invert ? 'btn-primary' : ''}`}
            onClick={() => update('invert', !config.invert)}
          >
            {config.invert ? 'INVERTED' : 'NORMAL'}
          </button>
        </div>

        {/* Outline / Edge Extraction */}
        <div className="control-row" style={{ marginTop: '8px' }}>
          <span className="control-label">Edge Outline Boost</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={0.0}
              max={2.0}
              step={0.1}
              value={config.edgeWeight}
              onChange={(e) => update('edgeWeight', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.edgeWeight.toFixed(1)}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {/* 4. Camera & Optics */}
      <CollapsibleSection title="Camera &amp; Optics" icon={<Camera size={12} />} persistKey="ModelViewControls-camera-optics">
        {/* Camera Distance */}
        <div className="control-row">
          <span className="control-label">Camera Distance / Zoom</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={1.2}
              max={6.0}
              step={0.1}
              value={config.cameraDistance}
              onChange={(e) => update('cameraDistance', parseFloat(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right' }}>
              {config.cameraDistance.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Field of View */}
        <div className="control-row">
          <span className="control-label">Field of View (FOV)</span>
          <div className="control-input-wrapper">
            <input
              type="range"
              className="range-slider"
              min={20}
              max={85}
              step={1}
              value={config.fov}
              disabled={config.isOrthographic}
              onChange={(e) => update('fov', parseInt(e.target.value))}
            />
            <span style={{ fontSize: '11px', minWidth: '32px', textAlign: 'right', opacity: config.isOrthographic ? 0.5 : 1 }}>
              {config.fov}°
            </span>
          </div>
        </div>

        {/* Projection Mode */}
        <div className="control-row">
          <span className="control-label">Projection Mode</span>
          <button
            className={`btn btn-sm ${config.isOrthographic ? 'btn-primary' : ''}`}
            onClick={() => update('isOrthographic', !config.isOrthographic)}
          >
            {config.isOrthographic ? 'ORTHOGRAPHIC' : 'PERSPECTIVE'}
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
};
