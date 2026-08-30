import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression test for issue #1116 (safe "Reset Access → Create new encryption
// key").
//
// The old resetKeys() nulled publicKey/backupKeypair/backupKeystring/backupSalt/
// backupContainerKeys BEFORE any replacement existed. If setup did not complete
// immediately afterwards, the account was left with NO recovery blob at all — a
// permanent, unrecoverable lockout. It also left `updatedAt` unchanged, so the
// destructive change was invisible to anything auditing on it.
//
// The fix is fail-closed write-new-then-swap: resetKeys refuses to touch the row
// without a confirmed replacement, and when given one, swaps it in with a single
// update that also bumps `updatedAt`.

const h = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  // The model file also references ContainerType/UserTier enums at import time.
  ContainerType: { FOLDER: 'FOLDER', CONVERSATION: 'CONVERSATION' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
  PrismaClient: vi.fn(function () {
    return {
      user: { update: h.mockUpdate },
    };
  }),
  Prisma: {},
}));

import { resetKeys } from '../../models/users';

const ID = 'user-1116';

const VALID_REPLACEMENT = {
  publicKey: 'new-public-key-jwk',
  backupKeypair: 'new-encrypted-keypair',
  backupKeystring: 'new-password-wrapped-key',
  backupSalt: 'new-salt',
  backupContainerKeys: '{}',
};

describe('resetKeys — safe write-new-then-swap (#1116)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockUpdate.mockResolvedValue({ id: ID });
  });

  it('refuses to touch the row (no destructive wipe) when no replacement is provided', async () => {
    await expect(resetKeys(ID)).rejects.toThrow();
    expect(h.mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses to touch the row when the replacement is missing required fields', async () => {
    await expect(
      // Missing backupKeystring / backupSalt.
      resetKeys(ID, {
        publicKey: 'pk',
        backupKeypair: 'kp',
      } as never)
    ).rejects.toThrow();
    expect(h.mockUpdate).not.toHaveBeenCalled();
  });

  it('never writes a null into any key/backup field', async () => {
    // Old behavior nulled every field; the fix must never do that.
    await resetKeys(ID, VALID_REPLACEMENT);

    const args = h.mockUpdate.mock.calls[0][0];
    expect(args.data.publicKey).toBe(VALID_REPLACEMENT.publicKey);
    expect(args.data.backupKeypair).toBe(VALID_REPLACEMENT.backupKeypair);
    expect(args.data.backupKeystring).toBe(VALID_REPLACEMENT.backupKeystring);
    expect(args.data.backupSalt).toBe(VALID_REPLACEMENT.backupSalt);
    // The one field allowed to be empty is the (empty) container-key map — but
    // it is a serialized string the client sends, not a null wipe.
    expect(args.data.backupKeypair).not.toBeNull();
    expect(args.data.backupKeystring).not.toBeNull();
    expect(args.data.backupSalt).not.toBeNull();
    expect(args.data.publicKey).not.toBeNull();
  });

  it('bumps updatedAt so the change is auditable', async () => {
    await resetKeys(ID, VALID_REPLACEMENT);

    const args = h.mockUpdate.mock.calls[0][0];
    expect(args.data.updatedAt).toBeInstanceOf(Date);
  });

  it('performs the swap as a single update scoped to the user', async () => {
    await resetKeys(ID, VALID_REPLACEMENT);

    expect(h.mockUpdate).toHaveBeenCalledTimes(1);
    const args = h.mockUpdate.mock.calls[0][0];
    expect(args.where).toEqual({ id: ID });
  });
});
