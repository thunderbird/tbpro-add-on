//./plugins/posthog.js

import posthog from 'posthog-js';

let initialized = false;

function initPosthog() {
  if (initialized) {
    return;
  }
  posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    persistence: 'memory',
  });
  posthog.register({
    service: 'send',
  });
  initialized = true;
}

/**
 * Enables or disables PostHog capture at runtime in response to the Thunderbird
 * telemetry opt-out preference (see issue #892).
 *
 * When enabled, PostHog is initialized lazily on first opt-in — so while opted
 * out it is never initialized and makes zero network requests. When disabled,
 * capture is opted out and the stored distinct id is reset.
 *
 * `capture()` / `identify()` calls on the shared instance before init are
 * no-ops, so callers throughout the app remain safe regardless of consent.
 */
export function setPosthogConsent(enabled) {
  if (enabled) {
    initPosthog();
    posthog.opt_in_capturing();
  } else if (initialized) {
    posthog.opt_out_capturing();
    posthog.reset();
  }
}

export default {
  install(app) {
    app.config.globalProperties.$posthog = posthog;
  },
  rest: posthog,
};
