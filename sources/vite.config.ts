import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build of Synapse Lite into ONE self-contained HTML file: scripts, styles,
 * fonts and icon are inlined (no CDN, no other file), so that the file can be
 * opened directly from the shared folder (file://) in Chrome or Edge.
 * scripts/publish.mjs then copies dist/index.html to "../Synapse Lite.html".
 */
export default defineConfig({
    base: './',
    plugins: [vue(), viteSingleFile({ removeViteModuleLoader: true })],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        target: 'es2020',
        // Everything inline, fonts included.
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 2000,
        reportCompressedSize: false,
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    },
});
