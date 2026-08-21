import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    // Return empty BufferGeometry so no sphere flashes while OBJ fetches
    return new THREE.BufferGeometry();
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
 * Extracts a single merged BufferGeometry from a Three.js Object3D hierarchy
 */
function extractGeometryFromObject(object: THREE.Object3D): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        let g = mesh.geometry.clone();
        if (!g.attributes.normal) {
          g.computeVertexNormals();
        }
        g.applyMatrix4(mesh.matrixWorld);

        // Keep only standard position and normal attributes to prevent attribute mismatch on merge
        const clean = new THREE.BufferGeometry();
        const posAttr = g.getAttribute('position');
        const normAttr = g.getAttribute('normal');
        if (posAttr) clean.setAttribute('position', posAttr);
        if (normAttr) clean.setAttribute('normal', normAttr);
        if (g.index) clean.setIndex(g.index);

        geometries.push(clean);
      }
    }
  });

  if (geometries.length === 0) {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  if (geometries.length === 1) {
    return geometries[0];
  }

  try {
    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    if (merged) {
      merged.computeVertexNormals();
      return merged;
    }
  } catch (err) {
    console.warn('BufferGeometryUtils merge error, falling back to first mesh:', err);
  }

  return geometries[0];
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

/**
 * Downloads and parses a remote 3D model file from a CDN/URL (e.g. Poly Pizza GLB, Smithsonian, Khronos)
 */
export async function fetchRemoteGeometry(
  url: string,
  fileTypeHint?: 'glb' | 'gltf' | 'obj' | 'stl' | 'ply'
): Promise<ParsedModelResult> {
  const cached = geometryCache.get(url);
  if (cached) {
    const stats = getGeometryStats(cached);
    return {
      geometry: cached.clone(),
      stats,
      fileName: url.split('/').pop()?.split('?')[0] || 'remote-model',
      fileType: fileTypeHint || 'glb',
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download remote 3D model (${response.status}): ${url}`);
  }

  const buffer = await response.arrayBuffer();
  let ext = fileTypeHint;
  if (!ext) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    if (cleanUrl.endsWith('.glb')) ext = 'glb';
    else if (cleanUrl.endsWith('.gltf')) ext = 'gltf';
    else if (cleanUrl.endsWith('.obj')) ext = 'obj';
    else if (cleanUrl.endsWith('.stl')) ext = 'stl';
    else if (cleanUrl.endsWith('.ply')) ext = 'ply';
    else ext = 'glb';
  }

  let geometry: THREE.BufferGeometry;

  if (ext === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    geometry = extractGeometryFromObject(obj);
  } else if (ext === 'stl') {
    const loader = new STLLoader();
    geometry = loader.parse(buffer);
  } else if (ext === 'ply') {
    const loader = new PLYLoader();
    geometry = loader.parse(buffer);
  } else {
    // GLTF / GLB
    const loader = new GLTFLoader();
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    geometry = extractGeometryFromObject(gltf.scene || gltf.scenes[0]);
  }

  normalizeGeometryBounds(geometry);
  geometryCache.set(url, geometry);
  const stats = getGeometryStats(geometry);

  return {
    geometry: geometry.clone(),
    stats,
    fileName: url.split('/').pop()?.split('?')[0] || 'remote-model',
    fileType: ext,
  };
}
