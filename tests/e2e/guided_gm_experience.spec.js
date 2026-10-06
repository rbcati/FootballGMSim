import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

test.use({ hasTouch: true });

async function noOverflow(page, locator = page.locator('html')) {
  expect(await locator.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

for (const width of [390, 430, 1280]) {
  test(`guided GM hierarchy at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await launchFranchise(page);
    const changelog = page.getByLabel('Close changelog');
    if (await changelog.isVisible()) await changelog.click();
    await expect(page.getByTestId('franchise-hq')).toBeVisible();
    await page.waitForFunction(() => !window.state?.busy && !window.state?.simulating);
    const action = page.getByTestId('advance-week-cta');
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled({ timeout: 60000 });
    const mobile = width < 768;
    for (const selector of ['.app-header-left', '.team-summary-nav-card', '.franchise-status-pill-row', '.app-permanent-utility']) {
      if (mobile) await expect(page.locator(selector).first()).toBeHidden();
      else await expect(page.locator(selector).first()).toBeVisible();
    }
    if (mobile) {
      await expect(page.locator('.premium-bottom-nav')).toBeVisible();
      await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
      const compactTop = await action.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      // Restore the unchanged legacy chrome temporarily to compare document order.
      await page.evaluate(() => {
        document.querySelector('.app-shell').classList.remove('app-shell--hq');
        document.querySelector('.dashboard--hq').classList.remove('dashboard--hq');
      });
      const previousTop = await action.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(compactTop).toBeLessThan(previousTop);
      await page.screenshot({ path: testInfo.outputPath('hq-original-chrome.png') });
      await page.evaluate(() => {
        document.querySelector('.app-shell').classList.add('app-shell--hq');
        document.querySelector('.team-summary-nav-card').closest('.pfgm-density-surface').classList.add('dashboard--hq');
      });
      console.log(`HQ ${width}px: primary action document top ${previousTop} → ${compactTop}`);
      await expect(action).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath('hq.png') });
    await page.getByLabel('Action menu', { exact: true }).click();
    const theme = page.getByRole('button', { name: /^Switch theme/ }).filter({ visible: true });
    await expect(theme).toBeVisible();
    const previousTheme = await theme.getAttribute('aria-label');
    await theme.click();
    await expect(theme).not.toHaveAttribute('aria-label', previousTheme);
    await expect(page.getByRole('button', { name: 'Toggle sound effects', exact: true }).filter({ visible: true })).toBeVisible();
    const sound = page.getByRole('button', { name: 'Toggle sound effects', exact: true }).filter({ visible: true });
    const previousSound = await sound.textContent();
    await sound.click();
    await expect(sound).not.toHaveText(previousSound);
    await page.getByLabel('Action menu', { exact: true }).click();
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await noOverflow(page);

    await page.getByRole('button', { name: 'Team', exact: true }).filter({ visible: true }).click();
    await expect(page.locator('.app-header-left')).toBeVisible();
    await expect(page.locator('.team-summary-nav-card')).toBeVisible();
    await expect(page.getByTestId('lineup-what-matters')).toBeVisible();
    await expect(page.getByTestId('offense-lineup')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('lineup.png') });
    await page.locator('.lineup-starter__profile').first().click();
    await expect(page.getByTestId('player-profile-summary')).toContainText('OVR');
    await expect(page.locator('.player-profile-shell').getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const profile = page.locator('.player-profile-shell');
    await noOverflow(page, profile);
    await page.screenshot({ path: testInfo.outputPath('profile-overview.png') });
    for (const tab of ['Ratings', 'Contract', 'Development', 'Career']) {
      await profile.getByRole('button', { name: tab, exact: true }).click();
      await expect(profile.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await noOverflow(page, profile);
    }
    await profile.getByRole('button', { name: 'Return to HQ', exact: true }).click();
    await action.click();
    await expect(page.getByRole('button', { name: 'Back to HQ', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to HQ', exact: true }).click();
    await expect(action).toHaveText(/Play Week/);
    await action.click();
    const prompt = page.getByRole('dialog', { name: 'Play this week' });
    await expect(prompt.getByRole('button', { name: /^Watch Game/ })).toBeVisible();
    await expect(prompt.getByRole('button', { name: /^Quick Sim/ })).toBeVisible();
    await expect(prompt.locator('details')).not.toHaveAttribute('open', '');
    await noOverflow(page, prompt);
    await page.screenshot({ path: testInfo.outputPath('pregame.png') });
    await prompt.getByText('More Options', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(prompt.getByRole('button', { name: /^Fast Watch/ })).toBeVisible();
    await noOverflow(page, prompt);
    await prompt.getByText('More Options', { exact: true }).click();
    if (width === 430) {
      await prompt.getByRole('button', { name: /^Watch Game/ }).tap();
      await expect(page.getByLabel('Playback controls')).toBeVisible({ timeout: 60000 });
      await page.getByLabel('Skip options').tap();
      await page.getByRole('button', { name: 'Sim End', exact: true }).tap();
    } else {
      await prompt.getByRole('button', { name: /^Quick Sim/ }).focus();
      await page.keyboard.press('Enter');
    }
    await expect(prompt).toBeHidden({ timeout: 60000 });
    await page.getByRole('button', { name: 'Open Final Game Book', exact: true }).click({ timeout: 60000 });
    await expect(page.getByTestId('postgame-result-banner')).toBeVisible({ timeout: 60000 });
  });
}
