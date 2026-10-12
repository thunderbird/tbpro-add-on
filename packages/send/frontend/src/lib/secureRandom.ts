/**
 * Small wrappers over the Web Crypto CSPRNG so application code never reaches
 * for `Math.random()` (SonarCloud rule S2245). `crypto.getRandomValues` is
 * available in every browser context, including insecure (http://) dev origins
 * where `crypto.randomUUID` is not, and in Node >= 19 / vitest.
 */

/** `byteLength` random bytes as a lowercase hex string. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A uniformly distributed number in [0, 1), like `Math.random()`. */
export function randomUnitInterval(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value / 2 ** 32;
}
