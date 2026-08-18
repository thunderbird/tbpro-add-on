// Runtime application configuration for the Send SPA.
//
// Config is read at runtime from `window.__APP_CONFIG__`, injected by `/config.js`
// (loaded synchronously in index.html BEFORE the app bundle), with FALLBACK to
// build-time `import.meta.env.VITE_*`.
//
// WHY THE BUILD-TIME FALLBACK EXISTS -- three separate consumers, not just dev:
//
//   1. The EKS / container path: `docker/docker-entrypoint.d/40-send-config.sh`
//      regenerates config.js from APP_* pod env at container start, and the image
//      is built env-agnostic (no `--mode`, no baked .env), so config.js is the
//      ONLY source there and MUST be present. `assertConfigured()` (called once
//      from the web-app entry) makes a missing one fail loud.
//   2. The existing S3/CloudFront + ECS path (merge.yml / release.yml, both
//      deliberately untouched): those builds still bake VITE_* from a generated
//      `.env`, and the committed all-EMPTY `public/config.js` falls through to
//      them, so behaviour is unchanged.
//   3. THE THUNDERBIRD ADD-ON XPI. `packages/addon` depends on `send-frontend`
//      via `workspace:*`, so this SPA's code ships inside the extension -- and an
//      extension has no server to fetch `/config.js` from. Only
//      `index.html` (the web app) loads the script tag; `index.extension.html`
//      and `index.management.html` deliberately do NOT. There
//      `window.__APP_CONFIG__` stays `undefined`, `runtime()` returns `{}`, and
//      every getter below resolves to the baked VITE_* value. That is what keeps
//      a shipped add-on working with zero changes to `packages/addon`.
//
// NOTE: pick()'s "empty string = unset" rule means the CONTAINER build must stay
// env-agnostic. If a baked `.env`/`--mode` were reintroduced there, a
// runtime-empty APP_* value would silently fall back to the baked one instead of
// failing.
//
// SECURITY: everything reachable through this module is shipped to browsers --
// `/config.js` is served publicly and the bundle is public too. Never route a
// secret through an APP_* var or a VITE_* var.
//
// Design: platform-infrastructure#886 (and #712 for the sibling-URL scope).

/** Environment identity. Free-form: EKS environments are named e.g. `mzla-tb-dev`. */
export type Environment =
  | 'development'
  | 'staging'
  | 'production'
  // Keeps the three well-known names as editor suggestions without pretending
  // they are the only legal values.
  | (string & NonNullable<unknown>);

export type AppConfig = {
  /** Explicit environment name. Replaces every URL-substring `IS_PROD` guess. */
  appEnv?: string;
  sendServerUrl?: string;
  sendClientUrl?: string;
  oidcRootUrl?: string;
  oidcClientId?: string;
  allowPublicLogin?: string;
  sentryDsn?: string;
  posthogProjectKey?: string;
  posthogHost?: string;
  splitSizeInMb?: string;
  loggerLevel?: string;
  uploadHttpRetryLimit?: string;
  uploadHttpRetryBaseDelayMs?: string;
  // Sibling Thunderbird Pro services. These used to be hard-coded, or derived
  // from `BASE_URL.includes('send.tb.pro')` -- a two-valued switch that cannot
  // express a third environment (see platform-infrastructure#712).
  accountsUrl?: string;
  dashboardUrl?: string;
  contactFormUrl?: string;
  thundermailUrl?: string;
  appointmentUrl?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

const runtime = (): AppConfig =>
  (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

/**
 * Prefer a non-empty runtime value; otherwise fall back to the build-time Vite
 * env. An empty string is treated as "unset" -- that is what lets the committed
 * all-empty `public/config.js` fall through to a baked build.
 */
const pick = (
  runtimeVal: string | undefined,
  envVal: string | undefined
): string | undefined =>
  runtimeVal !== undefined && runtimeVal !== '' ? runtimeVal : envVal;

// Each fallback is written as a literal `import.meta.env.VITE_*` member
// expression on purpose: that exact text is what Vite statically replaces at
// build time and what `vitest.config.js` overrides via `define`. Reading the
// same key off a spread copy of `import.meta.env` would defeat both.
const buildEnv = {
  appEnv: import.meta.env.VITE_APP_ENV,
  sendServerUrl: import.meta.env.VITE_SEND_SERVER_URL,
  sendClientUrl: import.meta.env.VITE_SEND_CLIENT_URL,
  oidcRootUrl: import.meta.env.VITE_OIDC_ROOT_URL,
  oidcClientId: import.meta.env.VITE_OIDC_CLIENT_ID,
  allowPublicLogin: import.meta.env.VITE_ALLOW_PUBLIC_LOGIN,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  posthogProjectKey: import.meta.env.VITE_POSTHOG_PROJECT_KEY,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST,
  splitSizeInMb: import.meta.env.VITE_SPLIT_SIZE_IN_MB,
  loggerLevel: import.meta.env.VITE_LOGGER_LEVEL,
  uploadHttpRetryLimit: import.meta.env.VITE_UPLOAD_HTTP_RETRY_LIMIT,
  uploadHttpRetryBaseDelayMs: import.meta.env
    .VITE_UPLOAD_HTTP_RETRY_BASE_DELAY_MS,
  accountsUrl: import.meta.env.VITE_ACCOUNTS_URL,
  dashboardUrl: import.meta.env.VITE_DASHBOARD_URL,
  contactFormUrl: import.meta.env.VITE_CONTACT_FORM_URL,
  thundermailUrl: import.meta.env.VITE_THUNDERMAIL_URL,
  appointmentUrl: import.meta.env.VITE_APPOINTMENT_URL,
} as Record<keyof AppConfig, string | undefined>;

/**
 * Last-resort defaults for the sibling-service URLs.
 *
 * These exist only so the Thunderbird add-on keeps rendering working links: its
 * build bakes no sibling URLs, and `packages/addon` must not be modified. They
 * are the PRODUCTION URLs, because the overwhelming majority of shipped XPIs are
 * production ones and pointing a production user at a staging account page is
 * the worse failure.
 *
 * Every non-production deployment MUST therefore set these explicitly -- APP_*
 * at runtime on EKS, or VITE_* at build time elsewhere. See `.env.sample`.
 */
const SIBLING_URL_DEFAULTS = {
  accountsUrl: 'https://accounts.tb.pro',
  dashboardUrl: 'https://accounts.tb.pro/send/dashboard',
  contactFormUrl: 'https://accounts.tb.pro/contact',
  thundermailUrl: 'https://accounts.tb.pro/mail',
  appointmentUrl: 'https://appointment.tb.pro/',
} as const;

const siblingUrl = (key: keyof typeof SIBLING_URL_DEFAULTS): string =>
  pick(runtime()[key], buildEnv[key]) || SIBLING_URL_DEFAULTS[key];

/**
 * Runtime config accessor. Each getter resolves at call time, so it reflects
 * whatever `/config.js` injected before the bundle loaded.
 */
export const config = {
  /**
   * Explicit environment name -- never inferred from a URL. Unset builds fall
   * back to the Vite build mode, which is the best a bundle with nothing baked
   * in can say about itself.
   *
   * KNOWN GAP: `merge.yml` builds both the stage and the prod bundle with
   * `mode=production` and does not (yet) set VITE_APP_ENV, so the stage bundle
   * currently reports `production`. Those workflows are deliberately out of
   * scope here; adding `VITE_APP_ENV=staging` to the stage matrix entry closes
   * it without touching this file.
   */
  get appEnv(): Environment {
    return (
      pick(runtime().appEnv, buildEnv.appEnv) ||
      (import.meta.env.DEV ? 'development' : 'production')
    );
  },
  get sendServerUrl() {
    return pick(runtime().sendServerUrl, buildEnv.sendServerUrl);
  },
  get sendClientUrl() {
    return pick(runtime().sendClientUrl, buildEnv.sendClientUrl);
  },
  get oidcRootUrl() {
    return pick(runtime().oidcRootUrl, buildEnv.oidcRootUrl);
  },
  get oidcClientId() {
    return pick(runtime().oidcClientId, buildEnv.oidcClientId);
  },
  get allowPublicLogin() {
    return pick(runtime().allowPublicLogin, buildEnv.allowPublicLogin);
  },
  get sentryDsn() {
    return pick(runtime().sentryDsn, buildEnv.sentryDsn);
  },
  get posthogProjectKey() {
    return pick(runtime().posthogProjectKey, buildEnv.posthogProjectKey);
  },
  get posthogHost() {
    return pick(runtime().posthogHost, buildEnv.posthogHost);
  },
  get splitSizeInMb() {
    return pick(runtime().splitSizeInMb, buildEnv.splitSizeInMb);
  },
  get loggerLevel() {
    return pick(runtime().loggerLevel, buildEnv.loggerLevel);
  },
  get uploadHttpRetryLimit() {
    return pick(runtime().uploadHttpRetryLimit, buildEnv.uploadHttpRetryLimit);
  },
  get uploadHttpRetryBaseDelayMs() {
    return pick(
      runtime().uploadHttpRetryBaseDelayMs,
      buildEnv.uploadHttpRetryBaseDelayMs
    );
  },
  get accountsUrl() {
    return siblingUrl('accountsUrl');
  },
  get dashboardUrl() {
    return siblingUrl('dashboardUrl');
  },
  get contactFormUrl() {
    return siblingUrl('contactFormUrl');
  },
  get thundermailUrl() {
    return siblingUrl('thundermailUrl');
  },
  get appointmentUrl() {
    return siblingUrl('appointmentUrl');
  },
};

/**
 * Fail loud if the app is unconfigured. On the container/EKS path there is no
 * baked fallback, so a missing or empty `/config.js` (the entrypoint didn't run,
 * or `APP_SEND_SERVER_URL` was unset) would otherwise boot an SPA that renders
 * and then fails every request against `undefined/api/...`.
 *
 * The server URL is the one essential value: nothing in Send works without it.
 *
 * Call once at startup from the WEB APP entry only (`apps/send/send.js`). The
 * extension and management entries must NOT call it -- they run inside the XPI,
 * where there is no `/config.js` and the baked VITE_* values are the real
 * config. Dev, unit tests and the existing S3/ECS build all resolve
 * `sendServerUrl` through that fallback, so this only throws when it is truly
 * unset.
 */
export const assertConfigured = (): void => {
  if (!config.sendServerUrl) {
    console.error(
      '[config] window.__APP_CONFIG__ is missing/empty (no /config.js?). The SPA is unconfigured.'
    );
    throw new Error(
      'Send SPA is unconfigured: config.sendServerUrl is empty (check /config.js).'
    );
  }
};

export default config;
