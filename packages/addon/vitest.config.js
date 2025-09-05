import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import viteConfig from './vite.config.management';

export default defineConfig({
  plugins: [vue()],
  viteConfig,
  resolve: {
    alias: {
      '@addon': path.resolve(__dirname, 'src'),
      '@send-frontend': path.resolve(
        __dirname,
        'node_modules/send-frontend/src'
      ),
    },
  },
  test: {
    include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'happy-dom',
    globals: true,
    mockReset: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
