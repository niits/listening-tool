/**
 * Produces a short, stable cache key from an audio URL.
 *
 * Uses a djb2-style 32-bit hash, returned as a base-36 string (~7 chars).
 * Collisions are theoretically possible but astronomically unlikely for
 * the small number of URLs a single user will ever process.
 */
export function hashUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    // djb2: hash = hash * 33 ^ charCode  (via bit ops for speed)
    hash = ((hash << 5) + hash) ^ url.charCodeAt(i);
    hash = hash | 0; // keep as 32-bit signed int
  }
  // Convert to unsigned 32-bit then base-36 for a compact string
  return (hash >>> 0).toString(36);
}
