import { sentryVitePlugin } from '@sentry/vite-plugin';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from 'vite';
import { packageJson, sharedViteConfig } from './sharedViteConfig';


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    ...sharedViteConfig,
    plugins: [
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
      visualizer(),
    ],
    test: {
      include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      globals: true,
    },
    resolve: {
      alias: {
        '@addon': path.resolve(__dirname, 'src'),
        '@send-frontend': path.resolve(__dirname, 'node_modules/send-frontend/src'),
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
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
