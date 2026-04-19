import { describe, expect, it } from 'vitest';
import { deriveGamePlanMultipliers, getGamePlanSynergySummary } from '../sim/gamePlanMultipliers.ts';

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
});
