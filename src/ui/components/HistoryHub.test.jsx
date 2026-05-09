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
