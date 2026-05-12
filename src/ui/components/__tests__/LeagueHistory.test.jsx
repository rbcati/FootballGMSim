/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LeagueHistory from '../LeagueHistory.jsx';

describe('LeagueHistory', () => {
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

  it('shows season search input and showing label on initial load', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, standings: [], awards: {}, champion: { abbr: 'DAL' } },
                { id: 's2', year: 2031, standings: [], awards: {}, champion: { abbr: 'NYG' } },
                { id: 's3', year: 2032, standings: [], awards: {}, champion: { abbr: 'DAL' } },
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
      const searchInputs = screen.queryAllByTestId('league-history-season-search');
      expect(searchInputs.length).toBeGreaterThan(0);
      const showingLabels = screen.queryAllByTestId('league-history-season-showing');
      expect(showingLabels.some((el) => el.textContent.includes('3 of 3'))).toBe(true);
    });
  });

  it('filters season list by search query', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, standings: [], awards: {}, champion: { abbr: 'DAL' } },
                { id: 's2', year: 2031, standings: [], awards: {}, champion: { abbr: 'NYG' } },
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
      const inputs = screen.queryAllByTestId('league-history-season-search');
      expect(inputs.length).toBeGreaterThan(0);
    });

    const inputs = screen.queryAllByTestId('league-history-season-search');
    fireEvent.change(inputs[0], { target: { value: '2030' } });
    await waitFor(() => {
      const labels = screen.queryAllByTestId('league-history-season-showing');
      expect(labels.some((el) => el.textContent.includes('1 of 2'))).toBe(true);
    });
  });
});
