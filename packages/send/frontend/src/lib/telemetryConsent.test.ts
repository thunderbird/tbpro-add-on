import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTelemetryAllowed } from './telemetryConsent';

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
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
      Telemetry: { getUploadEnabled: vi.fn().mockResolvedValue(true) },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(true);
  });

  it('blocks telemetry when the pref is disabled inside Thunderbird', async () => {
    setUserAgent(THUNDERBIRD_UA);
    (globalThis as unknown as { browser: unknown }).browser = {
      Telemetry: { getUploadEnabled: vi.fn().mockResolvedValue(false) },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(false);
  });

  it('fails closed inside Thunderbird when the experiment API is unavailable', async () => {
    setUserAgent(THUNDERBIRD_UA);
    // No `browser.Telemetry` available.
    await expect(isTelemetryAllowed()).resolves.toBe(false);
  });

  it('fails closed inside Thunderbird when reading the pref throws', async () => {
    setUserAgent(THUNDERBIRD_UA);
    (globalThis as unknown as { browser: unknown }).browser = {
      Telemetry: {
        getUploadEnabled: vi.fn().mockRejectedValue(new Error('boom')),
      },
    };
    await expect(isTelemetryAllowed()).resolves.toBe(false);
  });
});
