import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TELEMETRY_STATE_CHANGED,
  TELEMETRY_STATE_RESPONSE,
  GET_TELEMETRY_STATE,
} from '@send-frontend/lib/const';

/**
 * End-to-end gate test for the hosted Send dashboard (issue #892 / #952).
 *
 * The dashboard runs as a plain web page inside Thunderbird (no direct
 * experiment API), so it learns the telemetry state over the token-bridge.
 * This exercises the *real* send.js entry, the *real* telemetryConsent bridge
 * path, and the *real* sentry.ts gate — only `@sentry/vue` and the heavy Vue
 * wiring are mocked — to lock in the scenario:
 *
 *   pref OFF → open dashboard → Sentry never initializes (zero network calls)
 *   pref ON  → open dashboard → Sentry initializes
 *   runtime toggle → Sentry starts / stops without a reload
 *
 * The bridge→boolean half of the chain is additionally covered by
 * telemetryConsent.test.ts; here we drive the whole entry so the wiring that
 * connects "allowed" to initSentry/closeSentry can't silently regress.
 */

// Observable stand-in for @sentry/vue. `hasClient` mirrors the real client
// lifecycle so sentry.ts's idempotency guard (getClient()) behaves realistically.
const sentry = vi.hoisted(() => {
  const state = { hasClient: false };
  return {
    state,
    init: vi.fn(() => {
      state.hasClient = true;
    }),
    getClient: vi.fn(() => (state.hasClient ? {} : undefined)),
    close: vi.fn(() => {
      state.hasClient = false;
      return Promise.resolve(true);
    }),
    setTag: vi.fn(),
    browserTracingIntegration: vi.fn(),
    captureConsoleIntegration: vi.fn(),
  };
});

vi.mock('@sentry/vue', () => ({
  init: sentry.init,
  getClient: sentry.getClient,
  close: sentry.close,
  setTag: sentry.setTag,
  browserTracingIntegration: sentry.browserTracingIntegration,
  captureConsoleIntegration: sentry.captureConsoleIntegration,
}));

// Signals the entry has finished its gate decision; called with the resolved
// telemetry state right after the init decision.
const wiring = vi.hoisted(() => ({
  setupApp: vi.fn(),
  mountApp: vi.fn(),
  setPosthogConsent: vi.fn(),
}));

vi.mock('@send-frontend/apps/send/setup', () => ({
  setupApp: wiring.setupApp,
  mountApp: wiring.mountApp,
}));

vi.mock('@send-frontend/plugins/posthog', () => ({
  default: {},
  setPosthogConsent: wiring.setPosthogConsent,
}));

// Keep the entry from building the real app tree / router.
vi.mock('@send-frontend/apps/send/SendPage.vue', () => ({ default: {} }));
vi.mock('@send-frontend/apps/send/router', () => ({ default: {} }));
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    createApp: vi.fn(() => ({
      use: vi.fn().mockReturnThis(),
      mount: vi.fn(),
    })),
  };
});

const THUNDERBIRD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Thunderbird/140.0';

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

/**
 * Simulates the token-bridge content script: answer GET_TELEMETRY_STATE with
 * the given state, exactly as background.ts → token-bridge.js would.
 */
function installFakeBridge(enabled: boolean) {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === GET_TELEMETRY_STATE) {
      window.postMessage(
        { type: TELEMETRY_STATE_RESPONSE, enabled },
        window.location.origin
      );
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Runs the entry's IIFE fresh (module state, sentry.ts `initialized`, reset). */
async function loadDashboardEntry() {
  vi.resetModules();
  await import('@send-frontend/apps/send/send');
}

describe('Send dashboard telemetry gate (bridge → initSentry)', () => {
  // The entry's onTelemetryChanged() adds a window 'message' listener and
  // discards the unsubscribe, so a prior test's listener would otherwise leak
  // onto the shared happy-dom window and double-fire on the next broadcast.
  // Track every 'message' listener added during a test and remove them after.
  const originalAddEventListener = window.addEventListener.bind(window);
  let trackedMessageListeners: EventListenerOrEventListenerObject[] = [];

  beforeEach(() => {
    setUserAgent(THUNDERBIRD_UA);
    // No direct experiment API on the dashboard: force the bridge path.
    // @ts-ignore
    delete (globalThis as unknown as { browser?: unknown }).browser;
    sentry.state.hasClient = false;
    vi.clearAllMocks();

    trackedMessageListeners = [];
    window.addEventListener = function (
      this: Window,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      if (type === 'message' && listener) {
        trackedMessageListeners.push(listener);
      }
      return originalAddEventListener(type, listener, options);
    } as typeof window.addEventListener;
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;
    for (const listener of trackedMessageListeners) {
      window.removeEventListener('message', listener);
    }
  });

  it('opted OUT: bridge reports disabled → Sentry never initializes', async () => {
    const uninstall = installFakeBridge(false);
    try {
      await loadDashboardEntry();
      // setupApp is called right after the gate decision, so waiting on it
      // deterministically confirms the async gate resolved.
      await vi.waitFor(() =>
        expect(wiring.setupApp).toHaveBeenCalledWith(expect.anything(), false)
      );
      expect(sentry.init).not.toHaveBeenCalled();
      // Initial PostHog consent is applied inside setupApp(app, false).
    } finally {
      uninstall();
    }
  });

  it('opted IN: bridge reports enabled → Sentry initializes once', async () => {
    const uninstall = installFakeBridge(true);
    try {
      await loadDashboardEntry();
      await vi.waitFor(() =>
        expect(wiring.setupApp).toHaveBeenCalledWith(expect.anything(), true)
      );
      expect(sentry.init).toHaveBeenCalledTimes(1);
      // Initial PostHog consent is applied inside setupApp(app, true).
    } finally {
      uninstall();
    }
  });

  it('runtime opt-IN: TELEMETRY_STATE_CHANGED(true) starts Sentry without a reload', async () => {
    const uninstall = installFakeBridge(false);
    try {
      await loadDashboardEntry();
      await vi.waitFor(() =>
        expect(wiring.setupApp).toHaveBeenCalledWith(expect.anything(), false)
      );
      expect(sentry.init).not.toHaveBeenCalled();

      // Background broadcasts a pref change to the open dashboard tab.
      window.postMessage(
        { type: TELEMETRY_STATE_CHANGED, enabled: true },
        window.location.origin
      );

      await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
      expect(wiring.setPosthogConsent).toHaveBeenLastCalledWith(true);
    } finally {
      uninstall();
    }
  });

  it('runtime opt-OUT: TELEMETRY_STATE_CHANGED(false) tears Sentry down without a reload', async () => {
    const uninstall = installFakeBridge(true);
    try {
      await loadDashboardEntry();
      await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));

      window.postMessage(
        { type: TELEMETRY_STATE_CHANGED, enabled: false },
        window.location.origin
      );

      await vi.waitFor(() => expect(sentry.close).toHaveBeenCalledTimes(1));
      expect(wiring.setPosthogConsent).toHaveBeenLastCalledWith(false);
    } finally {
      uninstall();
    }
  });
});
