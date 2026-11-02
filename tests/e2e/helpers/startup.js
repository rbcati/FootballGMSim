import { expect } from '@playwright/test';

export async function observeStartup(context, page, testInfo, { holdRegistration = false } = {}) {
  // Netlify's injected collaboration drawer is hosting UI, not game UI. Close
  // it through its real Dismiss control whenever it would intercept a click.
  if (new URL(testInfo.project.use.baseURL).hostname.endsWith('netlify.app')) {
    const frame = page.locator('iframe[title="Netlify Drawer"]');
    await page.addLocatorHandler(frame, async () => {
      const drawer = page.frameLocator('iframe[title="Netlify Drawer"]');
      await drawer.getByRole('button', { name: 'Minimize', exact: true }).click();
      await drawer.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await expect(frame).toBeHidden();
    });
  }
  const events = [];
  const record = (kind, data = {}) => events.push({ at: Date.now(), kind, ...data });
  const initial = { storage: await context.storageState(), workers: context.serviceWorkers().length };
  const cdp = await context.newCDPSession(page);
  initial.quota = await cdp.send('Storage.getUsageAndQuota', { origin: new URL(testInfo.project.use.baseURL).origin });
  expect(initial.storage).toEqual({ cookies: [], origins: [] });
  expect(initial.workers).toBe(0);
  expect(initial.quota.usage).toBe(0);
  await context.exposeBinding('__startupEvent', (_, data) => record('browser', data));
  await context.addInitScript(({ holdRegistration }) => {
    if (window !== window.top) return;
    const emit = (event, data = {}) => window.__startupEvent({ event, doc: performance.timeOrigin, ...data }).catch(() => {});
    const state = window.__qaStartup = { controllerChanges: 0, sent: [], received: [] };
    emit('document', { controller: navigator.serviceWorker.controller?.scriptURL ?? null, localStorageKeys: Object.keys(localStorage) });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      state.controllerChanges++;
      emit('controllerchange', { controller: navigator.serviceWorker.controller?.scriptURL });
    });
    let allow;
    const gate = new Promise(resolve => { allow = resolve; });
    window.__releaseServiceWorkerInstall = allow;
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = async (...args) => {
      emit('register-requested');
      if (holdRegistration) await gate;
      const registration = await register(...args);
      const watch = worker => {
        if (!worker) return;
        emit('sw-state', { state: worker.state, script: worker.scriptURL });
        worker.addEventListener('statechange', () => emit('sw-state', { state: worker.state, script: worker.scriptURL }));
      };
      watch(registration.installing); watch(registration.waiting); watch(registration.active);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      return registration;
    };
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
      const worker = new Target(...args);
      const send = worker.postMessage.bind(worker);
      worker.postMessage = (message, ...rest) => {
        state.sent.push({ type: message?.type, id: message?.id });
        if (['NEW_LEAGUE', 'LOAD_SLOT', 'SAVE_SLOT', 'SAVE_NOW'].includes(message?.type)) emit('worker-send', {
          type: message.type, id: message.id, slotKey: message.payload?.slotKey,
          generation: message.payload?.expectedFranchiseGenerationId,
        });
        if (message?.type === 'SAVE_SLOT' && message.payload?.expectedFranchiseGenerationId && window.__qaFailNextCheckpoint) {
          window.__qaFailNextCheckpoint = false;
          queueMicrotask(() => worker.dispatchEvent(new MessageEvent('message', { data: {
            type: 'ERROR', id: message.id, payload: { message: 'Injected checkpoint failure' },
          } })));
          return;
        }
        return send(message, ...rest);
      };
      worker.addEventListener('message', ({ data }) => {
        state.received.push({ type: data?.type, id: data?.id });
        if (['FULL_STATE', 'SUCCESS', 'ERROR', 'SAVED'].includes(data?.type)) emit('worker-response', {
          type: data.type, id: data.id, leagueId: data.payload?.activeLeagueId, message: data.payload?.message,
        });
      });
      return worker;
    } });
    addEventListener('beforeunload', () => emit('beforeunload'));
  }, { holdRegistration });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) record('navigation', { url: frame.url() }); });
  page.on('console', message => {
    if (message.type() === 'error' || message.text().includes('[SW]')) record('console', { level: message.type(), text: message.text() });
  });
  page.on('pageerror', error => record('pageerror', { text: String(error) }));
  page.on('requestfailed', request => record('requestfailed', { url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) record('http-error', { url: response.url(), status: response.status() }); });
  testInfo.onStartupEvidence = () => testInfo.attach('startup-evidence', {
    body: Buffer.from(JSON.stringify({ initial, events }, null, 2)), contentType: 'application/json',
  });
  return { initial, events };
}

export async function selectBuffalo(page, slot = 1) {
  await page.getByRole('listitem').filter({ hasText: `Career Slot ${slot}` }).getByTestId('start-new-franchise-cta').click();
  await page.locator('.team-card').filter({ hasText: 'Buffalo' }).click();
  await page.getByTestId('onboarding-continue-button').click();
  await page.locator('.settings-group').filter({ has: page.locator('label', { hasText: 'Starting Year' }) }).locator('input').fill('2026');
}

export async function finishCreation(page) {
  await page.getByTestId('onboarding-continue-button').click();
  await page.getByTestId('start-dynasty-button').click();
  await expect(page.getByTestId('franchise-hq')).toBeVisible({ timeout: 60000 });
  const close = page.getByLabel('Close changelog');
  if (await close.isVisible()) await close.click();
}

export async function readFranchise(page, slot) {
  return page.evaluate(async requested => {
    const id = requested ?? window.state.league.activeLeagueId;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`FootballGM_League_${id}`);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const all = store => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const result = { meta: (await all('meta')).find(row => row.id === 'league'), players: await all('players'), teams: await all('teams'), games: await all('games') };
    db.close(); return result;
  }, slot);
}

export async function activateReplacement(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register(`/sw.js?startup-update=${Date.now()}`, { scope: '/' });
    const worker = registration.installing ?? registration.waiting;
    if (!worker) throw new Error('Expected a real replacement service worker');
    if (worker.state !== 'installed') await new Promise((resolve, reject) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') resolve();
        if (worker.state === 'redundant') reject(new Error('Replacement installation failed'));
      });
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

export async function manageSaves(page) {
  const close = page.getByLabel('Close changelog');
  if (await close.isVisible()) await close.click();
  await page.getByLabel('Action menu').evaluate(element => element.click());
  // Reuse the #1806 helper's native menu activation: HQ's stacking context can
  // cover this existing menu. The production click handler and worker run intact.
  await page.getByText('Manage Saves', { exact: true }).evaluate(element => element.click());
  await expect(page.getByTestId('app-save-slots')).toBeVisible();
}

export async function quickSave(page, trace) {
  const previous = trace.events.filter(row => row.event === 'worker-response' && row.type === 'SAVED').length;
  await page.getByLabel('Action menu').evaluate(element => element.click());
  await page.getByText('Quick Save', { exact: true }).evaluate(element => element.click());
  await expect.poll(() => trace.events.filter(row => row.event === 'worker-response' && row.type === 'SAVED').length).toBeGreaterThan(previous);
}
