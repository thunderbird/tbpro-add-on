import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAccessTokenRevoked, validateOIDCToken } from '../../auth/oidc';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

const mockedPost = vi.mocked(axios.post);

// Build a JWT-shaped token with a given `exp` (seconds) so decodeTokenExp can
// read it. Signature is irrelevant — the exp is decoded, not verified.
function tokenWithExp(expSeconds: number, salt = 'a'): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: expSeconds, salt })
  ).toString('base64url');
  return `header.${payload}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('isAccessTokenRevoked (#960 exp-gated introspection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc.test/introspect';
    process.env.OIDC_CLIENT_ID = 'client';
    process.env.OIDC_CLIENT_SECRET = 'secret';
  });

  it('returns false for an EXPIRED token without introspecting (refresh flow owns it)', async () => {
    const token = tokenWithExp(nowSec() - 60, 'expired');

    const revoked = await isAccessTokenRevoked(token);

    expect(revoked).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('returns true when a still-valid token is reported inactive (revoked session)', async () => {
    mockedPost.mockResolvedValue({ data: { active: false } });
    const token = tokenWithExp(nowSec() + 300, 'revoked');

    const revoked = await isAccessTokenRevoked(token);

    expect(revoked).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('returns false when a still-valid token is active', async () => {
    mockedPost.mockResolvedValue({ data: { active: true } });
    const token = tokenWithExp(nowSec() + 300, 'active');

    expect(await isAccessTokenRevoked(token)).toBe(false);
  });

  it('fails open (false) when introspection errors', async () => {
    mockedPost.mockRejectedValue(new Error('keycloak down'));
    const token = tokenWithExp(nowSec() + 300, 'error');

    expect(await isAccessTokenRevoked(token)).toBe(false);
  });
});

describe('validateOIDCToken client allowlist (OIDC_ALLOWED_CLIENT_IDS)', () => {
  // introspectToken caches by token string, so every case uses its own token.
  let n = 0;
  const freshToken = () => tokenWithExp(nowSec() + 300, `allowlist-${n++}`);

  const introspect = (fields: Record<string, unknown>) =>
    mockedPost.mockResolvedValue({
      data: { active: true, sub: 'sub-1', ...fields },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc.test/introspect';
    process.env.OIDC_CLIENT_ID = 'send-backend';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    delete process.env.OIDC_ALLOWED_CLIENT_IDS;
  });

  it('accepts a token from any client when the allowlist is unset', async () => {
    introspect({ client_id: 'some-other-app' });

    const result = await validateOIDCToken(freshToken());

    expect(result.isValid).toBe(true);
    expect(result.userInfo?.sub).toBe('sub-1');
  });

  it('treats a blank allowlist as unset', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = '  ';
    introspect({ client_id: 'some-other-app' });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('accepts a token whose client_id is allowed', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-frontend,tbpro-addon';
    introspect({ client_id: 'tbpro-addon' });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('accepts a token whose azp is allowed', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-frontend';
    introspect({ azp: 'send-frontend' });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('accepts a token whose aud includes an allowed client', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-backend';
    introspect({
      client_id: 'send-frontend',
      aud: ['account', 'send-backend'],
    });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('accepts a string aud that is an allowed client', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-backend';
    introspect({ aud: 'send-backend' });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('ignores whitespace and empty entries in the allowlist', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = ' send-frontend , ,tbpro-addon, ';
    introspect({ client_id: 'send-frontend' });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(true);
  });

  it('rejects an active token issued to a client that is not allowed', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-frontend,tbpro-addon';
    introspect({ client_id: 'appointment-frontend', aud: ['account'] });

    const result = await validateOIDCToken(freshToken());

    expect(result.isValid).toBe(false);
    expect(result.userInfo).toBeUndefined();
  });

  it('rejects an active token that names no client at all', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-frontend';
    introspect({});

    expect((await validateOIDCToken(freshToken())).isValid).toBe(false);
  });

  it('does not let an allowed client_id rescue an inactive token', async () => {
    process.env.OIDC_ALLOWED_CLIENT_IDS = 'send-frontend';
    mockedPost.mockResolvedValue({
      data: { active: false, client_id: 'send-frontend' },
    });

    expect((await validateOIDCToken(freshToken())).isValid).toBe(false);
  });
});
