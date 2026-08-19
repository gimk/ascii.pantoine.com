import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { BuiltinModelId } from '../types/ascii';

// --- Built-in Model Library & Preset Loader ---

const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * Fetches an OBJ file from public path and parses it into normalized BufferGeometry
 */
export async function fetchPresetObjGeometry(path: string): Promise<THREE.BufferGeometry> {
  const cached = geometryCache.get(path);
  if (cached) return cached.clone();

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load preset 3D model: ${path} (status: ${response.status})`);
  }
  const text = await response.text();
  const loader = new OBJLoader();
  const obj = loader.parse(text);
  const geo = extractGeometryFromObject(obj);
  normalizeGeometryBounds(geo);
  geometryCache.set(path, geo);
  return geo.clone();
}

export function getBuiltinGeometry(id: BuiltinModelId): THREE.BufferGeometry {
  if (id === 'skull') {
    const cached = geometryCache.get('skull') || geometryCache.get('/presets/skull.obj');
    if (cached) return cached.clone();
    // Default placeholder while OBJ fetches
    const placeholder = new THREE.IcosahedronGeometry(1.0, 1);
    normalizeGeometryBounds(placeholder);
    return placeholder;
  }

  let geo: THREE.BufferGeometry;

  switch (id) {
    case 'torus-knot':
      geo = new THREE.TorusKnotGeometry(0.85, 0.28, 128, 24, 2, 3);
      break;
    case 'cube':
      geo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32);
      break;
    default:
      geo = new THREE.TorusKnotGeometry(0.85, 0.28, 128, 24, 2, 3);
  }

  normalizeGeometryBounds(geo);
  return geo;
}

/**
 * Loads a built-in or preset geometry asynchronously (supporting static OBJ assets)
 */
export async function loadBuiltinGeometryAsync(id: BuiltinModelId): Promise<THREE.BufferGeometry> {
  if (id === 'skull') {
    const cached = geometryCache.get('skull');
    if (cached) return cached.clone();

    const basePath = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL)
      ? (import.meta as any).env.BASE_URL.replace(/\/$/, '')
      : '';
    const presetUrl = `${basePath}/presets/skull.obj`;

    try {
      const geo = await fetchPresetObjGeometry(presetUrl);
      geometryCache.set('skull', geo);
      return geo.clone();
    } catch {
      // Fallback relative path
      const geo = await fetchPresetObjGeometry('./presets/skull.obj');
      geometryCache.set('skull', geo);
      return geo.clone();
    }
  }

  return getBuiltinGeometry(id);
}

/**
 * Normalizes a BufferGeometry so that it is centered at origin and scaled to fit within a [-1, 1] bounding box.
 */
export function normalizeGeometryBounds(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;

  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scaleFactor = 2.0 / maxDim;
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);
  }

  geometry.computeVertexNormals();
}

/**
 * Calculates polycount stats (vertices and face count) for a BufferGeometry
 */
export function getGeometryStats(geometry: THREE.BufferGeometry): { vertices: number; faces: number } {
  const pos = geometry.getAttribute('position');
  const vertCount = pos ? pos.count : 0;
  const faceCount = geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(vertCount / 3);
  return { vertices: vertCount, faces: faceCount };
}

// --- 3D File Parsers (OBJ, STL, GLTF, GLB, PLY) ---

export interface ParsedModelResult {
  geometry: THREE.BufferGeometry;
  stats: { vertices: number; faces: number };
  fileName: string;
  fileType: 'obj' | 'stl' | 'gltf' | 'glb' | 'ply';
}

/**
 * Helper to merge an array of BufferGeometries into a single BufferGeometry
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVertices = 0;
  let totalIndices = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (pos) totalVertices += pos.count;
    if (g.index) totalIndices += g.index.count;
    else if (pos) totalIndices += pos.count;
  }

  const mergedPos = new Float32Array(totalVertices * 3);
  const mergedNormals = new Float32Array(totalVertices * 3);
  const mergedIndices: number[] = [];

  let vertexOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos) continue;

    g.computeVertexNormals();
    const norm = g.getAttribute('normal');

    for (let i = 0; i < pos.count * 3; i++) {
      mergedPos[vertexOffset * 3 + i] = pos.array[i];
      if (norm) mergedNormals[vertexOffset * 3 + i] = norm.array[i];
    }

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        mergedIndices.push(g.index.array[i] + vertexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        mergedIndices.push(i + vertexOffset);
      }
    }

    vertexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  merged.setIndex(mergedIndices);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Extracts a single merged BufferGeometry from a Three.js Object3D hierarchy
 */
function extractGeometryFromObject(object: THREE.Object3D): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      geometries.push(g);
    }
  });

  if (geometries.length === 0) {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  if (geometries.length === 1) {
    return geometries[0];
  }
  return mergeBufferGeometries(geometries);
}

/**
 * Parses user-uploaded 3D model file (OBJ, STL, GLTF, GLB, PLY)
 */
export async function parseModelFile(file: File): Promise<ParsedModelResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const validExts = ['obj', 'stl', 'gltf', 'glb', 'ply'];
  if (!validExts.includes(ext)) {
    throw new Error(`Unsupported 3D file format: .${ext}. Supported: OBJ, STL, GLTF, GLB, PLY.`);
  }

  const fileType = ext as 'obj' | 'stl' | 'gltf' | 'glb' | 'ply';
  let geometry: THREE.BufferGeometry;

  if (ext === 'obj') {
    const text = await file.text();
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    geometry = extractGeometryFromObject(obj);
  } else if (ext === 'stl') {
    const buffer = await file.arrayBuffer();
    const loader = new STLLoader();
    geometry = loader.parse(buffer);
  } else if (ext === 'ply') {
    const buffer = await file.arrayBuffer();
    const loader = new PLYLoader();
    geometry = loader.parse(buffer);
  } else if (ext === 'gltf' || ext === 'glb') {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    geometry = extractGeometryFromObject(gltf.scene || gltf.scenes[0]);
  } else {
    throw new Error(`Unhandled file format: .${ext}`);
  }

  normalizeGeometryBounds(geometry);
  const stats = getGeometryStats(geometry);

  return {
    geometry,
    stats,
    fileName: file.name,
    fileType,
  };
}
