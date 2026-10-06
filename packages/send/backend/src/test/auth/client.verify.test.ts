/**
 * Uses the real jsonwebtoken module (client.test.ts mocks it) to prove that
 * the identity read from the `authorization` cookie is signature-checked, so a
 * forged cookie cannot name another user.
 */
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  getDataFromAuthenticatedRequest,
  getUserFromJWT,
} from '../../auth/client';

const payload = {
  id: 'user-1',
  email: 'user@example.com',
  uniqueHash: 'hash-1',
  tier: 'PRO',
};

const b64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

// An `alg: none` token claiming to be another user, with an empty signature.
const unsignedAsVictim = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
  ...payload,
  id: 'victim',
})}.`;

describe('getUserFromJWT verifies signatures', () => {
  beforeAll(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  it('returns the payload of a token signed with the access secret', () => {
    const token = jwt.sign(payload, 'access-secret');

    expect(getUserFromJWT(token)).toMatchObject(payload);
  });

  it('verifies a refresh token against the refresh secret when asked', () => {
    const token = jwt.sign(payload, 'refresh-secret');

    expect(
      getUserFromJWT(token, process.env.REFRESH_TOKEN_SECRET)
    ).toMatchObject(payload);
    expect(() => getUserFromJWT(token)).toThrow();
  });

  it('rejects an unsigned token', () => {
    expect(() => getUserFromJWT(unsignedAsVictim)).toThrow();
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ ...payload, id: 'victim' }, 'not-the-secret');

    expect(() => getUserFromJWT(forged)).toThrow();
  });

  it('rejects a token whose payload was changed after signing', () => {
    const [header, , signature] = jwt.sign(payload, 'access-secret').split('.');
    const tampered = `${header}.${b64url({ ...payload, id: 'victim' })}.${signature}`;

    expect(() => getUserFromJWT(tampered)).toThrow();
  });
});

describe('getDataFromAuthenticatedRequest verifies the cookie', () => {
  beforeAll(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
  });

  it('returns the identity from a genuinely signed cookie', () => {
    const token = jwt.sign(payload, 'access-secret');
    const req = { headers: { cookie: `authorization=Bearer%20${token}` } };

    //@ts-ignore
    expect(getDataFromAuthenticatedRequest(req)).toMatchObject(payload);
  });

  it('rejects a forged cookie instead of returning its claimed identity', () => {
    const req = {
      headers: { cookie: `authorization=Bearer%20${unsignedAsVictim}` },
    };

    //@ts-ignore
    expect(() => getDataFromAuthenticatedRequest(req)).toThrow();
  });
});
