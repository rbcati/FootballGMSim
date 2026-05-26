/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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

// ── Advanced Tab ──────────────────────────────────────────────────────────────

const BASE_ACTIONS = {
  getLeagueLeaders: () => Promise.resolve({ payload: { categories: null, source: null, phase: null } }),
};

const BASE_LEAGUE = {
  userTeamId: 1,
  teams: [
    { id: 1, abbr: 'AAA', roster: [] },
    { id: 2, abbr: 'BBB', roster: [] },
  ],
};

function renderLeagueLeaders(leagueOverrides = {}, onPlayerSelect = () => {}) {
  const league = { ...BASE_LEAGUE, ...leagueOverrides };
  return render(
    <LeagueLeaders
      league={league}
      actions={BASE_ACTIONS}
      onPlayerSelect={onPlayerSelect}
      onNavigate={() => {}}
    />,
  );
}

describe('LeagueLeaders — Advanced tab', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('renders the Advanced tab button', () => {
    renderLeagueLeaders();
    expect(screen.getByRole('tab', { name: 'Advanced' })).toBeTruthy();
  });

  it('shows the empty state when no archive data exists', () => {
    renderLeagueLeaders({ playerSeasonStatsArchive: {} });
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText(/Advanced leaderboards populate after rich games are simulated/i)).toBeTruthy();
  });

  it('shows the empty state when archive is missing entirely', () => {
    renderLeagueLeaders({ playerSeasonStatsArchive: undefined });
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText(/Advanced leaderboards populate after rich games are simulated/i)).toBeTruthy();
  });

  it('renders a leaderboard row for a player with targets data', () => {
    const league = {
      ...BASE_LEAGUE,
      teams: [
        {
          id: 1,
          abbr: 'AAA',
          roster: [{ id: 10, name: 'Top Target', pos: 'WR', teamId: 1 }],
        },
        { id: 2, abbr: 'BBB', roster: [] },
      ],
      playerSeasonStatsArchive: {
        '10': { 2031: { targets: 42 } },
      },
    };
    renderLeagueLeaders(league);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText('Top Target')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('switches metric when a chip is clicked', () => {
    const league = {
      ...BASE_LEAGUE,
      teams: [
        {
          id: 1,
          abbr: 'AAA',
          roster: [{ id: 10, name: 'Sack Leader', pos: 'DE', teamId: 1 }],
        },
      ],
      playerSeasonStatsArchive: {
        '10': { 2031: { sacksMade: 9 } },
      },
    };
    renderLeagueLeaders(league);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    // Click the "Sacks Made" chip
    fireEvent.click(screen.getByRole('radio', { name: 'Sacks Made' }));
    expect(screen.getByText('Sack Leader')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('calls onPlayerSelect with player object when a name is clicked', () => {
    const onPlayerSelect = vi.fn();
    const league = {
      ...BASE_LEAGUE,
      teams: [
        {
          id: 1,
          abbr: 'AAA',
          roster: [{ id: 10, name: 'Clickable Player', pos: 'WR', teamId: 1 }],
        },
      ],
      playerSeasonStatsArchive: {
        '10': { 2031: { targets: 5 } },
      },
    };
    render(
      <LeagueLeaders
        league={league}
        actions={BASE_ACTIONS}
        onPlayerSelect={onPlayerSelect}
        onNavigate={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    fireEvent.click(screen.getByText('Clickable Player'));
    expect(onPlayerSelect).toHaveBeenCalledTimes(1);
    const arg = onPlayerSelect.mock.calls[0][0];
    expect(arg.id).toBe('10');
    expect(arg.name).toBe('Clickable Player');
  });

  it('renders the table with overflow-x-auto wrapper (mobile-safe)', () => {
    const league = {
      ...BASE_LEAGUE,
      teams: [
        {
          id: 1,
          abbr: 'AAA',
          roster: [{ id: 10, name: 'Mobile Player', pos: 'TE', teamId: 1 }],
        },
      ],
      playerSeasonStatsArchive: {
        '10': { 2031: { targets: 3 } },
      },
    };
    const { container } = renderLeagueLeaders(league);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    // The table-wrapper div uses overflowX: 'auto'
    const wrapper = container.querySelector('.table-wrapper');
    expect(wrapper).toBeTruthy();
    expect(wrapper.style.overflowX).toBe('auto');
  });

  it('shows the correct aria-label on the leaders table', () => {
    const league = {
      ...BASE_LEAGUE,
      teams: [
        {
          id: 1,
          abbr: 'AAA',
          roster: [{ id: 7, name: 'Aria Player', pos: 'CB', teamId: 1 }],
        },
      ],
      playerSeasonStatsArchive: {
        '7': { 2031: { targets: 11 } },
      },
    };
    renderLeagueLeaders(league);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    // Default metric is 'targets' → label should be "Targets leaders"
    expect(screen.getByRole('table', { name: /Targets leaders/i })).toBeTruthy();
  });
});

