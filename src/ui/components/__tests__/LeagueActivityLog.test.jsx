/** @vitest-environment jsdom */
import React from 'react';
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
