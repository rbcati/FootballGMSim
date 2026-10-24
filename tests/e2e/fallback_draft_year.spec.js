import { test, expect } from '@playwright/test';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';

async function readCareer(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('FootballGM_League_save_slot_1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const read = store => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const meta = (await read('meta')).find(row => row.id === 'league');
    const picks = await read('draftPicks');
    db.close();
    return { year: meta.year, userTeamId: meta.userTeamId, difficulty: meta.settings.difficultyPreset, picks };
  });
}

for (const year of [2025, 2026, 2031]) {
  test(`selected team, ${year}, difficulty and draft assets survive reload`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-new-franchise-cta').first().click();
    await page.locator('.team-card').filter({ hasText: 'Miami' }).click();
    await page.getByTestId('onboarding-continue-button').click();
    await page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input').fill(String(year));
    await page.getByRole('button', { name: /Hard.*Tougher AI/ }).click();
    await page.getByTestId('onboarding-continue-button').click();
    await page.getByTestId('start-dynasty-button').click();
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    if (year === 2025) {
      const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
      await expect(skip).toBeVisible();
      await skip.click();
      await expect(skip).toBeHidden();
    }
    const before = await readCareer(page);
    expect(before).toMatchObject({ year, difficulty: 'Hard', userTeamId: DEFAULT_TEAMS.find(t => t.name.includes('Miami')).id });
    expect(before.picks).toHaveLength(672);
    expect([...new Set(before.picks.map(p => p.season))].sort()).toEqual([year, year + 1, year + 2]);
    expect(new Set(before.picks.map(p => p.id)).size).toBe(672);
    for (const pick of before.picks) {
      expect(pick.id).toBe(`safe-pick-${pick.originalOwner}-${pick.season}-${pick.round}`);
      expect(pick.currentOwner).toBe(pick.originalOwner);
    }
    await page.reload();
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    await page.waitForFunction(() => !window.state.busy && window.state.league.activeLeagueId === 'save_slot_1');
    expect(await readCareer(page)).toEqual(before);
  });
}
