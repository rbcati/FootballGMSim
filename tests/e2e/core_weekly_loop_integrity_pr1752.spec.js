import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);

const FLOATING_HELP_SELECTOR = '.quick-jump-fab, .quick-jump-fab-btn, [aria-label="Help"], [aria-label*="help" i]:not(.hq-v2-info), [data-testid*="help-fab" i]';

async function expectTargetCenterUnobstructed(target) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled({ timeout: 90000 });
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  expect(await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === element || element.contains(hit)));
  })).toBe(true);
}

async function expectNoFloatingHelp(page) {
  // #1798 added contextual ? controls inside HQ cards. They are not floating
  // app-shell help; keep proving their placement as well as banning the FABs.
  for (const help of await page.locator('.hq-v2-info').all()) {
    expect(await help.evaluate((el) => Boolean(el.closest('.hq-v2-card')) && getComputedStyle(el).position !== 'fixed')).toBe(true);
  }
  await expect(page.locator(FLOATING_HELP_SELECTOR)).toHaveCount(0);
}

test('mobile weekly-result navigation and Game Book remain single-owner', async ({ page }) => {
  await page.goto('/');
  await launchFranchise(page);
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 90000 });
  await expectNoFloatingHelp(page);
  await expectTargetCenterUnobstructed(page.getByTestId('advance-week-cta'));
  await expectTargetCenterUnobstructed(page.getByRole('button', { name: 'HQ', exact: true }).last());

  const seasonPulse = page.getByTestId('season-pulse');
  const gameBookEntry = seasonPulse.getByRole('button', { name: /view game book/i });
  if (await gameBookEntry.isVisible().catch(() => false)) {
    await gameBookEntry.click();
    await expect(page.getByTestId('game-book')).toHaveCount(1);
    await expect(page.getByTestId('return-to-hq')).toHaveCount(1);
    await expectNoFloatingHelp(page);
    await expectTargetCenterUnobstructed(page.getByTestId('return-to-hq'));
    await expectTargetCenterUnobstructed(page.getByRole('button', { name: 'Team', exact: true }).last());

    await page.getByRole('button', { name: 'Team', exact: true }).last().click();
    await expect(page.getByTestId('game-book')).toHaveCount(0);
    await expect(page.locator('.mobile-bottom-bar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();

    await page.getByRole('button', { name: 'League', exact: true }).last().click();
    await expect(page.getByTestId('post-game-summary')).toHaveCount(0);
    await expectNoFloatingHelp(page);
    await expectTargetCenterUnobstructed(page.getByRole('button', { name: 'League', exact: true }).last());
  }

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'More navigation' })).toBeVisible();
  await expectNoFloatingHelp(page);
  await expectTargetCenterUnobstructed(page.getByRole('button', { name: 'Saves', exact: true }));
  // The existing drawer intentionally covers the bottom bar while open.
  await page.locator('.mobile-nav-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('navigation', { name: 'More navigation' })).toBeHidden();
  await expectTargetCenterUnobstructed(page.getByRole('button', { name: 'More', exact: true }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
