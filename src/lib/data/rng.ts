/** Deterministic seeded PRNG (mulberry32) so the synthetic dataset is identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Approximately normal noise in [-~3, ~3] standard deviations (sum of uniforms). */
export function makeNoise(seed: string) {
  const r = mulberry32(hashString(seed));
  return (sd: number) => {
    const z = (r() + r() + r() + r() + r() + r() - 3) / Math.sqrt(0.5);
    return z * sd;
  };
}
