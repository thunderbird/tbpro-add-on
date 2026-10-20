import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/users/publickey only stores an RSA public key JWK, sent as an object
// or as the JSON string the current client sends, and stores its JSON once.

const h = vi.hoisted(() => ({
  updateUserPublicKey: vi.fn(),
  getDataFromAuthenticatedRequest: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  ContainerType: { FOLDER: 'FOLDER', CONVERSATION: 'CONVERSATION' },
  PrismaClient: class {},
}));
vi.mock('../../models/users', () => ({
  getAllUserGroupContainers: vi.fn(),
  getBackup: vi.fn(),
  getFTUEStatus: vi.fn(),
  getUserById: vi.fn(),
  getUserPublicKey: vi.fn(),
  setBackup: vi.fn(),
  updateUserPublicKey: h.updateUserPublicKey,
  deleteUser: vi.fn(),
  getAllUsers: vi.fn(),
}));
vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: h.getDataFromAuthenticatedRequest,
}));
vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return { requireJWT: passthrough, requireAdminPermisions: passthrough };
});

import router from '../../routes/users';
import { CLIENT_JWK } from '../fixtures/publicKeyJwk';

const app = express();
app.use(express.json());
app.use('/api/users', router);

const post = (body: unknown) =>
  request(app)
    .post('/api/users/publickey')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));

describe('POST /api/users/publickey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getDataFromAuthenticatedRequest.mockReturnValue({ id: 'user-1' });
    h.updateUserPublicKey.mockImplementation(async (id, publicKey) => ({
      id,
      publicKey,
    }));
  });

  it('stores the current client payload byte-for-byte', async () => {
    const res = await post({ publicKey: CLIENT_JWK });

    expect(res.status).toBe(200);
    expect(h.updateUserPublicKey).toHaveBeenCalledWith('user-1', CLIENT_JWK);
    expect(res.body.update.publicKey).toBe(CLIENT_JWK);
  });

  it('accepts the JWK as an object and stores the same JSON', async () => {
    const res = await post({ publicKey: JSON.parse(CLIENT_JWK) });

    expect(res.status).toBe(200);
    expect(h.updateUserPublicKey).toHaveBeenCalledWith('user-1', CLIENT_JWK);
  });

  it('ignores extra body fields and drops non-public JWK members', async () => {
    const jwk = {
      ...JSON.parse(CLIENT_JWK),
      d: 'secret',
      p: 'x',
      constructor: 'x',
      toString: 'x',
    };
    const res = await post({ publicKey: jwk, avatar: 'ignored' });

    expect(res.status).toBe(200);
    expect(h.updateUserPublicKey).toHaveBeenCalledWith('user-1', CLIENT_JWK);
  });

  it.each([
    ['1', 1],
    ['true', true],
    ['null', null],
    ['[]', []],
    ['"x"', 'x'],
    ['"1" (JSON string of a number)', '1'],
    ['{kty:"EC"}', { kty: 'EC', crv: 'P-256', x: 'AA', y: 'AA' }],
    ['{kty:"EC"} as a string', '{"kty":"EC"}'],
    ['RSA without e', { kty: 'RSA', n: 'AQAB' }],
    ['non-base64url n', { kty: 'RSA', n: 'a+b/', e: 'AQAB' }],
    ['malformed n', { kty: 'RSA', n: 'A', e: 'AQAB' }],
    ['undersized n', { kty: 'RSA', n: 'AQAB', e: 'AQAB' }],
    ['zero e', { ...JSON.parse(CLIENT_JWK), e: 'AA' }],
    ['malformed e', { ...JSON.parse(CLIENT_JWK), e: 'A' }],
    [
      'n with a dangling character',
      { ...JSON.parse(CLIENT_JWK), n: JSON.parse(CLIENT_JWK).n + 'AAA' },
    ],
    ['missing', undefined],
  ])('rejects %s with 400', async (_label, publicKey) => {
    const res = await post({ publicKey });

    expect(res.status).toBe(400);
    expect(h.updateUserPublicKey).not.toHaveBeenCalled();
  });
});
