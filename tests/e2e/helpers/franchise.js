import { expect } from '@playwright/test';

const APP_READY = '[data-testid="app-shell-ready"]';
const SAVE_HUB_CTA = '[data-testid="start-new-franchise-cta"]';
const ONBOARDING_CONTINUE = '[data-testid="onboarding-continue-button"]';
const START_DYNASTY = '[data-testid="start-dynasty-button"]';
const TEAM_SELECT = '[data-testid="team-selection-flow"]';

async function detectBootstrapState(page) {
  if (await page.locator(APP_READY).first().isVisible().catch(() => false)) return 'app_ready';
  if (await page.locator(SAVE_HUB_CTA).first().isVisible().catch(() => false)) return 'save_hub';
  if (await page.locator(START_DYNASTY).first().isVisible().catch(() => false)) return 'start_dynasty';
  if (await page.locator(TEAM_SELECT).first().isVisible().catch(() => false)) return 'team_select';
  if (await page.locator(ONBOARDING_CONTINUE).first().isVisible().catch(() => false)) return 'onboarding_continue';
  return 'unknown';
}

export async function ensureLeagueLoaded(page) {
  // Deterministic boot gate: wait for one known state, then branch.
  await page.waitForFunction(() => {
    const selectors = [
      '[data-testid="app-shell-ready"]',
      '[data-testid="start-new-franchise-cta"]',
      '[data-testid="onboarding-continue-button"]',
      '[data-testid="start-dynasty-button"]',
      '[data-testid="team-selection-flow"]',
    ];
    return selectors.some((selector) => document.querySelector(selector));
  }, { timeout: 60000 });

  let state = await detectBootstrapState(page);
  if (state === 'app_ready') {
    await expect(page.locator(APP_READY)).toBeVisible();
    return;
  }

  if (state === 'save_hub') {
    await page.locator(SAVE_HUB_CTA).first().click();
    state = await detectBootstrapState(page);
  }

  if (state === 'team_select') {
    await page.locator(`${TEAM_SELECT} .team-card`).first().click();
  }

  while (await page.locator(ONBOARDING_CONTINUE).first().isVisible().catch(() => false)) {
    await page.locator(ONBOARDING_CONTINUE).first().click();
  }

  if (await page.locator(START_DYNASTY).first().isVisible().catch(() => false)) {
    await page.locator(START_DYNASTY).first().click();
  }

  await expect(page.locator(APP_READY)).toBeVisible({ timeout: 60000 });
}

export async function launchFranchise(page) {
  // Playwright starts each test on about:blank; callers must load the app before
  // boot selectors exist. Specs that already called page.goto('/') are unchanged.
  const url = page.url();
  if (url === 'about:blank' || url === 'chrome-error://chromewebdata/') {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }
  await ensureLeagueLoaded(page);
}

export async function goToTab(page, name) {
  const tab = String(name).toLowerCase();

  // HQ primary nav shows quick links (Roster Hub, Schedule, …), not `section-tab-hq`.
  if (tab === 'hq') {
    const desktop = page.locator('[data-testid="nav-hq"], [data-testid="primary-nav-hq"]').first();
    if (await desktop.isVisible().catch(() => false)) {
      await desktop.click({ force: true });
    } else {
      await page.getByRole('button', { name: /^HQ$/i }).first().click();
    }
    await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 20000 });
    return;
  }

  const sectionByTab = {
    team: 'team',
    roster: 'team',
    'game-plan': 'team',
    standings: 'league',
    schedule: 'league',
    stats: 'league',
    'league-leaders': 'league',
    'weekly-results': 'league',
    draft: 'league',
    transactions: 'league',
    'free-agency': 'league',
    'history-hub': 'league',
  };
  const primary = sectionByTab[tab];
  if (primary) {
    const primaryLocator = page.locator(`[data-testid="nav-${primary}"], [data-testid="primary-nav-${primary}"]`).first();
    if (await primaryLocator.isVisible().catch(() => false)) {
      await primaryLocator.click({ force: true });
    } else {
      const labels = { hq: /^HQ$/i, team: /^Team$/i, league: /^League$/i, news: /^News$/i };
      const pattern = labels[primary];
      if (pattern) await page.getByRole('button', { name: pattern }).first().click();
    }
  }
  const sectionTab = page.locator(`[data-testid="section-tab-${tab}"]`).first();
  if (await sectionTab.isVisible().catch(() => false)) {
    await sectionTab.click({ force: true });
    return;
  }

  if (tab === 'weekly-results' && (await page.getByTestId('completed-game-link').first().isVisible().catch(() => false) || await page.getByTestId('game-book-primary-cta').first().isVisible().catch(() => false))) {
    return;
  }

  if (tab === 'standings' || tab === 'stats' || tab === 'roster') {
        const textBtn = page.getByRole('tab', { name: new RegExp('^' + tab, 'i') }).first();
        if (await textBtn.isVisible().catch(() => false)) {
            await textBtn.click({ force: true });
            return;
        }
        const backupTextBtn = page.locator('button', { hasText: new RegExp('^' + tab, 'i') }).first();
        if (await backupTextBtn.isVisible().catch(() => false)) {
            await backupTextBtn.click({ force: true });
            return;
        }
        const anyBtn = page.locator('button, [role="tab"]');
        const count = await anyBtn.count();
        for (let i = 0; i < count; i++) {
            const b = anyBtn.nth(i);
            const text = await b.innerText();
            if (text && text.toLowerCase().includes(tab)) {
                 try {
                     await b.click({ timeout: 1000 });
                     return;
                 } catch (e) {
                 }
            }
        }
  }
  if (tab === 'standings' || tab === 'stats' || tab === 'roster' || tab === 'league') {
    // For legacy mobile hub where tabs are just generic buttons
    await page.evaluate((t) => {
        const btns = Array.from(document.querySelectorAll('button, [role="tab"], .nav-item'));
        const target = btns.find(b => b.innerText && b.innerText.trim().toLowerCase() === t.toLowerCase());
        if (target) target.click();
    }, tab);
    await page.waitForTimeout(500);
    return;
  }
  try {
    await expect(sectionTab, `Could not open tab "${tab}" (section tab missing after primary nav)`).toBeVisible({ timeout: 5000 });
    await sectionTab.click({ force: true });
  } catch (e) {
    if (tab === 'standings' || tab === 'stats' || tab === 'roster') {
        const textBtn = page.getByRole('tab', { name: new RegExp('^' + tab, 'i') }).first();
        if (await textBtn.isVisible().catch(() => false)) {
            await textBtn.click({ force: true });
            return;
        }
        const backupTextBtn = page.locator('button', { hasText: new RegExp('^' + tab, 'i') }).first();
        if (await backupTextBtn.isVisible().catch(() => false)) {
            await backupTextBtn.click({ force: true });
            return;
        }
        const anyBtn = page.locator('button, [role="tab"]');
        const count = await anyBtn.count();
        for (let i = 0; i < count; i++) {
            const b = anyBtn.nth(i);
            const text = await b.innerText();
            if (text && text.toLowerCase().includes(tab)) {
                 try {
                     await b.click({ timeout: 1000 });
                     return;
                 } catch (e) {
                 }
            }
        }
    }
    throw e;
  }
}

/** After advancing the season, completed box scores live on the prior week’s slate. */
export async function selectScheduleWeekTab(page, weekNumber) {
  await goToTab(page, 'schedule');
  const weekRow = page.locator('[aria-label="Week selector"]');
  await weekRow.getByRole('tab', { name: String(weekNumber), exact: true }).click();
}

export async function simulateSingleWeek(page, options = {}) {
  const { advanceAnyway = false } = options;
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);

  if (advanceAnyway) {
    await page.evaluate(() => {
      try {
        const PREP_KEY = 'footballgm_weekly_prep_v1';
        const league = window?.state?.league ?? {};
        const seasonId = league?.seasonId ?? league?.year ?? 'season';
        const week = league?.week ?? 1;
        const userTeamId = league?.userTeamId ?? 'user';
        const slotKey = `${seasonId}:${week}:${userTeamId}`;
        const stored = JSON.parse(window.localStorage.getItem(PREP_KEY) ?? '{}');
        stored[slotKey] = {
          lineupChecked: true,
          injuriesReviewed: true,
          opponentScouted: true,
          planReviewed: true,
          ...(stored[slotKey] ?? {}),
          planReviewed: true,
        };
        window.localStorage.setItem(PREP_KEY, JSON.stringify(stored));
      } catch (_e) { /* non-fatal */ }
    });
    // Wait for the button to become enabled if it's rendered
    const advanceCta = page.getByTestId('advance-week-cta');
    if (await advanceCta.isVisible().catch(() => false)) {
      await expect(advanceCta).toBeEnabled({ timeout: 5000 });
    }
  }

  const advanceCta = page.getByTestId('advance-week-cta');
  if (await advanceCta.isVisible().catch(() => false)) {
    await advanceCta.click();
  } else {
    await page.evaluate(() => {
      const btn = document.querySelector('.app-advance-btn');
      if (btn) btn.click();
      else if (window.handleGlobalAdvance) window.handleGlobalAdvance();
    });
  }
  if (advanceAnyway) {
    await page.getByRole('button', { name: /Advance anyway/i }).click();
  }
  await page.getByRole('button', { name: /Simulate \(Skip\)/i }).click();
  await page.waitForFunction(
    (baseline) => {
      const week = window?.state?.league?.week ?? baseline;
      const phase = window?.state?.league?.phase;
      return week > baseline || phase === 'offseason' || phase === 'free_agency' || phase === 'draft';
    },
    startWeek,
    { timeout: 90000 },
  );
}
