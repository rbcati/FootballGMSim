/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoryHub from './HistoryHub.jsx';

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
});
