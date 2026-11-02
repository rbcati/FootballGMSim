import { test, expect } from '@playwright/test';
import { goToTab } from './helpers/franchise.js';
import { observeStartup, selectBuffalo, finishCreation, readFranchise, activateReplacement, quickSave, manageSaves } from './helpers/startup.js';

test.afterEach(async ({}, info) => { await info.onStartupEvidence?.(); });

test('first controller acquisition preserves in-progress Buffalo onboarding', async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info, { holdRegistration: true });
  await page.goto('/');
  await selectBuffalo(page);
  const documentId = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(() => window.__releaseServiceWorkerInstall());
  await expect.poll(() => trace.events.filter(row => row.event === 'controllerchange').length).toBe(1);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  await expect(page.getByTestId('onboarding-continue-button')).toBeVisible();
  await expect(page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input')).toHaveValue('2026');
  await finishCreation(page);
  const saved = await readFranchise(page);
  expect(saved.meta.generationDiagnostics).toEqual({ source: 'normal', validationReasons: [] });
  expect(saved.meta.year).toBe(2026);
  expect(saved.teams.find(team => team.id === saved.meta.userTeamId).name).toContain('Buffalo');
  expect(saved.players).toHaveLength(1696);
  expect(saved.players.every(player => typeof player.id === 'string')).toBe(true);
  expect(new Set(saved.players.map(player => player.years)).size).toBeGreaterThan(1);
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  const restored = await readFranchise(page);
  expect(restored.players).toEqual(saved.players);
  expect(restored.meta.franchiseGenerationId).toBe(saved.meta.franchiseGenerationId);
});

for (const attempt of [1, 2, 3]) test(`fresh natural activation creates one independent normal franchise ${attempt}`, async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info);
  await page.goto('/');
  await selectBuffalo(page);
  await finishCreation(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const created = await readFranchise(page);
  expect(created.meta.generationDiagnostics.source).toBe('normal');
  expect(created.meta.year).toBe(2026);
  expect(created.teams.find(team => team.id === created.meta.userTeamId).name).toContain('Buffalo');
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(1);
  expect(trace.events.filter(row => row.kind === 'navigation')).toHaveLength(1);
  await page.goto('/');
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  expect((await readFranchise(page)).players).toEqual(created.players);
  expect(trace.events.filter(row => row.kind === 'navigation')).toHaveLength(2);
});

test('replacement activation defers restart through onboarding and acknowledged creation save', async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await selectBuffalo(page);
  const documentId = await page.evaluate(() => performance.timeOrigin);
  await activateReplacement(page);
  await expect.poll(() => trace.events.filter(row => row.event === 'controllerchange').length).toBe(2);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  await expect(page.getByTestId('onboarding-continue-button')).toBeVisible();
  await finishCreation(page);
  await page.waitForFunction(before => performance.timeOrigin !== before && window.state?.isHydrated
    && !window.state.busy && window.state.league?.activeLeagueId === 'save_slot_1', documentId);
  const saved = await readFranchise(page);
  expect(saved.meta.generationDiagnostics.source).toBe('normal');
  expect(saved.meta.year).toBe(2026);
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(1);
  const checkpoint = trace.events.filter(row => row.event === 'worker-send' && row.type === 'SAVE_SLOT'
    && row.generation === saved.meta.franchiseGenerationId).at(-1);
  expect(checkpoint).toBeTruthy();
  const acknowledged = trace.events.find(row => row.event === 'worker-response' && row.type === 'SAVED' && row.id === checkpoint.id);
  expect(acknowledged).toBeTruthy();
  expect(trace.events.filter(row => row.kind === 'navigation').at(-1).at).toBeGreaterThanOrEqual(acknowledged.at);
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  expect((await readFranchise(page)).players).toEqual(saved.players);
  expect(trace.events.filter(row => row.kind === 'navigation')).toHaveLength(3);
});

test('2026 Buffalo Week 1 and two independent slots survive live startup and reload', async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await selectBuffalo(page);
  await finishCreation(page);
  const initial = await readFranchise(page);
  expect(initial.meta.generationDiagnostics.source).toBe('normal');
  expect(initial.meta.year).toBe(2026);
  await goToTab(page, 'roster');
  await goToTab(page, 'hq');
  await goToTab(page, 'schedule');
  await goToTab(page, 'hq');
  await page.getByTestId('advance-week-cta').click();
  await page.getByText('More Options', { exact: true }).click();
  await page.getByRole('button', { name: /Simulate Week \(Skip Presentation\)/ }).click();
  await page.waitForFunction(() => !window.state.busy && !window.state.simulating && window.state.league.week === 2);
  const summary = page.getByTestId('post-game-summary-close');
  try { await summary.waitFor({ state: 'visible', timeout: 5000 }); await summary.click(); }
  catch (error) { if (error.name !== 'TimeoutError') throw error; }
  await goToTab(page, 'weekly-results');
  const result = page.getByTestId('user-game-result-card');
  await expect(result).toContainText(/\d+\s*[-–]\s*\d+/);
  const score = (await result.textContent()).match(/\d+\s*[-–]\s*\d+/)[0].replace(/\s/g, '');
  const gameBook = page.getByTestId('user-game-result-card').getByTestId('game-book-primary-cta');
  await gameBook.evaluate(button => button.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await expect(gameBook).toBeInViewport();
  await gameBook.click();
  await expect(page.getByTestId('game-book-final-score')).toBeVisible();
  await goToTab(page, 'hq');
  await quickSave(page, trace);
  const played = await readFranchise(page);
  const team = played.teams.find(row => row.id === played.meta.userTeamId);
  expect(team.wins + team.losses + (team.ties ?? 0)).toBe(1);
  expect(played.meta.currentWeek).toBe(2);
  expect(played.players.map(row => row.id)).toEqual(initial.players.map(row => row.id));
  expect(played.players.map(row => row.contract)).toEqual(initial.players.map(row => row.contract));
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  const restored = await readFranchise(page);
  expect(restored.players).toEqual(played.players);
  expect(restored.games).toEqual(played.games);
  expect(restored.teams).toEqual(played.teams);
  expect(restored.meta).toMatchObject({ year: 2026, currentWeek: 2, franchiseGenerationId: played.meta.franchiseGenerationId, userTeamId: played.meta.userTeamId });
  await goToTab(page, 'weekly-results');
  await expect(page.getByTestId('user-game-result-card')).toContainText(new RegExp(score.replace('-', '\\s*[-–]\\s*')));
  await goToTab(page, 'hq');
  await manageSaves(page);
  await selectBuffalo(page, 2);
  await finishCreation(page);
  const second = await readFranchise(page);
  expect(second.meta.franchiseGenerationId).not.toBe(played.meta.franchiseGenerationId);
  expect(second.meta.currentWeek).toBe(1);
  expect(new Set(second.players.map(row => row.id))).not.toEqual(new Set(played.players.map(row => row.id)));
  expect(await readFranchise(page, 'save_slot_1')).toEqual(restored);
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  expect((await readFranchise(page)).players).toEqual(second.players);
  expect(await readFranchise(page, 'save_slot_1')).toEqual(restored);
  await manageSaves(page);
  await page.getByRole('listitem').filter({ hasText: 'Career Slot 1' }).getByRole('button', { name: 'Enter Franchise', exact: true }).click();
  await page.waitForFunction(() => window.state?.isHydrated && !window.state.busy && window.state.league?.activeLeagueId === 'save_slot_1');
  expect(await readFranchise(page)).toEqual(restored);
  expect((await readFranchise(page, 'save_slot_2')).players).toEqual(second.players);
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(2);
});

test('failed update checkpoint preserves the existing career and permits a saved retry', async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await selectBuffalo(page);
  await finishCreation(page);
  const saved = await readFranchise(page);
  const documentId = await page.evaluate(() => {
    window.__qaFailNextCheckpoint = true;
    return performance.timeOrigin;
  });
  await activateReplacement(page);
  await expect(page.getByText('Could not save the franchise. Retry the update when saving succeeds.')).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  expect((await readFranchise(page)).players).toEqual(saved.players);
  await page.getByRole('button', { name: 'Update & Restart', exact: true }).click();
  await page.waitForFunction(before => performance.timeOrigin !== before && window.state?.isHydrated
    && !window.state.busy && window.state.league?.activeLeagueId === 'save_slot_1', documentId);
  const restored = await readFranchise(page);
  expect(restored.meta.franchiseGenerationId).toBe(saved.meta.franchiseGenerationId);
  expect(restored.players).toEqual(saved.players);
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(1);
});

test('first controller acquisition during requested creation does not lose or duplicate the franchise', async ({ context, page }, info) => {
  const trace = await observeStartup(context, page, info, { holdRegistration: true });
  await page.goto('/');
  await selectBuffalo(page);
  await page.getByTestId('onboarding-continue-button').click();
  await page.getByTestId('start-dynasty-button').click();
  await expect.poll(() => trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE').length).toBe(1);
  await page.evaluate(() => window.__releaseServiceWorkerInstall());
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => trace.events.filter(row => row.event === 'controllerchange').length).toBe(1);
  const saved = await readFranchise(page);
  expect(saved.meta.generationDiagnostics.source).toBe('normal');
  expect(saved.meta.year).toBe(2026);
  expect(saved.meta.franchiseGenerationId).toBeTruthy();
  expect(trace.events.filter(row => row.kind === 'navigation')).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('franchise-hq')).toBeVisible();
  expect((await readFranchise(page)).players).toEqual(saved.players);
  expect(trace.events.filter(row => row.event === 'worker-send' && row.type === 'NEW_LEAGUE')).toHaveLength(1);
});
