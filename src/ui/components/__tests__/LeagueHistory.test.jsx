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
