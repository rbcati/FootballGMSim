/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import TeamHistoryScreen from '../TeamHistoryScreen.jsx';

describe('TeamHistoryScreen', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders safely with empty seasons (old save)', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model: null } }),
        }}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Franchise history starts once completed seasons are archived/i)).toBeTruthy();
    });
    expect(screen.queryByText('Playoff appearances')).toBeNull();
    expect(screen.getAllByText(/^Playoff-caliber years$/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows Playoff appearances when postseason archive exists', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2032,
                standings: [{ id: 7, abbr: 'SEA', wins: 11, losses: 6, ties: 0, pf: 400, pa: 350 }],
                champion: { id: 2, abbr: 'OTH' },
                runnerUp: { id: 3, abbr: 'THD' },
                playoffBracketSnapshot: { mode: 'empty', rounds: [] },
              }],
            },
          }),
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model: null } }),
        }}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Playoff appearances')).toBeTruthy();
    });
  });

  it('calls onOpenBoxScore when defining game has resolvable id and scores', async () => {
    const onOpen = vi.fn();
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2055,
                standings: [
                  { id: 7, abbr: 'SEA', wins: 10, losses: 7, ties: 0, pf: 400, pa: 300 },
                  { id: 3, abbr: 'RIV', wins: 7, losses: 10, ties: 0, pf: 280, pa: 320 },
                ],
                champion: { id: 2, abbr: 'OTH' },
                runnerUp: { id: 3, abbr: 'RIV' },
                playoffBracketSnapshot: { mode: 'empty', rounds: [] },
                gameIndex: [{
                  week: 5,
                  homeId: 7,
                  awayId: 3,
                  homeScore: 31,
                  awayScore: 17,
                }],
              }],
            },
          }),
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model: null } }),
        }}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={onOpen}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('10-7').length).toBeGreaterThan(0);
    });
    const btn = screen.getAllByRole('button').find((b) => b.textContent?.includes('2055') && b.textContent?.includes('Week 5'));
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalled();
    });
    const arg = onOpen.mock.calls[0][0];
    expect(String(arg)).toMatch(/2055/);
  });
});
