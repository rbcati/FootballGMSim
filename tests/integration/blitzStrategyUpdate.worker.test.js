import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cache } from '../../src/db/cache.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const waiters = new Map();
let messageSequence = 0;

function send(type, payload = {}, timeoutMs = 180_000) {
  const id = `blitz-strategy-update-${++messageSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeoutMs);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}

beforeAll(async () => {
  globalThis.self = {
    onmessage: null,
    postMessage(message) {
      if (message?.id != null && waiters.has(message.id)) {
        const resolve = waiters.get(message.id);
        waiters.delete(message.id);
        resolve(message);
      }
    },
  };
  await import('../../src/worker/worker.js');
  expect((await send(toWorker.INIT)).type).toBe(toUI.READY);
  expect((await send(toWorker.USE_SAFE_STARTER_LEAGUE, {
    slotKey: 'save_slot_1',
    options: { rngSeed: 1794, userTeamId: 0, name: 'Blitz normalization test' },
  })).type).toBe(toUI.FULL_STATE);
}, 180_000);

afterAll(() => {
  delete globalThis.self;
});

describe('UPDATE_STRATEGY blitzFrequency normalization', () => {
  it.each([
    ['', 30],
    [null, 30],
    [0, 0],
    [100, 100],
    ['invalid', 30],
  ])('persists %j as %i', async (input, expected) => {
    const response = await send(toWorker.UPDATE_STRATEGY, {
      gamePlan: { blitzFrequency: input },
    });
    expect(response.type).toBe(toUI.STATE_UPDATE);
    const userTeam = cache.getTeam(cache.getMeta().userTeamId);
    expect(userTeam.strategies.gamePlan).toHaveProperty('blitzFrequency', expected);
  });
});

it('refreshes readout fits after strategy/roster changes without changing stored player fit', async () => {
  const teamId = cache.getMeta().userTeamId;
  const qb = cache.getPlayersByTeam(teamId).find((p) => p.pos === 'QB');
  cache.updatePlayer(qb.id, { ratings: {}, attributesV2: { throwPower: 93 }, schemeFit: 17 });
  const first = await send(toWorker.UPDATE_STRATEGY, { offSchemeId: 'VERTICAL', defSchemeId: 'BLITZ_34' });
  const displayed = (response) => response.payload.teams.find((t) => t.id === teamId).roster.find((p) => p.id === qb.id);
  expect(displayed(first).schemeFit).toBe(93);
  expect(cache.getPlayer(qb.id).schemeFit).toBe(17);
  cache.updatePlayer(qb.id, { attributesV2: { throwPower: 34 } });
  const second = await send(toWorker.UPDATE_STRATEGY, { offSchemeId: 'Vertical', defSchemeId: '3-4 Blitz' });
  expect(displayed(second).schemeFit).toBe(34);
  expect(cache.getPlayer(qb.id).schemeFit).toBe(17);
  expect(cache.getTeam(teamId).strategies.offSchemeId).toBe('Vertical');
});
