import { describe, expect, it, vi } from 'vitest';
import { buildTrainingPlanModel } from './trainingPlanModel.js';

const baseLeague = {
  year: 2028,
  seasonId: 's2028',
  week: 4,
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      abbr: 'CHI',
      ovr: 82,
      offenseRating: 81,
      defenseRating: 83,
      weeklyDevelopmentFocus: { stamp: 's2028:4' },
      roster: [
        { id: 1, name: 'Young QB', pos: 'QB', age: 22, ovr: 71, potential: 84, progressionDelta: 2, schemeFit: 80, teamId: 1 },
        { id: 2, name: 'Vet RB', pos: 'RB', age: 30, ovr: 78, potential: 79, progressionDelta: -1, schemeFit: 52, teamId: 1 },
        { id: 3, name: 'WR Prospect', pos: 'WR', age: 23, ovr: 69, potential: 82, progressionDelta: 3, schemeFit: 77, teamId: 1 },
        { id: 4, name: 'Injured CB', pos: 'CB', age: 25, ovr: 74, potential: 78, injuryWeeksRemaining: 1, schemeFit: 62, teamId: 1 },
      ],
    },
    { id: 2, abbr: 'DET', ovr: 80, offenseRating: 84, defenseRating: 76, roster: [] },
  ],
  schedule: {
    weeks: [{ week: 4, games: [{ played: false, home: { id: 1 }, away: { id: 2 } }] }],
  },
};

describe('trainingPlanModel', () => {
  it('builds weekly practice model defaults', () => {
    const model = buildTrainingPlanModel({ league: baseLeague, intensity: 'normal', drillsRun: 1, actions: { conductDrill: vi.fn() } });
    expect(model.phaseLabel).toBe('Weekly Practice');
    expect(model.drillsRemaining).toBe(0);
    expect(model.usedThisWeek).toBe(true);
    expect(model.practiceLocked).toBe(true);
    expect(model.practiceStateLabel).toMatch(/already logged/i);
  });

  it('supports preseason training camp limits', () => {
    const model = buildTrainingPlanModel({ league: { ...baseLeague, phase: 'preseason' }, drillsRun: 0 });
    expect(model.phaseLabel).toBe('Training Camp');
    expect(model.maxDrills).toBe(5);
    expect(model.usedThisWeek).toBe(false);
    expect(model.drillsRemaining).toBe(5);
  });

  it('handles empty roster safely', () => {
    const model = buildTrainingPlanModel({ league: { ...baseLeague, roster: [], teams: [{ id: 1, abbr: 'CHI', roster: [] }], schedule: { weeks: [] } } });
    expect(model.roster).toEqual([]);
    expect(model.developmentCandidates).toEqual([]);
    expect(model.matchupTrainingNote).toMatch(/No locked opponent/i);
  });

  it('returns recommended focus groups and ranked development candidates', () => {
    const model = buildTrainingPlanModel({ league: baseLeague });
    expect(model.recommendedFocus.length).toBeGreaterThanOrEqual(1);
    expect(model.recommendedFocus[0]).toHaveProperty('groupId');
    expect(model.developmentCandidates.map((p) => p.name)).toContain('Young QB');
    expect(model.developmentCandidates[0].score).toBeGreaterThanOrEqual(model.developmentCandidates[1].score);
  });
});
