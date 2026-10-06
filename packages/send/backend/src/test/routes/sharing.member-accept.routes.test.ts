import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/sharing/:linkId/member/accept must demand the same proof of
 * access as the recipient read path before creating a membership: a valid
 * (unexpired) link and a matching challenge plaintext. Possession of the
 * link id alone must not be enough to join the folder.
 */

const {
  mockAcceptAccessLink,
  mockAcceptInvitation,
  mockCreateInvitationFromAccessLink,
  mockIsAccessLinkValid,
} = vi.hoisted(() => ({
  mockAcceptAccessLink: vi.fn(),
  mockAcceptInvitation: vi.fn(),
  mockCreateInvitationFromAccessLink: vi.fn(),
  mockIsAccessLinkValid: vi.fn(),
}));

vi.mock('../../models/sharing', () => ({
  acceptAccessLink: mockAcceptAccessLink,
  acceptInvitation: mockAcceptInvitation,
  burnEphemeralConversation: vi.fn(),
  checkIfAccessLinkCanBeCreated: vi.fn(),
  createAccessLink: vi.fn(),
  createInvitationFromAccessLink: mockCreateInvitationFromAccessLink,
  getAccessLinkChallenge: vi.fn(),
  getAccessLinksByUploadId: vi.fn(),
  getAccessLinksByUploadIdAndWrappedKey: vi.fn(),
  getContainerForAccessLink: vi.fn(),
  isAccessLinkValid: mockIsAccessLinkValid,
  removeAccessLink: vi.fn(),
  resetAccessLinkRetryCount: vi.fn(),
  updateAccessLink: vi.fn(),
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: () => ({ id: 'user-123' }),
}));

vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    requireJWT: passthrough,
    requireAuth: passthrough,
    getAuthenticatedUserData: () => ({ id: 'user-1', email: 'u@example.com' }),
    getGroupMemberPermissions: passthrough,
    requireReadPermission: passthrough,
    requireWritePermission: passthrough,
    requireAdminPermission: passthrough,
    requireSharePermission: passthrough,
  };
});

vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

vi.mock('@send-backend/utils', () => ({
  addExpiryToContainer: (c: unknown) => c,
  formatAccessLinkWithPasswordHash: (l: unknown) => l,
}));

vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn() }),
}));

import router from '../../routes/sharing';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

const LINK_ID = 'link-abc';
const ACCEPT_URL = `/api/sharing/${LINK_ID}/member/accept`;

describe('POST /api/sharing/:linkId/member/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAccessLinkValid.mockResolvedValue({ id: LINK_ID });
    mockAcceptAccessLink.mockResolvedValue({ id: LINK_ID });
    mockCreateInvitationFromAccessLink.mockResolvedValue({ id: 'inv-1' });
    mockAcceptInvitation.mockResolvedValue({ id: 'inv-1', status: 'ACCEPTED' });
  });

  it('rejects a request without a challenge response and creates nothing', async () => {
    const response = await request(app).post(ACCEPT_URL).send({});

    expect(response.status).toBe(403);
    expect(mockCreateInvitationFromAccessLink).not.toHaveBeenCalled();
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects an expired or unknown link and creates nothing', async () => {
    mockIsAccessLinkValid.mockResolvedValue(null);

    const response = await request(app)
      .post(ACCEPT_URL)
      .send({ challengePlaintext: 'correct-answer' });

    expect(response.status).toBe(403);
    expect(mockCreateInvitationFromAccessLink).not.toHaveBeenCalled();
  });

  it('rejects a wrong challenge response and creates nothing', async () => {
    mockAcceptAccessLink.mockRejectedValue(new Error('not found'));

    const response = await request(app)
      .post(ACCEPT_URL)
      .send({ challengePlaintext: 'wrong-answer' });

    expect(response.status).toBe(403);
    expect(mockAcceptAccessLink).toHaveBeenCalledWith(LINK_ID, 'wrong-answer');
    expect(mockCreateInvitationFromAccessLink).not.toHaveBeenCalled();
  });

  it('accepts a valid link with the correct challenge response', async () => {
    const response = await request(app)
      .post(ACCEPT_URL)
      .send({ challengePlaintext: 'correct-answer' });

    expect(response.status).toBe(200);
    expect(mockAcceptAccessLink).toHaveBeenCalledWith(
      LINK_ID,
      'correct-answer'
    );
    expect(mockCreateInvitationFromAccessLink).toHaveBeenCalledWith(
      LINK_ID,
      'user-123'
    );
    expect(mockAcceptInvitation).toHaveBeenCalledWith('inv-1');
  });

  it('returns a success no-op when the owner accepts their own link', async () => {
    mockCreateInvitationFromAccessLink.mockResolvedValue(null);

    const response = await request(app)
      .post(ACCEPT_URL)
      .send({ challengePlaintext: 'correct-answer' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });
});
