import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Orphan sweep (#117): the bucket pass, leader election over the advisory
// lock, and the once-per-interval schedule. Storage, Prisma and the row pass
// are mocked; the JobRun table is one in-memory row.

const h = vi.hoisted(() => {
  const upload = { findMany: vi.fn() };
  const job: { lastRunAt: Date | null } = { lastRunAt: null };
  const jobRun = {
    findUnique: vi.fn(
      async () =>
        job.lastRunAt && { name: 'orphanSweep', lastRunAt: job.lastRunAt }
    ),
    upsert: vi.fn(async ({ update }: { update: { lastRunAt: Date } }) => {
      job.lastRunAt = update.lastRunAt;
    }),
  };
  const tx = { $queryRaw: vi.fn(), upload, jobRun };
  const prisma = {
    upload,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const storage = {
    listObjects: vi.fn(),
    del: vi.fn(async (_key: string) => true),
  };
  const deleteOrphans = vi.fn();
  return { job, tx, prisma, storage, deleteOrphans };
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
  runSweepIfDue,
  startOrphanSweepSchedule,
  sweepOptionsFromEnv,
} from '../../jobs/orphanSweep';

const OLD = new Date('2026-10-01T00:00:00Z');
const YOUNG = new Date('2026-10-23T00:00:00Z');
const olderThan = new Date('2026-10-22T00:00:00Z');
const options = {
  olderThan,
  dryRun: false,
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.clearAllMocks();
  h.job.lastRunAt = null;
  h.storage.listObjects.mockReset();
  h.prisma.upload.findMany.mockResolvedValue([]);
  h.deleteOrphans.mockResolvedValue({
    found: 0,
    deleted: 0,
    errors: 0,
    dryRun: false,
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

  it('deletes nothing in a dry run', async () => {
    bucket([obj(id(1))]);

    const result = await deleteBucketOrphans({ ...options, dryRun: true });

    expect(result).toMatchObject({ found: 1, deleted: 1 });
    expect(h.storage.del).not.toHaveBeenCalled();
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

describe('runSweepIfDue', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('skips when another instance holds the lock', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: false }]);

    expect(await runSweepIfDue(DAY)).toBe('skipped');
    expect(h.tx.jobRun.findUnique).not.toHaveBeenCalled();
    expect(h.deleteOrphans).not.toHaveBeenCalled();
    expect(h.storage.listObjects).not.toHaveBeenCalled();
  });

  it('does not sweep when the last sweep started less than an interval ago', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T12:00:00Z') });
    h.job.lastRunAt = new Date('2026-10-29T00:00:00Z');
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);

    expect(await runSweepIfDue(DAY)).toBe('not-due');
    expect(h.deleteOrphans).not.toHaveBeenCalled();
    expect(h.storage.listObjects).not.toHaveBeenCalled();
    expect(h.tx.jobRun.upsert).not.toHaveBeenCalled();
  });

  it('sweeps a few minutes early rather than waiting a whole check', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T23:57:00Z') });
    h.job.lastRunAt = new Date('2026-10-29T00:00:00Z');
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    bucket([]);

    expect(await runSweepIfDue(DAY)).toMatchObject({ deleted: 0 });
  });

  it('records the start time of a sweep', async () => {
    const now = new Date('2026-10-29T12:00:00Z');
    vi.useFakeTimers({ now });
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    bucket([]);

    await runSweepIfDue(DAY);

    expect(h.job.lastRunAt).toEqual(now);
  });

  it('does not record a sweep that fails, so the next check retries it', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    h.deleteOrphans.mockRejectedValue(new Error('db down'));

    await expect(runSweepIfDue(DAY)).rejects.toThrow('db down');
    expect(h.tx.jobRun.upsert).not.toHaveBeenCalled();
  });

  it('runs both passes under the lock and sums them', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    h.deleteOrphans.mockResolvedValue({
      found: 2,
      deleted: 2,
      errors: 0,
      dryRun: false,
      capped: false,
    });
    bucket([obj(id(1))]);

    expect(await runSweepIfDue(DAY)).toMatchObject({
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

    await runSweepIfDue(DAY);

    expect(h.deleteOrphans).toHaveBeenCalledWith(
      expect.objectContaining({ maxDeletes: 10000 }),
      h.tx
    );
    vi.unstubAllEnvs();
  });
});

describe('sweepOptionsFromEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to a dry run when ORPHAN_SWEEP_DRY_RUN is unset', () => {
    vi.stubEnv('ORPHAN_SWEEP_DRY_RUN', '');
    expect(sweepOptionsFromEnv().dryRun).toBe(true);
  });

  it('stays a dry run for anything other than "false"', () => {
    vi.stubEnv('ORPHAN_SWEEP_DRY_RUN', 'yes');
    expect(sweepOptionsFromEnv().dryRun).toBe(true);
  });

  it('deletes only when ORPHAN_SWEEP_DRY_RUN=false', () => {
    vi.stubEnv('ORPHAN_SWEEP_DRY_RUN', 'false');
    expect(sweepOptionsFromEnv().dryRun).toBe(false);
    vi.stubEnv('ORPHAN_SWEEP_DRY_RUN', ' FALSE ');
    expect(sweepOptionsFromEnv().dryRun).toBe(false);
  });
});

describe('startOrphanSweepSchedule', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not start when the interval is 0', () => {
    vi.stubEnv('ORPHAN_SWEEP_INTERVAL_HOURS', '0');
    vi.useFakeTimers();

    expect(startOrphanSweepSchedule()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('first checks within 10 minutes, then hourly', async () => {
    vi.stubEnv('ORPHAN_SWEEP_INTERVAL_HOURS', '24');
    vi.useFakeTimers();
    h.tx.$queryRaw.mockResolvedValue([{ locked: false }]);

    expect(startOrphanSweepSchedule()).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('sweeps once per interval however many instances boot', async () => {
    vi.stubEnv('ORPHAN_SWEEP_INTERVAL_HOURS', '24');
    vi.useFakeTimers({ now: new Date('2026-10-29T00:00:00Z') });
    h.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    h.storage.listObjects.mockResolvedValue({ objects: [], next: undefined });
    const random = vi.spyOn(Math, 'random');

    // A rollout: four instances boot over an hour, each checking 0-10 min in.
    for (const jitter of [0, 0.3, 0.6, 0.9]) {
      random.mockReturnValueOnce(jitter);
      startOrphanSweepSchedule();
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    }
    expect(h.deleteOrphans).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(22 * HOUR);
    expect(h.deleteOrphans).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(h.deleteOrphans).toHaveBeenCalledTimes(2);
  });
});
