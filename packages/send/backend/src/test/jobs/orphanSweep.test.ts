import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Orphan sweep (#117): the bucket pass, leader election over the advisory
// lock, and the schedule switch. Storage, Prisma and the row pass are mocked.

const h = vi.hoisted(() => {
  const upload = { findMany: vi.fn() };
  const tx = { $queryRaw: vi.fn(), upload };
  const prisma = {
    upload,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const storage = {
    listObjects: vi.fn(),
    del: vi.fn(async (_key: string) => true),
  };
  const deleteOrphans = vi.fn();
  return { tx, prisma, storage, deleteOrphans };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));
vi.mock('../../storage', () => ({ default: h.storage }));
vi.mock('../../models', () => ({ deleteOrphans: h.deleteOrphans }));

import {
  deleteBucketOrphans,
  runSweepIfLeader,
  startOrphanSweepSchedule,
  sweepOptionsFromEnv,
} from '../../jobs/orphanSweep';

const OLD = new Date('2026-10-01T00:00:00Z');
const YOUNG = new Date('2026-10-23T00:00:00Z');
const olderThan = new Date('2026-10-22T00:00:00Z');
const options = {
  olderThan,
  maxDeletes: 100,
  deadline: Infinity,
};

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const obj = (key: string, lastModified = OLD) => ({ key, lastModified });

function bucket(...pages: { key: string; lastModified: Date }[][]) {
  pages.forEach((objects, i) =>
    h.storage.listObjects.mockResolvedValueOnce({
      objects,
      next: i < pages.length - 1 ? objects.slice(-1)[0]?.key : undefined,
    })
  );
}

const deletedKeys = () => h.storage.del.mock.calls.map(([key]) => key);

beforeEach(() => {
  vi.clearAllMocks();
  h.storage.listObjects.mockReset();
  h.prisma.upload.findMany.mockResolvedValue([]);
  h.deleteOrphans.mockResolvedValue({
    found: 0,
    deleted: 0,
    errors: 0,
    capped: false,
  });
});

describe('deleteBucketOrphans', () => {
  it('deletes only old upload-id keys that have no row', async () => {
    bucket([obj(id(1)), obj(id(2), YOUNG), obj(id(3)), obj('not-an-upload')]);
    h.prisma.upload.findMany.mockResolvedValue([{ id: id(3) }]);

    const result = await deleteBucketOrphans(options);

    expect(h.prisma.upload.findMany).toHaveBeenCalledWith({
      where: { id: { in: [id(1), id(3)] } },
      select: { id: true },
    });
    expect(deletedKeys()).toEqual([id(1)]);
    expect(result).toEqual({ found: 1, deleted: 1, errors: 0, capped: false });
  });

  it('pages through the whole bucket', async () => {
    bucket([obj(id(1))], [obj(id(2))]);

    await deleteBucketOrphans(options);

    expect(h.storage.listObjects.mock.calls).toEqual([[undefined], [id(1)]]);
    expect(deletedKeys()).toEqual([id(1), id(2)]);
  });

  it('starts no work after the deadline', async () => {
    const result = await deleteBucketOrphans({ ...options, deadline: 0 });

    expect(result.capped).toBe(true);
    expect(h.storage.listObjects).not.toHaveBeenCalled();
  });

  it('stops at the delete budget and reports it', async () => {
    bucket([obj(id(1)), obj(id(2)), obj(id(3))], [obj(id(4))]);

    const result = await deleteBucketOrphans({ ...options, maxDeletes: 2 });

    expect(deletedKeys()).toEqual([id(1), id(2)]);
    expect(result).toMatchObject({ found: 3, deleted: 2, capped: true });
    expect(h.storage.listObjects).toHaveBeenCalledTimes(1);
  });

  it('counts a failed delete and carries on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bucket([obj(id(1)), obj(id(2))]);
    h.storage.del.mockRejectedValueOnce(new Error('bucket down'));

    const result = await deleteBucketOrphans(options);

    expect(result).toMatchObject({ deleted: 1, errors: 1 });
    warn.mockRestore();
  });
});

describe('runSweepIfLeader', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('skips when another instance holds the lock', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: false }]);

    expect(await runSweepIfLeader()).toBe('skipped');
    expect(h.deleteOrphans).not.toHaveBeenCalled();
    expect(h.storage.listObjects).not.toHaveBeenCalled();
  });

  it('runs both passes under the lock and sums them', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    h.deleteOrphans.mockResolvedValue({
      found: 2,
      deleted: 2,
      errors: 0,
      capped: false,
    });
    bucket([obj(id(1))]);

    expect(await runSweepIfLeader()).toMatchObject({
      rowOrphans: 2,
      bucketOrphans: 1,
      deleted: 3,
      errors: 0,
      capped: false,
    });
    const [sql] = h.tx.$queryRaw.mock.calls[0];
    expect(sql.join('')).toContain('pg_try_advisory_xact_lock(');
    expect(h.deleteOrphans).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: expect.any(Number) }),
      h.tx
    );
  });

  it('ignores a negative delete budget from the environment', async () => {
    vi.stubEnv('ORPHAN_SWEEP_MAX_DELETES', '-1');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    bucket([]);

    await runSweepIfLeader();

    expect(h.deleteOrphans).toHaveBeenCalledWith(
      expect.objectContaining({ maxDeletes: 10000 }),
      h.tx
    );
    vi.unstubAllEnvs();
  });
});

describe('sweepOptionsFromEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the delete budget and minimum age from the environment', () => {
    vi.stubEnv('ORPHAN_SWEEP_MAX_DELETES', '250');
    vi.stubEnv('ORPHAN_MIN_AGE_HOURS', '48');
    const now = Date.parse('2026-10-29T12:00:00Z');
    const opts = sweepOptionsFromEnv(now);
    expect(opts.maxDeletes).toBe(250);
    expect(opts.olderThan.toISOString()).toBe('2026-10-27T12:00:00.000Z');
  });
});

describe('startOrphanSweepSchedule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('does not start when the interval is 0', () => {
    vi.stubEnv('ORPHAN_SWEEP_INTERVAL_HOURS', '0');
    vi.useFakeTimers();

    expect(startOrphanSweepSchedule()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('first sweeps within 10 minutes, then every interval', async () => {
    vi.stubEnv('ORPHAN_SWEEP_INTERVAL_HOURS', '24');
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    h.tx.$queryRaw.mockResolvedValue([{ locked: false }]);

    expect(startOrphanSweepSchedule()).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
