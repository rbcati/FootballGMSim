import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import WeeklyResultsCenter from './WeeklyResultsCenter.jsx';
import { buildWeeklyLeagueRecap } from '../utils/weeklyLeagueRecap.js';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';

const league = {
  seasonId: '2026',
  week: 2,
  teams: [
    { id: 1, abbr: 'DAL', name: 'Dallas', conf: 1, div: 0 },
    { id: 2, abbr: 'PHI', name: 'Philadelphia', conf: 1, div: 0 },
    { id: 3, abbr: 'NYG', name: 'New York', conf: 1, div: 0 },
    { id: 4, abbr: 'WSH', name: 'Washington', conf: 1, div: 0 },
    { id: 5, abbr: 'BUF', name: 'Buffalo', conf: 0, div: 0 },
    { id: 6, abbr: 'KC', name: 'Kansas City', conf: 0, div: 1 },
    { id: 7, abbr: 'MIA', name: 'Miami', conf: 0, div: 0 },
    { id: 8, abbr: 'NE', name: 'New England', conf: 0, div: 0 },
  ],
  schedule: {
    weeks: [
      { week: 1, games: [
        { gameId: '2026_w1_1_2', home: 1, away: 2, played: true, homeScore: 21, awayScore: 17, summary: { storyline: 'Turnovers decided it.' } },
        { gameId: '2026_w1_3_4', home: 3, away: 4, played: true, homeScore: 24, awayScore: 14 },
        { gameId: '2026_w1_5_6', home: 5, away: 6, played: true, homeScore: 20, awayScore: 23 },
        { gameId: '2026_w1_7_8', home: 7, away: 8, played: true, homeScore: 13, awayScore: 10 },
      ] },
      { week: 2, games: [
        { gameId: '2026_w2_2_3', home: 2, away: 3, played: true, homeScore: 14, awayScore: 10, summary: { headline: 'Red zone defense sealed it.' }, quarterScores: { home: [0, 7, 0, 7], away: [3, 0, 7, 0] } },
        { gameId: '2026_w2_1_4', home: 1, away: 4, played: true, homeScore: 20, awayScore: 21, summary: { storyline: 'Game-winning drive in final minute.' }, quarterScores: { home: [7, 3, 7, 3], away: [7, 7, 0, 7] } },
        { gameId: '2026_w2_5_7', home: 5, away: 7, played: true, homeScore: 27, awayScore: 17 },
        { gameId: '2026_w2_6_8', home: 6, away: 8, status: 'live' },
        { gameId: '2026_w2_1_2', home: 1, away: 2, played: false },
      ] },
    ],
  },
};

describe('WeeklyResultsCenter', () => {
  it('renders weekly recap, race center, spotlight, and game groupings', () => {
    const html = renderToString(<WeeklyResultsCenter league={league} initialWeek={2} onGameSelect={() => {}} />);
    expect(html).toContain('Weekly League Recap');
    expect(html).toContain('Race center');
    expect(html).toContain('Weekly Spotlight');
    expect(html).toContain('Completed');
    expect(html).toContain('In progress');
    expect(html).toContain('Upcoming');
    expect(html).toContain('Open spotlight');
  });

  it('is safe for older partial payloads with score-only games', () => {
    const legacyLeague = {
      ...league,
      schedule: { weeks: [{ week: 3, games: [{ gameId: '2026_w3_1_2', home: 1, away: 2, played: true, homeScore: 7, awayScore: 3 }] }] },
    };
    const html = renderToString(<WeeklyResultsCenter league={legacyLeague} initialWeek={3} onGameSelect={() => {}} />);
    expect(html).toContain('DAL won by 4 (3-7).');
    expect(html).toContain('Archive unavailable');
  });

  it('routes spotlight game records through current game book open helper', () => {
    const recap = buildWeeklyLeagueRecap(league, { week: 2 });
    const onGameSelect = vi.fn();
    const opened = openResolvedBoxScore(recap.spotlights[0].game, { seasonId: league.seasonId, week: 2, source: 'test_spotlight' }, onGameSelect);

    expect(opened).toBe(true);
    expect(onGameSelect).toHaveBeenCalledTimes(1);
    expect(onGameSelect.mock.calls[0][0]).toMatch(/2026_w2_/);
  });
});
