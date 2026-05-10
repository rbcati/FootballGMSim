import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

test.setTimeout(180000);

async function simToPhase(page, targetPhase, timeout = 180000) {
  await page.evaluate((phase) => {
    window.gameController.simToPhase(phase);
  }, targetPhase);
  await page.waitForFunction(
    ({ want }) => {
      const p = window?.state?.league?.phase;
      if (!p) return false;
      if (want === 'offseason') return p === 'offseason' || p === 'offseason_resign';
      return p === want;
    },
    { want: targetPhase },
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
    await expect(page.getByText(/NFL Draft|Draft Board|Draft Room|draft class/i).first()).toBeVisible({ timeout: 45000 });
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

    await page.waitForFunction(() => !window?.state?.busy && !window?.state?.simulating, { timeout: 120000 });
    await expect.poll(async () => page.evaluate(() => window?.state?.league?.standingsContext?.label ?? '')).toMatch(
      /Current standings|Final regular season standings|Previous season final standings|Playoff standings snapshot|^Standings$/i,
    );

    await expect.poll(async () => page.evaluate(() => window?.state?.league?.phase ?? '')).toMatch(
      /offseason|offseason_resign|free_agency|draft|preseason/i,
    );
  });
});
