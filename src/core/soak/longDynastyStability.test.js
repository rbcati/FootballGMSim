/**
 * Long-Dynasty Stability Soak V2
 *
 * Deterministic regression harness proving the combined long-dynasty *meta*
 * stack (owner expectations, front-office personas, franchise legacy / ring of
 * honor, retired numbers, league history ledger, prestige honors, league media
 * desk, league pulse) stays stable, bounded, deterministic, non-mutating and
 * replay-safe over 10 / 25 / 50 seasons.
 *
 * Runtime: the full 50-season soak runs in well under 100ms, so all three soak
 * lengths run in the default Vitest suite (no dedicated script required).
 * `npm run test:soak` also includes this file.
 *
 * This is a stability/regression suite: it drives the real worker rollover
 * engine functions via src/testSupport/dynastySoakHarness.js. It does NOT touch
 * core sim math, trade/free-agency/waiver/draft/playoff/standings/ratings logic,
 * or owner-pressure / media / persona formulas.
 */

import { describe, expect, it } from 'vitest';
import {
  SOAK_SEED,
  SOAK_DEFAULTS,
  createSoakLeague,
  advanceSoakSeason,
  applyOwnerPressureRollover,
  runSoak,
  buildInvariantSummary,
  buildMediaViewState,
  assertSerializable,
  jsonClone,
  MEDIA_STORY_MAX,
  MAX_PULSE_ITEMS,
  ALLOWED_PERSONAS,
  ALLOWED_MANDATES,
} from '../../testSupport/dynastySoakHarness.js';
import { ensureDynastyMeta } from '../dynasty-story.js';
import {
  filterLegendsByPosition,
  buildLegendLeaderboards,
  findLegendById,
  buildLegendTimeline,
  buildLegendProfileMetrics,
} from '../history/legendsBrowserEngine.js';
import {
  getCareerHonorCounts,
  aggregateCareerHonors,
  summarizeSeasonAwards,
} from '../awards/awardHistory.js';

// ── Shared invariant assertions ───────────────────────────────────────────────

function assertCoreInvariants(summary, state) {
  // serializable
  expect(() => assertSerializable(state.teams, 'teams')).not.toThrow();
  expect(() => assertSerializable(state.meta, 'meta')).not.toThrow();

  // structural integrity
  expect(summary.teamCount).toBe(SOAK_DEFAULTS.teamCount);
  expect(summary.invalidOwnerProfiles).toBe(0);
  expect(summary.invalidPersonaProfiles).toBe(0);
  expect(summary.invalidReferences).toBe(0);
  expect(summary.duplicateLedgerYears).toBe(0);
  expect(summary.duplicateRetiredNumberKeys).toBe(0);
  expect(summary.duplicateMediaStoryIds).toBe(0);
  expect(summary.duplicateAwardHistoryYears).toBe(0);

  // award history stays serializable + honor counts finite
  expect(() => assertSerializable(state.meta.awardHistory, 'awardHistory')).not.toThrow();
  expect(Number.isFinite(summary.maxCareerHonorCount)).toBe(true);

  // every team retains valid owner + persona profiles
  for (const team of state.teams) {
    expect(team.owner?.mandate, `team ${team.id} owner mandate`).toBeTruthy();
    expect(ALLOWED_MANDATES.has(team.owner.mandate)).toBe(true);
    expect(Number.isFinite(Number(team.owner.hotSeatRating))).toBe(true);
    expect(team.frontOffice?.persona, `team ${team.id} persona`).toBeTruthy();
    expect(ALLOWED_PERSONAS.has(team.frontOffice.persona)).toBe(true);
    // fired/reset AI teams must keep required team fields
    expect(team.id).not.toBeUndefined();
    expect(team.abbr).toBeTruthy();
    expect(Array.isArray(team.roster)).toBe(true);
    expect(team.roster.length).toBeGreaterThan(0);
  }

  // caps
  expect(summary.weeklyHeadlinesCount).toBeLessThanOrEqual(SOAK_DEFAULTS.weeklyHeadlineCap);
  expect(summary.leaguePulseCount).toBeLessThanOrEqual(MAX_PULSE_ITEMS);
  expect(summary.mediaStoryCount).toBeLessThanOrEqual(MEDIA_STORY_MAX);

  // owner pressure numeric sanity
  expect(Number.isFinite(summary.maxHotSeat)).toBe(true);
  expect(summary.maxHotSeat).not.toBe(Infinity);
  expect(Number.isNaN(summary.maxHotSeat)).toBe(false);
  expect(typeof summary.userFranchiseTerminated).toBe('boolean');
}

// ── A. 10-season smoke soak ────────────────────────────────────────────────────

describe('Long-Dynasty Soak V2 — A. 10-season smoke', () => {
  it('runs 10 seasons without crashing and stays serializable & valid', () => {
    let lastSummary = null;
    let lastState = null;
    expect(() => {
      const { state, summaries } = runSoak({ seasons: 10 });
      lastSummary = summaries[summaries.length - 1];
      lastState = state;
    }).not.toThrow();

    expect(lastSummary.season).toBe(11); // 10 advanced + 1 (pointer is next season)
    assertCoreInvariants(lastSummary, lastState);

    // media stories are derived view-state only: never persisted to meta
    expect(lastState.meta.mediaStories).toBeUndefined();
    const stories = buildMediaViewState(lastState);
    expect(Array.isArray(stories)).toBe(true);
    expect(stories.length).toBeLessThanOrEqual(MEDIA_STORY_MAX);
  });

  it('keeps every meta sub-state serializable each season', () => {
    runSoak({
      seasons: 10,
      onSeason: (summary, state) => {
        expect(() => assertSerializable(buildMediaViewState(state), 'mediaStories')).not.toThrow();
        expect(() => assertSerializable(state.meta.currentSeasonHonors, 'currentSeasonHonors')).not.toThrow();
        expect(() => assertSerializable(state.meta.historyLedger, 'historyLedger')).not.toThrow();
      },
    });
  });
});

// ── B. 25-season meta-system soak ──────────────────────────────────────────────

describe('Long-Dynasty Soak V2 — B. 25-season meta-system', () => {
  it('owner pressure stays numerically sane and bounded by reset behavior', () => {
    const { state, summaries } = runSoak({ seasons: 25 });

    for (const s of summaries) {
      expect(Number.isFinite(s.maxHotSeat)).toBe(true);
      expect(Number.isNaN(s.maxHotSeat)).toBe(false);
      expect(s.maxHotSeat).not.toBe(Infinity);
      // AI front offices reset (fire @100 → 30), so their hot-seat never stores >=100.
      expect(s.maxAiHotSeat).toBeLessThan(100);
      // No franchise should escape into an unbounded state.
      expect(s.maxHotSeat).toBeLessThan(200);
      expect(typeof s.userFranchiseTerminated).toBe('boolean');
      // ownerPressureEvaluatedForSeason advances and tracks the completed season.
      expect(typeof s.ownerPressureEvaluatedForSeason === 'string' || s.ownerPressureEvaluatedForSeason === null).toBe(true);
    }

    // every team owner profile remains finite & well-formed
    for (const team of state.teams) {
      const hot = Number(team.owner.hotSeatRating);
      expect(Number.isFinite(hot)).toBe(true);
      expect(hot).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(team.owner.seasonsUnderGoal ?? 0)).toBe(true);
    }
  });

  it('front-office personas remain within the allowed enum', () => {
    const { state } = runSoak({ seasons: 25 });
    for (const team of state.teams) {
      expect(ALLOWED_PERSONAS.has(team.frontOffice.persona)).toBe(true);
    }
  });

  it('fired/reset AI teams retain required team fields', () => {
    const { state } = runSoak({ seasons: 25 });
    for (const team of state.teams) {
      if (team.id === state.meta.userTeamId) continue;
      expect(team.id).not.toBeUndefined();
      expect(team.abbr).toBeTruthy();
      expect(team.conf === 0 || team.conf === 1).toBe(true);
      expect(Array.isArray(team.roster) && team.roster.length > 0).toBe(true);
      expect(team.owner?.mandate).toBeTruthy();
      expect(team.frontOffice?.persona).toBeTruthy();
    }
  });
});

// ── C. 50-season dynasty integrity soak ────────────────────────────────────────

describe('Long-Dynasty Soak V2 — C. 50-season dynasty integrity', () => {
  it('history / legacy / prestige stay internally consistent', () => {
    const { state, summaries } = runSoak({ seasons: 50 });
    const last = summaries[summaries.length - 1];

    // history ledger has stable, unique year-keyed entries
    expect(last.duplicateLedgerYears).toBe(0);
    expect(last.historyLedgerCount).toBe(50);
    const years = state.meta.historyLedger.map((e) => e.year);
    expect(new Set(years).size).toBe(years.length);

    // no duplicate retired numbers for the same team
    expect(last.duplicateRetiredNumberKeys).toBe(0);
    for (const team of state.teams) {
      const set = new Set(team.retiredNumbers);
      expect(set.size).toBe(team.retiredNumbers.length);
    }

    // ROH entries reference valid (id-bearing) players, no duplicate inductions
    expect(last.invalidReferences).toBe(0);
    for (const team of state.teams) {
      const ids = team.ringOfHonor.map((m) => String(m.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const m of team.ringOfHonor) expect(m.id).toBeTruthy();
    }

    // prestige honors remain serializable + currentSeasonHonors shape valid
    expect(() => assertSerializable(state.meta.currentSeasonHonors, 'currentSeasonHonors')).not.toThrow();
    const honors = state.meta.currentSeasonHonors;
    expect(honors && typeof honors === 'object').toBe(true);
    expect(honors).toHaveProperty('FIRST_TEAM_ALL_PRO');
    expect(honors).toHaveProperty('SECOND_TEAM_ALL_PRO');
    expect(honors).toHaveProperty('PRO_BOWL');
  });

  it('legends browser source data never crashes on retired/missing player refs', () => {
    const { state } = runSoak({ seasons: 50 });
    // Pick the team with the largest ROH, then inject corrupt/missing entries.
    const team = [...state.teams].sort((a, b) => b.ringOfHonor.length - a.ringOfHonor.length)[0];
    const corruptedRoh = [
      ...team.ringOfHonor,
      null,
      undefined,
      {},
      { id: null, name: undefined },
      { id: 'ghost', position: 'QB' }, // references a player that no longer exists
    ];

    expect(() => filterLegendsByPosition(corruptedRoh, 'QB')).not.toThrow();
    expect(() => buildLegendLeaderboards(corruptedRoh)).not.toThrow();
    expect(() => findLegendById(corruptedRoh, 'ghost')).not.toThrow();
    expect(() => findLegendById(corruptedRoh, 'does-not-exist')).not.toThrow();
    for (const legend of team.ringOfHonor) {
      expect(() => buildLegendTimeline(legend)).not.toThrow();
      expect(() => buildLegendProfileMetrics(legend)).not.toThrow();
    }
    // also tolerate building a timeline/metrics from a missing legend
    expect(() => buildLegendTimeline(findLegendById(corruptedRoh, 'does-not-exist'))).not.toThrow();
  });

  it('no uncontrolled growth across all collections', () => {
    const { summaries } = runSoak({ seasons: 50 });
    for (const s of summaries) {
      expect(s.weeklyHeadlinesCount).toBeLessThanOrEqual(SOAK_DEFAULTS.weeklyHeadlineCap);
      expect(s.leaguePulseCount).toBeLessThanOrEqual(MAX_PULSE_ITEMS);
      expect(s.mediaStoryCount).toBeLessThanOrEqual(MEDIA_STORY_MAX);
      // legacy collections grow only by explicit dynasty rules (≤ 1 induction/title-season)
      expect(s.ringOfHonorCount).toBeLessThanOrEqual(s.season);
      expect(s.retiredNumbersCount).toBeLessThanOrEqual(s.season);
    }
  });

  it('full 50-season soak passes the core invariant battery', () => {
    const { state, summaries } = runSoak({ seasons: 50 });
    assertCoreInvariants(summaries[summaries.length - 1], state);
  });
});

// ── C2. Award history (Awards & Honors Expansion V2) ────────────────────────────

describe('Long-Dynasty Soak V2 — C2. award history bounded & duplicate-free', () => {
  it('appends exactly one award-history entry per season, no duplicate years', () => {
    const { state, summaries } = runSoak({ seasons: 50 });

    // grows at most one per season
    for (let i = 0; i < summaries.length; i++) {
      expect(summaries[i].awardHistoryCount).toBe(i + 1);
      expect(summaries[i].duplicateAwardHistoryYears).toBe(0);
    }
    expect(state.meta.awardHistory).toHaveLength(50);

    // unique, sorted year keys
    const years = state.meta.awardHistory.map((e) => e.year);
    expect(new Set(years).size).toBe(years.length);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it('award entries are serializable with stable player/team snapshots', () => {
    const { state } = runSoak({ seasons: 25 });
    expect(() => assertSerializable(state.meta.awardHistory, 'awardHistory')).not.toThrow();

    for (const entry of state.meta.awardHistory) {
      expect(entry.awards).toBeTruthy();
      const mvp = entry.awards.MVP;
      if (mvp) {
        expect(mvp.playerId).toBeTruthy();
        expect(typeof mvp.playerName).toBe('string');
      }
      expect(Array.isArray(entry.allPro.firstTeam)).toBe(true);
      expect(Array.isArray(entry.proBowl)).toBe(true);
      // league leaders present & finite when set
      for (const v of Object.values(entry.leaders)) {
        if (v) expect(Number.isFinite(v.value)).toBe(true);
      }
    }
  });

  it('career honor counts remain finite and serializable', () => {
    const { state } = runSoak({ seasons: 50 });
    const agg = aggregateCareerHonors(state.meta.awardHistory);
    expect(agg.size).toBeGreaterThan(0);
    for (const [pid, counts] of agg) {
      expect(() => assertSerializable(counts, `honors_${pid}`)).not.toThrow();
      for (const v of Object.values(counts)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(50);
      }
      // single-player helper agrees with the aggregate
      expect(getCareerHonorCounts(state.meta.awardHistory, pid)).toEqual(counts);
    }
  });

  it('re-running a completed season does not duplicate its award-history entry', () => {
    const state = createSoakLeague({ seed: SOAK_SEED });
    advanceSoakSeason(state);
    const afterOne = jsonClone(state.meta.awardHistory);
    expect(afterOne).toHaveLength(1);

    // Re-point the year/season back and advance again → replaces, never appends.
    const replayYear = afterOne[0].year;
    state.meta.year = replayYear;
    state.meta.season -= 1;
    state.meta.currentSeasonId = `s${state.meta.season}`;
    advanceSoakSeason(state);

    const replayed = state.meta.awardHistory.filter((e) => e.year === replayYear);
    expect(replayed).toHaveLength(1);
  });

  it('summaries degrade safely on missing/empty award history', () => {
    expect(() => summarizeSeasonAwards(undefined)).not.toThrow();
    expect(summarizeSeasonAwards(undefined).majorAwards).toEqual([]);
    expect(getCareerHonorCounts([], 'nobody').mvp).toBe(0);
    expect(aggregateCareerHonors(null).size).toBe(0);
  });
});

// ── D. Determinism / replay guard checks ───────────────────────────────────────

describe('Long-Dynasty Soak V2 — D. determinism & replay guards', () => {
  it('same seed + same seasons produces identical invariant summaries', () => {
    const runA = runSoak({ seasons: 25, seed: SOAK_SEED });
    const runB = runSoak({ seasons: 25, seed: SOAK_SEED });
    expect(runA.summaries).toEqual(runB.summaries);

    // compact high-level snapshot comparison
    const snap = (r) => ({
      teamCount: r.summaries.at(-1).teamCount,
      playerCount: r.summaries.at(-1).playerCount,
      historyLedgerCount: r.summaries.at(-1).historyLedgerCount,
      ringOfHonorCount: r.summaries.at(-1).ringOfHonorCount,
      personas: r.state.teams.map((t) => t.frontOffice.persona),
      hotSeats: r.state.teams.map((t) => t.owner.hotSeatRating),
      mediaIds: buildMediaViewState(r.state).map((s) => s.id),
    });
    expect(snap(runA)).toEqual(snap(runB));
  });

  it('calling owner-pressure rollover twice does not double-apply for the same completed season', () => {
    const state = createSoakLeague({ seed: SOAK_SEED });
    advanceSoakSeason(state); // completes s1; evaluatedForSeason now === 's1'

    // Re-point the completed season and clear the guard to evaluate s2 once.
    state.meta.currentSeasonId = 's2';
    state.meta.ownerPressureEvaluatedForSeason = 's1';

    const firstApply = applyOwnerPressureRollover(state);
    const ownersAfterFirst = state.teams.map((t) => ({ ...t.owner }));

    const secondApply = applyOwnerPressureRollover(state); // guarded no-op
    const ownersAfterSecond = state.teams.map((t) => ({ ...t.owner }));

    expect(firstApply).toBe(true);
    expect(secondApply).toBe(false);
    expect(ownersAfterSecond).toEqual(ownersAfterFirst);
    expect(state.meta.ownerPressureEvaluatedForSeason).toBe('s2');
  });

  it('media narrative generation is pure: identical output, no input mutation', () => {
    const { state } = runSoak({ seasons: 8, seed: SOAK_SEED });
    const before = jsonClone({ teams: state.teams, meta: state.meta });

    const first = buildMediaViewState(state);
    const second = buildMediaViewState(state);
    const after = jsonClone({ teams: state.teams, meta: state.meta });

    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
    expect(first).toEqual(second);
    expect(after).toEqual(before); // builder did not mutate league/view-state input
  });
});

// ── E. Old-save compatibility check ────────────────────────────────────────────

describe('Long-Dynasty Soak V2 — E. old-save compatibility', () => {
  function buildOldSaveShapedState() {
    // Start from a normal league, then strip every newer meta field to mimic a
    // pre-meta-stack save.
    const { teams } = createSoakLeague({ seed: SOAK_SEED, teamCount: 16 });
    for (const team of teams) {
      delete team.owner;
      delete team.frontOffice;
      delete team.ringOfHonor;
      delete team.retiredNumbers;
      delete team.championshipYears;
      delete team.allTimeLeaders;
    }

    // Minimal old-shaped meta: missing owner profiles, termination flag,
    // mediaStories, leaguePulse, history containers, prestige fields, etc.
    const rawMeta = {
      year: 2025,
      season: 1,
      currentSeasonId: 's1',
      userTeamId: 0,
      phase: 'regular',
      newsItems: [],
      // intentionally NO: userFranchiseTerminated, ownerPressureEvaluatedForSeason,
      // leaguePulse, weeklyHeadlines, historyLedger, currentSeasonHonors, playoffSeeds,
      // leagueHistory, hallOfFame, recordBook, seasonStorylines
    };

    return { teams, rawMeta };
  }

  it('migrates a pre-meta-stack save and hydrates safe defaults', () => {
    const { teams, rawMeta } = buildOldSaveShapedState();

    // Migrate through the normal dynasty-meta migration path.
    const migrated = ensureDynastyMeta(rawMeta);
    expect(Array.isArray(migrated.leagueHistory)).toBe(true);
    expect(migrated.hallOfFame && typeof migrated.hallOfFame === 'object').toBe(true);
    expect(Array.isArray(migrated.seasonStorylines)).toBe(true);
    expect(migrated.recordBook && typeof migrated.recordBook === 'object').toBe(true);

    // Build a soak state on top of the migrated meta, filling soak-only fields.
    const state = {
      teams,
      meta: {
        ...migrated,
        seed: SOAK_SEED,
        userFranchiseTerminated: !!migrated.userFranchiseTerminated,
        ownerPressureEvaluatedForSeason: migrated.ownerPressureEvaluatedForSeason ?? null,
        playoffSeeds: migrated.playoffSeeds ?? {},
        historyLedger: Array.isArray(migrated.historyLedger) ? migrated.historyLedger : [],
        weeklyHeadlines: Array.isArray(migrated.weeklyHeadlines) ? migrated.weeklyHeadlines : [],
        leaguePulse: Array.isArray(migrated.leaguePulse) ? migrated.leaguePulse : [],
        currentSeasonHonors: migrated.currentSeasonHonors ?? null,
        userTeamId: 0,
      },
    };

    // Advance 1–3 seasons through the meta rollover path.
    expect(() => {
      for (let i = 0; i < 3; i++) advanceSoakSeason(state);
    }).not.toThrow();

    const summary = buildInvariantSummary(state);

    // owner + persona profiles were lazily hydrated for every team
    expect(summary.ownerProfileCount).toBe(state.teams.length);
    expect(summary.invalidOwnerProfiles).toBe(0);
    expect(summary.invalidPersonaProfiles).toBe(0);
    for (const team of state.teams) {
      expect(team.owner?.mandate).toBeTruthy();
      expect(team.frontOffice?.persona).toBeTruthy();
      expect(ALLOWED_MANDATES.has(team.owner.mandate)).toBe(true);
      expect(ALLOWED_PERSONAS.has(team.frontOffice.persona)).toBe(true);
    }

    // newer meta fields hydrated to safe, bounded values
    expect(typeof state.meta.userFranchiseTerminated).toBe('boolean');
    expect(summary.weeklyHeadlinesCount).toBeLessThanOrEqual(SOAK_DEFAULTS.weeklyHeadlineCap);
    expect(summary.leaguePulseCount).toBeLessThanOrEqual(MAX_PULSE_ITEMS);
    expect(summary.mediaStoryCount).toBeLessThanOrEqual(MEDIA_STORY_MAX);
    expect(summary.invalidReferences).toBe(0);
    expect(() => assertSerializable(state.meta, 'migrated meta')).not.toThrow();

    // derived media view-state builds cleanly off the migrated league
    expect(() => buildMediaViewState(state)).not.toThrow();
  });
});
