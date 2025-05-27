import { fileURLToPath } from 'node:url';
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config';

// Version of config allowing callback version of viteConfig
// per https://github.com/vitejs/vite/issues/13950#issuecomment-1670085440
// Needed for `'process.env.NODE_ENV': JSON.stringify(mode),` in vite.config
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    })
  )
);
