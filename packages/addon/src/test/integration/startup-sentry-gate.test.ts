/**
 * Background startup wires Sentry to the Thunderbird telemetry pref (#1330):
 * off by default, on (with no Vue app) when enabled, and never blocking the
 * rest of startup on the telemetry read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

const sentry = vi.hoisted(() => ({
  initSentry: vi.fn(),
  closeSentry: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@send-frontend/lib/sentry', () => sentry);

describe('Background startup: Sentry follows the telemetry pref', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownHost();
  });

  it('keeps Sentry off when telemetry is disabled', async () => {
    const bg = stubContext(host);
    await import('../../background');
    await vi.waitFor(() =>
      expect(
        bg.browser.thundermailTelemetry.isTelemetryEnabled
      ).toHaveBeenCalled()
    );
    await Promise.resolve();
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });

  it('starts Sentry without an app when telemetry is enabled', async () => {
    const bg = stubContext(host);
    bg.browser.thundermailTelemetry.isTelemetryEnabled.mockResolvedValue(true);
    await import('../../background');
    await vi.waitFor(() =>
      expect(sentry.initSentry).toHaveBeenCalledWith(undefined)
    );
  });

  it('does not hold up the rest of startup on the telemetry read', async () => {
    const bg = stubContext(host);
    bg.browser.thundermailTelemetry.isTelemetryEnabled.mockReturnValue(
      new Promise(() => {})
    );
    await import('../../background');
    await vi.waitFor(() =>
      expect(bg.browser.TBProMenu.create).toHaveBeenCalled()
    );
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });
});
