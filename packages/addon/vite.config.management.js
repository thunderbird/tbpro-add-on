import { sentryVitePlugin } from '@sentry/vite-plugin';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { packageJson, sharedViteConfig, removeEmptySourcemapsPlugin } from './sharedViteConfig';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    ...sharedViteConfig,
    plugins: [
      removeEmptySourcemapsPlugin(),
      vue(),
      sentryVitePlugin({
        org: 'thunderbird',
        project: 'tbpro-addon',
        authToken: env.VITE_SENTRY_AUTH_TOKEN,
        release: packageJson.version,
        moduleMetadata: {
          version: packageJson.version,
          appHost: 'management',
        },
      }),
    ],
    test: {
      include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      globals: true,
    },
    resolve: {
      alias: {
        '@addon': path.resolve(__dirname, 'src'),
        '@send-frontend': path.resolve(
          __dirname,
          'node_modules/send-frontend/src'
        ),
      },
    },
    build: {
      outDir: 'dist/pages',
      sourcemap: true,
      minify: true,
      rollupOptions: {
        input: {
          management: path.resolve(__dirname, 'index.management.html'),
        },
        output: {
          // Emit ES modules with a .mjs extension. Thunderbird's static
          // browser_parsable_script.js check parses every packaged *.js as a
          // classic script and fails on our top-level import/export; .mjs (and
          // .sys.mjs) files are parsed as modules instead. See Bug 2036665.
          entryFileNames: '[name].mjs',
          chunkFileNames: 'chunks/[name].mjs',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
