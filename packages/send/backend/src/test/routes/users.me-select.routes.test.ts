// The current-user routes send the caller's own row to the client; only
// profile fields may leave the server, never credentials or key backups (#1340).
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const fullRow = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    thundermailEmail: 'user@tb.pro',
    tier: 'PRO',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    activatedAt: new Date('2026-01-01'),
    uniqueHash: 'hash',
    hashedPassword: 'secret-hash',
    oidcSubject: 'oidc-sub',
    publicKey: 'public-key',
    backupKeypair: 'backup-keypair',
    backupContainerKeys: 'backup-container-keys',
    backupKeystring: 'backup-keystring',
    backupSalt: 'backup-salt',
    isFTUEComplete: true,
    isAdmin: true,
  };
  // Behaves like Prisma: no `select` returns every scalar column.
  const findUnique = vi.fn(
    async ({ select }: { select?: Record<string, boolean> }) =>
      select
        ? Object.fromEntries(
            Object.keys(select).map((key) => [key, fullRow[key]])
          )
        : fullRow
  );
  return { fullRow, prisma: { user: { findUnique } } };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

vi.mock('../../middleware', () => ({
  requireJWT: (_req, _res, next) => next(),
  requireAdminPermisions: (_req, _res, next) => next(),
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: () => ({ id: 'user-1' }),
}));

import router from '../../routes/users';

const app = express();
app.use(express.json());
app.use('/api/users', router);

const SECRET_FIELDS = [
  'hashedPassword',
  'backupKeypair',
  'backupContainerKeys',
  'backupKeystring',
  'backupSalt',
  'publicKey',
  'oidcSubject',
];

describe('current-user routes return only profile fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/users/me', async () => {
    const response = await request(app).get('/api/users/me');

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(h.fullRow.id);
    for (const field of SECRET_FIELDS) {
      expect(response.body.user).not.toHaveProperty(field);
    }
  });

  it('POST /api/users/login', async () => {
    const response = await request(app)
      .post('/api/users/login')
      .send({ email: h.fullRow.email });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(h.fullRow.id);
    for (const field of SECRET_FIELDS) {
      expect(response.body).not.toHaveProperty(field);
    }
  });

  it('GET /api/users/is-admin still reports admin status', async () => {
    const response = await request(app).get('/api/users/is-admin');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ isAdmin: true });
  });
});
