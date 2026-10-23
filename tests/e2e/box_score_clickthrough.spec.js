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
    await page.getByRole('tab', { name: 'Players', exact: true }).click();
    await expect(page.getByTestId('game-book-player-stats')).toBeVisible();
    await expect(page.getByTestId('game-book-player-stats').getByTestId('game-book-player-link').first()).toBeVisible();
  });

  test('completed game detail remains available after reload', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });

    const scheduleWeekB = await page.evaluate(() => Math.max(1, (window?.state?.league?.week ?? 2) - 1));
    await selectScheduleWeekTab(page, scheduleWeekB);
    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book')).toBeVisible();
    const score = await page.getByTestId('game-book-final-score').textContent();
    await page.getByRole('tab', { name: 'Players', exact: true }).click();
    const players = page.getByTestId('game-book-player-stats');
    await expect(players.getByTestId('game-book-player-link').first()).toBeVisible();
    const before = await players.textContent();
    const saved = await page.evaluate(() => ({
      activeLeagueId: window.state.league.activeLeagueId,
      franchiseGenerationId: window.state.league.franchiseGenerationId,
    }));

    await page.reload();
    await page.waitForFunction(({ activeLeagueId, franchiseGenerationId }) => (
      window.state?.isHydrated && !window.state?.busy && !window.state?.simulating
      && window.state?.league?.activeLeagueId === activeLeagueId
      && window.state?.league?.franchiseGenerationId === franchiseGenerationId
    ), saved, { timeout: 60000 });
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('franchise-hq')).toBeVisible();
    await selectScheduleWeekTab(page, scheduleWeekB);
    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book-final-score')).toHaveText(score);
    await page.getByRole('tab', { name: 'Players', exact: true }).click();
    await expect(page.getByTestId('game-book-player-stats')).toHaveText(before);
  });
});
