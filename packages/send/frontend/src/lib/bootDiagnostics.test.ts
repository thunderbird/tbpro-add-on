import { denyStorage } from '@send-frontend/lib/testUtils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkBackendReachable,
  checkCrossSiteCookie,
  checkFirstPartyCookie,
  checkStorage,
  describeError,
  runBootChecks,
  type BootProgress,
} from './bootDiagnostics';

const SERVER_URL = 'https://localhost:8088';

/** A browser that silently drops cookie writes for this site. */
function dropCookies() {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '',
    set: () => {},
  });
  return () => {
    delete (document as { cookie?: string }).cookie;
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** fetch stub answering the health and cookie-probe routes. */
function stubBackend({
  health = 200,
  set = { ok: true } as unknown,
  verify = { cookiesEnabled: true } as unknown,
} = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/health')) return jsonResponse({}, health);
    if (url.endsWith('/api/cookie-check/set')) return jsonResponse(set);
    if (url.endsWith('/api/cookie-check/verify')) return jsonResponse(verify);
    return jsonResponse({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('bootDiagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('describeError', () => {
    it('keeps the DOMException name, which is the part users search for', () => {
      expect(
        describeError(
          new DOMException('The operation is insecure.', 'SecurityError')
        )
      ).toBe('SecurityError: The operation is insecure.');
    });

    it('drops the generic Error name and stringifies non-errors', () => {
      expect(describeError(new Error('boom'))).toBe('boom');
      expect(describeError('plain')).toBe('plain');
    });
  });

  describe('checkStorage', () => {
    it('passes when both stores round-trip a value', () => {
      const result = checkStorage();
      expect(result.outcome).toBe('passed');
      expect(localStorage.getItem('send_boot_probe')).toBeNull();
    });

    it('fails, with the browser error text, when the storage getter throws', () => {
      const restore = denyStorage('localStorage');
      try {
        const result = checkStorage();
        expect(result.outcome).toBe('failed');
        expect(result.detail).toBe('SecurityError: The operation is insecure.');
      } finally {
        restore();
      }
    });

    it('fails when only sessionStorage is denied', () => {
      const restore = denyStorage('sessionStorage');
      try {
        expect(checkStorage().outcome).toBe('failed');
      } finally {
        restore();
      }
    });
  });

  describe('checkFirstPartyCookie', () => {
    it('passes when a cookie can be written and read back, and cleans it up', () => {
      const result = checkFirstPartyCookie();
      expect(result.outcome).toBe('passed');
      expect(document.cookie).not.toContain('send_boot_probe=1');
    });

    it('only warns (never blocks) when the browser drops the cookie', () => {
      const restore = dropCookies();
      try {
        expect(checkFirstPartyCookie().outcome).toBe('warning');
      } finally {
        restore();
      }
    });
  });

  describe('checkBackendReachable', () => {
    it('passes on a 200 from /api/health', async () => {
      const fetchMock = stubBackend();
      const result = await checkBackendReachable(SERVER_URL);
      expect(result.outcome).toBe('passed');
      expect(result.detail).toContain('https://localhost:8088');
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://localhost:8088/api/health'
      );
    });

    it('warns with the status on a non-2xx answer', async () => {
      stubBackend({ health: 503 });
      const result = await checkBackendReachable(SERVER_URL);
      expect(result.outcome).toBe('warning');
      expect(result.detail).toContain('503');
    });

    it('warns with the error text when fetch throws', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      );
      const result = await checkBackendReachable(SERVER_URL);
      expect(result.outcome).toBe('warning');
      expect(result.detail).toBe('TypeError: Failed to fetch');
    });
  });

  describe('checkCrossSiteCookie', () => {
    it('passes when the probe cookie comes back, sending credentials', async () => {
      const fetchMock = stubBackend();
      const result = await checkCrossSiteCookie(SERVER_URL);
      expect(result.outcome).toBe('passed');
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls).toEqual([
        'https://localhost:8088/api/cookie-check/set',
        'https://localhost:8088/api/cookie-check/verify',
      ]);
      // Without this the probe cookie would never ride along, and neither
      // would the real session cookie.
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        credentials: 'include',
        cache: 'no-store',
      });
    });

    it('fails only on a positive "blocked" answer from the backend', async () => {
      stubBackend({ verify: { cookiesEnabled: false } });
      expect((await checkCrossSiteCookie(SERVER_URL)).outcome).toBe('failed');
    });

    it('warns, never fails, when the probe is inconclusive', async () => {
      stubBackend({ set: { ok: false } });
      expect((await checkCrossSiteCookie(SERVER_URL)).outcome).toBe('warning');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      );
      expect((await checkCrossSiteCookie(SERVER_URL)).outcome).toBe('warning');
    });
  });

  describe('runBootChecks', () => {
    function collect() {
      const events: BootProgress[] = [];
      return {
        events,
        onProgress: (event: BootProgress) => events.push(event),
      };
    }
    const done = (events: BootProgress[]) =>
      events
        .filter((event) => event.status === 'done')
        .map((event) => event.id);

    it('stops at storage, before any network call, when storage is denied', async () => {
      const fetchMock = stubBackend();
      const restore = denyStorage('localStorage');
      const { events, onProgress } = collect();
      try {
        expect(await runBootChecks(SERVER_URL, onProgress)).toBe('storage');
      } finally {
        restore();
      }
      expect(done(events)).toEqual(['storage']);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('runs every step and blocks on a cross-site cookie block', async () => {
      stubBackend({ verify: { cookiesEnabled: false } });
      const { events, onProgress } = collect();
      expect(await runBootChecks(SERVER_URL, onProgress)).toBe(
        'crossSiteCookie'
      );
      expect(done(events).sort()).toEqual(
        ['backend', 'crossSiteCookie', 'firstPartyCookie', 'storage'].sort()
      );
    });

    it('lets the app start when nothing blocks, even with warnings', async () => {
      stubBackend({ health: 503, set: { ok: false } });
      const { onProgress } = collect();
      expect(await runBootChecks(SERVER_URL, onProgress)).toBeNull();
    });
  });
});
