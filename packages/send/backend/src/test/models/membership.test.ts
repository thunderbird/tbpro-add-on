import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression tests for issue #1004 (BUG-7): the container owner's ADMIN
// membership row shares the (groupId, userId) composite key with any invitee row
// for that same user. Before the fix, removing an invitation whose recipient was
// the owner (a self-invite, or any flow collapsing sender/recipient onto the
// owner) deleted the owner's real ownership row via removeGroupMember(),
// permanently locking the owner out of their own container. The fix (a) makes
// removeGroupMember() a no-op for the owner and (b) refuses to create an
// invitation that names the owner as recipient.

const h = vi.hoisted(() => {
  // A single shared instance so every `new PrismaClient()` across the imported
  // modules sees the same mocked delegates.
  const prisma = {
    container: { findUniqueOrThrow: vi.fn() },
    accessLink: { findUniqueOrThrow: vi.fn() },
    membership: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
    invitation: {
      findUniqueOrThrow: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    share: { findFirstOrThrow: vi.fn(), create: vi.fn() },
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

import { removeGroupMember, removeInvitationAndGroup } from '../../models';
import {
  createInvitation,
  createInvitationFromAccessLink,
} from '../../models/sharing';

const CONTAINER_ID = 'container-1';
const GROUP_ID = 42;
const OWNER_ID = 'owner-1';
const OTHER_ID = 'member-2';

describe('removeGroupMember owner protection (#1004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.container.findUniqueOrThrow.mockResolvedValue({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
    });
  });

  it('does NOT delete the membership when the target user is the container owner', async () => {
    const ownerMembership = {
      groupId: GROUP_ID,
      userId: OWNER_ID,
      permission: 16,
    };
    h.prisma.membership.findFirst.mockResolvedValue(ownerMembership);

    const result = await removeGroupMember(CONTAINER_ID, OWNER_ID);

    expect(h.prisma.membership.delete).not.toHaveBeenCalled();
    // The owner's untouched membership row is returned unchanged.
    expect(result).toBe(ownerMembership);
    expect(h.prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { groupId: GROUP_ID, userId: OWNER_ID },
    });
  });

  it('deletes the membership normally for a non-owner member', async () => {
    const deleted = { groupId: GROUP_ID, userId: OTHER_ID, permission: 2 };
    h.prisma.membership.delete.mockResolvedValue(deleted);

    const result = await removeGroupMember(CONTAINER_ID, OTHER_ID);

    expect(h.prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.membership.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: GROUP_ID, userId: OTHER_ID } },
    });
    expect(result).toBe(deleted);
  });
});

describe('removeInvitationAndGroup owner protection (#1004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.container.findUniqueOrThrow.mockResolvedValue({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
    });
  });

  it('still deletes the invitation but leaves the owner membership intact when the recipient is the owner', async () => {
    h.prisma.invitation.findUniqueOrThrow.mockResolvedValue({
      id: 7,
      share: { containerId: CONTAINER_ID },
      recipient: { id: OWNER_ID },
    });
    h.prisma.membership.findFirst.mockResolvedValue({
      groupId: GROUP_ID,
      userId: OWNER_ID,
      permission: 16,
    });
    h.prisma.invitation.delete.mockResolvedValue({ id: 7 });

    const result = await removeInvitationAndGroup(7);

    // Owner's membership row is never deleted...
    expect(h.prisma.membership.delete).not.toHaveBeenCalled();
    // ...but the invitation itself is still removed.
    expect(h.prisma.invitation.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(result).toEqual({ id: 7 });
  });
});

describe('createInvitation owner-as-recipient guard (#1004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.container.findUniqueOrThrow.mockResolvedValue({
      ownerId: OWNER_ID,
    });
  });

  it('throws when the recipient is the container owner', async () => {
    await expect(
      createInvitation(CONTAINER_ID, 'wrapped-key', OWNER_ID, OWNER_ID, 2)
    ).rejects.toThrow();

    // Guard runs before any share/invitation is touched.
    expect(h.prisma.share.findFirstOrThrow).not.toHaveBeenCalled();
    expect(h.prisma.share.create).not.toHaveBeenCalled();
    expect(h.prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('proceeds for a non-owner recipient', async () => {
    h.prisma.share.findFirstOrThrow.mockResolvedValue({ id: 99 });
    h.prisma.invitation.findFirstOrThrow.mockRejectedValue(
      new Error('not found')
    );
    const created = { id: 5, recipientId: OTHER_ID };
    h.prisma.invitation.create.mockResolvedValue(created);

    const result = await createInvitation(
      CONTAINER_ID,
      'wrapped-key',
      OWNER_ID,
      OTHER_ID,
      2
    );

    expect(result).toBe(created);
    expect(h.prisma.invitation.create).toHaveBeenCalled();
  });
});

describe('createInvitationFromAccessLink owner no-op (#1004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.accessLink.findUniqueOrThrow.mockResolvedValue({
      wrappedKey: 'wrapped-key',
      permission: 2,
      share: { senderId: OWNER_ID, containerId: CONTAINER_ID },
    });
  });

  it('returns null (graceful no-op) when the owner accepts their own access link', async () => {
    // createInvitation throws INVITATION_RECIPIENT_IS_OWNER for the owner; the
    // access-link path must swallow that and report success rather than 500.
    h.prisma.container.findUniqueOrThrow.mockResolvedValue({
      ownerId: OWNER_ID,
    });

    const result = await createInvitationFromAccessLink(CONTAINER_ID, OWNER_ID);

    expect(result).toBeNull();
    expect(h.prisma.invitation.update).not.toHaveBeenCalled();
  });

  it('still creates and accepts an invitation for a non-owner recipient', async () => {
    h.prisma.container.findUniqueOrThrow.mockResolvedValue({
      ownerId: OWNER_ID,
    });
    h.prisma.share.findFirstOrThrow.mockResolvedValue({ id: 99 });
    h.prisma.invitation.findFirstOrThrow.mockRejectedValue(
      new Error('not found')
    );
    h.prisma.invitation.create.mockResolvedValue({ id: 5 });
    h.prisma.invitation.update.mockResolvedValue({
      id: 5,
      status: 'ACCEPTED',
    });

    const result = await createInvitationFromAccessLink(CONTAINER_ID, OTHER_ID);

    expect(result).toEqual({ id: 5, status: 'ACCEPTED' });
    expect(h.prisma.invitation.update).toHaveBeenCalled();
  });
});
