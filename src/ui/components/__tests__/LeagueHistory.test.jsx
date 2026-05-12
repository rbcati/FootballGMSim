/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LeagueHistory from '../LeagueHistory.jsx';

describe('LeagueHistory', () => {
  afterEach(() => cleanup());

  it('opens the selected archived season and handles missing championship data safely', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s2"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, standings: [], awards: {} },
                { id: 's2', year: 2031, standings: [{ id: 1, wins: 10, losses: 7 }], awards: {} },
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/2031 League Snapshot/i)).toBeTruthy();
      expect(screen.getByText(/Championship result is unavailable in this archive/i)).toBeTruthy();
      expect(screen.getByTestId('league-history-season-story-s2')).toBeTruthy();
    });
  });

  it('renders playoff snapshot when archived bracket data exists', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s2"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  id: 's2',
                  year: 2031,
                  champion: { id: 1, name: 'Dallas', abbr: 'DAL' },
                  runnerUp: { id: 2, name: 'NYG', abbr: 'NYG' },
                  awards: { mvp: { playerId: 9, name: 'Star', teamId: 1 } },
                  standings: [
                    { id: 1, name: 'Dallas', abbr: 'DAL', wins: 12, losses: 5 },
                    { id: 2, name: 'NYG', abbr: 'NYG', wins: 11, losses: 6 },
                  ],
                  notableGames: [{ type: 'highest_scoring', gameId: 'gx', week: 3, homeId: 1, awayId: 2, homeScore: 40, awayScore: 38, totalPoints: 78 }],
                  playerStatLeaders: { passingYards: { playerId: 9, playerName: 'Star', value: 4200 } },
                  teamStatLeaders: {
                    pointsPerGame: { teamAbbr: 'DAL', value: 28.5 },
                    pointsAllowed: { teamAbbr: 'NYG', value: 17.2 },
                  },
                  playoffBracketSnapshot: {
                    mode: 'rounds',
                    note: null,
                    rounds: [
                      {
                        label: 'Wild Card',
                        games: [{ id: 'g1', gameId: 'g1', week: 19, homeId: 1, awayId: 2, homeAbbr: 'DAL', awayAbbr: 'NYG', homeScore: 24, awayScore: 17, winnerId: 1 }],
                      },
                    ],
                  },
                },
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      const playoffPanels = screen.queryAllByTestId('league-history-playoff-bracket-s2');
      const playoff = playoffPanels.find((el) => el.textContent.includes('Wild Card')) ?? playoffPanels[playoffPanels.length - 1];
      expect(playoff?.textContent ?? '').toMatch(/Wild Card/i);
      const leaderPanels = screen.queryAllByTestId('league-history-player-stat-leaders-s2');
      const leaders = leaderPanels.find((el) => el.textContent.includes('Star')) ?? leaderPanels[leaderPanels.length - 1];
      expect(leaders?.textContent ?? '').toMatch(/Star/i);
    });
  });

  it('falls back to the first archived season when initialSelectedSeasonId is unknown', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="missing-id"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, standings: [], awards: {} },
                { id: 's2', year: 2031, standings: [], awards: {} },
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/2030 League Snapshot/i)).toBeTruthy();
    });
  });

  it('shows top performers when playerSeasonStatsV1 snapshots exist', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s9"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                id: 's9',
                year: 2095,
                standings: [{ id: 1, abbr: 'DAL', wins: 8, losses: 9 }],
                awards: {},
                playerSeasonStatsV1: {
                  schemaVersion: 1,
                  rows: [
                    { playerId: 'qb1', playerName: 'Air', pos: 'QB', teamId: 1, teamAbbr: 'DAL', year: 2095, seasonId: 's9', gamesPlayed: 10, passYds: 4800, passTDs: 35, passInts: 10, rushYds: 0, rushTDs: 0, recYds: 0, recTDs: 0, tackles: 0, sacks: 0, defInts: 0, fgMade: 0, xpMade: 0 },
                  ],
                  meta: {},
                },
              }],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('league-history-top-performers-s9')).toBeTruthy();
      expect(screen.getByTestId('league-history-top-performers-s9').textContent).toMatch(/Air/);
      expect(screen.getByTestId('league-history-top-performers-s9').textContent).toMatch(/4,?800/);
    });
  });

  it('renders major transactions from transactionTimelineV1 when present', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1, teams: [{ id: 1, abbr: 'DAL' }] }}
        initialSelectedSeasonId="sx"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                id: 'sx',
                year: 2100,
                standings: [{ id: 1, abbr: 'DAL', wins: 9, losses: 8 }],
                awards: {},
                transactionTimelineV1: {
                  schemaVersion: 1,
                  rows: [
                    { id: 'tx-1', type: 'signing', headline: 'DAL signed Test Player', week: 2, playerId: 99, playerName: 'Test Player', teamAbbr: 'DAL' },
                  ],
                  meta: {},
                },
              }],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('league-history-major-tx-sx')).toBeTruthy();
      expect(screen.getByTestId('league-history-major-tx-sx').textContent).toMatch(/DAL signed Test Player/);
    });
  });

  it('supports season archive search, champion filtering, and reset controls', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
  it('filters and resets archived season list controls', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s2"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  id: 's1',
                  year: 2030,
                  champion: { id: 1, name: 'Dallas', abbr: 'DAL' },
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 12, losses: 5 }],
                  awards: { mvp: { playerId: 1, name: 'Title QB' } },
                },
                {
                  id: 's2',
                  year: 2031,
                  champion: { id: 2, name: 'New York', abbr: 'NYG' },
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 10, losses: 7 }],
                  awards: { mvp: { playerId: 2, name: 'Apex RB' } },
                },
                {
                  id: 's3',
                  year: 2032,
                  champion: { id: 3, name: 'Philadelphia', abbr: 'PHI' },
                  standings: [{ id: 3, name: 'Philadelphia', abbr: 'PHI', wins: 11, losses: 6 }],
                  awards: { mvp: { playerId: 3, name: 'Edge Star' } },
                },
                { id: 's1', year: 2030, champion: { abbr: 'DAL' }, standings: [], awards: { mvp: { name: 'Alpha QB' } } },
                { id: 's2', year: 2031, champion: { abbr: 'NYG' }, standings: [], awards: { mvp: { name: 'Bravo QB' } } },
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('league-season-archive-count').textContent).toContain('Showing 3 of 3 seasons');
    });

    fireEvent.change(screen.getByLabelText(/Search league history seasons/i), { target: { value: 'Dallas' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-season-archive-count').textContent).toContain('Showing 2 of 3 seasons');
    });

    fireEvent.change(screen.getByLabelText(/Filter league history seasons by champion/i), { target: { value: 'NYG' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-season-archive-count').textContent).toContain('Showing 1 of 3 seasons');
    });
    expect(screen.getByTestId('league-season-button-s2')).toBeTruthy();
    expect(screen.queryByTestId('league-season-button-s1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByTestId('league-season-archive-count').textContent).toContain('Showing 3 of 3 seasons');
    });
  });

  it('supports search, type filters, sort direction, and counts in league office history', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
      expect(screen.getByTestId('league-history-season-showing').textContent).toContain('Showing 2 of 2 seasons');
    });

    fireEvent.change(screen.getByLabelText('Search archived seasons'), { target: { value: 'nyg' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-history-season-showing').textContent).toContain('Showing 1 of 2 seasons');
    });
    expect(screen.getByTestId('league-history-season-list-item-s2')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Reset archived season filters'));
    await waitFor(() => {
      expect(screen.getByTestId('league-history-season-showing').textContent).toContain('Showing 2 of 2 seasons');
    });
  });

  it('filters league office transactions by type and search', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialActiveTab="office"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [{ id: 's1', year: 2030, standings: [], awards: {} }] } }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({
            payload: {
              transactions: [
                { id: 1, seasonId: 2032, week: 3, type: 'signing', typeLabel: 'Signing', teamAbbr: 'DAL', playerId: 10, playerName: 'Miles Carter' },
                { id: 2, seasonId: 2033, week: 5, type: 'trade', typeLabel: 'Trade', fromTeamAbbr: 'DAL', toTeamAbbr: 'PHI', playerId: 11, playerName: 'Kane Moss' },
                { id: 3, seasonId: 2034, week: 1, type: 'release', typeLabel: 'Release', teamAbbr: 'NYG', playerId: 12, playerName: 'Duke Lane' },
              ],
            },
          }),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('tab', { name: /League Office/i }));
    await waitFor(() => {
      expect(screen.getByTestId('league-office-count').textContent).toContain('Showing 3 of 3 transactions');
    });

    fireEvent.change(screen.getByLabelText(/Search league office transactions/i), { target: { value: 'Miles' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-office-count').textContent).toContain('Showing 1 of 3 transactions');
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByTestId('league-office-count').textContent).toContain('Showing 3 of 3 transactions');
    });

    fireEvent.change(screen.getByLabelText(/Filter league office transactions by type/i), { target: { value: 'Trade' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-office-count').textContent).toContain('Showing 1 of 3 transactions');
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByTestId('league-office-count').textContent).toContain('Showing 3 of 3 transactions');
    });

    fireEvent.change(screen.getByLabelText(/Sort league office transactions/i), { target: { value: 'asc' } });
    await waitFor(() => {
      expect(screen.getAllByTestId(/league-office-row-/)[0].textContent).toContain('2032');
                { id: 'tx1', seasonId: 's1', week: 3, type: 'trade', typeLabel: 'Trade', playerName: 'Player One', fromTeamAbbr: 'DAL', toTeamAbbr: 'NYG' },
                { id: 'tx2', seasonId: 's1', week: 4, type: 'signing', typeLabel: 'Signing', playerName: 'Player Two', teamAbbr: 'DAL' },
              ],
            },
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('league-office-showing').textContent).toContain('Showing 2 of 2 transactions');
    });

    fireEvent.change(screen.getByLabelText('Filter league transactions by type'), { target: { value: 'Trade' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-office-showing').textContent).toContain('Showing 1 of 2 transactions');
    });

    fireEvent.change(screen.getByLabelText('Search league transactions'), { target: { value: 'missing player' } });
    await waitFor(() => {
      expect(screen.getByTestId('league-office-showing').textContent).toContain('Showing 0 of 2 transactions');
    });
  });
});
