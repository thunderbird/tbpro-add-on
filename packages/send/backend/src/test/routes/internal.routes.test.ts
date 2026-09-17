import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockedGetUsedStorage,
  mockedGetUserByOIDCSubject,
  mockedGetStorageLimitForTier,
} = vi.hoisted(() => ({
  mockedGetUsedStorage: vi.fn(),
  mockedGetUserByOIDCSubject: vi.fn(),
  mockedGetStorageLimitForTier: vi.fn(),
}));

// The route is exercised directly; auth and audit logging are covered by
// service-auth.test.ts, so requireServiceAuth is stubbed to a pass-through.
vi.mock('@send-backend/auth/service-auth', () => ({
  requireServiceAuth: () => (_req, _res, next) => next(),
}));

vi.mock('@send-backend/models', () => ({
  getUsedStorage: mockedGetUsedStorage,
}));

vi.mock('@send-backend/models/users', () => ({
  getUserByOIDCSubject: mockedGetUserByOIDCSubject,
}));

vi.mock('@send-backend/utils/storageLimits', () => ({
  getStorageLimitForTier: mockedGetStorageLimitForTier,
}));

import internalRouter from '../../routes/internal';

describe('GET /api/internal/users/:sub/storage', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/internal', internalRouter);
  });

  it('returns 404 for an unknown subject', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue(null);

    const res = await request(app).get('/api/internal/users/unknown/storage');

    expect(res.status).toBe(404);
    expect(mockedGetUsedStorage).not.toHaveBeenCalled();
  });

  it('returns { active, limit } in bytes for an unlimited (FREE) user', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-1',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 1234, expired: 0 });
    mockedGetStorageLimitForTier.mockReturnValue(60_000_000_000);

    const res = await request(app).get('/api/internal/users/free-sub/storage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: 1234, limit: 60_000_000_000 });
    // FREE tier is not limited storage.
    expect(mockedGetUsedStorage).toHaveBeenCalledWith('user-1', false);
  });

  it('returns { active, limit } for an EPHEMERAL user and counts only active storage', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-2',
      tier: 'EPHEMERAL',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 500, expired: 4000 });
    mockedGetStorageLimitForTier.mockReturnValue(5_000_000);

    const res = await request(app).get('/api/internal/users/eph-sub/storage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: 500, limit: 5_000_000 });
    // EPHEMERAL tier -> hasLimitedStorage true.
    expect(mockedGetUsedStorage).toHaveBeenCalledWith('user-2', true);
  });

  // Auditing belongs to requireServiceAuth (stubbed out here), so this only
  // pins the status the audit line will report; see service-auth.test.ts.
  it('surfaces a 500 when storage computation throws', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-4',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/internal/users/boom-sub/storage');

    expect(res.status).toBe(500);
  });

  it('responds with exactly { active, limit } and no extra fields', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-3',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 7, expired: 3 });
    mockedGetStorageLimitForTier.mockReturnValue(60_000_000_000);

    const res = await request(app).get('/api/internal/users/keys-sub/storage');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['active', 'limit']);
  });
});
