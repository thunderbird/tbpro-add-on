import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    group: { findFirstOrThrow: vi.fn() },
    membership: { findUniqueOrThrow: vi.fn() },
  },
}));

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@prisma/client')>()),
  PrismaClient: class {
    constructor() {
      return mockPrisma;
    }
  },
}));

// Keep the import graph off the database and the AWS SDK. The middleware under
// test is real -- that is the point of this file.
vi.mock('@send-backend/models', () => ({
  getUsedStorage: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItemName: vi.fn(),
}));
vi.mock('@send-backend/storage', () => ({ default: { del: vi.fn() } }));

import { getGroupMemberPermissions } from '../../middleware';

/**
 * `getGroupMemberPermissions` is the first middleware, with no gate before it,
 * on twelve `containers.ts` routes. It runs `requireAuth` with a sentinel
 * `next`, and `requireAuth` signals denial by *responding* rather than by
 * throwing. The old code then called `reject(res)` on that already-sent
 * response: `res.send` calls `setHeader`, Node throws ERR_HTTP_HEADERS_SENT,
 * and because this middleware is `async` Express 4 drops the rejection and the
 * process exits.
 *
 * Anonymous requests hit it, and so does any signed-in user whose access token
 * has expired -- `requireAuth` answers 401 there, which is equally a response.
 */
describe('getGroupMemberPermissions on an unauthenticated request', () => {
  const app = express();
  app.use(express.json());
  app.get('/:containerId/item', getGroupMemberPermissions, (_req, res) => {
    res.status(200).json({ message: 'reached the handler' });
  });

  let rejections: unknown[];
  const record = (reason: unknown) => rejections.push(reason);

  beforeEach(() => {
    vi.clearAllMocks();
    rejections = [];
    process.on('unhandledRejection', record);
  });

  const settle = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', record);
  };

  it('answers once and does not crash when no credentials are sent', async () => {
    const response = await request(app).get('/abc/item');
    await settle();

    // requireAuth's own message, not the bare 'Not authorized' that a second
    // reject() would have written over it.
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Not authorized: No valid authentication found',
    });
    expect(rejections).toEqual([]);
  });

  it('preserves the 401 the client auto-retries on, for an expired token', async () => {
    // A valid refresh token with a dead access token is the ordinary state of a
    // signed-in user mid-session, so this path is reached organically -- it is
    // not only an anonymous-attacker case.
    const jwt = await import('jsonwebtoken');
    process.env.ACCESS_TOKEN_SECRET = 'access-secret';
    process.env.REFRESH_TOKEN_SECRET = 'refresh-secret';
    const expired = jwt.default.sign({ id: 'u1' }, 'access-secret', {
      expiresIn: '-1s',
    });
    const refresh = jwt.default.sign({ id: 'u1' }, 'refresh-secret', {
      expiresIn: '7d',
    });

    const response = await request(app)
      .get('/abc/item')
      .set(
        'Cookie',
        `authorization=Bearer%20${expired};refresh_token=Bearer%20${refresh}`
      );
    await settle();

    // The old code overwrote this 401 with a generic 403 -- when it did not
    // crash first. The distinction matters: the client refreshes on 401.
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Not authorized: Token expired' });
    expect(rejections).toEqual([]);
  });
});
