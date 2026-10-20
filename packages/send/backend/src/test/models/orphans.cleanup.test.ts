import { beforeEach, describe, expect, it, vi } from 'vitest';

// Orphan reconciliation (#117): reservations count toward quota and are taken
// under a per-owner lock, item-less uploads older than the age guard lose
// their row and bytes, and expired never-finalized reservations lose their
// bytes unless a finalize holds them. Prisma and storage are mocked.

const h = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    upload: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    pendingUpload: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  };
  return { prisma, storageDel: vi.fn() };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));

vi.mock('../../storage', () => ({
  default: { del: h.storageDel },
}));

import { deleteOrphans, findOrphans, getUsedStorage } from '../../models';
import {
  getReservedBytes,
  holdPendingUpload,
  releasePendingUploads,
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from '../../models/pendingUploads';
import { UPLOAD_URL_TTL_SECONDS } from '../../storage/s3b2';

const HOUR_MS = 60 * 60 * 1000;
const LIMIT = 10_000;

function cutoffOf(where: { OR?: { createdAt: { lt: Date } | null }[] }) {
  return (where.OR?.[0]?.createdAt as { lt: Date }).lt.getTime();
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ORPHAN_MIN_AGE_HOURS;
  h.prisma.$transaction.mockImplementation((fn) => fn(h.prisma));
  h.prisma.$executeRaw.mockResolvedValue(1);
  h.storageDel.mockResolvedValue(true);
  h.prisma.upload.findMany.mockResolvedValue([]);
  h.prisma.upload.deleteMany.mockResolvedValue({ count: 1 });
  h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: null } });
  h.prisma.upload.count.mockResolvedValue(0);
  h.prisma.pendingUpload.findMany.mockResolvedValue([]);
  h.prisma.pendingUpload.deleteMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.aggregate.mockResolvedValue({ _sum: { size: null } });
  h.prisma.pendingUpload.count.mockResolvedValue(0);
});

describe('reservePendingUpload', () => {
  it('reserves the stated size until the presigned URL expires', async () => {
    const before = Date.now();
    expect(await reservePendingUpload('id-1', 'owner-1', 2048, LIMIT)).toBe(
      true
    );

    const { data } = h.prisma.pendingUpload.create.mock.calls[0][0];
    expect(data).toMatchObject({ id: 'id-1', ownerId: 'owner-1', size: 2048 });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + UPLOAD_URL_TTL_SECONDS * 1000
    );
  });

  it('checks and inserts under a per-owner lock', async () => {
    await reservePendingUpload('id-1', 'owner-1', 2048, LIMIT);

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [sql, owner] = h.prisma.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain('pg_advisory_xact_lock');
    expect(owner).toBe('owner-1');
    expect(h.prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      h.prisma.pendingUpload.aggregate.mock.invocationCallOrder[0]
    );
  });

  it('refuses, reserving nothing, when stored plus reserved bytes would reach the limit', async () => {
    h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: 6000n } });
    h.prisma.pendingUpload.aggregate.mockResolvedValue({
      _sum: { size: 3000n },
    });

    expect(await reservePendingUpload('id-1', 'owner-1', 1000, LIMIT)).toBe(
      false
    );
    expect(h.prisma.pendingUpload.create).not.toHaveBeenCalled();
  });

  it('records a size-less reservation for a request that sent none', async () => {
    h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: 99999n } });

    expect(
      await reservePendingUpload('id-1', 'owner-1', undefined, LIMIT)
    ).toBe(true);
    const { data } = h.prisma.pendingUpload.create.mock.calls[0][0];
    expect(data.size).toBeNull();
  });
});

describe('holdPendingUpload', () => {
  it('pushes the expiry of an unclaimed reservation out', async () => {
    expect(await holdPendingUpload('id-1')).toBe(true);
    const { where, data } = h.prisma.pendingUpload.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'id-1', sweptAt: null });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses when cleanup already claimed the reservation', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.count.mockResolvedValue(1);

    expect(await holdPendingUpload('id-1')).toBe(false);
  });

  it('allows an id with no reservation (minted before reservations)', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });

    expect(await holdPendingUpload('id-1')).toBe(true);
  });
});

describe('releasePendingUploads', () => {
  it('frees the bytes but keeps a record until the URL expires', async () => {
    await releasePendingUploads('owner-1', ['a', 'b']);

    expect(h.prisma.pendingUpload.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1', id: { in: ['a', 'b'] } },
      data: { size: null },
    });
    const { data, skipDuplicates } =
      h.prisma.pendingUpload.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.map(({ id }) => id)).toEqual(['a', 'b']);
    for (const row of data) {
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('does nothing for an empty list', async () => {
    await releasePendingUploads('owner-1', []);
    expect(h.prisma.pendingUpload.updateMany).not.toHaveBeenCalled();
  });
});

describe('quota counts reservations', () => {
  it('counts only unexpired reservations of the owner', async () => {
    h.prisma.pendingUpload.aggregate.mockResolvedValue({
      _sum: { size: 300n },
    });

    expect(await getReservedBytes('owner-1')).toBe(300);
    const { where } = h.prisma.pendingUpload.aggregate.mock.calls[0][0];
    expect(where.ownerId).toBe('owner-1');
    expect(where.expiresAt.gt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(where.id).toBeUndefined();
  });

  it('adds reserved bytes to active storage', async () => {
    h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: 1000n } });
    h.prisma.pendingUpload.aggregate.mockResolvedValue({
      _sum: { size: 500n },
    });

    expect(await getUsedStorage('owner-1')).toEqual({
      active: 1500,
      expired: 0,
    });
  });

  it('leaves out the reservation being finalized', async () => {
    await getUsedStorage('owner-1', false, 'id-final');

    const { where } = h.prisma.pendingUpload.aggregate.mock.calls[0][0];
    expect(where.id).toEqual({ not: 'id-final' });
  });
});

describe('findOrphans', () => {
  it('only matches item-less uploads older than hoursSinceCreation', async () => {
    h.prisma.upload.findMany.mockResolvedValue([
      { id: 'a', ownerId: 'o' },
      { id: 'b', ownerId: 'o' },
    ]);

    const result = await findOrphans(6);

    expect(result.uploadIds).toEqual(['a', 'b']);
    const { where } = h.prisma.upload.findMany.mock.calls[0][0];
    expect(where.items).toEqual({ none: {} });
    expect(Date.now() - cutoffOf(where)).toBeGreaterThanOrEqual(6 * HOUR_MS);
    expect(Date.now() - cutoffOf(where)).toBeLessThan(6 * HOUR_MS + 1000);
  });

  it('defaults to 24 hours, overridable with ORPHAN_MIN_AGE_HOURS', async () => {
    await findOrphans();
    let { where } = h.prisma.upload.findMany.mock.calls[0][0];
    expect(Date.now() - cutoffOf(where)).toBeGreaterThanOrEqual(24 * HOUR_MS);

    process.env.ORPHAN_MIN_AGE_HOURS = '48';
    await findOrphans();
    ({ where } = h.prisma.upload.findMany.mock.calls[1][0]);
    expect(Date.now() - cutoffOf(where)).toBeGreaterThanOrEqual(48 * HOUR_MS);
  });
});

describe('deleteOrphans', () => {
  it('removes the row and the stored bytes of each orphan', async () => {
    h.prisma.upload.findMany.mockResolvedValue([
      { id: 'a', ownerId: 'o' },
      { id: 'b', ownerId: 'o' },
    ]);

    const result = await deleteOrphans();

    expect(result).toEqual({
      deletedUploadIds: ['a', 'b'],
      errorUploadIds: [],
    });
    expect(h.prisma.upload.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a', items: { none: {} } },
    });
    expect(h.storageDel).toHaveBeenCalledWith('a');
    expect(h.storageDel).toHaveBeenCalledWith('b');
  });

  it('records the bytes for the sweep in the same transaction as the row delete', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);

    await deleteOrphans();

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.prisma.pendingUpload.createMany).toHaveBeenCalledWith({
      data: [{ id: 'a', ownerId: 'o', expiresAt: new Date(0) }],
      skipDuplicates: true,
    });
    expect(
      h.prisma.pendingUpload.createMany.mock.invocationCallOrder[0]
    ).toBeLessThan(h.storageDel.mock.invocationCallOrder[0]);
    // Bytes gone: the sweep record is dropped again.
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'o', id: { in: ['a'] } },
    });
  });

  it('keeps an upload that gained an item after the scan', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.upload.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual([]);
    expect(h.prisma.pendingUpload.createMany).not.toHaveBeenCalled();
    expect(h.storageDel).not.toHaveBeenCalled();
  });

  it('leaves the sweep record in place when the bytes cannot be deleted', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.storageDel.mockRejectedValue(new Error('bucket down'));

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual(['a']);
    expect(h.prisma.pendingUpload.createMany).toHaveBeenCalled();
    expect(h.prisma.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it('reports a row it could not delete and leaves its bytes', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.$transaction.mockRejectedValue(new Error('db down'));

    const result = await deleteOrphans();

    expect(result.errorUploadIds).toEqual(['a']);
    expect(h.storageDel).not.toHaveBeenCalled();
  });
});

describe('sweepExpiredPendingUploads', () => {
  it('claims, then deletes the bytes and record of a never-finalized upload', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'gone', ownerId: 'o' },
    ]);

    const result = await sweepExpiredPendingUploads(24);

    expect(result).toEqual({ deletedIds: ['gone'], errorIds: [] });
    const claim = h.prisma.pendingUpload.updateMany.mock.calls[0][0];
    expect(claim.where.id).toBe('gone');
    expect(claim.data.sweptAt).toBeInstanceOf(Date);
    expect(
      Date.now() - claim.where.expiresAt.lt.getTime()
    ).toBeGreaterThanOrEqual(24 * HOUR_MS);
    // The Upload-row check happens after the claim.
    expect(
      h.prisma.pendingUpload.updateMany.mock.invocationCallOrder[0]
    ).toBeLessThan(h.prisma.upload.count.mock.invocationCallOrder[0]);
    expect(h.storageDel).toHaveBeenCalledWith('gone');
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'o', id: { in: ['gone'] } },
    });
  });

  it('skips a reservation a finalize held since the scan', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'held', ownerId: 'o' },
    ]);
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });

    const result = await sweepExpiredPendingUploads(24);

    expect(result.deletedIds).toEqual([]);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps the bytes of a reservation whose upload was finalized', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'kept', ownerId: 'o' },
    ]);
    h.prisma.upload.count.mockResolvedValue(1);

    const result = await sweepExpiredPendingUploads(24);

    expect(result.deletedIds).toEqual([]);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalled();
  });

  it('keeps the record for a retry when the delete fails', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'retry', ownerId: 'o' },
    ]);
    h.storageDel.mockRejectedValue(new Error('bucket down'));

    const result = await sweepExpiredPendingUploads(24);

    expect(result.errorIds).toEqual(['retry']);
    expect(h.prisma.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it('does nothing when no reservation has expired', async () => {
    const result = await sweepExpiredPendingUploads(24);

    expect(result).toEqual({ deletedIds: [], errorIds: [] });
    expect(h.prisma.pendingUpload.updateMany).not.toHaveBeenCalled();
  });
});
