import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1278: PostHog must never touch `window.localStorage` — synchronous
 * reads on Thunderbird's parent-process main thread froze startup for ~100 s.
 * Loads the REAL posthog-js (a mock would hide the regression) and asserts
 * zero localStorage accesses across import, DOMContentLoaded, init, opt-in,
 * and opt-out.
 */

// A real-looking project key so setPosthogConsent(true) actually runs init().
vi.mock('@send-frontend/config', () => ({
  default: {
    posthogProjectKey: 'phc_test_key',
    posthogHost: 'https://posthog.example',
  },
}));

// Keep init()'s background config/flag requests hermetic.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('{}', { status: 200 }))
);

const realLocalStorage = Object.getOwnPropertyDescriptor(
  window,
  'localStorage'
);

let localStorageTouches: string[] = [];

beforeEach(() => {
  localStorageTouches = [];
  // Record every localStorage access (with a stack naming the culprit) and
  // hand back an inert stub.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      localStorageTouches.push(
        new Error('window.localStorage touched').stack ?? '(no stack)'
      );
      return {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      };
    },
  });
});

afterEach(() => {
  if (realLocalStorage) {
    Object.defineProperty(window, 'localStorage', realLocalStorage);
  }
  Reflect.deleteProperty(document, 'readyState');
});

/**
 * Import a fresh plugin the way an add-on page does: during page load
 * (readyState 'loading'), then fire DOMContentLoaded — the moment the
 * startup hang happened.
 */
async function loadPluginDuringPageLoad() {
  vi.resetModules();
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'loading',
  });
  const plugin = await import('@send-frontend/plugins/posthog');
  Reflect.deleteProperty(document, 'readyState');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return plugin;
}

describe('posthog consent never touches window.localStorage (issue #1278)', () => {
  it("import + posthog-js's DOMContentLoaded consent check stay off localStorage", async () => {
    await loadPluginDuringPageLoad();
    expect(localStorageTouches).toEqual([]);
  });

  it('init, opt-in, and opt-out stay off localStorage', async () => {
    const { setPosthogConsent } = await loadPluginDuringPageLoad();
    setPosthogConsent(true); // initPosthog() + opt_in_capturing()
    setPosthogConsent(false); // opt_out_capturing() + reset()
    setPosthogConsent(true);
    expect(localStorageTouches).toEqual([]);
  });

  it('consent still gates capture', async () => {
    const { default: plugin, setPosthogConsent } =
      await loadPluginDuringPageLoad();
    setPosthogConsent(true);
    expect(plugin.rest.has_opted_out_capturing()).toBe(false);
    setPosthogConsent(false);
    expect(plugin.rest.has_opted_out_capturing()).toBe(true);
  });
});
