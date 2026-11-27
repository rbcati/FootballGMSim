/**
 * Offseason EXECUTION integrity — fresh Buffalo 2026 franchise, driven through
 * the real UI (no mocks for the paths under test):
 *
 *   - Draft page renders in a fresh franchise (no React #185).
 *   - Super Bowl is simulated, its score is shown, champion gets exactly +1 W.
 *   - Re-signing: Confirm extension commits (or explains why it cannot), Let
 *     Walk persists across reload, Advance names every unresolved player and
 *     an explicit message appears when the user declines.
 *   - Re-signing → Free Agency: the Let Walk player leaves the roster and is in
 *     the FA pool (after reload too).
 *   - Free Agency → Draft page (renders, picks made by hand) → Draft History
 *     logs picks → Start New Season → 2027 Week 1 hub.
 *
 * The regular season is fast-forwarded with simToPhase('playoffs') because it
 * is not under test; every step from the Wild Card round on is clicked.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(1_500_000);
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });

let page;
const dialogs = [];
let dialogAnswer = 'dismiss';

async function dismissPreviewDrawer(p) {
  if (new URL(p.url()).hostname.endsWith('.netlify.app')) {
    const frame = p.locator('iframe[src*="app.netlify.com/cdp"]');
    if (await frame.count()) {
      const dismiss = p.frameLocator('iframe[src*="app.netlify.com/cdp"]').locator('button[aria-label="Dismiss"], button[title="Dismiss"]').first();
      await dismiss.click({ timeout: 10_000 }).catch(() => {});
    }
  }
}

async function reloadApp() {
  await page.reload();
  await dismissPreviewDrawer(page);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => window.state?.league?.phase, null, { timeout: 60_000 });
  // The Season Complete splash is shown again after a reload in the offseason.
  const proceed = page.getByRole('button', { name: 'Proceed to Offseason', exact: true });
  if (await proceed.isVisible({ timeout: 3_000 }).catch(() => false)) await proceed.click();
}

const phase = () => page.evaluate(() => window.state.league.phase);

async function clickAdvance() {
  const header = page.locator('.app-advance-btn');
  if (await header.isVisible().catch(() => false)) {
    await expect(header).toBeEnabled({ timeout: 120_000 });
    await header.click();
    return;
  }
  const hq = page.getByTestId('advance-week-cta');
  await expect(hq).toBeEnabled({ timeout: 120_000 });
  await hq.click();
}

async function closeOverlays() {
  // If Buffalo has a game this week, take the "Simulate Week" choice.
  const playPrompt = page.getByRole('dialog', { name: 'Play this week' });
  if (await playPrompt.isVisible().catch(() => false)) {
    const simulate = playPrompt.getByRole('button', { name: /Simulate Week/ });
    if (!(await simulate.isVisible().catch(() => false))) {
      await playPrompt.getByText('+ More Options').click().catch(() => {});
    }
    // Disabled while the worker is busy; callers poll, so try again later.
    if (await simulate.isEnabled().catch(() => false)) {
      await simulate.click({ timeout: 5_000 }).catch(() => {});
      await expect(playPrompt).toBeHidden({ timeout: 120_000 });
    }
  }
  for (const name of ["Let's Go!", 'Close changelog', 'Continue']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
  }
  const briefing = page.getByRole('dialog', { name: 'Weekly GM briefing', exact: true });
  if (await briefing.isVisible().catch(() => false)) await page.keyboard.press('Escape');
}

async function openTab(nav, tab) {
  await closeOverlays();
  await page.locator(`[data-testid="${nav}"], [data-testid="primary-${nav}"]`).first().click();
  await page.getByTestId(`section-tab-${tab}`).click();
}

async function rosterPlayer(name) {
  return page.evaluate(async (nm) => {
    const r = await window.gameController.getRoster(window.state.league.userTeamId);
    const p = r.payload.players.find((x) => x.name === nm);
    return p ? { id: p.id, decision: p.extensionDecision, contract: p.contract, teamId: p.teamId } : null;
  }, name);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', (d) => { dialogs.push(d.message()); return dialogAnswer === 'accept' ? d.accept() : d.dismiss(); });
  page.on('pageerror', (e) => { if (/Minified React error #185|Maximum update depth/.test(e.message)) throw e; });
  await page.goto('/');
  await dismissPreviewDrawer(page);
  await page.getByTestId('start-new-franchise-cta').first().click();
  await page.locator('.team-card').filter({ hasText: 'Buffalo' }).click();
  await page.getByTestId('onboarding-continue-button').click();
  await page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input').fill('2026');
  await page.getByTestId('onboarding-continue-button').click();
  await page.getByTestId('start-dynasty-button').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 90_000 });
  await closeOverlays();
});

test.afterAll(async () => { await page?.close(); });

test('Draft page renders in a fresh franchise', async () => {
  await openTab('nav-league', 'draft');
  await expect(page.getByText('Draft encountered a render error')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Minified React error #185');
  await expect(page.locator('body')).toContainText(/Draft/);
});

test('Super Bowl is simulated, scored and shown before the Season Complete splash', async () => {
  await page.evaluate(() => window.gameController.simToPhase('playoffs'));
  await expect.poll(phase, { timeout: 600_000 }).toBe('playoffs');
  await openTab('nav-league', 'standings').catch(() => {});
  const advanceRound = async () => {
    const week = await page.evaluate(() => window.state.league.week);
    await closeOverlays();
    await clickAdvance();
    await expect.poll(async () => {
      await closeOverlays();
      return page.evaluate(() => `${window.state.league.phase}:${window.state.league.week}`);
    }, { timeout: 240_000 }).not.toBe(`playoffs:${week}`);
  };
  for (let round = 0; round < 3; round += 1) await advanceRound();
  expect(await page.evaluate(() => window.state.league.week)).toBe(22);
  const before = await page.evaluate(() => Object.fromEntries(window.state.league.teams.map((t) => [t.id, t.wins])));
  await advanceRound();
  await expect.poll(phase, { timeout: 180_000 }).toBe('offseason_resign');

  const splash = page.getByRole('dialog', { name: 'Season Complete' });
  await expect(splash).toBeVisible({ timeout: 30_000 });
  const score = splash.getByTestId('super-bowl-score');
  await expect(score).toBeVisible();
  await expect(score).toContainText(/\d+\s*—\s*\d+/);
  await page.screenshot({ path: test.info().outputPath('season-complete-super-bowl.png'), fullPage: true });
  const champion = await page.evaluate(() => {
    const L = window.state.league;
    const t = L.teams.find((x) => x.id === L.championTeamId);
    return { id: t.id, wins: t.wins };
  });
  expect(champion.wins).toBe(before[champion.id] + 1);
  await page.getByRole('button', { name: 'Proceed to Offseason', exact: true }).click();
  await expect(splash).toBeHidden();
});

let walkName;
let extendedName = null;

test('Re-signing: Confirm extension commits or explains itself; Let Walk persists; Advance names blockers', async () => {
  await openTab('nav-team', 'contract-center');
  await expect(page.getByText('Re-signing Center', { exact: true })).toBeVisible();
  const rows = page.locator('tr').filter({ has: page.getByRole('button', { name: 'Extend', exact: true }) });
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);

  // Confirm extension: every attempt must end in a committed extension or a
  // visible, specific reason. Try until one commits.
  for (let i = 0; i < count && !extendedName; i += 1) {
    const row = rows.nth(i);
    const name = (await row.locator('td').first().innerText()).split(' (')[0].trim();
    const before = await rosterPlayer(name);
    await row.getByRole('button', { name: 'Extend', exact: true }).click();
    const preview = page.getByTestId('extension-preview');
    await expect(preview).toBeVisible();
    const confirm = page.getByRole('button', { name: 'Confirm extension' });
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    await confirm.click();
    const status = page.getByTestId('resign-status');
    await expect(status).toContainText(/\S/, { timeout: 20_000 });
    const text = await status.innerText();
    if (/extension accepted/.test(text)) {
      extendedName = name;
      await expect(preview).toBeHidden();
      const after = await rosterPlayer(name);
      expect(after.decision).toBe('extended');
      expect(after.contract).not.toEqual(before.contract);
      // Multi-year deals leave the expiring table; a 1-year deal stays, marked Extended.
      const extendedRow = page.locator('tr').filter({ hasText: name });
      if (await extendedRow.count()) await expect(extendedRow.locator('td').nth(10)).toHaveText('Extended');
    } else {
      expect(text.length).toBeGreaterThan(10);
      expect(await rosterPlayer(name)).toEqual(before);
      await page.getByRole('button', { name: 'Close preview' }).click();
    }
  }

  // Let Walk one Pending player.
  // Youngest Pending player, so offseason retirements cannot claim him.
  const pendingRows = page.locator('tr').filter({ has: page.getByRole('button', { name: 'Let Walk', exact: true }) }).filter({ hasText: 'Pending' });
  let pendingRow = pendingRows.first();
  let youngest = Infinity;
  for (let i = 0; i < await pendingRows.count(); i += 1) {
    const age = Number(await pendingRows.nth(i).locator('td').nth(1).innerText());
    if (age < youngest) { youngest = age; pendingRow = pendingRows.nth(i); }
  }
  walkName = (await pendingRow.locator('td').first().innerText()).split(' (')[0].trim();
  await pendingRow.getByRole('button', { name: 'Let Walk', exact: true }).click();
  await expect(page.getByTestId('resign-status')).toContainText(`${walkName}: Let Walk.`);
  expect((await rosterPlayer(walkName)).decision).toBe('let_walk');

  await reloadApp();
  expect((await rosterPlayer(walkName)).decision).toBe('let_walk');
  if (extendedName) {
    const ext = await rosterPlayer(extendedName);
    expect(ext.decision).toBe('extended');
    const tx = await page.evaluate(async () => (await window.gameController.getTransactions?.({ type: 'EXTEND' }))?.payload ?? null).catch(() => null);
    test.info().annotations.push({ type: 'extension', description: `${extendedName} ${JSON.stringify(ext.contract)} tx=${tx ? 'read' : 'n/a'}` });
  }

  // Advance with non-key/key players still Pending: the confirm names them,
  // and declining leaves an explicit message (never a silent no-op).
  await openTab('nav-team', 'contract-center');
  const gateText = await page.getByTestId('resign-advance-gate').innerText();
  expect(gateText).toMatch(/will leave the roster and enter the free-agent pool/);
  dialogAnswer = 'dismiss';
  dialogs.length = 0;
  await clickAdvance();
  await expect.poll(() => dialogs.length).toBeGreaterThan(0);
  expect(dialogs[0]).toMatch(/will leave your roster and enter free agency/);
  const message = page.getByTestId('advance-blocked-message');
  await expect(message).toBeVisible();
  await expect(message).toContainText('Advance cancelled');
  expect(await phase()).toBe('offseason_resign');
});

test('Re-signing → Free Agency executes Let Walk into the FA pool', async () => {
  dialogAnswer = 'accept';
  await clickAdvance();
  await expect.poll(phase, { timeout: 240_000 }).toBe('free_agency');
  const check = async () => page.evaluate(async (nm) => {
    const r = await window.gameController.getFreeAgents();
    const roster = await window.gameController.getRoster(window.state.league.userTeamId);
    return {
      inPool: (r.payload.freeAgents ?? []).some((p) => p.name === nm),
      onRoster: roster.payload.players.some((p) => p.name === nm),
      pool: (r.payload.freeAgents ?? []).length,
    };
  }, walkName);
  let state = await check();
  expect(state).toMatchObject({ inPool: true, onRoster: false });
  expect(state.pool).toBeGreaterThan(50);
  await reloadApp();
  state = await check();
  expect(state).toMatchObject({ inPool: true, onRoster: false });
  // The UI FA pool shows him too.
  await openTab('nav-league', 'free-agency');
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible().catch(() => false)) await search.fill(walkName);
  await expect(page.locator('body')).toContainText(walkName, { timeout: 30_000 });
});

test('Free Agency → Draft (page renders, picks by hand, history logs) → 2027 Week 1', async () => {
  for (let i = 0; i < 10 && (await phase()) === 'free_agency'; i += 1) {
    const day = await page.evaluate(() => window.state.league.freeAgencyState?.day ?? 0);
    await closeOverlays();
    await clickAdvance();
    await expect.poll(async () => (await phase()) !== 'free_agency' || (await page.evaluate(() => window.state.league.freeAgencyState?.day ?? 0)) !== day, { timeout: 180_000 }).toBe(true);
  }
  await expect.poll(phase, { timeout: 120_000 }).toBe('draft');

  await openTab('nav-league', 'draft');
  await expect(page.getByText('Draft encountered a render error')).toHaveCount(0);
  // Make every Buffalo pick by hand; the draft room simulates CPU picks.
  for (let guard = 0; guard < 120; guard += 1) {
    if ((await phase()) !== 'draft') break;
    if (await page.getByTestId('draft-start-new-season').isVisible().catch(() => false)) break;
    const start = page.getByRole('button', { name: 'Start Draft', exact: true });
    if (await start.isVisible().catch(() => false) && await start.isEnabled()) { await start.click(); continue; }
    const draftButton = page.locator('tr').getByRole('button', { name: 'Draft', exact: true }).first();
    if (await draftButton.isVisible().catch(() => false) && await draftButton.isEnabled().catch(() => false)) {
      await draftButton.click();
      await page.waitForTimeout(1200);
      continue;
    }
    // CPU teams pick automatically; if the clock is idle, ask for the next pick.
    await page.waitForTimeout(2500);
    const simTo = page.getByRole('button', { name: 'Sim to My Pick', exact: true });
    // Optional nudge: the loop retries, so a transiently covered button
    // (CPU pick animation) must not fail the run.
    if (await simTo.isVisible().catch(() => false) && await simTo.isEnabled().catch(() => false)) {
      await simTo.click({ timeout: 5000 }).catch(() => {});
    }
  }
  await expect(page.getByText('Draft encountered a render error')).toHaveCount(0);
  // After the final pick the season either starts automatically or the
  // Draft Complete panel offers Start New Season.
  await expect.poll(async () => (await phase()) !== 'draft'
    || await page.getByTestId('draft-start-new-season').isVisible().catch(() => false), { timeout: 300_000 }).toBe(true);
  if ((await phase()) === 'draft') {
    await page.getByTestId('draft-start-new-season').click();
    await expect.poll(phase, { timeout: 300_000 }).not.toBe('draft');
    await expect(page.getByTestId('draft-start-new-season-error')).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.state.league.year)).toBe(2027);

  const history = await page.evaluate(async () => {
    const list = await window.gameController.getDraftClasses();
    const classes = list.payload.classes ?? [];
    const target = classes.find((c) => String(c.year ?? '').includes('2026')) ?? classes[0];
    const model = target ? (await window.gameController.getDraftClass({ seasonId: target.seasonId })).payload.model : null;
    return { classes: classes.length, picks: model?.picks?.length ?? 0 };
  });
  expect(history.classes).toBeGreaterThan(0);
  expect(history.picks).toBeGreaterThan(200);

  // Every AI team reached the 53-man floor.
  const short = await page.evaluate(() => window.state.league.teams
    .filter((t) => t.id !== window.state.league.userTeamId && Number(t.rosterCount ?? t.roster?.length ?? 0) < 53)
    .map((t) => `${t.abbr}:${t.rosterCount}`));
  expect(short).toEqual([]);

  const userRosterCount = () => page.evaluate(() => window.state.league.teams.find((t) => t.id === window.state.league.userTeamId)?.rosterCount);
  for (let i = 0; i < 8 && (await phase()) !== 'regular'; i += 1) {
    const before = await page.evaluate(() => `${window.state.league.phase}:${window.state.league.week}`);
    await closeOverlays();
    // HQ explains a required cutdown and offers the fix: cut by hand to 53.
    const reason = page.locator('#hq-advance-reason');
    if (await reason.isVisible().catch(() => false) && /Roster minimum not met/i.test(await reason.innerText())) {
      await page.getByTestId('fill-roster-to-minimum').first().click();
      await expect.poll(userRosterCount, { timeout: 120_000 }).toBe(53);
      continue;
    }
    if (await reason.isVisible().catch(() => false) && /cutdown required/i.test(await reason.innerText())) {
      await page.getByRole('button', { name: /Run Final Cuts/ }).click();
      for (let cut = 0; cut < 10 && (await userRosterCount()) > 53; cut += 1) {
        const count = await userRosterCount();
        await page.getByRole('button', { name: 'Cut', exact: true }).last().click();
        await page.getByRole('button', { name: 'Confirm Release' }).click();
        await expect.poll(userRosterCount, { timeout: 60_000 }).toBe(count - 1);
      }
      await openTab('nav-hq', 'hq').catch(() => page.locator('[data-testid="nav-hq"]').first().click());
      continue;
    }
    await clickAdvance();
    // Advance must either move the league or explain itself.
    await expect.poll(async () => {
      const now = await page.evaluate(() => `${window.state.league.phase}:${window.state.league.week}`);
      if (now !== before) return 'moved';
      if (await page.getByTestId('fill-roster-to-minimum').isVisible().catch(() => false)) return 'roster';
      const alerts = await page.locator('[role="alert"]').allInnerTexts();
      return alerts.some((t) => t.trim().length > 0) ? 'explained' : 'waiting';
    }, { timeout: 240_000 }).not.toBe('waiting');
    if (await page.getByTestId('fill-roster-to-minimum').isVisible().catch(() => false)) {
      await expect(page.locator('[role="alert"]').first()).toContainText(/Roster minimum not met/);
      await page.getByTestId('fill-roster-to-minimum').click();
      await expect.poll(() => page.evaluate(() => window.state.league.teams.find((t) => t.id === window.state.league.userTeamId)?.rosterCount), { timeout: 120_000 }).toBe(53);
    }
  }
  expect(await page.evaluate(() => ({ phase: window.state.league.phase, week: window.state.league.week, year: window.state.league.year })))
    .toEqual({ phase: 'regular', week: 1, year: 2027 });
  await openTab('nav-hq', 'hq').catch(() => page.locator('[data-testid="nav-hq"]').first().click());
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('week-1-2027-hub.png'), fullPage: true });
  await reloadApp();
  expect(await page.evaluate(() => ({ phase: window.state.league.phase, year: window.state.league.year }))).toEqual({ phase: 'regular', year: 2027 });
});
