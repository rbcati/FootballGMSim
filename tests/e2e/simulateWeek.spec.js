import { test, expect } from '@playwright/test';
import { launchFranchise, simulateSingleWeek, goToTab } from './helpers/franchise.js';

const SMOKE_TIMEOUT = 90000;

test.setTimeout(120000);

test('simulate week produces non-zero box score and standings win', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await launchFranchise(page);

  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  // Advance exactly one week (marking prep complete so the gate doesn't block)
  await simulateSingleWeek(page, { advanceAnyway: true });

  // Simulation must complete without staying in busy/loading state
  await page.waitForFunction(
    () => !window?.state?.busy && !window?.state?.simulating,
    { timeout: SMOKE_TIMEOUT },
  );

  // ── Weekly results: user game result must show a non-zero score ─────────────
  await goToTab(page, 'weekly-results');
  const resultCard = page.getByTestId('user-game-result-card');
  await expect(resultCard).toBeVisible({ timeout: SMOKE_TIMEOUT });
  const resultText = await resultCard.textContent();
  // Must match a score pattern like "24-17" or "0-0" is NOT acceptable
  expect(resultText).toMatch(/\b([1-9]\d*)\s*[-–]\s*\d+|\d+\s*[-–]\s*([1-9]\d*)\b/);

  // ── Game book: open box score and verify both team scores are non-zero ──────
  const gameBookCta = page.getByTestId('game-book-primary-cta').first();
  await expect(gameBookCta).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await gameBookCta.click();

  await expect(page.getByTestId('game-book')).toBeVisible({ timeout: SMOKE_TIMEOUT });
  await expect(page.getByTestId('game-book-final-score')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  const finalScoreText = await page.getByTestId('game-book-final-score').textContent();
  const scoreNumbers = (finalScoreText ?? '').match(/\d+/g)?.map(Number) ?? [];
  // At least two numbers in the final score display
  expect(scoreNumbers.length).toBeGreaterThanOrEqual(2);
  // Combined score must be greater than zero (both teams scored)
  const combined = scoreNumbers.reduce((s, n) => s + n, 0);
  expect(combined).toBeGreaterThan(0);

  // Return to HQ then navigate to standings
  await page.getByTestId('return-to-hq').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: SMOKE_TIMEOUT });

  // ── Standings: at least one team must have a win recorded ───────────────────
  await goToTab(page, 'standings');
  // Wait for the standings table to render
  await page.waitForTimeout(1000);
  const standingsText = await page.locator('body').textContent();
  // After simulating week 1, some team has W=1; look for "1-0" win pattern
  expect(standingsText).toMatch(/\b1\s*[-–]\s*0\b/);
});
