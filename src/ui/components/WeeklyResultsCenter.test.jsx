import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import WeeklyResultsCenter from './WeeklyResultsCenter.jsx';

const league = {
  seasonId: '2026',
  week: 2,
  teams: [
    { id: 1, abbr: 'DAL', name: 'Dallas' },
    { id: 2, abbr: 'PHI', name: 'Philadelphia' },
    { id: 3, abbr: 'NYG', name: 'New York' },
  ],
  schedule: {
    weeks: [
      { week: 1, games: [{ gameId: '2026_w1_1_2', home: 1, away: 2, played: true, homeScore: 21, awayScore: 17, summary: { storyline: 'Turnovers decided it.' } }] },
      { week: 2, games: [
        { gameId: '2026_w2_2_3', home: 2, away: 3, played: true, homeScore: 14, awayScore: 10, summary: { headline: 'Red zone defense sealed it.' } },
        { gameId: '2026_w2_1_3', home: 1, away: 3, status: 'live' },
        { gameId: '2026_w2_1_2', home: 1, away: 2, played: false },
      ] },
    ],
  },
};

describe('WeeklyResultsCenter', () => {
  it('renders completed/live/upcoming groupings and game book affordance', () => {
    const html = renderToString(<WeeklyResultsCenter league={league} initialWeek={2} onGameSelect={() => {}} />);
    expect(html).toContain('Completed');
    expect(html).toContain('In progress');
    expect(html).toContain('Upcoming');
    expect(html).toContain('Open Game Book');
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
});
