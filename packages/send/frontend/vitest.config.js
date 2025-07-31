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
  define: {
    'import.meta.env.VITE_TESTING': '"true"',
    'import.meta.env.VITE_SEND_SERVER_URL': '"https://localhost:8088"',
  },
});
