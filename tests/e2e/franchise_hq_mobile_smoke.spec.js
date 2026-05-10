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
    await expect(page.getByText(/Game Plan Impact/i).first()).toBeVisible();
    await expect(page.getByTestId('advance-week-cta')).toBeVisible();

    for (const label of ['Game Plan', 'Set Lineup', 'Training', 'Scout Opponent']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible({ timeout: 30000 });
    }

    const advance = page.getByTestId('advance-week-cta');
    await expect(advance).toBeEnabled();
    await advance.scrollIntoViewIfNeeded();
    await expect(advance).toBeInViewport();

    const noOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth <= doc.clientWidth + 1;
    });
    expect(noOverflow).toBeTruthy();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
}

test('HQ action buttons navigate out/back and preserve team context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const baselineUserTeamId = await page.evaluate(() => window?.state?.league?.userTeamId ?? null);

  const steps = [
    { action: /Game Plan/i, screen: page.locator('.app-game-plan-screen') },
    { action: /Set Lineup/i, screen: page.locator('#roster') },
    { action: /Training/i, screen: page.getByText(/Drills Remaining/i) },
    { action: /Scout Opponent/i, screen: page.locator('.weekly-prep-screen') },
  ];

  for (const step of steps) {
    await page.getByRole('button', { name: step.action }).first().click();
    await expect(step.screen).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Back to HQ/i }).first().click();
    await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 15000 });
  }

  await expect.poll(async () => page.evaluate(() => window?.state?.league?.userTeamId ?? null)).toBe(baselineUserTeamId);
  await expect(page.locator('body')).not.toContainText('Something went wrong');
});

test('HQ has no critical axe accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFranchise(page);
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include('.franchise-command-center')
    .analyze();
  const criticalOnly = accessibilityScanResults.violations.filter((v) => v.impact === 'critical');
  expect(criticalOnly).toEqual([]);
});
