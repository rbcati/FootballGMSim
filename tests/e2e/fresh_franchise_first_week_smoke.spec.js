import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

test('fresh franchise first week smoke', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByTestId('start-new-franchise-cta')).toBeVisible({ timeout: 60000 });
  await launchFranchise(page);

  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  const advanceBtn = page.getByRole('button', { name: /advance week|simulate week|simulate/i }).first();
  await expect(advanceBtn).toBeVisible();
  await advanceBtn.click();

  await expect(page.getByText(/Week Results|Recent Results|Last Result/i).first()).toBeVisible({ timeout: 60000 });
  const resultLink = page.getByRole('button', { name: /game book|box score/i }).first();
  await expect(resultLink).toBeVisible({ timeout: 60000 });
  await resultLink.click();

  await expect(page.getByText(/Final|Box Score|Game Book/i).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Detailed box score data was not recorded for this game\.|Q1|Passing|Rushing/i).first()).toBeVisible();

  const backBtn = page.getByRole('button', { name: /back|close|return/i }).first();
  if (await backBtn.isVisible()) await backBtn.click();
  await expect(page.getByTestId('app-shell-ready')).toBeVisible();

  expect(consoleErrors.join('\n')).not.toContain('Uncaught');
});
