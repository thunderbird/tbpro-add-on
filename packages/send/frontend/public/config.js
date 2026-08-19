// Runtime application config, loaded by index.html BEFORE the app bundle.
//
// SECURITY: every value here is served publicly to browsers. Never put a secret
// in this file (or in the APP_* vars the container entrypoint reads from).
//
// This committed default is intentionally EMPTY: with no values set, the app
// falls back to build-time `import.meta.env.VITE_*` (see src/config.ts), so all
// three existing build paths keep working unchanged --
//   - local dev, from your `.env`;
//   - the existing S3/CloudFront + ECS deploy (merge.yml / release.yml), which
//     still bakes VITE_* into the bundle;
//   - the Thunderbird add-on XPI, which has no server to fetch this file from
//     and therefore never loads it at all (only index.html has the script tag,
//     not index.extension.html / index.management.html).
//
// On the EKS / container path only, this file is REGENERATED at container start
// from APP_* pod env by docker/docker-entrypoint.d/40-send-config.sh. That
// container bundle is env-agnostic (byte-identical across environments); the S3
// bundle and the XPI are still built per-environment.
window.__APP_CONFIG__ = {
  appEnv: '',
  sendServerUrl: '',
  sendClientUrl: '',
  oidcRootUrl: '',
  oidcClientId: '',
  allowPublicLogin: '',
  sentryDsn: '',
  posthogProjectKey: '',
  posthogHost: '',
  splitSizeInMb: '',
  loggerLevel: '',
  uploadHttpRetryLimit: '',
  uploadHttpRetryBaseDelayMs: '',
  accountsUrl: '',
  dashboardUrl: '',
  contactFormUrl: '',
  thundermailUrl: '',
  appointmentUrl: '',
};
