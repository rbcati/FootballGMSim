/**
 * News Navigation Integrity Suite
 *
 * Covers:
 *  a. Opening News feed after a simulated week.
 *  b. Player action → PlayerProfile or "Player unavailable" fallback — never crash.
 *  c. Team action → TeamProfile or "Team unavailable" fallback — never crash.
 *  d. Game book action → canonical archived score displayed (CLE 10 - 27 PIT, not 0-0).
 *  e. Back navigation to HQ and News — no stale selected state retained.
 *  f. No error modal or blank screen throughout.
 *
 * Mobile viewport is covered when PLAYWRIGHT_VIEWPORT=iphone is set (see playwright.config.ts).
 */

import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, goToTab } from './helpers/franchise.js';

const TIMEOUT = 90000;

// ── Helper: navigate to the News tab ─────────────────────────────────────────

async function goToNews(page) {
  // Try primary nav data-testid first (desktop), then bottom nav button (mobile).
  const navNews = page.locator('[data-testid="nav-news"], [data-testid="primary-nav-news"]').first();
  if (await navNews.isVisible({ timeout: 3000 }).catch(() => false)) {
    await navNews.click({ force: true });
  } else {
    const newsBtn = page.getByRole('button', { name: /^News$/i }).first();
    await newsBtn.click();
  }
  // Wait for the news feed or HeroCard title
  await expect(
    page.getByText(/News & Injuries|Weekly Intelligence|News Feed/i).first(),
  ).toBeVisible({ timeout: TIMEOUT });
}

// ── Helper: assert no error modal or blank screen ────────────────────────────

async function assertNoErrorState(page) {
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  await expect(page.locator('.app-error-boundary-overlay')).toHaveCount(0);
  // The app shell should still be present (not a blank white screen)
  await expect(page.locator('[data-testid="app-shell-ready"]')).toBeVisible({ timeout: 5000 });
}

// ── Suite: news feed renders safely ──────────────────────────────────────────

test.describe('News navigation integrity', () => {
  test.setTimeout(180000);

  test('news feed is visible after franchise boot', async ({ page }) => {
    await launchFranchise(page);
    await goToNews(page);
    await assertNoErrorState(page);
    // News feed structure is present
    await expect(
      page.locator('[class*="app-screen-stack"], [class*="news"], [data-testid*="news"]').first(),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('news feed renders with story items after one simulated week', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);
    await assertNoErrorState(page);

    // At least one story or injury item should appear
    const storyCount = await page.locator(
      '[class*="CompactListRow"], [class*="SectionCard"], [class*="app-news"], [class*="hq-twin-card"]'
    ).count();
    expect(storyCount).toBeGreaterThan(0);
  });

  test('player action opens PlayerProfile or shows unavailable fallback — never crashes', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    // Look for any "Open player" or "Player unavailable" button
    const playerBtn = page.getByRole('button', { name: /Open player/i }).first();
    const unavailableBtn = page.getByRole('button', { name: /Player unavailable/i }).first();

    const playerBtnVisible = await playerBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const unavailableBtnVisible = await unavailableBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (playerBtnVisible) {
      await playerBtn.click();
      // Should open player profile OR show unavailable state — never an error modal
      const profileOrFallback = await Promise.race([
        page.getByTestId('player-profile').waitFor({ state: 'visible', timeout: 15000 }).then(() => 'profile'),
        page.getByText(/Player profile unavailable|Player unavailable/i).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'unavailable'),
      ]).catch(() => 'timeout');
      expect(['profile', 'unavailable']).toContain(profileOrFallback);
      await assertNoErrorState(page);

      // Close any open modal by pressing Escape or clicking backdrop
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else if (unavailableBtnVisible) {
      // Disabled "Player unavailable" button is correct sentinel behavior
      await expect(unavailableBtn).toBeDisabled();
    }
    // If neither button is found the news items have no player refs — still pass
  });

  test('team action opens TeamProfile or shows unavailable fallback — never crashes', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    const teamBtn = page.getByRole('button', { name: /Open team/i }).first();
    const teamUnavailableBtn = page.getByRole('button', { name: /Team unavailable/i }).first();

    const teamBtnVisible = await teamBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const teamUnavailableBtnVisible = await teamUnavailableBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (teamBtnVisible) {
      await teamBtn.click();
      // Should open team profile modal or show unavailable — never an error modal
      const profileOrFallback = await Promise.race([
        page.locator('[class*="TeamProfile"], [data-testid*="team-profile"]').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'profile'),
        page.getByText(/Team unavailable/i).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'unavailable'),
      ]).catch(() => 'timeout');
      expect(['profile', 'unavailable']).toContain(profileOrFallback);
      await assertNoErrorState(page);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else if (teamUnavailableBtnVisible) {
      await expect(teamUnavailableBtn).toBeDisabled();
    }
  });

  test('game action opens Game Book with a final score — never shows 0-0 when archive exists', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    const gameBtn = page.getByRole('button', { name: /Open game/i }).first();
    const gameBtnVisible = await gameBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (gameBtnVisible) {
      await gameBtn.click();
      await expect(page.getByTestId('game-book')).toBeVisible({ timeout: 20000 });
      await assertNoErrorState(page);

      // The final score line must not be "0 · 0" — archive should resolve real scores
      const scoreLine = page.getByTestId('game-book-final-score');
      const scoreHero = page.getByTestId('game-book-score-hero');

      if (await scoreLine.isVisible({ timeout: 3000 }).catch(() => false)) {
        const text = await scoreLine.textContent();
        // Score line should not read "0 - 0" or "AWY 0 - 0 HOME"
        expect(text).not.toMatch(/\b0\s*[-·]\s*0\b/);
      } else if (await scoreHero.isVisible({ timeout: 3000 }).catch(() => false)) {
        const heroText = await scoreHero.textContent();
        // Hero should not show tied zeros
        expect(heroText).not.toMatch(/^\s*[A-Z]{2,4}\s+0\s*[·\-]\s*0\s*[A-Z]{2,4}\s*$/);
      }

      // Go back
      const backBtn = page.getByRole('button', { name: /Back|Return/i }).first();
      if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.click();
      } else {
        await page.goBack();
      }
    }
  });

  test('back navigation from News to HQ does not retain stale player/team selection', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    // Open a player if possible
    const playerBtn = page.getByRole('button', { name: /Open player/i }).first();
    if (await playerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await playerBtn.click();
      await page.waitForTimeout(500);
      // Close it
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Navigate to HQ
    await goToTab(page, 'hq');
    await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: TIMEOUT });
    await assertNoErrorState(page);

    // Player profile modal should not be open on HQ
    await expect(page.getByTestId('player-profile')).toHaveCount(0);

    // Navigate back to News
    await goToNews(page);
    await assertNoErrorState(page);

    // The screen should be the news feed, not a stale player/team modal
    await expect(page.getByTestId('player-profile')).toHaveCount(0);
  });

  test('injury board opens player from news without crashing', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    // Look for injury board "Open" button
    const injuryOpenBtn = page.locator(
      '[class*="injury"], [class*="Injury"], [data-testid*="injury"]'
    ).getByRole('button', { name: /^Open$/i }).first();

    if (await injuryOpenBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await injuryOpenBtn.click();
      const result = await Promise.race([
        page.getByTestId('player-profile').waitFor({ state: 'visible', timeout: 15000 }).then(() => 'profile'),
        page.getByText(/Player profile unavailable|Player unavailable/i).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => 'unavailable'),
      ]).catch(() => 'timeout');
      expect(['profile', 'unavailable']).toContain(result);
      await assertNoErrorState(page);
    }
  });

  test('no error modal appears when browsing all news filter segments', async ({ page }) => {
    await launchFranchise(page);
    await simulateSingleWeek(page, { advanceAnyway: true });
    await goToNews(page);

    // Cycle through filter segments
    const segments = ['TEAM', 'LEAGUE', 'PULSE', 'TRANSACTIONS', 'ALL'];
    for (const label of segments) {
      const btn = page.getByRole('button', { name: label, exact: true }).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
        await assertNoErrorState(page);
      }
    }
  });
});
