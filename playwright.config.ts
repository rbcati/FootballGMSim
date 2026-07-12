import { defineConfig } from '@playwright/test';

const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined;
// Sandboxed CI images often pre-install a full Chromium at a fixed path
// instead of the per-revision headless shell; point the runner at it without
// changing default behavior anywhere else.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
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
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
    ...mobileViewport,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
