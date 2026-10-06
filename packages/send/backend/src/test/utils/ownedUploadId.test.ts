import { beforeEach, describe, expect, it } from 'vitest';

import {
  mintOwnedUploadId,
  verifyOwnedUploadId,
} from '../../utils/ownedUploadId';

const OWNER = 'user-owner';

// Strict uuidv4 shape: guards the @db.Uuid contract (Upload.id, Item.uploadId)
// that the minted id must keep satisfying.
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Flip one hex char inside the embedded tag (the last 12 hex chars).
function tamper(id: string): string {
  const last = id[id.length - 1];
  return id.slice(0, -1) + (last === '0' ? '1' : '0');
}

describe('owned upload ids (mint + verify)', () => {
  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = 'test-secret';
  });

  it('mints a valid uuidv4-shaped id that verifies for its owner', () => {
    const id = mintOwnedUploadId(OWNER);
    expect(id).toMatch(UUID_V4);
    expect(verifyOwnedUploadId(id, OWNER)).toBe(true);
  });

  it('does not verify for a different user', () => {
    const id = mintOwnedUploadId(OWNER);
    expect(verifyOwnedUploadId(id, 'user-other')).toBe(false);
  });

  it('never verifies a fully random uuid (pre-tag id)', () => {
    expect(
      verifyOwnedUploadId('123e4567-e89b-42d3-a456-426614174000', OWNER)
    ).toBe(false);
  });

  it('rejects a tampered tag', () => {
    const id = mintOwnedUploadId(OWNER);
    expect(verifyOwnedUploadId(tamper(id), OWNER)).toBe(false);
  });

  it('binds the tag to the random prefix: a tag replayed onto another prefix fails', () => {
    const a = mintOwnedUploadId(OWNER);
    const b = mintOwnedUploadId(OWNER);
    // First 24 hex chars (incl. dashes: 8-4-4-4 → chars 0..23) are the prefix.
    const spliced = b.slice(0, 24) + a.slice(24);
    expect(spliced).toMatch(UUID_V4);
    expect(verifyOwnedUploadId(spliced, OWNER)).toBe(false);
  });

  it('verifies case-insensitively (uuids may round-trip uppercased)', () => {
    const id = mintOwnedUploadId(OWNER);
    expect(verifyOwnedUploadId(id.toUpperCase(), OWNER)).toBe(true);
  });

  it('returns false for a non-uuid string', () => {
    expect(verifyOwnedUploadId('not-a-uuid', OWNER)).toBe(false);
  });

  it('throws on mint when ACCESS_TOKEN_SECRET is unset', () => {
    delete process.env.ACCESS_TOKEN_SECRET;
    expect(() => mintOwnedUploadId(OWNER)).toThrow(/ACCESS_TOKEN_SECRET/);
  });
});
