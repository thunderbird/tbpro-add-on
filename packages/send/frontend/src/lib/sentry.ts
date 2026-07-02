import * as Sentry from '@sentry/vue';
import { getEnvironmentName } from './config';

type App = ReturnType<typeof import('vue').createApp>;

const TRACING_LEVELS_PROD = ['error', 'warn'];
const TRACING_LEVELS_DEV = ['error', 'warn', 'debug'];

const isProduction = import.meta.env.MODE === 'production';

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
      Sentry.captureConsoleIntegration({
        levels: isProduction ? TRACING_LEVELS_PROD : TRACING_LEVELS_DEV,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 0.5,
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    // tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
    environment: import.meta.env.MODE,
    // Privacy hardening: never attach default PII, and scrub user identity /
    // request payloads from outgoing events.
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
        delete event.request.data;
      }
      return event;
    },
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
