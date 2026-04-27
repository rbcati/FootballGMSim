import { describe, expect, it } from 'vitest';
import { buildWeeklyPrepScreenModel } from './weeklyPrepScreenModel.js';

const league = {
  year: 2028,
  week: 6,
  seasonId: 's-2028',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'Bears',
      abbr: 'CHI',
      wins: 4,
      losses: 1,
      ovr: 85,
      offenseRating: 84,
      defenseRating: 82,
      roster: [
        { id: 11, pos: 'QB', ovr: 86, teamId: 1, depthChart: { rowKey: 'QB' } },
        { id: 12, pos: 'RB', ovr: 80, teamId: 1, injuredWeeks: 3, depthChart: { rowKey: 'RB' } },
      ],
    },
    {
      id: 2,
      name: 'Lions',
      abbr: 'DET',
      wins: 2,
      losses: 3,
      ovr: 80,
      offenseRating: 87,
      defenseRating: 74,
      ptsFor: 110,
      ptsAgainst: 145,
      roster: [],
    },
  ],
  schedule: {
    weeks: [{ week: 6, games: [{ id: 'g6', home: { id: 1 }, away: { id: 2 }, played: false }] }],
  },
};

describe('weeklyPrepScreenModel', () => {
  it('derives matchup headline, readiness status, and routed priority actions', () => {
    const model = buildWeeklyPrepScreenModel({ league });
    expect(model.matchupHeadline).toContain('Home matchup');
    expect(['Needs Attention', 'Major Risk', 'Ready to Advance']).toContain(model.readinessStatus);
    expect(model.priorityActions.length).toBeGreaterThan(0);
    expect(model.priorityActions[0].route).toBeTruthy();
    expect(model.routeTargets.lineup).toBe('Team:Roster / Depth');
  });

  it('has safe fallback when opponent/schedule are missing', () => {
    const model = buildWeeklyPrepScreenModel({ league: { year: 2028, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Legacy', roster: [] }], schedule: { weeks: [] } } });
    expect(model.matchupHeadline).toContain('No opponent locked yet');
    expect(model.week).toBe(1);
    expect(model.recommendedNextAction.route).toBeTruthy();
    expect(Array.isArray(model.topPrepTasks)).toBe(true);
  });
});
