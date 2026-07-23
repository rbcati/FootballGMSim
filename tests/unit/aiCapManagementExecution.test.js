/**
 * aiCapManagementExecution.test.js
 *
 * Integration coverage for AiLogic.executeAICapManagement against an in-memory
 * cache. Verifies the live commit path: user-team isolation (interactive vs
 * explicit headless), team-id-0 validity, live-cap legality, and determinism.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = { store: null, txLog: [] };
  const mockCache = {
    getMeta: () => state.store.meta,
    setMeta: (p) => Object.assign(state.store.meta, p),
    getAllTeams: () => [...state.store.teams.values()],
    getTeam: (id) => state.store.teams.get(id),
    getPlayer: (id) => state.store.players.get(id),
    getPlayersByTeam: (id) => [...state.store.players.values()].filter((p) => p.teamId === id && p.status !== 'free_agent'),
    getAllPlayers: () => [...state.store.players.values()],
    updatePlayer: (id, patch) => { const p = state.store.players.get(id); if (p) Object.assign(p, patch); },
    updateTeam: (id, patch) => { const t = state.store.teams.get(id); if (t) Object.assign(t, patch); },
  };
  return { state, mockCache };
});

vi.mock('../../src/db/cache.js', () => ({ cache: h.mockCache }));
vi.mock('../../src/db/index.js', () => ({ Transactions: { add: (tx) => { h.state.txLog.push(tx); return Promise.resolve(); } } }));
vi.mock('../../src/core/news-engine.js', () => ({ default: { logTransaction: () => {}, logNews: () => {} } }));

import AiLogic from '../../src/core/ai-logic.js';
import { buildTeamCapSnapshot } from '../../src/core/contracts/contractObligations.js';

const LIVE_CAP = 100;

function contract(base, sb = 0, yearsTotal = 1, years = yearsTotal) {
  return { baseAnnual: base, signingBonus: sb, yearsTotal, years, yearsRemaining: years, restructureCount: 0 };
}

function makeRoster(teamId, { starBase = 40 } = {}) {
  const players = [];
  // Restructurable star (4 yrs) — one restructure should restore legality.
  players.push({ id: `${teamId}-STAR`, teamId, pos: 'QB', ovr: 92, age: 28, status: 'active', contract: contract(starBase, 0, 4, 4) });
  // 52 cheap depth players across positions so floors are satisfied.
  const positions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
  for (let i = 0; i < 52; i++) {
    players.push({ id: `${teamId}-d${i}`, teamId, pos: positions[i % positions.length], ovr: 62, age: 25, status: 'active', contract: contract(1.3, 0, 1, 1) });
  }
  return players;
}

function buildStore({ difficulty = 'Normal' } = {}) {
  const teams = new Map([
    [0, { id: 0, abbr: 'USR', capTotal: LIVE_CAP, deadCap: 0 }],
    [1, { id: 1, abbr: 'AI1', capTotal: LIVE_CAP, deadCap: 0 }],
    [2, { id: 2, abbr: 'AI2', capTotal: LIVE_CAP, deadCap: 0 }],
  ]);
  const players = new Map();
  // Team 0 (user) and Team 1 (AI) both over cap; Team 2 under cap.
  for (const p of makeRoster(0)) players.set(p.id, p);
  for (const p of makeRoster(1)) players.set(p.id, p);
  for (const p of [...makeRoster(2, { starBase: 5 })]) players.set(p.id, p); // cheap → legal
  return {
    meta: { userTeamId: 0, difficulty, economy: { currentSalaryCap: LIVE_CAP }, currentSeasonId: 's4', currentWeek: 1, year: 2029 },
    teams, players,
  };
}

function committed(teamId) {
  const team = h.state.store.teams.get(teamId);
  const roster = [...h.state.store.players.values()].filter((p) => p.teamId === teamId && p.status !== 'free_agent');
  return buildTeamCapSnapshot({ team, roster, salaryCap: LIVE_CAP });
}

beforeEach(() => {
  h.state.txLog.length = 0;
  h.state.store = buildStore();
});

describe('executeAICapManagement — user-team isolation', () => {
  it('does NOT auto-manage the interactive user team but DOES make AI teams legal', async () => {
    const userBefore = JSON.stringify([...h.state.store.players.values()].filter((p) => p.teamId === 0).map((p) => [p.id, p.contract, p.status]));
    expect(committed(0).isLegallyCompliant).toBe(false); // user starts over cap

    await AiLogic.executeAICapManagement({ autoManageUserCap: false });

    // User roster + contracts are untouched.
    const userAfter = JSON.stringify([...h.state.store.players.values()].filter((p) => p.teamId === 0).map((p) => [p.id, p.contract, p.status]));
    expect(userAfter).toBe(userBefore);
    expect(committed(0).isLegallyCompliant).toBe(false);

    // AI team is legal.
    expect(committed(1).isLegallyCompliant).toBe(true);
  });

  it('auto-manages the user team ONLY under the explicit headless capability', async () => {
    expect(committed(0).isLegallyCompliant).toBe(false);
    const res = await AiLogic.executeAICapManagement({ autoManageUserCap: true });
    expect(committed(0).isLegallyCompliant).toBe(true);
    expect(res.failures.length).toBe(0);
  });
});

describe('executeAICapManagement — legality & structure', () => {
  it('brings every AI team legally under the LIVE cap', async () => {
    await AiLogic.executeAICapManagement({ autoManageUserCap: false });
    expect(committed(1).isLegallyCompliant).toBe(true);
    expect(committed(2).isLegallyCompliant).toBe(true); // already legal, untouched
  });

  it('treats team id 0 as a valid team (not absent) when headless', async () => {
    // team 0 must be found and managed — not skipped as a falsy id.
    await AiLogic.executeAICapManagement({ autoManageUserCap: true });
    expect(h.state.store.teams.get(0)).toBeDefined();
    expect(committed(0).isLegallyCompliant).toBe(true);
  });

  it('commits NOTHING and reports a structured failure when no legal plan exists', async () => {
    // Team at exact position floors, expensive, un-restructurable (1 yr left),
    // and massively over a tiny live cap — no legal plan is possible.
    const floors = { QB: 2, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
    const players = new Map();
    for (const [pos, count] of Object.entries(floors)) {
      for (let k = 0; k < count; k++) {
        const id = `imp-${pos}-${k}`;
        players.set(id, { id, teamId: 7, pos, ovr: 80, age: 30, status: 'active', contract: contract(20, 0, 1, 1) });
      }
    }
    h.state.store = {
      meta: { userTeamId: 0, difficulty: 'Normal', economy: { currentSalaryCap: 50 }, currentSeasonId: 's4', currentWeek: 1, year: 2029 },
      teams: new Map([[7, { id: 7, abbr: 'IMP', capTotal: 50, deadCap: 0 }]]),
      players,
    };
    const before = JSON.stringify([...h.state.store.players.values()].map((p) => [p.id, p.teamId, p.contract]));

    const res = await AiLogic.executeAICapManagement({ autoManageUserCap: false });

    const after = JSON.stringify([...h.state.store.players.values()].map((p) => [p.id, p.teamId, p.contract]));
    expect(h.state.txLog.length).toBe(0);       // no destructive actions committed
    expect(after).toBe(before);                 // roster + contracts intact
    expect(res.failures.length).toBe(1);
    expect(res.failures[0].teamId).toBe(7);
    expect(res.failures[0].remainingOverage).toBeGreaterThan(0);
  });

  it('emits one transaction per committed action', async () => {
    await AiLogic.executeAICapManagement({ autoManageUserCap: false });
    // Only AI teams (1) acted; team 2 legal. Every tx is RESTRUCTURE or RELEASE.
    expect(h.state.txLog.length).toBeGreaterThan(0);
    for (const tx of h.state.txLog) expect(['RESTRUCTURE', 'RELEASE']).toContain(tx.type);
    const playerIds = h.state.txLog.map((t) => t.details.playerId);
    expect(new Set(playerIds).size).toBe(playerIds.length); // no duplicate action on one player
  });
});

describe('ensureMinimumRosters — stable rollover legality', () => {
  function buildUnderMinimumStore({ liveCap = LIVE_CAP, staleTeamCap = LIVE_CAP, userRoster = 52, aiRoster = 52, freeAgents = [] } = {}) {
    h.state.store = {
      meta: { userTeamId: 0, difficulty: 'Normal', economy: { currentSalaryCap: liveCap }, currentSeasonId: 's5', currentWeek: 1, year: 2030 },
      teams: new Map([
        [0, { id: 0, abbr: 'USR', capTotal: staleTeamCap, deadCap: 0, capRoom: liveCap }],
        [31, { id: 31, abbr: 'AI31', capTotal: staleTeamCap, deadCap: 0, capRoom: liveCap }],
      ]),
      players: new Map(),
    };
    for (let i = 0; i < aiRoster; i++) h.state.store.players.set(`ai-${i}`, { id: `ai-${i}`, teamId: 31, pos: 'WR', ovr: 60, age: 24, status: 'active', contract: contract(1, 0, 1, 1) });
    for (let i = 0; i < userRoster; i++) h.state.store.players.set(`usr-${i}`, { id: `usr-${i}`, teamId: 0, pos: 'WR', ovr: 60, age: 24, status: 'active', contract: contract(1, 0, 1, 1) });
    for (const fa of freeAgents) h.state.store.players.set(fa.id, fa);
  }

  it('fills under-minimum AI rosters from signable free agents without touching interactive user teams', async () => {
    buildUnderMinimumStore({ freeAgents: [
      { id: 'fa-b', teamId: null, pos: 'CB', ovr: 65, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) },
      { id: 'fa-a', teamId: null, pos: 'CB', ovr: 66, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) },
    ] });

    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });

    expect(h.mockCache.getPlayersByTeam(31)).toHaveLength(53);
    expect(h.mockCache.getPlayersByTeam(0)).toHaveLength(52);
    expect(h.state.store.players.get('fa-a').teamId).toBe(31);
    expect(h.state.txLog.some((tx) => tx.details?.source === 'minimum_roster_reconciliation')).toBe(true);
  });

  it('never selects retired, draft-eligible, deleted, or non-signable null-team players', async () => {
    buildUnderMinimumStore({ freeAgents: [
      { id: 'retired-fa', teamId: null, pos: 'CB', ovr: 99, age: 35, status: 'retired', contract: contract(1, 0, 1, 1) },
      { id: 'draft-fa', teamId: null, pos: 'CB', ovr: 98, age: 21, status: 'draft_eligible', contract: contract(1, 0, 1, 1) },
      { id: 'deleted-fa', teamId: null, pos: 'CB', ovr: 97, age: 25, status: 'free_agent', deleted: true, contract: contract(1, 0, 1, 1) },
      { id: 'active-null', teamId: null, pos: 'CB', ovr: 96, age: 25, status: 'active', contract: contract(1, 0, 1, 1) },
      { id: 'signable', teamId: null, pos: 'CB', ovr: 60, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) },
    ] });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    expect(h.state.store.players.get('signable').teamId).toBe(31);
    expect(h.state.store.players.get('retired-fa').teamId).toBeNull();
    expect(h.state.store.players.get('draft-fa').teamId).toBeNull();
    expect(h.state.store.players.get('deleted-fa').teamId).toBeNull();
    expect(h.state.store.players.get('active-null').teamId).toBeNull();
  });

  it('gives an expired free agent a valid production-shaped contract', async () => {
    buildUnderMinimumStore({ freeAgents: [{ id: 'expired-fa', teamId: null, pos: 'CB', ovr: 68, age: 25, status: 'free_agent', contract: contract(0, 0, 0, 0) }] });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    const signed = h.state.store.players.get('expired-fa');
    expect(signed.teamId).toBe(31);
    expect(signed.contract).toMatchObject({ yearsRemaining: expect.any(Number), yearsTotal: expect.any(Number), baseAnnual: expect.any(Number), signingBonus: expect.any(Number) });
    expect(signed.contract.yearsRemaining).toBeGreaterThan(0);
    expect(signed.contract.baseAnnual).toBeGreaterThan(0);
  });

  it('uses live economy cap instead of stale team cap for reconciliation legality', async () => {
    buildUnderMinimumStore({ liveCap: 100, staleTeamCap: 52, freeAgents: [{ id: 'live-cap-fa', teamId: null, pos: 'CB', ovr: 68, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) }] });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    expect(h.state.store.players.get('live-cap-fa').teamId).toBe(31);
    expect(h.state.store.teams.get(31).capTotal).toBe(100);
  });

  it('rolls back and does not record SIGN when signing would exceed the live cap', async () => {
    buildUnderMinimumStore({ liveCap: 52.5, staleTeamCap: 52.5, freeAgents: [{ id: 'pricey-fa', teamId: null, pos: 'CB', ovr: 90, age: 25, status: 'free_agent', contract: contract(5, 0, 1, 1) }] });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    expect(h.state.store.players.get('pricey-fa').teamId).toBeNull();
    expect(h.state.txLog.some((tx) => tx.type === 'SIGN')).toBe(false);
  });

  it('deterministically selects the same candidate independent of cache insertion order', async () => {
    const candidates = [
      { id: 'fa-z', teamId: null, pos: 'CB', ovr: 70, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) },
      { id: 'fa-a', teamId: null, pos: 'CB', ovr: 70, age: 25, status: 'free_agent', contract: contract(1, 0, 1, 1) },
    ];
    buildUnderMinimumStore({ freeAgents: structuredClone(candidates) });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    const first = h.state.txLog.find((tx) => tx.type === 'SIGN')?.playerId;
    h.state.txLog.length = 0;
    buildUnderMinimumStore({ freeAgents: structuredClone([...candidates].reverse()) });
    await AiLogic.ensureMinimumRosters({ includeUserTeam: false });
    expect(h.state.txLog.find((tx) => tx.type === 'SIGN')?.playerId).toBe(first);
  });
});

describe('executeAICapManagement — determinism', () => {
  it('produces identical transactions across two identical runs', async () => {
    await AiLogic.executeAICapManagement({ autoManageUserCap: true });
    const first = JSON.stringify(h.state.txLog);

    h.state.txLog.length = 0;
    h.state.store = buildStore();
    await AiLogic.executeAICapManagement({ autoManageUserCap: true });
    const second = JSON.stringify(h.state.txLog);

    expect(second).toBe(first);
  });
});
