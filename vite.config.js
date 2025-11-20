import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',

  // Dev server configuration
  server: {
    port: 3000,
    open: '/template-full.html'
  },

  build: {
    outDir: '../dist/assets',
    emptyOutDir: false, // Don't clear dist (build.js manages content)
    manifest: true, // Generate manifest.json for build.js

    rollupOptions: {
      input: {
        free: resolve(__dirname, 'src/entries/free.js'),
        premium: resolve(__dirname, 'src/entries/premium.js'),
        styles: resolve(__dirname, 'src/styles.css')
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash][extname]'
      }
    }
  }
});
