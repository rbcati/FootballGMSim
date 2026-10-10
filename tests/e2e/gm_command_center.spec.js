import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

for (const width of [390, 430, 1280]) {
  test(`HQ weekly loop and league intelligence at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await launchFranchise(page);
    const changelog = page.getByLabel('Close changelog');
    if (await changelog.isVisible()) await changelog.click();
    const hq = page.getByTestId('franchise-hq');
    const advance = page.getByTestId('advance-week-cta');
    await expect(hq).toBeVisible();
    await expect(page.getByTestId('hq-next-action')).toContainText('Game plan not reviewed');
    await expect(advance).toBeEnabled();
    await expect(advance).toHaveText(/Play Week 1/);
    await expect(page.getByTestId('hq-last-result')).toHaveCount(0);
    await expect(page.getByText('No season stats yet.', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('hq-top-fresh.png') });
    for (let week = 1; week <= 2; week++) {
      await advance.scrollIntoViewIfNeeded();
      await expect(advance).toBeEnabled();
      await advance.click();
      const prompt = page.getByRole('dialog', { name: 'Play this week' });
      await expect(prompt.getByRole('button', { name: /^Watch Game/ })).toBeVisible();
      await expect(prompt.getByRole('button', { name: /^Quick Sim/ })).toBeVisible();
      await expect(prompt.locator('details')).not.toHaveAttribute('open', '');
      await prompt.getByRole('button', { name: /^Quick Sim/ }).click();
      await page.getByRole('button', { name: 'Open Final Game Book', exact: true }).click({ timeout: 60000 });
      await expect(page.getByTestId('postgame-result-banner')).toBeVisible();
      await page.getByRole('button', { name: /Back to Hub/ }).click();
      await page.waitForFunction((previous) => window.state?.league?.week > previous && !window.state?.busy && !window.state?.simulating, week, { timeout: 60000 });
      const summaryClose = page.getByTestId('post-game-summary-close');
      if (await summaryClose.isVisible()) await summaryClose.click();
      await goToTab(page, 'hq');
      await expect(page.getByTestId('hq-last-result')).toContainText(/[WLT] \d+–\d+ (vs|@)/);
      await expect(hq.locator('.hq-v2-leader b').filter({ hasText: /yds/ })).toHaveCount(6);
      await expect(page.getByTestId('hq-next-action')).toContainText('Game plan not reviewed');
      await expect(advance).toHaveText(new RegExp(`Play Week ${week + 1}`));
      await expect(advance).toBeEnabled();
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('hq-top.png') });
    await page.screenshot({ path: testInfo.outputPath('hq-full.png'), fullPage: true });
    await hq.getByRole('navigation', { name: 'Quick actions' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('hq-bottom.png') });
    if (width < 768) {
      await expect(page.locator('.app-header-left')).toBeHidden();
      await expect(page.locator('.team-summary-nav-card')).toBeHidden();
    }
    await page.getByRole('button', { name: /View Game Book/ }).click();
    await expect(page.getByTestId('game-book-final-score')).toBeVisible();
    await page.getByTestId('game-book-return').click();
    await expect(hq).toBeVisible();
    await hq.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Stats', exact: true }).click();
    await expect(page.locator('.league-stats-surface')).toBeVisible();
    await noOverflow(page);
    await page.locator('.league-stats-surface').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('stats.png') });
    await page.getByLabel('Search player stats').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('stats-rows.png') });
    if (width < 768) {
      const row = page.locator('.league-stats-surface .app-mobile-data-row').first();
      await expect(row.locator('strong')).toBeVisible();
      await row.getByRole('button').click();
      await expect(page.getByTestId('player-profile-summary')).toBeVisible();
      await page.locator('.player-profile-shell').getByRole('button', { name: 'Return to HQ', exact: true }).click();
    } else await goToTab(page, 'hq');
    await page.getByRole('button', { name: /AFC.*Standings|NFC.*Standings/ }).click();
    await expect(page.locator('.standings-center-division-grid')).toBeVisible();
    await noOverflow(page);
    await page.locator('.standings-center-division-grid').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('standings.png') });
    await page.locator('.league-hub-mobile-surface').getByRole('button', { name: 'Schedule / Results', exact: true }).click();
    await expect(page.locator('.schedule-center-screen')).toBeVisible();
    await page.getByRole('button', { name: '← Previous', exact: true }).click();
    await expect(page.locator('.schedule-center-screen')).toContainText('Completed games');
    await page.locator('.league-week-stepper').scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('schedule.png') });
  });
}
