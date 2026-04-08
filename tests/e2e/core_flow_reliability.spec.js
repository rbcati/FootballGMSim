import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek } from './helpers/franchise.js';

test.describe('Core flow reliability', () => {
  test('weekly hub completed game opens working box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await page.getByRole('button', { name: 'Weekly Hub' }).first().click();
    await page.getByRole('button', { name: /Review box score/i }).first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
    await expect(page.getByText('Team comparison').first()).toBeVisible();
  });

  test('schedule completed game opens box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await page.getByRole('button', { name: 'Schedule' }).first().click();
    await page.locator('.matchup-card.clickable-card').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
  });

  test('save delete and recreate slot flow', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await launchFranchise(page);
    await page.getByRole('button', { name: /Save Slots/i }).first().click();
    await page.getByRole('button', { name: /^Delete$/ }).first().click();

    await expect(page.getByText('This franchise slot is ready for a new dynasty.').first()).toBeVisible();
    await page.getByRole('button', { name: /Start New Franchise/i }).first().click();
    await expect(page.getByText(/Choose your franchise/i).first()).toBeVisible();
  });

  test('trade deadline messaging and lockout', async ({ page }) => {
    await launchFranchise(page);

    await page.evaluate(() => {
      window.gameController.updateSettings({ tradeDeadlineWeek: 1 });
    });
    await page.waitForFunction(() => Number(window?.state?.league?.tradeDeadline?.deadlineWeek) === 1);

    await simulateSingleWeek(page);
    await page.getByRole('button', { name: 'Trades' }).first().click();

    await expect(page.getByText(/trade market is locked/i).first()).toBeVisible();
  });
});
