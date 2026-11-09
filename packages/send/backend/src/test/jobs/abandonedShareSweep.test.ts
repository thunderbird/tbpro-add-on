import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Abandoned share sweep (#1393): link classification, budget, deadline, paging
// and env parsing. Prisma is mocked; reap/sunset/dry-run against a real DB are
// in abandonedShareSweep.integration.ts.

const h = vi.hoisted(() => {
  const db = {
    container: { findMany: vi.fn() },
    accessLink: { updateMany: vi.fn() },
    group: { delete: vi.fn() },
  };
  const prisma = { ...db };
  return { db, prisma };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));

import type { Prisma } from '@prisma/client';
import {
  abandonedShareSweepOptionsFromEnv,
  sweepAbandonedShares,
} from '../../jobs/abandonedShareSweep';

// The mock only carries the delegates the sweep calls.
const db = h.db as unknown as Prisma.TransactionClient;

const NOW = new Date('2026-11-01T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const SOON = new Date('2026-12-01T00:00:00Z');
const FAR = new Date('2028-01-01T00:00:00Z');
const olderThan = new Date('2026-10-31T00:00:00Z');
const graceEnd = new Date('2027-04-30T00:00:00Z');
const options = {
  olderThan,
  graceEnd,
  dryRun: false,
  maxActions: 100,
  deadline: Infinity,
};

type Link = { id: string; expiryDate: Date | null };
function container(id: string, links: Link[], groupId = 1) {
  return {
    id,
    ownerId: 'owner-1',
    groupId,
    _count: { items: 1 },
    shares: [{ accessLinks: links }],
  };
}

function batches(...pages: ReturnType<typeof container>[][]) {
  pages.forEach((page) => h.db.container.findMany.mockResolvedValueOnce(page));
  h.db.container.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.db.container.findMany.mockResolvedValue([]);
  h.db.group.delete.mockResolvedValue({});
  h.db.accessLink.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sweepAbandonedShares', () => {
  it('sunsets only the links that would outlive the grace period', async () => {
    batches([
      container('c1', [
        { id: 'never-expires', expiryDate: null },
        { id: 'outlives-grace', expiryDate: FAR },
        { id: 'already-inside-grace', expiryDate: SOON },
        { id: 'already-expired', expiryDate: PAST },
      ]),
    ]);

    const result = await sweepAbandonedShares(options, db);

    expect(h.db.accessLink.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['never-expires', 'outlives-grace'] } },
      data: { expiryDate: graceEnd },
    });
    expect(h.db.group.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 1, graced: 1, reaped: 0 });
  });

  it('stops at the action budget and reports it', async () => {
    batches([
      container('c1', [], 1),
      container('c2', [], 2),
      container('c3', [], 3),
    ]);

    const result = await sweepAbandonedShares(
      { ...options, maxActions: 2 },
      db
    );

    expect(h.db.group.delete).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ reaped: 2, capped: true });
  });

  it('starts no work after the deadline', async () => {
    batches([container('c1', [], 1)]);

    const result = await sweepAbandonedShares({ ...options, deadline: 0 }, db);

    expect(h.db.group.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reaped: 0, capped: true });
  });

  it('pages with a keyset so reaped rows cannot break the cursor', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) =>
      container(`c${String(i).padStart(3, '0')}`, [], i)
    );
    batches(fullPage, [container('c999', [], 999)]);

    const result = await sweepAbandonedShares(
      { ...options, maxActions: 1000 },
      db
    );

    expect(h.db.container.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { gt: 'c199' } }),
      })
    );
    expect(result).toMatchObject({ scanned: 201, reaped: 201 });
  });

  it('counts a failed container and carries on', async () => {
    batches([container('c1', [], 1), container('c2', [], 2)]);
    h.db.group.delete.mockRejectedValueOnce(new Error('db down'));

    const result = await sweepAbandonedShares(options, db);

    expect(result).toMatchObject({ reaped: 1, errors: 1 });
  });
});

describe('abandonedShareSweepOptionsFromEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to a dry run when ABANDONED_SHARE_SWEEP_DRY_RUN is unset', () => {
    vi.stubEnv('ABANDONED_SHARE_SWEEP_DRY_RUN', '');
    expect(abandonedShareSweepOptionsFromEnv().dryRun).toBe(true);
  });

  it('stays a dry run for anything other than "false"', () => {
    vi.stubEnv('ABANDONED_SHARE_SWEEP_DRY_RUN', 'yes');
    expect(abandonedShareSweepOptionsFromEnv().dryRun).toBe(true);
  });

  it('acts only when ABANDONED_SHARE_SWEEP_DRY_RUN=false', () => {
    vi.stubEnv('ABANDONED_SHARE_SWEEP_DRY_RUN', ' FALSE ');
    expect(abandonedShareSweepOptionsFromEnv().dryRun).toBe(false);
  });

  it('defaults to a 180-day grace period', () => {
    const now = Date.UTC(2026, 10, 1);
    const { graceEnd } = abandonedShareSweepOptionsFromEnv(now);
    expect(graceEnd.getTime() - now).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it('reads the grace period from the environment', () => {
    vi.stubEnv('ABANDONED_SHARE_GRACE_DAYS', '365');
    const now = Date.UTC(2026, 10, 1);
    const { graceEnd } = abandonedShareSweepOptionsFromEnv(now);
    expect(graceEnd.getTime() - now).toBe(365 * 24 * 60 * 60 * 1000);
  });
});
