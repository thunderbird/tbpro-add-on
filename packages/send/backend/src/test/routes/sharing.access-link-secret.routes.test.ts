import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every model function the sharing router imports, so that any database access
// from the handlers under test is observable (and, for the add-password
// endpoint, provably absent).
const { sharingModel } = vi.hoisted(() => ({
  sharingModel: {
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
  },
}));

vi.mock('../../models/sharing', () => sharingModel);

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(() => ({
    id: 'user-1',
    uniqueHash: 'hash-1',
  })),
}));

vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn(), shutdown: vi.fn() }),
}));

// All middleware becomes a pass-through so we exercise the handlers directly.
vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    getGroupMemberPermissions: passthrough,
    requireAdminPermission: passthrough,
    requireJWT: passthrough,
    requireSharePermission: passthrough,
  };
});
vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

// vi.mock() calls above are hoisted above imports, so this router picks up the
// stubs.
import router from '../../routes/sharing';
import { captureConsole } from '../testutils';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

// A value that could only appear in the output if it was copied from the
// request; nothing else in the test produces it.
const SECRET = 'request-secret-7f3a9c2e';

describe('sharing routes: access-link secret handling', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  describe('POST /api/sharing/:linkId/add-password', () => {
    it('acknowledges the request without touching the database', async () => {
      const response = await request(app)
        .post('/api/sharing/link-1/add-password')
        .send({ linkId: 'link-1', password: SECRET })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'link-1' });

      for (const modelFn of Object.values(sharingModel)) {
        expect(modelFn).not.toHaveBeenCalled();
      }
    });

    it('never echoes or logs the request secret', async () => {
      const response = await request(app)
        .post('/api/sharing/link-1/add-password')
        .send({ linkId: 'link-1', password: SECRET })
        .set('Content-Type', 'application/json');

      expect(JSON.stringify(response.body)).not.toContain(SECRET);
      expect(consoleCapture.output()).not.toContain(SECRET);
    });

    it('accepts a body without the legacy field', async () => {
      const response = await request(app)
        .post('/api/sharing/link-1/add-password')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'link-1' });
    });
  });

  describe('GET /api/sharing/:uploadId/links', () => {
    const rows = [
      { id: 'link-1', expiryDate: null, locked: false },
      { id: 'link-2', expiryDate: '2030-01-01T00:00:00.000Z', locked: true },
    ];

    it('returns link metadata exactly as stored, with no URL fragment added', async () => {
      sharingModel.getAccessLinksByUploadId.mockResolvedValue(rows);

      const response = await request(app).get('/api/sharing/upload-1/links');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(rows);
      // The lookup is scoped to the authenticated caller's owned containers.
      expect(sharingModel.getAccessLinksByUploadId).toHaveBeenCalledWith(
        'upload-1',
        'user-1'
      );
    });

    it('does the same for the file-scoped query', async () => {
      sharingModel.getAccessLinksByUploadIdAndWrappedKey.mockResolvedValue(
        rows
      );

      const response = await request(app).get(
        '/api/sharing/upload-1/links?type=file'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(rows);
      expect(
        sharingModel.getAccessLinksByUploadIdAndWrappedKey
      ).toHaveBeenCalledWith('upload-1', 'user-1');
    });
  });
});
