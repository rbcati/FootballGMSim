import { describe, expect, it } from 'vitest';
import { buildGamePlanImpact } from './gamePlanImpact.js';

const baseTeam = { id: 1, abbr: 'CHI', offenseRating: 84, defenseRating: 84, roster: [] };
const baseOpponent = { id: 2, abbr: 'DET', offenseRating: 84, defenseRating: 84 };

function buildInput(overrides = {}) {
  return {
    league: { week: 8, ...overrides.league },
    team: { ...baseTeam, ...(overrides.team ?? {}) },
    nextGame: overrides.hasOwnProperty('nextGame')
      ? overrides.nextGame
      : { isHome: true, opp: { ...baseOpponent, ...(overrides.opponent ?? {}) } },
    prep: { lineupIssues: [], ...(overrides.prep ?? {}) },
  };
}

describe('buildGamePlanImpact', () => {
  it('handles no opponent fallback safely', () => {
    const result = buildGamePlanImpact(buildInput({ nextGame: null }));
    expect(result.recommendedAdjustments.length).toBeGreaterThanOrEqual(2);
    expect(result.summary).toMatch(/no matchup lock yet/i);
  });

  it('uses balanced messaging on equal ratings', () => {
    const result = buildGamePlanImpact(buildInput());
    expect(result.recommendedAdjustments[0].explanation).toMatch(/tightly matched/i);
    expect(result.riskLevel).toBe('low');
  });

  it('flags user offense edge', () => {
    const result = buildGamePlanImpact(buildInput({ team: { offenseRating: 90 }, opponent: { defenseRating: 80 } }));
    expect(result.recommendedAdjustments[0].explanation).toMatch(/your offense has the edge/i);
  });

  it('flags opponent defense edge', () => {
    const result = buildGamePlanImpact(buildInput({ team: { offenseRating: 79 }, opponent: { defenseRating: 88 } }));
    expect(result.recommendedAdjustments[0].explanation).toMatch(/their defense has the edge/i);
  });

  it('flags opponent offense pressure point', () => {
    const result = buildGamePlanImpact(buildInput({ team: { defenseRating: 78 }, opponent: { offenseRating: 88 } }));
    const defensiveCard = result.recommendedAdjustments.find((item) => item.title === 'Defensive Priority');
    expect(defensiveCard.explanation).toMatch(/opponent offense is the pressure point/i);
  });

  it('adds lineup risk adjustment when injuries are present', () => {
    const result = buildGamePlanImpact(buildInput({ prep: { lineupIssues: [{ label: 'Injury replacement required' }] } }));
    expect(result.recommendedAdjustments.some((item) => item.title === 'Lineup Risk')).toBe(true);
  });

  it('adds late-season pressure card when applicable', () => {
    const result = buildGamePlanImpact(buildInput({ league: { week: 14 } }));
    expect(result.recommendedAdjustments.some((item) => item.title === 'Late-Season Pressure')).toBe(true);
  });
});
