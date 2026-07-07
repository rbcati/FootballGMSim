import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  processPlayerProgression,
  sanitizeCoachDevModifier,
} from '../progression-logic.js';
import { getDevelopmentRateModifier } from '../coaching-philosophy-effects.js';
import { Utils } from '../utils.js';

// Wrap getDevelopmentRateModifier in a vi.fn that defaults to the real
// implementation so most tests exercise the true helper, while individual
// tests can inject pathological returns (NaN, Infinity, huge values) with
// mockReturnValueOnce to prove the wiring's safety rails.
vi.mock('../coaching-philosophy-effects.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDevelopmentRateModifier: vi.fn(actual.getDevelopmentRateModifier),
  };
});

// Real modifier for a QB: 1 + 0.05 (DEVELOPMENTAL) + 0.04 (HC SPREAD) + 0.02 (OC SPREAD × 0.5) = 1.11
const HIGH_DEV_STAFF = {
  headCoach: { traits: ['DEVELOPMENTAL'], offensivePhilosophy: 'SPREAD' },
  offCoordinator: { offensivePhilosophy: 'SPREAD' },
};

// Real modifier for a QB: 1.0 (no trait, BALANCED philosophy, no dev bonus)
const LOW_DEV_STAFF = {
  headCoach: { traits: [], offensivePhilosophy: 'BALANCED' },
};

function buildProfile() {
  // workEthic 55 / diva 45 / discipline 45 zero out the personality terms in
  // the breakout/bust probability math, keeping the growth roll predictable.
  return {
    workEthic: 55, leadership: 55, diva: 45, riskTaker: 40,
    discipline: 45, coachability: 60, holdoutRisk: 20, consistency: 65, offFieldRisk: 25,
  };
}

function buildPlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Wiring Test QB',
    teamId: 1,
    pos: 'QB',
    age: 23,
    ovr: 75,
    potential: 85,
    devTrait: 'Superstar',
    morale: 50,
    personalityProfile: buildProfile(),
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getDevelopmentRateModifier).mockClear();
});

// ── sanitizeCoachDevModifier ──────────────────────────────────────────────────

describe('sanitizeCoachDevModifier', () => {
  it('defaults non-finite values to 1.0', () => {
    expect(sanitizeCoachDevModifier(undefined)).toBe(1.0);
    expect(sanitizeCoachDevModifier(null)).toBe(1.0);
    expect(sanitizeCoachDevModifier(NaN)).toBe(1.0);
    expect(sanitizeCoachDevModifier(Infinity)).toBe(1.0);
    expect(sanitizeCoachDevModifier(-Infinity)).toBe(1.0);
    expect(sanitizeCoachDevModifier('not a number')).toBe(1.0);
  });

  it('clamps finite values to [0.5, 2.0]', () => {
    expect(sanitizeCoachDevModifier(10)).toBe(2.0);
    expect(sanitizeCoachDevModifier(0.01)).toBe(0.5);
    expect(sanitizeCoachDevModifier(-3)).toBe(0.5);
  });

  it('passes through values inside the rails', () => {
    expect(sanitizeCoachDevModifier(1.11)).toBe(1.11);
    expect(sanitizeCoachDevModifier(0.85)).toBe(0.85);
    expect(sanitizeCoachDevModifier(1.0)).toBe(1.0);
  });
});

// ── processPlayerProgression wiring ───────────────────────────────────────────

describe('processPlayerProgression coaching dev modifier wiring', () => {
  it('high-development staff produces more positive growth than low-development staff', () => {
    // random 0.5 avoids breakout (0.20) and bust (0.18) rolls → normal growth.
    // rand → max: rawDelta 3 × Superstar 1.5 → round(4.5) = 5 base delta.
    // High staff: round(5 × 1.11) = 6; low staff: 5.
    // Shared scheme-fit team with a 45-rated coach (×0.88) keeps the final
    // delta under the ±5 clamp: high round(6 × 0.88) = 5, low round(5 × 0.88) = 4.
    vi.spyOn(Utils, 'random').mockReturnValue(0.5);
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const highPlayer = buildPlayer({ id: 10, teamId: 10 });
    const lowPlayer  = buildPlayer({ id: 11, teamId: 11 });
    const schemeTeam = { coach: { headCoach: { scheme: 'SPREAD', overallRating: 45 } } };

    processPlayerProgression([highPlayer, lowPlayer], {
      teamCoaches: { 10: HIGH_DEV_STAFF, 11: LOW_DEV_STAFF },
      teams: { 10: schemeTeam, 11: schemeTeam },
    });

    expect(highPlayer.ratings.throwPower).toBe(80); // 75 + 5
    expect(lowPlayer.ratings.throwPower).toBe(79);  // 75 + 4
    expect(highPlayer.ovr).toBeGreaterThan(lowPlayer.ovr);
  });

  it('does not amplify aging decline — regression is identical regardless of staff', () => {
    // Age 33 QB (decline starts at 31): random 0.5 avoids wall (0.30) and
    // cliff (0.15) → normal decline of -3 × Superstar 0.75 → -2 for both.
    vi.spyOn(Utils, 'random').mockReturnValue(0.5);
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const highVet = buildPlayer({ id: 20, teamId: 20, age: 33 });
    const lowVet  = buildPlayer({ id: 21, teamId: 21, age: 33 });

    processPlayerProgression([highVet, lowVet], {
      teamCoaches: { 20: HIGH_DEV_STAFF, 21: LOW_DEV_STAFF },
    });

    expect(highVet.ratings).toEqual(lowVet.ratings);
    expect(highVet.ovr).toBe(lowVet.ovr);
    // Decline path never consults the coaching dev modifier at all
    expect(vi.mocked(getDevelopmentRateModifier)).not.toHaveBeenCalled();
  });

  it('missing coach/staff data defaults to a 1.0 multiplier (no-op)', () => {
    vi.spyOn(Utils, 'random').mockReturnValue(0.5);
    vi.spyOn(Utils, 'rand').mockImplementation((min, max) => max);

    const noEntry   = buildPlayer({ id: 30, teamId: 30 }); // teamId absent from teamCoaches
    const nullStaff = buildPlayer({ id: 31, teamId: 31 }); // explicit null staff
    const neutral   = buildPlayer({ id: 32, teamId: 32 }); // staff with zero dev bonus
    const noOptions = buildPlayer({ id: 33, teamId: 33 }); // no options at all

    processPlayerProgression([noEntry, nullStaff, neutral], {
      teamCoaches: { 31: null, 32: LOW_DEV_STAFF },
    });
    processPlayerProgression([noOptions]);

    expect(noEntry.ratings).toEqual(nullStaff.ratings);
    expect(noEntry.ratings).toEqual(neutral.ratings);
    expect(noEntry.ratings).toEqual(noOptions.ratings);
    expect(noEntry.ovr).toBe(noOptions.ovr);
  });

  it('progression is deterministic for the same seed and inputs', () => {
    function makeLCG(seed) {
      let s = seed >>> 0 || 1;
      return () => {
        s = ((1664525 * s + 1013904223) | 0) >>> 0;
        return s / 0x100000000;
      };
    }

    function runOnce() {
      const next = makeLCG(1337);
      vi.spyOn(Utils, 'random').mockImplementation(next);
      vi.spyOn(Utils, 'rand').mockImplementation(
        (min, max) => Math.floor(next() * (max - min + 1)) + min
      );

      const players = [
        buildPlayer({ id: 1, teamId: 1 }),
        buildPlayer({ id: 2, teamId: 2, age: 27, devTrait: 'Normal' }),
        buildPlayer({ id: 3, teamId: 3, age: 33 }),
      ];
      const result = processPlayerProgression(players, {
        season: 2030,
        teamCoaches: { 1: HIGH_DEV_STAFF, 2: HIGH_DEV_STAFF, 3: LOW_DEV_STAFF },
      });
      vi.restoreAllMocks();
      return { players, result };
    }

    const first  = runOnce();
    const second = runOnce();

    expect(second.players.map((p) => p.ratings)).toEqual(first.players.map((p) => p.ratings));
    expect(second.players.map((p) => p.ovr)).toEqual(first.players.map((p) => p.ovr));
    expect(second.players.map((p) => p.progressionDelta))
      .toEqual(first.players.map((p) => p.progressionDelta));
    expect(second.result.gainers).toEqual(first.result.gainers);
    expect(second.result.regressors).toEqual(first.result.regressors);
  });
});
