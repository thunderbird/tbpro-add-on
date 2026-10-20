import { beforeEach, describe, expect, it, vi } from 'vitest';

// deleteItem removes only the authorized container's item rows, and removes
// the Upload row and stored bytes only once no other container references
// that upload.

const h = vi.hoisted(() => {
  const prisma = {
    item: {
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    upload: { deleteMany: vi.fn() },
    container: { update: vi.fn() },
  };
  const storageDel = vi.fn();
  return { prisma, storageDel };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  ItemType: { FILE: 'FILE', MESSAGE: 'MESSAGE' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

vi.mock('../../storage', () => ({
  default: { del: h.storageDel },
}));

import { deleteItem } from '../../models';

const CONTAINER = 'container-a';
const OWNER = 'user-owner';
const UPLOAD = 'upload-1';

function seed({ stillReferenced }: { stillReferenced: string[] }) {
  h.prisma.item.findFirstOrThrow.mockResolvedValue({
    containerId: CONTAINER,
    uploadId: UPLOAD,
    multipart: false,
    wrappedKey: 'wk',
  });
  // first findMany: sibling lookup; second: remaining references after delete
  h.prisma.item.findMany
    .mockResolvedValueOnce([{ uploadId: UPLOAD }])
    .mockResolvedValueOnce(stillReferenced.map((uploadId) => ({ uploadId })));
  h.prisma.item.deleteMany.mockResolvedValue({ count: 1 });
  h.prisma.upload.deleteMany.mockResolvedValue({ count: 0 });
  h.prisma.container.update.mockResolvedValue({});
  h.storageDel.mockResolvedValue(undefined);
}

describe('deleteItem container scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes item rows only in the authorized container', async () => {
    seed({ stillReferenced: [] });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.prisma.item.deleteMany).toHaveBeenCalledWith({
      where: { uploadId: { in: [UPLOAD] }, containerId: CONTAINER },
    });
  });

  it('removes the upload and bytes when nothing else references it', async () => {
    seed({ stillReferenced: [] });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.prisma.upload.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [UPLOAD] } },
    });
    expect(h.storageDel).toHaveBeenCalledWith(UPLOAD);
  });

  it('keeps the upload and bytes while another container references it', async () => {
    seed({ stillReferenced: [UPLOAD] });
    await deleteItem(1, CONTAINER, OWNER, true);
    expect(h.prisma.upload.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
    expect(h.storageDel).not.toHaveBeenCalled();
  });
});
