/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrainingCamp from '../TrainingCamp.jsx';

afterEach(() => cleanup());

const league = {
  year: 2028,
  seasonId: 's2028',
  week: 6,
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      abbr: 'CHI',
      ovr: 83,
      offenseRating: 82,
      defenseRating: 84,
      roster: [
        { id: 10, name: 'Caleb North', pos: 'QB', age: 22, ovr: 74, potential: 86, progressionDelta: 2, teamId: 1 },
        { id: 11, name: 'Terry Wide', pos: 'WR', age: 23, ovr: 71, potential: 83, progressionDelta: 3, teamId: 1 },
        { id: 12, name: 'Miles Hill', pos: 'LB', age: 25, ovr: 72, potential: 78, progressionDelta: 1, teamId: 1 },
      ],
    },
    { id: 2, abbr: 'DET', ovr: 79, offenseRating: 81, defenseRating: 75, roster: [] },
  ],
  schedule: { weeks: [{ week: 6, games: [{ played: false, home: { id: 1 }, away: { id: 2 } }] }] },
};

describe('TrainingCamp', () => {
  it('selecting recommended focus updates local controls', () => {
    render(<TrainingCamp league={league} actions={{}} onNavigate={vi.fn()} onPlayerSelect={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /select this focus/i })[0]);

    expect(screen.getByRole('button', { name: /hard/i, pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /technique/i, pressed: true })).toBeTruthy();
  });

  it('runs drills and calls conductDrill when available', async () => {
    const conductDrill = vi.fn().mockResolvedValue({});
    render(<TrainingCamp league={league} actions={{ conductDrill }} onNavigate={vi.fn()} onPlayerSelect={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Run Drills/i })[0]);
    await waitFor(() => expect(conductDrill).toHaveBeenCalled());
    expect(screen.getByText(/sent to simulation via conductDrill/i)).toBeTruthy();
  });

  it('shows honest preview copy when persistence is unavailable', () => {
    render(<TrainingCamp league={league} actions={{}} onNavigate={vi.fn()} onPlayerSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Run Drills/i })[0]);
    expect(screen.getByText(/local preview for planning only/i)).toBeTruthy();
  });

  it('routes back actions', () => {
    const onNavigate = vi.fn();
    render(<TrainingCamp league={league} actions={{}} onNavigate={onNavigate} onPlayerSelect={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Back to Weekly Prep/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /Back to HQ/i })[0]);

    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
    expect(onNavigate).toHaveBeenCalledWith('HQ');
  });
});
