import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { ToggleSwitch } from './controlPrimitives';
import { ModelViewConfig, ModelShadingMode } from '../types/ascii';
import { Sun, Camera, Eye, RotateCw, Boxes } from 'lucide-react';

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
      {/*
       * Shading, dynamics, lighting and camera are one group, nested inside a
       * single collapsible the way the synth parameter block is, so the render
       * tab opens with one model heading rather than four stacked sections.
       */}
      <CollapsibleSection
        title="Model Parameters"
        icon={<Boxes size={12} />}
        persistKey="ModelViewControls-model-parameters"
      >
        <div className="collapsible-nest">
          {/* 1. Auto-Rotation & Dynamics */}
          <CollapsibleSection
            title="Rotation &amp; Dynamics"
            icon={<RotateCw size={12} />}
            persistKey="ModelViewControls-rotation-dynamics"
            defaultOpen={false}
            onReset={onResetRotation}
            resetTitle="Reset 3D rotation angles to 0°"
          >
            <div className="control-row">
              <span className="control-label">Auto-Rotation</span>
              <ToggleSwitch
                checked={Boolean(config.autoRotate)}
                onChange={(val) => update('autoRotate', val)}
                title="Continuous 3D model rotation"
              />
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
                  {config.autoRotateSpeedZ.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Separator */}
            <div className="control-separator" />

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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
                  {Math.round((config.manualRotationZ * 180) / Math.PI)}°
                </span>
              </div>
            </div>
          </CollapsibleSection>

          {/* 3. Lighting & Contrast */}
          <CollapsibleSection
            title="Lighting &amp; Contrast"
            icon={<Sun size={12} />}
            persistKey="ModelViewControls-lighting-contrast"
            defaultOpen={false}
          >
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
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
                <span className="numeral-badge">
                  {config.brightness > 0 ? `+${config.brightness.toFixed(2)}` : config.brightness.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Invert Characters */}
            <div className="control-row">
              <span className="control-label">Invert Characters</span>
              <ToggleSwitch
                checked={Boolean(config.invert)}
                onChange={(val) => update('invert', val)}
                title="Invert 3D character shading"
              />
            </div>

            {/* Outline / Edge Extraction */}
            <div className="control-row control-row-spaced">
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
                <span className="numeral-badge">
                  {config.edgeWeight.toFixed(1)}
                </span>
              </div>
            </div>
          </CollapsibleSection>

          {/* 4. Camera & Optics */}
          <CollapsibleSection
            title="Camera &amp; Optics"
            icon={<Camera size={12} />}
            persistKey="ModelViewControls-camera-optics"
            defaultOpen={false}
          >
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
                <span className="numeral-badge">
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
                <span className="numeral-badge" style={{ opacity: config.isOrthographic ? 0.5 : 1 }}>
                  {config.fov}°
                </span>
              </div>
            </div>

            {/* Aspect Ratio / Horizontal Stretch */}
            <div className="control-row">
              <span className="control-label">Aspect Ratio (H-Stretch)</span>
              <div className="control-input-wrapper">
                <input
                  type="range"
                  className="range-slider"
                  min={0.30}
                  max={0.80}
                  step={0.01}
                  value={config.aspectRatio ?? 0.50}
                  onChange={(e) => update('aspectRatio', parseFloat(e.target.value))}
                />
                <span className="numeral-badge">
                  {(config.aspectRatio ?? 0.50).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Projection Mode */}
            <div className="control-row">
              <span className="control-label">Orthographic Projection</span>
              <ToggleSwitch
                checked={Boolean(config.isOrthographic)}
                onChange={(val) => update('isOrthographic', val)}
                title="Toggle Orthographic vs Perspective projection"
              />
            </div>
          </CollapsibleSection>

          {/* 4. Shading Mode (at end of parameters) */}
          <CollapsibleSection
            title="Shading Mode"
            icon={<Eye size={12} />}
            persistKey="ModelViewControls-shading-mode"
            badge={shadingModes.find((s) => s.mode === config.shadingMode)?.label}
            defaultOpen={false}
          >
            <div className="btn-grid-3">
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
        </div>
      </CollapsibleSection>
    </div>
  );
};
