import { beforeEach, describe, expect, it, vi } from 'vitest';

// deleteItem removes only the authorized container's item rows, and removes
// the Upload row and stored bytes only once no item references that upload.

const h = vi.hoisted(() => {
  const tx = {
    item: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    upload: { findMany: vi.fn(), deleteMany: vi.fn() },
    container: { update: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const storageDel = vi.fn();
  return { prisma, tx, storageDel };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@prisma/client')>()),
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
}));

vi.mock('../../storage', () => ({
  default: { del: h.storageDel },
}));

import { deleteItem } from '../../models';

const CONTAINER = 'container-a';
const OWNER = 'user-owner';
const UPLOAD = 'upload-1';

function seed({ stillReferenced }: { stillReferenced: boolean }) {
  h.tx.item.findFirst.mockResolvedValue({ wrappedKey: 'wk' });
  h.tx.item.findMany.mockResolvedValue([{ id: 1, uploadId: UPLOAD }]);
  h.tx.item.deleteMany.mockResolvedValue({ count: 1 });
  // uploads with no remaining item rows
  h.tx.upload.findMany.mockResolvedValue(
    stillReferenced ? [] : [{ id: UPLOAD }]
  );
  h.tx.upload.deleteMany.mockResolvedValue({ count: 0 });
  h.tx.container.update.mockResolvedValue({});
  h.storageDel.mockResolvedValue(undefined);
}

describe('deleteItem container scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes only the item rows found in the authorized container', async () => {
    seed({ stillReferenced: false });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.tx.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wrappedKey: 'wk',
          containerId: CONTAINER,
          upload: { ownerId: OWNER },
        },
      })
    );
    expect(h.tx.item.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
    });
  });

  it('removes the upload and bytes when nothing else references it', async () => {
    seed({ stillReferenced: false });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.tx.upload.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [UPLOAD] }, items: { none: {} } },
      })
    );
    expect(h.tx.upload.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [UPLOAD] } },
    });
    expect(h.storageDel).toHaveBeenCalledWith(UPLOAD);
  });

  it('keeps the upload and bytes while another item references it', async () => {
    seed({ stillReferenced: true });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.tx.upload.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
    expect(h.storageDel).not.toHaveBeenCalled();
  });
});
