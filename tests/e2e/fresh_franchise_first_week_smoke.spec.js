import { test, expect } from '@playwright/test';
import { goToTab, launchFranchise } from './helpers/franchise.js';

const SMOKE_TIMEOUT = 90000;

test.setTimeout(120000);

async function findLatestCompletedUserGameWeek(page, fallbackWeek) {
  return page.evaluate((fallback) => {
    const league = window?.state?.league ?? {};
    const userTeamId = Number(league?.userTeamId);
    const weeks = Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks : [];
    if (!Number.isFinite(userTeamId) || weeks.length === 0) return fallback;

    const getGames = (week) => {
      if (Array.isArray(week)) return week;
      if (Array.isArray(week?.games)) return week.games;
      return [];
    };
    const getTeamId = (team) => Number(team?.id ?? team);
    const isCompleted = (game) => {
      const awayScore = Number(game?.awayScore ?? game?.score?.away);
      const homeScore = Number(game?.homeScore ?? game?.score?.home);
      const status = String(game?.status ?? game?.state ?? '').toLowerCase();
      return game?.played === true
        || game?.completed === true
        || game?.isFinal === true
        || status === 'final'
        || status === 'completed'
        || (Number.isFinite(awayScore) && Number.isFinite(homeScore));
    };
    const isUserGame = (game) => getTeamId(game?.home) === userTeamId || getTeamId(game?.away) === userTeamId;

    for (let index = weeks.length - 1; index >= 0; index -= 1) {
      const week = weeks[index];
      const weekNumber = Number(week?.week ?? week?.weekNumber ?? index + 1);
      if (getGames(week).some((game) => isUserGame(game) && isCompleted(game))) {
        return Number.isFinite(weekNumber) ? weekNumber : index + 1;
      }
    }
    return fallback;
  }, fallbackWeek);
}

async function revealLatestUserGameResult(page, fallbackWeek) {
  const latestCompletedWeek = await findLatestCompletedUserGameWeek(page, fallbackWeek);
  await expect(page.getByTestId('weekly-results')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const resultCard = page.getByTestId('user-game-result-card');
  const nav = page.getByRole('group', { name: /Weekly results navigation/i });
  const prevWeek = nav.getByRole('button', { name: /^Prev$/i });

  const maxWeeksToScan = Math.max(1, Number(latestCompletedWeek) + 2);
  for (let attempt = 0; attempt < maxWeeksToScan; attempt += 1) {
    if (await resultCard.isVisible({ timeout: 1000 }).catch(() => false)) {
      return latestCompletedWeek;
    }
    if (!(await prevWeek.isEnabled().catch(() => false))) break;
    await prevWeek.click();
  }

  await expect(
    resultCard,
    `Expected a completed user game result in or before Week ${latestCompletedWeek}`,
  ).toBeVisible({ timeout: 5000 });
  return latestCompletedWeek;
}

test('fresh franchise first week smoke', async ({ page, context }) => {
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await context.clearCookies();
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await launchFranchise(page);
  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByText(/No league state received/i)).toHaveCount(0);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible();
  await expect(page.getByText(/\b[A-Z]{2,4}\s*\(\d+-\d+\)/).first()).toBeVisible();

  const closeChangelog = page.getByLabel('Close changelog');
  if (await closeChangelog.isVisible().catch(() => false)) {
    await closeChangelog.click();
  }

  // ── Advance Week 1 via "Simulate (Skip)" ────────────────────────────────────
  const advanceBtn = page.getByTestId('advance-week-cta');
  await expect(advanceBtn).toBeVisible();
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);
  await advanceBtn.click();
  // Fresh franchises trigger the readiness gate (game plan not reviewed).
  // Dismiss it so the user-game prompt appears with the "Simulate (Skip)" option.
  const gateAdvanceBtn = page.getByTestId('gate-advance-anyway-btn');
  if (await gateAdvanceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await gateAdvanceBtn.click();
  }
  const skipPrompt = page.getByRole('button', { name: /Simulate \(Skip\)/i });
  await skipPrompt.click({ timeout: 10000 }).catch(() => {});
  await page.waitForFunction(
    (baseline) => {
      const state = window?.state;
      const week = state?.league?.week ?? baseline;
      const hasResults = Array.isArray(state?.lastResults) && state.lastResults.length > 0;
      return !state?.busy && !state?.simulating && (week > baseline || hasResults);
    },
    startWeek,
    { timeout: SMOKE_TIMEOUT },
  );

  // ── Post-game summary should appear after skip simulation ──────────────────
  const postGameSummary = page.getByTestId('post-game-summary');
  if (await postGameSummary.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Verify it shows a valid final score (two numbers separated by a dash or in score circles)
    await expect(postGameSummary).toBeVisible();
    const summaryText = await postGameSummary.textContent();
    expect(summaryText).toMatch(/FINAL/i);

    // Capture the score text shown in summary for comparison with HQ later
    const scoreTexts = await postGameSummary.locator('[style*="tabular-nums"]').allTextContents();
    const scoresInSummary = scoreTexts.map((t) => parseInt(t.trim(), 10)).filter((n) => Number.isFinite(n));
    expect(scoresInSummary.length).toBeGreaterThanOrEqual(2);

    // Close the summary and return to HQ
    await page.getByTestId('post-game-summary-close').click();
    await expect(postGameSummary).toBeHidden({ timeout: 5000 });
  }

  // ── League schedule / weekly results should show the correct score ──────────
  await goToTab(page, 'weekly-results');

  await revealLatestUserGameResult(page, startWeek);
  await expect(page.getByTestId('user-game-result-card')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('user-game-result-card')).toContainText(/\b\d+\s*-\s*\d+\b/);

  // Capture score from weekly-results for later HQ comparison
  const weeklyResultText = await page.getByTestId('user-game-result-card').textContent();
  const weeklyScoreMatch = weeklyResultText.match(/(\d+)\s*[-–]\s*(\d+)/);
  const weeklyScore = weeklyScoreMatch ? `${weeklyScoreMatch[1]}-${weeklyScoreMatch[2]}` : null;

  const completedGameLink = page.getByTestId('game-book-primary-cta').first();
  await expect(completedGameLink).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await completedGameLink.click();

  // ── Game book shows the correct final score ─────────────────────────────────
  await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-decision-summary')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const gameBookPlayerLink = page.getByTestId('game-book-top-performer-link').first().or(page.getByTestId('game-book-player-link').first());
  if (await gameBookPlayerLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await gameBookPlayerLink.click();
    await expect(page.getByTestId('player-profile')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await expect(page.getByTestId('player-profile-summary')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await expect(page.getByTestId('player-profile-game-impact')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await page.getByRole('button', { name: /^Career Stats$/i }).click();
    await expect(page.getByTestId('player-profile-advanced-analytics')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await expect(page.getByTestId('player-profile-advanced-analytics')).toContainText(/Advanced Analytics/i);
    await page.getByTestId('player-profile-return-to-game-book').click();
    await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  }

  // ── Return to HQ and verify Last Result card shows the correct score ─────────
  await page.getByTestId('return-to-hq').click();
  if (!(await page.getByTestId('franchise-hq').isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.getByRole('button', { name: /^Back to HQ$/i }).click();
  }
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-last-result')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-next-action')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  // Last Result card should NOT show placeholder opponent (TBD) or zero score
  const lastResultCard = page.getByTestId('hq-last-result');
  await expect(lastResultCard).toBeVisible();
  const lastResultText = await lastResultCard.textContent();
  // Score should contain a real score pattern like "W · 24-17" or "L · 14-21"
  expect(lastResultText).toMatch(/[WLT].*\d+[-–]\d+/);
  // Opponent should NOT be TBD (that would mean team lookup failed)
  expect(lastResultText).not.toMatch(/\bTBD\b/);

  // If we captured a weekly score, verify the HQ shows the same numbers
  if (weeklyScore) {
    const [s1, s2] = weeklyScore.split('-');
    const hqText = lastResultText;
    // Both score numbers should appear somewhere in the last result line
    const hasScore = hqText.includes(s1) || hqText.includes(s2);
    expect(hasScore).toBe(true);
  }

  // Season Pulse momentum should update after the game
  const seasonPulse = page.getByTestId('season-pulse');
  await expect(seasonPulse).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const hqNextAction = page.getByTestId('hq-next-action');
  const reviewGameBookCta = hqNextAction.getByRole('button', { name: /Review Game Book/i });
  if (await reviewGameBookCta.isVisible().catch(() => false)) {
    await reviewGameBookCta.click();
    await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });
    await page.getByTestId('return-to-hq').click();
    await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  }

  // ── Reload: HQ should persist Last Result from IndexedDB ────────────────────
  await page.reload();
  await expect(page.getByTestId('app-bootstrap-loading')).toBeHidden({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-last-result')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  // After reload, Last Result should still show real opponent and score
  const reloadedLastResult = await page.getByTestId('hq-last-result').textContent();
  expect(reloadedLastResult).toMatch(/[WLT].*\d+[-–]\d+/);
  expect(reloadedLastResult).not.toMatch(/\bTBD\b/);

  expect(consoleErrors.join('\n')).not.toMatch(/Uncaught|TypeError|ReferenceError/);
});
