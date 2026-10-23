import { beforeEach, describe, expect, it, vi } from 'vitest';

// Orphan reconciliation (#117): reservations count toward quota and are taken
// under a per-owner lock, item-less uploads older than the age guard lose
// their row and bytes, and expired never-finalized reservations lose their
// bytes unless a finalize holds them. Prisma and storage are mocked.

const h = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
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
  h.prisma.$queryRaw.mockResolvedValue([{ used: 0n }]);
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
      h.prisma.$queryRaw.mock.invocationCallOrder[0]
    );
  });

  it('reads stored and reserved bytes in one statement', async () => {
    await reservePendingUpload('id-1', 'owner-1', 2048, LIMIT);

    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = h.prisma.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('FROM "Upload"');
    expect(sql).toContain('FROM "PendingUpload"');
    expect(h.prisma.upload.aggregate).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.aggregate).not.toHaveBeenCalled();
  });

  it('refuses, reserving nothing, when stored plus reserved bytes would reach the limit', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ used: 9000n }]);

    expect(await reservePendingUpload('id-1', 'owner-1', 1000, LIMIT)).toBe(
      false
    );
    expect(h.prisma.pendingUpload.create).not.toHaveBeenCalled();
  });

  it('records a size-less reservation for a request that sent none', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ used: 99999n }]);

    expect(
      await reservePendingUpload('id-1', 'owner-1', undefined, LIMIT)
    ).toBe(true);
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
    const { data } = h.prisma.pendingUpload.create.mock.calls[0][0];
    expect(data.size).toBeNull();
  });
});

describe('holdPendingUpload', () => {
  it('pushes the expiry of an unclaimed reservation out', async () => {
    expect(await holdPendingUpload('id-1', 'o')).toBe(true);
    const { where, data } = h.prisma.pendingUpload.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'id-1', sweptAt: null });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses when cleanup already claimed the reservation', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.count.mockResolvedValue(1);

    expect(await holdPendingUpload('id-1', 'o')).toBe(false);
  });

  it('creates a hold record for an id with no reservation', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    const id = '11111111-2222-4333-8444-555555555555';

    expect(await holdPendingUpload(id, 'o')).toBe(true);
    const { data, skipDuplicates } =
      h.prisma.pendingUpload.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data[0]).toMatchObject({ id, ownerId: 'o' });
    expect(data[0].size).toBeUndefined();
    expect(data[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses an id with no reservation that cleanup claimed meanwhile', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.count.mockResolvedValue(1);

    expect(
      await holdPendingUpload('11111111-2222-4333-8444-555555555555', 'o')
    ).toBe(false);
  });

  it('does not record a hold for a non-uuid id', async () => {
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });

    expect(await holdPendingUpload('not-a-uuid', 'o')).toBe(true);
    expect(h.prisma.pendingUpload.createMany).not.toHaveBeenCalled();
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
  it('counts unexpired reservations of the owner not yet finalized', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'p-1', size: 300n },
      { id: 'p-2', size: 200n },
    ]);
    // p-2 already has its Upload row, so it is counted as that row only.
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'p-2' }]);

    expect(await getReservedBytes('owner-1')).toBe(300);
    const { where } = h.prisma.pendingUpload.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      ownerId: 'owner-1',
      expiresAt: { gt: expect.any(Date) },
      size: { not: null },
    });
    expect(where.id).toBeUndefined();
    expect(h.prisma.upload.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['p-1', 'p-2'] },
    });
  });

  it('skips the Upload lookup when nothing is reserved', async () => {
    expect(await getReservedBytes('owner-1')).toBe(0);
    expect(h.prisma.upload.findMany).not.toHaveBeenCalled();
  });

  it('adds reserved bytes to active storage', async () => {
    h.prisma.upload.aggregate.mockResolvedValue({ _sum: { size: 1000n } });
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'p-1', size: 500n },
    ]);

    expect(await getUsedStorage('owner-1')).toEqual({
      active: 1500,
      expired: 0,
    });
  });

  it('leaves out the reservation being finalized', async () => {
    await getUsedStorage('owner-1', false, 'id-final');

    const { where } = h.prisma.pendingUpload.findMany.mock.calls[0][0];
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

    expect(result).toMatchObject({
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
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });

    await deleteOrphans();

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    // Claimed (sweptAt set), so a replayed finalize for the id is refused.
    const { data } = h.prisma.pendingUpload.createMany.mock.calls[0][0];
    expect(data).toEqual([
      {
        id: 'a',
        ownerId: 'o',
        expiresAt: new Date(0),
        sweptAt: expect.any(Date),
      },
    ]);
    expect(
      h.prisma.pendingUpload.createMany.mock.invocationCallOrder[0]
    ).toBeLessThan(h.storageDel.mock.invocationCallOrder[0]);
    // Bytes gone: the sweep record is dropped again.
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'o', id: { in: ['a'] } },
    });
  });

  it('claims a leftover expired reservation instead of adding a record', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual(['a']);
    const { where, data } = h.prisma.pendingUpload.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      id: 'a',
      sweptAt: null,
      expiresAt: { lt: data.sweptAt },
    });
    expect(h.prisma.pendingUpload.createMany).not.toHaveBeenCalled();
    expect(h.storageDel).toHaveBeenCalledWith('a');
  });

  it('rolls back and keeps the bytes when a finalize holds the reservation', async () => {
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.count.mockResolvedValue(1);

    const result = await deleteOrphans();

    expect(result).toMatchObject({ deletedUploadIds: [], errorUploadIds: [] });
    expect(h.storageDel).not.toHaveBeenCalled();
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
    expect(h.prisma.pendingUpload.updateMany).toHaveBeenCalled();
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

describe('row pass options', () => {
  it('takes at most `limit` orphan rows', async () => {
    await deleteOrphans(24, { limit: 7 });

    expect(h.prisma.upload.findMany.mock.calls[0][0].take).toBe(7);
  });

  it('deletes nothing in a dry run, but reports what it found', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'p', ownerId: 'o' },
    ]);

    const orphans = await deleteOrphans(24, { dryRun: true });
    const pending = await sweepExpiredPendingUploads(24, { dryRun: true });

    expect(orphans).toEqual({
      found: 1,
      lastId: 'a',
      deletedUploadIds: [],
      errorUploadIds: [],
    });
    expect(pending).toEqual({
      found: 1,
      lastId: 'p',
      deletedIds: [],
      errorIds: [],
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.updateMany).not.toHaveBeenCalled();
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('would delete 1'));
    log.mockRestore();
  });

  it('pages dry runs by id after the given one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteOrphans(24, { dryRun: true, after: 'x' });
    await sweepExpiredPendingUploads(24, { dryRun: true, after: 'y' });

    const rows = h.prisma.upload.findMany.mock.calls[0][0];
    expect(rows.where.id).toEqual({ gt: 'x' });
    expect(rows.orderBy).toEqual({ id: 'asc' });
    const pending = h.prisma.pendingUpload.findMany.mock.calls[0][0];
    expect(pending.where.id).toEqual({ gt: 'y' });
    expect(pending.orderBy).toEqual({ id: 'asc' });
    vi.mocked(console.log).mockRestore();
  });

  it('logs a failed delete as a warning, not an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.prisma.upload.findMany.mockResolvedValue([{ id: 'a', ownerId: 'o' }]);
    h.storageDel.mockRejectedValue(new Error('bucket down'));

    await deleteOrphans();

    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('sweepExpiredPendingUploads', () => {
  it('claims, then deletes the bytes and record of a never-finalized upload', async () => {
    h.prisma.pendingUpload.findMany.mockResolvedValue([
      { id: 'gone', ownerId: 'o' },
    ]);

    const result = await sweepExpiredPendingUploads(24);

    expect(result).toMatchObject({ deletedIds: ['gone'], errorIds: [] });
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

    expect(result).toMatchObject({ deletedIds: [], errorIds: [] });
    expect(h.prisma.pendingUpload.updateMany).not.toHaveBeenCalled();
  });
});

// In-memory PendingUpload row with Postgres conditional-update semantics: each
// updateMany re-checks its WHERE against the current row, as a row lock would.
describe('finalize vs sweep race', () => {
  type Row = {
    id: string;
    ownerId: string;
    expiresAt: Date;
    sweptAt: Date | null;
  };
  let row: Row | null;
  const matches = (r: Row, where: Record<string, unknown>) =>
    (!('sweptAt' in where) ||
      (where.sweptAt === null) === (r.sweptAt === null)) &&
    (!where.expiresAt || r.expiresAt < (where.expiresAt as { lt: Date }).lt);

  beforeEach(() => {
    row = { id: 'r', ownerId: 'o', expiresAt: hoursAgoDate(48), sweptAt: null };
    h.prisma.pendingUpload.findMany.mockImplementation(async () =>
      row ? [{ id: row.id, ownerId: row.ownerId }] : []
    );
    h.prisma.pendingUpload.updateMany.mockImplementation(
      async ({ where, data }) => {
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }
    );
    h.prisma.pendingUpload.count.mockImplementation(async () =>
      row?.sweptAt ? 1 : 0
    );
    h.prisma.pendingUpload.deleteMany.mockImplementation(async () => {
      row = null;
      return { count: 1 };
    });
  });

  function hoursAgoDate(hours: number) {
    return new Date(Date.now() - hours * HOUR_MS);
  }

  it('finalize holds first: the sweep claim loses and the bytes stay', async () => {
    expect(await holdPendingUpload('r', 'o')).toBe(true);
    // The finalize's Upload row exists by the time the sweep runs.
    h.prisma.upload.count.mockResolvedValue(1);

    const result = await sweepExpiredPendingUploads(24);

    expect(result).toMatchObject({ deletedIds: [], errorIds: [] });
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(row?.sweptAt).toBeNull();
  });

  it('sweep claims first: the bytes go and finalize is refused', async () => {
    const sweep = sweepExpiredPendingUploads(24);
    // Finalize arrives while the sweep is still deleting the bytes.
    h.storageDel.mockImplementation(async () => {
      expect(await holdPendingUpload('r', 'o')).toBe(false);
      return true;
    });

    expect(await sweep).toMatchObject({ deletedIds: ['r'], errorIds: [] });
    expect(h.storageDel).toHaveBeenCalledWith('r');
  });

  it('a claim whose delete failed keeps refusing finalize until retried', async () => {
    h.storageDel.mockRejectedValue(new Error('bucket down'));

    expect((await sweepExpiredPendingUploads(24)).errorIds).toEqual(['r']);
    expect(await holdPendingUpload('r', 'o')).toBe(false);
  });
});
