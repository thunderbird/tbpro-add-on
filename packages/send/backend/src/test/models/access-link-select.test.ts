import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every query here returns access-link rows to a client. Each must name its
// fields explicitly so that columns holding link secrets never leave the
// database, whatever the schema gains later.

const h = vi.hoisted(() => {
  // A single shared instance so every `new PrismaClient()` across the imported
  // modules sees the same mocked delegates.
  const prisma = {
    accessLink: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    share: { findMany: vi.fn() },
  };
  return { prisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  // Enum values referenced by the imported modules at runtime.
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  ItemType: { FILE: 'FILE', MESSAGE: 'MESSAGE' },
  InvitationStatus: { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

// Avoid real storage-backend initialization at module load.
vi.mock('../../storage', () => ({
  default: {},
}));

import { updateAccessLinkPermissions } from '../../models';
import {
  getAccessLinksForContainer,
  markAccessLinkAsPasswordless,
} from '../../models/containers';
import {
  getAccessLinksByUploadId,
  getAccessLinksByUploadIdAndWrappedKey,
  removeAccessLink,
} from '../../models/sharing';
import { PermissionType } from '../../types/custom';

// `hasPassword` is a non-secret boolean flag; the secret material itself
// (password, hash, or URL fragment) must never appear here.
const LIST_SELECT = {
  id: true,
  expiryDate: true,
  locked: true,
  hasPassword: true,
};

const selectOf = (mockFn: ReturnType<typeof vi.fn>) =>
  mockFn.mock.calls[0][0].select;

describe('access-link queries select only non-secret fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.accessLink.findMany.mockResolvedValue([]);
    h.prisma.accessLink.update.mockResolvedValue({ id: 'link-1' });
    h.prisma.accessLink.delete.mockResolvedValue({ id: 'link-1' });
    h.prisma.share.findMany.mockResolvedValue([]);
  });

  it('getAccessLinksByUploadId', async () => {
    await getAccessLinksByUploadId('upload-1', 'owner-1');
    expect(selectOf(h.prisma.accessLink.findMany)).toEqual(LIST_SELECT);
  });

  it('getAccessLinksByUploadIdAndWrappedKey', async () => {
    await getAccessLinksByUploadIdAndWrappedKey('upload-1', 'owner-1');
    expect(selectOf(h.prisma.accessLink.findMany)).toEqual(LIST_SELECT);
  });

  it('getAccessLinksForContainer', async () => {
    await getAccessLinksForContainer('container-1');
    expect(selectOf(h.prisma.share.findMany).accessLinks.select).toEqual(
      LIST_SELECT
    );
  });

  it('markAccessLinkAsPasswordless', async () => {
    await markAccessLinkAsPasswordless('link-1', 'owner-1');
    expect(selectOf(h.prisma.accessLink.update)).toEqual({ id: true });
    // The update is scoped to the caller's ownership, not just the link id.
    expect(h.prisma.accessLink.update.mock.calls[0][0].where).toEqual({
      id: 'link-1',
      share: { container: { ownerId: 'owner-1' } },
    });
  });

  it('removeAccessLink', async () => {
    await removeAccessLink('link-1');
    expect(selectOf(h.prisma.accessLink.delete)).toEqual({ id: true });
  });

  it('updateAccessLinkPermissions', async () => {
    await updateAccessLinkPermissions(
      'container-1',
      'link-1',
      'user-1',
      PermissionType.READ
    );
    expect(selectOf(h.prisma.accessLink.update)).toEqual({
      id: true,
      permission: true,
    });
  });
});
