import { test, expect } from '@playwright/test';
import { goToTab } from './helpers/franchise.js';


async function snapshot(page, slot) {
  return page.evaluate(async (n) => {
    const name = `FootballGM_League_save_slot_${n}`;
    const databases = await indexedDB.databases();
    const data = {};
    let leagueMeta = null;
    let userTeam = null;
    if (databases.some(db => db.name === name)) {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      for (const store of [...db.objectStoreNames]) {
        const rows = await new Promise((resolve, reject) => {
          const req = db.transaction(store).objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        if (store === 'meta') {
          const meta = rows.find(row => row.id === 'league');
          if (meta) leagueMeta = { userTeamId: meta.userTeamId, year: meta.year, currentWeek: meta.currentWeek, franchiseGenerationId: meta.franchiseGenerationId, settings: meta.settings };
        }
        if (store === 'teams') userTeam = rows.find(row => row.id === leagueMeta?.userTeamId);
        const bytes = new TextEncoder().encode(JSON.stringify(rows));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        data[store] = { rows: rows.length, bytes: bytes.length, sha256: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') };
      }
      db.close();
    }
    return { data, leagueMeta, userTeam: userTeam ? { id: userTeam.id, wins: userTeam.wins, losses: userTeam.losses } : null, metadata: localStorage.getItem(`footballgm_slot_${n}_meta`), manifest: localStorage.getItem('gmsim_save_manifest') };
  }, slot);
}

async function manage(page) {
  const briefing = page.getByTestId('post-game-summary-close');
  if (await briefing.isVisible()) await briefing.click();
  const close = page.getByLabel('Close changelog');
  if (await close.isVisible()) await close.click();
  // Header actions menu is part of the normal desktop navigation.
  await page.getByLabel('Action menu').evaluate(summary => summary.click());
  // The current desktop HQ stacking context can cover the open menu. Invoke
  // its UI handler directly so this regression stays focused on slot isolation.
  await expect(page.getByText('Manage Saves', { exact: true })).toBeEnabled();
  await page.getByText('Manage Saves', { exact: true }).evaluate(button => button.click());
  await expect(page.getByTestId('app-save-slots')).toBeVisible();
}

const slot = (page, n) => page.getByRole('listitem').filter({ hasText: `Career Slot ${n}` });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gmsim_onboarding_done', '1');
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); window.testSimWorker = this; }
      postMessage(message, ...rest) {
        if (message.type === 'NEW_LEAGUE') {
          window.creationCount = (window.creationCount || 0) + 1;
          message.payload.options.rngSeed = 1383 + window.creationCount;
          if (window.creationFault === 'interrupt') return;
          if (window.creationFault === 'fail') {
            queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: {
              type: 'ERROR', id: message.id, payload: { message: 'Injected creation failure', bootRequestId: message.payload.options.bootRequestId },
            } })));
            return;
          }
        }
        return super.postMessage(message, ...rest);
      }
    };
  });
});

async function startSetup(page, n) {
  await slot(page, n).getByTestId('start-new-franchise-cta').click();
  await expect(page.getByRole('heading', { name: 'Choose Your Franchise' })).toBeVisible();
}
async function createSelected(page, name, year = '2026', repeat = false) {
  await page.locator('.team-card').filter({ hasText: name }).click();
  await page.getByTestId('onboarding-continue-button').click();
  await expect(page.getByRole('heading', { name: 'League Settings' })).toBeVisible();
  await page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input').fill(year);
  if (year === '2031') await page.getByRole('button', { name: /Hard.*Tougher AI/ }).click();
  await page.getByTestId('onboarding-continue-button').click();
  await expect(page.getByText(year, { exact: true })).toBeVisible();
  await page.getByTestId('start-dynasty-button').evaluate((button, twice) => { button.click(); if (twice) button.click(); }, repeat);
}
async function save(page, slotKey, options = {}) {
  return page.evaluate(({ slotKey, options }) => new Promise((resolve, reject) => {
    const id = `isolation_save_${Date.now()}`;
    const worker = window.testSimWorker;
    const listener = ({ data }) => {
      if (data.id !== id || !['SAVED', 'ERROR'].includes(data.type)) return;
      worker.removeEventListener('message', listener);
      if (data.type === 'ERROR') reject(new Error(data.payload.message));
      else resolve();
    };
    worker.addEventListener('message', listener);
    worker.postMessage({ type: 'SAVE_SLOT', payload: { slotKey, ...options }, id });
  }), { slotKey, options });
}

async function firstCareer(page) {
  await page.goto('/');
  await startSetup(page, 1);
  await createSelected(page, 'Detroit');
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  // Establish the normal loaded-save baseline, including existing load-time migrations.
  await page.reload();
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => !window.state.busy && window.state.league.activeLeagueId === 'save_slot_1');
  await save(page, 'save_slot_1');
  await page.evaluate(() => { window.creationCount = 1; });
}

test('new franchise in empty slot cannot copy a loaded Week 6 career', async ({ page }, info) => {
  test.setTimeout(240000);
  page.on('console', msg => { if (msg.type() === 'error') console.log('browser error:', msg.text()); });
  await firstCareer(page);
  await goToTab(page, 'game-plan');
  await page.getByRole('slider').first().focus();
  await page.getByRole('slider').first().press('Home');
  await page.getByRole('button', { name: 'Save Game Plan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('footballgm_gameplan_v1:save_slot_1')).runPassBalance)).toBe(0);
  await goToTab(page, 'hq');
  console.log('franchise launched');
  for (let week = 1; week < 6; week++) {
    console.log('advancing', week);
    await page.evaluate(() => window.testSimWorker.postMessage({ type: 'ADVANCE_WEEK', payload: { skipUserGame: true } }));
    await page.waitForFunction(w => !window.state.busy && !window.state.simulating && window.state.league.week > w, week, { timeout: 30000 });
    await page.evaluate(() => window.gameController.clearUserGame());
  }
  await save(page, 'save_slot_1');
  await expect.poll(async () => (await snapshot(page, 1)).leagueMeta?.currentWeek, { timeout: 15000 }).toBe(6);
  const before = await snapshot(page, 1);
  const user = before.userTeam;
  expect(user.wins + user.losses).toBeGreaterThan(0);
  await info.attach('before-slot-1.json', { body: JSON.stringify(before), contentType: 'application/json' });
  console.log('opening saves');
  await manage(page);
  await slot(page, 2).getByTestId('start-new-franchise-cta').click();
  const after = await snapshot(page, 2);
  await info.attach('after-select-slot-2.json', { body: JSON.stringify(after), contentType: 'application/json' });
  await expect(page.getByRole('heading', { name: 'Choose Your Franchise' })).toBeVisible();
  expect(after.data).toEqual({});
  expect(after.metadata).toBeNull();
  expect((await snapshot(page, 1)).data).toEqual(before.data);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(slot(page, 2)).toContainText('No franchise started yet');
  await slot(page, 1).getByRole('button', { name: 'Enter Franchise' }).click();
  await expect(page.getByTestId('app-shell-ready')).toBeVisible();
  await manage(page);
  await startSetup(page, 2);
  await createSelected(page, 'Miami', '2031', true);
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  await goToTab(page, 'game-plan');
  await expect(page.getByRole('slider').first()).not.toHaveValue('0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('footballgm_gameplan_v1:save_slot_1')).runPassBalance)).toBe(0);
  await goToTab(page, 'hq');
  let second = await snapshot(page, 2);
  await info.attach('completed-slot-2.json', { body: JSON.stringify(second), contentType: 'application/json' });
  expect(second.leagueMeta.franchiseGenerationId).not.toBe(before.leagueMeta.franchiseGenerationId);
  expect(second.leagueMeta.userTeamId).not.toBe(before.leagueMeta.userTeamId);
  expect(second.leagueMeta.year).toBe(2031);
  expect(second.leagueMeta.settings.difficultyPreset).toBe('Hard');
  expect(second.leagueMeta.currentWeek).toBe(1);
  expect((await snapshot(page, 1)).data).toEqual(before.data);
  expect(await page.evaluate(() => window.creationCount)).toBe(2);
  await page.reload();
  await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => !window.state.busy && window.state.league.activeLeagueId === 'save_slot_2');
  await save(page, 'save_slot_2');
  second = await snapshot(page, 2);
  await info.attach('loaded-slot-2.json', { body: JSON.stringify(second), contentType: 'application/json' });
  for (const n of [1, 2]) {
    await page.reload();
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    await manage(page);
    await slot(page, n).getByRole('button', { name: 'Enter Franchise' }).click();
    await expect(page.getByTestId('app-shell-ready')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.state.league.activeLeagueId)).toBe(`save_slot_${n}`);
    // Every persistent store, including roster contracts, transactions and history.
    expect((await snapshot(page, n)).data).toEqual(n === 1 ? before.data : second.data);
  }
});

for (const fault of ['fail', 'interrupt']) {
  test(`${fault} creation leaves target empty and old career recoverable`, async ({ page }) => {
    await firstCareer(page);
    const before = await snapshot(page, 1);
    await manage(page);
    await startSetup(page, 2);
    await page.evaluate(value => { window.creationFault = value; }, fault);
    await createSelected(page, 'Miami');
    if (fault === 'fail') {
      await expect(page.getByRole('alert')).toContainText('Injected creation failure');
      // Back twice to the team picker, then cancel through the normal UI.
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await slot(page, 1).getByRole('button', { name: 'Enter Franchise' }).click();
    } else {
      await page.reload();
      await expect(page.getByTestId('app-save-slots')).toBeVisible();
      await slot(page, 1).getByRole('button', { name: 'Enter Franchise' }).click();
    }
    await expect(page.getByTestId('app-shell-ready')).toBeVisible({ timeout: 60000 });
    expect((await snapshot(page, 2)).data).toEqual({});
    expect((await snapshot(page, 2)).metadata).toBeNull();
    expect((await snapshot(page, 1)).data).toEqual(before.data);
  });
}


test('worker opening-save guard rejects another generation and explicit copy remains available', async ({ page }) => {
  await firstCareer(page);
  const before = await snapshot(page, 1);
  await expect(save(page, 'save_slot_3', { expectedFranchiseGenerationId: 'stale_generation' })).rejects.toThrow('franchise changed');
  expect((await snapshot(page, 3)).data).toEqual({});
  await save(page, 'save_slot_3');
  const copied = await snapshot(page, 3);
  expect(copied.data).toEqual(before.data);
  expect(copied.leagueMeta.franchiseGenerationId).toBe(before.leagueMeta.franchiseGenerationId);
  expect((await snapshot(page, 1)).data).toEqual(before.data);
});
