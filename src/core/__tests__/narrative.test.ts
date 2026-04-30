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
    expect(recap.toLowerCase()).toContain('weak run-defense');
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

  it('treats readiness penalty active as warning language', () => {
    const recap = buildGamePlanNarrative({
      activeReasons: ['Readiness Penalty Active: no scouting support this week.'],
      chemistryPenalty: -0.04,
    }, { homeScore: 17, awayScore: 20 });
    expect(recap.toLowerCase()).toContain('warning');
    expect(recap.toLowerCase()).not.toContain('alignment helped execution');
  });

  it('treats injury stress is active as warning language', () => {
    const recap = buildGamePlanNarrative({
      activeReasons: ['Injury stress is active in pass protection.'],
    }, { homeScore: 24, awayScore: 27 });
    expect(recap.toLowerCase()).toContain('warning');
    expect(recap.toLowerCase()).not.toContain('alignment helped execution');
  });

  it('supports direct leader payload shape from gameSummary categories', () => {
    const recap = buildGamePlanNarrative({
      activeReasons: ['Pass Attack Edge: pass-heavy script against soft coverage.'],
    }, {
      topPasser: { name: 'QB One', passYd: 312, passTD: 3, interceptions: 1 },
    });
    expect(recap).toContain('312 passing yards');
    expect(recap).toContain('3 pass TD');
    expect(recap).toContain('1 INT');
  });
});
