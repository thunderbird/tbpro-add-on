import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Key backup v2, model layer: what upgradeKeys writes inside its transaction,
// and the legacy-write guard. Rollback itself is proven against a real DB in
// users.upgradekeys.integration.ts.

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
  userUpdateMany: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemCount: vi.fn(),
  accessLinkDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  ContainerType: { FOLDER: 'FOLDER', CONVERSATION: 'CONVERSATION' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
  PrismaClient: vi.fn(function () {
    return {
      user: { findUnique: h.userFindUnique },
      $transaction: h.transaction,
    };
  }),
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, { code }: { code: string }) {
        super(message);
        this.code = code;
      }
    },
  },
}));

import { Prisma } from '@prisma/client';
import { isLegacyBackupSuperseded, upgradeKeys } from '../../models/users';

const ID = 'user-v2';
const tx = {
  user: {
    findUniqueOrThrow: h.userFindUniqueOrThrow,
    updateMany: h.userUpdateMany,
  },
  item: { updateMany: h.itemUpdateMany, count: h.itemCount },
  accessLink: { deleteMany: h.accessLinkDeleteMany },
};
const base = {
  publicKey: 'new-pk',
  expectedPublicKey: 'old-pk',
  backup: '{"v":2}',
};

describe('upgradeKeys (model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.transaction.mockImplementation((fn) => fn(tx));
    h.userFindUniqueOrThrow.mockResolvedValue({ backupVersion: 1 });
    h.itemUpdateMany.mockResolvedValue({ count: 1 });
    h.itemCount.mockResolvedValue(2);
    h.accessLinkDeleteMany.mockResolvedValue({ count: 2 });
    h.userUpdateMany.mockResolvedValue({ count: 1 });
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'optin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets the v2 backup and public key, nulls legacy columns, bumps updatedAt', async () => {
    await expect(upgradeKeys(ID, base)).resolves.toEqual({
      from: 1,
      items: 0,
      linksRevoked: 0,
    });

    const { where, data } = h.userUpdateMany.mock.calls[0][0];
    expect(where).toEqual({
      id: ID,
      publicKey: 'old-pk',
      backupVersion: { lte: 2 },
    });
    expect(data).toMatchObject({
      publicKey: 'new-pk',
      backup: '{"v":2}',
      backupVersion: 2,
      backupKeypair: null,
      backupContainerKeys: null,
      backupKeystring: null,
      backupSalt: null,
    });
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect(h.itemUpdateMany).not.toHaveBeenCalled();
    expect(h.accessLinkDeleteMany).not.toHaveBeenCalled();
  });

  it('re-wraps items only where the key is unchanged and the caller owns the container', async () => {
    const items = [
      { id: 1, wrappedKey: 'n1', expectedWrappedKey: 'o1' },
      { id: 2, wrappedKey: 'n2', expectedWrappedKey: 'o2' },
    ];

    await expect(
      upgradeKeys(ID, { ...base, items, revokeLinks: true })
    ).resolves.toEqual({ from: 1, items: 2, linksRevoked: 2 });

    expect(h.itemUpdateMany).toHaveBeenCalledTimes(2);
    expect(h.itemUpdateMany.mock.calls[0][0].where).toEqual({
      id: 1,
      wrappedKey: 'o1',
      container: { ownerId: ID },
    });
    expect(h.itemUpdateMany.mock.calls[0][0].data.wrappedKey).toBe('n1');
    expect(h.accessLinkDeleteMany).toHaveBeenCalledWith({
      where: { share: { container: { ownerId: ID } } },
    });
  });

  it('writes the user row first and stops when the public key moved on', async () => {
    h.userUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      upgradeKeys(ID, {
        ...base,
        items: [{ id: 1, wrappedKey: 'n1', expectedWrappedKey: 'o1' }],
        revokeLinks: true,
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');

    expect(h.itemUpdateMany).not.toHaveBeenCalled();
    expect(h.accessLinkDeleteMany).not.toHaveBeenCalled();
  });

  it('aborts the transaction when an item is stale or not owned', async () => {
    h.itemUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      upgradeKeys(ID, {
        ...base,
        items: [
          { id: 1, wrappedKey: 'n1', expectedWrappedKey: 'o1' },
          { id: 2, wrappedKey: 'n2', expectedWrappedKey: 'stale' },
        ],
        revokeLinks: true,
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');

    expect(h.accessLinkDeleteMany).not.toHaveBeenCalled();
  });

  it('runs serializably and counts owned items only for a rotation', async () => {
    await upgradeKeys(ID, base);
    expect(h.itemCount).not.toHaveBeenCalled();
    expect(h.transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: 'Serializable',
    });

    await upgradeKeys(ID, {
      ...base,
      items: [
        { id: 1, wrappedKey: 'n1', expectedWrappedKey: 'o1' },
        { id: 2, wrappedKey: 'n2', expectedWrappedKey: 'o2' },
      ],
    });
    expect(h.itemCount).toHaveBeenCalledWith({
      where: { container: { ownerId: ID } },
    });
  });

  it('refuses a rotation that does not cover every owned item', async () => {
    h.itemCount.mockResolvedValue(3);

    await expect(
      upgradeKeys(ID, {
        ...base,
        items: [
          { id: 1, wrappedKey: 'n1', expectedWrappedKey: 'o1' },
          { id: 2, wrappedKey: 'n2', expectedWrappedKey: 'o2' },
        ],
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');
    expect(h.itemUpdateMany).not.toHaveBeenCalled();
  });

  it('maps a serialization failure to KEY_UPGRADE_STALE', async () => {
    h.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: 'test',
      })
    );

    await expect(upgradeKeys(ID, base)).rejects.toThrow('KEY_UPGRADE_STALE');
  });

  it('refuses a first upgrade while the mode is off', async () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'off');

    await expect(upgradeKeys(ID, base)).rejects.toThrow(
      'KEY_BACKUP_V2_DISABLED'
    );
    expect(h.userUpdateMany).not.toHaveBeenCalled();
  });

  it('allows a v2 -> v2 rewrite while the mode is off', async () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'off');
    h.userFindUniqueOrThrow.mockResolvedValue({ backupVersion: 2 });

    await expect(upgradeKeys(ID, base)).resolves.toMatchObject({ from: 2 });
    expect(h.userUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('allows a v2 -> v2 rewrite', async () => {
    h.userFindUniqueOrThrow.mockResolvedValue({ backupVersion: 2 });

    await expect(upgradeKeys(ID, base)).resolves.toMatchObject({ from: 2 });
    expect(h.userUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('never lowers a newer backup version', async () => {
    h.userFindUniqueOrThrow.mockResolvedValue({ backupVersion: 3 });

    await expect(upgradeKeys(ID, base)).rejects.toThrow(
      'BACKUP_FORMAT_SUPERSEDED'
    );
    expect(h.userUpdateMany).not.toHaveBeenCalled();
  });
});

describe('isLegacyBackupSuperseded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('passes for a v1 user', async () => {
    h.userFindUnique.mockResolvedValue({ backupVersion: 1 });

    await expect(isLegacyBackupSuperseded(ID, 'test')).resolves.toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('is true and logs one counter line for a v2 user', async () => {
    h.userFindUnique.mockResolvedValue({ backupVersion: 2 });

    await expect(isLegacyBackupSuperseded(ID, 'test')).resolves.toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      'legacy key backup write rejected',
      JSON.stringify({ userId: ID, via: 'test', backupVersion: 2 })
    );
  });
});
