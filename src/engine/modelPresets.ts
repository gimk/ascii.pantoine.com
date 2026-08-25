import { ModelConfig, ModelViewConfig, ModelPreset } from '../types/ascii';
import { CHARSETS } from './renderer';

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  sourceType: 'preset',
  modelId: 'torus-knot',
  scale: 1.0,
  scaleX: 1.0,
  scaleY: 1.0,
  scaleZ: 1.0,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  normalizeSize: true,
  autoCenter: true,
  flatShading: false,
  wireframe: false,
  doubleSided: false,
  invertNormals: false,
};

export const DEFAULT_MODEL_VIEW_CONFIG: ModelViewConfig = {
  shadingMode: 'shaded',
  autoRotate: true,
  autoRotateSpeedX: 0.35,
  autoRotateSpeedY: 0.75,
  autoRotateSpeedZ: 0.15,
  manualRotationX: 0.2,
  manualRotationY: 0.0,
  manualRotationZ: 0.0,
  wobbleSpeed: 0.0,
  wobbleAmp: 0.0,
  lightAngleX: 45,
  lightAngleY: 35,
  lightIntensity: 1.25,
  ambientLight: 0.35,
  specularIntensity: 1.1,
  contrast: 1.35,
  brightness: 0.0,
  invert: false,
  edgeThreshold: 0.18,
  edgeWeight: 0.0,
  cameraDistance: 3.2,
  fov: 45,
  isOrthographic: false,
  aspectRatio: 0.50,
};

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'torus-knot',
    name: 'Torus Knot',
    description: 'Hypnotic (2,3) mathematical parametric knot',
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      modelId: 'torus-knot',
      scale: 1.05,
    },
    viewConfig: {
      ...DEFAULT_MODEL_VIEW_CONFIG,
      shadingMode: 'shaded',
      autoRotateSpeedX: 0.35,
      autoRotateSpeedY: 0.75,
      autoRotateSpeedZ: 0.15,
      contrast: 1.4,
    },
    theme: 'cyan',
    densityCharset: CHARSETS[0].chars,
  },
];
