import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: { accessLink: { update: vi.fn(), delete: vi.fn() } },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  ItemType: { FILE: 'FILE', MESSAGE: 'MESSAGE' },
  InvitationStatus: { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

vi.mock('../../storage', () => ({
  default: {},
}));

import { deleteAccessLink } from '../../models/sharing';

describe('deleteAccessLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only deletes a link in a container owned by the caller', async () => {
    h.prisma.accessLink.delete.mockResolvedValue({ id: 'link-1' });

    await deleteAccessLink('link-1', 'owner-1');

    expect(h.prisma.accessLink.delete).toHaveBeenCalledWith({
      where: {
        id: 'link-1',
        share: { container: { ownerId: 'owner-1' } },
      },
      select: { id: true },
    });
  });

  it('throws when the caller does not own the container', async () => {
    h.prisma.accessLink.delete.mockRejectedValue(new Error('NotFoundError'));

    await expect(deleteAccessLink('link-1', 'not-the-owner')).rejects.toThrow();
  });
});
