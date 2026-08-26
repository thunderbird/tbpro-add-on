import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUploadBucketUrl, mockGetUsedStorage, mockCaller } = vi.hoisted(
  () => ({
    mockGetUploadBucketUrl: vi.fn(),
    mockGetUsedStorage: vi.fn(),
    mockCaller: vi.fn(),
  })
);

// Storage: only the presigned-url call matters here.
vi.mock('@send-backend/storage', () => ({
  default: { getUploadBucketUrl: mockGetUploadBucketUrl, del: vi.fn() },
}));

// checkStorageLimit imports getUsedStorage from ./models (the models barrel).
vi.mock('@send-backend/models', () => ({
  reportUpload: vi.fn(),
  deleteUploadsByIds: vi.fn(),
  getUsedStorage: mockGetUsedStorage,
}));
vi.mock('../../models', () => ({
  reportUpload: vi.fn(),
  deleteUploadsByIds: vi.fn(),
  getUsedStorage: mockGetUsedStorage,
}));

// checkStorageLimit is the real middleware — it reads req.body.size and the
// caller's tier/usage. Stub only its data dependencies so the quota math runs
// against known numbers.
vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: mockCaller,
}));

// requireJWT is a pass-through; checkStorageLimit stays real so the quota gate
// is exercised end to end.
vi.mock('../../middleware', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const passthrough = (_req, _res, next) => next();
  return {
    ...actual,
    requireJWT: passthrough,
    getGroupMemberPermissions: passthrough,
    requireWritePermission: passthrough,
  };
});

import router from '../../routes/uploads';
import { errorHandler } from '../../errors/routes';

const app = express();
app.use(express.json());
app.use('/api/uploads', router);
app.use((err, req, res, _next) => errorHandler(err, req, res));

describe('POST /api/uploads/signed (quota bypass, private #36)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A generous tier so the quota gate only trips on the values we choose.
    mockCaller.mockReturnValue({ id: 'user-1', tier: 'PRO', uniqueHash: 'h' });
    mockGetUsedStorage.mockResolvedValue({ active: 0 });
    mockGetUploadBucketUrl.mockResolvedValue('https://bucket/signed-url');
  });

  it('rejects a request with no size (the old bypass) with 400', async () => {
    const res = await request(app)
      .post('/api/uploads/signed')
      .send({ type: 'application/octet-stream' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    // No URL is minted for an unsized request.
    expect(mockGetUploadBucketUrl).not.toHaveBeenCalled();
  });

  it('rejects size: 0 with 400', async () => {
    const res = await request(app)
      .post('/api/uploads/signed')
      .send({ type: 'application/octet-stream', size: 0 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(mockGetUploadBucketUrl).not.toHaveBeenCalled();
  });

  it('signs the encrypted content-length, not the plaintext claim', async () => {
    const plaintext = 1024;
    const res = await request(app)
      .post('/api/uploads/signed')
      .send({ type: 'application/octet-stream', size: plaintext })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ url: 'https://bucket/signed-url' });
    // Third arg is the signed content-length; it must be the ciphertext size
    // (strictly larger than the plaintext claim), never the raw plaintext.
    const [, , contentLength] = mockGetUploadBucketUrl.mock.calls[0];
    expect(contentLength).toBeGreaterThan(plaintext);
  });

  it('still enforces the quota against the stated size', async () => {
    // Usage already at the tier ceiling: any positive size trips the gate.
    mockGetUsedStorage.mockResolvedValue({ active: Number.MAX_SAFE_INTEGER });

    const res = await request(app)
      .post('/api/uploads/signed')
      .send({ type: 'application/octet-stream', size: 1024 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(403);
    expect(mockGetUploadBucketUrl).not.toHaveBeenCalled();
  });
});
