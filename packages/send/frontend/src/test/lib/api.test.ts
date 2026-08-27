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
  parseRetryAfterMs,
} from '@send-frontend/lib/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stub the auth store so api.call's dynamic imports (getAccessToken and the
// x-logout handler) don't pull in pinia/oidc at test time.
const { mockGetAccessToken, mockRecover, mockRefreshToken } = vi.hoisted(
  () => ({
    mockGetAccessToken: vi.fn<() => Promise<string | null>>(async () => null),
    mockRecover: vi.fn<() => Promise<boolean>>(async () => false),
    mockRefreshToken: vi.fn<() => Promise<string | null>>(async () => null),
  })
);
vi.mock('@send-frontend/stores/auth-store', () => ({
  useAuthStore: () => ({
    getAccessToken: mockGetAccessToken,
    recoverOrForceLogout: mockRecover,
    refreshToken: mockRefreshToken,
  }),
}));

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

  it('rejects dot-segment traversal that would escape the /api/ prefix', () => {
    // `new URL()` normalizes `..`, so without an explicit guard `../admin`
    // would resolve to `/admin` and climb out of `/api/`.
    expect(() => buildApiUrl(SERVER, '../admin')).toThrow('Invalid API path');
    expect(() => buildApiUrl(SERVER, '../../admin')).toThrow(
      'Invalid API path'
    );
    expect(() => buildApiUrl(SERVER, 'uploads/../../admin')).toThrow(
      'Invalid API path'
    );
    expect(() => buildApiUrl(SERVER, '/../admin')).toThrow('Invalid API path');
    // A single `.` segment is also normalized away and is rejected.
    expect(() => buildApiUrl(SERVER, './admin')).toThrow('Invalid API path');
    expect(() => buildApiUrl(SERVER, 'uploads/./stat')).toThrow(
      'Invalid API path'
    );
  });

  it('rejects backslashes, which URL parsing may treat as separators', () => {
    expect(() => buildApiUrl(SERVER, '..\\admin')).toThrow('Invalid API path');
    expect(() => buildApiUrl(SERVER, '\\\\evil.example/steal')).toThrow(
      'Invalid API path'
    );
    expect(() => buildApiUrl(SERVER, 'uploads\\..\\admin')).toThrow(
      'Invalid API path'
    );
  });

  it('preserves dots inside a segment (not treated as traversal)', () => {
    // Dots *within* a segment are legitimate (emails, filenames) and must
    // survive; only segments that are exactly `.` or `..` are rejected.
    expect(buildApiUrl(SERVER, 'users/lookup/a..b@example.com')).toBe(
      'https://send.test.local/api/users/lookup/a..b@example.com'
    );
    expect(buildApiUrl(SERVER, 'uploads/file.name.txt/stat')).toBe(
      'https://send.test.local/api/uploads/file.name.txt/stat'
    );
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

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds into milliseconds', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('parses an HTTP-date into a wait relative to now', () => {
    const twoSecondsOut = new Date(Date.now() + 2000).toUTCString();
    const ms = parseRetryAfterMs(twoSecondsOut);
    // Allow a little slack for clock/rounding; UTCString drops sub-second parts.
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(2000);
  });

  it('clamps a past date to 0', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  it('returns null for missing or unparseable values', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs('soon')).toBeNull();
  });
});

describe('ApiConnection.call — 429 rate limiting (#1105)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits the Retry-After then retries once and returns the retry body', async () => {
    let call = 0;
    const fetchFn = mockFetch(() => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (k: string) => (k === 'retry-after' ? '0' : null) },
          json: async () => ({ limited: true }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true }),
      } as unknown as Response;
    });

    const api = new ApiConnection(SERVER);
    const result = await api.call('uploads', {}, 'POST');

    expect(fetchFn).toHaveBeenCalledTimes(2); // retried once after backoff
    expect(result).toEqual({ ok: true });
  });

  it('reports kind=rate_limited when still limited after the retry', async () => {
    const fetchFn = mockFetch(
      () =>
        ({
          ok: false,
          status: 429,
          headers: { get: (k: string) => (k === 'retry-after' ? '0' : null) },
          json: async () => ({ limited: true }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    let failure: ApiCallFailure | undefined;
    const result = await api.call(
      'uploads',
      {},
      'POST',
      {},
      { onFailure: (f) => (failure = f) }
    );

    expect(fetchFn).toHaveBeenCalledTimes(2); // original + one retry
    expect(result).toBeNull();
    expect(failure).toEqual({
      kind: 'rate_limited',
      status: 429,
      retryAfterMs: 0,
    });
  });

  it('does not retry when Retry-After is missing, and reports rate_limited', async () => {
    const fetchFn = mockFetch(
      () =>
        ({
          ok: false,
          status: 429,
          headers: { get: () => null },
          json: async () => ({ limited: true }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    let failure: ApiCallFailure | undefined;
    const result = await api.call(
      'uploads',
      {},
      'POST',
      {},
      { onFailure: (f) => (failure = f) }
    );

    // No usable Retry-After -> no automatic retry, just surface it.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(failure).toEqual({
      kind: 'rate_limited',
      status: 429,
      retryAfterMs: null,
    });
  });
});

describe('ApiConnection.call — x-logout session recovery (#960/#974)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockGetAccessToken.mockReset().mockResolvedValue(null);
    mockRecover.mockReset().mockResolvedValue(false);
    mockRefreshToken.mockReset().mockResolvedValue(null);
  });

  it('returns null without retrying when recovery fails (refresh token dead)', async () => {
    mockRecover.mockResolvedValue(false);
    const fetchFn = mockFetch(
      () =>
        ({
          ok: false,
          status: 401,
          headers: { get: (k: string) => (k === 'x-logout' ? '1' : null) },
          json: async () => ({ ok: true }),
        }) as unknown as Response
    );

    const api = new ApiConnection(SERVER);
    const result = await api.call('uploads', {}, 'POST');

    expect(mockRecover).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1); // no retry
    expect(result).toBeNull();
  });

  it('retries with a fresh token and returns the retry body when recovery succeeds', async () => {
    // Present an OIDC bearer token so the retry path (which needs an existing
    // Authorization header) is taken.
    mockGetAccessToken.mockResolvedValueOnce('stale'); // initial request token
    mockRecover.mockResolvedValue(true);
    mockGetAccessToken.mockResolvedValueOnce('fresh'); // token used on retry

    let call = 0;
    const fetchFn = mockFetch(() => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 401,
          headers: { get: (k: string) => (k === 'x-logout' ? '1' : null) },
          json: async () => ({ stale: true }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true }),
      } as unknown as Response;
    });

    const api = new ApiConnection(SERVER);
    const result = await api.call('uploads', {}, 'POST');

    expect(mockRecover).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2); // retried once
    const retryOpts = (fetchFn.mock.calls[1] as unknown[])[1] as {
      headers: Record<string, string>;
    };
    expect(retryOpts.headers['Authorization']).toBe('Bearer fresh');
    expect(result).toEqual({ ok: true });
  });

  it('does not attempt recovery when the header is absent', async () => {
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

    expect(mockRecover).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
