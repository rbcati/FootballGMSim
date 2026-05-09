/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AwardsRecordsScreen from '../AwardsRecordsScreen.jsx';

describe('AwardsRecordsScreen', () => {
  it('renders archived V1 awards by season and honest records placeholder', async () => {
    render(
      <AwardsRecordsScreen
        onBack={vi.fn()}
        onPlayerSelect={vi.fn()}
        league={{ teams: [{ id: 1, name: 'BOS' }], userTeamId: 1 }}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [{
                year: 2031,
                awards: {
                  mvp: { playerId: 1, name: 'Ace QB', pos: 'QB' },
                  opoy: { playerId: 2, name: 'Top RB', pos: 'RB' },
                  dpoy: { playerId: 3, name: 'Edge Star', pos: 'EDGE' },
                  bestQB: { playerId: 4, name: 'Also QB', pos: 'QB' },
                },
              }],
            },
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/By season/i)).toBeTruthy();
      expect(screen.getByText(/Season 2031/i)).toBeTruthy();
      expect(screen.getByText(/Most Valuable Player:/i)).toBeTruthy();
      expect(screen.getAllByText(/Ace QB/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/2031 · Most Valuable Player/i)).toBeTruthy();
      expect(screen.getByText(/Records coming later/i)).toBeTruthy();
    });
  });
});
