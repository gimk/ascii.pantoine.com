/**
 * Official Khronos glTF Sample Assets & Open Curated 3D Models
 * 100% free, zero API key, reliable public CDN with verified previews and direct GLB streams.
 */

const KHRONOS_BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models';
const THREE_BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf';

export interface Khronos3DModel {
  id: string;
  title: string;
  category: KhronosCategory;
  thumbnail: string;
  downloadUrl: string;
  triCount: number;
  author: string;
  license: string;
}

export const KHRONOS_CATEGORIES = [
  'All',
  'Animals',
  'Vehicles & Space',
  'Characters & Mechs',
  'Retro & Tech',
  'Everyday Objects',
] as const;

export type KhronosCategory = (typeof KHRONOS_CATEGORIES)[number];

export const KHRONOS_MODELS: Khronos3DModel[] = [
  // --- Animals ---
  {
    id: 'duck',
    title: 'Rubber Duck',
    category: 'Animals',
    thumbnail: `${KHRONOS_BASE}/Duck/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/Duck/glTF-Binary/Duck.glb`,
    triCount: 780,
    author: 'Sony (Khronos)',
    license: 'CC-BY',
  },
  {
    id: 'fox',
    title: 'Low Poly Fox',
    category: 'Animals',
    thumbnail: `${KHRONOS_BASE}/Fox/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/Fox/glTF-Binary/Fox.glb`,
    triCount: 1500,
    author: 'Khronos',
    license: 'CC-BY',
  },
  {
    id: 'flamingo',
    title: 'Pink Flamingo',
    category: 'Animals',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_animation_keyframes.jpg',
    downloadUrl: `${THREE_BASE}/Flamingo.glb`,
    triCount: 1400,
    author: 'Three.js',
    license: 'MIT',
  },
  {
    id: 'horse',
    title: 'Galloping Horse',
    category: 'Animals',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_animation_skinning_blending.jpg',
    downloadUrl: `${THREE_BASE}/Horse.glb`,
    triCount: 1680,
    author: 'Three.js',
    license: 'MIT',
  },
  {
    id: 'parrot',
    title: 'Flying Parrot',
    category: 'Animals',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_animation_keyframes.jpg',
    downloadUrl: `${THREE_BASE}/Parrot.glb`,
    triCount: 1200,
    author: 'Three.js',
    license: 'MIT',
  },
  {
    id: 'fish',
    title: 'Barramundi Fish',
    category: 'Animals',
    thumbnail: `${KHRONOS_BASE}/BarramundiFish/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/BarramundiFish/glTF-Binary/BarramundiFish.glb`,
    triCount: 1950,
    author: 'Khronos',
    license: 'CC-BY',
  },

  // --- Vehicles & Space ---
  {
    id: 'ferrari',
    title: 'Ferrari Sports Car',
    category: 'Vehicles & Space',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_materials_car.jpg',
    downloadUrl: `${THREE_BASE}/ferrari.glb`,
    triCount: 3200,
    author: 'Three.js',
    license: 'MIT',
  },
  {
    id: 'toy-car',
    title: 'Retro Toy Car',
    category: 'Vehicles & Space',
    thumbnail: `${KHRONOS_BASE}/ToyCar/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/ToyCar/glTF-Binary/ToyCar.glb`,
    triCount: 2150,
    author: 'Khronos',
    license: 'CC0',
  },
  {
    id: 'milk-truck',
    title: 'Vintage Delivery Truck',
    category: 'Vehicles & Space',
    thumbnail: `${KHRONOS_BASE}/CesiumMilkTruck/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb`,
    triCount: 2400,
    author: 'Cesium',
    license: 'CC-BY',
  },
  {
    id: 'battle-helmet',
    title: 'Sci-Fi Battle Helmet',
    category: 'Vehicles & Space',
    thumbnail: `${KHRONOS_BASE}/DamagedHelmet/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`,
    triCount: 3800,
    author: 'Khronos',
    license: 'CC-BY',
  },

  // --- Characters & Mechs ---
  {
    id: 'robot',
    title: 'Combat Mech Robot',
    category: 'Characters & Mechs',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_skinning_simple.jpg',
    downloadUrl: `${THREE_BASE}/RobotExpressive/RobotExpressive.glb`,
    triCount: 3600,
    author: 'Three.js',
    license: 'MIT',
  },
  {
    id: 'astronaut',
    title: 'Running Astronaut',
    category: 'Characters & Mechs',
    thumbnail: `${KHRONOS_BASE}/CesiumMan/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/CesiumMan/glTF-Binary/CesiumMan.glb`,
    triCount: 1800,
    author: 'Cesium',
    license: 'CC-BY',
  },
  {
    id: 'brain-stem',
    title: 'Cyber Brain Stem',
    category: 'Characters & Mechs',
    thumbnail: `${KHRONOS_BASE}/BrainStem/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/BrainStem/glTF-Binary/BrainStem.glb`,
    triCount: 3500,
    author: 'Keith Hunter',
    license: 'CC-BY',
  },
  {
    id: 'corset',
    title: 'Victorian Dress / Corset',
    category: 'Characters & Mechs',
    thumbnail: `${KHRONOS_BASE}/Corset/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/Corset/glTF-Binary/Corset.glb`,
    triCount: 2200,
    author: 'Khronos',
    license: 'CC-BY',
  },

  // --- Retro & Tech ---
  {
    id: 'boombox',
    title: 'Retro BoomBox Stereo',
    category: 'Retro & Tech',
    thumbnail: `${KHRONOS_BASE}/BoomBox/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/BoomBox/glTF-Binary/BoomBox.glb`,
    triCount: 1200,
    author: 'Khronos',
    license: 'CC-BY',
  },
  {
    id: 'camera',
    title: 'Vintage Antique Camera',
    category: 'Retro & Tech',
    thumbnail: `${KHRONOS_BASE}/AntiqueCamera/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/AntiqueCamera/glTF-Binary/AntiqueCamera.glb`,
    triCount: 2800,
    author: 'Khronos',
    license: 'CC-BY',
  },
  {
    id: 'lantern',
    title: 'Antique Oil Lantern',
    category: 'Retro & Tech',
    thumbnail: `${KHRONOS_BASE}/Lantern/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/Lantern/glTF-Binary/Lantern.glb`,
    triCount: 1450,
    author: 'Khronos',
    license: 'CC-BY',
  },
  {
    id: 'tokyo',
    title: 'Littlest Tokyo Diorama',
    category: 'Retro & Tech',
    thumbnail: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/screenshots/webgl_animation_keyframes.jpg',
    downloadUrl: `${THREE_BASE}/LittlestTokyo.glb`,
    triCount: 4500,
    author: 'Three.js',
    license: 'CC-BY',
  },
  {
    id: 'sneaker',
    title: 'Designer Sneaker',
    category: 'Retro & Tech',
    thumbnail: `${KHRONOS_BASE}/MaterialsVariantsShoe/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb`,
    triCount: 2100,
    author: 'Khronos',
    license: 'CC-BY',
  },
  {
    id: 'chair',
    title: 'Sheen Armchair',
    category: 'Retro & Tech',
    thumbnail: `${KHRONOS_BASE}/SheenChair/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/SheenChair/glTF-Binary/SheenChair.glb`,
    triCount: 1600,
    author: 'Khronos',
    license: 'CC-BY',
  },

  // --- Everyday Objects ---
  {
    id: 'avocado',
    title: 'Fresh Avocado',
    category: 'Everyday Objects',
    thumbnail: `${KHRONOS_BASE}/Avocado/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/Avocado/glTF-Binary/Avocado.glb`,
    triCount: 680,
    author: 'Khronos',
    license: 'CC0',
  },
  {
    id: 'water-bottle',
    title: 'Sport Water Bottle',
    category: 'Everyday Objects',
    thumbnail: `${KHRONOS_BASE}/WaterBottle/screenshot/screenshot-320.png`,
    downloadUrl: `${KHRONOS_BASE}/WaterBottle/glTF-Binary/WaterBottle.glb`,
    triCount: 840,
    author: 'Khronos',
    license: 'CC0',
  },
];

export function searchKhronosModels(
  query: string,
  category: KhronosCategory = 'All'
): Khronos3DModel[] {
  let filtered = KHRONOS_MODELS;

  if (category !== 'All') {
    filtered = filtered.filter((m) => m.category === category);
  }

  const trimmed = query.trim().toLowerCase();
  if (trimmed) {
    filtered = filtered.filter(
      (m) =>
        m.title.toLowerCase().includes(trimmed) ||
        m.category.toLowerCase().includes(trimmed) ||
        m.author.toLowerCase().includes(trimmed)
    );
  }

  return filtered;
}
