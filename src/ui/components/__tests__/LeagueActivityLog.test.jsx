/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import LeagueActivityLog from '../LeagueActivityLog.jsx';

const baseTransactions = [
  { id: 1, type: 'signing', typeLabel: 'Signing', seasonId: 's2030', week: 2, teamId: 1, teamAbbr: 'ALP', playerId: 11, playerName: 'Avery Fields', headline: 'ALP signed Avery Fields' },
  { id: 2, type: 'trade', typeLabel: 'Trade', seasonId: 's2030', week: 5, teamId: 2, teamAbbr: 'BRV', headline: 'ALP ↔ BRV completed a trade package' },
  { id: 3, type: 'release', typeLabel: 'Release', seasonId: 's2031', week: 1, teamId: 1, teamAbbr: 'ALP', playerId: 12, playerName: 'Other Player', headline: 'ALP released Other Player' },
];

function makeActions(transactions = baseTransactions) {
  return {
    getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
    getTransactions: vi.fn().mockResolvedValue({ payload: { transactions } }),
  };
}

describe('LeagueActivityLog', () => {
  afterEach(() => cleanup());

  it('renders rows with stable showing count and supports reset', async () => {
    render(
      <LeagueActivityLog
        league={{ teams: [{ id: 1, abbr: 'ALP' }, { id: 2, abbr: 'BRV' }], userTeamId: 1, seasonId: 's2031', year: 2031 }}
        actions={makeActions()}
        onPlayerSelect={vi.fn()}
        onTeamSelect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 3 of 3 transactions/),
    );

    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'trade' } });
    await waitFor(() => expect(screen.getByTestId('league-activity-reset')).toBeTruthy());

    fireEvent.click(screen.getByTestId('league-activity-reset'));
    await waitFor(() => expect(screen.queryByTestId('league-activity-reset')).toBeNull());
  });

  it('sorts transactions oldest-first when the sort selector is changed', async () => {
    render(
      <LeagueActivityLog
        league={{ teams: [{ id: 1, abbr: 'ALP' }, { id: 2, abbr: 'BRV' }], userTeamId: 1 }}
        actions={makeActions()}
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LeagueActivityLog from '../LeagueActivityLog.jsx';

describe('LeagueActivityLog', () => {
  it('searches, filters, sorts, counts, and resets transaction rows client-side', async () => {
    const transactions = [
      { id: 1, seasonId: 's1', week: 1, type: 'signing', typeLabel: 'Signing', playerId: 11, playerName: 'Zed Runner', teamId: 1, teamAbbr: 'DAL', headline: 'DAL signed Zed Runner' },
      { id: 2, seasonId: 's1', week: 2, type: 'trade', typeLabel: 'Trade', playerId: 12, playerName: 'Avery Fields', fromTeamId: 2, fromTeamAbbr: 'NYG', toTeamId: 1, toTeamAbbr: 'DAL', headline: 'NYG and DAL completed a trade' },
    ];
    render(
      <LeagueActivityLog
        league={{ seasonId: 's1', year: 2030, teams: [{ id: 1, abbr: 'DAL' }, { id: 2, abbr: 'NYG' }] }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getTransactions: vi.fn().mockResolvedValue({ payload: { transactions } }),
        }}
        onPlayerSelect={vi.fn()}
        onTeamSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('league-activity-count').textContent).toMatch(/3 of 3/));

    fireEvent.change(screen.getByLabelText(/sort league activity/i), { target: { value: 'oldest' } });

    const list = await waitFor(() => screen.getByRole('list'));
    const headlines = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(headlines[0]).toMatch(/signed Avery Fields/);
    expect(headlines[headlines.length - 1]).toMatch(/released Other Player/);
  });

  it('shows a safe empty state when no transactions are tracked', async () => {
    render(
      <LeagueActivityLog
        league={{ teams: [{ id: 1, abbr: 'ALP' }], userTeamId: 1 }}
        actions={makeActions([])}
        onPlayerSelect={vi.fn()}
        onTeamSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Transactions will appear/i)).toBeTruthy());
    expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 0 of 0 transactions/);
    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 transactions/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Search$/i), { target: { value: 'Avery' } });
    expect(screen.getByText(/Showing 1 of 2 transactions/i)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('league-activity-row')[0].textContent).toMatch(/Avery Fields/));

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 transactions/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Sort$/i), { target: { value: 'player' } });
    fireEvent.click(screen.getByRole('button', { name: /Desc/i }));
    await waitFor(() => expect(screen.getAllByTestId('league-activity-row')[0].textContent).toMatch(/Avery Fields/));

    fireEvent.change(screen.getByLabelText(/^Type$/i), { target: { value: 'trade' } });
    expect(screen.getByText(/Showing 1 of 2 transactions/i)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('league-activity-row')[0].textContent).toMatch(/Trade/));
  });
});
