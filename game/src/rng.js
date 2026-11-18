// Deterministic pseudo-randomness. One seed builds the whole of Marisol Bay, so every load and
// every screenshot of the same seed is the same city.

/** Turn a seed number or string into a 32-bit unsigned seed. */
export function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32: small, fast and good enough for city blocks and window lights. */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + (max - min) * random();
}

/** One element of `list`. */
export function pick(random, list) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** True with probability `probability`. */
export function chance(random, probability) {
  return random() < probability;
}

/** A whole number in [min, max]. */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
