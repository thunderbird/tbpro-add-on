import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeleteUploadsByIds, mockAuthenticatedRequest } = vi.hoisted(() => ({
  mockDeleteUploadsByIds: vi.fn(),
  mockAuthenticatedRequest: vi.fn(),
}));

// The route only needs deleteUploadsByIds; stub the rest of the barrel so the
// import resolves without a database.
vi.mock('@send-backend/models', () => ({
  deleteUploadsByIds: mockDeleteUploadsByIds,
  reportUpload: vi.fn(),
}));

// Avoid the real storage client (Backblaze token timer + AWS SDK) at import.
vi.mock('@send-backend/storage', () => ({
  default: { del: vi.fn() },
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: mockAuthenticatedRequest,
}));

// All middleware becomes a pass-through so we exercise the handler directly.
vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    requireJWT: passthrough,
    checkStorageLimit: passthrough,
    getGroupMemberPermissions: passthrough,
    requireWritePermission: passthrough,
  };
});

// vi.mock() calls above are hoisted above imports, so this router picks up the
// stubs. (Static import instead of top-level `await import` to keep tsc happy.)
import router from '../../routes/uploads';

const app = express();
app.use(express.json());
app.use('/api/uploads', router);

describe('POST /api/uploads/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedRequest.mockReturnValue({ id: 'user-1' });
  });

  it('deletes the given uploads on behalf of the authenticated user', async () => {
    mockDeleteUploadsByIds.mockResolvedValue({
      deleted: ['a', 'b'],
      skipped: [],
      errors: [],
    });

    const response = await request(app)
      .post('/api/uploads/cleanup')
      .send({ ids: ['a', 'b'] })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(mockDeleteUploadsByIds).toHaveBeenCalledWith(['a', 'b'], 'user-1');
    expect(response.body).toMatchObject({
      message: 'Cleanup complete',
      deleted: ['a', 'b'],
    });
  });

  it('rejects an empty id list with 400 and does not touch storage', async () => {
    const response = await request(app)
      .post('/api/uploads/cleanup')
      .send({ ids: [] })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(400);
    expect(mockDeleteUploadsByIds).not.toHaveBeenCalled();
  });

  it('rejects a missing ids field with 400', async () => {
    const response = await request(app)
      .post('/api/uploads/cleanup')
      .send({})
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(400);
    expect(mockDeleteUploadsByIds).not.toHaveBeenCalled();
  });

  it('returns 500 when cleanup throws', async () => {
    mockDeleteUploadsByIds.mockRejectedValue(new Error('db down'));

    const response = await request(app)
      .post('/api/uploads/cleanup')
      .send({ ids: ['a'] })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(500);
  });
});
