import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile HQ shows weekly command center essentials', async ({ page }) => {
  await launchFranchise(page);

  await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Next Opponent').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Advance Week/i })).toBeVisible();

  await expect(page.getByText('Game Plan').first()).toBeVisible();
  await expect(page.getByText('Set Lineup').first()).toBeVisible();
  await expect(page.getByText('Training').first()).toBeVisible();
  await expect(page.getByText('Scout Opponent').first()).toBeVisible();

  const advance = page.getByRole('button', { name: /Advance Week/i });
  await expect(advance).toBeEnabled();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});
