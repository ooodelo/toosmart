import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';
import { JSDOM } from 'jsdom';

export default defineConfig({
  root: 'src',
  publicDir: 'public',  // Serves src/public as root for /shared/recommendations.json
  base: '/assets/',     // Base path for production build (fixes dynamic import paths)

  // Dev server configuration
  server: {
    port: 3000,
    open: '/template.html'
  },

  // Transpile modern syntax for older Safari
  esbuild: {
    target: 'safari13'
  },

  plugins: [
    handlebars({
      partialDirectory: resolve(__dirname, 'src/partials'),
    }),
    {
      name: 'inject-hidden-modal',
      transformIndexHtml(html) {
        // Parse HTML with JSDOM
        const dom = new JSDOM(html);
        const { document } = dom.window;

        // Find all modals and cookie banners that should be hidden
        const elementsToHide = document.querySelectorAll('.modal, .cookie-banner');

        let modified = false;
        elementsToHide.forEach(el => {
          if (!el.hasAttribute('hidden')) {
            el.setAttribute('hidden', '');
            modified = true;
          }
        });

        // Return serialized HTML if modified, otherwise original
        return modified ? dom.serialize() : html;
      }
    }
  ],

  build: {
    target: 'safari13',
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
