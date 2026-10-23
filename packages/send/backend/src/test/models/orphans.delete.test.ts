import { beforeEach, describe, expect, it, vi } from 'vitest';

// deleteOrphans (#117): the stored object goes before the row, only old
// uploads are considered, and dry run / delete budget are honoured.

const h = vi.hoisted(() => {
  const order: string[] = [];
  const prisma = {
    upload: {
      findMany: vi.fn(),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        order.push(`row:${where.id}`);
        return { id: where.id };
      }),
    },
  };
  const del = vi.fn(async (id: string) => {
    order.push(`object:${id}`);
    return true;
  });
  return { order, prisma, del };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));
vi.mock('../../storage', () => ({ default: { del: h.del } }));

import { deleteOrphans } from '../../models';

const olderThan = new Date('2026-10-22T00:00:00Z');
const options = { olderThan, dryRun: false, maxDeletes: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.prisma.upload.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
});

describe('deleteOrphans', () => {
  it('deletes each stored object before its row', async () => {
    expect(await deleteOrphans(options)).toEqual({
      found: 2,
      deleted: 2,
      errors: 0,
      dryRun: false,
      capped: false,
    });
    expect(h.order).toEqual(['object:a', 'row:a', 'object:b', 'row:b']);
  });

  it('only looks at uploads older than the minimum age', async () => {
    await deleteOrphans(options);

    expect(h.prisma.upload.findMany).toHaveBeenCalledWith({
      where: {
        items: { none: {} },
        OR: [{ createdAt: { lt: olderThan } }, { createdAt: null }],
      },
      select: { id: true },
    });
  });

  it('keeps the row when the object delete fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.del.mockRejectedValueOnce(new Error('bucket down'));

    const result = await deleteOrphans(options);

    expect(result).toMatchObject({ deleted: 1, errors: 1 });
    expect(h.prisma.upload.delete).toHaveBeenCalledTimes(1);
    expect(h.prisma.upload.delete).toHaveBeenCalledWith({ where: { id: 'b' } });
    warn.mockRestore();
  });

  it('deletes nothing in a dry run', async () => {
    const result = await deleteOrphans({ ...options, dryRun: true });

    expect(result).toMatchObject({ found: 2, deleted: 2, dryRun: true });
    expect(h.del).not.toHaveBeenCalled();
    expect(h.prisma.upload.delete).not.toHaveBeenCalled();
  });

  it('stops at the delete budget', async () => {
    const result = await deleteOrphans({ ...options, maxDeletes: 1 });

    expect(result).toMatchObject({ found: 2, deleted: 1, capped: true });
    expect(h.order).toEqual(['object:a', 'row:a']);
  });
});
