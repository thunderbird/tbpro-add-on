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

// The route is exercised directly; auth is covered by service-auth.test.ts, so
// requireServiceAuth is stubbed to a pass-through that attaches a caller label.
vi.mock('@send-backend/auth/service-auth', () => ({
  requireServiceAuth: () => (req, _res, next) => {
    req.serviceCaller = { label: 'accounts' };
    next();
  },
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
    // The global error handler is not mounted here; supertest still receives a
    // 500 from Express's default handler when the route rethrows.
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

  it('sets Cache-Control: no-store on a successful response', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-3',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 10, expired: 0 });
    mockedGetStorageLimitForTier.mockReturnValue(60_000_000_000);

    const res = await request(app).get('/api/internal/users/nc-sub/storage');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('responds with exactly { active, limit } and no extra fields', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-5',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 7, expired: 999 });
    mockedGetStorageLimitForTier.mockReturnValue(60_000_000_000);

    const res = await request(app).get('/api/internal/users/exact-sub/storage');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['active', 'limit']);
  });

  it('emits exactly one audit line with the caller label, subject, status and latency on success', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-6',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockResolvedValue({ active: 42, expired: 0 });
    mockedGetStorageLimitForTier.mockReturnValue(60_000_000_000);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await request(app).get('/api/internal/users/audit-sub/storage');

    const auditLines = infoSpy.mock.calls
      .map((call) => call[0])
      .filter(
        (line) =>
          typeof line === 'string' && line.includes('"internal_request"')
      );
    expect(auditLines).toHaveLength(1);
    const parsed = JSON.parse(auditLines[0] as string);
    expect(parsed).toMatchObject({
      msg: 'internal_request',
      route: 'GET /api/internal/users/:sub/storage',
      caller: 'accounts',
      sub: 'audit-sub',
      status: 200,
    });
    expect(typeof parsed.latencyMs).toBe('number');
    // The audit line never carries storage values.
    expect(parsed).not.toHaveProperty('active');
    expect(parsed).not.toHaveProperty('limit');
    infoSpy.mockRestore();
  });

  it('emits an audit line with status 404 for an unknown subject', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue(null);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await request(app).get('/api/internal/users/nobody/storage');

    const auditLine = infoSpy.mock.calls
      .map((call) => call[0])
      .find(
        (line) =>
          typeof line === 'string' && line.includes('"internal_request"')
      );
    expect(auditLine).toBeDefined();
    expect(JSON.parse(auditLine as string)).toMatchObject({
      caller: 'accounts',
      sub: 'nobody',
      status: 404,
    });
    infoSpy.mockRestore();
  });

  it('emits the audit line with status 500 when storage computation throws', async () => {
    mockedGetUserByOIDCSubject.mockResolvedValue({
      id: 'user-4',
      tier: 'FREE',
    });
    mockedGetUsedStorage.mockRejectedValue(new Error('db down'));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const res = await request(app).get('/api/internal/users/boom-sub/storage');

    expect(res.status).toBe(500);
    const auditLine = infoSpy.mock.calls
      .map((call) => call[0])
      .find(
        (line) =>
          typeof line === 'string' && line.includes('"internal_request"')
      );
    expect(auditLine).toBeDefined();
    expect(JSON.parse(auditLine as string)).toMatchObject({
      msg: 'internal_request',
      caller: 'accounts',
      sub: 'boom-sub',
      status: 500,
    });
    infoSpy.mockRestore();
  });
});
