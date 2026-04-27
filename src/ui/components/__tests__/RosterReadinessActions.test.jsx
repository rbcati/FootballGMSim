/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Roster from '../Roster.jsx';

const { markWeeklyPrepStep, readinessState } = vi.hoisted(() => ({
  markWeeklyPrepStep: vi.fn(),
  readinessState: {
  status: 'needs_attention',
  statusLabel: 'Needs Attention',
  rosterCount: 2,
  starterReadiness: '2/13 staffed groups',
  missingStarterCount: 5,
  injuryReplacementConcerns: 1,
  topRiskyPositionGroups: [{ rowKey: 'QB', label: 'Quarterback', reason: 'Starter injured' }],
  recommendedNextAction: 'Review injuries and promote healthy backups.',
  safeToMarkLineupChecked: false,
  routeHints: { showBackToWeeklyPrep: true, showBackToHQ: true },
  warnings: [],
  assignments: { QB: [1, 2] },
  },
}));

vi.mock('../../utils/weeklyPrep.js', () => ({ markWeeklyPrepStep }));
vi.mock('../../utils/rosterReadinessModel.js', () => ({ deriveRosterReadinessModel: () => readinessState }));

describe('Roster lineup readiness actions', () => {
  beforeEach(() => {
    markWeeklyPrepStep.mockReset();
    readinessState.safeToMarkLineupChecked = false;
  });

  const league = { userTeamId: 1, week: 5, phase: 'regular', teams: [{ id: 1, strategies: {} }] };
  const payload = {
    team: { id: 1, name: 'Sharks' },
    players: [
      { id: 1, name: 'QB1', pos: 'QB', ovr: 80, teamId: 1, depthChart: { rowKey: 'QB', order: 1 } },
      { id: 2, name: 'QB2', pos: 'QB', ovr: 72, teamId: 1, depthChart: { rowKey: 'QB', order: 2 } },
    ],
  };

  it('calls existing Auto-Build persistence and navigation callbacks', async () => {
    const onNavigate = vi.fn();
    const actions = {
      getRoster: vi.fn(async () => ({ payload })),
      updateDepthChart: vi.fn(async () => ({})),
      repairRoster: vi.fn(async () => ({})),
      optimizeRoster: vi.fn(async () => ({})),
    };

    render(<Roster league={league} actions={actions} onNavigate={onNavigate} onPlayerSelect={() => {}} initialViewMode="depth" />);

    await screen.findByText(/auto-build depth chart/i);
    fireEvent.click(screen.getAllByRole('button', { name: /auto-build depth chart/i })[0]);

    await waitFor(() => expect(actions.updateDepthChart).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /back to weekly prep/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /back to hq/i })[0]);
    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
    expect(onNavigate).toHaveBeenCalledWith('HQ');
  });

  it('marks lineupChecked only when readiness is safe', async () => {
    const actions = {
      getRoster: vi.fn(async () => ({ payload })),
      updateDepthChart: vi.fn(async () => ({})),
      repairRoster: vi.fn(async () => ({})),
      optimizeRoster: vi.fn(async () => ({})),
    };

    const { rerender } = render(<Roster league={league} actions={actions} onNavigate={() => {}} onPlayerSelect={() => {}} initialViewMode="depth" />);
    await screen.findByText(/auto-build depth chart/i);
    fireEvent.click(screen.getAllByRole('button', { name: /auto-build depth chart/i })[0]);
    expect(markWeeklyPrepStep).not.toHaveBeenCalled();

    readinessState.safeToMarkLineupChecked = true;
    rerender(<Roster league={league} actions={actions} onNavigate={() => {}} onPlayerSelect={() => {}} initialViewMode="depth" />);
    screen.getAllByRole('button', { name: /auto-build depth chart/i }).forEach((button) => fireEvent.click(button));
    await waitFor(() => expect(markWeeklyPrepStep).toHaveBeenCalledWith(league, 'lineupChecked', true));
  });
});
