import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /uploads finalizes a presigned upload: its reservation is left out of
// the quota check (the Upload row replaces it) and cleared on success.
// POST /reconcile runs the orphan cleanup on demand.

const h = vi.hoisted(() => ({
  createUpload: vi.fn(),
  getUsedStorage: vi.fn(),
  clearPendingUploads: vi.fn(),
  holdPendingUpload: vi.fn(),
  runOrphanCleanup: vi.fn(),
  caller: vi.fn(),
}));

vi.mock('../../models/uploads', () => ({ createUpload: h.createUpload }));
vi.mock('@send-backend/models', () => ({
  deleteUploadsByIds: vi.fn(),
  reportUpload: vi.fn(),
  getUsedStorage: h.getUsedStorage,
}));
vi.mock('../../models', () => ({
  deleteUploadsByIds: vi.fn(),
  reportUpload: vi.fn(),
  getUsedStorage: h.getUsedStorage,
}));
vi.mock('@send-backend/models/pendingUploads', () => ({
  reservePendingUpload: vi.fn(),
  clearPendingUploads: h.clearPendingUploads,
  holdPendingUpload: h.holdPendingUpload,
}));
vi.mock('@send-backend/jobs/orphanCleanup', () => ({
  runOrphanCleanup: h.runOrphanCleanup,
}));
vi.mock('@send-backend/storage', () => ({
  default: { getUploadBucketUrl: vi.fn(), del: vi.fn() },
}));
vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: h.caller,
}));
vi.mock('../../metrics', () => ({
  useMetrics: () => ({ capture: vi.fn(), shutdown: vi.fn() }),
}));

// checkStorageLimit stays real so the reservation exclusion is exercised.
vi.mock('../../middleware', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const passthrough = (_req, _res, next) => next();
  return {
    ...actual,
    requireJWT: passthrough,
    getGroupMemberPermissions: passthrough,
    requireWritePermission: passthrough,
    requireAdminPermisions: passthrough,
  };
});

import router from '../../routes/uploads';
import { errorHandler } from '../../errors/routes';

const app = express();
app.use(express.json());
app.use('/api/uploads', router);
app.use((err, req, res, _next) => errorHandler(err, req, res));

const ID = '11111111-2222-4333-8444-555555555555';
const BODY = {
  id: ID,
  size: 1024,
  ownerId: 'user-1',
  type: 'application/octet-stream',
  fileHash: 'hash',
};

describe('POST /api/uploads (finalize)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.caller.mockReturnValue({ id: 'user-1', tier: 'PRO', uniqueHash: 'h' });
    h.getUsedStorage.mockResolvedValue({ active: 0 });
    h.createUpload.mockResolvedValue({ id: ID });
    h.clearPendingUploads.mockResolvedValue({ count: 1 });
    h.holdPendingUpload.mockResolvedValue(true);
  });

  it('holds the reservation before checking the stored object', async () => {
    await request(app).post('/api/uploads').send(BODY);

    expect(h.holdPendingUpload).toHaveBeenCalledWith(ID);
    expect(h.holdPendingUpload.mock.invocationCallOrder[0]).toBeLessThan(
      h.createUpload.mock.invocationCallOrder[0]
    );
  });

  it('answers 409 when cleanup already claimed the upload', async () => {
    h.holdPendingUpload.mockResolvedValue(false);

    const res = await request(app).post('/api/uploads').send(BODY);

    expect(res.status).toBe(409);
    expect(h.createUpload).not.toHaveBeenCalled();
  });

  it('leaves the upload own reservation out of the quota check', async () => {
    const res = await request(app).post('/api/uploads').send(BODY);

    expect(res.status).toBe(201);
    expect(h.getUsedStorage).toHaveBeenCalledWith('user-1', false, ID);
  });

  it('clears the reservation once the Upload row exists', async () => {
    await request(app).post('/api/uploads').send(BODY);

    expect(h.clearPendingUploads).toHaveBeenCalledWith('user-1', [ID]);
  });

  it('keeps the reservation when finalizing fails', async () => {
    h.createUpload.mockRejectedValue(new Error('size mismatch'));

    const res = await request(app).post('/api/uploads').send(BODY);

    expect(res.status).toBe(500);
    expect(h.clearPendingUploads).not.toHaveBeenCalled();
  });

  it('still answers 201 when clearing the reservation fails', async () => {
    h.clearPendingUploads.mockRejectedValue(new Error('db down'));

    const res = await request(app).post('/api/uploads').send(BODY);

    expect(res.status).toBe(201);
  });

  it('ignores a non-uuid id for the quota exclusion', async () => {
    await request(app)
      .post('/api/uploads')
      .send({ ...BODY, id: 'not-a-uuid' });

    expect(h.getUsedStorage).toHaveBeenCalledWith('user-1', false, undefined);
  });
});

describe('POST /api/uploads/reconcile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs the orphan cleanup and returns its result', async () => {
    const result = {
      orphans: { deletedUploadIds: ['a'], errorUploadIds: [] },
      pending: { deletedIds: ['b'], errorIds: [] },
    };
    h.runOrphanCleanup.mockResolvedValue(result);

    const res = await request(app).post('/api/uploads/reconcile');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it('answers 500 when the cleanup throws', async () => {
    h.runOrphanCleanup.mockRejectedValue(new Error('db down'));

    const res = await request(app).post('/api/uploads/reconcile');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Could not clean up orphaned uploads.');
  });
});
