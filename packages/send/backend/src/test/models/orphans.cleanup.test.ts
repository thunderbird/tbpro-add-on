import { beforeEach, describe, expect, it, vi } from 'vitest';

// Orphan reconciliation (#117): reservations count toward quota, item-less
// uploads older than the age guard lose their row and bytes, and expired
// never-finalized reservations lose their bytes. Prisma and storage are mocked.

const h = vi.hoisted(() => {
  const prisma = {
    upload: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    pendingUpload: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
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
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from '../../models/pendingUploads';
import { UPLOAD_URL_TTL_SECONDS } from '../../storage/s3b2';

const HOUR_MS = 60 * 60 * 1000;

function cutoffOf(where: { OR?: { createdAt: { lt: Date } | null }[] }) {
  return (where.OR?.[0]?.createdAt as { lt: Date }).lt.getTime();
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ORPHAN_MIN_AGE_HOURS;
  h.storageDel.mockResolvedValue(true);
  h.prisma.upload.findMany.mockResolvedValue([]);
  h.prisma.upload.deleteMany.mockResolvedValue({ count: 1 });
  h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: null } });
  h.prisma.pendingUpload.findMany.mockResolvedValue([]);
  h.prisma.pendingUpload.deleteMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
  h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.aggregate.mockResolvedValue({ _sum: { size: null } });
});

describe('reservePendingUpload', () => {
  it('reserves the stated size until the presigned URL expires', async () => {
    const before = Date.now();
    await reservePendingUpload('id-1', 'owner-1', 2048);

    const { data } = h.prisma.pendingUpload.create.mock.calls[0][0];
    expect(data).toMatchObject({ id: 'id-1', ownerId: 'owner-1', size: 2048 });
    const ttl = data.expiresAt.getTime() - data.createdAt.getTime();
    expect(ttl).toBe(UPLOAD_URL_TTL_SECONDS * 1000);
    expect(data.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('stores a null size for a request that sent none', async () => {
    await reservePendingUpload('id-1', 'owner-1');

    const { data } = h.prisma.pendingUpload.create.mock.calls[0][0];
    expect(data.size).toBeNull();
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

  it('keeps an upload that gained an item after the scan', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.upload.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual([]);
    expect(h.storageDel).not.toHaveBeenCalled();
  });

  it('hands bytes it could not delete to the pending-upload sweep', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.storageDel.mockRejectedValue(new Error('bucket down'));

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual(['a']);
    const { data, skipDuplicates } =
      h.prisma.pendingUpload.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([{ id: 'a', ownerId: 'o', expiresAt: new Date(0) }]);
  });

  it('reports a row it could not delete and leaves its bytes', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.upload.deleteMany.mockRejectedValue(new Error('db down'));

    const result = await deleteOrphans();

    expect(result.errorUploadIds).toEqual(['a']);
    expect(h.storageDel).not.toHaveBeenCalled();
  });
});

describe('sweepExpiredPendingUploads', () => {
  it('deletes the bytes and reservation of expired, never-finalized uploads', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'gone', ownerId: 'o' },
    ]);

    const result = await sweepExpiredPendingUploads(24);

    expect(result).toEqual({ deletedIds: ['gone'], errorIds: [] });
    expect(h.storageDel).toHaveBeenCalledWith('gone');
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'o', id: { in: ['gone'] } },
    });
    const { where } = h.prisma.pendingUpload.findMany.mock.calls[0][0];
    expect(Date.now() - where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(
      24 * HOUR_MS
    );
  });

  it('keeps the bytes of a reservation whose upload was finalized', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'kept', ownerId: 'o' },
    ]);
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'kept' }]);

    const result = await sweepExpiredPendingUploads(24);

    expect(result.deletedIds).toEqual([]);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalled();
  });

  it('keeps the reservation for a retry when the delete fails', async () => {
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
    expect(h.prisma.upload.findMany).not.toHaveBeenCalled();
  });
});
