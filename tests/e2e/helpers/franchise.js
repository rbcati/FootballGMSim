import { expect } from '@playwright/test';

export async function launchFranchise(page) {
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  const hasHeader = await page.locator('.app-header').first().isVisible().catch(() => false);
  if (hasHeader) return;

  const createVisible = await page.isVisible('.btn-primary:has-text("New Career"), .sm-create-btn').catch(() => false);
  if (createVisible) {
    await page.click('.btn-primary:has-text("New Career"), .sm-create-btn');
  }

  const teamCard = page.locator('.team-select-btn, .team-card').first();
  if (await teamCard.isVisible().catch(() => false)) {
    await teamCard.click();
    const continueBtn = page.locator('button:has-text("Continue")');
    const continueCount = await continueBtn.count();
    for (let i = 0; i < Math.min(2, continueCount); i += 1) {
      await continueBtn.nth(0).click();
      await page.waitForTimeout(350);
    }
    const startBtn = page.locator('button:has-text("Start Dynasty")').first();
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
  }

  await page.waitForSelector('.app-header', { state: 'visible', timeout: 60000 });
  await expect(page.locator('.app-header')).toBeVisible();
}

export async function simulateSingleWeek(page) {
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);
  await page.evaluate(() => {
    const btn = document.querySelector('.app-advance-btn');
    if (btn) btn.click();
    else if (window.handleGlobalAdvance) window.handleGlobalAdvance();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const skip = Array.from(document.querySelectorAll('button')).find((b) => b.innerText?.includes('Simulate (Skip)'));
    if (skip) skip.click();
  });
  await page.waitForFunction((baseline) => (window?.state?.league?.week ?? baseline) > baseline, startWeek, { timeout: 90000 });
}
