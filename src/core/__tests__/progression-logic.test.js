import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  processPlayerProgression,
  resolveSchemeMultiplier,
  computeProgressionFinalDelta,
} from '../progression-logic.js';
import { Utils } from '../utils.js';

function buildPlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    teamId: 1,
    pos: 'QB',
    age: 23,
    ovr: 75,
    potential: 82,
    devTrait: 'Normal',
    ratings: {
      throwPower: 75,
      throwAccuracy: 75,
      accuracyShort: 75,
      accuracyMedium: 75,
      accuracyDeep: 75,
      awareness: 75,
      intelligence: 75,
      speed: 75,
      agility: 75,
      acceleration: 75,
    },
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpreadTeam(overallRating = 85) {
  return { coach: { headCoach: { scheme: 'SPREAD', overallRating } } };
}

function makePowerRunTeam(overallRating = 85) {
  return { coach: { headCoach: { scheme: 'POWER_RUN', overallRating } } };
}

// ── resolveSchemeMultiplier ───────────────────────────────────────────────────

describe('resolveSchemeMultiplier', () => {
  it('returns 1.0 when team is null (old-save fallback)', () => {
    expect(resolveSchemeMultiplier({ pos: 'QB' }, null)).toBe(1.0);
  });

  it('returns 1.0 when team.coach is null', () => {
    expect(resolveSchemeMultiplier({ pos: 'QB' }, { coach: null })).toBe(1.0);
  });

  it('returns 1.0 when team.coach.headCoach is absent', () => {
    expect(resolveSchemeMultiplier({ pos: 'QB' }, { coach: {} })).toBe(1.0);
  });

  it('returns 1.08 (>1.0) for scheme-fit player with elite coach', () => {
    // QB fits SPREAD → uses coach quality tier (rating 85 → 1.08)
    const mult = resolveSchemeMultiplier({ pos: 'QB' }, makeSpreadTeam(85));
    expect(mult).toBe(1.08);
    expect(mult).toBeGreaterThan(1.0);
  });

  it('returns 0.90 (<1.0) for scheme-misfit player', () => {
    // QB is an offensive skill player; POWER_RUN favours RB/OL → QB is a misfit
    const mult = resolveSchemeMultiplier({ pos: 'QB' }, makePowerRunTeam(85));
    expect(mult).toBe(0.90);
    expect(mult).toBeLessThan(1.0);
  });

  it('fit multiplier is strictly greater than misfit multiplier', () => {
    const fit    = resolveSchemeMultiplier({ pos: 'QB' }, makeSpreadTeam(85));
    const misfit = resolveSchemeMultiplier({ pos: 'QB' }, makePowerRunTeam(85));
    expect(fit).toBeGreaterThan(misfit);
  });

  it('BALANCED scheme never produces a misfit (returns coach quality mult)', () => {
    const team = { coach: { headCoach: { scheme: 'BALANCED', overallRating: 85 } } };
    expect(resolveSchemeMultiplier({ pos: 'QB' }, team)).toBe(1.08);
    expect(resolveSchemeMultiplier({ pos: 'RB' }, team)).toBe(1.08);
    expect(resolveSchemeMultiplier({ pos: 'CB' }, team)).toBe(1.08);
  });
});

// ── computeProgressionFinalDelta ─────────────────────────────────────────────

describe('computeProgressionFinalDelta', () => {
  it('scheme fit multiplier (>1.0) increases finalDelta vs misfit (<1.0)', () => {
    // Same base + same morale; only multiplier differs
    const fit    = computeProgressionFinalDelta(3, 1.08, 70); // round(3.74) = 4
    const misfit = computeProgressionFinalDelta(3, 0.90, 70); // round(3.20) = 3
    expect(fit).toBeGreaterThan(misfit);
  });

  it('scheme misfit multiplier (<1.0) decreases finalDelta vs neutral (1.0)', () => {
    // round(3 * 1.0  − 0.5) = round(2.5) = 3  (neutral scheme, low morale)
    // round(3 * 0.90 − 0.5) = round(2.2) = 2  (misfit, low morale)
    const neutral = computeProgressionFinalDelta(3, 1.0,  25);
    const misfit  = computeProgressionFinalDelta(3, 0.90, 25);
    expect(misfit).toBeLessThan(neutral);
  });

  it('multiplier = 1.0 produces unchanged delta (null-coach fallback)', () => {
    // resolveSchemeMultiplier returns 1.0 for null team → same as no scheme
    expect(computeProgressionFinalDelta(3, 1.0, 50)).toBe(3);
    expect(computeProgressionFinalDelta(-2, 1.0, 50)).toBe(-2);
  });

  it('moraleBonus +0.5 applied when morale >= 70', () => {
    // round(2 * 1.0 + 0.5) = round(2.5) = 3  vs  round(2 * 1.0 + 0) = 2
    expect(computeProgressionFinalDelta(2, 1.0, 70)).toBe(3);
    expect(computeProgressionFinalDelta(2, 1.0, 69)).toBe(2); // boundary: 69 → no bonus
    expect(computeProgressionFinalDelta(2, 1.0, 100)).toBe(3);
  });

  it('moraleBonus -0.5 applied when morale <= 30', () => {
    // round(3 * 0.90 − 0.5) = round(2.2) = 2  vs  round(3 * 0.90 + 0) = round(2.7) = 3
    expect(computeProgressionFinalDelta(3, 0.90, 30)).toBe(2);
    expect(computeProgressionFinalDelta(3, 0.90, 31)).toBe(3); // boundary: 31 → no penalty
    expect(computeProgressionFinalDelta(3, 0.90, 0)).toBe(2);
  });

  it('moraleBonus 0 applied when morale is between 31 and 69', () => {
    expect(computeProgressionFinalDelta(3, 1.0, 50)).toBe(3);
    expect(computeProgressionFinalDelta(3, 1.0, 31)).toBe(3);
    expect(computeProgressionFinalDelta(3, 1.0, 69)).toBe(3);
  });

  it('finalDelta clamped to +5 upper bound', () => {
    // Large positive input would exceed 5 without the clamp
    expect(computeProgressionFinalDelta(10, 1.08, 70)).toBe(5);
    expect(computeProgressionFinalDelta(5,  1.08, 70)).toBe(5);
  });

  it('finalDelta clamped to -5 lower bound', () => {
    expect(computeProgressionFinalDelta(-10, 0.90, 25)).toBe(-5);
    expect(computeProgressionFinalDelta(-5,  0.90, 25)).toBe(-5);
  });
});

// ── processPlayerProgression (existing + regression) ─────────────────────────

describe('processPlayerProgression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips retired and draft eligible players', () => {
    const retired = buildPlayer({ id: 2, status: 'retired' });
    const prospect = buildPlayer({ id: 3, status: 'draft_eligible' });

    const result = processPlayerProgression([retired, prospect]);
    expect(result.gainers).toHaveLength(0);
    expect(result.regressors).toHaveLength(0);
    expect(result.breakouts).toHaveLength(0);
  });

  it('applies breakout growth and raises potential floor for young players', () => {
    const player = buildPlayer({ personality: { traits: ['High Work Ethic'] } });

    vi.spyOn(Utils, 'random').mockReturnValue(0.01); // trigger breakout path
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const result = processPlayerProgression([player]);

    expect(player.ovr).toBeGreaterThanOrEqual(70);
    expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
    expect(result.breakouts).toHaveLength(1);
  });

  it('caps ratings within valid bounds after severe decline', () => {
    const veteran = buildPlayer({
      age: 33,
      ovr: 90,
      devTrait: 'Normal',
      ratings: {
        throwPower: 99,
        accuracyShort: 99,
        accuracyMedium: 99,
        accuracyDeep: 99,
        awareness: 99,
        speed: 99,
      },
    });

    vi.spyOn(Utils, 'random').mockReturnValue(0.1); // trigger cliff
    vi.spyOn(Utils, 'rand').mockImplementation((min) => min);

    processPlayerProgression([veteran]);

    const allRatings = Object.values(veteran.ratings);
    expect(Math.min(...allRatings)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...allRatings)).toBeLessThanOrEqual(99);
  });

  it('scheme fit (>1.0) produces higher rating nudge than scheme misfit (<1.0)', () => {
    // Two growth-phase QBs with identical setup; one has fit scheme, one misfit.
    // Utils.rand mocked so growth ovrDelta = 3 for both (after 6 personality rand calls).
    // fit  team: SPREAD (QB fits) + coach 85 → multiplier 1.08, morale 70 (+0.5 bonus)
    //   → computeProgressionFinalDelta(3, 1.08, 70) = round(3.74) = 4 → throwPower 79
    // misfit team: POWER_RUN (QB misfit) → multiplier 0.90, morale 70 (+0.5 bonus)
    //   → computeProgressionFinalDelta(3, 0.90, 70) = round(3.20) = 3 → throwPower 78
    vi.spyOn(Utils, 'random').mockReturnValue(0.5);
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const fitPlayer    = buildPlayer({ id: 10, teamId: 10, morale: 70 });
    const misfitPlayer = buildPlayer({ id: 11, teamId: 11, morale: 70 });

    processPlayerProgression([fitPlayer, misfitPlayer], {
      teams: {
        10: makeSpreadTeam(85),
        11: makePowerRunTeam(85),
      },
    });

    expect(fitPlayer.ratings.throwPower).toBeGreaterThan(misfitPlayer.ratings.throwPower);
  });

  it('null team.coach leaves progression unchanged from no-team baseline', () => {
    vi.spyOn(Utils, 'random').mockReturnValue(0.5);
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const noTeam   = buildPlayer({ id: 20, teamId: 99, morale: 50 });
    const nullCoach = buildPlayer({ id: 21, teamId: 98, morale: 50 });

    processPlayerProgression([noTeam, nullCoach], {
      teams: { 98: { coach: null } },
    });

    // Both fall back to multiplier 1.0 → identical throwPower nudges
    expect(noTeam.ratings.throwPower).toBe(nullCoach.ratings.throwPower);
  });
});
