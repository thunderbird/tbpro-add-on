import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUsedStorage, mockGetDataFromAuthenticatedRequest } = vi.hoisted(
  () => ({
    mockGetUsedStorage: vi.fn(),
    mockGetDataFromAuthenticatedRequest: vi.fn(),
  })
);

// The route only needs getUsedStorage; stub the rest of the barrel so the
// import resolves without a database.
vi.mock('@send-backend/models', () => ({
  getUsedStorage: mockGetUsedStorage,
  deleteUploadsByIds: vi.fn(),
  reportUpload: vi.fn(),
}));

// Avoid the real storage client (Backblaze token timer + AWS SDK) at import.
vi.mock('@send-backend/storage', () => ({
  default: { del: vi.fn() },
}));

vi.mock('@send-backend/auth/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@send-backend/auth/client')>()),
  getDataFromAuthenticatedRequest: mockGetDataFromAuthenticatedRequest,
}));

// Deliberately NOT mocking '../../middleware'. Pass-through mocks return 200
// for either middleware order, so they cannot see the bug this file exists for.
import router from '../../routes/uploads';

const app = express();
app.use(express.json());
app.use('/api/uploads', router);

/**
 * `GET /api/uploads/can-upload` ran `checkStorageLimit` before `requireJWT`
 * (private#43). `checkStorageLimit` reads the caller off the request, which
 * throws when there is no `authorization` cookie -- and because it is `async`,
 * Express 4 drops the rejection rather than catching it, so Node terminated the
 * process. One anonymous GET, no account, one dead replica.
 */
describe('GET /api/uploads/can-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDataFromAuthenticatedRequest.mockImplementation(() => {
      throw new Error(
        'No token found in request: This should not happen if the user is authenticated'
      );
    });
  });

  it('refuses an unauthenticated caller without reaching the storage read', async () => {
    const rejections: unknown[] = [];
    const record = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', record);

    try {
      const response = await request(app).get('/api/uploads/can-upload');

      // 403 is what `requireJWT` returns for a missing token; it reserves 401
      // for a token that expired but can still be refreshed.
      expect(response.status).toBe(403);

      // The assertion that pins the ordering. Both orders now answer 403 --
      // `checkStorageLimit` fails closed too -- so only the body says which
      // middleware got there first. This one is `requireJWT`'s; running
      // `checkStorageLimit` first yields the bare 'Not authorized' from
      // `reject()`. `error` is read by the add-on's blocked-cookie check
      // (send/frontend/src/lib/cookieAccess.ts), so it is pinned here too.
      expect(response.body).toEqual({
        message: 'Not authorized: Token not found',
        error: 'token_not_found',
      });

      // And the storage read stays out of reach of an anonymous caller.
      expect(mockGetUsedStorage).not.toHaveBeenCalled();

      // Give a rejection a tick to surface before we stop listening.
      await new Promise((resolve) => setImmediate(resolve));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });
});
