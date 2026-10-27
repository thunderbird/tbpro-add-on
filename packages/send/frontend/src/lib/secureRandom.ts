/**
 * Small wrapper over the Web Crypto CSPRNG so security-relevant tokens never
 * come from `Math.random()` (SonarCloud rule S2245). `crypto.getRandomValues`
 * is available in every browser context, including insecure (http://) dev
 * origins where `crypto.randomUUID` is not, and in Node >= 19 / vitest.
 *
 * Deliberately no "random float in [0, 1)" helper here: dividing or rounding a
 * CSPRNG value is flagged by CodeQL (js/biased-cryptographic-random). Callers
 * that need a number in a range use randomIntBelow(), which is unbiased.
 */

/** `byteLength` random bytes as a lowercase hex string. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uniform random integer in [0, max) from the Web Crypto CSPRNG.
 *
 * Rejection sampling: mask a 32-bit draw down to the smallest 2^k - 1 that
 * covers max - 1 and redraw while the candidate is >= max. No division,
 * rounding or modulo of the random value, so the result is unbiased
 * (SonarCloud S2245, CodeQL js/biased-cryptographic-random). Each draw is
 * accepted with probability > 1/2, so the expected number of draws is < 2.
 *
 * Used by the upload retry jitter (helpers.ts getUploadRetryDelayMs).
 */
export function randomIntBelow(max: number): number {
  if (!Number.isFinite(max) || max <= 1) {
    return 0;
  }
  // One 32-bit word per draw, so the bound is capped at 2^32.
  const bound = Math.min(Math.ceil(max), 2 ** 32);
  // Smallest all-ones bitmask that can represent bound - 1. `>>> 0` keeps the
  // masked value unsigned when the mask has its top bit set.
  const mask = 2 ** Math.ceil(Math.log2(bound)) - 1;
  const draw = new Uint32Array(1);
  for (;;) {
    const candidate = (crypto.getRandomValues(draw)[0] & mask) >>> 0;
    if (candidate < bound) {
      return candidate;
    }
  }
}
