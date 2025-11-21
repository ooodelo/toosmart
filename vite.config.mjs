import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';

export default defineConfig({
  root: 'src',

  // Dev server configuration
  server: {
    port: 3000,
    open: '/template.html'
  },

  plugins: [
    handlebars({
      partialDirectory: resolve(__dirname, 'src/partials'),
    }),
  ],

  build: {
    outDir: '../dist/assets',
    emptyOutDir: false, // Don't clear dist (build.js manages content)
    manifest: true, // Generate manifest.json for build.js

    rollupOptions: {
      input: {
        free: resolve(__dirname, 'src/entries/free.js'),
        premium: resolve(__dirname, 'src/entries/premium.js'),
        styles: resolve(__dirname, 'src/styles.css'),
        template: resolve(__dirname, 'src/template.html'),
        templatePaywall: resolve(__dirname, 'src/template-paywall.html'),
        templateIndex: resolve(__dirname, 'src/template-index.html'),
        templateRecommendations: resolve(__dirname, 'src/template-recommendations.html')
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash][extname]'
      }
    }
  }
});
