/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LeagueStats from '../LeagueStats.jsx';

function makeStatsLeague() {
  return {
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
              id: 'g1',
              played: true,
              homeId: 1,
              awayId: 2,
              homeScore: 24,
              awayScore: 10,
              teamStats: {
                home: { passYd: 220, rushYd: 80, sacks: 3, sacksAllowed: 1, giveaways: 1, takeaways: 2 },
                away: { passYd: 150, rushYd: 60, sacks: 1, sacksAllowed: 3, giveaways: 2, takeaways: 1 },
              },
              playerStats: {
                home: {
                  101: { name: 'Alpha Passer', pos: 'QB', stats: { passYd: 320, passTD: 3, passComp: 24, passAtt: 33 } },
                  102: { name: 'Beta Runner', pos: 'RB', stats: { rushYd: 88, rushAtt: 15, rushTD: 1 } },
                },
                away: {
                  201: { name: 'Gamma Passer', pos: 'QB', stats: { passYd: 180, passTD: 1, passComp: 18, passAtt: 29 } },
                },
              },
            },
          ],
        },
      ],
    },
  };
}

afterEach(() => cleanup());

describe('LeagueStats', () => {
  it('renders team rankings rows from completed-game teamStats', () => {
    render(
      <LeagueStats
        league={makeStatsLeague()}
        onPlayerSelect={() => {}}
        onTeamSelect={() => {}}
      />,
    );

    // Offense rankings should include AAA with visible PF/PPG context.
    expect(screen.getByText('League Stats')).toBeTruthy();
    expect(screen.getAllByText(/^AAA$/).length).toBeGreaterThan(0);
  });

  it('filters player rows by search, position, team, and reset restores the table', () => {
    render(<LeagueStats league={makeStatsLeague()} onPlayerSelect={() => {}} onTeamSelect={() => {}} />);

    expect(screen.getAllByText('Alpha Passer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gamma Passer').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search player stats'), { target: { value: 'Gamma' } });
    const statsTableAfterSearch = within(screen.getByRole('table', { name: 'Player stat table' }));
    expect(statsTableAfterSearch.queryByText('Alpha Passer')).toBeNull();
    expect(statsTableAfterSearch.getByText('Gamma Passer')).toBeTruthy();
    expect(screen.getByText('Showing 1 of 2 players')).toBeTruthy();

    fireEvent.click(screen.getByText('Reset filters'));
    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'AAA' } });
    const statsTableAfterTeam = within(screen.getByRole('table', { name: 'Player stat table' }));
    expect(statsTableAfterTeam.getByText('Alpha Passer')).toBeTruthy();
    expect(statsTableAfterTeam.queryByText('Gamma Passer')).toBeNull();

    fireEvent.click(screen.getByText('Reset filters'));
    fireEvent.change(screen.getByLabelText('Filter by position'), { target: { value: 'QB' } });
    const statsTableAfterPosition = within(screen.getByRole('table', { name: 'Player stat table' }));
    expect(statsTableAfterPosition.getByText('Alpha Passer')).toBeTruthy();
    expect(statsTableAfterPosition.getByText('Gamma Passer')).toBeTruthy();
  });

  it('sorts numeric stats ascending and descending without losing mobile labels', () => {
    render(<LeagueStats league={makeStatsLeague()} onPlayerSelect={() => {}} onTeamSelect={() => {}} />);

    const getFirstPlayerName = () => within(screen.getByRole('table', { name: 'Player stat table' })).getAllByRole('row')[1].textContent;
    expect(getFirstPlayerName()).toContain('Alpha Passer');

    const statsTable = within(screen.getByRole('table', { name: 'Player stat table' }));
    fireEvent.click(statsTable.getByLabelText('Sort by Yds'));
    expect(getFirstPlayerName()).toContain('Gamma Passer');
    fireEvent.click(statsTable.getByLabelText('Sort by Yds'));
    expect(getFirstPlayerName()).toContain('Alpha Passer');

    const yardsCells = screen.getAllByText('320').filter((node) => node.getAttribute('data-label') === 'Yds');
    expect(yardsCells.length).toBeGreaterThan(0);
  });
});
