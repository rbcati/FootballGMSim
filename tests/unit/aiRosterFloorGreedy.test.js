/**
 * AiLogic.fillRosterToMinimumGreedy — fills one AI team to the 53-man floor
 * from the FA pool with canonical minimum-roster offers, keeping enough room
 * for every remaining slot at the league minimum (the exhaustive
 * ensureMinimumRosters search gives up on deficits this large).
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

const CAP = 200;
const POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const contract = (base) => ({ baseAnnual: base, signingBonus: 0, yearsTotal: 2, years: 2, yearsRemaining: 2, restructureCount: 0 });

function store({ rosterSize = 39, rosterBase = 2.5, freeAgents = 60 } = {}) {
  const teams = new Map([[0, { id: 0, abbr: 'USR', capTotal: CAP, deadCap: 0 }], [4, { id: 4, abbr: 'BAL', capTotal: CAP, deadCap: 0 }]]);
  const players = new Map();
  for (let i = 0; i < rosterSize; i += 1) players.set(`r${i}`, { id: `r${i}`, teamId: 4, pos: POS[i % POS.length], ovr: 70, age: 27, status: 'active', contract: contract(rosterBase) });
  for (let i = 0; i < 53; i += 1) players.set(`u${i}`, { id: `u${i}`, teamId: 0, pos: POS[i % POS.length], ovr: 70, age: 27, status: 'active', contract: contract(1) });
  for (let i = 0; i < freeAgents; i += 1) players.set(`fa${i}`, { id: `fa${i}`, teamId: null, pos: POS[i % POS.length], ovr: 50 + (i % 40), age: 24 + (i % 10), status: 'free_agent', contract: contract(1) });
  return { meta: { userTeamId: 0, economy: { currentSalaryCap: CAP }, currentSeasonId: 's1', currentWeek: 0, year: 2026, phase: 'free_agency' }, teams, players };
}

const roster = (id) => h.mockCache.getPlayersByTeam(id);
const capOf = (id) => buildTeamCapSnapshot({ team: h.state.store.teams.get(id), roster: roster(id), salaryCap: CAP });

beforeEach(() => { h.state.txLog.length = 0; });

describe('AiLogic.fillRosterToMinimumGreedy', () => {
  it('fills a 14-player deficit to 53 and stays cap-legal', async () => {
    h.state.store = store();
    const result = await AiLogic.fillRosterToMinimumGreedy(4, { transactionSink: null });
    expect(result).toMatchObject({ teamId: 4, signed: 14, rosterCount: 53 });
    expect(roster(4)).toHaveLength(53);
    expect(capOf(4).isLegallyCompliant).not.toBe(false);
    expect(h.state.txLog.filter((t) => t.type === 'SIGN' && t.details?.source === 'ai_roster_floor')).toHaveLength(14);
    expect(roster(0)).toHaveLength(53); // user untouched
  });

  it('stages transactions when a sink is supplied', async () => {
    h.state.store = store({ rosterSize: 50 });
    const sink = [];
    await AiLogic.fillRosterToMinimumGreedy(4, { transactionSink: sink });
    expect(sink).toHaveLength(3);
    expect(h.state.txLog).toHaveLength(0);
  });

  it('never takes the team over the cap, even when the full deficit is unaffordable', async () => {
    h.state.store = store({ rosterSize: 43, rosterBase: 4.4 });
    const before = capOf(4).capRoom;
    expect(before).toBeGreaterThan(0);
    const result = await AiLogic.fillRosterToMinimumGreedy(4);
    expect(capOf(4).capRoom).toBeGreaterThanOrEqual(-0.01);
    expect(result.rosterCount).toBeGreaterThanOrEqual(43);
    expect(result.rosterCount).toBeLessThanOrEqual(53);
  });

  it('is a no-op for a full roster', async () => {
    h.state.store = store({ rosterSize: 53 });
    expect(await AiLogic.fillRosterToMinimumGreedy(4)).toMatchObject({ signed: 0, rosterCount: 53 });
  });

  it('rosterFloorCapReserve keeps the minimum for open slots, capped at half the room', () => {
    expect(AiLogic.rosterFloorCapReserve(53, 40)).toBe(0);
    expect(AiLogic.rosterFloorCapReserve(43, 100)).toBeCloseTo(10 * 0.75, 5);
    expect(AiLogic.rosterFloorCapReserve(1, 30)).toBe(15);
    expect(AiLogic.rosterFloorCapReserve(20, -5)).toBe(0);
    // At acceptance the full reserve applies regardless of current room.
    expect(AiLogic.rosterFloorCapReserve(1, 30, { capAtHalfRoom: false })).toBeCloseTo(52 * 0.75, 5);
  });
});
