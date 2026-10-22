import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GET_TELEMETRY_STATE,
  TELEMETRY_STATE_CHANGED,
  TELEMETRY_STATE_RESPONSE,
} from './const';
import { isTelemetryAllowed, onTelemetryChanged } from './telemetryConsent';
import { dispatchBridgeMessage } from './testUtils';

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

/**
 * Simulates the token-bridge content script: when the page asks for the
 * telemetry state, reply with the given value. Returns an uninstall function.
 */
function installFakeBridge(enabled: boolean) {
  const bridge = (event: MessageEvent) => {
    if (event.data?.type === GET_TELEMETRY_STATE) {
      // Reply asynchronously, like the real bridge's sendMessage round trip.
      setTimeout(() => {
        dispatchBridgeMessage({ type: TELEMETRY_STATE_RESPONSE, enabled });
      }, 0);
    }
  };
  window.addEventListener('message', bridge);
  return () => window.removeEventListener('message', bridge);
}

const THUNDERBIRD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Thunderbird/140.0';
const WEB_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0';

describe('isTelemetryAllowed', () => {
  afterEach(() => {
    // @ts-ignore — clean up the simulated experiment API
    delete (globalThis as unknown as { browser?: unknown }).browser;
    vi.restoreAllMocks();
  });

  it('allows telemetry outside Thunderbird (public website)', async () => {
    setUserAgent(WEB_UA);
    await expect(isTelemetryAllowed()).resolves.toBe(true);
  });

  it('honors the pref when enabled inside Thunderbird', async () => {
    setUserAgent(THUNDERBIRD_UA);
    (globalThis as unknown as { browser: unknown }).browser = {
      thundermailTelemetry: {
        isTelemetryEnabled: vi.fn().mockResolvedValue(true),
      },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(true);
  });

  it('blocks telemetry when the pref is disabled inside Thunderbird', async () => {
    setUserAgent(THUNDERBIRD_UA);
    (globalThis as unknown as { browser: unknown }).browser = {
      thundermailTelemetry: {
        isTelemetryEnabled: vi.fn().mockResolvedValue(false),
      },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(false);
  });

  it('honors the pref via the token-bridge when the API is absent (dashboard) — enabled', async () => {
    setUserAgent(THUNDERBIRD_UA);
    // No `browser.thundermailTelemetry` (hosted dashboard context), but the bridge answers.
    const uninstall = installFakeBridge(true);
    try {
      await expect(isTelemetryAllowed()).resolves.toBe(true);
    } finally {
      uninstall();
    }
  });

  it('honors the pref via the token-bridge when the API is absent (dashboard) — disabled', async () => {
    setUserAgent(THUNDERBIRD_UA);
    const uninstall = installFakeBridge(false);
    try {
      await expect(isTelemetryAllowed()).resolves.toBe(false);
    } finally {
      uninstall();
    }
  });

  it('fails closed inside Thunderbird when neither the API nor the bridge answers', async () => {
    setUserAgent(THUNDERBIRD_UA);
    // No `browser.thundermailTelemetry` and no bridge listening: the request times out.
    vi.useFakeTimers();
    try {
      const pending = isTelemetryAllowed();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a TELEMETRY_STATE_RESPONSE from another origin or window (S2819)', async () => {
    setUserAgent(THUNDERBIRD_UA);
    vi.useFakeTimers();
    try {
      const pending = isTelemetryAllowed();
      // A cross-origin frame and a same-origin popup both try to opt us in.
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: TELEMETRY_STATE_RESPONSE, enabled: true },
          origin: 'https://evil.example',
          source: window,
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: TELEMETRY_STATE_RESPONSE, enabled: true },
          origin: window.location.origin,
          source: {} as unknown as Window,
        })
      );
      // Neither is trusted, so the request still times out and fails closed.
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed inside Thunderbird when reading the pref throws', async () => {
    setUserAgent(THUNDERBIRD_UA);
    (globalThis as unknown as { browser: unknown }).browser = {
      thundermailTelemetry: {
        isTelemetryEnabled: vi.fn().mockRejectedValue(new Error('boom')),
      },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(false);
  });
});

describe('onTelemetryChanged (bridge path)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards TELEMETRY_STATE_CHANGED from the bridge and ignores untrusted senders', () => {
    setUserAgent(THUNDERBIRD_UA);
    const cb = vi.fn();
    const unsubscribe = onTelemetryChanged(cb);
    try {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: TELEMETRY_STATE_CHANGED, enabled: true },
          origin: 'https://evil.example',
          source: window,
        })
      );
      expect(cb).not.toHaveBeenCalled();

      dispatchBridgeMessage({ type: TELEMETRY_STATE_CHANGED, enabled: true });
      expect(cb).toHaveBeenCalledWith(true);
      dispatchBridgeMessage({ type: TELEMETRY_STATE_CHANGED, enabled: false });
      expect(cb).toHaveBeenLastCalledWith(false);
    } finally {
      unsubscribe();
    }
    dispatchBridgeMessage({ type: TELEMETRY_STATE_CHANGED, enabled: true });
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
