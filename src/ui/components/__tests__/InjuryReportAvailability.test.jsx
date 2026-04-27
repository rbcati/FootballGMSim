/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InjuryReport from '../InjuryReport.jsx';

const { markWeeklyPrepStep } = vi.hoisted(() => ({ markWeeklyPrepStep: vi.fn() }));
vi.mock('../../utils/weeklyPrep.js', () => ({ markWeeklyPrepStep }));

const baseLeague = {
  season: 2026,
  seasonId: '2026',
  week: 4,
  userTeamId: 1,
  teams: [
    {
      id: 1,
      abbr: 'YOU',
      roster: [
        { id: 10, name: 'QB One', pos: 'QB', ovr: 89, injured: true, injury: { type: 'Shoulder', weeksRemaining: 3 }, depthChart: { rowKey: 'QB', order: 1 } },
        { id: 11, name: 'QB Two', pos: 'QB', ovr: 72, depthChart: { rowKey: 'QB', order: 2 } },
      ],
    },
    { id: 2, abbr: 'OPP', roster: [{ id: 21, name: 'WR Opp', pos: 'WR', ovr: 80, injuryWeeksRemaining: 2 }] },
  ],
};

describe('InjuryReport availability command', () => {
  beforeEach(() => {
    markWeeklyPrepStep.mockReset();
  });

  it('renders availability command status and marks injuries reviewed on open', () => {
    render(<InjuryReport league={baseLeague} />);
    expect(screen.getByText(/Availability Command/i)).toBeTruthy();
    expect(markWeeklyPrepStep).toHaveBeenCalledWith(baseLeague, 'injuriesReviewed', true);
  });

  it('navigates to roster/depth, weekly prep, and hq', () => {
    const onNavigate = vi.fn();
    render(<InjuryReport league={baseLeague} onNavigate={onNavigate} />);

    screen.getAllByRole('button', { name: /Open Roster \/ Depth/i }).forEach((btn) => fireEvent.click(btn));
    screen.getAllByRole('button', { name: /Back to Weekly Prep/i }).forEach((btn) => fireEvent.click(btn));
    screen.getAllByRole('button', { name: /Back to HQ/i }).forEach((btn) => fireEvent.click(btn));

    expect(onNavigate).toHaveBeenCalledWith('Team:Roster / Depth');
    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
    expect(onNavigate).toHaveBeenCalledWith('HQ');
  });
});
