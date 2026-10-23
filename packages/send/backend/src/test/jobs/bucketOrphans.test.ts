import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bucket pass of the orphan sweep (#117): objects with no Upload row and no
// live reservation, older than the age guard, are deleted page by page from a
// resumable cursor. Prisma and the bucket listing are mocked.

const h = vi.hoisted(() => {
  const prisma = {
    upload: { findMany: vi.fn(), count: vi.fn() },
    pendingUpload: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { prisma, listObjects: vi.fn(), del: vi.fn() };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));
vi.mock('../../storage', () => ({
  default: { listObjects: h.listObjects, del: h.del },
}));

import { sweepBucket, uploadIdForKey } from '../../jobs/bucketOrphans';

const HOUR_MS = 60 * 60 * 1000;
const OLD = new Date(Date.now() - 48 * HOUR_MS);
const YOUNG = new Date(Date.now() - HOUR_MS);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const obj = (key: string, lastModified = OLD) => ({ key, lastModified });

function pages(...list: { key: string; lastModified: Date }[][]) {
  h.listObjects.mockReset();
  list.forEach((objects, i) =>
    h.listObjects.mockResolvedValueOnce({
      objects,
      truncated: i < list.length - 1,
    })
  );
}

const run = (overrides = {}) =>
  sweepBucket({
    cursor: null,
    minAgeHours: 24,
    dryRun: false,
    budget: 10_000,
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.upload.findMany.mockResolvedValue([]);
  h.prisma.upload.count.mockResolvedValue(0);
  h.prisma.pendingUpload.findMany.mockResolvedValue([]);
  h.prisma.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
  h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 1 });
  h.prisma.pendingUpload.count.mockResolvedValue(0);
  h.prisma.pendingUpload.deleteMany.mockResolvedValue({ count: 1 });
  h.del.mockResolvedValue(true);
});

describe('uploadIdForKey', () => {
  it('maps a key to the upload id it is stored under', () => {
    expect(uploadIdForKey(id(1))).toBe(id(1));
  });

  it('ignores keys this backend never writes', () => {
    expect(uploadIdForKey('tests/whatever')).toBeNull();
    expect(uploadIdForKey(`${id(1)}.bak`)).toBeNull();
  });
});

describe('sweepBucket', () => {
  it('deletes an old object with no Upload row or reservation', async () => {
    pages([obj(id(1))]);

    const result = await run();

    expect(h.del).toHaveBeenCalledWith(id(1));
    expect(result).toMatchObject({ orphans: 1, deleted: 1, cursor: null });
  });

  it('keeps an object younger than the age guard', async () => {
    pages([obj(id(1), YOUNG)]);

    const result = await run();

    expect(h.del).not.toHaveBeenCalled();
    expect(h.prisma.upload.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ orphans: 0, kept: 1 });
  });

  it('keeps an object whose Upload row exists', async () => {
    pages([obj(id(1)), obj(id(2))]);
    h.prisma.upload.findMany.mockResolvedValue([{ id: id(1) }]);

    await run();

    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.del).toHaveBeenCalledWith(id(2));
  });

  it('keeps an object with a live reservation', async () => {
    pages([obj(id(1))]);
    h.prisma.pendingUpload.findMany.mockResolvedValue([{ id: id(1) }]);

    await run();

    expect(h.del).not.toHaveBeenCalled();
    const { where } = h.prisma.pendingUpload.findMany.mock.calls[0][0];
    expect(where.sweptAt).toBeNull();
    expect(where.expiresAt.gt.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('asks for existing rows once per page', async () => {
    pages([obj(id(1)), obj(id(2)), obj(id(3))]);

    await run();

    expect(h.prisma.upload.findMany).toHaveBeenCalledTimes(1);
    expect(h.prisma.upload.findMany.mock.calls[0][0].where.id.in).toEqual([
      id(1),
      id(2),
      id(3),
    ]);
    expect(h.prisma.pendingUpload.findMany).toHaveBeenCalledTimes(1);
  });

  it('treats every part of a multipart file as its own upload id', async () => {
    // Parts 1 and 3 have rows; part 2's row was never created.
    pages([obj(id(11)), obj(id(12)), obj(id(13))]);
    h.prisma.upload.findMany.mockResolvedValue([
      { id: id(11) },
      { id: id(13) },
    ]);

    await run();

    expect(h.del.mock.calls).toEqual([[id(12)]]);
  });

  it('never touches keys that are not upload ids', async () => {
    pages([obj('tests/fixture'), obj(id(1))]);

    await run();

    expect(h.del.mock.calls).toEqual([[id(1)]]);
  });

  it('claims the bytes before deleting, so a late finalize is refused', async () => {
    pages([obj(id(1))]);

    await run();

    const claim = h.prisma.pendingUpload.createMany.mock.calls[0][0].data[0];
    expect(claim).toMatchObject({ id: id(1), sweptAt: expect.any(Date) });
    expect(
      h.prisma.pendingUpload.createMany.mock.invocationCallOrder[0]
    ).toBeLessThan(h.del.mock.invocationCallOrder[0]);
    expect(h.prisma.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { id: id(1), sweptAt: { not: null } },
    });
  });

  it('keeps an object finalized between the page query and the claim', async () => {
    pages([obj(id(1))]);
    h.prisma.upload.count.mockResolvedValue(1);

    const result = await run();

    expect(h.del).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 0, kept: 1 });
  });

  it('keeps an object a finalize holds', async () => {
    pages([obj(id(1))]);
    h.prisma.pendingUpload.createMany.mockResolvedValue({ count: 0 });
    h.prisma.pendingUpload.count.mockResolvedValue(1);

    await run();

    expect(h.del).not.toHaveBeenCalled();
  });

  it('counts a failed delete as an error and carries on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pages([obj(id(1)), obj(id(2))]);
    h.del.mockRejectedValueOnce(new Error('denied'));

    const result = await run();

    expect(result).toMatchObject({ deleted: 1, errors: 1 });
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('deletes nothing in a dry run, but reports what it would delete', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    pages([obj(id(1)), obj(id(2))]);

    const result = await run({ dryRun: true });

    expect(h.del).not.toHaveBeenCalled();
    expect(h.prisma.pendingUpload.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ orphans: 2, deleted: 0 });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `would delete 2 bucket objects: ${id(1)}, ${id(2)}`
      )
    );
    log.mockRestore();
  });

  it('pages through the bucket, saving the cursor after each page', async () => {
    pages([obj(id(1)), obj(id(2))], [obj(id(3))]);
    const onPage = vi.fn();

    const result = await run({ onPage });

    expect(h.listObjects.mock.calls).toEqual([
      [undefined, 1000],
      [id(2), 1000],
    ]);
    expect(onPage.mock.calls.map(([cursor]) => cursor)).toEqual([id(2), null]);
    expect(result).toMatchObject({ deleted: 3, cursor: null, capped: false });
  });

  it('resumes the listing from a saved cursor', async () => {
    pages([obj(id(5))]);

    await run({ cursor: id(4) });

    expect(h.listObjects).toHaveBeenCalledWith(id(4), 1000);
  });

  it('stops at the cap, recording it and where to resume', async () => {
    pages([obj(id(1)), obj(id(2)), obj(id(3)), obj(id(4))]);

    const result = await run({ budget: 2 });

    expect(h.del).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ orphans: 2, capped: true, cursor: id(2) });
    expect(h.listObjects).toHaveBeenCalledTimes(1);
  });

  it('does not list at all with no budget left', async () => {
    const result = await run({ budget: 0, cursor: 'c' });

    expect(h.listObjects).not.toHaveBeenCalled();
    expect(result).toMatchObject({ capped: true, cursor: 'c' });
  });

  it('stops after the page that passes the deadline, keeping the cursor', async () => {
    pages([obj(id(1))], [obj(id(2))]);

    const result = await run({ deadline: Date.now() - 1 });

    expect(h.listObjects).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ cursor: id(1), capped: false });
  });
});
