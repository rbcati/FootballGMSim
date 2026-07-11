import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Dedicated config for the Long-Save Durability Harness focused tests.
 * Kept separate from vitest.config.ts so the main `test:unit` suite is
 * unchanged and the durability check can be run/placed on its own CI tier
 * (see docs/long-save-durability-harness.md). Run via `npm run durability:test`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/ui', import.meta.url)) },
  },
  test: {
    include: ['tests/durability/**/*.test.{js,ts}'],
    environment: 'node',
    // The bounded real-lifecycle smoke boots the real worker + sims to playoffs.
    testTimeout: 200_000,
    hookTimeout: 200_000,
  },
});
