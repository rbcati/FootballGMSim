import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, goToTab, selectScheduleWeekTab } from './helpers/franchise.js';

test.describe('Core flow reliability', () => {
  test('refactored shell navigation paths remain reachable', async ({ page }) => {
    await launchFranchise(page);

    await goToTab(page, 'hq');
    await expect(page.getByTestId('franchise-hq')).toBeVisible();

    await goToTab(page, 'roster');
    await expect(page.getByText('Roster').first()).toBeVisible();

    await goToTab(page, 'game-plan');
    await expect(page.getByText('Game Plan').first()).toBeVisible();

    await goToTab(page, 'standings');
    await expect(page.getByText('Standings').first()).toBeVisible();

    await goToTab(page, 'stats');
    await expect(page.getByText('Player Stats').first()).toBeVisible();

    await goToTab(page, 'free-agency');
    await expect(page.getByText('Free Agency').first()).toBeVisible();

    await goToTab(page, 'history-hub');
    await expect(page.getByText('History Hub').first()).toBeVisible();
  });

  test('weekly hub completed game opens working box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    const scheduleWeek = await page.evaluate(() => Math.max(1, (window?.state?.league?.week ?? 2) - 1));
    await selectScheduleWeekTab(page, scheduleWeek);
    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book')).toBeVisible();
    await expect(page.getByTestId('game-book-team-comparison')).toBeVisible();
  });

  test('schedule completed game opens box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    const scheduleWeek = await page.evaluate(() => Math.max(1, (window?.state?.league?.week ?? 2) - 1));
    await selectScheduleWeekTab(page, scheduleWeek);
    await page.locator('.premium-game-card.is-completed.is-clickable .premium-game-card__interactive').first().click();
    await expect(page.getByTestId('game-book')).toBeVisible();
  });

  test('recent games card opens archived box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'hq');
    const filmGameBook = page.locator('[data-testid="season-pulse"]').getByRole('button', { name: /Open Game Book/i }).first();
    await expect(filmGameBook).toBeVisible({ timeout: 30000 });
    await filmGameBook.click();
    await expect(page.getByTestId('game-book')).toBeVisible();
  });

  test('save delete and recreate slot flow', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await launchFranchise(page);
    await page.waitForFunction(() => !window?.state?.busy && !window?.state?.simulating, { timeout: 60000 });
    await page.locator('details.app-overflow-menu summary').click();
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.app-overflow-item')].find((el) => /Save Slots/i.test(el.textContent ?? ''));
      (btn)?.click();
    });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('app-save-slots')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-testid="app-save-slots"]').getByRole('button', { name: /^Delete$/ }).first().click({ force: true });

    await expect(page.getByText(/No franchise started yet/i).first()).toBeVisible();
  });

  test('trade deadline messaging and lockout', async ({ page }) => {
    await launchFranchise(page);

    await page.evaluate(() => {
      window.gameController.updateSettings({ tradeDeadlineWeek: 1 });
    });
    await page.waitForFunction(() => Number(window?.state?.league?.tradeDeadline?.deadlineWeek) === 1);

    await simulateSingleWeek(page);
    await goToTab(page, 'transactions');
    await page.getByRole('button', { name: /^Builder$/i }).click();

    await expect(
      page.getByText(/trade window closed|trading actions are locked|trade deadline passed|deadline passed after week/i).first(),
    ).toBeVisible({ timeout: 30000 });
  });
});
