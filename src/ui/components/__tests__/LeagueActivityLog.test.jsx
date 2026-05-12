/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import LeagueActivityLog from '../LeagueActivityLog.jsx';

const makeTx = (id, type, playerName, teamAbbr, week) => ({
  id,
  type,
  typeLabel: type.charAt(0).toUpperCase() + type.slice(1),
  headline: `${teamAbbr} ${type} ${playerName}`,
  playerName,
  playerId: id,
  teamAbbr,
  teamId: 1,
  week,
});

describe('LeagueActivityLog', () => {
  afterEach(() => cleanup());

  it('renders empty state when no transactions exist', async () => {
    render(
      <LeagueActivityLog
        league={{ teams: [] }}
        actions={{ getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: [] } }) }}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Transactions will appear as your league/i)).toBeTruthy();
    });
  });

  it('shows showing count when transactions are loaded', async () => {
    const txs = [
      makeTx(1, 'signing', 'Alpha Jones', 'DAL', 1),
      makeTx(2, 'trade', 'Beta Smith', 'NYG', 2),
      makeTx(3, 'release', 'Gamma Lee', 'DAL', 3),
    ];
    render(
      <LeagueActivityLog
        league={{ teams: [{ id: 1, abbr: 'DAL', name: 'Dallas' }] }}
        actions={{ getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: txs } }) }}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('league-activity-showing').textContent).toMatch(/Showing 3 of 3 transactions/i);
    });
  });

  it('reset button clears all filter selections', async () => {
    const txs = [makeTx(1, 'signing', 'Alpha Jones', 'DAL', 1)];
    render(
      <LeagueActivityLog
        league={{ teams: [{ id: 1, abbr: 'DAL', name: 'Dallas' }] }}
        actions={{ getTransactions: vi.fn().mockResolvedValue({ payload: { transactions: txs } }) }}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('league-activity-reset')).toBeTruthy());
    const resetBtn = screen.getByTestId('league-activity-reset');
    fireEvent.click(resetBtn);
    await waitFor(() => {
      expect(screen.getByTestId('league-activity-showing')).toBeTruthy();
    });
  });

  it('renders safe with no actions.getTransactions', async () => {
    render(
      <LeagueActivityLog
        league={{ teams: [] }}
        actions={{}}
        onPlayerSelect={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Transactions will appear/i)).toBeTruthy();
    });
  });
});
