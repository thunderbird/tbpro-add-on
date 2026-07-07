import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression test for the multipart create-entry idempotency fix.
//
// Create-entry is retried by the client with the SAME server-minted id (minted
// once at /uploads/signed and reused). Before the fix, a retry after the Upload
// row already committed hit a Prisma P2002 unique-constraint violation, which
// createUpload rethrew as UPLOAD_NOT_CREATED — permanently dooming the whole
// multipart upload and stranding an Item-less Upload orphan. The fix treats
// P2002 as success and returns the existing row.

const h = vi.hoisted(() => {
  // Minimal stand-in matching the shape createUpload checks:
  // `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`.
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    mockCreate: vi.fn(),
    mockFindUnique: vi.fn(),
    mockLength: vi.fn(),
    PrismaClientKnownRequestError,
  };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return {
      upload: { create: h.mockCreate, findUnique: h.mockFindUnique },
    };
  }),
  Prisma: { PrismaClientKnownRequestError: h.PrismaClientKnownRequestError },
}));

// Module under test imports `storage` via '../storage'; from this test file the
// same file resolves at '../../storage'. Only length() is exercised here.
vi.mock('../../storage', () => ({
  default: { length: h.mockLength },
}));

// Static import (not top-level `await import`) so tsc is happy; vi.mock() above
// is hoisted above imports, so createUpload still sees the mocked Prisma/storage.
import { createUpload } from '../../models/uploads';

const ID = '11111111-1111-1111-1111-111111111111';
const ARGS = [ID, 100, 'owner-1', 'MESSAGE', 1, 'hash'] as const;

describe('createUpload idempotency (multipart create-entry retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stored object is at least as large as the stated size, so the size check passes.
    h.mockLength.mockResolvedValue(150);
  });

  it('returns the created row on first attempt', async () => {
    const row = { id: ID, size: 100, part: 1 };
    h.mockCreate.mockResolvedValue(row);

    const result = await createUpload(...ARGS);

    expect(result).toBe(row);
    expect(h.mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns the existing row (not throw) when the retry hits a P2002 unique violation', async () => {
    // Same owner as ARGS (owner-1) — this is the real retry case.
    const existing = { id: ID, size: 100, part: 1, ownerId: 'owner-1' };
    h.mockCreate.mockRejectedValue(
      new h.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
      })
    );
    h.mockFindUnique.mockResolvedValue(existing);

    const result = await createUpload(...ARGS);

    expect(result).toBe(existing);
    expect(h.mockFindUnique).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it('throws (does not hand back a foreign row) if the P2002 id collides with another owner', async () => {
    // Astronomically unlikely UUIDv4 collision across users: the existing row
    // belongs to someone else, so idempotency must NOT return it.
    h.mockCreate.mockRejectedValue(
      new h.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
      })
    );
    h.mockFindUnique.mockResolvedValue({
      id: ID,
      size: 100,
      part: 1,
      ownerId: 'someone-else',
    });

    await expect(createUpload(...ARGS)).rejects.toThrow();
  });

  it('still throws if P2002 fires but the row cannot be found', async () => {
    h.mockCreate.mockRejectedValue(
      new h.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
      })
    );
    h.mockFindUnique.mockResolvedValue(null);

    await expect(createUpload(...ARGS)).rejects.toThrow();
  });

  it('rethrows non-P2002 database errors as a create failure', async () => {
    h.mockCreate.mockRejectedValue(new Error('connection reset'));

    await expect(createUpload(...ARGS)).rejects.toThrow();
    expect(h.mockFindUnique).not.toHaveBeenCalled();
  });
});
