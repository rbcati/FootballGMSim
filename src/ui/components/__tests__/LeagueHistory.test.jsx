/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
