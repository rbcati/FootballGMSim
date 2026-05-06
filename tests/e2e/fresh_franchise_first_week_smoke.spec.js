import { test, expect } from '@playwright/test';
import { goToTab, launchFranchise } from './helpers/franchise.js';

const SMOKE_TIMEOUT = 90000;

test.setTimeout(120000);

test('fresh franchise first week smoke', async ({ page, context }) => {
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await context.clearCookies();
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await launchFranchise(page);
  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByText(/No league state received/i)).toHaveCount(0);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible();
  await expect(page.getByText(/\b[A-Z]{2,4}\s*\(\d+-\d+\)/).first()).toBeVisible();

  const closeChangelog = page.getByLabel('Close changelog');
  if (await closeChangelog.isVisible().catch(() => false)) {
    await closeChangelog.click();
  }

  const advanceBtn = page.getByTestId('advance-week-cta');
  await expect(advanceBtn).toBeVisible();
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);
  await advanceBtn.click();
  const skipPrompt = page.getByRole('button', { name: /Simulate \(Skip\)/i });
  await skipPrompt.click({ timeout: 10000 }).catch(() => {});
  await page.waitForFunction(
    (baseline) => {
      const state = window?.state;
      const week = state?.league?.week ?? baseline;
      const hasResults = Array.isArray(state?.lastResults) && state.lastResults.length > 0;
      return !state?.busy && !state?.simulating && (week > baseline || hasResults);
    },
    startWeek,
    { timeout: SMOKE_TIMEOUT },
  );
  await goToTab(page, 'weekly-results');

  await expect(page.getByTestId('weekly-results')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('user-game-result-card')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('user-game-result-card')).toContainText(/\b\d+\s*-\s*\d+\b/);
  const completedGameLink = page.getByTestId('game-book-primary-cta').first();
  await expect(completedGameLink).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await completedGameLink.click();

  await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-decision-summary')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await page.getByTestId('return-to-hq').click();
  if (!(await page.getByTestId('franchise-hq').isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.getByRole('button', { name: /^Back to HQ$/i }).click();
  }
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-last-result')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-next-action')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await page.reload();
  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-last-result')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  expect(consoleErrors.join('\n')).not.toMatch(/Uncaught|TypeError|ReferenceError/);
});
