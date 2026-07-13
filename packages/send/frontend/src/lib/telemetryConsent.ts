/**
 * Telemetry consent gate.
 *
 * Honors Thunderbird's telemetry opt-out (enabled only when both
 * datareporting.policy.dataSubmissionEnabled and
 * datareporting.healthreport.uploadEnabled are on) for Sentry and PostHog.
 *
 * Behavior by context:
 * - Outside Thunderbird (public website): telemetry behaves as before (allowed).
 * - Inside Thunderbird, on an add-on (moz-extension) page: read the state via
 *   the `browser.thundermailTelemetry` experiment API.
 * - Inside Thunderbird on the hosted Send dashboard (send.js runs as a web page
 *   with no experiment API): ask the background script for the state over the
 *   token-bridge (issue #952).
 * - Inside Thunderbird but neither the experiment API nor the bridge answers:
 *   fail closed (no telemetry).
 *
 * The `browser.thundermailTelemetry` namespace is provided by the add-on's
 * experiment API (packages/addon/public/api/Telemetry). The frontend types come from
 * @types/firefox-webext-browser, which does not know about custom experiment
 * APIs, hence the `@ts-ignore` accesses below (matching extension-store.ts).
 */

import {
  GET_TELEMETRY_STATE,
  TELEMETRY_STATE_CHANGED,
  TELEMETRY_STATE_RESPONSE,
} from './const';

// How long to wait for the token-bridge to answer before failing closed. The
// bridge content script is injected at document_start, so it is normally
// present before this runs; the timeout covers the case where it is not (e.g.
// the add-on isn't installed).
const BRIDGE_TIMEOUT_MS = 2000;

const isInsideThunderbird = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Thunderbird');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTelemetryApi = (): any => {
  // The `typeof browser` guard makes the property access safe in web contexts
  // where `browser` is undefined, so no try/catch is needed here.
  // @ts-ignore — custom experiment API, only present on moz-extension pages
  if (typeof browser !== 'undefined' && browser?.thundermailTelemetry) {
    // @ts-ignore
    return browser.thundermailTelemetry;
  }
  return undefined;
};

/**
 * Requests the Thunderbird telemetry pref from the background script via the
 * token-bridge, for contexts (the hosted Send dashboard) that lack the
 * `browser.thundermailTelemetry` experiment API. Resolves false (fail closed) if the
 * bridge does not answer within the timeout.
 */
function requestTelemetryStateViaBridge(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };

    const timer = setTimeout(() => {
      // Bridge absent or unresponsive — fail closed.
      cleanup();
      resolve(false);
    }, BRIDGE_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      if (event.data?.type === TELEMETRY_STATE_RESPONSE) {
        cleanup();
        resolve(Boolean(event.data.enabled));
      }
    };

    window.addEventListener('message', handler);
    window.postMessage({ type: GET_TELEMETRY_STATE }, window.location.origin);
  });
}

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
  if (api?.isTelemetryEnabled) {
    // moz-extension add-on page: read the state directly.
    try {
      return Boolean(await api.isTelemetryEnabled());
    } catch {
      return false;
    }
  }

  // Inside Thunderbird without the direct experiment API (the hosted Send
  // dashboard runs as a web page): ask the background via the token-bridge.
  return requestTelemetryStateViaBridge();
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
  if (api?.onChanged?.addListener) {
    // moz-extension add-on page: observe the pref directly.
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

  // Inside Thunderbird without the direct API (the hosted Send dashboard): the
  // background pushes pref changes through the token-bridge as window messages.
  if (isInsideThunderbird() && typeof window !== 'undefined') {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === TELEMETRY_STATE_CHANGED) {
        cb(Boolean(event.data.enabled));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  // Public website (outside Thunderbird): nothing to observe.
  return () => {};
}
