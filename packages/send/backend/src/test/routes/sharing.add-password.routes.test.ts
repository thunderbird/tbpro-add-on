import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUpdateAccessLink, mockRequireAuth, mockGetUserData } = vi.hoisted(
  () => ({
    mockUpdateAccessLink: vi.fn(),
    mockRequireAuth: vi.fn(),
    mockGetUserData: vi.fn(),
  })
);

vi.mock('../../models/sharing', () => ({
  acceptAccessLink: vi.fn(),
  acceptInvitation: vi.fn(),
  burnEphemeralConversation: vi.fn(),
  checkIfAccessLinkCanBeCreated: vi.fn(),
  createAccessLink: vi.fn(),
  createInvitationFromAccessLink: vi.fn(),
  getAccessLinkChallenge: vi.fn(),
  getAccessLinksByUploadId: vi.fn(),
  getAccessLinksByUploadIdAndWrappedKey: vi.fn(),
  getContainerForAccessLink: vi.fn(),
  isAccessLinkValid: vi.fn(),
  removeAccessLink: vi.fn(),
  resetAccessLinkRetryCount: vi.fn(),
  updateAccessLink: mockUpdateAccessLink,
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(),
}));

vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn() }),
}));

vi.mock('@send-backend/utils', () => ({
  addExpiryToContainer: (c: unknown) => c,
  formatAccessLinkWithPasswordHash: (l: unknown) => l,
}));

vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    getAuthenticatedUserData: mockGetUserData,
    getGroupMemberPermissions: passthrough,
    requireAdminPermission: passthrough,
    requireAuth: mockRequireAuth,
    requireJWT: passthrough,
    requireSharePermission: passthrough,
  };
});

import router from '../../routes/sharing';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

const addPassword = () =>
  request(app)
    .post('/api/sharing/link-1/add-password')
    .send({ password: 'hash' });

describe('POST /api/sharing/:linkId/add-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation((_req, _res, next) => next());
    mockGetUserData.mockReturnValue({ id: 'owner-1', email: 'o@example.com' });
  });

  it('rejects an unauthenticated caller without touching the link', async () => {
    mockRequireAuth.mockImplementation((_req, res) => {
      res.status(403).json({ message: 'Not authorized' });
    });

    const response = await addPassword();

    expect(response.status).toBe(403);
    expect(mockUpdateAccessLink).not.toHaveBeenCalled();
  });

  it('rejects when no user can be resolved', async () => {
    mockGetUserData.mockReturnValue(null);

    const response = await addPassword();

    expect(response.status).toBe(403);
    expect(mockUpdateAccessLink).not.toHaveBeenCalled();
  });

  it('updates the link scoped to the calling user', async () => {
    mockUpdateAccessLink.mockResolvedValue({
      id: 'link-1',
      passwordHash: 'hash',
    });

    const response = await addPassword();

    expect(response.status).toBe(200);
    expect(mockUpdateAccessLink).toHaveBeenCalledWith(
      'link-1',
      'hash',
      'owner-1'
    );
  });

  it("returns 404 for a link in a container the caller doesn't own", async () => {
    mockUpdateAccessLink.mockRejectedValue(new Error('NotFoundError'));

    const response = await addPassword();

    expect(response.status).toBe(404);
  });
});
