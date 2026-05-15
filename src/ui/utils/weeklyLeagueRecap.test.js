import { describe, expect, it } from 'vitest';
import { buildWeeklyLeagueRecap } from './weeklyLeagueRecap.js';

const league = {
  seasonId: '2026',
  week: 6,
  teams: [
    { id: 1, abbr: 'BUF', conf: 0, div: 0 },
    { id: 2, abbr: 'KC', conf: 0, div: 1 },
    { id: 3, abbr: 'MIA', conf: 0, div: 0 },
    { id: 4, abbr: 'NE', conf: 0, div: 0 },
    { id: 5, abbr: 'DAL', conf: 1, div: 0 },
    { id: 6, abbr: 'PHI', conf: 1, div: 0 },
    { id: 7, abbr: 'SF', conf: 1, div: 1 },
    { id: 8, abbr: 'DET', conf: 1, div: 1 },
  ],
  schedule: {
    weeks: [
      { week: 1, games: [
        { gameId: '2026_w1_1_2', home: 1, away: 2, played: true, homeScore: 24, awayScore: 21 },
        { gameId: '2026_w1_3_4', home: 3, away: 4, played: true, homeScore: 20, awayScore: 10 },
        { gameId: '2026_w1_5_6', home: 5, away: 6, played: true, homeScore: 28, awayScore: 17 },
        { gameId: '2026_w1_7_8', home: 7, away: 8, played: true, homeScore: 27, awayScore: 24 },
      ] },
      { week: 2, games: [
        { gameId: '2026_w2_2_3', home: 2, away: 3, played: true, homeScore: 17, awayScore: 14 },
        { gameId: '2026_w2_1_4', home: 1, away: 4, played: true, homeScore: 31, awayScore: 13 },
        { gameId: '2026_w2_6_7', home: 6, away: 7, played: true, homeScore: 30, awayScore: 27 },
        { gameId: '2026_w2_8_5', home: 8, away: 5, played: true, homeScore: 21, awayScore: 20 },
      ] },
      { week: 6, games: [
        { gameId: '2026_w6_2_1', home: 2, away: 1, played: true, homeScore: 20, awayScore: 21, summary: { storyline: 'Late fourth-down stop.' }, quarterScores: { home: [7, 3, 7, 3], away: [3, 7, 7, 4] } },
        { gameId: '2026_w6_3_4', home: 3, away: 4, played: true, homeScore: 28, awayScore: 10 },
        { gameId: '2026_w6_6_5', home: 6, away: 5, played: true, homeScore: 24, awayScore: 27, quarterScores: { home: [3, 7, 7, 7, 0], away: [7, 3, 10, 4, 3] } },
        { gameId: '2026_w6_8_7', home: 8, away: 7, played: true, homeScore: 23, awayScore: 17 },
      ] },
    ],
  },
};

describe('weeklyLeagueRecap', () => {
  it('generates deterministic league bullets and spotlight ordering', () => {
    const a = buildWeeklyLeagueRecap(league, { week: 6 });
    const b = buildWeeklyLeagueRecap(league, { week: 6 });

    expect(a.bullets.length).toBeGreaterThanOrEqual(3);
    expect(a.bullets).toEqual(b.bullets);
    expect(a.spotlights.map((row) => row.key)).toEqual(b.spotlights.map((row) => row.key));
  });

  it('handles partial season payloads without crashing', () => {
    const partial = buildWeeklyLeagueRecap({ teams: [{ id: 1, abbr: 'BUF', conf: 0 }], schedule: { weeks: [{ week: 1, games: [{ home: 1, away: 2, played: true, homeScore: 10, awayScore: 7 }] }] } }, { week: 1 });
    expect(partial.bullets.length).toBeGreaterThan(0);
    expect(Array.isArray(partial.trajectories)).toBe(true);
  });
});
