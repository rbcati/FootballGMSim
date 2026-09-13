import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '../../src/db/cache.js';
import { DraftPicks, Meta, Players, Seasons, Teams, Transactions } from '../../src/db/index.js';
import { toUI, toWorker } from '../../src/worker/protocol.js';
import AiLogic from '../../src/core/ai-logic.js';

const USER_TEAM_ID = 0;
const SLOT_KEY = 'save_slot_1';
const TIMEOUT_MS = 180_000;

const waiters = new Map();
let messageSequence = 0;

function installSelfBridge() {
  globalThis.self = {
    onmessage: null,
    postMessage(message) {
      if (message?.id == null || !waiters.has(message.id)) return;
      const resolve = waiters.get(message.id);
      waiters.delete(message.id);
      resolve(message);
    },
  };
}

function send(type, payload = {}) {
  const id = `start-season-roster-authority-${++messageSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout waiting for ${type}`));
    }, TIMEOUT_MS);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}

function payloadOf(message) {
  const payload = message?.payload;
  return payload && typeof payload._jsonPayload === 'string' ? JSON.parse(payload._jsonPayload) : payload;
}

function roster(teamId) {
  return cache.getPlayersByTeam(teamId).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function rosterIds(teamId) {
  return roster(teamId).map((player) => String(player.id));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function authoritativeSnapshot() {
  return clone({
    meta: cache.getMeta(),
    teams: cache.getAllTeams().slice().sort((a, b) => Number(a.id) - Number(b.id)),
    players: cache.getAllPlayers().slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    draftPicks: cache.getAllDraftPicks().slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    seasonStats: cache.getAllSeasonStats().slice().sort((a, b) => String(a.playerId).localeCompare(String(b.playerId))),
    weekGames: cache.getWeekGames(),
    transactions: await Transactions.loadRecent(4000),
    seasons: await Seasons.loadAll(),
  });
}

async function persistedSnapshot() {
  return clone({
    meta: await Meta.load(),
    teams: (await Teams.loadAll()).sort((a, b) => Number(a.id) - Number(b.id)),
    players: (await Players.loadAll()).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    draftPicks: (await DraftPicks.loadAll()).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    transactions: await Transactions.loadRecent(4000),
    seasons: await Seasons.loadAll(),
  });
}

function trimRoster(teamId, count) {
  for (const player of roster(teamId).slice(count)) {
    cache.updatePlayer(player.id, { teamId: null, status: 'free_agent', ovr: 59, potential: 59, age: 27 });
  }
  expect(roster(teamId)).toHaveLength(count);
}

async function bootDraftLeague() {
  const boot = await send(toWorker.USE_SAFE_STARTER_LEAGUE, {
    slotKey: SLOT_KEY,
    options: { rngSeed: 1684, userTeamId: USER_TEAM_ID, name: `Start Season Authority ${Date.now()}` },
  });
  expect(boot.type, JSON.stringify(payloadOf(boot))).toBe(toUI.FULL_STATE);
  cache.setMeta({ phase: 'draft', currentWeek: 1 });
  delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
}

beforeAll(async () => {
  installSelfBridge();
  await import('../../src/worker/worker.js');
  const ready = await send(toWorker.INIT);
  expect(ready.type).toBe(toUI.READY);
}, TIMEOUT_MS);

beforeEach(async () => {
  await bootDraftLeague();
}, TIMEOUT_MS);

afterAll(() => {
  delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
  delete globalThis.self;
});

describe('START_NEW_SEASON roster-management authority', () => {
  it('allows an underfilled interactive user into preseason without auto-managing that roster', async () => {
    trimRoster(USER_TEAM_ID, 52);
    const idsBefore = rosterIds(USER_TEAM_ID);
    const contractsBefore = roster(USER_TEAM_ID).map((player) => [String(player.id), clone(player.contract)]);
    const userMoneyBefore = clone({ deadCap: cache.getTeam(USER_TEAM_ID)?.deadCap, deadMoneyNextYear: cache.getTeam(USER_TEAM_ID)?.deadMoneyNextYear });

    const reply = await send(toWorker.START_NEW_SEASON);

    expect(reply.type, JSON.stringify(payloadOf(reply))).toBe(toUI.FULL_STATE);
    expect(cache.getMeta()?.phase).toBe('preseason');
    expect(rosterIds(USER_TEAM_ID)).toEqual(idsBefore);
    expect(roster(USER_TEAM_ID).map((player) => [String(player.id), clone(player.contract)])).toEqual(contractsBefore);
    expect({ deadCap: cache.getTeam(USER_TEAM_ID)?.deadCap, deadMoneyNextYear: cache.getTeam(USER_TEAM_ID)?.deadMoneyNextYear }).toEqual(userMoneyBefore);
  }, TIMEOUT_MS);

  it('includes an underfilled user in explicit headless reconciliation', async () => {
    trimRoster(USER_TEAM_ID, 52);
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;

    const reply = await send(toWorker.START_NEW_SEASON);

    expect(reply.type, JSON.stringify(payloadOf(reply))).toBe(toUI.FULL_STATE);
    expect(cache.getMeta()?.phase).toBe('preseason');
    expect(roster(USER_TEAM_ID).length).toBeGreaterThanOrEqual(53);
  }, TIMEOUT_MS);

  it('still reconciles an underfilled AI team during interactive rollover', async () => {
    const aiTeamId = Number(cache.getAllTeams().find((team) => Number(team.id) !== USER_TEAM_ID).id);
    trimRoster(aiTeamId, 52);

    const reply = await send(toWorker.START_NEW_SEASON);

    expect(reply.type, JSON.stringify(payloadOf(reply))).toBe(toUI.FULL_STATE);
    expect(cache.getMeta()?.phase).toBe('preseason');
    expect(roster(aiTeamId).length).toBeGreaterThanOrEqual(53);
  }, TIMEOUT_MS);

  it('passes reconciliation actual completion cost into the targeted rollover cap retry', async () => {
    const aiTeamId = Number(cache.getAllTeams().find((team) => Number(team.id) !== USER_TEAM_ID).id);
    const completionCost = 1.2;
    const ensureSpy = vi.spyOn(AiLogic, 'ensureMinimumRosters')
      .mockResolvedValueOnce({
        failures: [{
          teamId: aiTeamId,
          rosterCount: 52,
          remainingSlots: 1,
          cheapestActualCompletionCost: completionCost,
          reason: 'no_feasible_completion',
        }],
        signedByTeam: [],
      })
      .mockResolvedValueOnce({ failures: [], signedByTeam: [{ teamId: aiTeamId, signed: 1, rosterCount: 53 }] });
    const capSpy = vi.spyOn(AiLogic, 'executeAICapManagement').mockResolvedValue({ failures: [], teamsManaged: 1 });

    const reply = await send(toWorker.START_NEW_SEASON);

    expect(reply.type, JSON.stringify(payloadOf(reply))).toBe(toUI.FULL_STATE);
    expect(capSpy).toHaveBeenCalledTimes(1);
    const options = capSpy.mock.calls[0][0];
    expect(options.teamIds).toEqual([aiTeamId]);
    expect(options.rosterCompletionReserveByTeam).toBeInstanceOf(Map);
    expect(options.rosterCompletionReserveByTeam.get(aiTeamId)).toBe(completionCost);
    ensureSpy.mockRestore();
    capSpy.mockRestore();
  }, TIMEOUT_MS);

  it('reports a genuine AI failure without stranding START_NEW_SEASON in preseason', async () => {
    const aiTeamId = Number(cache.getAllTeams().find((team) => Number(team.id) !== USER_TEAM_ID).id);
    trimRoster(aiTeamId, 52);
    for (const player of cache.getAllPlayers()) {
      if (player.teamId == null) cache.updatePlayer(player.id, { status: 'retired', retired: true });
    }
    const before = clone({
      phase: cache.getMeta()?.phase,
      year: cache.getMeta()?.year,
      season: cache.getMeta()?.season,
      currentSeasonId: cache.getMeta()?.currentSeasonId,
    });

    const reply = await send(toWorker.START_NEW_SEASON);
    const failure = payloadOf(reply)?.rosterLegalityFailure;

    expect(reply.type).toBe(toUI.ERROR);
    expect(failure?.teamId).toBe(aiTeamId);
    expect(Number(failure?.teamId)).not.toBe(USER_TEAM_ID);
    expect({
      phase: cache.getMeta()?.phase,
      year: cache.getMeta()?.year,
      season: cache.getMeta()?.season,
      currentSeasonId: cache.getMeta()?.currentSeasonId,
    }).toEqual(before);
  }, TIMEOUT_MS);

  it('makes a failed multi-team rollover fully atomic and allows one clean retry', async () => {
    const aiTeamIds = cache.getAllTeams()
      .map((team) => Number(team.id))
      .filter((teamId) => teamId !== USER_TEAM_ID)
      .sort((a, b) => a - b);
    const repairableTeamId = aiTeamIds[0];
    const legalTeamId = aiTeamIds[1];
    const impossibleTeamId = aiTeamIds[2];
    trimRoster(repairableTeamId, 52);
    trimRoster(impossibleTeamId, 52);
    const released = cache.getAllPlayers()
      .filter((player) => player.teamId == null && player.status === 'free_agent')
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const firstCandidate = released[0];
    cache.updatePlayer(firstCandidate.id, { status: 'free_agent', retired: false, ovr: 59, potential: 59, age: 27 });
    for (const player of released.slice(1)) cache.updatePlayer(player.id, { status: 'retired', retired: true });
    const initialSave = await send(toWorker.SAVE_NOW);
    expect(initialSave.type).not.toBe(toUI.ERROR);
    const before = await authoritativeSnapshot();
    const persistedBefore = await persistedSnapshot();
    const beforeYear = Number(before.meta.year);
    const legalRosterBefore = rosterIds(legalTeamId);

    const failed = await send(toWorker.START_NEW_SEASON);

    expect(failed.type).toBe(toUI.ERROR);
    expect(payloadOf(failed)?.rosterLegalityFailure?.teamId).toBe(impossibleTeamId);
    expect(await authoritativeSnapshot()).toEqual(before);
    expect(rosterIds(repairableTeamId)).toHaveLength(52);
    expect(rosterIds(legalTeamId)).toEqual(legalRosterBefore);
    expect(rosterIds(impossibleTeamId)).toHaveLength(52);

    const saved = await send(toWorker.SAVE_NOW);
    expect(saved.type).not.toBe(toUI.ERROR);
    expect(await authoritativeSnapshot()).toEqual(before);
    expect(await persistedSnapshot()).toEqual(persistedBefore);

    const secondCandidate = cache.getAllPlayers()
      .filter((player) => player.teamId == null && player.status === 'retired' && player.id !== firstCandidate.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    cache.updatePlayer(secondCandidate.id, { status: 'free_agent', retired: false, ovr: 59, potential: 59, age: 27 });
    const transactionsBeforeRetry = await Transactions.loadRecent(4000);

    const retried = await send(toWorker.START_NEW_SEASON);

    expect(retried.type, JSON.stringify(payloadOf(retried))).toBe(toUI.FULL_STATE);
    expect(cache.getMeta()?.phase).toBe('preseason');
    expect(Number(cache.getMeta()?.year)).toBe(beforeYear + 1);
    expect(roster(repairableTeamId).length).toBeGreaterThanOrEqual(53);
    expect(roster(impossibleTeamId).length).toBeGreaterThanOrEqual(53);
    const transactionsAfterRetry = await Transactions.loadRecent(4000);
    const newTransactions = transactionsAfterRetry.filter((tx) =>
      !transactionsBeforeRetry.some((beforeTx) => String(beforeTx.id) === String(tx.id)),
    );
    const rolloverSigns = newTransactions.filter((tx) => tx.type === 'SIGN'
      && [repairableTeamId, impossibleTeamId].includes(Number(tx.teamId)));
    expect(rolloverSigns).toHaveLength(2);
    expect(new Set(rolloverSigns.map((tx) => String(tx.playerId ?? tx.details?.playerId))).size).toBe(2);
  }, TIMEOUT_MS);

  it('retains the interactive 53-player gate before regular-season entry', async () => {
    trimRoster(USER_TEAM_ID, 52);
    cache.setMeta({ phase: 'preseason', currentWeek: 1 });

    const reply = await send(toWorker.ADVANCE_WEEK, { skipUserGame: true });

    expect(reply.type).toBe(toUI.ERROR);
    expect(payloadOf(reply)?.message).toContain('Roster minimum not met');
    expect(cache.getMeta()?.phase).toBe('preseason');
    expect(roster(USER_TEAM_ID)).toHaveLength(52);
  }, TIMEOUT_MS);
});
