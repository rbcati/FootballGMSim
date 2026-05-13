/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
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

  it('filters and sorts season timeline with stable search and showing label', async () => {
  it('shows showing count and sort controls after seasons load', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  year: 2030,
                  id: 's1',
                  standings: [{ id: 7, abbr: 'SEA', wins: 8, losses: 9, ties: 0, pf: 300, pa: 310 }],
                  awards: { mvp: { playerId: 1, name: 'Alex Peak' } },
                  playoffBracketSnapshot: { mode: 'empty', rounds: [] },
                },
                {
                  year: 2032,
                  id: 's2',
                  standings: [{ id: 7, abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 410, pa: 300 }],
                  champion: { id: 7, abbr: 'SEA' },
                  awards: {},
                  playoffBracketSnapshot: { mode: 'empty', rounds: [] },
                },
                { year: 2030, standings: [{ id: 7, abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 420, pa: 300 }], champion: { id: 7, abbr: 'SEA' }, playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
                { year: 2031, standings: [{ id: 7, abbr: 'SEA', wins: 8, losses: 9, ties: 0, pf: 320, pa: 330 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
                { year: 2032, standings: [{ id: 7, abbr: 'SEA', wins: 5, losses: 12, ties: 0, pf: 280, pa: 390 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
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
    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-timeline')).toBeTruthy();
    });
    const timeline = screen.getByTestId('team-history-season-timeline');
    expect(screen.getByText(/Showing 2 of 2 seasons/i)).toBeTruthy();

    const search = screen.getByLabelText(/Search franchise seasons/i);
    fireEvent.change(search, { target: { value: 'alex' } });
    await waitFor(() => {
      expect(screen.getByText(/Showing 1 of 2 seasons/i)).toBeTruthy();
    });
    const gridAfterSearch = timeline.querySelector('[style*="display: grid"]');
    expect(gridAfterSearch).toBeTruthy();
    expect(within(gridAfterSearch).getByText('2030')).toBeTruthy();
    expect(within(gridAfterSearch).queryByText('2032')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 seasons/i)).toBeTruthy();
    });

    const sortSelect = timeline.querySelector('select');
    expect(sortSelect).toBeTruthy();
    fireEvent.change(sortSelect, { target: { value: 'wins' } });
    fireEvent.click(screen.getByRole('button', { name: /Sort direction/i }));
    await waitFor(() => {
      const grid = timeline.querySelector('[style*="display: grid"]');
      const blob = grid?.textContent ?? '';
      expect(blob.indexOf('8-9')).toBeLessThan(blob.indexOf('12-5'));
      const showLabel = screen.getByTestId('team-history-showing-label');
      expect(showLabel.textContent).toMatch(/Showing 3 of 3 seasons/i);
    });
  });

  it('filters timeline by year text and updates showing count', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { year: 2030, standings: [{ id: 7, abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 420, pa: 300 }], champion: { id: 7, abbr: 'SEA' }, playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
                { year: 2031, standings: [{ id: 7, abbr: 'SEA', wins: 8, losses: 9, ties: 0, pf: 320, pa: 330 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
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
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 2 of 2/i);
    });
    const input = screen.getByPlaceholderText('Filter by year');
    fireEvent.change(input, { target: { value: '2030' } });
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 1 of 2/i);
    });
  });

  it('reset filters restores full showing count', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { year: 2030, standings: [{ id: 7, abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 420, pa: 300 }], champion: { id: 7, abbr: 'SEA' }, playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
                { year: 2031, standings: [{ id: 7, abbr: 'SEA', wins: 8, losses: 9, ties: 0, pf: 320, pa: 330 }], playoffBracketSnapshot: { mode: 'empty', rounds: [] } },
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
    await waitFor(() => expect(screen.getByTestId('team-history-showing-label')).toBeTruthy());
    const input = screen.getByPlaceholderText('Filter by year');
    fireEvent.change(input, { target: { value: '2030' } });
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 1 of 2/i);
    });
    const resetBtn = screen.getByTestId('team-history-reset-filters');
    fireEvent.click(resetBtn);
    await waitFor(() => {
      expect(screen.getByTestId('team-history-showing-label').textContent).toMatch(/Showing 2 of 2/i);
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

  it('filters timeline by year search, shows count, and resets', async () => {
    const seasons = [
      { year: 2030, standings: [{ id: 1, abbr: 'ALP', wins: 12, losses: 5, ties: 0, pf: 400, pa: 300 }] },
      { year: 2031, standings: [{ id: 1, abbr: 'ALP', wins: 4, losses: 13, ties: 0, pf: 260, pa: 420 }] },
      { year: 2032, standings: [{ id: 1, abbr: 'ALP', wins: 9, losses: 8, ties: 0, pf: 360, pa: 340 }] },
    ];
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons } }),
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [] } }),
          getDraftClass: vi.fn().mockResolvedValue({ payload: { model: null } }),
        }}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
      />,
    );

    const count = await screen.findByTestId('team-history-timeline-count');
    expect(count.textContent).toMatch(/Showing 3 of 3 seasons/);

    fireEvent.change(screen.getByPlaceholderText(/search year or mvp/i), {
      target: { value: '2031' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('team-history-timeline-count').textContent).toMatch(/Showing 1 of 3 seasons/),
    );

    fireEvent.click(screen.getByTestId('team-history-timeline-reset'));
    await waitFor(() =>
      expect(screen.getByTestId('team-history-timeline-count').textContent).toMatch(/Showing 3 of 3 seasons/),
    );
  });

  it('sorts timeline by wins (most) while reset removes the chip', async () => {
    const seasons = [
      { year: 2040, standings: [{ id: 1, abbr: 'ALP', wins: 4, losses: 13, ties: 0, pf: 220, pa: 410 }] },
      { year: 2041, standings: [{ id: 1, abbr: 'ALP', wins: 13, losses: 4, ties: 0, pf: 480, pa: 280 }] },
      { year: 2042, standings: [{ id: 1, abbr: 'ALP', wins: 8, losses: 9, ties: 0, pf: 320, pa: 330 }] },
    ];
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Alpha', abbr: 'ALP' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons } }),
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

    await screen.findByTestId('team-history-timeline-count');
    fireEvent.change(screen.getByLabelText(/sort seasons/i), { target: { value: 'winsDesc' } });

    await waitFor(() => {
      const controls = screen.getByTestId('team-history-timeline-controls');
      expect(within(controls).getByDisplayValue(/Wins \(most\)/i)).toBeTruthy();
    });

    const yearMatches = screen.getAllByText(/^204[012]$/).map((el) => el.textContent);
    expect(yearMatches.indexOf('2041')).toBeLessThan(yearMatches.indexOf('2042'));
    expect(yearMatches.indexOf('2042')).toBeLessThan(yearMatches.indexOf('2040'));

    fireEvent.click(screen.getByTestId('team-history-timeline-reset'));
    expect(screen.queryByTestId('team-history-timeline-reset')).toBeNull();
  });

  it('hides timeline count when there are no archived seasons (fresh save)', async () => {
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
    await waitFor(() => expect(screen.queryByTestId('team-history-timeline-count')).toBeNull());
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
