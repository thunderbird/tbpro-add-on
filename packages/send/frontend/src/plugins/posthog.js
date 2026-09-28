//./plugins/posthog.js

import config from '@send-frontend/config';
import posthog from 'posthog-js';

let initialized = false;

/*
Keep PostHog's consent flag in memory, never in `window.localStorage`
(issue #1278 / bmo#2008431).

In Thunderbird every add-on page — including the background page — runs on
the parent-process main thread, and the first synchronous `localStorage`
access there blocks until Gecko's LocalStorage/QuotaManager machinery has
initialized. On profiles where that initialization is slow or failing, the
block lasts until the slow-script killer fires (~100 s) and freezes the
whole Thunderbird UI during startup.

posthog-js is the only code that puts such an access on the startup path:
importing it schedules a consent check at `DOMContentLoaded` on its default
instance, and its ConsentManager persists consent in a localStorage- or
cookie-backed store — with our default `opt_out_capturing_persistence_type`
that store is localStorage, which every consent check re-reads. No
`posthog.init` option prevents that read, so the fix is to replace the
instance's consent manager with this in-memory equivalent (same semantics as
posthog-js's `ConsentManager` for our non-cookieless configuration).

Dropping consent persistence loses nothing: consent is re-derived on every
startup from the Thunderbird telemetry preference / app settings (see the
`setPosthogConsent` callers), so PostHog's own stored copy was redundant.

The replacement must be in place before `DOMContentLoaded` fires; it is,
because every bundle that uses PostHog imports this module statically.
`posthog.consent-storage.test.ts` pins the no-localStorage invariant, so a
posthog-js upgrade that changes these internals fails loudly instead of
quietly reintroducing the hang.
*/
function memoryConsent(instance) {
  // null = no explicit choice yet, true = opted in, false = opted out.
  let stored = null;
  return {
    // ConsentStatus semantics: -1 pending, 0 denied, 1 granted.
    get consent() {
      return stored === null ? -1 : stored ? 1 : 0;
    },
    isRejected() {
      return (
        stored === false ||
        (stored === null && !!instance.config?.opt_out_capturing_by_default)
      );
    },
    isOptedOut() {
      return this.isRejected();
    },
    isOptedIn() {
      return !this.isOptedOut();
    },
    isExplicitlyOptedOut() {
      return stored === false;
    },
    optInOut(isOptedIn) {
      stored = !!isOptedIn;
    },
    reset() {
      stored = null;
    },
  };
}

// defineProperty rather than assignment so this also shadows a
// prototype-level accessor, should posthog-js ever define one.
function installMemoryConsent(instance) {
  Object.defineProperty(instance, 'consent', {
    configurable: true,
    writable: true,
    value: memoryConsent(instance),
  });
}

installMemoryConsent(posthog);

/*
`posthog.init()` itself also reads `window.localStorage` — a storage support
probe plus a `ph_debug` lookup — with no option to turn either off, which is
the same blocking hazard as the consent reads above. Hide localStorage from
posthog for the synchronous duration of init(): the probe then fails cleanly,
posthog-js caches “unsupported” for the rest of the page's lifetime (falling
back to its inert-in-extension-pages cookie store), and with
`persistence: 'memory'` nothing else ever asks for it. Code that assumes
localStorage exists (posthog's survey reset, for example) gets an inert
stand-in instead of an exception. The page's own localStorage is restored,
untouched, before this returns.
*/
const inertStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function withLocalStorageHidden(fn) {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => inertStorage,
  });
  try {
    return fn();
  } finally {
    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    } else {
      // The descriptor lives on Window.prototype; removing the own property
      // exposes it again.
      delete window.localStorage;
    }
  }
}

// Share/locked routes carry a bearer secret in the path
// (`/share/:linkId`, `/locked/:linkId`). PostHog's default URL/pageview/
// autocapture properties would otherwise leak that secret to analytics.
// Redact the id segment by path pattern (not a hardcoded id) so query
// strings and trailing segments are preserved but the secret is stripped.
// Case-insensitive so case-variant paths (`/Share/<id>`, `/LOCKED/<id>`)
// are redacted too.
const SENSITIVE_URL_SEGMENT = /\/(share|locked)\/[^/?#]+/gi;

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

// Guard against pathological/cyclic property payloads; PostHog capture
// payloads are JSON-shaped and shallow (nesting like `$set_once.$initial_*`
// is one level deep), so a small depth cap is plenty.
const MAX_SCRUB_DEPTH = 8;

/**
 * Recursively applies {@link redactSensitiveUrl} to every string value in a
 * capture payload container (plain objects and arrays), mutating in place.
 *
 * Scrubbing every string — rather than an allowlist of known URL property
 * keys — is deliberate: PostHog attaches URL-bearing auto-properties in
 * several places (`$current_url`, `$pathname`, `$referrer`,
 * `$session_entry_url`, `$session_entry_pathname`,
 * `$set_once.$initial_current_url`, …) and has added new ones over time. The
 * redaction regex only rewrites `/share/<id>` and `/locked/<id>` path
 * segments, so it is a no-op on every other string.
 */
function scrubStringsDeep(container, depth = 0) {
  if (!container || typeof container !== 'object' || depth > MAX_SCRUB_DEPTH) {
    return;
  }
  for (const key of Object.keys(container)) {
    const value = container[key];
    if (typeof value === 'string') {
      container[key] = redactSensitiveUrl(value);
    } else {
      scrubStringsDeep(value, depth + 1);
    }
  }
}

/**
 * PostHog `before_send` hook: scrubs the sensitive link id from the event
 * payload BEFORE it leaves the browser. `before_send` is PostHog's current
 * property-mutation hook, replacing the older, deprecated
 * `sanitize_properties` option.
 *
 * Covers all three URL-carrying containers of a capture payload:
 * - `properties` — per-event auto-props, incl. session-entry props
 *   (`$session_entry_url`/`$session_entry_pathname`), which ride on EVERY
 *   event of a session entered via `/share/<id>`;
 * - `$set` / `$set_once` — top-level person-property payloads; posthog-js
 *   merges initial person info (`$initial_current_url`,
 *   `$initial_pathname`, `$initial_referrer`) into `$set_once` on the first
 *   person-processing event and on `$identify`.
 */
function scrubSensitiveUrls(captureResult) {
  if (!captureResult) {
    return captureResult;
  }
  scrubStringsDeep(captureResult.properties);
  scrubStringsDeep(captureResult.$set);
  scrubStringsDeep(captureResult.$set_once);
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
  withLocalStorageHidden(() =>
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
    })
  );
  posthog.register({
    service: 'send',
  });
  // init() must not resurrect the storage-backed ConsentManager; the caller
  // (setPosthogConsent) applies the opt-in right after this returns.
  installMemoryConsent(posthog);
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
    withLocalStorageHidden(() => posthog.opt_in_capturing());
  } else if (initialized) {
    // posthog.reset() clears the consent state along with the identity, so it
    // must run before opt-out — the other way around, the opt-out is
    // immediately erased and capture resumes. It also wipes survey state
    // straight out of localStorage, hence the shadow.
    withLocalStorageHidden(() => {
      posthog.reset();
      posthog.opt_out_capturing();
    });
  }
}

export default {
  install(app) {
    app.config.globalProperties.$posthog = posthog;
  },
  rest: posthog,
};
