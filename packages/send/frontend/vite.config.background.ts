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
      outDir: 'dist',
    },
  };
});
