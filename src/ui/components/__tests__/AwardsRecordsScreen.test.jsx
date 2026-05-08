/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AwardsRecordsScreen from '../AwardsRecordsScreen.jsx';

describe('AwardsRecordsScreen', () => {
  it('renders archived V1 award rows and honest records placeholder', async () => {
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
                  bestQB: { playerId: 1, name: 'Ace QB', pos: 'QB' },
                },
              }],
            },
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/2031 · Most Valuable Player/i)).toBeTruthy();
      expect(screen.getByText(/2031 · Best QB/i)).toBeTruthy();
      expect(screen.getByText(/Records coming later/i)).toBeTruthy();
    });
  });
});
