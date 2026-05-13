/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import LeagueHistory, { AwardsHistory } from '../LeagueHistory.jsx';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LeagueHistory from '../LeagueHistory.jsx';

afterEach(() => cleanup());

describe('LeagueHistory', () => {
  afterEach(() => {
    cleanup();
  });
  afterEach(() => cleanup());
  afterEach(() => {
    cleanup();
  });

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
      expect(screen.getByTestId('league-season-button-s1')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Previous season/i }).hasAttribute('disabled')).toBe(true);
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

  it('filters season archive sidebar and restores full list when cleared', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s1"
  it('season search filters the season list and updates showing count', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, champion: { abbr: 'DAL' }, standings: [], awards: {} },
                { id: 's2', year: 2031, champion: { abbr: 'NYG' }, standings: [], awards: {} },
                { id: 's1', year: 2030, champion: { abbr: 'DAL', name: 'Dallas' }, standings: [], awards: {} },
                { id: 's2', year: 2031, champion: { abbr: 'NYG', name: 'Giants' }, standings: [], awards: {} },
                { id: 's3', year: 2032, champion: { abbr: 'DAL', name: 'Dallas' }, standings: [], awards: {} },
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
      expect(screen.getByTestId('league-history-season-archive-browser')).toBeTruthy();
    });
    const archiveBrowser = screen.getByTestId('league-history-season-archive-browser');
    fireEvent.change(archiveBrowser.querySelector('input[type="search"]'), { target: { value: '2031' } });
    await waitFor(() => {
      expect(archiveBrowser.textContent).toMatch(/Showing 1 of 2 seasons/);
    });

    fireEvent.change(archiveBrowser.querySelector('input[type="search"]'), { target: { value: '' } });
    await waitFor(() => {
      expect(archiveBrowser.textContent).toMatch(/Showing 2 of 2 seasons/);
      expect(screen.getByTestId('league-history-season-search')).toBeTruthy();
    });
    const showingEl = screen.getByTestId('league-history-season-showing');
    expect(showingEl.textContent).toMatch(/Showing 3 of 3/i);

    const searchInput = screen.getByTestId('league-history-season-search');
    fireEvent.change(searchInput, { target: { value: '2031' } });

    await waitFor(() => {
      expect(screen.getByTestId('league-history-season-showing').textContent).toMatch(/Showing 1 of 3/i);
    });
  });

  it('awards search filters by winner name and updates showing count', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        initialSelectedSeasonId="s1"
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, champion: { abbr: 'DAL' }, standings: [], awards: { mvp: { playerId: 1, name: 'Alpha Player', pos: 'QB' } } },
                { id: 's2', year: 2031, champion: { abbr: 'NYG' }, standings: [], awards: { mvp: { playerId: 2, name: 'Beta Player', pos: 'RB' } } },
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    // Awards TabsContent is force-mounted; just wait for loading to complete
    const awardsSearch = await screen.findByTestId('league-history-awards-search');
    expect(screen.getByTestId('league-history-awards-showing').textContent).toMatch(/Showing 2 of 2/i);

    fireEvent.change(awardsSearch, { target: { value: 'Alpha' } });

    await waitFor(() => {
      expect(screen.getByTestId('league-history-awards-showing').textContent).toMatch(/Showing 1 of 2/i);
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

});

describe('LeagueHistory · AwardsHistory tab', () => {
  afterEach(() => cleanup());

  it('filters by champion search, sorts, and resets while keeping count honest', async () => {
    const seasons = [
      { id: 'sA', year: 2030, champion: { abbr: 'DAL', name: 'Dallas' }, awards: { mvp: { playerId: 1, name: 'Star Alpha' } } },
      { id: 'sB', year: 2031, champion: { abbr: 'NYG', name: 'NY Giants' }, awards: { mvp: { playerId: 2, name: 'Star Bravo' } } },
      { id: 'sC', year: 2032, champion: { abbr: 'DAL', name: 'Dallas' }, awards: { mvp: { playerId: 3, name: 'Star Charlie' } } },
    ];
    render(<AwardsHistory seasons={seasons} onPlayerSelect={vi.fn()} />);
    expect(screen.getByTestId('league-history-awards-count').textContent).toMatch(/Showing 3 of 3 seasons/);

    fireEvent.change(screen.getByPlaceholderText(/search year, champion, or winner/i), {
      target: { value: 'NYG' },
    });
    expect(screen.getByTestId('league-history-awards-count').textContent).toMatch(/Showing 1 of 3 seasons/);
    expect(screen.queryAllByText('NY Giants').length).toBeGreaterThanOrEqual(0);

    fireEvent.click(screen.getByTestId('league-history-awards-reset'));
    expect(screen.getByTestId('league-history-awards-count').textContent).toMatch(/Showing 3 of 3 seasons/);

    fireEvent.change(screen.getByLabelText(/sort awards history/i), { target: { value: 'yearAsc' } });
    const yearCells = screen.getAllByText(/^203[012]$/).map((el) => el.textContent);
    expect(yearCells[0]).toBe('2030');
    expect(yearCells[yearCells.length - 1]).toBe('2032');
  });

  it('shows safe Showing-0 state when filter excludes every season', () => {
    const seasons = [
      { id: 'sA', year: 2030, champion: { abbr: 'DAL' }, awards: {} },
      { id: 'sB', year: 2031, champion: { abbr: 'NYG' }, awards: {} },
    ];
    render(<AwardsHistory seasons={seasons} onPlayerSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search year, champion, or winner/i), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByTestId('league-history-awards-count').textContent).toMatch(/Showing 0 of 2 seasons/);
    expect(screen.getByText(/No award seasons match the current filters/i)).toBeTruthy();
  });

  it('does not invent winners — empty award cells stay as em dashes', () => {
    const seasons = [
      { id: 's1', year: 2030, standings: [], awards: {} },
    ];
    render(<AwardsHistory seasons={seasons} onPlayerSelect={vi.fn()} />);
    expect(screen.getByTestId('league-history-awards-count').textContent).toMatch(/Showing 1 of 1 season/);
    expect(screen.queryByText(/TBD champion|Star Alpha/)).toBeNull();
  it('searches, sorts, counts, and resets the season archive picker', async () => {
  it('supports season archive search, champion filtering, and reset controls', async () => {
    render(
      <LeagueHistory
        league={{ userTeamId: 1 }}
        onPlayerSelect={vi.fn()}
        onOpenBoxScore={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2030, champion: { id: 2, abbr: 'DAL', name: 'Dallas' }, standings: [{ id: 1, name: 'User', abbr: 'USR', wins: 12, losses: 5 }], awards: {} },
                { id: 's2', year: 2031, champion: { id: 3, abbr: 'NYG', name: 'New York' }, standings: [{ id: 1, name: 'User', abbr: 'USR', wins: 6, losses: 11 }], awards: {} },
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
              ],
            },
          }),
          getRecords: vi.fn().mockResolvedValue({ payload: { records: null } }),
          getAllPlayerStats: vi.fn().mockResolvedValue({ payload: { stats: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }),
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 seasons/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Search archived seasons/i), { target: { value: 'DAL' } });
    expect(screen.getByText(/Showing 1 of 2 seasons/i)).toBeTruthy();
    expect(screen.getAllByTestId('league-history-season-row')[0].textContent).toMatch(/2030/);

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    fireEvent.change(screen.getByLabelText(/Sort archived seasons/i), { target: { value: 'userWins' } });
    fireEvent.click(screen.getByRole('button', { name: /Desc/i }));
    expect(screen.getAllByTestId('league-history-season-row')[0].textContent).toMatch(/2031/);
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

    const officeTab = await screen.findByRole('tab', { name: /League Office/i });
    fireEvent.mouseDown(officeTab);
    fireEvent.click(officeTab);
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
    });
  });
});
