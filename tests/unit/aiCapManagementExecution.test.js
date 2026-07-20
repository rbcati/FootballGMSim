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

  it('emits one transaction per committed action', async () => {
    await AiLogic.executeAICapManagement({ autoManageUserCap: false });
    // Only AI teams (1) acted; team 2 legal. Every tx is RESTRUCTURE or RELEASE.
    expect(h.state.txLog.length).toBeGreaterThan(0);
    for (const tx of h.state.txLog) expect(['RESTRUCTURE', 'RELEASE']).toContain(tx.type);
    const playerIds = h.state.txLog.map((t) => t.details.playerId);
    expect(new Set(playerIds).size).toBe(playerIds.length); // no duplicate action on one player
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
