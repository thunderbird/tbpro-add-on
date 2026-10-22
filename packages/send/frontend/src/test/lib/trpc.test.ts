import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithLogoutCheck } from '@send-frontend/lib/trpc';

const { mockGetAccessToken, mockRecover } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
  mockRecover: vi.fn(async () => false),
}));
vi.mock('@send-frontend/stores/auth-store', () => ({
  useAuthStore: () => ({
    getAccessToken: mockGetAccessToken,
    recoverOrForceLogout: mockRecover,
  }),
}));

describe('fetchWithLogoutCheck (#960)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('attaches the OIDC access token and cookies when no Authorization is set', async () => {
    mockGetAccessToken.mockResolvedValue('tok123');
    let init: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, opts) => {
        init = opts;
        return Promise.resolve({
          headers: { get: () => null },
        } as unknown as Response);
      })
    );

    await fetchWithLogoutCheck('https://x/trpc', {});

    expect((init?.headers as Headers).get('Authorization')).toBe(
      'Bearer tok123'
    );
    expect(init?.credentials).toBe('include');
  });

  it('does not override an Authorization header the caller already set', async () => {
    mockGetAccessToken.mockResolvedValue('tok123');
    let init: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, opts) => {
        init = opts;
        return Promise.resolve({
          headers: { get: () => null },
        } as unknown as Response);
      })
    );

    await fetchWithLogoutCheck('https://x/trpc', {
      headers: { Authorization: 'Bearer existing' },
    });

    expect((init?.headers as Headers).get('Authorization')).toBe(
      'Bearer existing'
    );
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it('recovers (no retry) and returns the original response when recovery fails', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockRecover.mockResolvedValue(false);
    const original = {
      headers: { get: (k: string) => (k === 'x-logout' ? '1' : null) },
    } as unknown as Response;
    const fetchFn = vi.fn(() => Promise.resolve(original));
    vi.stubGlobal('fetch', fetchFn);

    const res = await fetchWithLogoutCheck('https://x/trpc', {});

    expect(mockRecover).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1); // no retry
    expect(res).toBe(original);
  });

  it('retries once with a refreshed token when recovery succeeds', async () => {
    mockRecover.mockResolvedValue(true);
    // First call: initial request has no token; retry: getAccessToken yields one.
    mockGetAccessToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('fresh');

    const inits: RequestInit[] = [];
    let call = 0;
    const fetchFn = vi.fn((_url, opts) => {
      inits.push(opts);
      call += 1;
      return Promise.resolve({
        headers: {
          get: (k: string) => (call === 1 && k === 'x-logout' ? '1' : null),
        },
      } as unknown as Response);
    });
    vi.stubGlobal('fetch', fetchFn);

    await fetchWithLogoutCheck('https://x/trpc', {});

    expect(mockRecover).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2); // retried once
    expect((inits[1].headers as Headers).get('Authorization')).toBe(
      'Bearer fresh'
    );
  });
});
