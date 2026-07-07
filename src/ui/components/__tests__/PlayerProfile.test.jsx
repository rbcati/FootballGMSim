/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  getTransactions: vi.fn(async () => ({ payload: { transactions: [] } })),
};

describe('PlayerProfile', () => {
  beforeEach(() => {
    // vitest 4: Mock now calls `new impl()` for constructor mocks; arrow functions
    // cannot be constructors, so use a regular function here.
    global.IntersectionObserver = vi.fn(function () { return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }; });
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
    expect(screen.getByTestId('player-profile-career-timeline').textContent).toContain('No career timeline recorded yet.');
    await waitFor(() => expect(screen.getByText('Contract Read')).toBeTruthy());
    expect(screen.getByText('Market tier')).toBeTruthy();
  });

  it('renders player career timeline and acquisition context from transaction rows', async () => {
    const timelineActions = {
      ...actions,
      getTransactions: vi.fn(async () => ({
        payload: {
          transactions: [{
            id: 8,
            type: 'signing',
            typeLabel: 'Signing',
            season: 2031,
            seasonId: 's2031',
            week: 4,
            teamId: 1,
            teamAbbr: 'DAL',
            playerId: 11,
            playerName: 'Avery Fields',
            headline: 'DAL signed Avery Fields in free agency',
            detail: '2y - $24M',
          }],
        },
      })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={timelineActions} teams={league.teams} league={league} />);

    await waitFor(() => expect(screen.getByTestId('player-profile-career-timeline').textContent).toContain('DAL signed Avery Fields in free agency'));
    expect(screen.getByTestId('player-profile-acquisition-summary').textContent).toContain('Signed in free agency');
    expect(screen.getAllByTestId('player-profile-career-timeline-row')[0].textContent).toContain('Signing');
  });

  it('shows career arc snapshot for active players', async () => {
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={actions} teams={league.teams} league={league} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-dev-arc')).toBeTruthy());
    expect(screen.getByTestId('player-profile-dev-arc').textContent).toMatch(/Career arc snapshot/i);
  });

  it('shows scouting snapshot for draft-eligible prospects', async () => {
    const prospect = {
      id: 55,
      name: 'Draft Prospect',
      pos: 'QB',
      age: 21,
      status: 'draft_eligible',
      ovr: 74,
      potential: 88,
      schemeFit: 66,
      combineResults: { fortyTime: 4.58, verticalLeap: 34 },
      interviewReport: { riskScore: 38 },
      traits: [],
      accolades: [],
    };
    const prospectLeague = {
      ...league,
      teams: [{ id: 1, name: 'Dallas', abbr: 'DAL', roster: [], staff: { headCoach: { schemePreference: 'vertical' } } }],
    };
    const prospectActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: { player: prospect, stats: [], teammates: [], meta: { userTeamId: 1 } },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getPlayerDraftContext: vi.fn(async () => ({ payload: { context: { known: false } } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
    };
    render(
      <PlayerProfile playerId={55} onClose={vi.fn()} actions={prospectActions} teams={prospectLeague.teams} league={prospectLeague} />,
    );
    await waitFor(() => expect(screen.getByTestId('player-profile-scouting-report')).toBeTruthy());
    expect(screen.getByTestId('player-profile-scouting-report').textContent).toMatch(/Scouting snapshot/i);
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

  it('supports season log search, sort, and reset controls', async () => {
    const seasonLogActions = {
      getPlayerCareer: vi.fn(async () => ({
        payload: {
          player: {
            ...player,
            careerStats: [],
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
                  gamesPlayed: 16,
                  passYds: 3600,
                  passTDs: 24,
                  passInts: 10,
                }],
                meta: {},
              },
            },
            {
              id: 's2',
              year: 2031,
              playerSeasonStatsV1: {
                schemaVersion: 1,
                rows: [{
                  playerId: 11,
                  playerName: 'Avery Fields',
                  pos: 'QB',
                  teamId: 2,
                  teamAbbr: 'NYG',
                  year: 2031,
                  seasonId: 's2',
                  gamesPlayed: 17,
                  passYds: 4200,
                  passTDs: 31,
                  passInts: 8,
                }],
                meta: {},
              },
            },
          ],
        },
      })),
      getPlayerDraftContext: vi.fn(async () => ({ payload: { context: { known: false } } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
    };
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={seasonLogActions} teams={league.teams} league={league} />);

    await waitFor(() => {
      expect(screen.getByTestId('player-profile-season-log-showing').textContent).toContain('Showing 2 of 2 seasons');
    });

    fireEvent.change(screen.getByLabelText('Sort player season log'), { target: { value: 'primaryStat' } });
    const rows = screen.getAllByTestId(/player-profile-season-log-row-/i);
    expect(rows[0].textContent).toContain('NYG');

    fireEvent.change(screen.getByLabelText('Search player season log'), { target: { value: 'dal' } });
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-season-log-showing').textContent).toContain('Showing 1 of 2 seasons');
    });
    expect(screen.getAllByText('DAL').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Reset player season log filters'));
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-season-log-showing').textContent).toContain('Showing 2 of 2 seasons');
    });
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

  it('renders Advanced Analytics career totals and season ledger when archive data exists', async () => {
    const advancedLeague = {
      ...league,
      playerSeasonStatsArchive: {
        __meta: { archivedGameIds: { '2030:g1': true } },
        11: {
          2030: {
            targets: 42,
            drops: 4,
            battedPasses: 1,
            coverageTargets: 0,
            coverageCompletionsAllowed: 0,
            receptionsAllowed: 0,
            sacksAllowed: 7,
            sacksMade: 0,
          },
          2031: {
            targets: 51,
            drops: 3,
            battedPasses: 2,
            coverageTargets: 5,
            coverageCompletionsAllowed: 2,
            receptionsAllowed: 2,
            sacksAllowed: 6,
            sacksMade: 1,
          },
        },
      },
    };

    render(<PlayerProfile playerId="11" onClose={vi.fn()} actions={actions} teams={advancedLeague.teams} league={advancedLeague} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Avery Fields'));

    fireEvent.click(screen.getByRole('button', { name: 'Career Stats' }));

    const section = screen.getByTestId('player-profile-advanced-analytics');
    expect(section.textContent).toContain('Advanced Analytics');
    expect(section.textContent).toContain('Targets');
    expect(section.textContent).toContain('93');
    expect(section.textContent).toContain('Sacks Allowed');
    expect(section.textContent).toContain('13');

    const ledger = screen.getByTestId('player-profile-advanced-ledger');
    const rows = within(ledger).getAllByRole('row');
    expect(rows[1].textContent).toContain('2031');
    expect(rows[2].textContent).toContain('2030');

    const wrapper = screen.getByTestId('player-profile-advanced-ledger-wrap');
    expect(wrapper.className).toContain('table-wrapper');
    expect(wrapper.className).toContain('player-career-table-wrap');
    expect(wrapper.getAttribute('aria-label')).toMatch(/scroll horizontally/i);
  });

  it('renders the Advanced Analytics empty state for legacy saves without archive data', async () => {
    render(<PlayerProfile playerId={11} onClose={vi.fn()} actions={actions} teams={league.teams} league={{ ...league, playerSeasonStatsArchive: {} }} />);
    await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Avery Fields'));

    fireEvent.click(screen.getByRole('button', { name: 'Career Stats' }));

    expect(screen.getByTestId('player-profile-advanced-empty').textContent).toContain('Advanced tracking begins with newly simulated rich games.');
    expect(screen.queryByTestId('player-profile-advanced-ledger')).toBeNull();
  });

  describe('hidden development trait reveal', () => {
    // useStableRouteRequest keeps a module-level completed-request cache keyed
    // by league scope + player id, so give each render a unique player id.
    let nextRevealPlayerId = 9100;

    const buildActions = (revealPlayer) => ({
      getPlayerCareer: vi.fn(async () => ({
        payload: {
          player: revealPlayer,
          stats: [],
          teammates: [],
          meta: { userTeamId: 1, week: 1 },
        },
      })),
      getAllSeasons: vi.fn(async () => ({ payload: { seasons: [] } })),
      getPlayerDraftContext: vi.fn(async () => ({ payload: { context: { known: false } } })),
      getRecords: vi.fn(async () => ({ payload: { recordBook: null } })),
      getTransactions: vi.fn(async () => ({ payload: { transactions: [] } })),
    });

    const renderProfile = (playerOverrides) => {
      const id = nextRevealPlayerId++;
      const revealPlayer = { ...player, ...playerOverrides, id };
      render(
        <PlayerProfile
          playerId={id}
          onClose={vi.fn()}
          actions={buildActions(revealPlayer)}
          teams={league.teams}
          league={league}
        />,
      );
    };

    it('renders no Development row for players without hiddenDevTrait', async () => {
      renderProfile({});
      await waitFor(() => expect(screen.getByTestId('player-profile-summary').textContent).toContain('Avery Fields'));
      expect(screen.queryByTestId('player-profile-dev-trait')).toBeNull();
    });

    it('shows "Hidden" below the reveal threshold', async () => {
      renderProfile({
        hiddenDevTrait: 'superstar',
        age: 23,
        ovrHistory: [{ season: 2030, ovr: 80, age: 22 }],
      });
      await waitFor(() => expect(screen.getByTestId('player-profile-dev-trait')).toBeTruthy());
      const row = screen.getByTestId('player-profile-dev-trait');
      expect(row.textContent).toContain('Development');
      expect(row.textContent).toContain('Hidden');
      expect(row.textContent).not.toContain('Superstar');
    });

    it.each([
      ['normal', 'Normal'],
      ['late_bloomer', 'Late Bloomer'],
      ['superstar', 'Superstar'],
      ['bust', 'Bust'],
    ])('shows the %s label at the reveal threshold', async (trait, label) => {
      renderProfile({
        hiddenDevTrait: trait,
        ovrHistory: [
          { season: 2030, ovr: 80, age: 22 },
          { season: 2031, ovr: 82, age: 23 },
        ],
      });
      await waitFor(() => expect(screen.getByTestId('player-profile-dev-trait')).toBeTruthy());
      expect(screen.getByTestId('player-profile-dev-trait').textContent).toContain(label);
    });

    it('defaults to "Hidden" when age and season context are both missing', async () => {
      renderProfile({ hiddenDevTrait: 'bust', age: null, ovrHistory: undefined });
      await waitFor(() => expect(screen.getByTestId('player-profile-dev-trait')).toBeTruthy());
      expect(screen.getByTestId('player-profile-dev-trait').textContent).toContain('Hidden');
    });

    it('never renders hiddenTrueOvr anywhere in the profile tree', async () => {
      renderProfile({
        hiddenTrueOvr: 977, // sentinel: impossible OVR so any leak is detectable
        hiddenDevTrait: 'superstar',
        ovrHistory: [
          { season: 2030, ovr: 80, age: 22 },
          { season: 2031, ovr: 82, age: 23 },
        ],
      });
      await waitFor(() => expect(screen.getByTestId('player-profile-dev-trait')).toBeTruthy());
      expect(document.body.textContent).not.toContain('977');
      expect(document.body.innerHTML).not.toContain('hiddenTrueOvr');
    });
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
