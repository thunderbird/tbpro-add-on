import { closeSentry, initSentry } from '@send-frontend/lib/sentry';

type App = Parameters<typeof initSentry>[0];

/**
 * Runs Sentry only while Thunderbird telemetry is enabled, starting/stopping it
 * on pref changes (#1330). Fails closed: a missing or throwing telemetry API
 * leaves Sentry off. Never throws.
 */
export async function gateSentryOnTelemetry(app?: App): Promise<void> {
  const api =
    typeof browser === 'undefined' ? undefined : browser.thundermailTelemetry;
  if (!api?.isTelemetryEnabled) {
    return;
  }

  // A change event that lands while the initial read is in flight is newer
  // than the read's result, so it wins.
  let changed = false;
  try {
    api.onChanged?.addListener((enabled) => {
      changed = true;
      if (enabled) {
        initSentry(app);
      } else {
        void closeSentry();
      }
    });
    const enabled = await api.isTelemetryEnabled();
    if (enabled === true && !changed) {
      initSentry(app);
    }
  } catch (error) {
    console.warn(
      '[Sentry] Telemetry state unavailable; Sentry stays off.',
      error
    );
  }
}
