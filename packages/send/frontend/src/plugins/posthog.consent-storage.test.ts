import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for issue #1278 (bmo#2008431: Thunderbird startup hung for
 * ~100 s with TB Pro enabled).
 *
 * Every add-on page runs on Thunderbird's parent-process main thread, where
 * the first synchronous `window.localStorage` access blocks until Gecko's
 * LocalStorage/QuotaManager machinery has initialized — up to the ~100 s
 * slow-script timeout on profiles where that initialization is slow or
 * failing, freezing the whole UI. posthog-js schedules a consent check at
 * `DOMContentLoaded` the moment it is imported, and its ConsentManager
 * persists the opt-in/out flag in localStorage (its cookie mode still reads
 * localStorage once to migrate old values), so any consent activity touches
 * `window.localStorage`.
 *
 * `plugins/posthog.js` replaces the default instance's consent manager with
 * an in-memory one. This suite pins the invariant that matters: with the
 * REAL posthog-js loaded (mocking it would hide the regression), neither
 * importing the plugin, nor the library's own DOMContentLoaded hook, nor
 * init/opt-in/opt-out ever touch `window.localStorage`.
 */

// A configured project key so setPosthogConsent(true) really runs
// posthog.init(). Only the app config is mocked.
vi.mock('@send-frontend/config', () => ({
  default: {
    posthogProjectKey: 'phc_test_key',
    posthogHost: 'https://posthog.example',
  },
}));

// posthog.init() fires config/flag requests in the background; keep the test
// hermetic. The stub stays file-scoped — the jsdom env dies with the file.
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
  // Any access to `window.localStorage` is the bug: in Thunderbird it can
  // block the parent main thread for ~100 s. Record every touch (with a
  // stack, so a failure names the culprit) and hand back an inert stub.
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
 * Import a fresh copy of the plugin the way an add-on page does: during page
 * load (readyState 'loading', so posthog-js defers its hook), then fire
 * DOMContentLoaded — the exact moment the startup hang happened.
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
