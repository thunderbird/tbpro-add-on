import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The orphaned-storage sweep (#117): one leader per sweep via an advisory
// lock, StorageSweep rows decide whether one is due, and the built-in
// schedule runs it every 24 h by default. Prisma and both passes are mocked.

const h = vi.hoisted(() => {
  const state = { lockHeld: false };
  const sweeps: Record<string, unknown>[] = [];
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    storageSweep: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    state,
    sweeps,
    prisma,
    deleteOrphans: vi.fn(),
    sweepPending: vi.fn(),
    sweepBucket: vi.fn(),
  };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));
vi.mock('../../models', () => ({ deleteOrphans: h.deleteOrphans }));
vi.mock('../../models/pendingUploads', () => ({
  CLEANUP_BATCH_SIZE: 1000,
  getOrphanMinAgeHours: () => Number(process.env.ORPHAN_MIN_AGE_HOURS) || 24,
  sweepExpiredPendingUploads: h.sweepPending,
}));
vi.mock('../../jobs/bucketOrphans', () => ({
  emptyTotals: () => ({ orphans: 0, deleted: 0, kept: 0, errors: 0 }),
  sweepBucket: h.sweepBucket,
}));

import {
  INSTANCE_ID,
  runOrphanCleanup,
  runStorageSweep,
  startOrphanCleanupSchedule,
} from '../../jobs/orphanCleanup';

const HOUR_MS = 60 * 60 * 1000;
const BUCKET = {
  orphans: 2,
  deleted: 2,
  kept: 5,
  errors: 0,
  cursor: null,
  capped: false,
};

function sql(call: unknown[]) {
  return (call[0] as string[]).join('?');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.lockHeld = false;
  h.sweeps.length = 0;
  // pg_try_advisory_xact_lock: granted unless another transaction holds it,
  // released when the transaction callback settles.
  h.prisma.$transaction.mockImplementation(async (fn) => {
    let mine = false;
    const tx = {
      $queryRaw: vi.fn(async (...call: unknown[]) => {
        if (!sql(call).includes('pg_try_advisory_xact_lock')) return [];
        mine = !h.state.lockHeld;
        h.state.lockHeld = true;
        return [{ locked: mine }];
      }),
    };
    try {
      return await fn(tx);
    } finally {
      if (mine) h.state.lockHeld = false;
    }
  });
  h.prisma.storageSweep.findFirst.mockImplementation(async ({ where } = {}) => {
    const rows = h.sweeps.filter(
      (r) => where?.dryRun === undefined || Boolean(r.dryRun) === where.dryRun
    );
    return rows[rows.length - 1] ?? null;
  });
  h.prisma.storageSweep.create.mockImplementation(async ({ data }) => {
    const row = { id: h.sweeps.length + 1, startedAt: new Date(), ...data };
    h.sweeps.push(row);
    return row;
  });
  h.prisma.storageSweep.update.mockImplementation(async ({ where, data }) => {
    const row = h.sweeps.find((r) => r.id === where.id);
    Object.assign(row, data);
    return row;
  });
  h.deleteOrphans.mockResolvedValue({
    found: 1,
    deletedUploadIds: ['a'],
    errorUploadIds: [],
  });
  h.sweepPending.mockResolvedValue({ found: 0, deletedIds: [], errorIds: [] });
  h.sweepBucket.mockResolvedValue(BUCKET);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const name of [
    'ORPHAN_CLEANUP_INTERVAL_HOURS',
    'ORPHAN_CLEANUP_DRY_RUN',
    'ORPHAN_CLEANUP_MAX_DELETES',
  ]) {
    delete process.env[name];
  }
});

describe('runStorageSweep: leader election', () => {
  it('takes the advisory lock on a fixed key inside the sweep transaction', async () => {
    await runStorageSweep();

    const tx = await h.prisma.$transaction.mock.results[0].value;
    expect(tx.status).toBe('completed');
    expect(h.prisma.$transaction.mock.calls[0][1]).toMatchObject({
      timeout: 6 * HOUR_MS,
    });
  });

  it('runs exactly one of two concurrent sweeps; the other logs a skip', async () => {
    let finishBucket = (_: unknown) => {};
    h.sweepBucket.mockReturnValueOnce(
      new Promise((resolve) => {
        finishBucket = resolve;
      })
    );

    const first = runStorageSweep();
    await vi.waitFor(() => expect(h.sweepBucket).toHaveBeenCalled());
    const second = await runStorageSweep();
    finishBucket(BUCKET);

    expect((await first).status).toBe('completed');
    expect(second).toEqual({
      status: 'skipped',
      reason: 'another instance holds the sweep lock',
    });
    expect(h.prisma.storageSweep.create).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('sweep skipped')
    );
  });

  it('releases the lock when a sweep throws', async () => {
    h.sweepBucket.mockRejectedValueOnce(new Error('bucket down'));

    await expect(runStorageSweep()).rejects.toThrow('bucket down');
    expect(h.state.lockHeld).toBe(false);
    expect(h.sweeps[0]).toMatchObject({ error: 'bucket down' });
    expect(h.sweeps[0].finishedAt).toBeInstanceOf(Date);
  });
});

describe('runStorageSweep: schedule state', () => {
  it('is suppressed by a sweep that finished within interval - 1 h', async () => {
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - 23 * HOUR_MS),
      finishedAt: new Date(Date.now() - 22 * HOUR_MS),
    });

    expect(await runStorageSweep()).toEqual({
      status: 'skipped',
      reason: 'sweep 1 finished recently',
    });
    expect(h.deleteOrphans).not.toHaveBeenCalled();
  });

  it('runs once the last sweep finished more than interval - 1 h ago', async () => {
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - 24 * HOUR_MS),
      finishedAt: new Date(Date.now() - 23.5 * HOUR_MS),
      cursor: 'resume-here',
    });

    expect((await runStorageSweep()).status).toBe('completed');
    expect(h.sweepBucket.mock.calls[0][0].cursor).toBe('resume-here');
  });

  it('runs a forced (manual) sweep regardless of the last one', async () => {
    h.sweeps.push({
      id: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    expect((await runStorageSweep(true)).status).toBe('completed');
  });

  it('skips while another sweep is running and not yet stale', async () => {
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - HOUR_MS),
      finishedAt: null,
    });

    expect(await runStorageSweep(true)).toEqual({
      status: 'skipped',
      reason: 'sweep 1 is still running',
    });
  });

  it('takes over a crashed sweep and resumes from its cursor', async () => {
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - 7 * HOUR_MS),
      finishedAt: null,
      cursor: 'crashed-at',
    });

    expect((await runStorageSweep()).status).toBe('completed');
    expect(h.sweeps[0]).toMatchObject({ error: 'abandoned; taken over' });
    expect(h.sweeps[0].finishedAt).toBeInstanceOf(Date);
    expect(h.sweepBucket.mock.calls[0][0].cursor).toBe('crashed-at');
    expect(h.prisma.storageSweep.create.mock.calls[0][0].data).toMatchObject({
      cursor: 'crashed-at',
    });
  });
});

describe('runStorageSweep: the sweep', () => {
  it('runs the row pass, then the bucket pass, and records the totals', async () => {
    const result = await runStorageSweep();

    expect(h.deleteOrphans.mock.invocationCallOrder[0]).toBeLessThan(
      h.sweepBucket.mock.invocationCallOrder[0]
    );
    expect(result).toMatchObject({
      status: 'completed',
      sweepId: 1,
      instanceId: INSTANCE_ID,
      rowOrphans: 1,
      bucketOrphans: 2,
      deleted: 3,
      kept: 5,
      errors: 0,
      dryRun: false,
      capped: false,
    });
    expect(h.sweeps[0]).toMatchObject({
      rowOrphans: 1,
      bucketOrphans: 2,
      deleted: 3,
      cursor: null,
    });
    expect(h.sweeps[0].finishedAt).toBeInstanceOf(Date);
  });

  it('logs one summary line per sweep', async () => {
    await runStorageSweep();

    const lines = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => String(line))
      .filter((line) => line.startsWith('[orphanCleanup] sweep {'));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice('[orphanCleanup] sweep '.length))).toEqual(
      {
        sweepId: 1,
        instanceId: INSTANCE_ID,
        rowOrphans: 1,
        bucketOrphans: 2,
        deleted: 3,
        kept: 5,
        errors: 0,
        durationMs: expect.any(Number),
        dryRun: false,
        capped: false,
      }
    );
  });

  it('passes dry-run mode to both passes', async () => {
    process.env.ORPHAN_CLEANUP_DRY_RUN = 'true';

    const result = await runStorageSweep();

    expect(h.deleteOrphans.mock.calls[0][1]).toMatchObject({ dryRun: true });
    expect(h.sweepPending.mock.calls[0][1]).toMatchObject({ dryRun: true });
    expect(h.sweepBucket.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(result).toMatchObject({ dryRun: true });
    expect(h.sweeps[0]).toMatchObject({ dryRun: true });
  });

  it('gives the bucket pass what the row pass left of the delete cap', async () => {
    process.env.ORPHAN_CLEANUP_MAX_DELETES = '10';

    await runStorageSweep();

    expect(h.deleteOrphans.mock.calls[0][1]).toMatchObject({ limit: 10 });
    expect(h.sweepBucket.mock.calls[0][0].budget).toBe(9);
  });

  it('records a capped sweep and where to resume', async () => {
    h.sweepBucket.mockResolvedValue({ ...BUCKET, capped: true, cursor: 'k' });

    const result = await runStorageSweep();

    expect(result).toMatchObject({ capped: true });
    expect(h.sweeps[0]).toMatchObject({ capped: true, cursor: 'k' });
  });

  it('stops the row pass at the cap without starting the bucket listing', async () => {
    process.env.ORPHAN_CLEANUP_MAX_DELETES = '1';

    await runStorageSweep();

    expect(h.sweepPending).not.toHaveBeenCalled();
    expect(h.sweepBucket.mock.calls[0][0].budget).toBe(0);
  });

  it('repeats a row-pass step while it fills its batch', async () => {
    h.deleteOrphans
      .mockResolvedValueOnce({
        found: 1000,
        deletedUploadIds: Array(1000).fill('x'),
        errorUploadIds: [],
      })
      .mockResolvedValueOnce({
        found: 3,
        deletedUploadIds: ['a', 'b', 'c'],
        errorUploadIds: [],
      });

    const result = await runStorageSweep();

    expect(h.deleteOrphans).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ rowOrphans: 1003 });
  });

  it('saves the bucket cursor after every page', async () => {
    h.sweepBucket.mockImplementation(async ({ onPage }) => {
      await onPage('page-1-end', { orphans: 1 });
      return BUCKET;
    });

    await runStorageSweep();

    expect(h.prisma.storageSweep.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { cursor: 'page-1-end', bucketOrphans: 1 },
    });
  });
});

describe('runStorageSweep: dry runs', () => {
  it('never resumes a real sweep from a dry run cursor', async () => {
    h.sweeps.push(
      {
        id: 1,
        startedAt: new Date(Date.now() - 50 * HOUR_MS),
        finishedAt: new Date(Date.now() - 50 * HOUR_MS),
        dryRun: false,
        cursor: 'real-cursor',
      },
      {
        id: 2,
        startedAt: new Date(Date.now() - 25 * HOUR_MS),
        finishedAt: new Date(Date.now() - 25 * HOUR_MS),
        dryRun: true,
        cursor: 'dry-cursor',
      }
    );

    await runStorageSweep();

    expect(h.sweepBucket.mock.calls[0][0].cursor).toBe('real-cursor');
  });

  it('resumes a dry run from the last dry run cursor', async () => {
    process.env.ORPHAN_CLEANUP_DRY_RUN = 'true';
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - 25 * HOUR_MS),
      finishedAt: new Date(Date.now() - 25 * HOUR_MS),
      dryRun: true,
      cursor: 'dry-cursor',
    });

    await runStorageSweep();

    expect(h.sweepBucket.mock.calls[0][0].cursor).toBe('dry-cursor');
  });

  it('pages the row pass by id in a dry run, like a real run would delete', async () => {
    process.env.ORPHAN_CLEANUP_DRY_RUN = 'true';
    h.deleteOrphans
      .mockResolvedValueOnce({
        found: 1000,
        lastId: 'id-1000',
        deletedUploadIds: [],
        errorUploadIds: [],
      })
      .mockResolvedValueOnce({
        found: 5,
        lastId: 'id-1005',
        deletedUploadIds: [],
        errorUploadIds: [],
      });

    const result = await runStorageSweep();

    expect(h.deleteOrphans).toHaveBeenCalledTimes(2);
    expect(h.deleteOrphans.mock.calls[0][1].after).toBeUndefined();
    expect(h.deleteOrphans.mock.calls[1][1]).toMatchObject({
      dryRun: true,
      after: 'id-1000',
    });
    expect(result).toMatchObject({ rowOrphans: 1005 });
    expect(h.sweepBucket.mock.calls[0][0].budget).toBe(10_000 - 1005);
  });
});

describe('runOrphanCleanup', () => {
  it('coalesces overlapping calls in one process into one sweep', async () => {
    const [a, b] = await Promise.all([runOrphanCleanup(), runOrphanCleanup()]);

    expect(a).toBe(b);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('startOrphanCleanupSchedule', () => {
  it('is on by default, first checking within 10 minutes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const timer = startOrphanCleanupSchedule();

    expect(timer).toBeDefined();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    clearTimeout(timer);
  });

  it('jitters the first check per instance', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const timer = startOrphanCleanupSchedule();

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    clearTimeout(timer);
  });

  it('checks hourly after the first tick; the database decides if a sweep runs', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    startOrphanCleanupSchedule();

    await vi.advanceTimersByTimeAsync(3 * HOUR_MS);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(4);
    expect(h.prisma.storageSweep.create).toHaveBeenCalledTimes(1);
  });

  it('is off for an interval of 0', () => {
    process.env.ORPHAN_CLEANUP_INTERVAL_HOURS = '0';

    expect(startOrphanCleanupSchedule()).toBeUndefined();
  });

  it('refuses an invalid interval at startup', () => {
    process.env.ORPHAN_CLEANUP_INTERVAL_HOURS = 'daily';

    expect(() => startOrphanCleanupSchedule()).toThrow(
      "ORPHAN_CLEANUP_INTERVAL_HOURS must be a number of hours >= 0, got 'daily'"
    );
  });

  it('honours a custom interval when deciding a sweep is due', async () => {
    process.env.ORPHAN_CLEANUP_INTERVAL_HOURS = '48';
    h.sweeps.push({
      id: 1,
      startedAt: new Date(Date.now() - 30 * HOUR_MS),
      finishedAt: new Date(Date.now() - 30 * HOUR_MS),
    });

    expect(await runStorageSweep()).toMatchObject({ status: 'skipped' });
  });
});
