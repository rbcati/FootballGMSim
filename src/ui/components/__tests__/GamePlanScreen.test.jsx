/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GamePlanScreen from '../GamePlanScreen.jsx';
import { getWeeklyPrepProgress } from '../../utils/weeklyPrep.js';

const league = {
  year: 2026,
  week: 13,
  seasonId: 's13',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      city: 'Chicago',
      name: 'Bears',
      abbr: 'CHI',
      wins: 7,
      losses: 5,
      offenseRating: 80,
      defenseRating: 78,
      strategies: { offSchemeId: 'WEST_COAST', defSchemeId: 'COVER_2' },
      roster: [{ id: 10, injuryWeeksRemaining: 2 }],
    },
    { id: 2, city: 'Detroit', name: 'Lions', abbr: 'DET', wins: 9, losses: 3, offenseRating: 86, defenseRating: 85, roster: [] },
  ],
  schedule: { weeks: [{ week: 13, games: [{ id: 'g13', home: 1, away: 2, played: false }] }] },
};

describe('GamePlanScreen', () => {
  it('shows HQ-aligned tactical recommendations and dispatches strategy save', () => {
    const actions = { send: vi.fn() };
    render(<GamePlanScreen league={league} actions={actions} onNavigate={vi.fn()} />);

    expect(screen.getByText(/Tactical Brief/i)).toBeTruthy();
    expect(screen.getByText(/Attack Plan/i)).toBeTruthy();
    expect(screen.getByText(/Defensive Priority/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save Game Plan/i }));

    expect(actions.send).toHaveBeenCalledWith('UPDATE_STRATEGY', expect.objectContaining({
      offSchemeId: 'WEST_COAST',
      defSchemeId: 'COVER_2',
      gamePlan: expect.objectContaining({ runPassBalance: expect.any(Number) }),
    }));
    expect(screen.getByText(/Plan saved for Week 13/i)).toBeTruthy();
    expect(getWeeklyPrepProgress(league).planReviewed).toBe(true);
  });

  it('renders missing opponent fallback safely', () => {
    const noOpp = { ...league, schedule: { weeks: [] } };
    render(<GamePlanScreen league={noOpp} actions={{ send: vi.fn() }} />);
    expect(screen.getByText(/No opponent locked yet/i)).toBeTruthy();
  });
});
