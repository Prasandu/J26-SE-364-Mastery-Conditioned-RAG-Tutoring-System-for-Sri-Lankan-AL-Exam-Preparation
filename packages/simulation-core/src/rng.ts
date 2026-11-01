/**
 * Seeded PRNG (mulberry32). The generator state lives in SessionMeta, so transitions stay pure:
 * the same state always yields the same random draw.
 */
export const seedToRngState = (seed: number): number => (seed ^ 0x9e3779b9) >>> 0;

/** Returns a value in [0, 1) and the next generator state. */
export const nextRandom = (rngState: number): [value: number, nextState: number] => {
  const next = (rngState + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
};
