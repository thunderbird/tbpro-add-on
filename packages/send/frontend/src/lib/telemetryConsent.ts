/**
 * Telemetry consent gate.
 *
 * Honors Thunderbird's telemetry opt-out preference
 * (datareporting.healthreport.uploadEnabled) for Sentry and PostHog.
 *
 * Behavior by context:
 * - Outside Thunderbird (public website): telemetry behaves as before (allowed).
 * - Inside Thunderbird, on an add-on (moz-extension) page: read the pref via the
 *   `browser.Telemetry` experiment API.
 * - Inside Thunderbird but the experiment API is unavailable / errors: fail
 *   closed (no telemetry).
 *
 * The `browser.Telemetry` namespace is provided by the add-on's experiment API
 * (packages/addon/public/api/Telemetry). The frontend types come from
 * @types/firefox-webext-browser, which does not know about custom experiment
 * APIs, hence the `@ts-ignore` accesses below (matching extension-store.ts).
 */

const isInsideThunderbird = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Thunderbird');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTelemetryApi = (): any => {
  try {
    // @ts-ignore — custom experiment API, only present on moz-extension pages
    if (typeof browser !== 'undefined' && browser?.Telemetry) {
      // @ts-ignore
      return browser.Telemetry;
    }
  } catch {
    // `browser` not defined (web context) — fall through
  }
  return undefined;
};

/**
 * Resolves whether telemetry (Sentry + PostHog) is allowed to run.
 * Fails closed (false) when inside Thunderbird and the pref cannot be read.
 */
export async function isTelemetryAllowed(): Promise<boolean> {
  if (!isInsideThunderbird()) {
    // Public website (outside Thunderbird): preserve existing behavior.
    return true;
  }

  const api = getTelemetryApi();
  if (!api?.getUploadEnabled) {
    // Inside Thunderbird but the experiment API is unavailable: fail closed.
    return false;
  }

  try {
    return Boolean(await api.getUploadEnabled());
  } catch {
    return false;
  }
}

/**
 * Subscribes to runtime changes of the Thunderbird telemetry pref. The callback
 * receives the new boolean value. Returns an unsubscribe function; a no-op when
 * the experiment API is unavailable (e.g. on the public website).
 */
export function onTelemetryChanged(
  cb: (enabled: boolean) => void
): () => void {
  const api = getTelemetryApi();
  if (!api?.onChanged?.addListener) {
    return () => {};
  }

  const listener = (enabled: boolean) => cb(Boolean(enabled));
  api.onChanged.addListener(listener);

  return () => {
    try {
      api.onChanged.removeListener?.(listener);
    } catch {
      // ignore
    }
  };
}
