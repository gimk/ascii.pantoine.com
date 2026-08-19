import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { BuiltinModelId } from '../types/ascii';

// --- Procedural Geometry Generators ---

/**
 * Creates DNA Double Helix Geometry
 */
function createDnaGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const turns = 2.5;
  const length = 3.0;
  const radius = 0.8;
  const steps = 60;
  const rungCount = 24;

  // Strand 1 and Strand 2
  const curvePoints1: THREE.Vector3[] = [];
  const curvePoints2: THREE.Vector3[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const y = (t - 0.5) * length;
    const x1 = Math.cos(angle) * radius;
    const z1 = Math.sin(angle) * radius;
    const x2 = Math.cos(angle + Math.PI) * radius;
    const z2 = Math.sin(angle + Math.PI) * radius;

    curvePoints1.push(new THREE.Vector3(x1, y, z1));
    curvePoints2.push(new THREE.Vector3(x2, y, z2));
  }

  const curve1 = new THREE.CatmullRomCurve3(curvePoints1);
  const curve2 = new THREE.CatmullRomCurve3(curvePoints2);

  geometries.push(new THREE.TubeGeometry(curve1, 64, 0.08, 8, false));
  geometries.push(new THREE.TubeGeometry(curve2, 64, 0.08, 8, false));

  // Connecting Rungs
  for (let i = 0; i < rungCount; i++) {
    const t = i / (rungCount - 1);
    const angle = t * turns * Math.PI * 2;
    const y = (t - 0.5) * length;
    const p1 = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const p2 = new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius);

    const rungCurve = new THREE.LineCurve3(p1, p2);
    geometries.push(new THREE.TubeGeometry(rungCurve, 4, 0.04, 6, false));
  }

  // Merge geometries
  return mergeBufferGeometries(geometries);
}

/**
 * Creates Low-Poly Retro Starfighter Geometry
 */
function createSpaceshipGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Fuselage (Main Body)
  const bodyGeo = new THREE.ConeGeometry(0.5, 2.8, 4);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(1.0, 0.45, 1.0);
  geometries.push(bodyGeo);

  // Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.8, -0.9);
  wingShape.lineTo(1.8, -1.3);
  wingShape.lineTo(0, -0.6);
  wingShape.closePath();

  const extrudeSettings = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 };
  const wingLeft = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
  wingLeft.rotateX(Math.PI / 2);
  wingLeft.translate(0, 0, 0.3);
  geometries.push(wingLeft);

  const wingRight = wingLeft.clone();
  wingRight.scale(-1, 1, 1);
  geometries.push(wingRight);

  // Wing Tip Cannons
  const cannonL = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6);
  cannonL.rotateX(Math.PI / 2);
  cannonL.translate(1.8, 0, 0.2);
  geometries.push(cannonL);

  const cannonR = cannonL.clone();
  cannonR.translate(-3.6, 0, 0);
  geometries.push(cannonR);

  // Cockpit canopy
  const cockpitGeo = new THREE.SphereGeometry(0.22, 8, 6);
  cockpitGeo.scale(0.8, 0.6, 1.8);
  cockpitGeo.translate(0, 0.18, 0.2);
  geometries.push(cockpitGeo);

  // Engines Thrusters
  const engineL = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8);
  engineL.rotateX(Math.PI / 2);
  engineL.translate(0.35, -0.05, -1.2);
  geometries.push(engineL);

  const engineR = engineL.clone();
  engineR.translate(-0.7, 0, 0);
  geometries.push(engineR);

  return mergeBufferGeometries(geometries);
}

/**
 * Creates Saturn & Ring Geometry
 */
function createSaturnGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Planet body
  const planet = new THREE.SphereGeometry(0.9, 32, 24);
  geometries.push(planet);

  // Outer Ring
  const ring = new THREE.RingGeometry(1.25, 2.1, 48);
  ring.rotateX(Math.PI / 2.3);
  geometries.push(ring);

  // Inner Thin Ring
  const innerRing = new THREE.RingGeometry(2.18, 2.35, 48);
  innerRing.rotateX(Math.PI / 2.3);
  geometries.push(innerRing);

  return mergeBufferGeometries(geometries);
}

/**
 * Creates Low-Poly Cyber Skull / Head Geometry
 */
function createSkullGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Cranium
  const cranium = new THREE.IcosahedronGeometry(0.85, 1);
  cranium.scale(0.95, 1.1, 1.05);
  cranium.translate(0, 0.25, 0);
  geometries.push(cranium);

  // Jaw / Chin
  const jaw = new THREE.BoxGeometry(0.65, 0.6, 0.7);
  jaw.translate(0, -0.45, 0.15);
  geometries.push(jaw);

  // Cheekbones
  const cheekL = new THREE.ConeGeometry(0.25, 0.5, 4);
  cheekL.rotateZ(-Math.PI / 4);
  cheekL.translate(0.55, -0.1, 0.25);
  geometries.push(cheekL);

  const cheekR = cheekL.clone();
  cheekR.scale(-1, 1, 1);
  geometries.push(cheekR);

  // Eye socket indents (negative shapes simulated by brows)
  const brow = new THREE.BoxGeometry(0.9, 0.18, 0.35);
  brow.translate(0, 0.18, 0.65);
  geometries.push(brow);

  return mergeBufferGeometries(geometries);
}

/**
 * Creates Stylized Teapot Geometry
 */
function createTeapotGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Body (lathe / squashed sphere)
  const body = new THREE.SphereGeometry(0.8, 24, 16);
  body.scale(1.2, 0.85, 1.2);
  geometries.push(body);

  // Lid
  const lid = new THREE.ConeGeometry(0.55, 0.3, 16);
  lid.translate(0, 0.8, 0);
  geometries.push(lid);

  const lidKnob = new THREE.SphereGeometry(0.12, 10, 8);
  lidKnob.translate(0, 1.0, 0);
  geometries.push(lidKnob);

  // Base
  const base = new THREE.CylinderGeometry(0.6, 0.65, 0.15, 16);
  base.translate(0, -0.75, 0);
  geometries.push(base);

  // Spout
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.6, -0.3, 0),
    new THREE.Vector3(1.1, 0.2, 0),
    new THREE.Vector3(1.4, 0.7, 0),
  ]);
  const spout = new THREE.TubeGeometry(spoutCurve, 16, 0.14, 8, false);
  geometries.push(spout);

  // Handle
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0.5, 0),
    new THREE.Vector3(-1.3, 0.2, 0),
    new THREE.Vector3(-1.2, -0.4, 0),
    new THREE.Vector3(-0.7, -0.4, 0),
  ]);
  const handle = new THREE.TubeGeometry(handleCurve, 16, 0.09, 8, false);
  geometries.push(handle);

  return mergeBufferGeometries(geometries);
}

/**
 * Creates Möbius Strip Geometry
 */
function createMobiusGeometry(): THREE.BufferGeometry {
  const uSegments = 80;
  const vSegments = 16;
  const positions: number[] = [];
  const indices: number[] = [];

  const radius = 1.0;
  const width = 0.5;

  for (let i = 0; i <= uSegments; i++) {
    const u = (i / uSegments) * Math.PI * 2;
    for (let j = 0; j <= vSegments; j++) {
      const v = (j / vSegments - 0.5) * width;
      const x = (radius + v * Math.cos(u / 2)) * Math.cos(u);
      const y = (radius + v * Math.cos(u / 2)) * Math.sin(u);
      const z = v * Math.sin(u / 2);
      positions.push(x, y, z);
    }
  }

  for (let i = 0; i < uSegments; i++) {
    for (let j = 0; j < vSegments; j++) {
      const a = i * (vSegments + 1) + j;
      const b = (i + 1) * (vSegments + 1) + j;
      const c = (i + 1) * (vSegments + 1) + (j + 1);
      const d = i * (vSegments + 1) + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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

// --- Built-in Model Library ---

export function getBuiltinGeometry(id: BuiltinModelId): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;

  switch (id) {
    case 'torus-knot':
      geo = new THREE.TorusKnotGeometry(0.85, 0.28, 128, 24, 2, 3);
      break;
    case 'teapot':
      geo = createTeapotGeometry();
      break;
    case 'skull':
      geo = createSkullGeometry();
      break;
    case 'dna':
      geo = createDnaGeometry();
      break;
    case 'spaceship':
      geo = createSpaceshipGeometry();
      break;
    case 'crystal':
      geo = new THREE.IcosahedronGeometry(1.1, 0);
      break;
    case 'suzanne':
      // Low poly faceted Suzanne/Head
      geo = new THREE.DodecahedronGeometry(1.0, 1);
      geo.scale(1.2, 0.9, 0.9);
      break;
    case 'saturn':
      geo = createSaturnGeometry();
      break;
    case 'dome':
      geo = new THREE.DodecahedronGeometry(1.1, 2);
      break;
    case 'mobius':
      geo = createMobiusGeometry();
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(1.0, 32, 24);
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
