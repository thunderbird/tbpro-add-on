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
        project: 'send-suite-frontend',
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
        '@send-frontend': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist/pages',
      sourcemap: mode === 'production' ? true : 'inline',
      minify: false,
      rollupOptions: {
        input: {
          management: path.resolve(__dirname, 'index.management.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
