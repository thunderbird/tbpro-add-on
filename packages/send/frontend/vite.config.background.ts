import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@send-frontend': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('src/background.ts', import.meta.url)),
        name: 'ExtensionBackground',
        // the proper extensions will be added
        fileName: 'background',
        formats: ['es'],
      },
      minify: true,
      sourcemap: true,
      outDir: 'dist/background',
    },
  };
});
