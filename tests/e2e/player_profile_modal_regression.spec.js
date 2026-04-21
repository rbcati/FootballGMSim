import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

test.describe('Player profile modal regression', () => {
  test('roster player click opens profile without crashing', async ({ page }) => {
    await launchFranchise(page);
    await goToTab(page, 'roster');

    const firstPlayerButton = page.locator('#roster button').filter({ hasText: /./ }).first();
    await expect(firstPlayerButton).toBeVisible();
    await firstPlayerButton.click();

    await expect(page.getByText(/OVR/i).first()).toBeVisible();
    await expect(page.getByText(/Pot:/i).first()).toBeVisible();
    await expect(page.getByText(/Player profile unavailable/i)).toHaveCount(0);

    // Close modal should remain functional.
    await page.getByRole('button', { name: '×' }).first().click();
  });
});
