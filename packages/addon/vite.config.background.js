import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        lib: {
            entry: fileURLToPath(new URL('src/background.ts', import.meta.url)),
            name: 'ExtensionBackground',
            fileName: () => 'background.js', // Ensure output is background.js
            formats: ['cjs'], // Output CommonJS for .js extension
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
});
