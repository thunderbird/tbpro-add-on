//./plugins/posthog.js

import config from '@send-frontend/config';
import posthog from 'posthog-js';

let initialized = false;

function initPosthog() {
  if (initialized) {
    return;
  }
  // Skip init when no project key is configured (e.g. local dev, where
  // `.env.sample` ships VITE_POSTHOG_PROJECT_KEY blank). Calling
  // `posthog.init('')` makes posthog-js log `console.warn('[PostHog.js]
  // PostHog was initialized without a token …')`, and Sentry's
  // captureConsoleIntegration (lib/sentry.ts) forwards that warn as an event --
  // the source of tens of thousands of noise events from localhost. No key
  // means nothing to capture to anyway, so there is nothing to initialize.
  if (!config.posthogProjectKey) {
    return;
  }
  posthog.init(config.posthogProjectKey, {
    api_host: config.posthogHost,
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
