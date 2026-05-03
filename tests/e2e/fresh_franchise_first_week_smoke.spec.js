import { test, expect } from '@playwright/test';

const SMOKE_TIMEOUT = 90000;

test('fresh franchise first week smoke', async ({ page, context }) => {
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await context.clearCookies();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();

  const startCta = page.getByTestId('start-new-franchise-cta');
  await expect(startCta).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await startCta.click();

  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByText(/No league state received/i)).toHaveCount(0);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible();
  await expect(page.getByText(/\b[A-Z]{2,4}\s*\(\d+-\d+\)/).first()).toBeVisible();

  const advanceBtn = page.getByTestId('advance-week-cta');
  await expect(advanceBtn).toBeVisible();
  await advanceBtn.click();

  const completedGameLink = page.getByTestId('completed-game-link').first();
  await expect(completedGameLink).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await completedGameLink.click();

  await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await page.getByTestId('return-to-hq').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await page.reload();
  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  expect(consoleErrors.join('\n')).not.toMatch(/Uncaught|TypeError|ReferenceError/);
});
