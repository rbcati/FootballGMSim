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

  const multiSeasonActions = {
    getAllSeasons: vi.fn().mockResolvedValue({
      payload: {
        seasons: [
          { year: 2030, standings: [{ id: 1, abbr: 'ALP', wins: 12, losses: 5, ties: 0, pf: 450, pa: 300 }], champion: { id: 1, abbr: 'ALP' }, playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
          { year: 2031, standings: [{ id: 1, abbr: 'ALP', wins: 6, losses: 11, ties: 0, pf: 280, pa: 400 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
          { year: 2032, standings: [{ id: 1, abbr: 'ALP', wins: 10, losses: 7, ties: 0, pf: 380, pa: 350 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
        ],
      },
    }),
    getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
    getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
    getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
    getDraftClass: vi.fn().mockResolvedValue({ payload: { model: null } }),
  };

  it('shows "Showing X of Y seasons" label', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={multiSeasonActions}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 3 of 3 seasons/);
    });
  });

  it('sorts timeline by wins descending when Wins sort is clicked', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={multiSeasonActions}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('team-history-sort-wins')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('team-history-sort-wins'));
    await waitFor(() => {
      const cards = screen.getAllByTestId(/^team-history-season-/);
      expect(cards[0].textContent).toContain('2030');
      expect(cards[cards.length - 1].textContent).toContain('2031');
    });
  });

  it('filters timeline by year and updates showing label', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={multiSeasonActions}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Filter by year'), { target: { value: '2031' } });
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 1 of 3 seasons/);
    });
  });

  it('resets filters restores full list', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={multiSeasonActions}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('team-history-showing-label')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Filter by year'), { target: { value: '2031' } });
    await waitFor(() => expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/1 of 3/));
    fireEvent.click(screen.getByText('Reset filters'));
    await waitFor(() => expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/3 of 3/));
  });

  it('empty history state renders safely with showing label', async () => {
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
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 0 of 0 seasons/);
    });
  });
});
