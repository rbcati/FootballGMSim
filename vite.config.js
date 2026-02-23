import { defineConfig }    from 'vite';
import react               from '@vitejs/plugin-react';
import { createHash }      from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve }         from 'path';
import { fileURLToPath }   from 'url';
import { dirname }         from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * injectSwVersion
 *
 * After `vite build` writes the bundle, this plugin:
 *  1. Computes a short SHA-256 hash of all emitted filenames (which are
 *     content-addressed by Vite, so the hash changes whenever any source
 *     file changes).
 *  2. Patches `dist/sw.js`, replacing the literal `'fgm-dev'` CACHE_NAME
 *     with `'fgm-<hash>'`.
 *
 * Why per-build hashing?
 *  - Forces the SW activate phase to delete the previous cache → stale
 *    assets never sneak through on Safari / iOS PWA.
 *  - Triggers the `hadOldCache` UPDATE_AVAILABLE broadcast reliably.
 *  - Keeps storage tidy: only the current build's assets stay on-device.
 */
function injectSwVersion() {
  let buildHash = 'dev';

  return {
    name:  'inject-sw-version',
    apply: 'build',          // only runs during `vite build`, not `vite dev`

    generateBundle(_options, bundle) {
      // Sort filenames for a stable hash regardless of emit order
      const filenames = Object.values(bundle)
        .map((chunk) => chunk.fileName)
        .sort()
        .join('\n');
      buildHash = createHash('sha256')
        .update(filenames)
        .digest('hex')
        .slice(0, 8);
    },

    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      try {
        let src = readFileSync(swPath, 'utf-8');
        // Replace the placeholder CACHE_NAME with the build-specific hash.
        // The regex is loose enough to match both 'fgm-dev' and any previous
        // 'fgm-xxxxxxxx' value so re-running the build is idempotent.
        src = src.replace(
          /const CACHE_NAME\s*=\s*'fgm-[^']*'/,
          `const CACHE_NAME = 'fgm-${buildHash}'`
        );
        writeFileSync(swPath, src, 'utf-8');
        console.log(`\n[vite-inject-sw] Cache version → fgm-${buildHash}`);
      } catch (err) {
        // Non-fatal — worst case the dev fallback 'fgm-dev' is used
        console.warn('[vite-inject-sw] Could not patch dist/sw.js:', err.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    injectSwVersion(),
  ],

  root:      './',
  publicDir: 'public',

  build: {
    outDir:    'dist',
    emptyOutDir: true,
    target:    'esnext',
  },

  worker: {
    format: 'es',
  },

  server: {
    open: true,
    port: 3000,
    headers: {
      // Allow the SW to intercept requests from the root scope in dev
      'Service-Worker-Allowed': '/',
    },
  },

  preview: {
    port: 4173,
  },
});
