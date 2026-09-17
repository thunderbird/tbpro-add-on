//./plugins/posthog.js

import config from '@send-frontend/config';
import posthog from 'posthog-js';

let initialized = false;

// Share/locked routes carry a bearer secret in the path
// (`/share/:linkId`, `/locked/:linkId`). PostHog's default URL/pageview/
// autocapture properties would otherwise leak that secret to analytics.
// Redact the id segment by path pattern (not a hardcoded id) so query
// strings and trailing segments are preserved but the secret is stripped.
const SENSITIVE_URL_SEGMENT = /\/(share|locked)\/[^/?#]+/g;

/**
 * Redacts the share/locked link id from a URL-bearing string, turning
 * `/share/<id>` and `/locked/<id>` into `/share/[redacted]` and
 * `/locked/[redacted]`. Robust to query strings and trailing path segments.
 * Non-sensitive URLs (and non-strings) are returned unchanged.
 *
 * Exported so it can be unit-tested and reused for every URL property.
 */
export function redactSensitiveUrl(url) {
  if (typeof url !== 'string') {
    return url;
  }
  return url.replace(SENSITIVE_URL_SEGMENT, '/$1/[redacted]');
}

// URL-bearing PostHog auto-properties that can contain the share-link secret.
// `$host`/`$referring_domain` are domain-only (no path) so they are safe.
// `$prev_pageview_pathname` only rides on pageview events (disabled here via
// `capture_pageview: false`), but is scrubbed too as defense-in-depth in case
// pageview capture is ever re-enabled.
const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$prev_pageview_pathname',
];

/**
 * PostHog `before_send` hook: scrubs the sensitive link id from every
 * URL-bearing property BEFORE the event leaves the browser. `before_send` is
 * PostHog's current property-mutation hook, replacing the older, deprecated
 * `sanitize_properties` option.
 */
function scrubSensitiveUrls(captureResult) {
  if (!captureResult?.properties) {
    return captureResult;
  }
  for (const key of URL_PROPERTIES) {
    if (typeof captureResult.properties[key] === 'string') {
      captureResult.properties[key] = redactSensitiveUrl(
        captureResult.properties[key]
      );
    }
  }
  return captureResult;
}

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
    // Redact the share-link secret from URL properties before any event is
    // sent (issue #1254).
    before_send: scrubSensitiveUrls,
    // Reduce capture surface: no DOM autocapture, and no automatic pageview
    // events. Nothing in the app depends on the auto `$pageview` event, so
    // disabling it removes another path that would carry the raw URL.
    autocapture: false,
    capture_pageview: false,
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
