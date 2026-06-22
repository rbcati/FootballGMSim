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
  getMandateLabel,
} from './ownerPressureEngine.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Test Team',
    abbr: 'TST',
    conf: 0,
    div: 0,
    ovr: 78,
    wins: 8,
    losses: 9,
    ties: 0,
    capUsed: 200_000_000,
    capTotal: 255_000_000,
    roster: [],
    ...overrides,
  };
}

function makeAllTeams(count = 32, baseOvr = 75) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    ovr: baseOvr + (i % 20),
    capUsed: 180_000_000 + i * 1_000_000,
    capTotal: 255_000_000,
    conf: i < 16 ? 0 : 1,
    div: Math.floor(i / 4) % 4,
    wins: i % 17,
    losses: 17 - (i % 17),
    ties: 0,
    roster: [],
  }));
}

// ── OWNER_MANDATES constants ──────────────────────────────────────────────────

describe('OWNER_MANDATES', () => {
  it('exports all four mandate keys as frozen constants', () => {
    expect(OWNER_MANDATES.MAKE_PLAYOFFS).toBe('MAKE_PLAYOFFS');
    expect(OWNER_MANDATES.WIN_DIVISION).toBe('WIN_DIVISION');
    expect(OWNER_MANDATES.DEVELOP_YOUNG_CORE).toBe('DEVELOP_YOUNG_CORE');
    expect(OWNER_MANDATES.REDUCE_PAYROLL).toBe('REDUCE_PAYROLL');
    expect(Object.isFrozen(OWNER_MANDATES)).toBe(true);
  });
});

// ── buildOwnerProfile ─────────────────────────────────────────────────────────

describe('buildOwnerProfile', () => {
  it('returns safe baseline with MAKE_PLAYOFFS mandate', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS);
    expect(profile.mandate).toBe('MAKE_PLAYOFFS');
    expect(profile.hotSeatRating).toBe(25);
    expect(profile.seasonsUnderGoal).toBe(0);
  });

  it('accepts overrides', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.WIN_DIVISION, { hotSeatRating: 60 });
    expect(profile.mandate).toBe('WIN_DIVISION');
    expect(profile.hotSeatRating).toBe(60);
  });

  it('falls back to MAKE_PLAYOFFS for unknown mandate', () => {
    const profile = buildOwnerProfile('INVALID_MANDATE');
    expect(profile.mandate).toBe('MAKE_PLAYOFFS');
  });
});

// ── determineInitialMandate ───────────────────────────────────────────────────

describe('determineInitialMandate', () => {
  it('is deterministic for the same inputs', () => {
    const allTeams = makeAllTeams();
    const team = { ...allTeams[0], ovr: 90, capUsed: 180_000_000 };
    const r1 = determineInitialMandate(team, { allTeams });
    const r2 = determineInitialMandate(team, { allTeams });
    expect(r1).toBe(r2);
  });

  it('maps a top-tier team (high OVR, top percentile) to WIN_DIVISION', () => {
    const allTeams = makeAllTeams(32, 70);
    // Force this team to be the best
    const team = { ...allTeams[0], id: 999, ovr: 100, capUsed: 180_000_000, capTotal: 255_000_000 };
    const allWithBest = [...allTeams, team];
    expect(determineInitialMandate(team, { allTeams: allWithBest })).toBe(OWNER_MANDATES.WIN_DIVISION);
  });

  it('maps a bottom-percentile team to DEVELOP_YOUNG_CORE', () => {
    const allTeams = makeAllTeams(32, 75);
    // Worst team in league
    const worst = { ...allTeams[0], id: 99, ovr: 50, capUsed: 150_000_000, capTotal: 255_000_000, roster: [] };
    const allWithWorst = [worst, ...allTeams];
    expect(determineInitialMandate(worst, { allTeams: allWithWorst })).toBe(OWNER_MANDATES.DEVELOP_YOUNG_CORE);
  });

  it('maps a cap-stressed team to REDUCE_PAYROLL', () => {
    const allTeams = makeAllTeams();
    // Cap stressed: capUsed >= 92% of cap
    const stressed = {
      ...allTeams[10], id: 55, ovr: 80, capUsed: 236_000_000, capTotal: 255_000_000,
    };
    const result = determineInitialMandate(stressed, { allTeams: [...allTeams, stressed] });
    expect(result).toBe(OWNER_MANDATES.REDUCE_PAYROLL);
  });

  it('maps a mid-pack team to MAKE_PLAYOFFS', () => {
    // Build a controlled 32-team array where the target team is exactly middle
    // OVR rank (16th of 32) so it is clearly neither top nor bottom quartile.
    const allTeams = Array.from({ length: 32 }, (_, i) => ({
      id: i, ovr: 60 + i, capUsed: 180_000_000, capTotal: 255_000_000,
      conf: 0, div: 0, wins: 8, losses: 9, ties: 0, roster: [],
    }));
    // This team has OVR 76 (rank ~16/32 = 50th percentile, i = 16)
    const midTeam = { ...allTeams[16], id: 16 };
    const result = determineInitialMandate(midTeam, { allTeams });
    expect(result).toBe(OWNER_MANDATES.MAKE_PLAYOFFS);
  });
});

// ── evaluateMandate ───────────────────────────────────────────────────────────

describe('evaluateMandate', () => {
  it('MAKE_PLAYOFFS: passes for a playoff team', () => {
    const team = makeTeam({ owner: { mandate: OWNER_MANDATES.MAKE_PLAYOFFS } });
    const result = evaluateMandate(team, { playoffTeamIds: new Set([team.id]) });
    expect(result.achieved).toBe(true);
    expect(result.severity).toBe('normal');
  });

  it('MAKE_PLAYOFFS: fails for a non-playoff team', () => {
    const team = makeTeam({ owner: { mandate: OWNER_MANDATES.MAKE_PLAYOFFS } });
    const result = evaluateMandate(team, { playoffTeamIds: new Set([99]) });
    expect(result.achieved).toBe(false);
  });

  it('WIN_DIVISION: passes for the division leader by record', () => {
    const team = makeTeam({ id: 1, wins: 13, losses: 4, owner: { mandate: OWNER_MANDATES.WIN_DIVISION } });
    const rival = makeTeam({ id: 2, wins: 9, losses: 8 });
    const allTeams = [team, rival];
    const result = evaluateMandate(team, { allTeams, playoffTeamIds: new Set([1]) });
    expect(result.achieved).toBe(true);
  });

  it('WIN_DIVISION: fails for a non-division-leader', () => {
    const team = makeTeam({ id: 1, wins: 7, losses: 10, owner: { mandate: OWNER_MANDATES.WIN_DIVISION } });
    const leader = makeTeam({ id: 2, wins: 12, losses: 5 });
    const allTeams = [team, leader];
    const result = evaluateMandate(team, { allTeams, playoffTeamIds: new Set([2]) });
    expect(result.achieved).toBe(false);
  });

  it('WIN_DIVISION: severe miss when team also missed playoffs', () => {
    const team = makeTeam({ id: 1, wins: 5, losses: 12, owner: { mandate: OWNER_MANDATES.WIN_DIVISION } });
    const leader = makeTeam({ id: 2, wins: 14, losses: 3 });
    const allTeams = [team, leader];
    const result = evaluateMandate(team, { allTeams, playoffTeamIds: new Set([2]) });
    expect(result.achieved).toBe(false);
    expect(result.severity).toBe('severe');
  });

  it('DEVELOP_YOUNG_CORE: passes when team has >= 4 U25 players with OVR 78+', () => {
    const youngStarters = Array.from({ length: 5 }, (_, i) => ({ id: i, age: 23, ovr: 80 }));
    const team = makeTeam({ owner: { mandate: OWNER_MANDATES.DEVELOP_YOUNG_CORE } });
    const result = evaluateMandate(team, { playoffTeamIds: new Set(), teamRoster: youngStarters });
    expect(result.achieved).toBe(true);
  });

  it('DEVELOP_YOUNG_CORE: fails when team has < 4 qualifying young players', () => {
    const youngStarters = [{ id: 1, age: 23, ovr: 79 }]; // only 1
    const team = makeTeam({ owner: { mandate: OWNER_MANDATES.DEVELOP_YOUNG_CORE } });
    const result = evaluateMandate(team, { playoffTeamIds: new Set(), teamRoster: youngStarters });
    expect(result.achieved).toBe(false);
  });

  it('REDUCE_PAYROLL: passes when team capUsed is at or below league median', () => {
    const allTeams = Array.from({ length: 10 }, (_, i) => ({
      id: i, capUsed: 200_000_000 + i * 5_000_000, capTotal: 255_000_000,
    }));
    const team = { ...allTeams[0], id: 0, capUsed: 200_000_000, owner: { mandate: OWNER_MANDATES.REDUCE_PAYROLL } };
    const result = evaluateMandate(team, { allTeams, playoffTeamIds: new Set() });
    expect(result.achieved).toBe(true);
  });

  it('REDUCE_PAYROLL: fails when team capUsed is above league median', () => {
    const allTeams = Array.from({ length: 10 }, (_, i) => ({
      id: i, capUsed: 150_000_000 + i * 5_000_000, capTotal: 255_000_000,
    }));
    const highCapTeam = { ...allTeams[9], id: 9, capUsed: 195_000_000, owner: { mandate: OWNER_MANDATES.REDUCE_PAYROLL } };
    const result = evaluateMandate(highCapTeam, { allTeams, playoffTeamIds: new Set() });
    expect(result.achieved).toBe(false);
  });
});

// ── applyHotSeatDelta ─────────────────────────────────────────────────────────

describe('applyHotSeatDelta', () => {
  it('lowers hotSeatRating on success', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 60 });
    const updated = applyHotSeatDelta(profile, { achieved: true, severity: 'normal' });
    expect(updated.hotSeatRating).toBe(45);
    expect(updated.seasonsUnderGoal).toBe(0);
  });

  it('floors hotSeatRating at 0 on success', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 5 });
    const updated = applyHotSeatDelta(profile, { achieved: true, severity: 'normal' });
    expect(updated.hotSeatRating).toBe(0);
  });

  it('raises hotSeatRating on failure', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 30 });
    const updated = applyHotSeatDelta(profile, { achieved: false, severity: 'normal' });
    expect(updated.hotSeatRating).toBe(50);
    expect(updated.seasonsUnderGoal).toBe(1);
  });

  it('adds extra penalty for severe miss', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.WIN_DIVISION, { hotSeatRating: 30 });
    const updated = applyHotSeatDelta(profile, { achieved: false, severity: 'severe' });
    expect(updated.hotSeatRating).toBe(65); // 30 + 20 + 15
    expect(updated.seasonsUnderGoal).toBe(1);
  });

  it('does not mutate the input profile', () => {
    const profile = buildOwnerProfile(OWNER_MANDATES.MAKE_PLAYOFFS, { hotSeatRating: 40 });
    const originalRating = profile.hotSeatRating;
    applyHotSeatDelta(profile, { achieved: false, severity: 'normal' });
    expect(profile.hotSeatRating).toBe(originalRating);
  });
});

// ── shouldFireFrontOffice ─────────────────────────────────────────────────────

describe('shouldFireFrontOffice', () => {
  it('returns false below threshold', () => {
    expect(shouldFireFrontOffice({ hotSeatRating: 99 })).toBe(false);
  });

  it('returns true at exactly 100', () => {
    expect(shouldFireFrontOffice({ hotSeatRating: 100 })).toBe(true);
  });

  it('returns true above 100', () => {
    expect(shouldFireFrontOffice({ hotSeatRating: 120 })).toBe(true);
  });

  it('returns false with null profile', () => {
    expect(shouldFireFrontOffice(null)).toBe(false);
  });
});

// ── buildAIFiringOutcome ──────────────────────────────────────────────────────

describe('buildAIFiringOutcome', () => {
  it('returns deterministic persona reset plan', () => {
    const team = makeTeam({ capUsed: 230_000_000, wins: 3, losses: 14 });
    const outcome = buildAIFiringOutcome(team, { allTeams: makeAllTeams() });
    expect(['CAP_HOARDER', 'PATIENT_BUILDER']).toContain(outcome.newPersona);
    expect(Object.values(OWNER_MANDATES)).toContain(outcome.newMandate);
    expect(typeof outcome.newOwnerProfile).toBe('object');
    expect(outcome.newOwnerProfile.hotSeatRating).toBe(30);
    expect(outcome.newOwnerProfile.seasonsUnderGoal).toBe(0);
  });

  it('expensive failing roster → CAP_HOARDER', () => {
    const team = makeTeam({ capUsed: 235_000_000, capTotal: 255_000_000, wins: 3, losses: 14 });
    const outcome = buildAIFiringOutcome(team, { allTeams: [] });
    expect(outcome.newPersona).toBe('CAP_HOARDER');
  });

  it('weak roster without cap stress → PATIENT_BUILDER', () => {
    const team = makeTeam({ capUsed: 150_000_000, capTotal: 255_000_000, wins: 2, losses: 15 });
    const outcome = buildAIFiringOutcome(team, { allTeams: [] });
    expect(outcome.newPersona).toBe('PATIENT_BUILDER');
  });

  it('is deterministic (same inputs = same outputs)', () => {
    const team = makeTeam({ capUsed: 220_000_000, wins: 5, losses: 12 });
    const allTeams = makeAllTeams();
    const r1 = buildAIFiringOutcome(team, { allTeams });
    const r2 = buildAIFiringOutcome(team, { allTeams });
    expect(r1.newPersona).toBe(r2.newPersona);
    expect(r1.newMandate).toBe(r2.newMandate);
  });
});

// ── getHotSeatStatus ──────────────────────────────────────────────────────────

describe('getHotSeatStatus', () => {
  it('returns secure for rating < 50', () => {
    expect(getHotSeatStatus({ hotSeatRating: 0 })).toBe('secure');
    expect(getHotSeatStatus({ hotSeatRating: 25 })).toBe('secure');
    expect(getHotSeatStatus({ hotSeatRating: 49 })).toBe('secure');
  });

  it('returns unstable for rating 50–79', () => {
    expect(getHotSeatStatus({ hotSeatRating: 50 })).toBe('unstable');
    expect(getHotSeatStatus({ hotSeatRating: 65 })).toBe('unstable');
    expect(getHotSeatStatus({ hotSeatRating: 79 })).toBe('unstable');
  });

  it('returns high-risk for rating >= 80', () => {
    expect(getHotSeatStatus({ hotSeatRating: 80 })).toBe('high-risk');
    expect(getHotSeatStatus({ hotSeatRating: 100 })).toBe('high-risk');
    expect(getHotSeatStatus({ hotSeatRating: 120 })).toBe('high-risk');
  });

  it('returns secure for null/missing profile', () => {
    expect(getHotSeatStatus(null)).toBe('secure');
    expect(getHotSeatStatus({})).toBe('secure');
  });
});

// ── no Math.random in module ──────────────────────────────────────────────────

describe('no Math.random in ownerPressureEngine', () => {
  it('determineInitialMandate produces same result on repeated calls', () => {
    const allTeams = makeAllTeams(32, 78);
    const team = { ...allTeams[5], id: 5 };
    const results = Array.from({ length: 10 }, () => determineInitialMandate(team, { allTeams }));
    expect(new Set(results).size).toBe(1);
  });

  it('buildAIFiringOutcome produces same result on repeated calls', () => {
    const team = makeTeam({ capUsed: 220_000_000, wins: 4, losses: 13 });
    const allTeams = makeAllTeams();
    const outcomes = Array.from({ length: 5 }, () => buildAIFiringOutcome(team, { allTeams }));
    const personas = outcomes.map(o => o.newPersona);
    expect(new Set(personas).size).toBe(1);
  });
});

// ── getMandateLabel ───────────────────────────────────────────────────────────

describe('getMandateLabel', () => {
  it('returns human-readable labels for all mandates', () => {
    expect(getMandateLabel(OWNER_MANDATES.MAKE_PLAYOFFS)).toBe('Make the Playoffs');
    expect(getMandateLabel(OWNER_MANDATES.WIN_DIVISION)).toBe('Win the Division');
    expect(getMandateLabel(OWNER_MANDATES.DEVELOP_YOUNG_CORE)).toBe('Develop Young Core');
    expect(getMandateLabel(OWNER_MANDATES.REDUCE_PAYROLL)).toBe('Reduce Payroll');
  });

  it('handles unknown mandate gracefully', () => {
    expect(getMandateLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(getMandateLabel(null)).toBe('Unknown');
  });
});
