import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { launchFranchise } from './helpers/franchise.js';

for (const viewport of [
  { name: 'small-phone', width: 375, height: 812 },
  { name: 'tablet', width: 820, height: 1180 },
]) {
  test(`${viewport.name}: HQ shows weekly command center essentials`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await launchFranchise(page);

    await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible({ timeout: 60000 });
    await expect(page.getByText('Next Opponent').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Advance Week/i })).toBeVisible();

    for (const label of ['Game Plan', 'Set Lineup', 'Training', 'Scout Opponent']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible();
    }

    const advance = page.getByRole('button', { name: /Advance Week/i });
    await expect(advance).toBeEnabled();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
}

test('HQ action buttons preserve shell routing and remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const baselineUserTeamId = await page.evaluate(() => window?.state?.league?.userTeamId ?? null);

  await page.getByRole('button', { name: /Game Plan/i }).first().click();
  await expect(page.locator('[data-testid="section-tab-game-plan"][aria-current="page"]')).toBeVisible();

  await page.getByRole('button', { name: /Set Lineup/i }).first().click();
  await expect(page.locator('[data-testid="section-tab-roster"][aria-current="page"]')).toBeVisible();

  await page.getByRole('button', { name: /Training/i }).first().click();
  await expect(page.locator('[data-testid="section-tab-training"][aria-current="page"]')).toBeVisible();

  await page.getByRole('button', { name: /Home/i }).first().click();
  await expect(page.locator('[data-testid="section-tab-hq"][aria-current="page"]')).toBeVisible();

  await page.getByRole('button', { name: /Scout Opponent/i }).first().click();
  await expect(page.locator('[data-testid="section-tab-weekly-prep"][aria-current="page"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window?.state?.league?.userTeamId ?? null)).toBe(baselineUserTeamId);
});

test('HQ has no critical axe accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include('.franchise-command-center')
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
