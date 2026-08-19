import { sentryVitePlugin } from '@sentry/vite-plugin';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { getHeadersForEnvironment } from './csp.config.js';
import {
  packageJson,
  sharedViteConfig,
  removeEmptySourcemapsPlugin,
} from './sharedViteConfig';
import { getEnvironmentName } from './src/lib/config';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  const SERVER_BASE_URLS = {
    // backend is the docker network name by default
    development: 'http://backend:8080',
    production: env.VITE_SEND_SERVER_URL,
  };

  const SERVER_BASE_URL = SERVER_BASE_URLS[mode];

  return {
    ...sharedViteConfig,
    plugins: [
      removeEmptySourcemapsPlugin(),
      vue(),
      sentryVitePlugin({
        org: 'thunderbird',
        project: 'send-suite-frontend',
        authToken: env.VITE_SENTRY_AUTH_TOKEN,
        release: packageJson.version,
        moduleMetadata: {
          version: packageJson.version,
          // `loadEnv` returns VITE_-prefixed keys only, so MODE has to be merged
          // in for getEnvironmentName's mode fallback to be reachable. Declared
          // VITE_APP_ENV still wins.
          environment: getEnvironmentName({ ...env, MODE: mode }),
        },
      }),
    ],
    server: {
      // `https: true` gives `Error code: SSL_ERROR_NO_CYPHER_OVERLAP`
      // https: true,
      proxy: {
        // `secure: false` seems to do nothing
        // secure: false,
        '/login-success.html': SERVER_BASE_URL, // Using `backend` per the docker network name
        '/login-failed.html': SERVER_BASE_URL, // Using `backend` per the docker network name
      },
      headers: getHeadersForEnvironment(mode, env),
    },
    resolve: {
      alias: {
        '@send-frontend': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist-web',
      sourcemap: true,
    },
  };
});
