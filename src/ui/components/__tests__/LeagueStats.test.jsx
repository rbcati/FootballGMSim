/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeagueStats from '../LeagueStats.jsx';

describe('LeagueStats', () => {
  it('renders team rankings rows from completed-game teamStats', () => {
    const league = {
      seasonId: 's1',
      week: 1,
      teams: [
        { id: 1, name: 'AAA', abbr: 'AAA' },
        { id: 2, name: 'BBB', abbr: 'BBB' },
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
                homeScore: 24,
                awayScore: 10,
                teamStats: {
                  home: { passYd: 220, rushYd: 80, sacks: 3, sacksAllowed: 1, giveaways: 1, takeaways: 2 },
                  away: { passYd: 150, rushYd: 60, sacks: 1, sacksAllowed: 3, giveaways: 2, takeaways: 1 },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <LeagueStats
        league={league}
        onPlayerSelect={() => {}}
        onTeamSelect={() => {}}
      />,
    );

    // Offense rankings should include AAA with visible PF/PPG context.
    expect(screen.getByText('League Stats')).toBeTruthy();
    expect(screen.getByText(/AAA/)).toBeTruthy();
  });
});

