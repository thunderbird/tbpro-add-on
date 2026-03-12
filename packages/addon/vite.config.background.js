import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { packageJson, sharedViteConfig, removeEmptySourcemapsPlugin } from './sharedViteConfig';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    ...sharedViteConfig,
    plugins: [
      removeEmptySourcemapsPlugin(),
      sentryVitePlugin({
        org: 'thunderbird',
        project: 'tbpro-addon',
        authToken: env.VITE_SENTRY_AUTH_TOKEN,
        release: packageJson.version,
        moduleMetadata: {
          version: packageJson.version,
          appHost: 'background',
        },
      }),
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@send-frontend': resolve(__dirname, 'node_modules/send-frontend/src'),
        '@addon': resolve(__dirname, 'src'),
      },
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('src/background.ts', import.meta.url)),
        name: 'ExtensionBackground',
        fileName: () => 'background.js', // Ensure output is background.js
        formats: ['es'],
      },
      minify: false,
      sourcemap: 'inline',
      outDir: 'dist/background',
    },
  };
});
