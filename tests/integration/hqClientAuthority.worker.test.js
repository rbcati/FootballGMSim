import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cache } from '../../src/db/cache.js';
import { toUI, toWorker } from '../../src/worker/protocol.js';
import { applyLeagueDelta } from '../../src/worker/serialization.js';
import { validateLeagueTeamLegality } from '../../src/core/teamValidation.js';
import { buildHqNextAction } from '../../src/ui/utils/hqCommandCenterV2.js';
import { buildOffseasonActionCenter } from '../../src/ui/utils/offseasonActionCenter.js';
import { INITIAL_WORKER_STATE, workerReducer } from '../../src/ui/hooks/useWorker.js';

const payloadOf = (message) => message.payload?._jsonPayload ? JSON.parse(message.payload._jsonPayload) : message.payload;
const waiters = new Map();
let sequence = 0;
function send(type, payload = {}) {
  const id = `hq-authority-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`Timed out waiting for ${type}`)); }, 120_000);
    waiters.set(id, (message) => { clearTimeout(timer); resolve(message); });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}

beforeAll(async () => {
  globalThis.self = {
    onmessage: null,
    postMessage(message) {
      if (waiters.has(message.id)) {
        const resolve = waiters.get(message.id);
        waiters.delete(message.id);
        resolve(message);
      }
    },
  };
  await import('../../src/worker/worker.js');
  await send(toWorker.INIT);
  expect((await send(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_1', options: { rngSeed: 1798, userTeamId: 0, name: 'HQ authority' } })).type).toBe(toUI.FULL_STATE);
}, 180_000);
afterAll(() => { delete globalThis.self; });

describe.sequential('HQ public worker view and legacy commands', () => {
  it('carries canonical dead money through the normal view and agrees with preseason worker legality', async () => {
    const roster = cache.getPlayersByTeam(0);
    for (const player of roster.slice(53)) cache.updatePlayer(player.id, { teamId: null, status: 'free_agent' });
    for (const player of roster.slice(0, 53)) cache.updatePlayer(player.id, { contract: { baseAnnual: 5, years: 1, yearsTotal: 1, yearsRemaining: 1, signingBonus: 0 } });
    cache.setMeta({ phase: 'preseason', currentWeek: 1, economy: { ...cache.getMeta().economy, currentSalaryCap: 360 } });
    for (const deadCap of [96, 91]) {
      cache.updateTeam(0, { deadCap, capTotal: 360, capRoom: 4 });
      const message = await send(toWorker.REQUEST_FULL_STATE);
      expect(message.type).toBe(toUI.FULL_STATE);
      const state = workerReducer(INITIAL_WORKER_STATE, { type: 'FULL_STATE', payload: payloadOf(message) });
      const league = state.league;
      const team = league.teams.find((row) => row.id === 0);
      expect(team.deadCap).toBe(deadCap);
      expect(team.roster).toHaveLength(53);
      const issues = validateLeagueTeamLegality({ teams: [cache.getTeam(0)], players: cache.getPlayersByTeam(0), phase: 'preseason', hardCap: league.economy.currentSalaryCap }).issues.filter((issue) => issue.code === 'cap_limit');
      expect(issues.length).toBe(deadCap === 96 ? 1 : 0);
      if (deadCap === 96) expect(issues[0].message).toContain('361.0M / 360.0M');
      for (const nextGame of [null, { isHome: true, opp: league.teams[1] }]) {
        const action = buildHqNextAction({ league, nextGame });
        if (deadCap === 96) {
          expect(action).toMatchObject({ title: issues[0].message, cta: 'Review Cap Outlook', destination: 'Financials' });
          expect(action.advance).toBeUndefined();
        } else {
          expect(action).toMatchObject({ advance: true, cta: nextGame ? 'Play Week' : 'Advance Preseason' });
          expect(buildOffseasonActionCenter(league).priorities).toContain('Cap room is below safe operating threshold ($5M).');
        }
      }
      if (deadCap === 96) {
        const reply = await send(toWorker.ADVANCE_WEEK);
        expect(reply.type).toBe(toUI.ERROR);
        expect(payloadOf(reply).message).toBe(issues[0].message);
      }
    }
  }, 180_000);

  it('publishes induction and number retirement through the established state-update path', async () => {
    const player = { ...cache.getPlayersByTeam(0)[0], id: 'hq-legacy-candidate', name: 'HQ Legacy Candidate', teamId: null, status: 'retired', jerseyNumber: 12 };
    cache.setPlayer(player);
    cache.updateTeam(0, { ringOfHonor: [], retiredNumbers: [] });
    cache.setMeta({ pendingRohCandidates: [{ playerId: player.id, teamId: 0, title: 'HQ Legacy Candidate' }] });
    let state = workerReducer(INITIAL_WORKER_STATE, { type: 'FULL_STATE', payload: payloadOf(await send(toWorker.REQUEST_FULL_STATE)) });
    const induction = await send(toWorker.INDUCT_PLAYER_TO_ROH, { playerId: player.id, teamId: 0 });
    expect(induction.type).toBe(toUI.STATE_UPDATE);
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: applyLeagueDelta(state.league, payloadOf(induction)) });
    expect(state.league.pendingRohCandidates).toEqual([]);
    expect(state.league.ringOfHonor.some((member) => member.id === player.id)).toBe(true);
    const retirement = await send(toWorker.RETIRE_JERSEY_NUMBER, { playerId: player.id, teamId: 0 });
    expect(retirement.type).toBe(toUI.STATE_UPDATE);
    state = workerReducer(state, { type: 'STATE_UPDATE', payload: applyLeagueDelta(state.league, payloadOf(retirement)) });
    expect(state.league.retiredNumbers).toContain(12);
    expect(cache.getTeam(0).retiredNumbers).toContain(12);
  }, 180_000);
});
