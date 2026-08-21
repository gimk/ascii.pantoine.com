import * as THREE from 'three';
import { ModelConfig, ModelViewConfig } from '../types/ascii';

export interface ModelRenderContext {
  cols: number;
  rows: number;
  time: number;
  density: string;
  geometry: THREE.BufferGeometry;
  modelConfig: ModelConfig;
  viewConfig: ModelViewConfig;
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
let cachedLines: string[] = [];
let lineBuffer: string[] = [];
let pixelBuffer = new Uint8Array(0);
let luminanceBuffer = new Float32Array(0);

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
    this.scene.background = new THREE.Color(0x000000);

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
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(100, 50, false);
      this.renderer.setClearColor(0x000000, 1.0);
    } catch (e) {
      console.warn('WebGL init error in HeadlessModelRenderer:', e);
    }
  }

  public render(ctx: ModelRenderContext): string {
    const { cols, rows, time, density, geometry, modelConfig, viewConfig } = ctx;

    if (cols <= 0 || rows <= 0 || !geometry || !geometry.attributes?.position || geometry.attributes.position.count === 0) {
      return '';
    }
    if (!this.renderer || !this.canvas) {
      this.initRenderer();
      if (!this.renderer || !this.canvas) return '';
    }

    const totalCells = cols * rows;

    // Ensure output line buffers match dimensions
    if (cachedLines.length !== rows) {
      cachedLines = new Array(rows);
    }
    if (lineBuffer.length !== cols) {
      lineBuffer = new Array(cols);
    }
    if (pixelBuffer.length !== totalCells * 4) {
      pixelBuffer = new Uint8Array(totalCells * 4);
      luminanceBuffer = new Float32Array(totalCells);
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

    // Aspect ratio compensation for monospace typography (width / height ~ 0.55)
    const aspectCorrection = 0.55;
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

    // Step 1: Precompute normalized luminance buffer
    const contrast = viewConfig.contrast;
    const brightness = viewConfig.brightness;
    const invert = viewConfig.invert;

    for (let y = 0; y < rows; y++) {
      // Invert Y coordinate because WebGL is origin bottom-left, terminal is top-left
      const srcY = rows - 1 - y;
      const srcRowOffset = srcY * cols * 4;
      const destRowOffset = y * cols;

      for (let x = 0; x < cols; x++) {
        const pxIdx = srcRowOffset + x * 4;
        const r = pixelBuffer[pxIdx];
        const g = pixelBuffer[pxIdx + 1];
        const b = pixelBuffer[pxIdx + 2];

        // Perceived luminance
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;

        // Apply contrast & brightness
        if (lum > 0.01) {
          lum = (lum - 0.5) * contrast + 0.5 + brightness;
          lum = Math.max(0, Math.min(1, lum));
          if (invert) {
            lum = 1.0 - lum;
          }
        } else {
          lum = invert ? 1.0 : 0.0;
        }

        luminanceBuffer[destRowOffset + x] = lum;
      }
    }

    // Step 2: Sobel Edge Detection for Outlines (if outline mode or edgeWeight > 0)
    const isOutlineMode = viewConfig.shadingMode === 'outline';
    const edgeWeight = isOutlineMode ? 1.5 : (viewConfig.edgeWeight || 0);
    const edgeThreshold = Math.max(0.05, viewConfig.edgeThreshold || 0.18);
    const densityLength = density.length;

    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      const prevRow = y > 0 ? (y - 1) * cols : rowOffset;
      const nextRow = y < rows - 1 ? (y + 1) * cols : rowOffset;

      for (let x = 0; x < cols; x++) {
        const prevCol = x > 0 ? x - 1 : x;
        const nextCol = x < cols - 1 ? x + 1 : x;

        let finalLum = luminanceBuffer[rowOffset + x];

        // Sobel filter pass
        if (edgeWeight > 0) {
          const tl = luminanceBuffer[prevRow + prevCol];
          const tc = luminanceBuffer[prevRow + x];
          const tr = luminanceBuffer[prevRow + nextCol];
          const ml = luminanceBuffer[rowOffset + prevCol];
          const mr = luminanceBuffer[rowOffset + nextCol];
          const bl = luminanceBuffer[nextRow + prevCol];
          const bc = luminanceBuffer[nextRow + x];
          const br = luminanceBuffer[nextRow + nextCol];

          const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
          const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
          const edgeMag = Math.sqrt(gx * gx + gy * gy);

          if (edgeMag >= edgeThreshold) {
            if (isOutlineMode) {
              finalLum = Math.min(1.0, edgeMag * edgeWeight);
            } else {
              finalLum = Math.min(1.0, finalLum + edgeMag * edgeWeight);
            }
          } else if (isOutlineMode) {
            finalLum = finalLum * 0.15; // Dim interior in outline mode
          }
        }

        // Map luminance to character ramp
        let charIndex = Math.floor(finalLum * densityLength);
        if (charIndex < 0) charIndex = 0;
        else if (charIndex >= densityLength) charIndex = densityLength - 1;

        lineBuffer[x] = density[charIndex] || ' ';
      }

      cachedLines[y] = lineBuffer.join('');
    }

    return cachedLines.join('\n');
  }
}

// Global Singleton Instance
const globalHeadlessRenderer = new HeadlessModelRenderer();

export function renderModelAsciiFrame(ctx: ModelRenderContext): string {
  return globalHeadlessRenderer.render(ctx);
}
