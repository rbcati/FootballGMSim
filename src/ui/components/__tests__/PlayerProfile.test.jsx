/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import PlayerProfile from '../PlayerProfile.jsx';

const player = {
  id: 11,
  name: 'Avery Fields',
  pos: 'QB',
  age: 24,
  ovr: 82,
  potential: 90,
  teamId: 1,
  status: 'active',
  contract: { years: 2, baseAnnual: 12 },
  traits: [],
  accolades: [],
  ratings: {},
};

const league = {
  seasonId: '2026',
  week: 2,
  teams: [{ id: 1, name: 'Dallas', abbr: 'DAL', roster: [player] }],
  schedule: { weeks: [] },
};

const actions = { getPlayerCareer: vi.fn(async () => null) };

describe('PlayerProfile', () => {
  beforeEach(() => {
    global.IntersectionObserver = vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }));
  });
  afterEach(() => cleanup());
  it('renders safe unavailable state when no player id is provided', () => {
    const html = renderToString(
      <PlayerProfile
        playerId={null}
        onClose={vi.fn()}
        actions={actions}
        teams={[]}
        league={{ teams: [], week: 1 }}
      />,
    );

    expect(html).toContain('Player profile unavailable');
    expect(html).toContain('Close');
  });

  it('renders with minimum generated player data from league state', async () => {
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={actions} teams={league.teams} league={league} />);

    expect(screen.getByTestId('player-profile')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Avery Fields'));
    expect(screen.getByTestId('player-profile-season-stats').textContent).toContain('Season stats will appear after this player records tracked stats.');
  });

  it('renders game book context and honest missing logs state', () => {
    render(
      <PlayerProfile
        playerId={11}
        onClose={vi.fn()}
        actions={actions}
        teams={league.teams}
        league={league}
        profileContext={{ source: 'game-book', gameId: 'g1', week: 2, role: 'Top offensive player', statLine: { passAtt: 28, passComp: 19, passYd: 244, passTD: 2, interceptions: 1 } }}
      />,
    );

    expect(screen.getByTestId('player-profile-game-impact').textContent).toContain('244 pass yds');
    fireEvent.click(screen.getByRole('button', { name: 'Game Log' }));
    expect(screen.getByTestId('player-profile-game-logs').textContent).toContain('Game logs will appear after this player records tracked stats.');
  });

  it('renders a game log row when completed-game stats exist', () => {
    const leagueWithGame = {
      ...league,
      schedule: {
        weeks: [
          {
            week: 1,
            games: [
              {
                played: true,
                home: 1,
                away: 2,
                homeScore: 24,
                awayScore: 17,
                playerStats: {
                  home: {
                    11: {
                      stats: {
                        passComp: 18,
                        passAtt: 27,
                        passYd: 245,
                        passTD: 2,
                        interceptions: 1,
                      },
                    },
                  },
                  away: {},
                },
              },
            ],
          },
        ],
      },
      teamById: {
        1: { id: 1, abbr: 'DAL' },
        2: { id: 2, abbr: 'NYG' },
      },
    };

    render(
      <PlayerProfile
        playerId={11}
        onClose={vi.fn()}
        actions={actions}
        teams={leagueWithGame.teams}
        league={leagueWithGame}
      />,
    );

    // Navigate to Game Log tab
    fireEvent.click(screen.getByRole('button', { name: 'Game Log' }));
    expect(screen.getByTestId('player-profile-game-logs').textContent).toContain('W1');
    expect(screen.getByTestId('player-profile-game-logs').textContent).toContain('NYG');
  });

  it('return buttons navigate to Game Book and HQ', () => {
    const onClose = vi.fn();
    const onOpenBoxScore = vi.fn();
    const onNavigate = vi.fn();
    render(
      <PlayerProfile
        playerId={11}
        onClose={onClose}
        actions={actions}
        teams={league.teams}
        league={league}
        onNavigate={onNavigate}
        onOpenBoxScore={onOpenBoxScore}
        profileContext={{ source: 'game-book', gameId: 'g1', week: 2 }}
      />,
    );

    fireEvent.click(screen.getByTestId('player-profile-return-to-game-book'));
    expect(onOpenBoxScore).toHaveBeenCalledWith('g1');
    fireEvent.click(screen.getByRole('button', { name: 'Return to HQ' }));
    expect(onNavigate).toHaveBeenCalledWith('HQ');
  });
});
