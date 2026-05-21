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

  it('supports timeline search, numeric sort, showing counts, and reset filters', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Dallas', abbr: 'DAL' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
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

  it('selecting a season shows detail summary, moves, draft flash, leaders, and opens key Game Book', async () => {
    const onOpen = vi.fn();
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2055,
                seasonId: 's2055',
                id: 's2055',
                standings: [
                  { id: 7, name: 'Seattle', abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 455, pa: 310 },
                  { id: 3, name: 'River', abbr: 'RIV', wins: 9, losses: 8, ties: 0, pf: 350, pa: 340 },
                ],
                champion: { id: 7, abbr: 'SEA' },
                gameIndex: [
                  { id: 's2055_w4_3_7', week: 4, homeId: 7, awayId: 3, homeScore: 42, awayScore: 10 },
                  { id: 's2055_w9_7_3', week: 9, homeId: 3, awayId: 7, homeScore: 24, awayScore: 23 },
                ],
                notableGames: [
                  { id: 's2055_w22_3_7', type: 'championship', week: 22, homeId: 7, awayId: 3, homeScore: 30, awayScore: 27 },
                ],
                playerStatLeaders: {
                  passingYards: { playerId: 10, playerName: 'Archive QB', value: 4300, teamId: 7, teamAbbr: 'SEA' },
                },
                awards: {
                  mvp: { playerId: 10, name: 'Archive QB', teamId: 7, teamAbbr: 'SEA' },
                },
              }],
            },
          }),
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
          getTransactions: vi.fn().mockResolvedValue({
            payload: {
              transactions: [
                { id: 1, type: 'trade', seasonId: 's2055', week: 3, teamId: 7, teamAbbr: 'SEA', headline: 'SEA acquired Edge Star', playerId: 44, playerName: 'Edge Star' },
                { id: 2, type: 'signing', seasonId: 's2054', week: 4, teamId: 7, teamAbbr: 'SEA', headline: 'Older signing' },
              ],
            },
          }),
          getDraftClasses: vi.fn().mockResolvedValue({ payload: { classes: [{ seasonId: 's2055', year: 2055, teamIds: [7] }] } }),
          getDraftClass: vi.fn().mockResolvedValue({
            payload: {
              model: {
                year: 2055,
                picks: [
                  { playerName: 'Future LT', draftTeamId: 7, legacyScore: 88, redraftDelta: 52 },
                ],
                teamGrades: [{ teamId: 7, gradeLabel: 'A-' }],
              },
            },
          }),
        }}
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={onOpen}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-2055')).toBeTruthy();
    });
    expect(screen.getByText(/Tap View season/i)).toBeTruthy();
    expect(screen.getByTestId('team-history-view-season-2055')).toBeTruthy();
    expect(screen.getByText('Season detail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /View 2055 season detail/i }));

    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-detail')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Season selected/i })).toBeTruthy();
    expect(screen.getByText(/Postseason\/title finish/i)).toBeTruthy();
    expect(screen.getAllByText(/Biggest games/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Front office moves/i)).toBeTruthy();
    expect(screen.getByTestId('team-history-season-detail-record').textContent).toContain('12-5');
    expect(screen.getByText(/455 \/ 310/i)).toBeTruthy();
    expect(screen.getByTestId('team-history-season-detail-diff').textContent).toContain('+145');
    const detailMoves = screen.getAllByTestId('team-history-season-detail-move').map((node) => node.textContent ?? '');
    expect(detailMoves.join(' ')).toContain('SEA acquired Edge Star');
    expect(detailMoves.join(' ')).not.toContain('Older signing');
    expect(screen.getAllByText(/Grade A-/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Archive QB/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByTestId('team-history-season-detail-game')[0]);
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to all seasons/i }));
    expect(screen.queryByTestId('team-history-season-detail')).toBeNull();
    expect(screen.getByTestId('team-history-season-2055')).toBeTruthy();
  });

  it('season detail handles legacy seasons without games or moves', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 2, name: 'Legacy', abbr: 'LEG' }], userTeamId: 2 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2040,
                standings: [{ id: 2, name: 'Legacy', abbr: 'LEG', wins: 6, losses: 11, ties: 0, pf: 270, pa: 390 }],
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
      expect(screen.getByTestId('team-history-season-2040')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /View 2040 season detail/i }));

    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-detail')).toBeTruthy();
    });
    expect(screen.getByText(/No scored game rows were saved/i)).toBeTruthy();
    expect(screen.getByText(/No trades, signings, contracts/i)).toBeTruthy();
    expect(screen.getByText(/No team-matched leader or award rows/i)).toBeTruthy();
  });

  it('keeps timeline filters after selecting and closing season detail', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 1, name: 'Dallas', abbr: 'DAL' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  year: 2030,
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 12, losses: 5, ties: 0, pf: 420, pa: 310 }],
                  awards: { mvp: { playerId: 7, name: 'Title QB' } },
                },
                {
                  year: 2031,
                  standings: [{ id: 1, name: 'Dallas', abbr: 'DAL', wins: 9, losses: 8, ties: 0, pf: 360, pa: 340 }],
                  awards: { mvp: { playerId: 9, name: 'Ace Star' } },
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

    await waitFor(() => {
      expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 2 of 2 seasons');
    });

    fireEvent.change(screen.getByLabelText(/Search team history seasons/i), { target: { value: 'Ace Star' } });
    await waitFor(() => {
      expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 1 of 2 seasons');
    });

    fireEvent.click(screen.getByRole('button', { name: /View 2031 season detail/i }));
    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-detail')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to all seasons/i }));
    expect(screen.queryByTestId('team-history-season-detail')).toBeNull();
    expect(screen.getByLabelText(/Search team history seasons/i).value).toBe('Ace Star');
    expect(screen.getByTestId('team-history-timeline-count').textContent).toContain('Showing 1 of 2 seasons');
  });

  it('disables key game buttons when Game Book cannot be opened', async () => {
    render(
      <TeamHistoryScreen
        league={{ teams: [{ id: 7, name: 'Seattle', abbr: 'SEA' }], userTeamId: 7 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2056,
                standings: [
                  { id: 7, name: 'Seattle', abbr: 'SEA', wins: 10, losses: 7, ties: 0, pf: 390, pa: 320 },
                  { id: 3, name: 'River', abbr: 'RIV', wins: 7, losses: 10, ties: 0, pf: 300, pa: 330 },
                ],
                gameIndex: [
                  { id: 's2056_w3_3_7', week: 3, homeId: 7, awayId: 3, homeScore: 28, awayScore: 24 },
                ],
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
      expect(screen.getByTestId('team-history-season-2056')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /View 2056 season detail/i }));
    await waitFor(() => {
      expect(screen.getByTestId('team-history-season-detail')).toBeTruthy();
    });

    const gameButton = screen.getAllByTestId('team-history-season-detail-game')[0];
    expect(gameButton.disabled).toBe(true);
    expect(screen.getByText(/Game Book unavailable/i)).toBeTruthy();
  });
});
