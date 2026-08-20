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
    include: ['**/**/*.test.{js,ts}'],
    // Defence in depth: the compiled artifact is not supposed to contain tests at
    // all (`pnpm build` uses tsconfig.build.json, which excludes them), but the
    // Dockerfile compiles dist/ into the image, so a stale or hand-run `tsc`
    // would otherwise produce a CommonJS duplicate of every test file here --
    // globbed by the `js` arm above and fatal ("Vitest cannot be imported in a
    // CommonJS module using require()"). vitest's own defaultExclude covers
    // neither dist/ nor the .docker-build/ build context rsync copy.
    exclude: [
      '**/dist/**',
      '**/.docker-build/**',
      '**/build/**',
      '**/node_modules/**',
    ],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    env: {
      ...config({ path: './env' }).parsed,
    },
  },
});
