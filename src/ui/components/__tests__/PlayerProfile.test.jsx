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

const actions = {
  getPlayerCareer: vi.fn(async () => null),
  getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
  getPlayerDraftContext: vi.fn(async () => ({ payload: { context: { known: false } } })),
  getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
};

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

  it('renders season log from playerSeasonStatsV1 when careerStats is empty', async () => {
    const logActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: {
          player: { ...player, careerStats: [] },
          stats: [],
          teammates: [],
          meta: {},
        },
      })),
      getAllSeasons: vi.fn(async () => ({
        payload: {
          seasons: [{
            id: 's1',
            year: 2030,
            playerSeasonStatsV1: {
              schemaVersion: 1,
              rows: [{
                playerId: 11,
                playerName: 'Avery Fields',
                pos: 'QB',
                teamId: 1,
                teamAbbr: 'DAL',
                year: 2030,
                seasonId: 's1',
                gamesPlayed: 12,
                passYds: 4100,
                passTDs: 31,
                passInts: 9,
                rushYds: 0,
                rushTDs: 0,
                recYds: 0,
                recTDs: 0,
                tackles: 0,
                sacks: 0,
                defInts: 0,
                fgMade: 0,
                xpMade: 0,
              }],
              meta: { source: 'seasonStats', partial: false, createdAt: 't' },
            },
          }],
        },
      })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={logActions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByText('Season Log')).toBeTruthy());
    expect(screen.getByText('4,100')).toBeTruthy();
  });

  it('shows honest empty award timeline when no honors exist', async () => {
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={actions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-award-timeline')).toBeTruthy());
    expect(screen.getByTestId('player-profile-award-timeline').textContent).toMatch(/No archived awards yet/i);
  });

  it('merges archived season awards with player accolades without duplicate MVP rows', async () => {
    const careerActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: {
          player: {
            ...player,
            accolades: [{ type: 'MVP', year: 2030, seasonId: 's1' }],
          },
          stats: [],
          teammates: [],
          meta: {},
        },
      })),
      getAllSeasons: vi.fn(async () => ({
        payload: {
          seasons: [
            {
              id: 's1',
              year: 2030,
              awards: { mvp: { playerId: 11, name: 'Avery Fields', teamId: 1 } },
            },
          ],
        },
      })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={careerActions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-award-timeline').textContent).toMatch(/Most Valuable Player/i));
    const block = screen.getByTestId('player-profile-award-timeline').textContent;
    expect((block.match(/Most Valuable Player/g) ?? []).length).toBe(1);
  });

  it('shows record book lines for record holders', async () => {
    const recordActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player, stats: [], teammates: [], meta: {} },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getRecords: vi.fn(async () => ({
        payload: {
          recordBook: {
            schemaVersion: 1,
            singleSeasonV1: {
              passingYards: { value: 5200, playerId: 11, year: 2031 },
            },
            careerLeadersV1: {
              passingYards: [{ playerId: 11, value: 15000, playerName: 'Avery Fields' }],
            },
          },
        },
      })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={recordActions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-record-book')).toBeTruthy());
    expect(screen.getByTestId('player-profile-record-book').textContent).toMatch(/Single-season passing yards record/i);
    expect(screen.getByTestId('player-profile-record-book').textContent).toMatch(/Career passing yards leader/i);
  });

  it('hides record book when player has no record context', async () => {
    const noRecordsActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player, stats: [], teammates: [], meta: {} },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getRecords: vi.fn(async () => ({
        payload: { recordBook: { schemaVersion: 1, singleSeasonV1: {}, careerLeadersV1: {} } },
      })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={noRecordsActions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Avery Fields'));
    expect(screen.queryByTestId('player-profile-record-book')).toBeNull();
  });

  it('renders active player with no careerStats, no accolades, and failed getRecords without crashing', async () => {
    const bare = {
      id: 99,
      name: 'Sparse Active',
      pos: 'WR',
      age: 23,
      ovr: 72,
      teamId: 1,
      status: 'active',
      accolades: [],
      contract: { years: 1, baseAnnual: 1 },
      traits: [],
      ratings: {},
    };
    const bareActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player: bare, stats: [], teammates: [], meta: { userTeamId: 1, week: 1 } },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getRecords: vi.fn(async () => Promise.reject(new Error('idb'))),
    };
    const teams = [{ id: 1, name: 'Dallas', abbr: 'DAL', roster: [bare] }];
    render(
      <PlayerProfile playerId={99} onClose={vi.fn()} actions={bareActions} teams={teams} league={{ ...league, teams }} />,
    );
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Sparse Active'));
    expect(screen.queryByTestId('player-profile-record-book')).toBeNull();
  });

  it('renders retired HOF inductee with no careerStats in payload without crashing', async () => {
    const bareHof = {
      id: 88,
      name: 'Ghost Legend',
      pos: 'RB',
      age: 38,
      ovr: 80,
      teamId: null,
      status: 'retired',
      hof: true,
      contract: null,
      traits: [],
      ratings: {},
    };
    const bareActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player: bareHof, stats: [], teammates: [], meta: { userTeamId: 1, week: 1 } },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
    };
    const teams = [{ id: 1, name: 'Dallas', abbr: 'DAL', roster: [] }];
    render(
      <PlayerProfile playerId={88} onClose={vi.fn()} actions={bareActions} teams={teams} league={{ ...league, teams }} />,
    );
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Ghost Legend'));
    await waitFor(() => expect(screen.getByTestId('player-profile-legacy-watch')).toBeTruthy());
    expect(screen.getByText(/Hall of Fame inductee/i)).toBeTruthy();
  });

  it('shows legacy watch when career stats and accolades justify legacy scoring', async () => {
    const careerPlayer = {
      id: 22,
      name: 'Star QB',
      pos: 'QB',
      age: 30,
      ovr: 90,
      teamId: 1,
      status: 'active',
      accolades: [{ type: 'MVP', year: 2025 }],
      careerStats: Array.from({ length: 8 }).map((_, i) => ({ season: `s${i}`, passYds: 4200, ovr: 88 })),
      contract: { years: 1, baseAnnual: 10 },
      traits: [],
      ratings: {},
    };
    const legacyActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player: careerPlayer, stats: [], meta: { userTeamId: 1, week: 5 } },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
    };
    const teamsWithStar = [{ id: 1, name: 'Dallas', abbr: 'DAL', roster: [careerPlayer] }];
    render(
      <PlayerProfile
        playerId={22}
        onClose={vi.fn()}
        actions={legacyActions}
        teams={teamsWithStar}
        league={{ ...league, teams: teamsWithStar }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('player-profile-legacy-watch')).toBeTruthy());
    expect(screen.getByText(/Legacy score/i)).toBeTruthy();
  });
});
