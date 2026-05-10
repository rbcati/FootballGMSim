import { defineConfig } from '@playwright/test';

const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined;
const mobileViewport = process.env.PLAYWRIGHT_VIEWPORT === 'iphone'
  ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  : {};

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    ...(chromiumChannel ? { channel: chromiumChannel } : {}),
    ...mobileViewport,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
