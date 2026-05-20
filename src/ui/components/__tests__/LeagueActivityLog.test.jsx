/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LeagueActivityLog from '../LeagueActivityLog.jsx';

const baseTransactions = [
  { id: 1, type: 'signing', typeLabel: 'Signing', seasonId: 's2030', week: 2, teamId: 1, teamAbbr: 'ALP', playerId: 11, playerName: 'Avery Fields', headline: 'ALP signed Avery Fields' },
  { id: 2, type: 'trade', typeLabel: 'Trade', seasonId: 's2030', week: 5, teamId: 2, teamAbbr: 'BRV', headline: 'ALP and BRV completed a trade package' },
  { id: 3, type: 'release', typeLabel: 'Release', seasonId: 's2031', week: 1, teamId: 1, teamAbbr: 'ALP', playerId: 12, playerName: 'Other Player', headline: 'ALP released Other Player' },
];

const baseLeague = {
  teams: [{ id: 1, abbr: 'ALP' }, { id: 2, abbr: 'BRV' }],
  userTeamId: 1,
  seasonId: 's2031',
  year: 2031,
  franchiseChronicle: [],
  newsItems: [],
};

function makeActions(transactions = baseTransactions) {
  return {
    getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
    getTransactions: vi.fn().mockResolvedValue({ payload: { transactions } }),
  };
}

function renderActivity(actions = makeActions(), league = baseLeague) {
  render(
    <LeagueActivityLog
      league={league}
      actions={actions}
      onPlayerSelect={vi.fn()}
      onTeamSelect={vi.fn()}
    />,
  );
}

describe('LeagueActivityLog', () => {
  afterEach(() => cleanup());

  it('searches, filters, sorts, counts, and resets activity rows client-side', async () => {
    renderActivity();

    await waitFor(() => expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 3 of 3 activities/));

    fireEvent.change(screen.getByLabelText(/^Search$/i), { target: { value: 'Avery' } });
    expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 1 of 3 activities/);
    expect(screen.getAllByTestId('league-activity-row')[0].textContent).toMatch(/Avery Fields/);

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    await waitFor(() => expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 3 of 3 activities/));

    fireEvent.change(screen.getByLabelText(/^Type$/i), { target: { value: 'trade' } });
    expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 1 of 3 activities/);
    expect(screen.getAllByTestId('league-activity-row')[0].textContent).toMatch(/Trade/);
  });

  it('sorts transactions oldest-first when sort direction is toggled', async () => {
    renderActivity();

    const list = await waitFor(() => screen.getByRole('list'));
    fireEvent.click(screen.getByRole('button', { name: /Desc/i }));

    await waitFor(() => {
      const headlines = within(list).getAllByRole('listitem').map((li) => li.textContent ?? '');
      expect(headlines[0]).toMatch(/signed Avery Fields/);
      expect(headlines[headlines.length - 1]).toMatch(/released Other Player/);
    });
  });

  it('shows a safe empty state when no activity is tracked', async () => {
    renderActivity(makeActions([]));

    await waitFor(() => expect(screen.getByText(/Activity will appear/i)).toBeTruthy());
    expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 0 of 0 activities/);
  });

  it('renders safely when actions.getTransactions is unavailable', async () => {
    renderActivity({ getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }) });

    await waitFor(() => expect(screen.getByText(/Activity will appear/i)).toBeTruthy());
  });

  it('renders chronicle activity when transaction rows are unavailable', async () => {
    renderActivity(makeActions([]), {
      ...baseLeague,
      franchiseChronicle: [{
        id: 'contract-2031-wk4-1-77',
        type: 'contract',
        season: 2031,
        week: 4,
        headline: 'Mason Vale signs with the franchise',
        summary: '2 years - $18M total',
        meta: { teamId: 1, player: { id: 77, name: 'Mason Vale' } },
      }],
    });

    await waitFor(() => expect(screen.getByText(/Mason Vale signs with the franchise/i)).toBeTruthy());
    expect(screen.getByTestId('league-activity-count').textContent).toMatch(/Showing 1 of 1 activity/);
  });
});
