import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Public access-link routes: locked/expired links are refused with the
// existing error codes, POST /challenge maps its refusals to 401/423/404,
// success shapes are unchanged, and viewing a link's container never resets the
// retry count (#1006, #1010).
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

import { AccessLinkChallengeError } from '../../errors/models';
import { errorHandler } from '../../errors/routes';
import router from '../../routes/sharing';
import { captureConsole } from '../testutils';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

// Stands in for every error middleware, Sentry's included.
const errorMiddleware = vi.fn((err, req, res, next) =>
  errorHandler(err, req, res, next)
);
app.use(errorMiddleware);

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

    const answer = (challengePlaintext = 'wrong') =>
      request(app)
        .post('/api/sharing/link-1/challenge')
        .send({ challengePlaintext });
    const consoleError = () => vi.mocked(console.error).mock.calls;

    it('returns 401 with the attempts left for an incorrect answer', async () => {
      sharingModel.acceptAccessLink.mockRejectedValue(
        new AccessLinkChallengeError('ACCESSLINK_CHALLENGE_INCORRECT', 3)
      );
      const res = await answer();
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        status: 'error',
        code: 'INCORRECT_PASSWORD',
        message: 'Incorrect password.',
        attemptsRemaining: 3,
      });
    });

    it('returns 423 for a locked link', async () => {
      sharingModel.acceptAccessLink.mockRejectedValue(
        new AccessLinkChallengeError('ACCESSLINK_LOCKED')
      );
      const res = await answer();
      expect(res.status).toBe(423);
      expect(res.body).toEqual({
        status: 'error',
        code: 'ACCESS_LINK_LOCKED',
        message: 'This link has been locked after too many incorrect attempts.',
      });
    });

    it('returns 404 for a missing or expired link', async () => {
      sharingModel.acceptAccessLink.mockRejectedValue(
        new AccessLinkChallengeError('ACCESSLINK_NOT_FOUND')
      );
      const res = await answer();
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        statusCode: 404,
        message: 'Could not find access link.',
      });
    });

    it('leaves unexpected errors to the global handler as a 500', async () => {
      sharingModel.acceptAccessLink.mockRejectedValue(new Error('db down'));
      const res = await answer();
      expect(res.status).toBe(500);
      expect(res.body).not.toHaveProperty('wrappedKey');
      expect(consoleError()).toHaveLength(1);
    });

    it('does not log incorrect answers or locked links as errors', async () => {
      sharingModel.acceptAccessLink
        .mockRejectedValueOnce(
          new AccessLinkChallengeError('ACCESSLINK_CHALLENGE_INCORRECT', 1)
        )
        .mockRejectedValueOnce(
          new AccessLinkChallengeError('ACCESSLINK_LOCKED')
        );
      await answer('secret-guess');
      await answer('secret-guess');
      expect(errorMiddleware).not.toHaveBeenCalled();
      expect(consoleError()).toHaveLength(0);
      expect(consoleCapture.output()).not.toContain('secret-guess');
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
