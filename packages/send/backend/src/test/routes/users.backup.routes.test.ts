import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Key backup v2, REST layer: GET /api/users/backup returns the shape matching
// the user's backupVersion, and POST /api/users/backup (the legacy write) is
// refused with 409 BACKUP_FORMAT_SUPERSEDED once the user is on v2.

const h = vi.hoisted(() => ({
  getBackup: vi.fn(),
  setBackup: vi.fn(),
  getBackupVersion: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  ContainerType: { FOLDER: 'FOLDER', CONVERSATION: 'CONVERSATION' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
  PrismaClient: vi.fn(function () {
    return {
      user: {
        findUnique: (args) =>
          args.select?.backupContainerKeys
            ? h.getBackup(args)
            : h.getBackupVersion(args),
        update: h.setBackup,
      },
    };
  }),
  Prisma: {},
}));

vi.mock('@send-backend/auth/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@send-backend/auth/client')>()),
  getDataFromAuthenticatedRequest: () => ({ id: 'user-1' }),
}));

vi.mock('../../middleware', () => ({
  requireJWT: (_req, _res, next) => next(),
  requireAdminPermisions: (_req, _res, next) => next(),
}));

import router from '../../routes/users';

const app = express();
app.use(express.json());
app.use('/api/users', router);

const legacy = {
  backupContainerKeys: 'ck',
  backupKeypair: 'kp',
  backupKeystring: 'ks',
  backupSalt: 'salt',
};
const legacyBody = { keys: 'ck', keypair: 'kp', keystring: 'ks', salt: 'salt' };

describe('GET /api/users/backup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the legacy fields unchanged for a v1 user', async () => {
    h.getBackup.mockResolvedValue({
      ...legacy,
      backup: null,
      backupVersion: 1,
    });

    const res = await request(app).get('/api/users/backup');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(legacy);
  });

  it('returns only the v2 envelope for a v2 user', async () => {
    h.getBackup.mockResolvedValue({
      backupContainerKeys: null,
      backupKeypair: null,
      backupKeystring: null,
      backupSalt: null,
      backup: '{"v":2}',
      backupVersion: 2,
    });

    const res = await request(app).get('/api/users/backup');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ backupVersion: 2, backup: '{"v":2}' });
  });
});

describe('POST /api/users/backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.setBackup.mockResolvedValue({});
  });

  it('writes the legacy backup for a v1 user', async () => {
    h.getBackupVersion.mockResolvedValue({ backupVersion: 1 });

    const res = await request(app).post('/api/users/backup').send(legacyBody);

    expect(res.status).toBe(200);
    expect(h.setBackup).toHaveBeenCalledTimes(1);
    expect(h.setBackup.mock.calls[0][0].where).toEqual({
      id: 'user-1',
      backupVersion: { lt: 2 },
    });
  });

  it('refuses with 409 BACKUP_FORMAT_SUPERSEDED for a v2 user', async () => {
    h.getBackupVersion.mockResolvedValue({ backupVersion: 2 });

    const res = await request(app).post('/api/users/backup').send(legacyBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BACKUP_FORMAT_SUPERSEDED');
    expect(h.setBackup).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'legacy key backup write rejected',
      expect.stringContaining('POST /api/users/backup')
    );
  });
});
