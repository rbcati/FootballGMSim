import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cache } from '../../src/db/cache.js';
import { aggregateTeamUnitsFromRoster } from '../../src/core/sim/weekSimulationBridge.ts';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const waiters = new Map();
let sequence = 0;
function send(type, payload = {}, timeoutMs = 180_000) {
  const id = `depth-update-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    waiters.set(id, (message) => { clearTimeout(timer); waiters.delete(id); resolve(message); });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}
function payloadOf(message) {
  return typeof message?.payload?._jsonPayload === 'string' ? JSON.parse(message.payload._jsonPayload) : message?.payload;
}

beforeAll(async () => {
  globalThis.self = { onmessage: null, postMessage(message) { waiters.get(message?.id)?.(message); } };
  await import('../../src/worker/worker.js');
  expect((await send(toWorker.INIT)).type).toBe(toUI.READY);
  expect((await send(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_1', options: { rngSeed: 1795, userTeamId: 0, name: 'Depth authority test' } })).type).toBe(toUI.FULL_STATE);
}, 180_000);
afterAll(() => { delete globalThis.self; });

describe('UPDATE_DEPTH_CHART authority', () => {
  it('exposes authoritative active scheme IDs in the RosterHub team view model', async () => {
    const response = await send(toWorker.UPDATE_STRATEGY, { offSchemeId: 'VERTICAL', defSchemeId: 'MAN_COVERAGE' });
    expect(response.type).toBe(toUI.STATE_UPDATE);
    const teamId = cache.getMeta().userTeamId;
    expect(payloadOf(response).teams.find((team) => team.id === teamId).strategies).toEqual({
      offSchemeId: 'VERTICAL',
      defSchemeId: 'MAN_COVERAGE',
    });
  });

  it('updates team and player assignments before repair without reverting the starter', async () => {
    const teamId = cache.getMeta().userTeamId;
    const qbs = cache.getPlayersByTeam(teamId).filter((player) => player.pos === 'QB').slice(0, 2);
    expect(qbs).toHaveLength(2);
    const [one, two] = qbs;
    const team = cache.getTeam(teamId);
    cache.updateTeam(teamId, { depthChart: { ...(team.depthChart ?? {}), QB: [one.id, two.id] } });
    cache.updatePlayer(one.id, { depthOrder: 1, depthChart: { rowKey: 'QB', order: 1 } });
    cache.updatePlayer(two.id, { depthOrder: 2, depthChart: { rowKey: 'QB', order: 2 } });

    const updates = [
      { playerId: two.id, rowKey: 'QB', newOrder: 1 },
      { playerId: one.id, rowKey: 'QB', newOrder: 2 },
    ];
    const response = await send(toWorker.UPDATE_DEPTH_CHART, { updates });
    expect(response.type).toBe(toUI.STATE_UPDATE);
    expect(cache.getTeam(teamId).depthChart.QB.slice(0, 2)).toEqual([two.id, one.id]);
    expect(cache.getPlayer(two.id).depthChart).toMatchObject({ rowKey: 'QB', order: 1 });
    expect(cache.getPlayer(one.id).depthChart).toMatchObject({ rowKey: 'QB', order: 2 });
    expect(aggregateTeamUnitsFromRoster(cache.getPlayersByTeam(teamId), teamId).selectedUnitPlayerIds.offense[0]).toBe(two.id);
    const viewTeam = payloadOf(response).teams.find((candidate) => candidate.id === teamId);
    expect(aggregateTeamUnitsFromRoster(viewTeam.roster, teamId).selectedUnitPlayerIds.offense[0]).toBe(two.id);

    expect((await send(toWorker.UPDATE_DEPTH_CHART, { updates })).type).toBe(toUI.STATE_UPDATE);
    expect(cache.getTeam(teamId).depthChart.QB.slice(0, 2)).toEqual([two.id, one.id]);
  }, 180_000);

  it('persists only the selected unassigned specialist through worker reconciliation', async () => {
    const teamId = cache.getMeta().userTeamId;
    const [starter, selected, untouched] = cache.getPlayersByTeam(teamId).filter((player) => player.pos !== 'QB').slice(0, 3);
    expect([starter, selected, untouched].filter(Boolean)).toHaveLength(3);
    const team = cache.getTeam(teamId);
    const movedIds = new Set([starter.id, selected.id, untouched.id].map(String));
    const depthChart = Object.fromEntries(Object.entries(team.depthChart ?? {}).map(([rowKey, ids]) => [
      rowKey,
      (ids ?? []).filter((playerId) => !movedIds.has(String(playerId))),
    ]));
    depthChart.K = [starter.id];
    cache.updateTeam(teamId, { depthChart });
    cache.updatePlayer(starter.id, { pos: 'K', depthOrder: 1, depthChart: { rowKey: 'K', order: 1 } });
    cache.updatePlayer(selected.id, { pos: 'K', depthOrder: null, depthChart: null });
    cache.updatePlayer(untouched.id, { pos: 'K', depthOrder: null, depthChart: null });

    const response = await send(toWorker.UPDATE_DEPTH_CHART, { updates: [
      { playerId: selected.id, rowKey: 'K', newOrder: 1 },
      { playerId: starter.id, rowKey: 'K', newOrder: 2 },
    ] });
    expect(response.type).toBe(toUI.STATE_UPDATE);
    expect(cache.getTeam(teamId).depthChart.K.slice(0, 2)).toEqual([selected.id, starter.id]);
    expect(cache.getPlayer(selected.id).depthChart).toMatchObject({ rowKey: 'K', order: 1 });
    expect(cache.getPlayer(starter.id).depthChart).toMatchObject({ rowKey: 'K', order: 2 });
    expect(Object.values(cache.getTeam(teamId).depthChart).flat().map(String)).not.toContain(String(untouched.id));
    expect(cache.getPlayer(untouched.id)?.depthChart?.rowKey).not.toBe('K');
  }, 180_000);

  it('rejects presentation-only or ineligible row keys atomically', async () => {
    const teamId = cache.getMeta().userTeamId;
    const qb = cache.getPlayersByTeam(teamId).find((player) => player.pos === 'QB');
    const before = structuredClone(cache.getTeam(teamId).depthChart);
    expect((await send(toWorker.UPDATE_DEPTH_CHART, { updates: [{ playerId: qb.id, rowKey: 'DL', newOrder: 1 }] })).type).toBe(toUI.ERROR);
    expect(cache.getTeam(teamId).depthChart).toEqual(before);
  });
});
