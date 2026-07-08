/**
 * Verifies the opt-in `onFailure` diagnostics hook on ApiConnection.call
 * (added for #914). `call` returns null on every failure, which loses the
 * network-vs-HTTP distinction and the status code; `onFailure` recovers it for
 * observability without changing the return value.
 */
import { ApiCallFailure, ApiConnection } from '@send-frontend/lib/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stub the auth store so api.call's dynamic imports (getAccessToken and the
// x-logout handler) don't pull in pinia/oidc at test time.
const { mockForcedLogout } = vi.hoisted(() => ({ mockForcedLogout: vi.fn() }));
vi.mock('@send-frontend/stores/auth-store', () => ({
  useAuthStore: () => ({
    getAccessToken: async () => null,
    handleForcedLogout: mockForcedLogout,
    refreshToken: async () => null,
  }),
}));

const SERVER = 'https://send.test.local';

function mockFetch(impl: () => Promise<Response> | Response) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ApiConnection.call — onFailure diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports kind=http with status/body on a non-2xx response', async () => {
    mockFetch(
      () =>
        ({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'upstream boom',
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    let failure: ApiCallFailure | undefined;

    const result = await api.call(
      'uploads',
      { id: 'x' },
      'POST',
      {},
      { onFailure: (f) => (failure = f) }
    );

    expect(result).toBeNull();
    expect(failure).toEqual({
      kind: 'http',
      status: 500,
      statusText: 'Internal Server Error',
      body: 'upstream boom',
    });
  });

  it('reports kind=network when fetch throws', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const api = new ApiConnection(SERVER);
    let failure: ApiCallFailure | undefined;

    const result = await api.call(
      'uploads',
      { id: 'x' },
      'POST',
      {},
      { onFailure: (f) => (failure = f) }
    );

    expect(result).toBeNull();
    expect(failure?.kind).toBe('network');
    expect(failure?.status).toBeNull();
    expect((failure as { error: unknown }).error).toBeInstanceOf(TypeError);
  });

  it('does not invoke onFailure on a successful response', async () => {
    mockFetch(
      () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ upload: { id: 'upload1' } }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    const onFailure = vi.fn();

    const result = await api.call(
      'uploads',
      { id: 'x' },
      'POST',
      {},
      { onFailure }
    );

    expect(result).toEqual({ upload: { id: 'upload1' } });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('truncates a large error body to 500 chars', async () => {
    const big = 'a'.repeat(2000);
    mockFetch(
      () =>
        ({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => big,
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    let failure: ApiCallFailure | undefined;

    await api.call(
      'uploads',
      {},
      'POST',
      {},
      { onFailure: (f) => (failure = f) }
    );

    expect(failure?.kind).toBe('http');
    expect((failure as { body: string }).body).toHaveLength(500);
  });
});

describe('ApiConnection.call — x-logout forced logout (#960)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockForcedLogout.mockClear();
  });

  it('clears the session and returns null when the response has x-logout', async () => {
    mockFetch(
      () =>
        ({
          ok: true,
          status: 200,
          headers: { get: (k: string) => (k === 'x-logout' ? '1' : null) },
          json: async () => ({ ok: true }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    const result = await api.call('uploads', {}, 'POST');

    expect(mockForcedLogout).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('does not force logout when the header is absent', async () => {
    mockFetch(
      () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ ok: true }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    const result = await api.call('uploads', {}, 'POST');

    expect(mockForcedLogout).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
