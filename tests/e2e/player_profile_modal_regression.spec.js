import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

test.describe('Player profile modal regression', () => {
  test('roster player click opens profile without crashing', async ({ page }) => {
    await launchFranchise(page);
    await goToTab(page, 'roster');
    const loadingRoster = page.getByText('Loading roster…');
    if (await loadingRoster.isVisible().catch(() => false)) {
      await expect(loadingRoster).toBeHidden({ timeout: 60000 });
    }

    await page.evaluate(() => {
      const rows = document.querySelectorAll('#roster .standings-table tbody tr');
      for (const row of rows) {
        const btn = row.querySelector('td button');
        if (btn) {
          btn.click();
          return;
        }
      }
    });

    await expect(page.getByTestId('player-profile')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Player profile unavailable/i)).toHaveCount(0);
  });
});
