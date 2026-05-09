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

  it('renders class card when a class has empty inductees (no crash)', async () => {
    render(
      <HallOfFame
        onPlayerSelect={vi.fn()}
        actions={{
          getHallOfFame: vi.fn().mockResolvedValue({
            payload: {
              players: [{ id: 'solo', name: 'Solo', pos: 'QB', legacyScore: 70, accoladeSummary: { mvps: 0, superBowls: 0, proBowls: 0 }, stats: {} }],
              classes: [{ year: 2033, classId: 'hof-2033', inductees: [] }],
            },
          }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hall-of-fame-classes')).toBeTruthy();
      expect(screen.getAllByText(/Class of 2033/).length).toBeGreaterThanOrEqual(1);
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
