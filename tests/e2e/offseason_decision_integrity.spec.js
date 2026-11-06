import { test, expect } from '@playwright/test';
test.setTimeout(600000);
test.use({ actionTimeout: 30000 });
async function readPlayer(page, id) {
  return page.evaluate(async pid => {
    const res = await window.gameController.getRoster(window.state.league.userTeamId);
    return res.payload.players.find(p => p.id === pid);
  }, id);
}
async function dismissPreviewDrawer(page) {
  if (new URL(page.url()).hostname.endsWith('.netlify.app')) {
    const frame = page.locator('iframe[src*="app.netlify.com/cdp"]');
    await frame.waitFor({ state: 'attached', timeout: 15000 });
    const dismiss = page.frameLocator('iframe[src*="app.netlify.com/cdp"]').locator('button[aria-label="Dismiss"], button[title="Dismiss"]').first();
    await dismiss.focus();
    await dismiss.press('Enter');
  }
}
async function openCenter(page, expectSplash = true) {
  if (expectSplash) {
    const proceed = page.getByRole('button', { name: 'Proceed to Offseason', exact: true });
    await expect(proceed).toBeVisible({ timeout: 15000 });
    await proceed.click();
    await expect(proceed).toBeHidden();
  }
  const bracket = page.getByRole('button', { name: "Let's Go!", exact: true });
  if (await bracket.isVisible()) await bracket.click();
  const briefing = page.getByRole('dialog', { name: 'Weekly GM briefing', exact: true });
  if (await briefing.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(briefing).toBeHidden();
  }
  await page.locator('[data-testid="nav-team"], [data-testid="primary-nav-team"]').first().click();
  await page.getByTestId('section-tab-contract-center').click();
  console.info('Contract Center opened');
  await expect(page.getByText('Re-signing Center', { exact: true })).toBeVisible();
}
for (const team of ['Buffalo', 'Miami']) test(`${team}: manual decisions persist and Advance confirmation is respected`, async ({ page }) => {
  await page.goto('/');
  await dismissPreviewDrawer(page);
  await page.getByTestId('start-new-franchise-cta').first().click();
  await page.locator('.team-card').filter({ hasText: team }).click();
  await page.getByTestId('onboarding-continue-button').click();
  await page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input').fill('2026');
  await page.getByTestId('onboarding-continue-button').click();
  await page.getByTestId('start-dynasty-button').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 60000 });
  const close = page.getByLabel('Close changelog');
  if (await close.isVisible()) await close.click();
  await page.evaluate(() => window.gameController.simToPhase('offseason'));
  await expect.poll(() => page.evaluate(() => window.state.league.phase), { timeout: 420000 }).toBe('offseason_resign');
  console.info(`${team}: re-signing phase reached`);
  await openCenter(page);
  const targets = await page.evaluate(async () => {
    const r = await window.gameController.getRoster(window.state.league.userTeamId);
    return r.payload.players.filter(p => p.contract?.years <= 1).sort((a, b) => Number(['QB','LT','EDGE','CB'].includes(b.pos) || b.ovr >= 82) - Number(['QB','LT','EDGE','CB'].includes(a.pos) || a.ovr >= 82)).map(p => ({ id: p.id, name: p.name }));
  });
  expect(targets.length).toBeGreaterThan(1);
  const unresolved = Number(await page.getByTestId('unresolved-key-expirings').textContent());
  expect(unresolved).toBeGreaterThan(0);
  const target = targets[0];
  const row = page.locator('tr').filter({ hasText: target.name });
  await row.getByRole('button', { name: 'Let Walk', exact: true }).click();
  await expect(row.locator('td').nth(10)).toHaveText('Let Walk');
  console.info(`${team}: Let Walk committed`);
  expect((await readPlayer(page, target.id)).extensionDecision).toBe('let_walk');
  await expect(page.getByTestId('unresolved-key-expirings')).toHaveText(String(unresolved - 1));
  await page.reload();
  await dismissPreviewDrawer(page);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  await openCenter(page);
  await expect(page.locator('tr').filter({ hasText: target.name }).locator('td').nth(10)).toHaveText('Let Walk');
  const extension = targets[1];
  const previous = (await readPlayer(page, extension.id)).contract;
  await page.locator('tr').filter({ hasText: extension.name }).getByRole('button', { name: 'Extend', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm extension' }).click();
  await expect(page.getByRole('status')).toContainText(/\S/);
  const after = await readPlayer(page, extension.id);
  if (after.extensionDecision === 'extended') expect(after.contract).not.toEqual(previous);
  else expect(after.contract).toEqual(previous);
  await page.reload();
  await dismissPreviewDrawer(page);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  const saved = (await readPlayer(page, extension.id)).contract;
  for (const key of ['years', 'yearsTotal', 'baseAnnual', 'signingBonus', 'guaranteedPct']) expect(saved[key]).toBe(after.contract[key]);
  await openCenter(page);
  if (Number(await page.getByTestId('unresolved-key-expirings').textContent()) === 0) {
    await page.locator('tr').filter({ hasText: target.name }).getByRole('button', { name: 'Defer', exact: true }).click();
    await expect(page.getByTestId('unresolved-key-expirings')).toHaveText('1');
  }
  let cancelledConfirmation = false;
  page.once('dialog', dialog => { cancelledConfirmation = true; return dialog.dismiss(); });
  await page.locator('.app-advance-btn').click();
  expect(cancelledConfirmation).toBe(true);
  expect(await page.evaluate(() => window.state.league.phase)).toBe('offseason_resign');
  if (team === 'Miami') {
    await openCenter(page, false);
    for (const p of targets) {
      const decisionRow = page.locator('tr').filter({ hasText: p.name });
      if (await decisionRow.count()) {
        await decisionRow.getByRole('button', { name: 'Let Walk', exact: true }).click();
        await expect(decisionRow.locator('td').nth(10)).toHaveText('Let Walk');
      }
    }
    await expect(page.getByTestId('unresolved-key-expirings')).toHaveText('0');
  } else {
    page.once('dialog', dialog => dialog.accept());
  }
  await page.locator('.app-advance-btn').click();
  await expect.poll(() => page.evaluate(() => window.state.league.phase), { timeout: 120000 }).toBe('free_agency');
  await expect(page.locator('body')).toContainText(/Free Agency/i);
  await page.screenshot({ path: test.info().outputPath('free-agency.png'), fullPage: true });
  await page.reload();
  await dismissPreviewDrawer(page);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => window.state.league.phase)).toBe('free_agency');
});
