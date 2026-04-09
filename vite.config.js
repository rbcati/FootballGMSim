import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

function injectSwVersion() {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    generateBundle(_, bundle) {
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
      const deployRef = process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || Date.now().toString();
      const cacheVersion = `fgm-${pkg.version}-${String(deployRef).slice(0, 12)}`;

      const swAsset = Object.values(bundle).find(
        (item) => item?.type === 'asset' && item?.fileName === 'sw.js',
      );
      if (!swAsset || typeof swAsset.source !== 'string') return;
      swAsset.source = swAsset.source.replace(/const CACHE_NAME = 'fgm-dev';/, `const CACHE_NAME = '${cacheVersion}';`);
    },
  };
}

export default defineConfig({
  plugins: [
    injectSwVersion(),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
});
