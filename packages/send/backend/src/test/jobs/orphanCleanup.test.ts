import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Scheduling of the orphan cleanup (#117): opt-in via env, and concurrent
// triggers in one process share a single run.

const h = vi.hoisted(() => ({
  deleteOrphans: vi.fn(),
  sweep: vi.fn(),
}));

vi.mock('../../models', () => ({ deleteOrphans: h.deleteOrphans }));
vi.mock('../../models/pendingUploads', () => ({
  sweepExpiredPendingUploads: h.sweep,
}));

import {
  runOrphanCleanup,
  startOrphanCleanupSchedule,
} from '../../jobs/orphanCleanup';

const ORPHANS = { deletedUploadIds: ['a'], errorUploadIds: [] };
const PENDING = { deletedIds: ['b'], errorIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  h.deleteOrphans.mockResolvedValue(ORPHANS);
  h.sweep.mockResolvedValue(PENDING);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ORPHAN_CLEANUP_INTERVAL_HOURS;
});

describe('runOrphanCleanup', () => {
  it('deletes orphans, then sweeps expired reservations', async () => {
    expect(await runOrphanCleanup()).toEqual({
      orphans: ORPHANS,
      pending: PENDING,
    });
  });

  it('coalesces overlapping calls into one run', async () => {
    const [a, b] = await Promise.all([runOrphanCleanup(), runOrphanCleanup()]);

    expect(a).toBe(b);
    expect(h.deleteOrphans).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh run after a failed one', async () => {
    h.deleteOrphans.mockRejectedValueOnce(new Error('db down'));
    await expect(runOrphanCleanup()).rejects.toThrow('db down');

    await runOrphanCleanup();
    expect(h.deleteOrphans).toHaveBeenCalledTimes(2);
  });
});

describe('startOrphanCleanupSchedule', () => {
  it('does not schedule anything when the interval is unset', () => {
    expect(startOrphanCleanupSchedule()).toBeUndefined();
  });

  it('does not schedule anything for a non-positive interval', () => {
    process.env.ORPHAN_CLEANUP_INTERVAL_HOURS = '0';
    expect(startOrphanCleanupSchedule()).toBeUndefined();
  });

  it('runs the cleanup every interval', async () => {
    vi.useFakeTimers();
    process.env.ORPHAN_CLEANUP_INTERVAL_HOURS = '2';
    const timer = startOrphanCleanupSchedule();

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000 - 1);
    expect(h.deleteOrphans).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.deleteOrphans).toHaveBeenCalledTimes(1);

    clearInterval(timer);
  });
});
