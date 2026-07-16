import { test, expect } from '@playwright/test';
import { goToTab, launchFranchise } from './helpers/franchise.js';

const SMOKE_TIMEOUT = 90000;

test.setTimeout(120000);

test('league pulse appears after one weekly advance and opens full timeline', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await launchFranchise(page);
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);
  await page.getByTestId('advance-week-cta').click();

  const gateAdvanceBtn = page.getByTestId('gate-advance-anyway-btn');
  if (await gateAdvanceBtn.isVisible().catch(() => false)) {
    await gateAdvanceBtn.click({ timeout: 2000 });
  }

  const skipBtn = page.getByRole('button', { name: /Simulate \(Skip\)/i });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click({ timeout: 10000 });
  }

  await page.waitForFunction(
    (baseline) => {
      const state = window?.state;
      const week = state?.league?.week ?? baseline;
      const hasPulse = Array.isArray(state?.league?.newsItems) && state.league.newsItems.some((item) => item?.source === 'league_pulse_v1');
      return !state?.busy && !state?.simulating && (week > baseline || hasPulse);
    },
    startWeek,
    { timeout: SMOKE_TIMEOUT },
  );

  await expect(page.getByText(/League Pulse/i).first()).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await page.getByRole('button', { name: /Open full pulse/i }).click();
  await expect(page.getByRole('button', { name: /Pulse/i }).first()).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await goToTab(page, 'hq');
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
});
