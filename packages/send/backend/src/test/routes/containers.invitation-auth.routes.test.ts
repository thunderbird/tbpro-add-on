import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRemoveInvitationAndGroup } = vi.hoisted(() => ({
  mockRemoveInvitationAndGroup: vi.fn(),
}));

// The route under test only needs removeInvitationAndGroup from the barrel;
// stub the rest so the import resolves without a database/storage client.
vi.mock('@send-backend/models', () => ({
  removeInvitationAndGroup: mockRemoveInvitationAndGroup,
  reportUpload: vi.fn(),
  addGroupMember: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  getContainerInfo: vi.fn(),
  getContainerWithDescendants: vi.fn(),
  getContainerWithMembers: vi.fn(),
  getSharesForContainer: vi.fn(),
  getWrappedKeyFromId: vi.fn(),
  removeGroupMember: vi.fn(),
  updateAccessLinkPermissions: vi.fn(),
  updateInvitationPermissions: vi.fn(),
  updateItemName: vi.fn(),
}));

vi.mock('@send-backend/models/sharing', () => ({
  burnFolder: vi.fn(),
  createInvitation: vi.fn(),
}));

vi.mock('@send-backend/models/containers', () => ({
  createContainer: vi.fn(),
  getAccessLinksForContainer: vi.fn(),
  getContainerWithAncestors: vi.fn(),
  getItemsInContainer: vi.fn(),
  updateContainerName: vi.fn(),
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(),
  getStorageLimit: vi.fn(),
}));

vi.mock('@send-backend/storage', () => ({
  default: { del: vi.fn() },
}));

// Simulate an unauthenticated caller: getGroupMemberPermissions rejects with
// 403 before reaching the handler. requireSharePermission would also reject
// when permissions are missing. Every other middleware is a pass-through.
const { rejectingAuth } = vi.hoisted(() => ({
  rejectingAuth: vi.fn(),
}));

vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    requireJWT: passthrough,
    renameBodyProperty: () => passthrough,
    getGroupMemberPermissions: rejectingAuth,
    requireReadPermission: passthrough,
    requireWritePermission: passthrough,
    requireAdminPermission: passthrough,
    requireSharePermission: passthrough,
  };
});

vi.mock('@send-backend/utils', () => ({
  addExpiryToContainer: (c: unknown) => c,
}));

import router from '../../routes/containers';

const app = express();
app.use(express.json());
app.use('/api/containers', router);

describe('DELETE /api/containers/:containerId/member/remove/:invitationId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated caller and never touches the model (issue #1011)', async () => {
    // getGroupMemberPermissions denies the request the way requireAuth does.
    rejectingAuth.mockImplementation((_req, res) => {
      res.status(403).json({ message: 'Not authorized' });
    });

    const response = await request(app).delete(
      '/api/containers/1/member/remove/1'
    );

    expect(response.status).toBe(403);
    expect(mockRemoveInvitationAndGroup).not.toHaveBeenCalled();
  });

  it('reaches the handler once the auth/permission guards pass', async () => {
    rejectingAuth.mockImplementation((_req, _res, next) => next());
    mockRemoveInvitationAndGroup.mockResolvedValue({ ok: true });

    const response = await request(app).delete(
      '/api/containers/1/member/remove/42'
    );

    expect(response.status).toBe(200);
    expect(mockRemoveInvitationAndGroup).toHaveBeenCalledWith(42);
  });
});
