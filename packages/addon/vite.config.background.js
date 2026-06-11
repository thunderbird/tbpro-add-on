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
        // Emit ES modules with a .mjs extension. Thunderbird's static
        // browser_parsable_script.js check parses every packaged *.js as a
        // classic script and fails on our top-level import/export; .mjs (and
        // .sys.mjs) files are parsed as modules instead. See Bug 2036665.
        fileName: () => 'background.mjs',
        formats: ['es'],
      },
      minify: true,
      sourcemap: 'inline',
      outDir: 'dist/background',
      rollupOptions: {
        output: {
          chunkFileNames: '[name].mjs',
        },
      },
    },
  };
});
