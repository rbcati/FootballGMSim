import { defineConfig } from 'vite';

export default defineConfig({
  // Root directory of the project
  root: './',

  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext', // Support Top-level await and modern workers
  },

  // Worker configuration
  worker: {
    format: 'es', // Use ES modules for workers
  },

  // Server configuration
  server: {
    open: true,
    port: 3000,
  }
});
