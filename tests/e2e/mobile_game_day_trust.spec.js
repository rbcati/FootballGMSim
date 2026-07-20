import { test, expect } from '@playwright/test';
import { launchFranchise } from './helpers/franchise.js';

/**
 * Mobile game-day trust & recovery loop:
 *   fresh franchise → advance week → watch user game → final → postgame
 *   → Game Book (canonical id) → return to HQ, plus the missing-game
 *   recovery fallback.
 *
 * Score authority under test: the league-recorded GAME_EVENT final must be
 * the only score shown at the final whistle, in postgame, and in HQ's last
 * result — the narrated play stream is a different engine.
 */

const IPHONE = { width: 390, height: 844 };

async function markWeeklyPrepDone(page) {
  await page.evaluate(() => {
    const PREP_KEY = 'footballgm_weekly_prep_v1';
    const league = window?.state?.league ?? {};
    const slotKey = `${league?.seasonId ?? 'season'}:${league?.week ?? 1}:${league?.userTeamId ?? 'user'}`;
    const stored = JSON.parse(window.localStorage.getItem(PREP_KEY) ?? '{}');
    stored[slotKey] = { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true };
    window.localStorage.setItem(PREP_KEY, JSON.stringify(stored));
  });
}

async function advanceIntoUserGamePrompt(page) {
  await markWeeklyPrepDone(page);
  const advance = page.getByTestId('advance-week-cta');
  if (await advance.isVisible().catch(() => false)) {
    await advance.click();
  } else {
    await page.evaluate(() => window.handleGlobalAdvance?.());
  }
  const advanceAnywayBtn = page.getByRole('button', { name: /Advance anyway/i });
  if (await advanceAnywayBtn.isVisible().catch(() => false)) {
    await advanceAnywayBtn.click({ timeout: 1500 });
  }
  await page.getByRole('button', { name: /Watch \(Broadcast Pace\)/ }).waitFor({ state: 'visible', timeout: 45000 });
}

test.describe('Mobile game-day trust loop', () => {
  test('watch → final → postgame → Game Book → HQ uses the canonical result end to end', async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await launchFranchise(page);
    await advanceIntoUserGamePrompt(page);

    await page.getByRole('button', { name: /Watch \(Broadcast Pace\)/ }).click();
    await expect(page.locator('.watch-overlay')).toBeVisible({ timeout: 30000 });

    // The canonical league-recorded final is available from GAME_EVENT.
    const canonical = await page.evaluate(() => {
      const league = window.state.league;
      const ev = (window.state.gameEvents ?? []).find(
        (e) => Number(e.homeId) === Number(league.userTeamId) || Number(e.awayId) === Number(league.userTeamId),
      );
      return ev ? { home: Number(ev.homeScore), away: Number(ev.awayScore), gameId: ev.gameId } : null;
    });
    expect(canonical).not.toBeNull();

    // During playback the scorebug shows the CANONICAL running score — the
    // scoreAfter values from the drive-level event ledger (#1700). It must be
    // numeric (no pending dashes) and must never exceed the league-recorded
    // final, proving it is derived from canonical scoreAfter and never from a
    // contradicting narration score.
    const bug = page.getByTestId('watch-scorebug');
    await expect(bug).toBeVisible();
    await expect(bug.locator('.sb-score-pending')).toHaveCount(0);
    const liveScores = await bug.locator('.sb-team strong').allTextContents();
    const liveNums = liveScores.map((t) => parseInt(t.trim(), 10)).filter((n) => Number.isFinite(n));
    expect(liveNums.length).toBe(2);
    // Scorebug DOM order is away, then home.
    const [liveAway, liveHome] = liveNums;
    expect(liveHome).toBeGreaterThanOrEqual(0);
    expect(liveHome).toBeLessThanOrEqual(canonical.home);
    expect(liveAway).toBeGreaterThanOrEqual(0);
    expect(liveAway).toBeLessThanOrEqual(canonical.away);

    // No horizontal overflow, and the compact control tray is on-screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('.watch-controls-tray')).toBeInViewport();

    // Skip to the end via the compact Skip menu.
    await page.locator('.skip-menu > summary').click();
    await page.getByRole('button', { name: /^Sim End$/ }).click();
    await expect(page.locator('.watch-final-card')).toBeVisible({ timeout: 20000 });

    // Final card shows the canonical score.
    const finalCard = page.locator('.watch-final-card');
    await expect(finalCard).toContainText(String(canonical.home));
    await expect(finalCard).toContainText(String(canonical.away));

    // Postgame screen: same canonical numbers, Game Book CTA enabled.
    await page.getByRole('button', { name: /Open Final Game Book/i }).click();
    const boxScoreCta = page.getByTestId('box-score-trigger');
    await expect(boxScoreCta).toBeVisible({ timeout: 20000 });
    await expect(boxScoreCta).toBeEnabled();
    await expect(page.getByTestId('postgame-result-banner')).toBeVisible();
    const postgameText = await page.evaluate(() => document.body.innerText);
    expect(postgameText).toContain(String(canonical.home));
    expect(postgameText).toContain(String(canonical.away));

    // Open the Game Book — it must resolve the just-played canonical game,
    // never a placeholder 0-0 or an error over an unrelated screen.
    await boxScoreCta.click();
    await expect(page.getByTestId('game-book')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('game-book-recovery')).toHaveCount(0);
    const sticky = page.getByTestId('game-book-sticky-score');
    await expect(sticky).toContainText(String(canonical.home));
    await expect(sticky).toContainText(String(canonical.away));

    // Return to HQ (restores postgame), then continue the weekly loop.
    await page.getByTestId('game-book-sticky-back').click();
    await expect(page.getByTestId('box-score-trigger')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Back to Hub/i }).click();

    // The rest of the week simulates; wait for it to settle.
    await page.waitForFunction(() => !window?.state?.simulating && !window?.state?.busy, null, { timeout: 90000 });

    // Route cleanup: no stale drawer, no postgame overlay, no game-book modal.
    await expect(page.locator('.mobile-nav-panel.open')).toHaveCount(0);
    await expect(page.getByTestId('game-book')).toHaveCount(0);
    await expect(page.getByTestId('box-score-trigger')).toHaveCount(0);
    const drawerHidden = await page.evaluate(() => {
      const panel = document.querySelector('.mobile-nav-panel');
      if (!panel) return true;
      const rect = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      return style.visibility === 'hidden' || rect.left >= window.innerWidth || rect.right <= 0;
    });
    expect(drawerHidden).toBeTruthy();

    // Notification stack is capped and compact — never a wall of cards.
    const noticeCount = await page.locator('[data-testid="app-notifications"] .app-notification').count();
    expect(noticeCount).toBeLessThanOrEqual(4); // 3 visible + optional overflow summary

    // HQ's last-result surface agrees with the canonical final.
    const hqText = await page.evaluate(() => document.body.innerText);
    expect(hqText).toContain(String(canonical.home));
    expect(hqText).toContain(String(canonical.away));

    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('missing Game Book produces an anchored recovery state and one clean return', async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await launchFranchise(page);

    // Controlled missing-game fixture: a canonical-looking id that exists in
    // no archive, schedule, or league index.
    await page.evaluate(() => window.gameController.openBoxScore('s1_w99_998_999'));

    const recovery = page.getByTestId('game-book-recovery');
    await expect(recovery).toBeVisible({ timeout: 20000 });
    await expect(recovery).toContainText('Game Book unavailable');
    // No fabricated final behind or inside the recovery surface.
    await expect(page.getByTestId('game-book-sticky-score')).toHaveCount(0);
    await expect(recovery).not.toContainText('0 - 0');

    await page.getByTestId('game-book-recovery-return').click();
    await expect(page.getByTestId('game-book')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});
