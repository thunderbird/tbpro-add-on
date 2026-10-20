import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Public access-link routes: locked/expired links are refused with the
// existing error codes, success shapes are unchanged, and viewing a link's
// container never resets the retry count (#1006, #1010).
const { sharingModel } = vi.hoisted(() => ({
  sharingModel: {
    acceptAccessLink: vi.fn(),
    checkIfAccessLinkCanBeCreated: vi.fn(),
    createAccessLink: vi.fn(),
    getAccessLinkChallenge: vi.fn(),
    getAccessLinksByUploadId: vi.fn(),
    getAccessLinksByUploadIdAndWrappedKey: vi.fn(),
    getContainerForAccessLink: vi.fn(),
    isAccessLinkValid: vi.fn(),
  },
}));

vi.mock('../../models/sharing', () => sharingModel);

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(),
}));
vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn(), shutdown: vi.fn() }),
}));
vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    getGroupMemberPermissions: passthrough,
    requireJWT: passthrough,
    requireSharePermission: passthrough,
  };
});
vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

import { errorHandler } from '../../errors/routes';
import router from '../../routes/sharing';
import { captureConsole } from '../testutils';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

app.use((err, req, res, _next) => errorHandler(err, req, res));

// What the model throws when the usable-link filter matches no row.
const refused = () => Promise.reject(new Error('ACCESSLINK_NOT_FOUND'));

describe('sharing routes: access-link validity', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  describe('GET /:linkId/challenge', () => {
    it('returns the challenge for a usable link', async () => {
      sharingModel.getAccessLinkChallenge.mockResolvedValue({
        challengeKey: 'k',
        challengeSalt: 's',
        challengeCiphertext: 'c',
      });
      const res = await request(app).get('/api/sharing/link-1/challenge');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        challengeKey: 'k',
        challengeSalt: 's',
        challengeCiphertext: 'c',
      });
    });

    it('returns 404 for a locked or expired link', async () => {
      sharingModel.getAccessLinkChallenge.mockImplementation(refused);
      const res = await request(app).get('/api/sharing/link-1/challenge');
      expect(res.status).toBe(404);
      expect(res.body).not.toHaveProperty('challengeKey');
    });
  });

  describe('POST /:linkId/challenge', () => {
    it('returns the wrapped key for a correct answer', async () => {
      sharingModel.acceptAccessLink.mockResolvedValue({
        wrappedKey: 'wrapped',
        salt: 'salt',
        challengePlaintext: 'answer',
        retryCount: 1,
        share: { containerId: 'container-1' },
      });
      const res = await request(app)
        .post('/api/sharing/link-1/challenge')
        .send({ challengePlaintext: 'answer' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        containerId: 'container-1',
        wrappedKey: 'wrapped',
        salt: 'salt',
      });
      expect(sharingModel.acceptAccessLink).toHaveBeenCalledWith(
        'link-1',
        'answer'
      );
    });

    it('returns 403 for a wrong answer or a locked/expired link', async () => {
      sharingModel.acceptAccessLink.mockImplementation(refused);
      const res = await request(app)
        .post('/api/sharing/link-1/challenge')
        .send({ challengePlaintext: 'wrong' });
      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('wrappedKey');
    });
  });

  describe('GET /:linkId', () => {
    it('returns the container without touching the retry count', async () => {
      sharingModel.getContainerForAccessLink.mockResolvedValue({
        id: 'container-1',
        items: [],
      });
      const res = await request(app).get('/api/sharing/link-1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'container-1', items: [] });
      for (const [name, fn] of Object.entries(sharingModel)) {
        if (name !== 'getContainerForAccessLink') {
          expect(fn, name).not.toHaveBeenCalled();
        }
      }
    });

    it('returns 404 for a locked or expired link', async () => {
      sharingModel.getContainerForAccessLink.mockImplementation(refused);
      const res = await request(app).get('/api/sharing/link-1');
      expect(res.status).toBe(404);
      expect(res.body).not.toHaveProperty('items');
    });
  });
});
