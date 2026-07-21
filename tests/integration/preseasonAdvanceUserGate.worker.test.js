import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';

const SLOT_KEY = 'save_slot_1';
const USER_TEAM_ID = 0;
const BOOT_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 180_000;

const waiters = new Map();
let msgSeq = 0;
let syntheticSeq = 0;

function installSelfBridge() {
  globalThis.self = {
    onmessage: null,
    postMessage(msg) {
      if (msg?.id != null && waiters.has(msg.id)) {
        const resolve = waiters.get(msg.id);
        waiters.delete(msg.id);
        resolve(msg);
      }
    },
  };
}

function payloadOf(msg) {
  const p = msg?.payload;
  if (p && typeof p._jsonPayload === 'string') return JSON.parse(p._jsonPayload);
  return p;
}

function send(type, payload = {}, { timeoutMs = 60_000 } = {}) {
  const id = `preseason-user-gate-${++msgSeq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for reply to ${type}`));
    }, timeoutMs);
    waiters.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    globalThis.self.onmessage({ data: { type, payload, id } });
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedRoster(teamId) {
  return cache.getPlayersByTeam(teamId).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function rosterIds(teamId) {
  return sortedRoster(teamId).map((p) => String(p.id));
}

function rosterContracts(teamId) {
  return sortedRoster(teamId).map((p) => [String(p.id), cloneJson(p.contract ?? null)]);
}

function allAiRosterContracts() {
  return cache.getAllTeams()
    .filter((team) => Number(team.id) !== USER_TEAM_ID)
    .map((team) => [Number(team.id), rosterContracts(team.id)]);
}

function teamMoney(teamId) {
  const team = cache.getTeam(teamId);
  return {
    deadCap: Number(team?.deadCap ?? 0),
    deadMoneyNextYear: Number(team?.deadMoneyNextYear ?? 0),
  };
}

function userDepthSnapshot() {
  const team = cache.getTeam(USER_TEAM_ID);
  return cloneJson({
    teamDepthChart: team?.depthChart ?? null,
    playerDepth: sortedRoster(USER_TEAM_ID).map((p) => [String(p.id), cloneJson(p.depthChart ?? null)]),
  });
}

async function transactionCountByTypes(types, teamId = null) {
  const txs = await Transactions.loadRecent(4000).catch(() => []);
  return txs.filter((tx) =>
    types.includes(tx?.type) &&
    (teamId == null || Number(tx?.teamId) === Number(teamId))
  ).length;
}

function enterPreseason() {
  const meta = cache.getMeta();
  cache.setMeta({
    ...meta,
    phase: 'preseason',
    currentWeek: 1,
    currentSeasonId: meta?.currentSeasonId ?? `season-${meta?.year ?? 2026}`,
    economy: {
      ...(meta?.economy ?? {}),
      currentSalaryCap: Number(meta?.economy?.currentSalaryCap ?? 300),
    },
  });
}

function normalizeUserRosterTo(count) {
  const roster = sortedRoster(USER_TEAM_ID);
  for (const player of roster.slice(count)) {
    cache.updatePlayer(player.id, { teamId: null, status: 'free_agent' });
  }
  const kept = sortedRoster(USER_TEAM_ID);
  if (kept.length >= count) return;
  const template = kept[0] ?? cache.getAllPlayers()[0];
  for (let i = kept.length; i < count; i += 1) {
    const id = `synthetic-user-${Date.now()}-${++syntheticSeq}`;
    cache.setPlayer({
      ...cloneJson(template),
      id,
      name: `Synthetic User ${syntheticSeq}`,
      teamId: USER_TEAM_ID,
      status: 'active',
      ovr: 35,
      potential: 35,
      contract: {
        years: 1,
        yearsTotal: 1,
        baseAnnual: 1,
        signingBonus: 0,
        guaranteedPct: 0,
      },
      depthChart: null,
    });
  }
}

function makeUserOverCap() {
  const meta = cache.getMeta();
  const hardCap = Number(meta?.settings?.salaryCap ?? 300);
  const [player] = sortedRoster(USER_TEAM_ID);
  cache.updatePlayer(player.id, {
    contract: {
      ...(player.contract ?? {}),
      years: 1,
      yearsTotal: 1,
      baseAnnual: hardCap + 100,
      signingBonus: 0,
      guaranteedPct: 1,
    },
  });
}

async function bootFreshLeague(name) {
  const boot = await send(
    toWorker.USE_SAFE_STARTER_LEAGUE,
    { slotKey: SLOT_KEY, options: { rngSeed: 1684, userTeamId: USER_TEAM_ID, name } },
    { timeoutMs: BOOT_TIMEOUT_MS },
  );
  expect(boot.type, JSON.stringify(payloadOf(boot))).toBe(toUI.FULL_STATE);
  enterPreseason();
  delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
}

beforeAll(async () => {
  installSelfBridge();
  await import('../../src/worker/worker.js');
  const ready = await send(toWorker.INIT, {}, { timeoutMs: BOOT_TIMEOUT_MS });
  expect(ready.type).toBe(toUI.READY);
}, BOOT_TIMEOUT_MS);

beforeEach(async () => {
  await bootFreshLeague(`Preseason User Gate ${Date.now()}`);
}, BOOT_TIMEOUT_MS);

afterAll(() => {
  delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
  delete globalThis.self;
});

describe('ADVANCE_WEEK preseason user gating', () => {
  it('blocks interactive SIM_TO_PHASE skip when the user roster is over 53 without mutating user or AI state', async () => {
    normalizeUserRosterTo(54);
    const userRosterBefore = rosterIds(USER_TEAM_ID);
    const userContractsBefore = rosterContracts(USER_TEAM_ID);
    const userDepthBefore = userDepthSnapshot();
    const userMoneyBefore = teamMoney(USER_TEAM_ID);
    const aiBefore = allAiRosterContracts();
    const userTxBefore = await transactionCountByTypes(['RELEASE', 'RESTRUCTURE'], USER_TEAM_ID);

    const reply = await send(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: TEST_TIMEOUT_MS });

    expect(reply.type).toBe(toUI.ERROR);
    expect(payloadOf(reply)?.message).toMatch(/Roster limit exceeded|Cut down to 53|has 54\/53 players/i);
    expect(rosterIds(USER_TEAM_ID)).toEqual(userRosterBefore);
    expect(rosterContracts(USER_TEAM_ID)).toEqual(userContractsBefore);
    expect(userDepthSnapshot()).toEqual(userDepthBefore);
    expect(teamMoney(USER_TEAM_ID)).toEqual(userMoneyBefore);
    expect(await transactionCountByTypes(['RELEASE', 'RESTRUCTURE'], USER_TEAM_ID)).toBe(userTxBefore);
    expect(allAiRosterContracts()).toEqual(aiBefore);
    expect(cache.getMeta()?.phase).toBe('preseason');
  }, TEST_TIMEOUT_MS);

  it('blocks interactive SIM_TO_PHASE skip when the user is over cap without mutating any team or committing transactions', async () => {
    normalizeUserRosterTo(53);
    makeUserOverCap();
    const userRosterBefore = rosterIds(USER_TEAM_ID);
    const userContractsBefore = rosterContracts(USER_TEAM_ID);
    const userMoneyBefore = teamMoney(USER_TEAM_ID);
    const aiBefore = allAiRosterContracts();
    const txBefore = await transactionCountByTypes(['RELEASE', 'RESTRUCTURE']);

    const reply = await send(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: TEST_TIMEOUT_MS });

    expect(reply.type).toBe(toUI.ERROR);
    expect(payloadOf(reply)?.message).toMatch(/over cap/i);
    expect(rosterIds(USER_TEAM_ID)).toEqual(userRosterBefore);
    expect(rosterContracts(USER_TEAM_ID)).toEqual(userContractsBefore);
    expect(teamMoney(USER_TEAM_ID)).toEqual(userMoneyBefore);
    expect(allAiRosterContracts()).toEqual(aiBefore);
    expect(await transactionCountByTypes(['RELEASE', 'RESTRUCTURE'])).toBe(txBefore);
    expect(cache.getMeta()?.phase).toBe('preseason');
  }, TEST_TIMEOUT_MS);

  it('allows explicit headless batch mode to cut down the user team and complete preseason transition', async () => {
    normalizeUserRosterTo(54);
    const userRosterBefore = rosterIds(USER_TEAM_ID);
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;

    const reply = await send(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: TEST_TIMEOUT_MS });

    expect(reply.type).not.toBe(toUI.ERROR);
    expect(cache.getMeta()?.phase).toBe('regular');
    expect(rosterIds(USER_TEAM_ID).length).toBeLessThanOrEqual(53);
    expect(rosterIds(USER_TEAM_ID)).not.toEqual(userRosterBefore);
    expect(cache.getAllTeams().every((team) => cache.getPlayersByTeam(team.id).length <= 53)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('blocks normal interactive Start Season before AI mutations when the user roster is over 53', async () => {
    normalizeUserRosterTo(54);
    const userRosterBefore = rosterIds(USER_TEAM_ID);
    const userContractsBefore = rosterContracts(USER_TEAM_ID);
    const aiBefore = allAiRosterContracts();

    const reply = await send(toWorker.ADVANCE_WEEK, {}, { timeoutMs: TEST_TIMEOUT_MS });

    expect(reply.type).toBe(toUI.ERROR);
    expect(payloadOf(reply)?.message).toMatch(/Roster limit exceeded|Cut down to 53|has 54\/53 players/i);
    expect(rosterIds(USER_TEAM_ID)).toEqual(userRosterBefore);
    expect(rosterContracts(USER_TEAM_ID)).toEqual(userContractsBefore);
    expect(allAiRosterContracts()).toEqual(aiBefore);
    expect(cache.getMeta()?.phase).toBe('preseason');
  }, TEST_TIMEOUT_MS);
});
