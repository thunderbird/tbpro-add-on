/**
 * Uses the real jsonwebtoken module (client.test.ts mocks it) to prove that
 * the identity read from the `authorization` cookie is signature-checked, so a
 * forged cookie cannot name another user, and that the cookie tokens expire on
 * the configured schedule.
 */
import {
  JWT_EXPIRY_IN_SECONDS,
  JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
} from '@send-backend/config';
import jwt from 'jsonwebtoken';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  getDataFromAuthenticatedRequest,
  getUserFromJWT,
  registerAuthToken,
  registerTokens,
  verifyCookieToken,
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

    expect(getUserFromJWT(token, 'refresh')).toMatchObject(payload);
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

// Reads the token back out of the `res.cookie` call the register helpers make.
function issuedTokens() {
  const res = { cookie: vi.fn() };
  //@ts-ignore
  registerTokens(payload, res);
  const byName = Object.fromEntries(
    res.cookie.mock.calls.map(([name, value]) => [
      name,
      String(value).replace(/^Bearer /, ''),
    ])
  );
  return { access: byName.authorization, refresh: byName.refresh_token };
}

describe('cookie tokens expire on schedule', () => {
  const issuedAt = new Date('2026-01-01T00:00:00Z');

  beforeAll(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs exp and iat in seconds, one lifetime apart', () => {
    vi.useFakeTimers({ now: issuedAt });
    const { access, refresh } = issuedTokens();
    const nowSeconds = Math.floor(issuedAt.getTime() / 1000);

    expect(jwt.decode(access)).toMatchObject({
      ...payload,
      iat: nowSeconds,
      exp: nowSeconds + JWT_EXPIRY_IN_SECONDS,
    });
    expect(jwt.decode(refresh)).toMatchObject({
      ...payload,
      iat: nowSeconds,
      exp: nowSeconds + JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
    });
  });

  it('accepts the access token within its lifetime and rejects it after', () => {
    vi.useFakeTimers({ now: issuedAt });
    const { access } = issuedTokens();

    vi.setSystemTime(issuedAt.getTime() + (JWT_EXPIRY_IN_SECONDS - 1) * 1000);
    expect(verifyCookieToken(access, 'access')).toMatchObject(payload);

    vi.setSystemTime(issuedAt.getTime() + (JWT_EXPIRY_IN_SECONDS + 1) * 1000);
    expect(() => verifyCookieToken(access, 'access')).toThrow(
      jwt.TokenExpiredError
    );
  });

  it('accepts the refresh token within its lifetime and rejects it after', () => {
    vi.useFakeTimers({ now: issuedAt });
    const { refresh } = issuedTokens();

    vi.setSystemTime(
      issuedAt.getTime() + (JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS - 1) * 1000
    );
    expect(verifyCookieToken(refresh, 'refresh')).toMatchObject(payload);

    vi.setSystemTime(
      issuedAt.getTime() + (JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS + 1) * 1000
    );
    expect(() => verifyCookieToken(refresh, 'refresh')).toThrow(
      jwt.TokenExpiredError
    );
  });

  it('rejects a token whose exp claim is far in the future once it is older than its lifetime', () => {
    // Shape of tokens issued before this change: `exp` set by the caller as
    // epoch milliseconds, which jsonwebtoken reads as seconds (~year 58,000);
    // `iat` was still stamped in seconds.
    vi.useFakeTimers({ now: issuedAt });
    const legacyAccess = jwt.sign(
      { ...payload, exp: issuedAt.getTime() + JWT_EXPIRY_IN_SECONDS * 1000 },
      'access-secret'
    );
    const legacyRefresh = jwt.sign(
      {
        ...payload,
        exp: issuedAt.getTime() + JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS * 1000,
      },
      'refresh-secret'
    );

    vi.setSystemTime(issuedAt.getTime() + (JWT_EXPIRY_IN_SECONDS - 1) * 1000);
    expect(verifyCookieToken(legacyAccess, 'access')).toMatchObject(payload);

    vi.setSystemTime(issuedAt.getTime() + (JWT_EXPIRY_IN_SECONDS + 1) * 1000);
    expect(() => verifyCookieToken(legacyAccess, 'access')).toThrow(
      /maxAge exceeded/
    );

    vi.setSystemTime(
      issuedAt.getTime() + (JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS + 1) * 1000
    );
    expect(() => verifyCookieToken(legacyRefresh, 'refresh')).toThrow(
      /maxAge exceeded/
    );
  });

  it('re-signing from a verified refresh payload issues a fresh lifetime', () => {
    // /auth/refresh passes the verified refresh-token payload (incl. its
    // exp/iat) straight to registerAuthToken.
    vi.useFakeTimers({ now: issuedAt });
    const { refresh } = issuedTokens();

    const later = issuedAt.getTime() + 2 * JWT_EXPIRY_IN_SECONDS * 1000;
    vi.setSystemTime(later);
    const res = { cookie: vi.fn() };
    //@ts-ignore
    registerAuthToken(verifyCookieToken(refresh, 'refresh'), res);
    const access = String(res.cookie.mock.calls[0][1]).replace(/^Bearer /, '');

    const laterSeconds = Math.floor(later / 1000);
    expect(jwt.decode(access)).toMatchObject({
      ...payload,
      iat: laterSeconds,
      exp: laterSeconds + JWT_EXPIRY_IN_SECONDS,
    });
    expect(verifyCookieToken(access, 'access')).toMatchObject(payload);
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
