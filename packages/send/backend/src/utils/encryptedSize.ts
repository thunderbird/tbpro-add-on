// Deterministic ECE (Encrypted Content-Encoding) size math, mirrored from the
// frontend (`frontend/src/lib/ece.ts` + `helpers.ts:calculateEncryptedSize`).
//
// Storage holds ECE-encrypted ciphertext, which is ALWAYS strictly larger than
// the plaintext blob (per-record tag + padding, plus a one-time header). The
// backend needs the same function the client uses so it can:
//   1. sign the exact ciphertext content-length into the presigned PUT, and
//   2. verify the uploaded object against provider ground truth
// without trusting a client-stated number (private #36).
//
// These constants MUST match the frontend. If the client's record size or
// overhead ever changes, both sides change together or every upload is
// rejected.

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
