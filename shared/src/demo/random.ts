/** Small deterministic PRNG (mulberry32), so sample data is stable between runs. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A 32-bit seed from a list of parts (FNV-1a, then mixed), e.g. `hashSeed(branchId, dateKey, staffId, 'sessions')`. */
export function hashSeed(...parts: (string | number)[]): number {
  const s = parts.join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** A PRNG seeded from parts: the same parts always give the same sequence. */
export function rngFor(...parts: (string | number)[]) {
  return rng(hashSeed(...parts))
}
