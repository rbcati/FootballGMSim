/**
 * Integration tests for the owner pressure layer.
 *
 * Covers: state hydration, rollover evaluation semantics, threshold behaviour,
 * AI reset/persona drift integration, user termination flag, and TradeCenter
 * view-state exposure.  Worker internals are exercised through state structures
 * and the engine functions used by the worker rollover path.
 */

import { describe, expect, it } from 'vitest';
import {
  OWNER_MANDATES,
  buildOwnerProfile,
  determineInitialMandate,
  evaluateMandate,
  applyHotSeatDelta,
  shouldFireFrontOffice,
  buildAIFiringOutcome,
  getHotSeatStatus,
} from './ownerPressureEngine.js';
import { State } from '../state.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Test Team',
    abbr: 'TST',
    conf: 0,
    div: 0,
    ovr: 78,
    wins: 9,
    losses: 8,
    ties: 0,
    capUsed: 200_000_000,
    capTotal: 255_000_000,
    roster: [],
    picks: [],
    ringOfHonor: [],
    allTimeLeaders: { passingYards: null, rushingYards: null, receivingYards: null, sacks: null },
    retiredNumbers: [],
    championshipYears: [],
    ...overrides,
  };
}

function makeLeague(teamOverrides = []) {
  const defaultTeams = Array.from({ length: 32 }, (_, i) => makeTeam({
    id: i,
    name: `Team ${i}`,
    abbr: `T${i}`,
    conf: i < 16 ? 0 : 1,
    div: Math.floor(i / 4) % 4,
    ovr: 70 + (i % 15),
    wins: 8,
    losses: 9,
    capUsed: 180_000_000 + i * 500_000,
  }));
  const teams = defaultTeams.map((t, i) =>
    i < teamOverrides.length ? { ...t, ...teamOverrides[i] } : t
  );
  return {
    teams,
    newsItems: [],
    ownerGoals: [],
    retiredPlayers: [],
    historyLedger: [],
    recordBook: {},
  };
}

// ── old saves hydrate owner safely ───────────────────────────────────────────

describe('old saves hydrate owner safely', () => {
  it('migrateLeague adds owner to all teams that lack it', () => {
    const league = makeLeague();
    league.teams.forEach(t => delete t.owner);
    const migrated = State.migrateLeague(league);
    for (const team of migrated.teams) {
      expect(team.owner).toBeDefined();
      expect(typeof team.owner.mandate).toBe('string');
      expect(typeof team.owner.hotSeatRating).toBe('number');
      expect(typeof team.owner.seasonsUnderGoal).toBe('number');
    }
  });

  it('migrateLeague does not overwrite an existing owner profile', () => {
    const existingOwner = buildOwnerProfile(OWNER_MANDATES.WIN_DIVISION, { hotSeatRating: 70 });
    const league = makeLeague();
    league.teams[0] = { ...league.teams[0], owner: existingOwner };
    const migrated = State.migrateLeague(league);
    expect(migrated.teams[0].owner.mandate).toBe(OWNER_MANDATES.WIN_DIVISION);
    expect(migrated.teams[0].owner.hotSeatRating).toBe(70);
  });

  it('migrateLeague hydrates userFranchiseTerminated with false default', () => {
    const league = makeLeague();
    delete league.userFranchiseTerminated;
    const migrated = State.migrateLeague(league);
    expect(migrated.userFranchiseTerminated).toBe(false);
  });

  it('migrateLeague preserves an existing userFranchiseTerminated value', () => {
    const league = { ...makeLeague(), userFranchiseTerminated: true };
    const migrated = State.migrateLeague(league);
    expect(migrated.userFranchiseTerminated).toBe(true);
  });
});

// ── rollover evaluation semantics ─────────────────────────────────────────────

describe('rollover mandate evaluation', () => {
  it('success lowers hot seat and resets under-goal streak', () => {
    const ownerProfile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, {
      hotSeatRating: 55,
      seasonsUnderGoal: 2,
    });
    const team = makeTeam({ id: 1, owner: ownerProfile });
    const evaluation = evaluateMandate(team, { playoffTeamIds: new Set([1]) });
    const updated = applyHotSeatDelta(ownerProfile, evaluation);

    expect(evaluation.achieved).toBe(true);
    expect(updated.hotSeatRating).toBe(40);
    expect(updated.seasonsUnderGoal).toBe(0);
  });

  it('failure raises hot seat and increments streak', () => {
    const ownerProfile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, {
      hotSeatRating: 40,
      seasonsUnderGoal: 1,
    });
    const team = makeTeam({ id: 1, owner: ownerProfile });
    const evaluation = evaluateMandate(team, { playoffTeamIds: new Set([99]) });
    const updated = applyHotSeatDelta(ownerProfile, evaluation);

    expect(evaluation.achieved).toBe(false);
    expect(updated.hotSeatRating).toBe(60);
    expect(updated.seasonsUnderGoal).toBe(2);
  });

  it('severe miss (WIN_DIVISION + missed playoffs) adds extra penalty', () => {
    const ownerProfile = buildOwnerProfile(OWNER_MANDATES.WIN_DIVISION, { hotSeatRating: 30 });
    const team = makeTeam({ id: 1, wins: 4, losses: 13, conf: 0, div: 0, owner: ownerProfile });
    const rival = makeTeam({ id: 2, wins: 14, losses: 3, conf: 0, div: 0 });
    const evaluation = evaluateMandate(team, {
      allTeams: [team, rival],
      playoffTeamIds: new Set([2]),
    });
    expect(evaluation.severity).toBe('severe');
    const updated = applyHotSeatDelta(ownerProfile, evaluation);
    expect(updated.hotSeatRating).toBe(65); // 30 + 20 + 15
  });
});

// ── AI team firing threshold behaviour ───────────────────────────────────────

describe('AI team hitting threshold', () => {
  it('shouldFireFrontOffice triggers at hotSeatRating >= 100', () => {
    const atThreshold = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 100 });
    expect(shouldFireFrontOffice(atThreshold)).toBe(true);
    const below = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 99 });
    expect(shouldFireFrontOffice(below)).toBe(false);
  });

  it('buildAIFiringOutcome returns reset persona and new mandate', () => {
    const team = makeTeam({ capUsed: 235_000_000, wins: 3, losses: 14 });
    const outcome = buildAIFiringOutcome(team, { allTeams: [team] });
    expect(outcome.newOwnerProfile.hotSeatRating).toBe(30);
    expect(outcome.newOwnerProfile.seasonsUnderGoal).toBe(0);
    expect(outcome.newPersona).toBe('CAP_HOARDER');
  });

  it('buildAIFiringOutcome uses PATIENT_BUILDER for non-cap-stressed losing team', () => {
    const team = makeTeam({ capUsed: 150_000_000, wins: 2, losses: 15 });
    const outcome = buildAIFiringOutcome(team, { allTeams: [team] });
    expect(outcome.newPersona).toBe('PATIENT_BUILDER');
  });
});

// ── user team hitting threshold ───────────────────────────────────────────────

describe('user team hitting threshold', () => {
  it('reaching hotSeatRating >= 100 signals termination', () => {
    const ownerProfile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 80 });
    const team = makeTeam({ id: 0, owner: ownerProfile });
    const evaluation = evaluateMandate(team, { playoffTeamIds: new Set([99]) }); // missed playoffs
    const updated = applyHotSeatDelta(ownerProfile, evaluation);
    expect(shouldFireFrontOffice(updated)).toBe(true);
  });
});

// ── TradeCenter view-state exposure ──────────────────────────────────────────

describe('TradeCenter view-state exposes high-pressure opponent hint data', () => {
  it('getHotSeatStatus returns high-risk for opponent at 80+', () => {
    const opponentOwner = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 85 });
    expect(getHotSeatStatus(opponentOwner)).toBe('high-risk');
  });

  it('getHotSeatStatus returns unstable for opponent at 50–79', () => {
    const opponentOwner = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 65 });
    expect(getHotSeatStatus(opponentOwner)).toBe('unstable');
  });

  it('getHotSeatStatus returns secure for opponent below 50', () => {
    const opponentOwner = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 30 });
    expect(getHotSeatStatus(opponentOwner)).toBe('secure');
  });
});

// ── rerun-safe: same rollover does not double-apply deltas ────────────────────

describe('rerun-safe rollover', () => {
  it('applying delta once vs. twice produces different results (confirms guard is needed)', () => {
    const ownerProfile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 30 });
    const evaluation = { achieved: false, severity: 'normal' };

    const afterOne = applyHotSeatDelta(ownerProfile, evaluation);
    const afterTwo = applyHotSeatDelta(afterOne, evaluation);

    expect(afterOne.hotSeatRating).toBe(50);
    expect(afterTwo.hotSeatRating).toBe(70); // double-apply would give this
    // The worker guards against re-entry via ownerPressureEvaluatedForSeason
    // so only afterOne is the correct post-rollover state.
    expect(afterOne.hotSeatRating).not.toBe(afterTwo.hotSeatRating);
  });

  it('a successful season resets streak regardless of prior consecutive failures', () => {
    let profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 25 });
    const fail = { achieved: false, severity: 'normal' };
    const pass = { achieved: true,  severity: 'normal' };

    // 3 failures then success
    profile = applyHotSeatDelta(profile, fail);
    profile = applyHotSeatDelta(profile, fail);
    profile = applyHotSeatDelta(profile, fail);
    expect(profile.seasonsUnderGoal).toBe(3);

    profile = applyHotSeatDelta(profile, pass);
    expect(profile.seasonsUnderGoal).toBe(0);
    expect(profile.hotSeatRating).toBeLessThan(80);
  });
});
