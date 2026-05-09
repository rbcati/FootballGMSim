/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import HallOfFame from '../HallOfFame.jsx';

afterEach(() => cleanup());

describe('HallOfFame', () => {
  it('renders empty state copy when no players or classes', async () => {
    render(
      <HallOfFame
        onPlayerSelect={vi.fn()}
        actions={{
          getHallOfFame: vi.fn().mockResolvedValue({ payload: { players: [], classes: [] } }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hall-of-fame-empty')).toBeTruthy();
      expect(screen.getByText(/No Hall of Fame classes yet/i)).toBeTruthy();
    });
  });

  it('renders induction class list from payload', async () => {
    render(
      <HallOfFame
        onPlayerSelect={vi.fn()}
        actions={{
          getHallOfFame: vi.fn().mockResolvedValue({
            payload: {
              players: [],
              classes: [
                {
                  year: 2032,
                  classId: 'hof-2032',
                  inductees: [
                    { playerId: 'p1', name: 'Ace QB', pos: 'QB', primaryTeamAbbr: 'DAL', legacyScore: 82, tier: 'silver', reasons: ['MVP'] },
                  ],
                },
              ],
            },
          }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hall-of-fame-classes')).toBeTruthy();
      expect(screen.getByText(/Class of 2032/)).toBeTruthy();
      expect(screen.getByText(/Ace QB/)).toBeTruthy();
    });
  });
});
