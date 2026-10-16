import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

for (const width of [1280, 390]) {
  test(`scheme fit readout stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await launchFranchise(page);
    const teamNav = page.locator('[data-testid="nav-team"], [data-testid="primary-nav-team"]').first();
    if (await teamNav.isVisible()) await teamNav.click();
    else await page.getByRole('button', { name: 'Team', exact: true }).click();
    const lineup = page.getByTestId('lineup-command-center');
    await expect(lineup).toBeVisible();
    await expect(lineup.locator('.lineup-summary__schemes')).toContainText(/Good fit|Average fit|Poor fit/);
    await lineup.getByText('Compare scheme fits', { exact: true }).click();
    await expect(lineup.locator('.scheme-comparison')).toBeVisible();
    for (const row of await lineup.locator('.scheme-comparison strong').all()) {
      await expect(row).toContainText(/— (100|[1-9]?\d)$/);
      const box = await row.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await page.screenshot({ path: `test-results/scheme-fit-${width}.png`, fullPage: true });
  });
}
