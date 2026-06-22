import { sentryVitePlugin } from '@sentry/vite-plugin';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { packageJson, sharedViteConfig, removeEmptySourcemapsPlugin } from './sharedViteConfig';

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
    resolve: {
      alias: {
        '@send-frontend': resolve(__dirname, 'node_modules/send-frontend/src'),
        '@addon': resolve(__dirname, 'src'),
      },
    },
    build: {
      minify: true,
      sourcemap: 'hidden',
      outDir: 'dist/extension',
      rollupOptions: {
        // external: ["vue"],
        input: {
          extension: resolve(__dirname, 'index.extension.html'),
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
