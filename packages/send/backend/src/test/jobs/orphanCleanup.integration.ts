import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Leader election of the orphan sweep (#117) against a real Postgres: two
// sweeps started together take the same advisory lock, so exactly one runs.
// Storage and the row pass are mocked; the listing blocks until released so
// both sweeps overlap.

const h = vi.hoisted(() => {
  let release = () => {};
  const gate = { opened: Promise.resolve() };
  return {
    gate,
    close() {
      gate.opened = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    open: () => release(),
    listObjects: vi.fn(),
  };
});

vi.mock('../../storage', () => ({
  default: { listObjects: h.listObjects, del: vi.fn() },
}));
// Only the lock is under test; the row pass would race other suites' rows.
vi.mock('../../models', () => ({
  deleteOrphans: async () => ({
    found: 0,
    deletedUploadIds: [],
    errorUploadIds: [],
  }),
}));
vi.mock('../../models/pendingUploads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sweepExpiredPendingUploads: async () => ({
    found: 0,
    deletedIds: [],
    errorIds: [],
  }),
}));

import { runStorageSweep } from '../../jobs/orphanCleanup';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.storageSweep.deleteMany({});
  h.listObjects.mockImplementation(async () => {
    await h.gate.opened;
    return { objects: [], truncated: false };
  });
});

afterAll(async () => {
  await prisma.storageSweep.deleteMany({});
  await prisma.$disconnect();
});

describe('runStorageSweep leader election', () => {
  it('runs exactly one of two concurrent sweeps', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    h.close();

    const first = runStorageSweep(true);
    await vi.waitFor(() => expect(h.listObjects).toHaveBeenCalled(), {
      timeout: 5000,
    });
    const second = await runStorageSweep(true);
    h.open();

    expect((await first).status).toBe('completed');
    expect(second).toEqual({
      status: 'skipped',
      reason: 'another instance holds the sweep lock',
    });
    expect(await prisma.storageSweep.count()).toBe(1);
    log.mockRestore();
  });

  it('releases the lock with the sweep, so a later one can run', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect((await runStorageSweep(true)).status).toBe('completed');
    expect((await runStorageSweep(true)).status).toBe('completed');
    expect(await prisma.storageSweep.count()).toBe(2);
    log.mockRestore();
  });

  it('skips a scheduled sweep after a recent one finished', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runStorageSweep(true);
    expect(await runStorageSweep()).toMatchObject({ status: 'skipped' });
    log.mockRestore();
  });
});
