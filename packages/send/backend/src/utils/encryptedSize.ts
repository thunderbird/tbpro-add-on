// Deterministic ECE (Encrypted Content-Encoding) size math for the ciphertext
// the browser produces in `frontend/src/lib/ece.ts` (`encryptStream`). The
// frontend has no size function of its own -- the one in `helpers.ts` went with
// the WebSocket upload path in #1161 -- so this is the only place the math
// lives, and it is derived from ece.ts's constants below.
//
// Storage holds ECE-encrypted ciphertext, which is ALWAYS strictly larger than
// the plaintext blob (per-record tag + padding, plus a one-time header). The
// backend has to predict that size exactly, so it can:
//   1. sign the exact ciphertext content-length into the presigned PUT, and
//   2. verify the uploaded object against provider ground truth
// without trusting a client-stated number (private #36).
//
// These constants MUST match ece.ts. If the client's record size or overhead
// ever changes, both sides change together or every upload is rejected.

export const ECE_RECORD_SIZE = 1024 * 64;
const TAG_LENGTH = 16;
export const OVERHEAD_SIZE = TAG_LENGTH + 1; // 17
export const HEADER_SIZE = 21;

/**
 * The size a plaintext blob becomes after ECE encryption.
 *
 * @param originalSize plaintext size in bytes
 * @param recordSize   per-record chunk size (defaults to ECE_RECORD_SIZE)
 * @returns ciphertext size in bytes
 */
export function calculateEncryptedSize(
  originalSize: number,
  recordSize = ECE_RECORD_SIZE
): number {
  const chunkSize = recordSize - OVERHEAD_SIZE;
  const numChunks = Math.ceil(originalSize / chunkSize);
  return originalSize + numChunks * OVERHEAD_SIZE + HEADER_SIZE;
}
