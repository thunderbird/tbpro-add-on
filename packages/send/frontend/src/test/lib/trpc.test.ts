import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectTesting,
  fetchWithLogoutCheck,
  getWsClientConfig,
} from '@send-frontend/lib/trpc';
import { TRPC_WS_PATH } from '@send-frontend/lib/config';

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

/**
 * Regression guard for Bug 2036665.
 *
 * The built-in/system add-on background page imports the trpc module on every
 * Thunderbird launch. The WebSocket client must never open a connection as a
 * side effect of module load, otherwise a fresh, logged-out profile reaches the
 * network at startup and crashes under automation. These tests pin the two
 * guarantees that prevent that:
 *   1. an unconfigured (empty) backend URL means "do not connect", and
 *   2. when configured, the client is created in lazy mode so the socket only
 *      opens on first subscription, not at construction.
 */
describe('getWsClientConfig', () => {
  it('returns null (no connection) when testing', () => {
    expect(getWsClientConfig('https://send-backend.tb.pro', true)).toBeNull();
  });

  it('returns null (no connection) when the backend URL is empty', () => {
    expect(getWsClientConfig('', false)).toBeNull();
  });

  it('enables lazy mode when a backend URL is configured', () => {
    const config = getWsClientConfig('https://send-backend.tb.pro', false);

    expect(config).not.toBeNull();
    expect(config?.url).toBe(`https://send-backend.tb.pro${TRPC_WS_PATH}`);
    expect(config?.lazy?.enabled).toBe(true);
  });
});

describe('detectTesting', () => {
  // Under vitest, Vite injects VITE_TESTING='true', so detection reports a test
  // context (and the WebSocket stays closed). In the shipped bundle the flag is
  // absent and detection falls back to the WebExtension `browser.test` API.
  it('reports a test context when VITE_TESTING is set', () => {
    expect(detectTesting()).toBe(true);
  });
});

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
    mockGetAccessToken.mockResolvedValueOnce(null).mockResolvedValueOnce('fresh');

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
