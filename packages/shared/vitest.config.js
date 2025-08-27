import { config } from 'dotenv';
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // this is a temporary config to use vite on routes tests
    include: ['**/tests/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    env: {
      ...config({ path: './env' }).parsed,
    },
  },
});
