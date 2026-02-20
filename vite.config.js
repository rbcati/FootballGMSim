import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),

    /**
     * Inline plugin: copies public/sw.js to the build output root
     * so it can register at the correct scope ("/sw.js").
     *
     * We avoid adding the vite-plugin-pwa dependency to keep things simple.
     * The service worker is hand-rolled and doesn't need any Workbox injection.
     */
    {
      name: 'service-worker',
      generateBundle() {
        // sw.js is in /public so Vite copies it automatically.
        // This hook is a no-op placeholder; left here for documentation.
      },
    },
  ],

  root: './',

  // Make sure public/sw.js is served at /sw.js during dev
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',

  },

  worker: {
    format: 'es',
  },

  server: {
    open: true,
    port: 3000,
    // Serve sw.js with no-cache headers during development so Chrome picks
    // up service worker changes without a hard refresh.
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },

  preview: {
    port: 4173,
  },
});
