import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

async function simToPhase(page, targetPhase, timeout = 180000) {
  await page.evaluate((phase) => {
    window.gameController.simToPhase(phase);
  }, targetPhase);
  await page.waitForFunction(
    (phase) => window?.state?.league?.phase === phase,
    targetPhase,
    { timeout },
  );
}

test.describe('Phase hydration regression', () => {
  test('flow A/D: season pipeline reaches a usable draft and exits cleanly', async ({ page }) => {
    await launchFranchise(page);

    await simToPhase(page, 'offseason');
    await expect
      .poll(async () => page.evaluate(() => window?.state?.league?.phase))
      .toBe('offseason_resign');

    await page.evaluate(() => window.gameController.advanceOffseason());
    await page.waitForFunction(() => window?.state?.league?.phase === 'free_agency', { timeout: 120000 });

    await page.evaluate(() => {
      for (let i = 0; i < 7; i += 1) window.gameController.advanceFreeAgencyDay();
    });
    await page.waitForFunction(() => window?.state?.league?.phase === 'draft', { timeout: 120000 });

    await goToTab(page, 'draft');
    await expect(page.getByText('NFL Draft').first()).toBeVisible();
    await expect(page.getByText(/Draft data is still initializing/i)).toHaveCount(0);

    await page.evaluate(() => window.gameController.simDraftPick());
    await page.waitForFunction(
      () => {
        const phase = window?.state?.league?.phase;
        return phase === 'preseason' || phase === 'draft';
      },
      { timeout: 180000 },
    );
  });

  test('flow B/C: standings and leaders keep phase-aware sources', async ({ page }) => {
    await launchFranchise(page);

    await goToTab(page, 'standings');
    await expect(page.getByText(/Current standings/i).first()).toBeVisible();

    await goToTab(page, 'league-leaders');
    await expect(page.getByText(/Showing current regular-season leaders/i).first()).toBeVisible();

    await simToPhase(page, 'offseason');

    await goToTab(page, 'standings');
    await expect(page.getByText(/Final regular season standings|Previous season final standings/i).first()).toBeVisible();

    await goToTab(page, 'league-leaders');
    await expect(page.getByText(/last completed regular-season leaders/i).first()).toBeVisible();
    await expect(page.locator('.standings-table tbody tr')).toHaveCount(10);
  });
});
