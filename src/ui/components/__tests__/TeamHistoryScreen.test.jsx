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

  it('searches, sorts, counts, and resets the season timeline without inventing results', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
  it('supports timeline search, numeric sort, showing counts, and reset filters', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Dallas', abbr: 'DAL' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  id: 's1',
                  year: 2030,
                  standings: [{ id: 7, name: 'Seattle', abbr: 'SEA', wins: 7, losses: 10, ties: 0, pf: 310, pa: 380 }],
                  awards: {},
                },
                {
                  id: 's2',
                  year: 2031,
                  standings: [{ id: 7, name: 'Seattle', abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 470, pa: 320 }],
                  champion: { id: 7, abbr: 'SEA' },
                  awards: { mvp: { playerId: 11, name: 'Avery Fields' } },
                  year: 2030,
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 12, losses: 5, ties: 0, pf: 420, pa: 310 }],
                  champion: { id: 1, abbr: 'DAL' },
                  awards: { mvp: { playerId: 7, name: 'Title QB' } },
                },
                {
                  year: 2031,
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 9, losses: 8, ties: 0, pf: 360, pa: 340 }],
                  runnerUp: { id: 2, abbr: 'PHI' },
                  awards: { mvp: { playerId: 9, name: 'Ace Star' } },
                },
                {
                  year: 2032,
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 4, losses: 13, ties: 0, pf: 260, pa: 410 }],
                  awards: {},
                },
              ],
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

    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 seasons/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Search team seasons/i), { target: { value: 'Avery' } });
    expect(screen.getByText(/Showing 1 of 2 seasons/i)).toBeTruthy();
    expect(screen.getAllByTestId('team-history-season-row')[0].textContent).toMatch(/2031/);

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getByText(/Showing 2 of 2 seasons/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Sort team seasons/i), { target: { value: 'wins' } });
    fireEvent.click(screen.getByRole('button', { name: /Desc/i }));
    expect(screen.getAllByTestId('team-history-season-row')[0].textContent).toMatch(/2030/);
    await waitFor(() => {
      expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 3 of 3 seasons');
    });

    fireEvent.change(screen.getByLabelText(/Sort team history seasons/i), { target: { value: 'wins' } });
    let seasonCards = screen.getAllByTestId(/team-history-season-/);
    expect(seasonCards[0].textContent).toContain('2030');

    fireEvent.click(screen.getByLabelText(/Toggle team history season sort direction/i));
    await waitFor(() => {
      seasonCards = screen.getAllByTestId(/team-history-season-/);
      expect(seasonCards[0].textContent).toContain('2032');
    });

    fireEvent.change(screen.getByLabelText(/Search team history seasons/i), { target: { value: 'Ace Star' } });
    await waitFor(() => {
      expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 1 of 3 seasons');
    });
    expect(screen.getByTestId('team-history-season-2031')).toBeTruthy();
    expect(screen.queryByTestId('team-history-season-2030')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 3 of 3 seasons');
    });
  });
});
