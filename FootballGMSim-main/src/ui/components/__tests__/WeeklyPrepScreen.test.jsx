import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';

const league = {
  year: 2027,
  week: 8,
  seasonId: 's8',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'Bears',
      abbr: 'CHI',
      wins: 5,
      losses: 2,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      recentResults: ['W', 'W', 'L', 'W'],
      roster: [{ id: 11, pos: 'QB', ovr: 80, teamId: 1 }],
    },
    {
      id: 2,
      name: 'Lions',
      abbr: 'DET',
      wins: 4,
      losses: 3,
      ovr: 81,
      offenseRating: 85,
      defenseRating: 76,
      recentResults: ['L', 'W', 'W', 'L'],
      roster: [],
    },
  ],
  schedule: {
    weeks: [{ week: 8, games: [{ id: 'g8', home: { id: 1 }, away: { id: 2 }, played: false }] }],
  },
};

describe('WeeklyPrepScreen', () => {
  it('renders prep workflow sections for an upcoming game', () => {
    const html = renderToString(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(html).toContain('Opponent scout');
    expect(html).toContain('Lineup readiness');
    expect(html).toContain('Game plan recommendations');
    expect(html).toContain('Active effects');
    expect(html).toContain('Prep completion');
  });

  it('handles missing matchup data safely', () => {
    const html = renderToString(
      <WeeklyPrepScreen
        league={{ year: 2027, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Legacy', roster: [] }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain('Weekly prep unavailable');
  });
});
