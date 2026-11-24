/**
 * Shared volumetric-flask silhouette for the 2D and 3D renderers, in scene units (radius, height).
 * Display geometry only: it does not define any experimental volume. The liquid height comes from
 * the projection's `liquidFraction` (display scale relative to the calibration mark).
 */
export const FLASK_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.4, 0],
  [0.5, 0.05],
  [0.555, 0.18],
  [0.56, 0.32],
  [0.53, 0.5],
  [0.44, 0.66],
  [0.3, 0.78],
  [0.16, 0.86],
  [0.1, 0.92],
  [0.085, 1],
  [0.085, 2],
  [0.1, 2.04],
  [0.1, 2.1],
];

/** Height of the calibration mark on the neck. */
export const FLASK_MARK_Y = 1.55;
/** Top of the straight neck (liquid above the mark is drawn between the mark and here). */
export const FLASK_NECK_TOP_Y = 2;
/** Inner wall offset used for the liquid body. */
const WALL = 0.02;
/** Display range of an above-mark level (projection caps `liquidFraction` at 1.1). */
const ABOVE_MARK_RANGE = 0.1;

/** Outer radius at height y (linear between profile points). */
export const flaskRadiusAt = (y: number): number => {
  for (let i = 1; i < FLASK_PROFILE.length; i += 1) {
    const [r0, y0] = FLASK_PROFILE[i - 1]!;
    const [r1, y1] = FLASK_PROFILE[i]!;
    if (y >= y0 && y <= y1)
      return y1 === y0 ? Math.max(r0, r1) : r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0;
};

const STEP = 0.005;

/** Cumulative inner volume (scene units) from the base, sampled every STEP. */
const CUMULATIVE: number[] = (() => {
  const out = [0];
  for (let y = STEP; y <= FLASK_MARK_Y + 1e-9; y += STEP) {
    const r = Math.max(0, flaskRadiusAt(y - STEP / 2) - WALL);
    out.push(out.at(-1)! + Math.PI * r * r * STEP);
  }
  return out;
})();

/**
 * Display height of the liquid surface for a projection `liquidFraction` (1 = at the mark).
 * Up to the mark the height follows the flask's shape, so equal fractions look like equal volumes;
 * above the mark the 0–10 % range is spread over the upper neck so the overshoot stays visible.
 */
export const liquidHeight = (fraction: number): number => {
  if (fraction <= 0) return 0;
  if (fraction >= 1) {
    const over = Math.min(fraction - 1, ABOVE_MARK_RANGE) / ABOVE_MARK_RANGE;
    return FLASK_MARK_Y + over * (FLASK_NECK_TOP_Y - FLASK_MARK_Y) * 0.8;
  }
  const target = fraction * CUMULATIVE.at(-1)!;
  const i = CUMULATIVE.findIndex((v) => v >= target);
  if (i <= 0) return 0;
  const lo = CUMULATIVE[i - 1]!;
  const hi = CUMULATIVE[i]!;
  return (i - 1 + (hi === lo ? 0 : (target - lo) / (hi - lo))) * STEP;
};

/** Inner profile up to height h, closed at the surface (for a lathe or a clip path). */
export const liquidProfile = (h: number): [number, number][] => {
  if (h <= 0) return [];
  const pts: [number, number][] = [[0, WALL]];
  for (const [r, y] of FLASK_PROFILE) {
    if (y <= WALL || y >= h) continue;
    pts.push([Math.max(0.005, r - WALL), y]);
  }
  pts.push([Math.max(0.005, flaskRadiusAt(h) - WALL), h], [0, h]);
  return pts;
};
