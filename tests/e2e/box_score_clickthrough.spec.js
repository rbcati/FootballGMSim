import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, selectScheduleWeekTab } from './helpers/franchise.js';

test.describe('Shared box score detail', () => {
  test('schedule score row opens Game Detail box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });

    const scheduleWeek = await page.evaluate(() => Math.max(1, (window?.state?.league?.week ?? 2) - 1));
    await selectScheduleWeekTab(page, scheduleWeek);

    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book')).toBeVisible();
    await expect(page.getByTestId('game-book-quarter-scores')).toBeVisible();
  });

  test('completed game detail remains available after reload', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });

    const scheduleWeekB = await page.evaluate(() => Math.max(1, (window?.state?.league?.week ?? 2) - 1));
    await selectScheduleWeekTab(page, scheduleWeekB);
    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book')).toBeVisible();

    await page.reload();
    await launchFranchise(page);
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('franchise-hq')).toBeVisible();
  });
});
