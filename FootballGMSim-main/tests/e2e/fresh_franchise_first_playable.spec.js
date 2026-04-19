import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

test('fresh franchise first-playable path reaches HQ without render boundary overlay', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // open site + create new slot + start new franchise + complete setup
  await launchFranchise(page);

  // land on HQ/dashboard without render boundary
  await expect(page.locator('.app-header')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.franchise-hq, text=Franchise HQ')).toHaveCount(1);

  // verify no “Something went wrong” overlay
  await expect(page.locator('.app-error-boundary-overlay')).toHaveCount(0);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  const bootstrapState = await page.evaluate(() => {
    const league = window?.state?.league;
    if (!league) return { ready: false, reason: 'league missing' };
    const teams = Array.isArray(league.teams) ? league.teams : [];
    const hasUserTeam = teams.some((t) => Number(t?.id) === Number(league?.userTeamId));
    return {
      ready: teams.length > 0 && typeof league.phase === 'string' && Number.isFinite(Number(league.week ?? 1)) && hasUserTeam,
      reason: hasUserTeam ? '' : 'user team missing',
    };
  });
  expect(bootstrapState.ready, bootstrapState.reason).toBeTruthy();

  const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
  expect(combinedErrors).not.toContain('Something went wrong');
  expect(combinedErrors).not.toContain('ReferenceError');
  expect(combinedErrors).not.toContain('ErrorBoundary');
});
