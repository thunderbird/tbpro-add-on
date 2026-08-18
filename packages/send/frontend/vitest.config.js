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
  },
});
