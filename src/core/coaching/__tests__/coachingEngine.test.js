import { describe, it, expect } from 'vitest';
import {
  COACH_ROLES,
  SCHEME_TYPES,
  generateCoachingMarket,
  evaluateHotSeat,
  getCoachSchemeMultiplier,
  getCoachingInstabilityPenalty,
  isPositionMisfitForScheme,
  ensureCoachSchema,
} from '../coachingEngine.js';

// ── COACH_ROLES ───────────────────────────────────────────────────────────────

describe('COACH_ROLES', () => {
  it('exports expected role keys', () => {
    expect(COACH_ROLES.HEAD_COACH).toBe('headCoach');
    expect(COACH_ROLES.OC).toBe('offensiveCoordinator');
    expect(COACH_ROLES.DC).toBe('defensiveCoordinator');
  });
});

// ── generateCoachingMarket ────────────────────────────────────────────────────

describe('generateCoachingMarket', () => {
  it('produces 8–12 fresh coaches per season', () => {
    const market = generateCoachingMarket(2025, []);
    expect(market.length).toBeGreaterThanOrEqual(8);
    expect(market.length).toBeLessThanOrEqual(12);
  });

  it('is deterministic — same season produces identical market', () => {
    const a = generateCoachingMarket(2025, []);
    const b = generateCoachingMarket(2025, []);
    expect(a).toEqual(b);
  });

  it('produces different market for different seasons', () => {
    const a = generateCoachingMarket(2025, []);
    const b = generateCoachingMarket(2026, []);
    expect(a).not.toEqual(b);
  });

  it('includes at least 2 elite coaches (overallRating ≥ 75)', () => {
    const market = generateCoachingMarket(2025, []);
    const elites = market.filter((c) => c.overallRating >= 75);
    expect(elites.length).toBeGreaterThanOrEqual(2);
  });

  it('re-enters fired coaches with rating − 5 (min 30)', () => {
    const fired = [{ id: 'old_1', name: 'Bob Smith', scheme: 'SPREAD', overallRating: 70, yearsExperience: 12, formerTeamId: 1 }];
    const market = generateCoachingMarket(2026, fired);
    const reEntered = market.find((c) => c.name === 'Bob Smith');
    expect(reEntered).toBeDefined();
    expect(reEntered.overallRating).toBe(65);
    expect(reEntered.firedPrevSeason).toBe(true);
  });

  it('clamps re-entered coach rating to minimum 30', () => {
    const fired = [{ id: 'old_2', name: 'Jane Doe', scheme: 'HYBRID', overallRating: 30 }];
    const market = generateCoachingMarket(2027, fired);
    const reEntered = market.find((c) => c.name === 'Jane Doe');
    expect(reEntered.overallRating).toBe(30);
  });

  it('ignores fired coach entries without a name', () => {
    const fired = [{ id: 'x1', overallRating: 60 }];
    const market = generateCoachingMarket(2028, fired);
    const firedCoaches = market.filter((c) => c.firedPrevSeason);
    expect(firedCoaches.length).toBe(0);
  });

  it('all coaches have required fields', () => {
    const market = generateCoachingMarket(2029, []);
    for (const c of market) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('scheme');
      expect(c).toHaveProperty('overallRating');
      expect(typeof c.overallRating).toBe('number');
    }
  });
});

// ── evaluateHotSeat ───────────────────────────────────────────────────────────

describe('evaluateHotSeat', () => {
  function makeTeam(hiredSeason) {
    return { coach: { headCoach: { hiredSeason } } };
  }

  it('returns true when win% < 0.35 and tenure ≥ 2', () => {
    const team = makeTeam(2021);
    expect(evaluateHotSeat(team, { w: 4, l: 13 }, 2023)).toBe(true);
  });

  it('returns false when win% ≥ 0.50 regardless of tenure', () => {
    const team = makeTeam(2019);
    expect(evaluateHotSeat(team, { w: 9, l: 8 }, 2023)).toBe(false);
  });

  it('returns false when tenure < 2 seasons', () => {
    const team = makeTeam(2023);
    expect(evaluateHotSeat(team, { w: 3, l: 14 }, 2024)).toBe(false);
  });

  it('returns false when team has no head coach', () => {
    expect(evaluateHotSeat({ coach: {} }, { w: 2, l: 15 }, 2024)).toBe(false);
    expect(evaluateHotSeat(null, { w: 2, l: 15 }, 2024)).toBe(false);
  });

  it('returns false when season record totals 0 games', () => {
    const team = makeTeam(2021);
    expect(evaluateHotSeat(team, { w: 0, l: 0 }, 2023)).toBe(false);
  });
});

// ── getCoachSchemeMultiplier ──────────────────────────────────────────────────

describe('getCoachSchemeMultiplier', () => {
  it('returns 1.08 for rating ≥ 80', () => {
    expect(getCoachSchemeMultiplier(80)).toBe(1.08);
    expect(getCoachSchemeMultiplier(90)).toBe(1.08);
    expect(getCoachSchemeMultiplier(100)).toBe(1.08);
  });

  it('returns 1.00 for rating 65–79', () => {
    expect(getCoachSchemeMultiplier(65)).toBe(1.00);
    expect(getCoachSchemeMultiplier(72)).toBe(1.00);
    expect(getCoachSchemeMultiplier(79)).toBe(1.00);
  });

  it('returns 0.94 for rating 50–64', () => {
    expect(getCoachSchemeMultiplier(50)).toBe(0.94);
    expect(getCoachSchemeMultiplier(60)).toBe(0.94);
    expect(getCoachSchemeMultiplier(64)).toBe(0.94);
  });

  it('returns 0.88 for rating < 50', () => {
    expect(getCoachSchemeMultiplier(49)).toBe(0.88);
    expect(getCoachSchemeMultiplier(30)).toBe(0.88);
    expect(getCoachSchemeMultiplier(1)).toBe(0.88);
  });

  it('handles null/undefined by falling back to baseline (65)', () => {
    expect(getCoachSchemeMultiplier(null)).toBe(1.00);
    expect(getCoachSchemeMultiplier(undefined)).toBe(1.00);
  });
});

// ── getCoachingInstabilityPenalty ─────────────────────────────────────────────

describe('getCoachingInstabilityPenalty', () => {
  it('returns null for empty or missing history', () => {
    expect(getCoachingInstabilityPenalty([])).toBeNull();
    expect(getCoachingInstabilityPenalty(null)).toBeNull();
    expect(getCoachingInstabilityPenalty(undefined)).toBeNull();
  });

  it('returns null when fewer than 3 changes in lookback window', () => {
    const history = [
      { season: 2022 },
      { season: 2023 },
    ];
    expect(getCoachingInstabilityPenalty(history, 3)).toBeNull();
  });

  it('returns penalty object when 3+ changes in lookback window', () => {
    const history = [
      { season: 2021 },
      { season: 2022 },
      { season: 2023 },
    ];
    const result = getCoachingInstabilityPenalty(history, 3);
    expect(result).not.toBeNull();
    expect(result.penalty).toBe(0.06);
    expect(typeof result.reason).toBe('string');
  });

  it('ignores changes outside the lookback window', () => {
    // max season is 2024, cutoff = 2024 - 3 + 1 = 2022; only one change in [2022,2024]
    const history = [
      { season: 2018 },
      { season: 2019 },
      { season: 2024 },
    ];
    expect(getCoachingInstabilityPenalty(history, 3)).toBeNull();
  });
});

// ── isPositionMisfitForScheme ─────────────────────────────────────────────────

describe('isPositionMisfitForScheme', () => {
  it('returns false for BALANCED scheme (no misfits)', () => {
    expect(isPositionMisfitForScheme('RB', 'BALANCED')).toBe(false);
    expect(isPositionMisfitForScheme('CB', 'BALANCED')).toBe(false);
  });

  it('returns false for HYBRID scheme (no misfits)', () => {
    expect(isPositionMisfitForScheme('LB', 'HYBRID')).toBe(false);
    expect(isPositionMisfitForScheme('QB', 'HYBRID')).toBe(false);
  });

  it('returns true for RB in a pass-heavy scheme (SPREAD)', () => {
    expect(isPositionMisfitForScheme('RB', 'SPREAD')).toBe(true);
  });

  it('returns false for QB in SPREAD (good fit)', () => {
    expect(isPositionMisfitForScheme('QB', 'SPREAD')).toBe(false);
  });

  it('returns false for defensive player in offensive scheme (SPREAD)', () => {
    expect(isPositionMisfitForScheme('CB', 'SPREAD')).toBe(false);
  });

  it('returns false for offensive player in defensive scheme (BLITZ_HEAVY)', () => {
    expect(isPositionMisfitForScheme('QB', 'BLITZ_HEAVY')).toBe(false);
  });

  it('returns true for CB in BLITZ_HEAVY (LBs are the fit, not DBs)', () => {
    expect(isPositionMisfitForScheme('CB', 'BLITZ_HEAVY')).toBe(true);
  });

  it('returns false for unknown positions', () => {
    expect(isPositionMisfitForScheme('K', 'SPREAD')).toBe(false);
    expect(isPositionMisfitForScheme(null, 'SPREAD')).toBe(false);
    expect(isPositionMisfitForScheme('QB', null)).toBe(false);
  });
});

// ── ensureCoachSchema ─────────────────────────────────────────────────────────

describe('ensureCoachSchema', () => {
  it('returns same reference when passed null/undefined', () => {
    expect(ensureCoachSchema(null)).toBeNull();
    expect(ensureCoachSchema(undefined)).toBeUndefined();
  });

  it('adds default coach schema to a team without V1 data', () => {
    const team = { id: 1, name: 'Bears' };
    const result = ensureCoachSchema(team);
    expect(result.coach).toBeDefined();
    expect(result.coach.headCoach).toBeDefined();
    expect(result.coach.offensiveCoordinator).toBeDefined();
    expect(result.coach.defensiveCoordinator).toBeDefined();
    expect(result.coachHistory).toEqual([]);
  });

  it('does not overwrite existing V1 coach data', () => {
    const team = {
      id: 2,
      coach: {
        headCoach: { id: 'hc1', name: 'Tom Landry', overallRating: 88, scheme: 'WEST_COAST', contractYearsLeft: 2, hotSeat: false, hiredSeason: 2022, firedSeason: null },
      },
    };
    const result = ensureCoachSchema(team);
    expect(result.coach.headCoach.name).toBe('Tom Landry');
    expect(result.coach.headCoach.overallRating).toBe(88);
    expect(result.coach.headCoach.contractYearsLeft).toBe(2);
  });

  it('merges defaults into partially filled coach data', () => {
    const team = {
      id: 3,
      coach: {
        headCoach: { name: 'Partial Coach' },
      },
    };
    const result = ensureCoachSchema(team);
    expect(result.coach.headCoach.name).toBe('Partial Coach');
    expect(result.coach.headCoach.overallRating).toBe(65);
    expect(result.coach.headCoach.scheme).toBe('BALANCED');
  });

  it('preserves existing coachHistory array', () => {
    const history = [{ season: 2022, name: 'Old Coach', role: 'headCoach' }];
    const team = { id: 4, coachHistory: history };
    const result = ensureCoachSchema(team);
    expect(result.coachHistory).toEqual(history);
  });

  it('is pure — does not mutate the input team', () => {
    const team = { id: 5, name: 'Test Team' };
    const original = JSON.stringify(team);
    ensureCoachSchema(team);
    expect(JSON.stringify(team)).toBe(original);
  });
});
