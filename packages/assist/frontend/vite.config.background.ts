import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
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
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // Split vendor modules into separate chunks
              const parts = id.split('/');
              const length = parts.length;
              return `vendor_${parts[length - 3]}-${parts[length - 2]}-${parts[length - 1]}`;
            }
          },
        },
      },
    },
  };
});
