import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // const env = loadEnv(mode, process.cwd());
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
      alias: {
        '@send-frontend': resolve(__dirname, 'node_modules/send-frontend/src'),
        '@addon': resolve(__dirname, 'src'),
      },
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('src/background.ts', import.meta.url)),
        name: 'ExtensionBackground',
        fileName: () => 'background.js', // Ensure output is background.js
        formats: ['es'],
      },
      minify: true,
      sourcemap: true,
      outDir: 'dist/background',
      // rollupOptions: {
      //     output: {
      //         manualChunks: (id) => {
      //             if (id.includes('node_modules')) {
      //                 // Split vendor modules into separate chunks
      //                 const parts = id.split('/');
      //                 const length = parts.length;
      //                 return `vendor_${parts[length - 3]}-${parts[length - 2]}-${parts[length - 1]}`;
      //             }
      //         },
      //     },
      // },
    },
  };
});
