import { TrailPoint, ParticleConfig } from '../types/ascii';

export const DEFAULT_TRAIL_CHARS = '@#%*+=-:. ';

export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  enabled: true,
  lifespan: 1.8, // 1.8 seconds lifetime
  decayRate: 0.015,
  trailChars: '@#%*+=-:. ',
  burstCount: 18,
  burstSpeed: 1.4,
  flowStrength: 0.9, // Direct field gradient advection
  swirlStrength: 0.6, // Tangential / contour swirl force
  drag: 0.93, // Inertial drag
  luminanceBoost: 0.5, // Glow influence on surrounding matrix
  ripplesEnabled: true,
  rippleStrength: 1.0,
};

export function createTrailPoint(
  x: number,
  y: number,
  age: number = 1.0,
  vx: number = 0,
  vy: number = 0,
  chars: string = DEFAULT_TRAIL_CHARS
): TrailPoint {
  const charList = chars.length > 0 ? chars : DEFAULT_TRAIL_CHARS;
  // Pick from the upper / brighter 60% of the active charset so particles stand out
  const minIdx = Math.max(0, Math.floor(charList.length * 0.4));
  const activeSlice = charList.slice(minIdx).trim() || charList;
  const randomChar = activeSlice[Math.floor(Math.random() * activeSlice.length)] || charList[charList.length - 1] || '*';
  return {
    x,
    y,
    age,
    initialAge: age,
    char: randomChar,
    vx,
    vy,
  };
}

/**
 * Updates a particle by evaluating the exact local gradient and curl of the current simulation wave field
 * Uses real elapsed delta time in seconds so lifespan and speed are invariant to framerate.
 */
export function updateParticleWithField(
  p: TrailPoint,
  _cols: number,
  _rows: number,
  time: number,
  sampleField: (x: number, y: number, time: number) => number,
  config: ParticleConfig,
  deltaTime: number = 0.016
): void {
  const eps = 0.5; // Finite difference sample offset

  // Sample wave values around the particle's current coordinate
  const fRight = sampleField(p.x + eps, p.y, time);
  const fLeft = sampleField(p.x - eps, p.y, time);
  const fDown = sampleField(p.x, p.y + eps, time);
  const fUp = sampleField(p.x, p.y - eps, time);

  // Compute spatial gradient vector ∇f
  const gradX = (fRight - fLeft) / (2 * eps);
  const gradY = (fDown - fUp) / (2 * eps);

  // Direct wave advection force (acceleration along wave slope)
  const forceX = -gradX * (config.flowStrength * 0.4);
  const forceY = -gradY * (config.flowStrength * 0.4);

  // Tangential / curl force (swirling along equipotential contours)
  const swirlX = -gradY * (config.swirlStrength * 0.3);
  const swirlY = gradX * (config.swirlStrength * 0.3);

  // Normalize delta to 60fps unit (1.0 at 60fps)
  const dtFactor = Math.min(3.0, Math.max(0.1, deltaTime * 60));

  // Apply forces to particle velocity
  const dragFactor = Math.pow(config.drag, dtFactor);
  p.vx = ((p.vx || 0) + (forceX + swirlX) * dtFactor) * dragFactor;
  p.vy = ((p.vy || 0) + (forceY + swirlY) * dtFactor) * dragFactor;

  // Move particle position
  p.x += (p.vx || 0) * dtFactor;
  p.y += (p.vy || 0) * dtFactor;

  // Age decay based on real-world elapsed seconds
  const decay = deltaTime / Math.max(0.1, config.lifespan);
  p.age -= decay;
}

export function generateClickParticles(
  x: number,
  y: number,
  count: number = 18,
  speedFactor: number = 1.4,
  chars: string = DEFAULT_TRAIL_CHARS
): TrailPoint[] {
  const particles: TrailPoint[] = [];
  const charList = chars.length > 0 ? chars : DEFAULT_TRAIL_CHARS;
  const minIdx = Math.max(0, Math.floor(charList.length * 0.3));
  const activeSlice = charList.slice(minIdx).trim() || charList;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const speed = (0.5 + Math.random() * 0.9) * speedFactor;
    particles.push({
      x,
      y,
      age: 1.0,
      initialAge: 1.0,
      char: activeSlice[Math.floor(Math.random() * activeSlice.length)] || charList[charList.length - 1] || '+',
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  return particles;
}
