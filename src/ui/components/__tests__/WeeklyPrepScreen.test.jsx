/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';
import * as weeklyPrepActionsModule from '../../utils/weeklyPrepActions.js';

const league = {
  year: 2027,
  week: 8,
  seasonId: 's8',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'Bears',
      abbr: 'CHI',
      wins: 5,
      losses: 2,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      recentResults: ['W', 'W', 'L', 'W'],
      roster: [{ id: 11, pos: 'QB', ovr: 80, teamId: 1, depthChart: { rowKey: 'QB' } }],
    },
    {
      id: 2,
      name: 'Lions',
      abbr: 'DET',
      wins: 4,
      losses: 3,
      ovr: 81,
      offenseRating: 85,
      defenseRating: 76,
      recentResults: ['L', 'W', 'W', 'L'],
      roster: [],
    },
  ],
  schedule: {
    weeks: [{ week: 8, games: [{ id: 'g8', home: { id: 1 }, away: { id: 2 }, played: false }] }],
  },
};

describe('WeeklyPrepScreen', () => {
  afterEach(cleanup);

  it('renders war room flow and completion chips', () => {
    render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(screen.getByText(/Weekly Prep War Room/i)).toBeTruthy();
    expect(screen.getByText(/Readiness Command/i)).toBeTruthy();
    expect(screen.getByText(/Priority Actions/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Matchup Intel/i })).toBeTruthy();
    expect(screen.getByText(/Prep Checklist/i)).toBeTruthy();
    expect(screen.getByText(/Opponent (scouted|pending)/i)).toBeTruthy();
  });

  it('routes action cards and secondary HQ CTA through onNavigate', () => {
    const onNavigate = vi.fn();
    render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);

    screen.getAllByRole('button', { name: /open|review|adjust|set/i }).forEach((btn) => fireEvent.click(btn));
    screen.getAllByRole('button', { name: /back to hq/i }).forEach((btn) => fireEvent.click(btn));

    expect(onNavigate).toHaveBeenCalledWith('HQ');
    expect(onNavigate.mock.calls.some((args) => String(args?.[0] ?? '').includes('Game Plan'))).toBe(true);
  });

  it('handles missing matchup data safely', () => {
    render(
      <WeeklyPrepScreen
        league={{ year: 2027, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Legacy', roster: [] }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Weekly prep unavailable/i)).toBeTruthy();
  });
});

describe('WeeklyPrepScreen — Recommended Prep Actions section', () => {
  afterEach(cleanup);

  it('renders the Recommended Prep Actions section heading', () => {
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    expect(within(container).getByRole('heading', { name: /Recommended Prep Actions/i })).toBeTruthy();
  });

  it('CTA buttons in Recommended Prep Actions call onNavigate with a valid tab', () => {
    const onNavigate = vi.fn();
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={onNavigate} />);

    // Find the Recommended Prep Actions section and query buttons within it
    const heading = within(container).getByRole('heading', { name: /Recommended Prep Actions/i });
    const section = heading.closest('section');
    if (!section) return;

    const ctaButtons = within(section).queryAllByRole('button');
    if (ctaButtons.length > 0) {
      fireEvent.click(ctaButtons[0]);
      expect(onNavigate).toHaveBeenCalledTimes(1);
      const destination = onNavigate.mock.calls[0][0];
      expect(typeof destination).toBe('string');
      expect(destination.length).toBeGreaterThan(0);
    }
  });

  it('renders the empty state message when buildWeeklyPrepActions returns no actions', () => {
    const spy = vi.spyOn(weeklyPrepActionsModule, 'buildWeeklyPrepActions').mockReturnValue([]);
    const { container } = render(<WeeklyPrepScreen league={league} onNavigate={vi.fn()} />);
    const heading = within(container).getByRole('heading', { name: /Recommended Prep Actions/i });
    const section = heading.closest('section');
    expect(within(section).getByText(/No urgent prep actions/i)).toBeTruthy();
    spy.mockRestore();
  });
});
