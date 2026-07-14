import * as Sentry from '@sentry/vue';
import { getEnvironmentName } from './config';

type App = ReturnType<typeof import('vue').createApp>;

const TRACING_LEVELS_PROD = ['error', 'warn'];
const TRACING_LEVELS_DEV = ['error', 'warn', 'debug'];

const isProduction = import.meta.env.MODE === 'production';

/**
 * Drops the query string and fragment from a URL. Send access links carry the
 * decryption secret in the URL fragment (as split off by
 * `getAccessLinkWithoutPasswordHash` in lib/utils.ts) and query params can carry
 * tokens, so neither may reach Sentry. See issue #892 / #990.
 */
function stripUrlSecrets(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * Scrubs user identity and sensitive request payloads from an outgoing event.
 * Extracted so the privacy hardening is unit-testable independently of
 * Sentry.init.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    delete event.request.data;
    // request.url is the full href, which includes the access-link secret in
    // its fragment; keep the path for context but strip the rest.
    if (typeof event.request.url === 'string') {
      event.request.url = stripUrlSecrets(event.request.url);
    }
  }
  return event;
}

/**
 * Scrubs auto-captured breadcrumbs before they attach to an event. Navigation
 * breadcrumbs record the URL in `data.to`/`data.from` and fetch/xhr breadcrumbs
 * in `data.url`; each can carry the access-link secret (fragment) or tokens
 * (query string). Keep the breadcrumb for debugging context but strip those.
 * See issue #892 / #990.
 */
export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb
): Sentry.Breadcrumb {
  const { data } = breadcrumb;
  if (data) {
    for (const key of ['url', 'to', 'from'] as const) {
      if (typeof data[key] === 'string') {
        data[key] = stripUrlSecrets(data[key]);
      }
    }
  }
  return breadcrumb;
}

let initialized = false;

export const initSentry = (app: App) => {
  // Calling Sentry.init again after a close() re-creates the client, so this is
  // safe to invoke on opt-in. Guard against a redundant double-init.
  if (initialized && Sentry.getClient()) {
    return;
  }

  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay is intentionally NOT enabled: it records DOM contents
      // and input, which can capture PII. See issue #892 (privacy hardening).
      // Console capture stays on: messages are developer-authored log
      // statements, not auto-captured user data. Auto-captured breadcrumbs are
      // scrubbed via beforeBreadcrumb below.
      Sentry.captureConsoleIntegration({
        levels: isProduction ? TRACING_LEVELS_PROD : TRACING_LEVELS_DEV,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 0.5,
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    // tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
    environment: import.meta.env.MODE,
    // Privacy hardening: never attach default PII, scrub user identity /
    // request payloads from outgoing events, and strip access-link secrets and
    // tokens from auto-captured breadcrumb URLs.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });

  Sentry.setTag('environmentName', getEnvironmentName(import.meta.env));
  initialized = true;
};

/**
 * Tears down Sentry so it stops sending events/traces. Used when the user opts
 * out of Thunderbird telemetry at runtime. Safe to call when not initialized.
 */
export const closeSentry = (): Promise<boolean> => {
  if (!Sentry.getClient()) {
    return Promise.resolve(true);
  }
  initialized = false;
  return Sentry.close();
};
