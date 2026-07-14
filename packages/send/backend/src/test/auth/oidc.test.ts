import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAccessTokenRevoked } from '../../auth/oidc';

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
