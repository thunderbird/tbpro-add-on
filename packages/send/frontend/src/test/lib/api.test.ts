/**
 * Verifies the opt-in `onFailure` diagnostics hook on ApiConnection.call
 * (added for #914). `call` returns null on every failure, which loses the
 * network-vs-HTTP distinction and the status code; `onFailure` recovers it for
 * observability without changing the return value.
 */
import {
  ApiCallFailure,
  ApiConnection,
  buildApiUrl,
} from '@send-frontend/lib/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SERVER = 'https://send.test.local';

describe('buildApiUrl — path pinning (SSRF alert #43)', () => {
  it('pins the request to the server origin under /api/', () => {
    expect(buildApiUrl(SERVER, 'uploads/can-upload')).toBe(
      'https://send.test.local/api/uploads/can-upload'
    );
  });

  it('preserves query strings, trailing slashes, and email segments', () => {
    // These are all real call sites that a naive per-segment allowlist breaks.
    expect(buildApiUrl(SERVER, 'sharing/abc123/links?type=file')).toBe(
      'https://send.test.local/api/sharing/abc123/links?type=file'
    );
    expect(buildApiUrl(SERVER, 'users/invitations/')).toBe(
      'https://send.test.local/api/users/invitations/'
    );
    expect(buildApiUrl(SERVER, 'users/lookup/a@b.com/')).toBe(
      'https://send.test.local/api/users/lookup/a@b.com/'
    );
    expect(buildApiUrl(SERVER, 'auth/login?state=xyz')).toBe(
      'https://send.test.local/api/auth/login?state=xyz'
    );
  });

  it('strips leading slashes rather than escaping the /api prefix', () => {
    expect(buildApiUrl(SERVER, '/uploads')).toBe(
      'https://send.test.local/api/uploads'
    );
  });

  it('rejects absolute and protocol-relative paths', () => {
    expect(() => buildApiUrl(SERVER, 'http://evil.example/steal')).toThrow(
      'Invalid API path'
    );
    expect(() => buildApiUrl(SERVER, 'https://evil.example')).toThrow(
      'Invalid API path'
    );
    expect(() => buildApiUrl(SERVER, '//evil.example/steal')).toThrow(
      'Invalid API path'
    );
  });

  it('rejects an empty path', () => {
    expect(() => buildApiUrl(SERVER, '')).toThrow('Invalid API path');
    expect(() => buildApiUrl(SERVER, '   ')).toThrow('Invalid API path');
  });
});

function mockFetch(impl: () => Promise<Response> | Response) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ApiConnection.call — URL building', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the pinned /api/ URL, preserving the query string', async () => {
    const fetchFn = mockFetch(
      () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({}),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    await api.call('sharing/abc123/links?type=file');

    expect(fetchFn).toHaveBeenCalledWith(
      'https://send.test.local/api/sharing/abc123/links?type=file',
      expect.any(Object)
    );
  });

  it('rejects an absolute path before making any request', async () => {
    const fetchFn = mockFetch(
      () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({}),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    await expect(api.call('http://evil.example/steal')).rejects.toThrow(
      'Invalid API path'
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

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
