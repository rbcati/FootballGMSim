/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeagueLeaders from '../LeagueLeaders.jsx';

describe('LeagueLeaders', () => {
  it('renders non-zero leaders from completed-game stats when API categories are missing', () => {
    const league = {
      userTeamId: 1,
      teams: [
        {
          id: 1,
          name: 'AAA',
          abbr: 'AAA',
          roster: [],
        },
        {
          id: 2,
          name: 'BBB',
          abbr: 'BBB',
          roster: [],
        },
      ],
      schedule: {
        weeks: [
          {
            week: 1,
            games: [
              {
                played: true,
                homeId: 1,
                awayId: 2,
                homeScore: 28,
                awayScore: 14,
                playerStats: {
                  home: {
                    101: {
                      name: 'QB Leader',
                      pos: 'QB',
                      stats: { passYd: 320, passTD: 3, passComp: 24, passAtt: 33 },
                    },
                  },
                  away: {},
                },
              },
            ],
          },
        ],
      },
    };

    const actions = {
      getLeagueLeaders: () => Promise.resolve({ payload: { categories: null, source: null, phase: null } }),
    };

    render(
      <LeagueLeaders
        league={league}
        actions={actions}
        onPlayerSelect={() => {}}
        onNavigate={() => {}}
      />,
    );

    // Wait for initial render using a simple presence check; the top leader should be our QB
    expect(screen.getByText('QB Leader')).toBeTruthy();
  });
});

