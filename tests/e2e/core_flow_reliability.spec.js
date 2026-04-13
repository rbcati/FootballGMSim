import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, goToTab } from './helpers/franchise.js';

test.describe('Core flow reliability', () => {
  test('refactored shell navigation paths remain reachable', async ({ page }) => {
    await launchFranchise(page);

    await goToTab(page, 'hq');
    await expect(page.locator('[data-testid="section-tab-hq"][aria-current="page"]')).toBeVisible();

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

    await page.locator('[data-testid="nav-history"], [data-testid="primary-nav-history"]').first().click();
    await page.locator('[data-testid="section-tab-history-hub"]').first().click();
    await expect(page.getByText('History Hub').first()).toBeVisible();
  });

  test('weekly hub completed game opens working box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'hq');
    await page.locator('[data-testid="recent-game-box-score-trigger"]').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
    await expect(page.getByText('Team comparison').first()).toBeVisible();
  });

  test('schedule completed game opens box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'schedule');
    await page.locator('.matchup-card.clickable-card').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
  });

  test('recent games card opens archived box score', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page);

    await goToTab(page, 'hq');
    await page.locator('[data-testid="recent-game-card"]').first().click();
    await expect(page.getByText('Final Game Book').first()).toBeVisible();
  });

  test('save delete and recreate slot flow', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await launchFranchise(page);
    await page.getByRole('button', { name: /Save Slots/i }).first().click();
    await page.getByRole('button', { name: /^Delete$/ }).first().click();

    await expect(page.getByText('This franchise slot is ready for a new dynasty.').first()).toBeVisible();
    await page.locator('[data-testid="start-new-franchise-cta"]').first().click();
    await expect(page.getByText(/Choose your franchise/i).first()).toBeVisible();
  });

  test('trade deadline messaging and lockout', async ({ page }) => {
    await launchFranchise(page);

    await page.evaluate(() => {
      window.gameController.updateSettings({ tradeDeadlineWeek: 1 });
    });
    await page.waitForFunction(() => Number(window?.state?.league?.tradeDeadline?.deadlineWeek) === 1);

    await simulateSingleWeek(page);
    await goToTab(page, 'transactions');

    await expect(page.getByText(/trade market is locked/i).first()).toBeVisible();
  });
});
