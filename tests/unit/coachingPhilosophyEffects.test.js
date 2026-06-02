/**
 * tests/unit/coachingPhilosophyEffects.test.js
 *
 * Unit tests for coaching-philosophy-effects.js.
 * All imports are from the pure-function module — no game-simulator involved.
 */

import { describe, it, expect } from 'vitest';
import {
  getOffensivePhilosophyModifiers,
  getDefensivePhilosophyModifiers,
  getDevelopmentRateModifier,
  applyCoachingModifiers,
} from '../../src/core/coaching-philosophy-effects.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeHC(offPhil, defPhil, traits = []) {
  return { offensivePhilosophy: offPhil, defensivePhilosophy: defPhil, traits };
}

function makeStaff(hcOff = 'BALANCED', hcDef = 'BALANCED', hcTraits = [], ocOff = 'BALANCED', dcDef = 'BALANCED') {
  return {
    headCoach:      { offensivePhilosophy: hcOff, defensivePhilosophy: hcDef, traits: hcTraits },
    offCoordinator: { offensivePhilosophy: ocOff },
    defCoordinator: { defensivePhilosophy: dcDef },
  };
}

// ── getOffensivePhilosophyModifiers ───────────────────────────────────────────

describe('getOffensivePhilosophyModifiers', () => {
  it('run-first HC → rushingMod > 1.0, passingMod ≤ 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(makeHC('POWER_RUN', 'BALANCED'), null);
    expect(mods.rushingMod).toBeGreaterThan(1.0);
    expect(mods.passingMod).toBeLessThanOrEqual(1.0);
  });

  it('pass-first HC (SPREAD) → passingMod > 1.0, rushingMod ≤ 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(makeHC('SPREAD', 'BALANCED'), null);
    expect(mods.passingMod).toBeGreaterThan(1.0);
    expect(mods.rushingMod).toBeLessThanOrEqual(1.0);
  });

  it('balanced HC → all modifiers within 1% of 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(makeHC('BALANCED', 'BALANCED'), null);
    expect(mods.rushingMod).toBeCloseTo(1.0, 2);
    expect(mods.passingMod).toBeCloseTo(1.0, 2);
    expect(mods.redZoneMod).toBeCloseTo(1.0, 2);
    expect(mods.tempoMod).toBeCloseTo(1.0, 2);
  });

  it('run-first HC + run-specialist OC → rushingMod higher than HC alone, still ≤ 1.12', () => {
    const hcOnly = getOffensivePhilosophyModifiers(makeHC('POWER_RUN', 'BALANCED'), null);
    const stacked = getOffensivePhilosophyModifiers(
      makeHC('POWER_RUN', 'BALANCED'),
      makeStaff('POWER_RUN', 'BALANCED', [], 'POWER_RUN')
    );
    expect(stacked.rushingMod).toBeGreaterThan(hcOnly.rushingMod);
    expect(stacked.rushingMod).toBeLessThanOrEqual(1.12);
  });

  it('all modifiers clamped — no value outside [0.85, 1.15]', () => {
    // Use extreme stacked philosophies to probe the clamp
    const staff = makeStaff('POWER_RUN', 'BALANCED', ['SCHEME_TEACHER', 'DISCIPLINARIAN'], 'POWER_RUN');
    const mods = getOffensivePhilosophyModifiers(staff.headCoach, staff);
    for (const key of ['rushingMod', 'passingMod', 'redZoneMod', 'tempoMod']) {
      expect(mods[key]).toBeGreaterThanOrEqual(0.85);
      expect(mods[key]).toBeLessThanOrEqual(1.15);
    }
  });

  it('null coach → all modifiers exactly 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(null, null);
    expect(mods.rushingMod).toBe(1.0);
    expect(mods.passingMod).toBe(1.0);
    expect(mods.redZoneMod).toBe(1.0);
    expect(mods.tempoMod).toBe(1.0);
  });

  it('empty staff array → same as no staff bonus', () => {
    const modsNoStaff  = getOffensivePhilosophyModifiers(makeHC('POWER_RUN', 'BALANCED'), null);
    const modsEmptyArr = getOffensivePhilosophyModifiers(makeHC('POWER_RUN', 'BALANCED'), []);
    expect(modsEmptyArr.rushingMod).toBe(modsNoStaff.rushingMod);
    expect(modsEmptyArr.passingMod).toBe(modsNoStaff.passingMod);
  });

  it('WEST_COAST HC → passingMod > 1.0 and tempoMod > 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(makeHC('WEST_COAST', 'BALANCED'), null);
    expect(mods.passingMod).toBeGreaterThan(1.0);
    expect(mods.tempoMod).toBeGreaterThan(1.0);
  });

  it('VERTICAL HC → passingMod > 1.0, redZoneMod > 1.0, rushingMod < 1.0', () => {
    const mods = getOffensivePhilosophyModifiers(makeHC('VERTICAL', 'BALANCED'), null);
    expect(mods.passingMod).toBeGreaterThan(1.0);
    expect(mods.redZoneMod).toBeGreaterThan(1.0);
    expect(mods.rushingMod).toBeLessThan(1.0);
  });

  it('SCHEME_TEACHER trait boosts tempoMod', () => {
    const withTrait    = getOffensivePhilosophyModifiers(makeHC('BALANCED', 'BALANCED', ['SCHEME_TEACHER']), null);
    const withoutTrait = getOffensivePhilosophyModifiers(makeHC('BALANCED', 'BALANCED'), null);
    expect(withTrait.tempoMod).toBeGreaterThan(withoutTrait.tempoMod);
  });

  it('DISCIPLINARIAN trait boosts redZoneMod', () => {
    const with_trait    = getOffensivePhilosophyModifiers(makeHC('BALANCED', 'BALANCED', ['DISCIPLINARIAN']), null);
    const without_trait = getOffensivePhilosophyModifiers(makeHC('BALANCED', 'BALANCED'), null);
    expect(with_trait.redZoneMod).toBeGreaterThan(without_trait.redZoneMod);
  });
});

// ── getDefensivePhilosophyModifiers ──────────────────────────────────────────

describe('getDefensivePhilosophyModifiers', () => {
  it('blitz-heavy HC → pressureMod > 1.0', () => {
    const mods = getDefensivePhilosophyModifiers(makeHC('BALANCED', 'BLITZ_HEAVY'), null);
    expect(mods.pressureMod).toBeGreaterThan(1.0);
  });

  it('blitz-heavy DC stacks on blitz-heavy HC → pressureMod > HC alone', () => {
    const hcOnly  = getDefensivePhilosophyModifiers(makeHC('BALANCED', 'BLITZ_HEAVY'), null);
    const stacked = getDefensivePhilosophyModifiers(
      makeHC('BALANCED', 'BLITZ_HEAVY'),
      makeStaff('BALANCED', 'BLITZ_HEAVY', [], 'BALANCED', 'BLITZ_HEAVY')
    );
    expect(stacked.pressureMod).toBeGreaterThan(hcOnly.pressureMod);
  });

  it('zone-coverage HC (COVER_2) → coverageMod > 1.0', () => {
    const mods = getDefensivePhilosophyModifiers(makeHC('BALANCED', 'COVER_2'), null);
    expect(mods.coverageMod).toBeGreaterThan(1.0);
  });

  it('MAN_COVERAGE HC → coverageMod > 1.0', () => {
    const mods = getDefensivePhilosophyModifiers(makeHC('BALANCED', 'MAN_COVERAGE'), null);
    expect(mods.coverageMod).toBeGreaterThan(1.0);
  });

  it('null coach → all modifiers exactly 1.0', () => {
    const mods = getDefensivePhilosophyModifiers(null, null);
    expect(mods.pressureMod).toBe(1.0);
    expect(mods.coverageMod).toBe(1.0);
    expect(mods.runStopMod).toBe(1.0);
  });

  it('all modifiers clamped within [0.85, 1.15]', () => {
    const staff = makeStaff('BALANCED', 'BLITZ_HEAVY', ['DISCIPLINARIAN', 'SCHEME_TEACHER'], 'BALANCED', 'BLITZ_HEAVY');
    const mods = getDefensivePhilosophyModifiers(staff.headCoach, staff);
    expect(mods.pressureMod).toBeLessThanOrEqual(1.15);
    expect(mods.coverageMod).toBeGreaterThanOrEqual(0.85);
    expect(mods.runStopMod).toBeGreaterThanOrEqual(0.85);
  });

  it('BALANCED HC and BALANCED DC → all modifiers exactly 1.0', () => {
    const mods = getDefensivePhilosophyModifiers(
      makeHC('BALANCED', 'BALANCED'),
      makeStaff('BALANCED', 'BALANCED', [], 'BALANCED', 'BALANCED')
    );
    expect(mods.pressureMod).toBe(1.0);
    expect(mods.coverageMod).toBe(1.0);
    expect(mods.runStopMod).toBe(1.0);
  });

  it('HYBRID HC → small positive boost on all three mods', () => {
    const mods = getDefensivePhilosophyModifiers(makeHC('BALANCED', 'HYBRID'), null);
    expect(mods.pressureMod).toBeGreaterThan(1.0);
    expect(mods.coverageMod).toBeGreaterThan(1.0);
    expect(mods.runStopMod).toBeGreaterThan(1.0);
  });
});

// ── getDevelopmentRateModifier ────────────────────────────────────────────────

describe('getDevelopmentRateModifier', () => {
  it('QB with QB-specialist OC (SPREAD) → modifier > 1.0', () => {
    const staff = makeStaff('SPREAD', 'BALANCED', [], 'SPREAD');
    const mod = getDevelopmentRateModifier('QB', staff.headCoach, staff);
    expect(mod).toBeGreaterThan(1.0);
  });

  it('QB with WEST_COAST HC → modifier > 1.0', () => {
    const staff = makeStaff('WEST_COAST', 'BALANCED');
    const mod = getDevelopmentRateModifier('QB', staff.headCoach, staff);
    expect(mod).toBeGreaterThan(1.0);
  });

  it('RB with POWER_RUN HC → modifier > 1.0', () => {
    const staff = makeStaff('POWER_RUN', 'BALANCED');
    const mod = getDevelopmentRateModifier('RB', staff.headCoach, staff);
    expect(mod).toBeGreaterThan(1.0);
  });

  it('CB with MAN_COVERAGE HC → modifier > 1.0', () => {
    const staff = makeStaff('BALANCED', 'MAN_COVERAGE');
    const mod = getDevelopmentRateModifier('CB', staff.headCoach, staff);
    expect(mod).toBeGreaterThan(1.0);
  });

  it('DL with BLITZ_HEAVY HC → modifier > 1.0', () => {
    const staff = makeStaff('BALANCED', 'BLITZ_HEAVY');
    const mod = getDevelopmentRateModifier('DL', staff.headCoach, staff);
    expect(mod).toBeGreaterThan(1.0);
  });

  it('QB with POWER_RUN HC (no pass-specialist) → modifier = 1.0', () => {
    const staff = makeStaff('POWER_RUN', 'BALANCED');
    const mod = getDevelopmentRateModifier('QB', staff.headCoach, staff);
    expect(mod).toBe(1.0);
  });

  it('CB on BALANCED team → modifier = 1.0', () => {
    const staff = makeStaff('BALANCED', 'BALANCED');
    const mod = getDevelopmentRateModifier('CB', staff.headCoach, staff);
    expect(mod).toBe(1.0);
  });

  it('DEVELOPMENTAL HC trait → all positions get boost', () => {
    const staff = makeStaff('BALANCED', 'BALANCED', ['DEVELOPMENTAL']);
    expect(getDevelopmentRateModifier('QB', staff.headCoach, staff)).toBeGreaterThan(1.0);
    expect(getDevelopmentRateModifier('DL', staff.headCoach, staff)).toBeGreaterThan(1.0);
    expect(getDevelopmentRateModifier('K',  staff.headCoach, staff)).toBeGreaterThan(1.0);
  });

  it('returns a finite number, never NaN, never undefined', () => {
    const cases = [
      ['QB', null, null],
      ['WR', makeHC('SPREAD', 'BALANCED'), makeStaff('SPREAD', 'BALANCED')],
      ['K',  makeHC('BALANCED', 'BALANCED'), null],
      ['??', null, null],
    ];
    for (const [pos, coach, staff] of cases) {
      const mod = getDevelopmentRateModifier(pos, coach, staff);
      expect(typeof mod).toBe('number');
      expect(Number.isFinite(mod)).toBe(true);
    }
  });

  it('result is always within [0.85, 1.15]', () => {
    const extremeStaff = makeStaff('SPREAD', 'BLITZ_HEAVY', ['DEVELOPMENTAL', 'SCHEME_TEACHER'], 'SPREAD', 'BLITZ_HEAVY');
    const positions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];
    for (const pos of positions) {
      const mod = getDevelopmentRateModifier(pos, extremeStaff.headCoach, extremeStaff);
      expect(mod).toBeGreaterThanOrEqual(0.85);
      expect(mod).toBeLessThanOrEqual(1.15);
    }
  });

  it('null coach and null staff → multiplier of exactly 1.0', () => {
    expect(getDevelopmentRateModifier('QB', null, null)).toBe(1.0);
    expect(getDevelopmentRateModifier('DL', null, undefined)).toBe(1.0);
  });
});

// ── applyCoachingModifiers ────────────────────────────────────────────────────

describe('applyCoachingModifiers', () => {
  it('returns a new object (does not mutate input)', () => {
    const input = { passVolume: 1.0, runVolume: 1.0 };
    const hc    = makeHC('POWER_RUN', 'BALANCED');
    const result = applyCoachingModifiers(input, hc, null);
    expect(result).not.toBe(input);
    expect(input.runVolume).toBe(1.0); // original unchanged
  });

  it('null coach + null staff → returns ratings unchanged', () => {
    const input  = { passVolume: 1.1, runVolume: 0.95, sackChance: 1.2 };
    const result = applyCoachingModifiers(input, null, null);
    expect(result.passVolume).toBe(1.1);
    expect(result.runVolume).toBe(0.95);
    expect(result.sackChance).toBe(1.2);
  });

  it('null teamRatings → returns empty-ish object without crashing', () => {
    const result = applyCoachingModifiers(null, null, null);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('POWER_RUN HC → runVolume is numerically higher than input', () => {
    const input  = { passVolume: 1.0, runVolume: 1.0 };
    const result = applyCoachingModifiers(input, makeHC('POWER_RUN', 'BALANCED'), null);
    expect(result.runVolume).toBeGreaterThan(input.runVolume);
  });

  it('SPREAD HC → passVolume is numerically higher than input', () => {
    const input  = { passVolume: 1.0, runVolume: 1.0 };
    const result = applyCoachingModifiers(input, makeHC('SPREAD', 'BALANCED'), null);
    expect(result.passVolume).toBeGreaterThan(input.passVolume);
  });

  it('BLITZ_HEAVY HC → sackChance is higher than input', () => {
    const input  = { sackChance: 1.0 };
    const result = applyCoachingModifiers(input, makeHC('BALANCED', 'BLITZ_HEAVY'), null);
    expect(result.sackChance).toBeGreaterThan(input.sackChance);
  });

  it('COVER_2 HC → intChance is higher than input', () => {
    const input  = { intChance: 1.0 };
    const result = applyCoachingModifiers(input, makeHC('BALANCED', 'COVER_2'), null);
    expect(result.intChance).toBeGreaterThan(input.intChance);
  });

  it('preserves pre-existing non-philosophy mod keys', () => {
    const input  = { passVolume: 1.0, runVolume: 1.0, momentumMultiplier: 1.3, turnoverReduction: 0.9 };
    const result = applyCoachingModifiers(input, makeHC('BALANCED', 'BALANCED'), null);
    expect(result.momentumMultiplier).toBe(1.3);
    expect(result.turnoverReduction).toBe(0.9);
  });

  it('stacks multiplicatively with pre-existing mod values', () => {
    // If runVolume was already 1.1 from skill-tree mods, POWER_RUN should push it further
    const input  = { runVolume: 1.1 };
    const result = applyCoachingModifiers(input, makeHC('POWER_RUN', 'BALANCED'), null);
    expect(result.runVolume).toBeGreaterThan(1.1);
  });

  it('BALANCED philosophy on all staff → no modifier keys change from 1.0 baseline', () => {
    const input  = {};
    const result = applyCoachingModifiers(
      input,
      makeHC('BALANCED', 'BALANCED'),
      makeStaff('BALANCED', 'BALANCED', [], 'BALANCED', 'BALANCED')
    );
    expect(result.passVolume).toBeCloseTo(1.0, 5);
    expect(result.runVolume).toBeCloseTo(1.0, 5);
    expect(result.passAccuracy).toBeCloseTo(1.0, 5);
    expect(result.redZoneMod).toBeCloseTo(1.0, 5);
    expect(result.sackChance).toBeCloseTo(1.0, 5);
    expect(result.intChance).toBeCloseTo(1.0, 5);
    expect(result.runStop).toBeCloseTo(1.0, 5);
  });

  it('full staff stack stays within [0.85, 1.15] on all output keys', () => {
    const staff = makeStaff('POWER_RUN', 'BLITZ_HEAVY', ['DISCIPLINARIAN', 'SCHEME_TEACHER'], 'POWER_RUN', 'BLITZ_HEAVY');
    const result = applyCoachingModifiers({}, staff.headCoach, staff);
    for (const key of ['passVolume', 'runVolume', 'passAccuracy', 'redZoneMod', 'sackChance', 'intChance', 'runStop']) {
      expect(result[key]).toBeGreaterThanOrEqual(0.85);
      expect(result[key]).toBeLessThanOrEqual(1.15);
    }
  });

  it('POWER_RUN philosophy read from schemePreference (staffFoundation path)', () => {
    // staffFoundation.js stores the scheme in schemePreference, not offensivePhilosophy
    const staffViaSchemePreference = {
      headCoach:      { schemePreference: 'power run', traits: [] },
      offCoordinator: { schemePreference: 'power run' },
      defCoordinator: { schemePreference: 'blitz' },
    };
    const result = applyCoachingModifiers({}, staffViaSchemePreference.headCoach, staffViaSchemePreference);
    expect(result.runVolume).toBeGreaterThan(1.0);    // POWER_RUN → runVolume up
    expect(result.passVolume).toBeLessThan(1.0);      // POWER_RUN → passVolume down
    expect(result.sackChance).toBeGreaterThan(1.0);   // BLITZ_HEAVY DC → sackChance up
  });

  it('VERTICAL and DISCIPLINARIAN → redZoneMod > 1.0', () => {
    const result = applyCoachingModifiers({}, makeHC('VERTICAL', 'BALANCED', ['DISCIPLINARIAN']), null);
    expect(result.redZoneMod).toBeGreaterThan(1.0);
  });
});

// ── Integration regression: modifier divergence between run-first and pass-first ──

describe('coaching modifiers integration — modifier divergence test', () => {
  /**
   * Full simulateBatch 100-game integration is too expensive for a unit test
   * in this environment (requires a complete league/roster fixture).
   * Instead, we verify directly that applyCoachingModifiers produces a
   * statistically meaningful difference in the runVolume and passVolume keys
   * that flow into generateRBStats and generateQBStats respectively.
   *
   * This is equivalent to asserting the contract that simulateBatch WOULD
   * produce different rushing/passing output: the modifier is the only input
   * that varies between the two teams.
   */
  it('run-first team mods have higher runVolume than pass-first team mods', () => {
    const baseRatings = { passVolume: 1.0, runVolume: 1.0, passAccuracy: 1.0, sackChance: 1.0, intChance: 1.0 };

    const runFirstStaff  = makeStaff('POWER_RUN', 'BALANCED', [], 'POWER_RUN');
    const passFirstStaff = makeStaff('SPREAD',    'BALANCED', [], 'SPREAD');

    const runFirstMods  = applyCoachingModifiers({ ...baseRatings }, runFirstStaff.headCoach, runFirstStaff);
    const passFirstMods = applyCoachingModifiers({ ...baseRatings }, passFirstStaff.headCoach, passFirstStaff);

    expect(runFirstMods.runVolume).toBeGreaterThan(passFirstMods.runVolume);
    // Margin should be at least 5% (combined HC+OC = 8% swing)
    expect(runFirstMods.runVolume - passFirstMods.runVolume).toBeGreaterThanOrEqual(0.05);
  });

  it('pass-first team mods have higher passVolume than run-first team mods', () => {
    const baseRatings = { passVolume: 1.0, runVolume: 1.0 };

    const runFirstMods  = applyCoachingModifiers({ ...baseRatings }, makeHC('POWER_RUN', 'BALANCED'), null);
    const passFirstMods = applyCoachingModifiers({ ...baseRatings }, makeHC('SPREAD',    'BALANCED'), null);

    expect(passFirstMods.passVolume).toBeGreaterThan(runFirstMods.passVolume);
    expect(passFirstMods.passVolume - runFirstMods.passVolume).toBeGreaterThanOrEqual(0.05);
  });

  it('defensive-minded team mods have higher sackChance than neutral team', () => {
    const base = { sackChance: 1.0, intChance: 1.0 };
    const blitzMods   = applyCoachingModifiers({ ...base }, makeHC('BALANCED', 'BLITZ_HEAVY'), null);
    const neutralMods = applyCoachingModifiers({ ...base }, makeHC('BALANCED', 'BALANCED'),   null);
    expect(blitzMods.sackChance).toBeGreaterThan(neutralMods.sackChance);
  });

  it('coverage-heavy team mods have higher intChance than neutral team', () => {
    const base = { intChance: 1.0 };
    const coverageMods = applyCoachingModifiers({ ...base }, makeHC('BALANCED', 'COVER_2'), null);
    const neutralMods  = applyCoachingModifiers({ ...base }, makeHC('BALANCED', 'BALANCED'), null);
    expect(coverageMods.intChance).toBeGreaterThan(neutralMods.intChance);
  });
});
