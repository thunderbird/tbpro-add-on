import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import viteConfig from './vite.config';

export default defineConfig({
  plugins: [vue()],
  viteConfig,
  resolve: {
    alias: {
      '@send-frontend': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup/webcrypto.js'],
    globals: true,
    mockReset: false,
  },
  // src/config.ts reads each fallback as a literal `import.meta.env.VITE_*` member
  // expression precisely so these overrides reach it.
  define: {
    'import.meta.env.VITE_TESTING': '"true"',
    'import.meta.env.VITE_SEND_SERVER_URL': '"https://localhost:8088"',
    // Without this, config.sendClientUrl is undefined and every assertion built
    // from it degenerates into comparing 'undefined/...' with itself (see
    // src/test/lib/share.test.ts) -- green even if the wiring breaks entirely.
    'import.meta.env.VITE_SEND_CLIENT_URL': '"http://localhost:5173"',
    // Every remaining plain config key gets a DISTINCT sentinel. Without them
    // these vars are undefined in tests, and config.test.ts's per-key
    // "falls back to its own env var" guard degenerates into
    // `undefined === undefined` -- green even when a copy-paste error crosses
    // two keys' fallbacks. The sentinels are deliberately non-numeric /
    // non-'true' so consumers that coerce (Number(...) || default,
    // === 'true') still resolve to their defaults, exactly as with unset vars.
    'import.meta.env.VITE_OIDC_ROOT_URL': '"sentinel-VITE_OIDC_ROOT_URL"',
    'import.meta.env.VITE_OIDC_CLIENT_ID': '"sentinel-VITE_OIDC_CLIENT_ID"',
    'import.meta.env.VITE_ALLOW_PUBLIC_LOGIN':
      '"sentinel-VITE_ALLOW_PUBLIC_LOGIN"',
    'import.meta.env.VITE_SENTRY_DSN': '"sentinel-VITE_SENTRY_DSN"',
    'import.meta.env.VITE_POSTHOG_PROJECT_KEY':
      '"sentinel-VITE_POSTHOG_PROJECT_KEY"',
    'import.meta.env.VITE_POSTHOG_HOST': '"sentinel-VITE_POSTHOG_HOST"',
    'import.meta.env.VITE_SPLIT_SIZE_IN_MB': '"sentinel-VITE_SPLIT_SIZE_IN_MB"',
    'import.meta.env.VITE_LOGGER_LEVEL': '"sentinel-VITE_LOGGER_LEVEL"',
    'import.meta.env.VITE_UPLOAD_HTTP_RETRY_LIMIT':
      '"sentinel-VITE_UPLOAD_HTTP_RETRY_LIMIT"',
    'import.meta.env.VITE_UPLOAD_HTTP_RETRY_BASE_DELAY_MS':
      '"sentinel-VITE_UPLOAD_HTTP_RETRY_BASE_DELAY_MS"',
    // The sibling URLs are pinned EMPTY so the SIBLING_URL_DEFAULTS branch is
    // what the sibling-URL tests exercise, independent of any local .env.
    'import.meta.env.VITE_ACCOUNTS_URL': '""',
    'import.meta.env.VITE_DASHBOARD_URL': '""',
    'import.meta.env.VITE_CONTACT_FORM_URL': '""',
    'import.meta.env.VITE_THUNDERMAIL_URL': '""',
    'import.meta.env.VITE_APPOINTMENT_URL': '""',
    // VITE_APP_ENV is deliberately NOT defined: the appEnv tests exercise the
    // undeclared fallback path.
  },
});
