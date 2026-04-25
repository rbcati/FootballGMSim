import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { launchFranchise } from './helpers/franchise.js';

for (const viewport of [
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'narrow-360', width: 360, height: 780 },
]) {
  test(`${viewport.name}: HQ shows weekly command center essentials`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await launchFranchise(page);

    await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Last Result/i).first()).toBeVisible();
    await expect(page.getByText(/Coordinator Brief|Weekly Intelligence|Opponent Intel/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Advance Week/i })).toBeVisible();

    for (const label of ['Game Plan', 'Set Lineup', 'Training', 'Scout Opponent']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible();
    }

    const advance = page.getByRole('button', { name: /Advance Week/i });
    await expect(advance).toBeEnabled();
    await expect(advance).toBeInViewport();
    await expect(page.locator('html, body')).not.toContainText('Something went wrong');
  });
}

test('HQ action buttons navigate out/back and preserve team context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const baselineUserTeamId = await page.evaluate(() => window?.state?.league?.userTeamId ?? null);

  const steps = [
    { action: /Game Plan/i, tab: 'game-plan' },
    { action: /Set Lineup/i, tab: 'roster' },
    { action: /Training/i, tab: 'training' },
    { action: /Scout Opponent/i, tab: 'weekly-prep' },
  ];

  for (const step of steps) {
    await page.getByRole('button', { name: step.action }).first().click();
    await expect(page.locator(`[data-testid="section-tab-${step.tab}"][aria-current="page"]`)).toBeVisible();
    await page.getByRole('button', { name: /Home/i }).first().click();
    await expect(page.locator('[data-testid="section-tab-hq"][aria-current="page"]')).toBeVisible();
  }

  await expect.poll(async () => page.evaluate(() => window?.state?.league?.userTeamId ?? null)).toBe(baselineUserTeamId);
  await expect(page.locator('html, body')).not.toContainText('Something went wrong');
});

test('HQ has no critical axe accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include('.franchise-command-center')
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
