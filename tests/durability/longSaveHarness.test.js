/**
 * Long-Save Durability Harness — focused tests.
 *
 * Two tiers live here:
 *   1. PURE unit tests for every invariant checker, the save/reload comparator,
 *      the report builder and the CLI parser. These need no worker and are fast.
 *   2. A BOUNDED real-lifecycle smoke that boots the REAL production worker,
 *      initializes the REAL league (seeded), and drives the REAL season through
 *      regular-season + playoffs, asserting the harness wiring + invariant
 *      framework produce structured results end-to-end. It intentionally stops
 *      BEFORE the expensive (~6-8 min) offseason rollover so it is CI-viable.
 *
 * The full 1-season (incl. rollover + save/reload) and multi-season durability
 * runs are the `durability:*` scripts (manual/scheduled) — NOT this test.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

import * as roster from './invariants/roster.js';
import * as cap from './invariants/cap.js';
import * as schedule from './invariants/schedule.js';
import * as progression from './invariants/progression.js';
import * as draft from './invariants/draft.js';
import * as freeAgency from './invariants/freeAgency.js';
import * as references from './invariants/references.js';
import * as numericSafety from './invariants/numericSafety.js';
import * as retirement from './invariants/retirement.js';
import * as history from './invariants/history.js';
import * as continuity from './invariants/continuity.js';
import { canonicalSummary, compareCanonical } from './invariants/saveReload.js';
import { runInvariants } from './invariants/index.js';
import { scanNumericCorruption, findDuplicateIds } from './invariants/helpers.js';
import { DurabilityReport, recommendRepair } from './report.js';
import { parseArgv } from './cli.js';
import { LifecycleDriver } from './lifecycleDriver.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
function healthyTeam(id, roster = []) {
  return { id, name: `T${id}`, abbr: `T${id}`, wins: 8, losses: 8, ties: 0, ptsFor: 300, ptsAgainst: 300, capUsed: 200, capRoom: 100, capTotal: 301.2, roster, picks: [] };
}
function healthyPlayer(id, teamId) {
  return { id, name: `P${id}`, pos: 'QB', age: 25, ovr: 75, teamId, status: 'active', capHit: 3, contract: { years: 3, salary: 3 }, ratings: { throwPower: 80 } };
}
function healthyViewCtx(overrides = {}) {
  const teams = [];
  for (let t = 0; t < 32; t += 1) {
    const rosterArr = [];
    for (let p = 0; p < 53; p += 1) rosterArr.push(healthyPlayer(t * 100 + p, t));
    teams.push(healthyTeam(t, rosterArr));
  }
  return {
    season: 3, phase: 'afterRegularSeason', week: 18, seed: 1684, expectedTeamCount: 32,
    view: { year: 2028, week: 18, phase: 'regular', teams, championTeamId: null, leagueHistory: [], retiredPlayers: [], awardHistory: [], franchiseAwards: [], pendingOffers: [], schedule: null },
    db: null, probes: {}, ...overrides,
  };
}

// ── Pure invariant checkers ───────────────────────────────────────────────
describe('invariant checkers — happy path', () => {
  it('roster: healthy league passes size + membership invariants', () => {
    const res = roster.check(healthyViewCtx());
    expect(res.some((r) => r.status === 'fail')).toBe(false);
    expect(res.find((r) => r.id === 'roster.size-within-legal-range').status).toBe('pass');
  });

  it('roster: detects a player rostered on two teams', () => {
    const ctx = healthyViewCtx();
    ctx.view.teams[1].roster[0] = ctx.view.teams[0].roster[0]; // same player id on two teams
    const res = roster.check(ctx);
    expect(res.find((r) => r.id === 'roster.no-duplicate-membership').status).toBe('fail');
  });

  it('roster: stable-phase under-min roster fails, offseason under-min tolerated', () => {
    const ctx = healthyViewCtx(); // view.phase = 'regular' (stable)
    ctx.view.teams[0].roster = ctx.view.teams[0].roster.slice(0, 10); // 10 < 53
    expect(roster.check(ctx).find((r) => r.id === 'roster.size-within-legal-range').status).toBe('fail');
    ctx.view.phase = 'offseason'; // transitional — under-min tolerated
    expect(roster.check(ctx).find((r) => r.id === 'roster.size-within-legal-range').status).toBe('pass');
  });

  it('cap: detects NaN cap usage and negative contract years', () => {
    const ctx = healthyViewCtx();
    ctx.view.teams[0].capUsed = NaN;
    ctx.view.teams[1].roster[0].contract.years = -2;
    const res = cap.check(ctx);
    expect(res.find((r) => r.id === 'cap.aggregates-finite').status).toBe('fail');
    expect(res.find((r) => r.id === 'cap.contract-values-safe').status).toBe('fail');
  });

  it('schedule: detects self-game and unfinished played game', () => {
    const ctx = healthyViewCtx();
    ctx.view.schedule = { weeks: [{ week: 1, games: [{ home: 0, away: 0, played: true }] }] };
    const res = schedule.check(ctx);
    expect(res.find((r) => r.id === 'schedule.no-self-games').status).toBe('fail');
    expect(res.find((r) => r.id === 'schedule.completed-games-have-result').status).toBe('fail');
  });

  it('progression: flags out-of-range OVR and impossible age', () => {
    const ctx = healthyViewCtx();
    ctx.db = { players: [healthyPlayer(1, 0), { ...healthyPlayer(2, 0), ovr: 250 }, { ...healthyPlayer(3, 0), age: 99 }], teams: ctx.view.teams };
    const res = progression.check(ctx);
    expect(res.find((r) => r.id === 'progression.ovr-within-bounds').status).toBe('fail');
    expect(res.find((r) => r.id === 'progression.active-age-reasonable').status).toBe('fail');
  });

  it('draft: detects a pick owned by two teams', () => {
    const ctx = healthyViewCtx();
    ctx.db = { teams: ctx.view.teams, picks: [ { id: 'pk1', round: 1, season: 2028, currentOwner: 0 }, { id: 'pk1', round: 1, season: 2028, currentOwner: 5 } ] };
    const res = draft.check(ctx);
    expect(res.find((r) => r.id === 'draft.pick-single-owner').status).toBe('fail');
  });

  it('freeAgency: skips without a DB pool, validates bounds with one', () => {
    const skipRes = freeAgency.check(healthyViewCtx());
    expect(skipRes.every((r) => r.status === 'skip')).toBe(true);
    const ctx = healthyViewCtx();
    const players = [];
    for (let t = 0; t < 32; t += 1) for (let p = 0; p < 53; p += 1) players.push(healthyPlayer(t * 100 + p, t));
    for (let f = 0; f < 400; f += 1) players.push({ ...healthyPlayer(90000 + f, null), status: 'free_agent' });
    ctx.db = { players, teams: ctx.view.teams };
    const res = freeAgency.check(ctx);
    expect(res.find((r) => r.id === 'freeAgency.pool-size-bounded').status).toBe('pass');
    expect(res.find((r) => r.id === 'freeAgency.no-duplicate-player-ids').status).toBe('pass');
  });

  it('references: reports player pointing at a missing team', () => {
    const ctx = healthyViewCtx();
    ctx.db = { players: [{ ...healthyPlayer(1, 999) }], teams: ctx.view.teams };
    const res = references.check(ctx);
    expect(res.find((r) => r.id === 'references.player-to-team').status).toBe('fail');
  });

  it('references: validates actual depth-chart assignments', () => {
    const ctx = healthyViewCtx();
    ctx.view.teams[0].depthChart = { QB: [ctx.view.teams[0].roster[0].id, 999999] };
    const res = references.check(ctx);
    expect(res.find((r) => r.id === 'references.depth-chart-to-roster').status).toBe('fail');
  });

  it('numericSafety: catches Infinity buried in durable state', () => {
    const ctx = healthyViewCtx();
    ctx.view.teams[3].ptsFor = Infinity;
    const res = numericSafety.check(ctx);
    expect(res.find((r) => r.id === 'numericSafety.durable-state-finite').status).toBe('fail');
  });

  it('retirement: skips cleanly when no ledger present', () => {
    const res = retirement.check(healthyViewCtx());
    expect(res.some((r) => r.status === 'fail')).toBe(false);
  });

  it('history: requires an archive after the first rollover', () => {
    const ctx = healthyViewCtx({ phase: 'afterSeasonRollover', season: 1 });
    expect(history.check(ctx).find((r) => r.id === 'history.season-archive-exists').status).toBe('fail');
    const ctx2 = healthyViewCtx({ phase: 'afterSeasonRollover', season: 3 });
    ctx2.view.leagueHistory = []; // no history despite season 3 → fail
    expect(history.check(ctx2).find((r) => r.id === 'history.season-archive-exists').status).toBe('fail');
  });
});



describe('continuity invariant V2', () => {
  const baseSnap = () => ({
    league: { phase: 'offseason_resign' },
    teams: [{ id: '0' }],
    players: [{ id: 'p10', status: 'active', yearsRemaining: 1, yearsTotal: 2, baseAnnual: 5, signingBonus: 0, activeCapHit: 5 }],
    retiredPlayers: [],
    history: [{ season: 2026 }],
    schedule: [{ id: 'g1', season: 2026 }],
  });
  const ctxFor = (prev, cur, phase = 'afterSeasonRollover') => ({ ...healthyViewCtx({ phase }), durableSnapshot: cur, previousDurableSnapshot: prev });

  it('fails when completed rollover does not add exactly one history row', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), league: { phase: 'preseason' }, history: prev.history };
    expect(continuity.check(ctxFor(prev, cur)).find((r) => r.id === 'continuity.history-grows-once').status).toBe('fail');
    cur.history = [...prev.history, { season: 2027 }];
    expect(continuity.check(ctxFor(prev, cur)).find((r) => r.id === 'continuity.history-grows-once').status).toBe('pass');
  });

  it('fails when a game id is reused across prior and current seasons', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), schedule: [{ id: 'g1', season: 2027 }] };
    expect(continuity.check(ctxFor(prev, cur, 'afterRegularSeason')).find((r) => r.id === 'continuity.schedule-game-id-season-unique').status).toBe('fail');
  });

  it('fails when contract years increase without in-window contract-write evidence even if salary also changes', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), players: [{ ...prev.players[0], yearsRemaining: 2 }] };
    expect(continuity.check(ctxFor(prev, cur, 'afterRegularSeason')).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('fail');
    cur.players[0].baseAnnual = 7;
    expect(continuity.check(ctxFor(prev, cur, 'afterRegularSeason')).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('fail');
    cur.players[0].yearsTotal = 4;
    expect(continuity.check(ctxFor(prev, cur, 'afterRegularSeason')).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('fail');
  });

  it('passes a contract-year increase with production transaction evidence', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), players: [{ ...prev.players[0], yearsRemaining: 3, yearsTotal: 3 }] };
    const ctx = ctxFor(prev, cur, 'afterRegularSeason');
    ctx.probes = { transactions: [{ type: 'CONTRACT_EXTENSION', playerId: 'p10' }] };
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('pass');
  });

  it('bounds contract-write evidence to the compared checkpoint window', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), players: [{ ...prev.players[0], yearsRemaining: 3, yearsTotal: 3, baseAnnual: 8 }] };
    const oldExtension = { id: 'old-extension', type: 'CONTRACT_EXTENSION', playerId: 'p10', season: 2026, week: 2 };
    const ctx = ctxFor(prev, cur, 'afterRegularSeason');
    ctx.previousTransactions = [oldExtension];
    ctx.probes = { transactions: [oldExtension] };
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('fail');
    ctx.probes.transactions = [oldExtension, { id: 'new-extension', type: 'CONTRACT_EXTENSION', playerId: 'p10', season: 2027, week: 1 }];
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.contract-years-do-not-increase-without-contract-write').status).toBe('pass');
  });

  it('fails disappearing active players but passes recorded retirement and draft-pool disposition', () => {
    const prev = baseSnap();
    let cur = { ...baseSnap(), players: [], retiredPlayers: [] };
    expect(continuity.check(ctxFor(prev, cur)).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('fail');
    cur = { ...baseSnap(), players: [], retiredPlayers: [{ id: 'p10' }] };
    expect(continuity.check(ctxFor(prev, cur)).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('pass');
    const draftPrev = { ...baseSnap(), players: [{ id: 'draft1', status: 'draft_eligible' }] };
    cur = { ...baseSnap(), players: [] };
    expect(continuity.check(ctxFor(draftPrev, cur)).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('pass');
  });

  it('does not blanket-skip offseason resign to preseason disappearances and accepts release evidence', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), league: { phase: 'preseason' }, players: [], retiredPlayers: [] };
    expect(continuity.check(ctxFor(prev, cur)).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('fail');
    const ctx = ctxFor(prev, cur);
    ctx.probes = { transactions: [{ type: 'PLAYER_RELEASED', playerId: 'p10' }] };
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('pass');
  });

  it('does not let a prior release excuse a later unexplained disappearance', () => {
    const prev = baseSnap();
    const cur = { ...baseSnap(), league: { phase: 'preseason' }, players: [], retiredPlayers: [] };
    const oldRelease = { id: 'old-release', type: 'PLAYER_RELEASED', playerId: 'p10', season: 2026, week: 3 };
    const ctx = ctxFor(prev, cur);
    ctx.previousTransactions = [oldRelease];
    ctx.probes = { transactions: [oldRelease] };
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('fail');
    ctx.probes.transactions = [oldRelease, { id: 'new-release', type: 'PLAYER_RELEASED', playerId: 'p10', season: 2027, week: 1 }];
    expect(continuity.check(ctx).find((r) => r.id === 'continuity.players-do-not-disappear').status).toBe('pass');
  });
});

describe('runInvariants — registry', () => {
  it('runs every module and never emits a reasonless skip', () => {
    const results = runInvariants(healthyViewCtx());
    expect(results.length).toBeGreaterThan(10);
    for (const r of results) {
      if (r.status === 'skip') expect(String(r.message).trim().length).toBeGreaterThan(0);
    }
  });
});

// ── helpers ──────────────────────────────────────────────────────────────
describe('helpers', () => {
  it('scanNumericCorruption finds NaN/Infinity and respects skipKeys', () => {
    const hits = scanNumericCorruption({ a: NaN, b: { c: Infinity }, logs: { d: NaN } }, { skipKeys: new Set(['logs']) });
    expect(hits.length).toBe(2);
  });
  it('findDuplicateIds returns duplicated ids', () => {
    expect(findDuplicateIds([{ id: 1 }, { id: 1 }, { id: 2 }])).toEqual([{ id: '1', count: 2 }]);
  });
});

// ── save/reload comparator ─────────────────────────────────────────────────
describe('save/reload comparator', () => {
  it('identical state compares equal', () => {
    const state = { season: 2, view: { year: 2027, week: 1, phase: 'preseason', teams: [healthyTeam(0, [healthyPlayer(1, 0)])], leagueHistory: [{ id: 's1' }], championTeamId: 3, userTeamId: 0 }, db: { players: [healthyPlayer(1, 0)], picks: [] } };
    const a = canonicalSummary(state);
    const b = canonicalSummary(JSON.parse(JSON.stringify(state)));
    expect(compareCanonical(a, b).ok).toBe(true);
  });
  it('roster membership change is detected', () => {
    const base = { season: 2, view: { year: 2027, phase: 'preseason', teams: [healthyTeam(0, [healthyPlayer(1, 0)])], leagueHistory: [] }, db: { players: [healthyPlayer(1, 0)], picks: [] } };
    const changed = { season: 2, view: { year: 2027, phase: 'preseason', teams: [healthyTeam(0, [healthyPlayer(2, 0)])], leagueHistory: [] }, db: { players: [healthyPlayer(2, 0)], picks: [] } };
    const cmp = compareCanonical(canonicalSummary(base), canonicalSummary(changed));
    expect(cmp.ok).toBe(false);
    expect(cmp.mismatches.some((m) => m.field === 'rosterFingerprint')).toBe(true);
  });
});

// ── report + cli ────────────────────────────────────────────────────────────
describe('report builder', () => {
  it('accumulates counts, first failure, and recommends a repair PR', () => {
    const rep = new DurabilityReport({ seed: 1, mode: '1-season', failureMode: 'fail-fast', requestedSeasons: 1 });
    rep.addCheckpoint({ season: 1, phase: 'afterRegularSeason', week: 18, results: [
      { id: 'roster.size-within-legal-range', status: 'pass', message: 'ok' },
      { id: 'cap.aggregates-finite', status: 'fail', entityType: 'team', entityId: 5, message: 'bad cap' },
    ] });
    const json = rep.finalize({ seasonsAttempted: 1, seasonsCompleted: 0, runtimeMs: 10, peakMemoryMb: 100 });
    expect(json.summary).toEqual({ passed: 1, failed: 1, skipped: 0 });
    expect(json.firstFailure.invariantId).toBe('cap.aggregates-finite');
    expect(json.recommendedNextRepairPR).toContain('Cap/contract');
    expect(rep.passed).toBe(false);
  });
  it('recommendRepair returns null when clean', () => {
    expect(recommendRepair({ firstFailure: null })).toBeNull();
  });
});

describe('cli parser', () => {
  it('parses mode, seed, and collect-all', () => {
    const { raw, errors } = parseArgv(['node', 's', '5-season', '--collect-all', '--seed=99']);
    expect(errors).toEqual([]);
    expect(raw.mode).toBe('5-season');
    expect(raw.failureMode).toBe('collect-all');
    expect(raw.seed).toBe(99);
  });
  it('defaults to 1-season fail-fast', () => {
    const { raw } = parseArgv(['node', 's']);
    expect(raw.mode).toBe('1-season');
    expect(raw.failureMode).toBe('fail-fast');
  });
  it('flags an unknown mode', () => {
    const { errors } = parseArgv(['node', 's', '--mode=99-season']);
    expect(errors.length).toBeGreaterThan(0);
  });
});


describe('runDurabilityHarness bounded semantics', () => {
  it('classifies exhausted SIM_TO_PHASE calls as an incomplete lifecycle transition', async () => {
    const { runDurabilityHarness } = await import('./longSaveHarness.js');
    const dispatch = async (type) => {
      if (type === 'INIT') return { type: 'OK', payload: { ok: true } };
      if (type === 'USE_SAFE_STARTER_LEAGUE') return { type: 'OK', payload: healthyViewCtx().view };
      if (type === 'SIM_TO_PHASE') return { type: 'OK', payload: { ...healthyViewCtx().view, phase: 'regular', dynastySoakSimBatch: { reachedTarget: false } } };
      if (type === 'SAVE_NOW') return { type: 'OK', payload: { ok: true } };
      return { type: 'OK', payload: {} };
    };
    const report = await runDurabilityHarness({
      mode: '1-season', failureMode: 'collect-all', perSeasonStopPhase: 'rollover',
      driverOverrides: { loadWorker: async () => {}, dispatch, readDbPool: async () => { const v = healthyViewCtx().view; return { players: v.teams.flatMap((t) => t.roster), teams: v.teams, meta: null, seasons: [], picks: [] }; } },
    });
    const json = report.toJSON();
    expect(json.seasonsAttempted).toBe(1);
    expect(json.seasonsCompleted).toBe(0);
    expect(json.lifecycleException.classification).toBe('lifecycle-crash');
    expect(json.firstFailure.invariantId).toBe('lifecycle.exception');
    expect(json.lifecycleException.message).toContain('exhausted 15 calls');
  });

  it('does not count a bounded postseason stop as a completed rollover season', async () => {
    const { runDurabilityHarness } = await import('./longSaveHarness.js');
    const phases = ['playoffs', 'offseason'];
    const dispatch = async (type) => {
      if (type === 'INIT') return { type: 'OK', payload: { ok: true } };
      if (type === 'USE_SAFE_STARTER_LEAGUE') return { type: 'OK', payload: healthyViewCtx().view };
      if (type === 'SIM_TO_PHASE') {
        const phase = phases.shift();
        return { type: 'OK', payload: { ...healthyViewCtx().view, phase, week: phase === 'playoffs' ? 18 : 22 } };
      }
      if (type === 'SAVE_NOW') return { type: 'OK', payload: { ok: true } };
      if (type === 'LOAD_SAVE') return { type: 'OK', payload: { ...healthyViewCtx().view, phase: 'offseason' } };
      return { type: 'OK', payload: {} };
    };
    const report = await runDurabilityHarness({
      mode: '1-season', failureMode: 'collect-all', perSeasonStopPhase: 'offseason',
      driverOverrides: { loadWorker: async () => {}, dispatch, readDbPool: async () => { const v = healthyViewCtx().view; return { players: v.teams.flatMap((t) => t.roster), teams: v.teams, meta: null, seasons: [], picks: [] }; } },
    });
    const json = report.toJSON();
    expect(json.seasonsAttempted).toBe(1);
    expect(json.seasonsCompleted).toBe(0);
    expect(json.competitiveSeasonsCompleted).toBe(1);
    expect(json.completedThrough).toBe('afterPlayoffs');
    expect(json.boundedRun).toBe(true);
    expect(json.unexercisedLifecycleStages).toContain('draft');
  });
});

// ── bounded real-lifecycle smoke (real worker, no expensive offseason) ──────
describe('real-lifecycle bounded smoke', () => {
  it('boots the real league and validates through playoffs', async () => {
    const { runDurabilityHarness } = await import('./longSaveHarness.js');
    const events = [];
    const report = await runDurabilityHarness({
      mode: '1-season', seed: 1684, failureMode: 'collect-all',
      perSeasonStopPhase: 'playoffs', onEvent: (e) => events.push(e),
    });
    const json = report.toJSON();
    // Real init checkpoint ran with a full DB pool.
    const initCp = json.checkpoints.find((c) => c.phase === 'afterInit');
    expect(initCp).toBeTruthy();
    expect(initCp.summary.pass).toBeGreaterThan(0);
    // Reached the regular-season checkpoint against the real worker.
    const regCp = json.checkpoints.find((c) => c.phase === 'afterRegularSeason');
    expect(regCp).toBeTruthy();
    // No lifecycle crash while booting/simming the real production path.
    expect(json.lifecycleException).toBeNull();
  }, 180_000);
});

describe('LifecycleDriver.simToPhase target enforcement', () => {
  it('returns when the view reaches the target phase', async () => {
    const driver = new LifecycleDriver({ loadWorker: async () => {}, dispatch: async () => ({ type: 'OK', payload: { phase: 'playoffs', year: 2026 } }) });
    const res = await driver.simToPhase('playoffs', { checkpoint: 'afterRegularSeason', maxCalls: 3 });
    expect(res.view.phase).toBe('playoffs');
    expect(res.calls).toBe(1);
  });

  it('returns when the batch explicitly reports reachedTarget', async () => {
    const driver = new LifecycleDriver({ loadWorker: async () => {}, dispatch: async () => ({ type: 'OK', payload: { phase: 'regular', year: 2026, dynastySoakSimBatch: { reachedTarget: true } } }) });
    const res = await driver.simToPhase('playoffs', { checkpoint: 'afterRegularSeason', maxCalls: 3 });
    expect(res.batch.reachedTarget).toBe(true);
  });

  it('throws when maxCalls is exhausted before reaching the target', async () => {
    const driver = new LifecycleDriver({ loadWorker: async () => {}, dispatch: async () => ({ type: 'OK', payload: { phase: 'regular', year: 2026, dynastySoakSimBatch: { reachedTarget: false } } }) });
    await expect(driver.simToPhase('playoffs', { checkpoint: 'afterRegularSeason', maxCalls: 2 }))
      .rejects.toMatchObject({ isLifecycleCrash: true, checkpoint: 'afterRegularSeason' });
  });
});

describe('durable snapshot V2', () => {
  it('detects identical lifecycle metadata with different roster state as non-deterministic', async () => {
    const { runDeterminismCheck } = await import('./longSaveHarness.js');
    let run = 0;
    const dispatch = async (type) => {
      if (type === 'INIT') return { type: 'OK', payload: { ok: true } };
      const v = healthyViewCtx().view;
      v.teams[0].roster[0] = healthyPlayer(run < 2 ? 1 : 2, 0);
      if (type === 'USE_SAFE_STARTER_LEAGUE') { run += 1; return { type: 'OK', payload: v }; }
      return { type: 'OK', payload: { ...v, phase: 'playoffs' } };
    };
    const det = await runDeterminismCheck({ mode: '1-season', perSeasonStopPhase: 'playoffs', failureMode: 'collect-all', driverOverrides: { loadWorker: async () => {}, dispatch, readDbPool: async () => { const v = healthyViewCtx().view; v.teams[0].roster[0] = healthyPlayer(run < 2 ? 1 : 2, 0); return { players: v.teams.flatMap((t) => t.roster), teams: v.teams, meta: null, seasons: [], picks: [] }; } } });
    expect(det.lifecycleDeterministic).toBe(true);
    expect(det.stateDeterministic).toBe(false);
    expect(det.firstDivergence).toMatchObject({ domain: expect.any(String), field: expect.any(String) });
  });

  it('canonicalizes collection ordering and mixed id aliases but preserves duplicates', async () => {
    const { buildDurableSnapshot, compareDurableSnapshots } = await import('./invariants/durableSnapshot.js');
    const a = { season: 1, view: { teams: [healthyTeam(0, [healthyPlayer(2, 0), healthyPlayer('1', 0)])], leagueHistory: [] }, db: { players: [healthyPlayer('1', 0), healthyPlayer(2, 0)], picks: [] } };
    const b = { season: 1, view: { teams: [healthyTeam('0', [healthyPlayer(1, '0'), healthyPlayer('2', '0')])], leagueHistory: [] }, db: { players: [healthyPlayer(2, '0'), healthyPlayer(1, '0')], picks: [] } };
    expect(compareDurableSnapshots(buildDurableSnapshot(a), buildDurableSnapshot(b)).ok).toBe(true);
    b.view.teams[0].roster.push(healthyPlayer(2, '0'));
    b.db.players.push(healthyPlayer(2, '0'));
    expect(compareDurableSnapshots(buildDurableSnapshot(a), buildDurableSnapshot(b)).ok).toBe(false);
  });

  it('preserves duplicate occurrences when a later same-id entity matches', async () => {
    const { compareDurableSnapshots } = await import('./invariants/durableSnapshot.js');
    const a = { players: [{ id: 'p1', ovr: 70 }, { id: 'p1', ovr: 80 }] };
    const b = { players: [{ id: 'p1', ovr: 75 }, { id: 'p1', ovr: 80 }] };
    const cmp = compareDurableSnapshots(a, b);
    expect(cmp.ok).toBe(false);
    expect(cmp.firstDivergence).toMatchObject({ domain: 'players', entityId: 'p1', field: 'ovr' });
  });

  it('normalizes legacy object-shaped champion and runner-up team references', async () => {
    const { buildDurableSnapshot, compareDurableSnapshots } = await import('./invariants/durableSnapshot.js');
    const base = { season: 1, view: { teams: [healthyTeam(0, []), healthyTeam(1, [])], leagueHistory: [{ season: 2026, champion: { id: 0 }, runnerUp: { teamId: 1 } }] }, db: { teams: [{ id: 0 }, { id: 1 }], players: [], picks: [] } };
    const alias = structuredClone(base);
    alias.view.leagueHistory[0] = { season: 2026, championTeamId: '0', runnerUpTeamId: '1' };
    expect(compareDurableSnapshots(buildDurableSnapshot(base), buildDurableSnapshot(alias)).ok).toBe(true);
    const changed = structuredClone(base);
    changed.view.leagueHistory[0].champion = { id: 1 };
    const cmp = compareDurableSnapshots(buildDurableSnapshot(base), buildDurableSnapshot(changed));
    expect(cmp.ok).toBe(false);
    expect(cmp.firstDivergence).toMatchObject({ domain: 'history', field: 'champion' });
  });

  it('save/reload detects contract, dead-cap, injury, ratings, schedule, and history mutations', () => {
    const base = { season: 1, view: { year: 2027, phase: 'preseason', teams: [healthyTeam(0, [{ ...healthyPlayer(1, 0), capHit: 10, injury: { status: 'out' } }])], schedule: { games: [{ id: 'g1', week: 1, home: 0, away: 1, played: true, homeScore: 3, awayScore: 0 }] }, leagueHistory: [{ season: 2026, championTeamId: 0 }] }, db: { players: [{ ...healthyPlayer(1, 0), capHit: 10, injury: { status: 'out' } }], picks: [] } };
    for (const mutate of [
      (s) => { s.db.players[0].contract.years = 9; }, (s) => { s.view.teams[0].deadCap = 99; },
      (s) => { s.db.players[0].injury.status = 'healthy'; }, (s) => { s.db.players[0].ovr = 12; },
      (s) => { s.view.schedule.games[0].homeScore = 99; }, (s) => { s.view.leagueHistory[0].championTeamId = 1; },
    ]) { const changed = structuredClone(base); mutate(changed); expect(compareCanonical(canonicalSummary(base), canonicalSummary(changed)).ok).toBe(false); }
  });

  it('stable cap uses live cap, dead cap, team id 0, excludes staff, exact/fractional boundaries, and skips offseason', () => {
    const ctx = healthyViewCtx();
    ctx.view.economy = { currentSalaryCap: 200 };
    ctx.view.teams = [healthyTeam(0, [{ ...healthyPlayer(1, 0), contract: { baseAnnual: 150, signingBonus: 0, yearsTotal: 1, yearsRemaining: 1 } }])];
    ctx.view.teams[0].deadCap = 50; ctx.view.teams[0].staffPayroll = 999;
    expect(cap.check(ctx).find((r) => r.id === 'cap.stable-phase-legal').status).toBe('pass');
    ctx.view.teams[0].deadCap = 50.01;
    expect(cap.check(ctx).find((r) => r.id === 'cap.stable-phase-legal').status).toBe('fail');
    ctx.view.phase = 'offseason';
    expect(cap.check(ctx).find((r) => r.id === 'cap.stable-phase-legal').status).toBe('skip');
  });

  it('CLI parses multi-seed runs', () => {
    const { raw, errors } = parseArgv(['node', 's', '5-season', '--seeds=1684,1702,1703']);
    expect(errors).toEqual([]); expect(raw.seeds).toEqual([1684, 1702, 1703]);
  });

  it('CLI accepts one seed in --seeds, rejects invalid lists, and rejects determinism combination', () => {
    expect(parseArgv(['node', 's', '5-season', '--seeds=1702']).raw.seeds).toEqual([1702]);
    expect(parseArgv(['node', 's', '--seeds=1684,nope']).errors).toContain('Invalid --seeds');
    expect(parseArgv(['node', 's', '--seeds=1684,', '--determinism']).errors.some((e) => e.includes('--seeds cannot be combined'))).toBe(true);
  });
  it('production-shaped cap uses DB dead cap and canonical contract fields', () => {
    const ctx = healthyViewCtx();
    ctx.view.economy = { currentSalaryCap: 100 };
    ctx.view.teams = [healthyTeam(0, [])];
    ctx.db = {
      meta: { economy: { currentSalaryCap: 100 } },
      teams: [{ id: 0, deadCap: 21, staffPayroll: 500 }],
      players: [
        { id: 'p100', teamId: 0, status: 'active', contract: { baseAnnual: 70, signingBonus: 30, yearsTotal: 3, yearsRemaining: 2 } },
      ],
      picks: [],
    };
    const res = cap.check(ctx);
    const legal = res.find((r) => r.id === 'cap.stable-phase-legal');
    expect(legal.status).toBe('fail');
    expect(legal.details).toMatchObject({ teamId: '0', rosterCap: 80, deadCap: 21, totalCommitted: 101, salaryCap: 100, overageVsLegal: 1 });
  });

  it('structured durable diffs report canonical entity id rather than array index', async () => {
    const { buildDurableSnapshot, compareDurableSnapshots } = await import('./invariants/durableSnapshot.js');
    const a = { season: 1, view: { teams: [healthyTeam(0, [])], leagueHistory: [] }, db: { teams: [{ id: 0 }], players: [{ ...healthyPlayer(9001, 0), ovr: 70 }], picks: [] } };
    const b = structuredClone(a);
    b.db.players[0].ovr = 71;
    const cmp = compareDurableSnapshots(buildDurableSnapshot(a), buildDurableSnapshot(b));
    expect(cmp.firstDivergence).toMatchObject({ domain: 'players', entityId: '9001', field: 'ovr' });
  });

  it('report passed is false when state determinism fails with zero invariant failures', () => {
    const rep = new DurabilityReport({ seed: 1, mode: '1-season', failureMode: 'collect-all', requestedSeasons: 1 });
    rep.addCheckpoint({ season: 0, phase: 'afterInit', week: 0, results: [{ id: 'x.ok', status: 'pass', message: 'ok' }] });
    rep.setDeterminism(false, 'state differs', { lifecycleDeterministic: true, stateDeterministic: false, firstDivergence: { domain: 'players', entityId: '9', field: 'ovr' } });
    expect(rep.passed).toBe(false);
  });

});
