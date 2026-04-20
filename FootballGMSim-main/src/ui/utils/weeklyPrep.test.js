import { describe, expect, it } from 'vitest';
import { deriveWeeklyPrepState, getWeeklyPrepProgress, markWeeklyPrepStep, clearWeeklyPrepForWeek } from './weeklyPrep.js';

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
      recentResults: ['W', 'W', 'L', 'W', 'W'],
      roster: [
        { id: 11, pos: 'QB', ovr: 86, teamId: 1, depthChart: { rowKey: 'QB' } },
        { id: 12, pos: 'RB', ovr: 80, teamId: 1, injuredWeeks: 3, depthChart: { rowKey: 'RB' } },
        { id: 13, pos: 'RB', ovr: 67, teamId: 1 },
        { id: 14, pos: 'WR', ovr: 78, teamId: 1 },
      ],
      strategies: { offSchemeId: 'WEST_COAST' },
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
      recentResults: ['L', 'L', 'W', 'L', 'W'],
      ptsFor: 110,
      ptsAgainst: 145,
      roster: [],
    },
  ],
  schedule: {
    weeks: [
      { week: 6, games: [{ id: 'g6', home: { id: 1 }, away: { id: 2 }, played: false }] },
    ],
  },
};

describe('weeklyPrep', () => {
  it('resets weekly prep progress when week advances', () => {
    const bucket = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => bucket.get(key) ?? null,
        setItem: (key, value) => bucket.set(key, String(value)),
        removeItem: (key) => bucket.delete(key),
      },
    };
    const scopedLeague = { seasonId: 's-reset', week: 3, userTeamId: 1 };
    markWeeklyPrepStep(scopedLeague, 'planReviewed', true);
    expect(getWeeklyPrepProgress(scopedLeague).planReviewed).toBe(true);
    clearWeeklyPrepForWeek(scopedLeague);
    expect(getWeeklyPrepProgress(scopedLeague).planReviewed).toBe(false);
    delete global.window;
  });

  it('builds opponent scout/readiness model from league context', () => {
    const prep = deriveWeeklyPrepState(league);
    expect(prep.opponentSnapshot.record).toBe('2-3');
    expect(prep.opponentStrengths.length).toBeGreaterThan(0);
    expect(prep.opponentWeaknesses.length).toBeGreaterThan(0);
    expect(prep.lineupIssues.length).toBeGreaterThan(0);
    expect(prep.recommendations.length).toBeGreaterThan(0);
    expect(prep.readinessLabel).toContain('remaining');
    expect(prep.prepMultipliers).toBeTruthy();
    expect(Array.isArray(prep.prepSummary.reasons)).toBe(true);
  });

  it('is safe with partial saves and missing opponent data', () => {
    const prep = deriveWeeklyPrepState({
      year: 2028,
      week: 1,
      userTeamId: 1,
      teams: [{ id: 1, name: 'Legacy', roster: [] }],
      schedule: { weeks: [] },
    });

    expect(prep.nextGame).toBeNull();
    expect(prep.recommendations).toEqual([]);
    expect(Array.isArray(prep.lineupIssues)).toBe(true);
    expect(prep.readinessLabel).toContain('remaining');
    expect(prep.prepSummary).toBeTruthy();
  });
});
