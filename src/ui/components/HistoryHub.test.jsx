/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HistoryHub from './HistoryHub.jsx';

afterEach(() => {
  cleanup();
});

describe('HistoryHub', () => {
  it('renders honest empty state when no archives exist', async () => {
    render(<HistoryHub onNavigate={vi.fn()} actions={{ getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }) }} />);
    await waitFor(() => {
      expect(screen.getByText(/No completed seasons are archived yet/i)).toBeTruthy();
    });
  });

  it('renders recent archived season previews', async () => {
    render(
      <HistoryHub
        onNavigate={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2026, champion: { abbr: 'DAL' }, runnerUp: { abbr: 'NYG' }, awards: { mvp: { name: 'Ace QB' } } },
              ],
            },
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/2026 · DAL/)).toBeTruthy();
      expect(screen.getByText(/Runner-up: NYG · MVP: Ace QB/)).toBeTruthy();
      expect(screen.getByText(/View season →/)).toBeTruthy();
    });
  });

  it('shows user team record on archived cards when standings include the user franchise', async () => {
    render(
      <HistoryHub
        league={{ userTeamId: 2 }}
        onNavigate={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                {
                  id: 's1',
                  year: 2026,
                  champion: { abbr: 'DAL' },
                  runnerUp: { abbr: 'NYG' },
                  awards: { mvp: { name: 'Ace QB' } },
                  standings: [
                    { id: 1, wins: 8, losses: 9 },
                    { id: 2, wins: 11, losses: 6 },
                  ],
                },
              ],
            },
          }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Your team: 11-6/)).toBeTruthy();
    });
  });

  it('shows Hall of Fame preview when getHallOfFame returns players or classes', async () => {
    render(
      <HistoryHub
        onNavigate={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getHallOfFame: vi.fn().mockResolvedValue({
            payload: {
              players: [{ id: 'p1', name: 'Legend', legacyScore: 90, hofScore: 90 }],
              classes: [{ year: 2031, classId: 'hof-2031', inductees: [{ playerId: 'p1', name: 'Legend', legacyScore: 90, score: 90 }] }],
            },
          }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('history-hub-hof-preview')).toBeTruthy();
      expect(screen.getByText(/Class of 2031/)).toBeTruthy();
    });
  });

  it('does not show HOF preview when getHallOfFame rejects', async () => {
    render(
      <HistoryHub
        onNavigate={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getHallOfFame: vi.fn().mockRejectedValue(new Error('worker')),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('history-hub-hof-preview')).toBeNull();
    });
  });

  it('prefers latest class with inductees for HOF preview headline', async () => {
    render(
      <HistoryHub
        onNavigate={vi.fn()}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({ payload: { seasons: [] } }),
          getHallOfFame: vi.fn().mockResolvedValue({
            payload: {
              players: [],
              classes: [
                { year: 2032, classId: 'hof-2032', inductees: [] },
                { year: 2030, classId: 'hof-2030', inductees: [{ playerId: 'x', name: 'Old Star', legacyScore: 88, score: 88 }] },
              ],
            },
          }),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('history-hub-hof-preview')).toBeTruthy();
      expect(screen.getByText(/Class of 2030/)).toBeTruthy();
      expect(screen.getByText(/Spotlight: Old Star/)).toBeTruthy();
    });
  });

  it('routes to history with selected season when preview clicked', async () => {
    const onNavigate = vi.fn();
    const onSelectSeason = vi.fn();
    const view = render(
      <HistoryHub
        onNavigate={onNavigate}
        onSelectSeason={onSelectSeason}
        actions={{
          getAllSeasons: vi.fn().mockResolvedValue({
            payload: {
              seasons: [
                { id: 's1', year: 2026, champion: { abbr: 'DAL' }, runnerUp: { abbr: 'NYG' }, awards: { mvp: { name: 'Ace QB' } } },
              ],
            },
          }),
        }}
      />,
    );
    const seasonLabel = await within(view.container).findByText(/2026 · DAL/);
    fireEvent.click(seasonLabel.closest('button'));
    await waitFor(() => {
      expect(onSelectSeason).toHaveBeenCalledWith('s1');
      expect(onNavigate).toHaveBeenCalledWith('History');
    });
  });
});
