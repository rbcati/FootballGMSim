import { describe, expect, it } from 'vitest';
import { deriveBlitzStrategy, deriveGamePlanMultipliers, getGamePlanSynergySummary, normalizeBlitzFrequency } from '../sim/gamePlanMultipliers.ts';

describe('gamePlanMultipliers', () => {
  it('applies pass synergy for weak secondary with pass-heavy plan', () => {
    const multipliers = deriveGamePlanMultipliers({
      weeklyPrepState: {
        insights: { weakSecondary: true },
        completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
        hasTracking: true,
      },
      gamePlan: { runPassBalance: 70, deepShortBalance: 58, aggressionLevel: 55 },
      teamContext: { hasBlockingLineupIssue: false, majorInjuryStress: false },
    });

    expect(multipliers.passSuccessDelta).toBeGreaterThan(0);
    expect(multipliers.rushSuccessDelta).toBe(0);
    expect(multipliers.activeReasons.join(' ')).toContain('Pass Attack Edge');
  });

  it('does not grant pass synergy when weak secondary meets run-heavy plan', () => {
    const multipliers = deriveGamePlanMultipliers({
      weeklyPrepState: {
        insights: { weakSecondary: true },
        completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
        hasTracking: true,
      },
      gamePlan: { runPassBalance: 30 },
      teamContext: { hasBlockingLineupIssue: false, majorInjuryStress: false },
    });

    expect(multipliers.passSuccessDelta).toBe(0);
    expect(multipliers.activeReasons.join(' ')).not.toContain('Pass Attack Edge');
  });

  it('penalizes skipped injury review when injury stress is active', () => {
    const multipliers = deriveGamePlanMultipliers({
      weeklyPrepState: {
        insights: {},
        completion: { injuriesReviewed: false, lineupChecked: true, opponentScouted: true, planReviewed: true },
        hasTracking: true,
      },
      gamePlan: { runPassBalance: 50 },
      teamContext: { hasBlockingLineupIssue: false, majorInjuryStress: true },
    });

    expect(multipliers.turnoverAvoidanceDelta).toBeLessThan(0);
    expect(multipliers.chemistryPenalty).toBeLessThan(0);
    expect(multipliers.activeReasons.join(' ')).toContain('Injury Review Missing');
  });

  it('penalizes invalid lineup more than missed checkbox-only prep', () => {
    const checkboxOnly = deriveGamePlanMultipliers({
      weeklyPrepState: {
        insights: {},
        completion: { lineupChecked: false, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
        hasTracking: true,
      },
      teamContext: { hasBlockingLineupIssue: false, majorInjuryStress: false },
    });

    const invalidLineup = deriveGamePlanMultipliers({
      weeklyPrepState: {
        insights: {},
        completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
        hasTracking: true,
      },
      teamContext: { hasBlockingLineupIssue: true, majorInjuryStress: false },
    });

    expect(Math.abs(invalidLineup.netImpact)).toBeGreaterThan(Math.abs(checkboxOnly.netImpact));
  });

  it('is deterministic and safe with partial missing state', () => {
    const input = {
      weeklyPrepState: {
        insights: { balancedMatchup: true },
      },
      gamePlan: { runPassBalance: 80 },
      teamContext: {},
    };

    const one = deriveGamePlanMultipliers(input);
    const two = deriveGamePlanMultipliers(input);

    expect(one).toEqual(two);

    const summary = getGamePlanSynergySummary(one);
    expect(['Ready', 'Minor risk', 'Major risk']).toContain(summary.status);
  });

  it('preserves the legacy neutral, deliberate zero, valid maximum, and safe bounds', () => {
    expect(normalizeBlitzFrequency(undefined)).toBe(30);
    expect(normalizeBlitzFrequency(Number.NaN)).toBe(30);
    expect(normalizeBlitzFrequency(0)).toBe(0);
    expect(normalizeBlitzFrequency(100)).toBe(100);
    expect(normalizeBlitzFrequency(-40)).toBe(0);
    expect(normalizeBlitzFrequency(240)).toBe(100);
  });

  it('models blitzing as bounded pressure with coverage and explosive risk, not a flat bonus', () => {
    const low = deriveBlitzStrategy(0);
    const neutral = deriveBlitzStrategy(30);
    const high = deriveBlitzStrategy(100);

    expect(low.blitzPressureDelta).toBeLessThan(neutral.blitzPressureDelta);
    expect(low.blitzCoverageExposureDelta).toBeLessThan(neutral.blitzCoverageExposureDelta);
    expect(high.blitzPressureDelta).toBeGreaterThan(neutral.blitzPressureDelta);
    expect(high.blitzCoverageExposureDelta).toBeGreaterThan(0);
    expect(high.blitzExplosiveRiskDelta).toBeGreaterThan(0);
    expect(high.blitzCoverageExposureDelta + high.blitzExplosiveRiskDelta)
      .toBeGreaterThan(high.blitzPressureDelta);
  });
});
