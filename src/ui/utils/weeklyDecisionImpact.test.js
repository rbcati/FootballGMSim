import { describe, expect, it } from 'vitest';
import { buildWeeklyDecisionImpact } from './weeklyDecisionImpact.js';

const baseLeague = {
  seasonId: '2026',
  year: 2026,
  week: 6,
  userTeamId: 1,
  teams: [
    {
      id: 1,
      abbr: 'DAL',
      roster: [
        { id: 11, name: 'QB One', injuryWeeksRemaining: 0 },
        { id: 12, name: 'LT One', injuryWeeksRemaining: 0 },
      ],
      strategies: {
        offPlanId: 'BALANCED',
        gamePlan: { runPassBalance: 58, aggressionLevel: 47 },
      },
      weeklyDevelopmentFocus: {
        stamp: '2026:5',
        positionGroups: ['qb'],
      },
    },
  ],
};

describe('buildWeeklyDecisionImpact', () => {
  it('derives a compact review for a win with strategy and training context', () => {
    const result = buildWeeklyDecisionImpact({
      league: baseLeague,
      userTeam: baseLeague.teams[0],
      lastGame: {
        gameId: '2026_w5_1_2',
        week: 5,
        home: { id: 1, abbr: 'DAL' },
        away: { id: 2, abbr: 'PHI' },
        homeScore: 27,
        awayScore: 17,
        teamStats: {
          home: { successRate: 0.51, totalYards: 365 },
          away: { successRate: 0.38, totalYards: 248 },
        },
      },
    });

    expect(result.resultSummary).toContain('W 27-17 vs PHI');
    expect(result.bullets.join(' ')).toContain('Game plan was saved before kickoff');
    expect(result.bullets.join(' ')).toContain('Practice effects were logged this week');
    expect(result.metadata.hasTeamStats).toBe(true);
  });

  it('derives a loss review and recommends game plan changes after low output', () => {
    const result = buildWeeklyDecisionImpact({
      league: baseLeague,
      userTeam: baseLeague.teams[0],
      lastGame: {
        gameId: '2026_w5_2_1',
        week: 5,
        home: { id: 2, abbr: 'PHI' },
        away: { id: 1, abbr: 'DAL' },
        homeScore: 24,
        awayScore: 13,
      },
    });

    expect(result.resultSummary).toContain('L 13-24 @ PHI');
    expect(result.bullets[0]).toMatch(/low offensive output|offensive output/i);
    expect(result.recommendedAction.route).toBe('Game Plan');
  });

  it('falls back safely when box score team stats are missing', () => {
    const result = buildWeeklyDecisionImpact({
      league: baseLeague,
      userTeam: baseLeague.teams[0],
      lastGame: {
        gameId: '2026_w5_2_1',
        week: 5,
        home: { id: 2, abbr: 'PHI' },
        away: { id: 1, abbr: 'DAL' },
        homeScore: 17,
        awayScore: 17,
      },
    });

    expect(result.metadata.hasTeamStats).toBe(false);
    expect(result.bullets.length).toBeGreaterThan(1);
    expect(result.resultSummary).toContain('T 17-17');
  });

  it('returns no-game fallback when no user game is available', () => {
    const result = buildWeeklyDecisionImpact({
      league: baseLeague,
      userTeam: baseLeague.teams[0],
      lastGame: null,
    });

    expect(result.resultSummary).toContain('No completed user game available yet');
    expect(result.recommendedAction.route).toBe('Weekly Prep');
  });
});
