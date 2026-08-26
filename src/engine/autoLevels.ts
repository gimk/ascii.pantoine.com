/**
 * Automatic black and white points from a luminance histogram.
 *
 * The histogram comes from processRasterFrame, sampled at the one point in the
 * pipeline where it is the actual input to the levels stage: after the spatial
 * filters and the tone curve, before levels itself. Because nothing downstream
 * of that point feeds back upstream of it, the reading does not move when the
 * levels it produced are applied -- pressing AUTO twice is a no-op rather than
 * a second stretch.
 */

export interface AutoLevelsResult {
  /** 0..255, feeds ToneMappingConfig.levelsBlack */
  black: number;
  /** 0..255, feeds ToneMappingConfig.levelsWhite */
  white: number;
}

/**
 * Percentile of cells discarded at each end before the endpoint is taken.
 * Photoshop's own auto correction defaults to the same figure.
 */
export const DEFAULT_AUTO_LEVELS_CLIP = 0.1;

/**
 * Narrowest span, in histogram bins, that is worth stretching. Below this the
 * image genuinely has no tonal range -- a flat fill, a two-cell grid, a frame
 * that is entirely transparent -- and stretching it just amplifies whatever
 * noise is present into full contrast.
 */
const MIN_SPAN_BINS = 5;

/**
 * @returns the new endpoints, or null when there is nothing worth stretching.
 *          Callers should say so rather than silently doing nothing.
 */
export function computeAutoLevels(
  histogram: Uint32Array,
  opaqueCount: number,
  clipPercent: number = DEFAULT_AUTO_LEVELS_CLIP
): AutoLevelsResult | null {
  if (!histogram || histogram.length < 256 || opaqueCount <= 0) return null;

  /*
   * Percentile rather than absolute min/max. A single specular highlight or one
   * dead black pixel is enough to pin an endpoint at the extreme, and then the
   * button appears to do nothing on exactly the images that most need it.
   *
   * Rounded down so the budget is only ever spent on cells that genuinely
   * exist: on a small grid the fractional budget is below one cell, the
   * threshold lands at zero, and the walk stops at the first populated bin --
   * which is the true min, and correct, because there is no tail to trim.
   */
  const clip = Math.max(0, Math.min(50, clipPercent));
  const budget = Math.floor((opaqueCount * clip) / 100);

  /*
   * -1 until a populated bin is actually found. Seeding these to 0 and 255
   * instead would make an all-zero histogram return a full 0..100 stretch --
   * inventing a tonal range out of no data. That cannot arise from the engine,
   * which fills the histogram and the count in one pass, but it is one
   * mismatched argument away from a caller.
   */
  let acc = 0;
  let black = -1;
  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc > budget) {
      black = i;
      break;
    }
  }

  acc = 0;
  let white = -1;
  for (let i = 255; i >= 0; i--) {
    acc += histogram[i];
    if (acc > budget) {
      white = i;
      break;
    }
  }

  if (black < 0 || white < 0) return null;
  if (white - black < MIN_SPAN_BINS) return null;

  return {
    black,
    white,
  };
}
