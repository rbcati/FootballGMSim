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
      'tests/unit/**/*.spec.{js,jsx,ts,tsx}',
      'tests/integration/**/*.test.{js,jsx,ts,tsx}',
    ],
    exclude: [
      'tests/e2e/**',
      'tests/regression_edge_cases.spec.js',
      'tests/visual_check.spec.js',
      'tests/verify_juice.spec.js',
      'tests/perf_roster.spec.js',
      'tests/perf_football_db.spec.js',
      'tests/stress_test.spec.js',
      'tests/bug_hunt_live_game.spec.js',
      'tests/test_game_juice_logic.spec.js',
      'tests/race_condition.spec.js',
      'node_modules/**',
      'dist/**',
    ],
    environment: 'node',
  },
});
