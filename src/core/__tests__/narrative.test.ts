import { describe, expect, it } from 'vitest';
import { deriveGamePlanMultipliers } from '../sim/gamePlanMultipliers.ts';
import { buildGamePlanNarrative } from '../narrative.js';

describe('buildGamePlanNarrative', () => {
  it('mentions run advantage when scouting and plan align', () => {
    const multipliers = deriveGamePlanMultipliers({
      weeklyPrepState: { insights: { weakRunDefense: true }, hasTracking: true, completion: { planReviewed: true, lineupChecked: true, injuriesReviewed: true, opponentScouted: true } },
      gamePlan: { runPassBalance: 35 },
    });
    const recap = buildGamePlanNarrative(multipliers, { homeScore: 24, awayScore: 17, topRusher: { name: 'RB One', yards: 150 } });
    expect(recap.toLowerCase()).toContain('run-heavy');
    expect(recap.toLowerCase()).toContain('weak run defense');
  });

  it('mentions chemistry warning for extreme unsupported plan', () => {
    const multipliers = deriveGamePlanMultipliers({
      weeklyPrepState: { insights: { balancedMatchup: true }, hasTracking: true, completion: { planReviewed: true, lineupChecked: true, injuriesReviewed: true, opponentScouted: true } },
      gamePlan: { runPassBalance: 80 },
    });
    const recap = buildGamePlanNarrative(multipliers, { homeScore: 13, awayScore: 20 });
    expect(recap.toLowerCase()).toContain('warning');
    expect(recap.toLowerCase()).toContain('chemistry');
  });
});

