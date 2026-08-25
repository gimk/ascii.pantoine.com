import * as THREE from 'three';
import {
  ModelConfig,
  ModelViewConfig,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  ImageAdjustConfig,
  MediaColorConfig,
} from '../types/ascii';
import { processRasterFrame, toPipelineAdjustments, emptyRasterResult, ProcessedRasterResult } from './rasterEngine';

export interface ModelRenderContext {

  cols: number;
  rows: number;
  time: number;
  density: string;
  geometry: THREE.BufferGeometry | null;
  modelConfig: ModelConfig;
  viewConfig: ModelViewConfig;
  colorConfig?: MediaColorConfig;
  rasterMode?: RasterOutputMode;
  algorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
}



// Scratch Three.js objects for zero allocations during pointer interaction & trackball calculation
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();
const _curEuler = new THREE.Euler();
const _curQ = new THREE.Quaternion();

/**
 * Projects a screen point (normalized relative to center and trackball radius) onto a virtual sphere / trackball.
 * Uses Holroyd's smooth hyperbolic blend to ensure continuous, non-jittering rotation even outside the sphere radius.
 */
function projectTrackball(x: number, y: number, out: THREE.Vector3): void {
  const d2 = x * x + y * y;
  let z: number;
  if (d2 <= 0.5) {
    z = Math.sqrt(Math.max(0, 1.0 - d2));
  } else {
    z = 0.5 / Math.sqrt(d2);
  }
  const len = Math.sqrt(x * x + y * y + z * z);
  out.set(x / len, y / len, z / len);
}

/**
 * Modern screen-space trackball / arcball rotation calculator.
 * Rotates the 3D model relative to the current camera view referential (physical touch/grab direct manipulation),
 * completely avoiding gimbal lock and awkward local-axis twisting regardless of the model's orientation.
 */
export function applyTrackballRotation(
  currentRot: { manualRotationX: number; manualRotationY: number; manualRotationZ: number },
  prevX: number,
  prevY: number,
  currX: number,
  currY: number,
  width: number,
  height: number,
  sensitivity: number = 2.0
): { manualRotationX: number; manualRotationY: number; manualRotationZ: number } {
  if (width <= 0 || height <= 0) return currentRot;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.5;
  if (radius <= 0) return currentRot;

  // Screen coords: invert Y so that +Y is up
  const x1 = (prevX - cx) / radius;
  const y1 = (cy - prevY) / radius;
  const x2 = (currX - cx) / radius;
  const y2 = (cy - currY) / radius;

  projectTrackball(x1, y1, _v1);
  projectTrackball(x2, y2, _v2);

  const dot = Math.max(-1.0, Math.min(1.0, _v1.dot(_v2)));
  const angle = Math.acos(dot) * sensitivity;

  if (angle < 1e-6) {
    return currentRot;
  }

  _axis.crossVectors(_v1, _v2);
  const axisLen = _axis.length();
  if (axisLen < 1e-6) {
    return currentRot;
  }
  _axis.divideScalar(axisLen);

  _deltaQ.setFromAxisAngle(_axis, angle);

  _curEuler.set(
    currentRot.manualRotationX,
    currentRot.manualRotationY,
    currentRot.manualRotationZ,
    'XYZ'
  );
  _curQ.setFromEuler(_curEuler);

  // Pre-multiply delta: apply rotation in view/screen referential
  _curQ.premultiply(_deltaQ);

  _curEuler.setFromQuaternion(_curQ, 'XYZ');

  return {
    manualRotationX: _curEuler.x,
    manualRotationY: _curEuler.y,
    manualRotationZ: _curEuler.z,
  };
}

/**
 * Calculates the exact visual Euler rotation of the model at time t,
 * combining base manual rotation, auto-rotation velocities, and sinusoidal wobble.
 */
export function getVisualRotation(
  viewConfig: {
    manualRotationX: number;
    manualRotationY: number;
    manualRotationZ: number;
    autoRotate: boolean;
    autoRotateSpeedX: number;
    autoRotateSpeedY: number;
    autoRotateSpeedZ: number;
    wobbleSpeed: number;
    wobbleAmp: number;
  },
  time: number
): { rotX: number; rotY: number; rotZ: number } {
  let rotX = viewConfig.manualRotationX;
  let rotY = viewConfig.manualRotationY;
  let rotZ = viewConfig.manualRotationZ;

  if (viewConfig.autoRotate) {
    rotX += time * viewConfig.autoRotateSpeedX;
    rotY += time * viewConfig.autoRotateSpeedY;
    rotZ += time * viewConfig.autoRotateSpeedZ;
  }

  if (viewConfig.wobbleAmp > 0) {
    const wobble = Math.sin(time * viewConfig.wobbleSpeed) * viewConfig.wobbleAmp;
    rotX += wobble * 0.5;
    rotZ += wobble * 0.3;
  }

  return { rotX, rotY, rotZ };
}

/**
 * Applies direct-touch trackball rotation against the LIVE animated visual orientation of the model at time t,
 * deducting the animation offset so that manualRotation stores the base correctly with zero jumping or glitching.
 */
export function applyTrackballRotationWithTime(
  viewConfig: {
    manualRotationX: number;
    manualRotationY: number;
    manualRotationZ: number;
    autoRotate: boolean;
    autoRotateSpeedX: number;
    autoRotateSpeedY: number;
    autoRotateSpeedZ: number;
    wobbleSpeed: number;
    wobbleAmp: number;
  },
  time: number,
  prevX: number,
  prevY: number,
  currX: number,
  currY: number,
  width: number,
  height: number,
  sensitivity: number = 2.0
): { manualRotationX: number; manualRotationY: number; manualRotationZ: number } {
  const currentVisual = getVisualRotation(viewConfig, time);

  // Apply trackball rotation to the LIVE visual orientation
  const nextVisual = applyTrackballRotation(
    {
      manualRotationX: currentVisual.rotX,
      manualRotationY: currentVisual.rotY,
      manualRotationZ: currentVisual.rotZ,
    },
    prevX,
    prevY,
    currX,
    currY,
    width,
    height,
    sensitivity
  );

  // Calculate the active animation offset at time t
  let autoOffsetX = 0;
  let autoOffsetY = 0;
  let autoOffsetZ = 0;

  if (viewConfig.autoRotate) {
    autoOffsetX += time * viewConfig.autoRotateSpeedX;
    autoOffsetY += time * viewConfig.autoRotateSpeedY;
    autoOffsetZ += time * viewConfig.autoRotateSpeedZ;
  }

  if (viewConfig.wobbleAmp > 0) {
    const wobble = Math.sin(time * viewConfig.wobbleSpeed) * viewConfig.wobbleAmp;
    autoOffsetX += wobble * 0.5;
    autoOffsetZ += wobble * 0.3;
  }

  // Deduct animation offset so manualRotation continues seamlessly
  return {
    manualRotationX: nextVisual.manualRotationX - autoOffsetX,
    manualRotationY: nextVisual.manualRotationY - autoOffsetY,
    manualRotationZ: nextVisual.manualRotationZ - autoOffsetZ,
  };
}

// Reusable scratch variables & zero-allocation buffers
let pixelBuffer = new Uint8Array(0);
let modelRgbaBuffer = new Uint8ClampedArray(0);



// Offscreen Three.js WebGL rendering context singleton
class HeadlessModelRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private perspCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private lineSegments: THREE.LineSegments | null = null;
  private pointsObj: THREE.Points | null = null;
  private dirLight: THREE.DirectionalLight;
  private ambLight: THREE.AmbientLight;
  private pointLight: THREE.PointLight;

  // Cached materials for zero garbage-collection switching
  private phongMat: THREE.MeshPhongMaterial;
  private basicWireMat: THREE.MeshBasicMaterial;
  private depthMat: THREE.MeshDepthMaterial;
  private normalMat: THREE.MeshNormalMaterial;
  private pointsMat: THREE.PointsMaterial;

  private currentGeo: THREE.BufferGeometry | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    /*
     * No scene background. The raster pipeline reads the alpha channel of the
     * frame we hand it and marks every cell at or below the alpha threshold as
     * transparent, so the area around the model has to actually come back
     * transparent. An opaque clear made every cell alpha 255, which left the
     * Alpha Cutoff slider inert and, in pixel mode, painted a solid plate of
     * cells behind the model both on screen and in exports.
     */
    this.scene.background = null;

    // Cameras
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

    // Lighting
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(2, 3, 4);
    this.scene.add(this.dirLight);

    this.ambLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambLight);

    this.pointLight = new THREE.PointLight(0xffffff, 0.8, 10);
    this.pointLight.position.set(-2, -1, 3);
    this.scene.add(this.pointLight);

    // Materials
    this.phongMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x555555,
      shininess: 30,
      flatShading: false,
      side: THREE.FrontSide,
    });

    this.basicWireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
    });

    this.depthMat = new THREE.MeshDepthMaterial();
    this.normalMat = new THREE.MeshNormalMaterial();
    this.pointsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      sizeAttenuation: false,
    });

    // Default dummy mesh
    const dummyGeo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(dummyGeo, this.phongMat);
    this.scene.add(this.mesh);

    this.initRenderer();
  }

  private initRenderer() {
    if (typeof document === 'undefined') return;
    try {
      this.canvas = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        // readPixels hands back the raw drawing buffer, so unpremultiplied RGB
        // is what the luminance pass expects -- otherwise a partially
        // transparent cell would read as darker than it is.
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(100, 50, false);
      this.renderer.setClearColor(0x000000, 0);
    } catch (e) {
      console.warn('WebGL init error in HeadlessModelRenderer:', e);
    }
  }

  public renderData(ctx: ModelRenderContext): ProcessedRasterResult {
    const { cols, rows, time, density, geometry, modelConfig, viewConfig } = ctx;

    if (cols <= 0 || rows <= 0 || !geometry || !geometry.attributes?.position || geometry.attributes.position.count === 0) {
      return emptyRasterResult(ctx.rasterMode || 'ascii');
    }
    if (!this.renderer || !this.canvas) {
      this.initRenderer();
      if (!this.renderer || !this.canvas) {
        return emptyRasterResult(ctx.rasterMode || 'ascii');
      }
    }

    const totalCells = cols * rows;
    if (pixelBuffer.length !== totalCells * 4) {
      pixelBuffer = new Uint8Array(totalCells * 4);
    }


    // Resize WebGL canvas if dimensions changed
    if (this.canvas.width !== cols || this.canvas.height !== rows) {
      this.renderer.setSize(cols, rows, false);
    }

    // Update geometry if reference changed
    if (this.currentGeo !== geometry) {
      this.currentGeo = geometry;
      this.mesh.geometry = geometry;

      if (this.lineSegments) {
        this.scene.remove(this.lineSegments);
        this.lineSegments = null;
      }
      if (this.pointsObj) {
        this.scene.remove(this.pointsObj);
        this.pointsObj = null;
      }
    }

    // Material & Shading configuration
    const side = modelConfig.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    const flatShading = modelConfig.flatShading;

    this.mesh.visible = true;
    if (this.pointsObj) this.pointsObj.visible = false;

    switch (viewConfig.shadingMode) {
      case 'wireframe':
        this.mesh.material = this.basicWireMat;
        this.basicWireMat.side = side;
        break;

      case 'depth':
        this.mesh.material = this.depthMat;
        this.depthMat.side = side;
        break;

      case 'normals':
        this.mesh.material = this.normalMat;
        this.normalMat.side = side;
        this.normalMat.flatShading = flatShading;
        this.normalMat.needsUpdate = true;
        break;

      case 'points':
        this.mesh.visible = false;
        if (!this.pointsObj || this.pointsObj.geometry !== geometry) {
          if (this.pointsObj) this.scene.remove(this.pointsObj);
          this.pointsObj = new THREE.Points(geometry, this.pointsMat);
          this.scene.add(this.pointsObj);
        }
        this.pointsObj.visible = true;
        break;

      case 'shaded':
      case 'outline':
      default:
        this.mesh.material = this.phongMat;
        this.phongMat.side = side;
        this.phongMat.flatShading = flatShading;
        this.phongMat.shininess = viewConfig.specularIntensity * 35;
        this.phongMat.needsUpdate = true;
        break;
    }

    // Update Lighting
    const lightAzimuth = (viewConfig.lightAngleX * Math.PI) / 180;
    const lightElev = (viewConfig.lightAngleY * Math.PI) / 180;
    const lightDist = 5.0;
    const lx = Math.cos(lightElev) * Math.sin(lightAzimuth) * lightDist;
    const ly = Math.sin(lightElev) * lightDist;
    const lz = Math.cos(lightElev) * Math.cos(lightAzimuth) * lightDist;

    this.dirLight.position.set(lx, ly, lz);
    this.dirLight.intensity = viewConfig.lightIntensity * 1.5;
    this.ambLight.intensity = viewConfig.ambientLight * 1.2;

    // Aspect ratio compensation for monospace typography vs square raster.
    // Pixel mode paints 1:1 cells, so the camera must not pre-squash the scene
    // for character cell width or the mesh comes out stretched horizontally.
    const isSquareRaster = (ctx.rasterMode || viewConfig.rasterMode || 'ascii') !== 'ascii';
    const aspectCorrection = isSquareRaster ? 1.0 : (viewConfig.aspectRatio ?? 0.50);
    const viewAspect = (cols / rows) * aspectCorrection;



    // Setup active Camera
    let activeCamera: THREE.Camera;
    const camDist = Math.max(1.0, viewConfig.cameraDistance);

    if (viewConfig.isOrthographic) {
      const orthoSize = camDist * 0.45;
      this.orthoCamera.left = -orthoSize * viewAspect;
      this.orthoCamera.right = orthoSize * viewAspect;
      this.orthoCamera.top = orthoSize;
      this.orthoCamera.bottom = -orthoSize;
      this.orthoCamera.near = 0.1;
      this.orthoCamera.far = 50;
      this.orthoCamera.position.set(0, 0, camDist);
      this.orthoCamera.lookAt(0, 0, 0);
      this.orthoCamera.updateProjectionMatrix();
      activeCamera = this.orthoCamera;
    } else {
      this.perspCamera.fov = Math.max(15, Math.min(110, viewConfig.fov));
      this.perspCamera.aspect = viewAspect;
      this.perspCamera.near = 0.1;
      this.perspCamera.far = 50;
      this.perspCamera.position.set(0, 0, camDist);
      this.perspCamera.lookAt(0, 0, 0);
      this.perspCamera.updateProjectionMatrix();
      activeCamera = this.perspCamera;
    }

    // Model Transforms & Rotations
    const targetObj: THREE.Object3D = this.mesh.visible ? this.mesh : (this.pointsObj || this.mesh);

    // Uniform & per-axis scale
    const sx = modelConfig.scale * modelConfig.scaleX;
    const sy = modelConfig.scale * modelConfig.scaleY;
    const sz = modelConfig.scale * modelConfig.scaleZ;
    targetObj.scale.set(sx, sy, sz);

    // Position offsets
    targetObj.position.set(modelConfig.offsetX, modelConfig.offsetY, modelConfig.offsetZ);

    // Rotation calculation
    let rotX = viewConfig.manualRotationX;
    let rotY = viewConfig.manualRotationY;
    let rotZ = viewConfig.manualRotationZ;

    if (viewConfig.autoRotate) {
      rotX += time * viewConfig.autoRotateSpeedX;
      rotY += time * viewConfig.autoRotateSpeedY;
      rotZ += time * viewConfig.autoRotateSpeedZ;
    }

    if (viewConfig.wobbleAmp > 0) {
      const wobble = Math.sin(time * viewConfig.wobbleSpeed) * viewConfig.wobbleAmp;
      rotX += wobble * 0.5;
      rotZ += wobble * 0.3;
    }

    targetObj.rotation.set(rotX, rotY, rotZ);

    // Render WebGL Scene
    this.renderer.render(this.scene, activeCamera);

    // Read pixel buffer directly from WebGL context
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

    // Extract WebGL pixels into standard top-to-bottom RGBA buffer
    if (modelRgbaBuffer.length !== totalCells * 4) {
      modelRgbaBuffer = new Uint8ClampedArray(totalCells * 4);
    }

    for (let y = 0; y < rows; y++) {
      const srcY = rows - 1 - y;
      const srcRowOffset = srcY * cols * 4;
      const destRowOffset = y * cols * 4;
      for (let x = 0; x < cols; x++) {
        const srcIdx = srcRowOffset + x * 4;
        const destIdx = destRowOffset + x * 4;
        modelRgbaBuffer[destIdx] = pixelBuffer[srcIdx];
        modelRgbaBuffer[destIdx + 1] = pixelBuffer[srcIdx + 1];
        modelRgbaBuffer[destIdx + 2] = pixelBuffer[srcIdx + 2];
        modelRgbaBuffer[destIdx + 3] = pixelBuffer[srcIdx + 3];
      }
    }

    // Delegate to Unified 2D Raster Processing Engine
    const isOutline = viewConfig.shadingMode === 'outline';
    const shadingEdges =
      isOutline || (viewConfig.edgeWeight ?? 0) > 0
        ? {
            edgeDetection: true,
            edgeThreshold: (viewConfig.edgeThreshold || 0.18) * 100,
            edgeStrength: isOutline ? 150 : (viewConfig.edgeWeight || 1) * 100,
          }
        : null;

    return processRasterFrame(
      {
        width: cols,
        height: rows,
        rgba: modelRgbaBuffer,
      },
      {
        cols,
        rows,
        density,
        rasterMode: ctx.rasterMode || viewConfig.rasterMode || 'ascii',
        ditherAlgorithm: ctx.algorithm || viewConfig.algorithm || 'none',
        toneConfig: ctx.toneConfig || viewConfig.toneConfig,
        colorConfig: ctx.colorConfig,
        monoTint: ctx.colorConfig?.monoTint,
        contrast: viewConfig.contrast,
        brightness: viewConfig.brightness,
        invert: viewConfig.invert,
        ...toPipelineAdjustments(ctx.adjustConfig),
        // Outline shading and edge weight are model-specific and win over the
        // shared edge adjustment when either is active.
        ...(shadingEdges || {}),
      }
    );
  }

}

// Global Singleton Instance
const globalHeadlessRenderer = new HeadlessModelRenderer();

export function renderModelFrameData(ctx: ModelRenderContext): ProcessedRasterResult {
  return globalHeadlessRenderer.renderData(ctx);
}


