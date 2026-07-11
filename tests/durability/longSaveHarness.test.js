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
import { canonicalSummary, compareCanonical } from './invariants/saveReload.js';
import { runInvariants } from './invariants/index.js';
import { scanNumericCorruption, findDuplicateIds } from './invariants/helpers.js';
import { DurabilityReport, recommendRepair } from './report.js';
import { parseArgv } from './cli.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
function healthyTeam(id, roster = []) {
  return { id, name: `T${id}`, abbr: `T${id}`, wins: 8, losses: 8, ties: 0, ptsFor: 300, ptsAgainst: 300, capUsed: 200, capRoom: 100, capTotal: 301.2, roster, picks: [] };
}
function healthyPlayer(id, teamId) {
  return { id, name: `P${id}`, pos: 'QB', age: 25, ovr: 75, teamId, status: 'active', contract: { years: 3, salary: 10 }, ratings: { throwPower: 80 } };
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

  it('history: expects accumulation only from season 2 rollover', () => {
    const ctx = healthyViewCtx({ phase: 'afterSeasonRollover', season: 1 });
    expect(history.check(ctx).find((r) => r.id === 'history.season-archive-exists').status).toBe('skip');
    const ctx2 = healthyViewCtx({ phase: 'afterSeasonRollover', season: 3 });
    ctx2.view.leagueHistory = []; // no history despite season 3 → fail
    expect(history.check(ctx2).find((r) => r.id === 'history.season-archive-exists').status).toBe('fail');
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
