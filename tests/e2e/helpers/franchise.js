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
    state = await detectBootstrapState(page);
  }

  while (state === 'onboarding_continue') {
    await page.locator(ONBOARDING_CONTINUE).first().click();
    state = await detectBootstrapState(page);
  }

  if (state === 'start_dynasty') {
    await page.locator(START_DYNASTY).first().click();
  }

  await expect(page.locator(APP_READY)).toBeVisible({ timeout: 60000 });
}

export async function launchFranchise(page) {
  await page.goto('http://localhost:5173');
  await ensureLeagueLoaded(page);
}

export async function goToTab(page, name) {
  const tab = String(name).toLowerCase();
  const sectionByTab = {
    hq: 'hq',
    team: 'team',
    roster: 'team',
    'game-plan': 'team',
    standings: 'league',
    schedule: 'league',
    stats: 'league',
    transactions: 'transactions',
    'free-agency': 'transactions',
    'history-hub': 'history',
  };
  const primary = sectionByTab[tab];
  if (primary) {
    const primaryLocator = page.locator(`[data-testid="primary-nav-${primary}"]`).first();
    if (await primaryLocator.isVisible().catch(() => false)) {
      await primaryLocator.click();
    }
  }
  await page.locator(`[data-testid="section-tab-${tab}"]`).first().click();
}

export async function simulateSingleWeek(page) {
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);
  await page.evaluate(() => {
    const btn = document.querySelector('.app-advance-btn');
    if (btn) btn.click();
    else if (window.handleGlobalAdvance) window.handleGlobalAdvance();
  });
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
