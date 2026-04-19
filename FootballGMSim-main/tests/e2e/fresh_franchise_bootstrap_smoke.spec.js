import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

test('fresh franchise setup lands in playable HQ without render boundary', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await launchFranchise(page);

  await expect(page.locator('.app-header')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('text=Something went wrong')).toHaveCount(0);

  const leagueReady = await page.evaluate(() => {
    const league = window?.state?.league;
    if (!league) return false;
    return Array.isArray(league.teams) && league.teams.length > 0 && typeof league.phase === 'string' && Number.isFinite(Number(league.week ?? 1));
  });
  expect(leagueReady).toBeTruthy();

  await goToTab(page, 'transactions');
  await expect(page.locator('text=Trade Workspace')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=No offers right now')).toBeVisible();

  await goToTab(page, 'roster');
  await expect(page.locator('text=Roster')).toBeVisible({ timeout: 10000 });

  await goToTab(page, 'stats');
  await expect(page.locator('text=Player Stats')).toBeVisible({ timeout: 10000 });

  expect(pageErrors.join('\n')).not.toContain('leagueReady is not defined');
  expect(pageErrors.join('\n')).not.toContain('ReferenceError');
});
