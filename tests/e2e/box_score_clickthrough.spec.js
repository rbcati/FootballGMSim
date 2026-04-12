import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, goToTab } from './helpers/franchise.js';

test.describe('Shared box score detail', () => {
  test('schedule score row opens Game Detail box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'schedule');

    await page.locator('.schedule-game-card.played, .schedule-game-card').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
    await expect(page.getByText('Quarter-by-quarter').first()).toBeVisible();
  });

  test('completed game detail remains available after reload', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'schedule');
    await page.locator('.schedule-game-card.played, .schedule-game-card').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();

    await page.reload();
    await launchFranchise(page);
    await goToTab(page, 'schedule');
    await page.locator('.schedule-game-card.played, .schedule-game-card').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
  });
});
