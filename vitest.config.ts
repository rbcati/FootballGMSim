import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  test: {
    include: [
      'src/**/*.test.{js,jsx,ts,tsx}',
      'tests/unit/**/*.test.{js,jsx,ts,tsx}',
    ],
    exclude: [
      'tests/e2e/**',
      'tests/**/*.spec.{js,jsx,ts,tsx}',
      'node_modules/**',
      'dist/**',
    ],
    environment: 'node',
  },
});
