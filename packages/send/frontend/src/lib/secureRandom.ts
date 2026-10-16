/**
 * Small wrapper over the Web Crypto CSPRNG so security-relevant tokens never
 * come from `Math.random()` (SonarCloud rule S2245). `crypto.getRandomValues`
 * is available in every browser context, including insecure (http://) dev
 * origins where `crypto.randomUUID` is not, and in Node >= 19 / vitest.
 *
 * Deliberately no "random float in [0, 1)" helper here: dividing or rounding a
 * CSPRNG value is flagged by CodeQL (js/biased-cryptographic-random), and the
 * one caller that wants a float (upload retry jitter) is not a security value.
 */

/** `byteLength` random bytes as a lowercase hex string. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
