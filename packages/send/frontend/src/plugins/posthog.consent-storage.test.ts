import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1278: PostHog must never touch `window.localStorage` — synchronous
 * reads on Thunderbird's parent-process main thread froze startup for ~100 s.
 * Loads the REAL posthog-js (a mock would hide the regression) and asserts
 * zero localStorage accesses across import, DOMContentLoaded, init, opt-in,
 * and opt-out. Also pins two opt-out behaviours the plugin promises: opting
 * out sends nothing, and opting back in restores the `service` tag.
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

  it('opting out sends no request', async () => {
    const { setPosthogConsent } = await loadPluginDuringPageLoad();
    setPosthogConsent(true);
    vi.mocked(fetch).mockClear();
    setPosthogConsent(false);
    // reset() schedules its feature-flag reload on a short timer.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the service tag survives an opt-out/opt-in cycle', async () => {
    const { default: plugin, setPosthogConsent } =
      await loadPluginDuringPageLoad();
    setPosthogConsent(true);
    expect(plugin.rest.get_property('service')).toBe('send');
    setPosthogConsent(false);
    setPosthogConsent(true);
    expect(plugin.rest.get_property('service')).toBe('send');
  });
});
