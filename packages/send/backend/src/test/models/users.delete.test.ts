import { beforeEach, describe, expect, it, vi } from 'vitest';

// deleteUser (#1314): rows that reference the user from other users' folders
// (their shares, items pointing at their uploads) are deleted with them, and
// every stored object they own is removed once the rows have committed.

const h = vi.hoisted(() => {
  const order: string[] = [];
  const step = (name: string, result: unknown = { count: 1 }) =>
    vi.fn(async () => {
      order.push(name);
      return result;
    });
  const tx = {
    upload: {
      findMany: vi.fn(),
      deleteMany: step('upload.deleteMany'),
    },
    membership: { deleteMany: step('membership.deleteMany') },
    share: { deleteMany: step('share.deleteMany') },
    item: { deleteMany: step('item.deleteMany') },
    container: { deleteMany: step('container.deleteMany') },
    user: { delete: step('user.delete', { id: 'user-1' }) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => {
      const result = await fn(tx);
      order.push('commit');
      return result;
    }),
  };
  const del = vi.fn(async (_id: string) => {
    order.push('storage.del');
    return true;
  });
  return { order, tx, prisma, del };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));
vi.mock('../../storage', () => ({ default: { del: h.del } }));

import { deleteUser } from '../../models/users';

const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.tx.upload.findMany.mockResolvedValue([
    { id: 'up-1' },
    { id: 'part-1' },
    { id: 'part-2' },
  ]);
});

describe('deleteUser', () => {
  it('deletes a user who shared and uploaded into other users’ folders', async () => {
    expect(await deleteUser(USER)).toEqual({ id: USER });

    expect(h.tx.share.deleteMany).toHaveBeenCalledWith({
      where: { senderId: USER },
    });
    // Items anywhere (including other users' containers) that point at the
    // user's uploads; Item.uploadId is RESTRICT.
    expect(h.tx.item.deleteMany).toHaveBeenCalledWith({
      where: { upload: { ownerId: USER } },
    });
    const at = (name: string) => h.order.indexOf(name);
    expect(at('share.deleteMany')).toBeLessThan(at('user.delete'));
    expect(at('item.deleteMany')).toBeLessThan(at('upload.deleteMany'));
    expect(at('upload.deleteMany')).toBeLessThan(at('user.delete'));
  });

  it('removes every stored object the user owned, after the commit', async () => {
    await deleteUser(USER);

    expect(h.del.mock.calls.map(([id]) => id).sort()).toEqual([
      'part-1',
      'part-2',
      'up-1',
    ]);
    expect(h.order.indexOf('commit')).toBeLessThan(
      h.order.indexOf('storage.del')
    );
  });

  it('logs a failed object delete and still succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.del.mockRejectedValueOnce(new Error('bucket down'));

    expect(await deleteUser(USER)).toEqual({ id: USER });
    expect(h.del).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[deleteUser]'),
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('deletes no objects when the transaction fails', async () => {
    h.tx.user.delete.mockRejectedValueOnce(new Error('fk'));

    await expect(deleteUser(USER)).rejects.toThrow('fk');
    expect(h.del).not.toHaveBeenCalled();
  });
});
