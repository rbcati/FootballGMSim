import { test, expect } from '@playwright/test';
import { launchFranchise, goToTab } from './helpers/franchise.js';

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

async function openUserResultGameBook(page) {
  const link = page.getByTestId('user-game-result-card').getByTestId('game-book-primary-cta');
  await expect(link).toBeVisible();
  await expect(link).toBeEnabled();
  // The app uses smooth document scrolling. Settle the result's position
  // before a real pointer click, including after reload scroll restoration.
  await link.evaluate((button) => button.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await expect(link).toBeInViewport();
  try {
    await link.click({ timeout: 15000 });
  } catch (error) {
    console.log('Game Book navigation state', await page.evaluate(() => ({
      hydrated: window.state?.isHydrated,
      busy: window.state?.busy,
      week: window.state?.league?.week,
      phase: window.state?.league?.phase,
      resultsVisible: Boolean(document.querySelector('[data-testid="weekly-results"]')),
      hqVisible: Boolean(document.querySelector('[data-testid="franchise-hq"]')),
    })));
    throw error;
  }
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

  // ── Advance Week 1 while skipping presentation ──────────────────────────────
  const advanceBtn = page.getByTestId('advance-week-cta');
  await expect(advanceBtn).toBeVisible();
  const startWeek = await page.evaluate(() => window?.state?.league?.week ?? 1);

  // NEXT UP owns readiness and progression. Complete prep through the live routes.
  await expect(page.locator('.app-advance-btn')).toHaveCount(0);
  await expect(page.getByTestId('hq-next-game').getByRole('button')).toHaveCount(0);
  await expect(advanceBtn).toHaveText(/Review Game Plan/);
  await advanceBtn.click();
  await expect(page.getByRole('button', { name: 'Save Game Plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to HQ', exact: true }).click();
  await expect(advanceBtn).toHaveText(/Play Week/);
  await page.getByText('More Prep', { exact: true }).click();
  const optionalScout = page.locator('.hq-v2-more button').filter({ hasText: 'Opponent has not been scouted.' });
  await expect(optionalScout).toContainText('Optional');
  await optionalScout.click();
  await expect(page.getByTestId('weekly-prep-scout-summary')).toBeVisible();
  await page.getByRole('button', { name: 'Back to HQ', exact: true }).click();
  await expect(page.getByTestId('hq-next-action')).toContainText('READY FOR GAME DAY');
  await expect(page.getByRole('button', { name: /Play Week/ })).toHaveCount(1);
  await advanceBtn.click();
  // The skip-presentation prompt is REQUIRED in this flow (fresh franchise, the
  // user always has a Week 1 game). Assert it appears and is clickable rather
  // than swallowing a missing button — a vanished prompt is a real defect.
  const skipPrompt = page.getByRole('button', { name: /Simulate Week \(Skip Presentation\)/i });
  await expect(skipPrompt).toBeVisible({ timeout: 10000 });
  await expect(skipPrompt).toBeEnabled();
  await skipPrompt.click();
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
  let postGameSummaryVisible = false;
  try {
    await postGameSummary.waitFor({ state: "visible", timeout: 5000 });
    postGameSummaryVisible = true;
  } catch (err) {
    if (err.name !== "TimeoutError") throw err;
  }
  if (postGameSummaryVisible) {
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

  await openUserResultGameBook(page);

  // ── Game book shows the correct final score ─────────────────────────────────
  await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-decision-summary')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const gameBookPlayerLink = page.getByTestId('game-book-top-performer-link').first().or(page.getByTestId('game-book-player-link').first());
  let gbpVisible = false;
  try {
    await gameBookPlayerLink.waitFor({ state: "visible", timeout: 5000 });
    gbpVisible = true;
  } catch (err) {
    if (err.name !== "TimeoutError") throw err;
  }
  if (gbpVisible) {
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

  // ── Follow the canonical Game Book return flow, then return to HQ ───────────
  // This Game Book was opened from Weekly Results, so its single route-owned
  // return control correctly restores that source before the user returns home.
  const gameBookReturn = page.getByTestId('game-book-return');
  await expect(gameBookReturn).toHaveAccessibleName(/Back to Weekly Results/i);
  await gameBookReturn.click();
  await expect(page.getByTestId('weekly-results')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await page.getByRole('button', { name: /^Back to HQ$/i }).click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('hq-next-action')).toBeVisible();
  await expect(page.getByTestId('hq-next-game').getByRole('button')).toHaveCount(0);
  await expect(page.getByText('More Prep', { exact: true })).toBeVisible();
  await expect(page.locator('.hq-v2-more')).not.toHaveAttribute('open', '');

  // Reload retains the canonical result on Weekly Results and Game Book.
  const savedFranchise = await page.evaluate(() => ({
    activeLeagueId: window.state?.league?.activeLeagueId,
    franchiseGenerationId: window.state?.league?.franchiseGenerationId,
  }));
  expect(savedFranchise.activeLeagueId).toBeTruthy();
  expect(savedFranchise.franchiseGenerationId).toBeTruthy();
  await page.reload();
  // Wait for this save to restore. The fresh-start helper can click an empty
  // slot while the saved franchise is still loading and create a new league.
  await page.waitForFunction(({ activeLeagueId, franchiseGenerationId }) => (
    window.state?.isHydrated && !window.state?.busy && !window.state?.simulating
    && window.state?.league?.activeLeagueId === activeLeagueId
    && window.state?.league?.franchiseGenerationId === franchiseGenerationId
  ), savedFranchise, { timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await goToTab(page, 'weekly-results');
  await revealLatestUserGameResult(page, startWeek);
  const reloadedResult = await page.getByTestId('user-game-result-card').textContent();
  expect(reloadedResult).toMatch(/\b\d+\s*-\s*\d+\b/);
  if (weeklyScore) expect(reloadedResult.replace(/\s/g, '')).toContain(weeklyScore);
  await openUserResultGameBook(page);
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  expect(consoleErrors.join('\n')).not.toMatch(/Uncaught|TypeError|ReferenceError/);
});

// Run touch acceptance in the existing first-session CI job.
test.describe('HQ mobile acceptance', () => {
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('390px HQ exposes one readiness owner and touch help', async ({ page }) => {
  await launchFranchise(page);
  const changelog = page.getByLabel('Close changelog');
  if (await changelog.isVisible()) await changelog.click();
  const hq = page.getByTestId('franchise-hq');
  await expect(hq).toBeVisible();
  await expect(page.locator('.app-advance-btn')).toHaveCount(0);
  await expect(hq.locator('.hq-v2-primary')).toHaveCount(1);
  await expect(page.getByTestId('hq-next-game').getByRole('button')).toHaveCount(0);
  await expect(page.locator('.hq-v2-more')).not.toHaveAttribute('open', '');
  const power = page.getByRole('button', { name: 'Power rank help', exact: true });
  await power.tap();
  await expect(power).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Weekly team ranking based on current results, point differential, and recent form.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(power).toHaveAttribute('aria-expanded', 'false');
  const div = page.getByRole('button', { name: 'Division record help', exact: true });
  await div.tap();
  await expect(page.getByText('Record against teams in your division.')).toBeVisible();
  const triggerBounds = await div.boundingBox();
  const helpBounds = await page.getByText('Record against teams in your division.').boundingBox();
  expect(helpBounds.y).toBeGreaterThanOrEqual(triggerBounds.y + triggerBounds.height);
  await div.tap();
  await expect(page.getByText('Record against teams in your division.')).toHaveCount(0);
  const week = await page.evaluate(() => window.state.league.week);
  await expect(page.getByTestId('advance-week-cta')).toHaveText(/Review Game Plan/);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Save Game Plan', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.state.league.week)).toBe(week);
  await page.getByRole('button', { name: 'Back to HQ', exact: true }).click();
  await expect(page.locator('.app-advance-btn')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('hq-390.png'), fullPage: true });
});

});
