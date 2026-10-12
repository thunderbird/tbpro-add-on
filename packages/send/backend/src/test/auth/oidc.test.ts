import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_SWEEP_EVERY_N_INSERTS,
  getIntrospectionCacheSize,
  introspectToken,
  isAccessTokenRevoked,
} from '../../auth/oidc';

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

describe('introspection cache sweep (deterministic cadence, S2245)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc.test/introspect';
    process.env.OIDC_CLIENT_ID = 'client';
    process.env.OIDC_CLIENT_SECRET = 'secret';
  });

  it('drops expired entries every N inserts without consulting Math.random', async () => {
    const mathRandom = vi.spyOn(Math, 'random');
    // Each result's `exp` is already in the past, so every entry is expired
    // the moment it is cached and is eligible for the next sweep.
    mockedPost.mockResolvedValue({
      data: { active: true, exp: nowSec() - 1 },
    });

    // A still-valid entry must survive the sweep.
    const live = `opaque-live-${Date.now()}`;
    mockedPost.mockResolvedValueOnce({
      data: { active: true, exp: nowSec() + 300 },
    });
    await introspectToken(live);
    const before = getIntrospectionCacheSize();

    // Twice the cadence guarantees at least one sweep inside the loop, no
    // matter where the module-level counter stood when this test started.
    const inserts = 2 * CACHE_SWEEP_EVERY_N_INSERTS;
    for (let i = 0; i < inserts; i++) {
      await introspectToken(`opaque-sweep-${Date.now()}-${i}`);
    }

    // Without sweeping the cache would have grown by `inserts`; at most N-1
    // expired entries (those added after the last sweep) may remain.
    expect(getIntrospectionCacheSize()).toBeLessThanOrEqual(
      before + CACHE_SWEEP_EVERY_N_INSERTS - 1
    );
    // The live entry is still served from cache (no extra introspection call).
    const calls = mockedPost.mock.calls.length;
    await introspectToken(live);
    expect(mockedPost).toHaveBeenCalledTimes(calls);
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });
});
