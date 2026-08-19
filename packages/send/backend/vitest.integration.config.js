import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@send-backend': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // this is a temporary config to use vite on routes tests
    include: ['**/**/*.integration.{js,ts}'],
    // '**/dist/**' matters: the Dockerfile now compiles TypeScript to dist/ at image
    // BUILD time, so the compiled copy of every *.test/*.integration file ships in the
    // image alongside its source. Vitest would glob both, and the CommonJS dist copy
    // fails on `require()` of vitest. ('**/build/**' predates this and matches nothing --
    // tsconfig outDir is ./dist. Cf. `lint:all`, which already ignores dist/*.)
    exclude: ['**/dist/**', '**/build/**', '**/node_modules/**'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    env: {
      ...config({ path: './env' }).parsed,
    },
  },
});
