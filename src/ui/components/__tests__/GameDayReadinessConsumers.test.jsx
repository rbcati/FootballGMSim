/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TeamHub from '../TeamHub.jsx';

function makeLeague(roster) {
  return {
    year: 2026,
    week: 5,
    seasonId: 'season-1',
    phase: 'regular',
    userTeamId: 1,
    ownerApproval: 60,
    teams: [
      { id: 1, name: 'Chicago Bears', abbr: 'CHI', wins: 3, losses: 1, roster },
      { id: 2, name: 'Detroit Lions', abbr: 'DET', wins: 2, losses: 2, roster: [] },
    ],
    schedule: { weeks: [{ week: 5, games: [{ id: 'g5', home: { id: 1, abbr: 'CHI' }, away: { id: 2, abbr: 'DET' }, played: false }] }] },
    incomingTradeOffers: [],
  };
}

const blockingRoster = [
  { id: 1, teamId: 1, name: 'QB One', pos: 'QB', injured: true, injuryWeeksRemaining: 2, depthChart: { rowKey: 'QB', order: 1 } },
  { id: 2, teamId: 1, name: 'Wide One', pos: 'WR', seasonEndingInjury: true, status: 'injured', depthChart: { rowKey: 'WR', order: 1 } },
  { id: 3, teamId: 1, name: 'QB Two', pos: 'QB', depthChart: { rowKey: 'QB', order: 2 } },
];

describe('shared game-day readiness consumers', () => {
  afterEach(cleanup);

  it('shows the same counts and readable unavailable starters in Team Hub', () => {
    render(<TeamHub league={makeLeague(blockingRoster)} actions={{}} initialSection="Overview" />);
    const readiness = screen.getByTestId('team-hub-gameday-readiness');
    expect(within(readiness).getByText('Lineup action required')).toBeTruthy();
    expect(readiness.textContent).toContain('2 starters unavailable: QB QB One, WR Wide One');
    fireEvent.click(within(readiness).getByRole('button', { name: /review lineup/i }));
    expect(screen.getByTestId('lineup-command-center')).toBeTruthy();
    expect(screen.getByTestId('lineup-what-matters').textContent).toContain('2 starters need attention');
    expect(screen.getByTestId('lineup-what-matters').textContent).toContain('QB QB One, WR Wide One unavailable');
    expect(screen.queryByText('Weekly lineup decisions')).toBeNull();
  });

  it('keeps an unavailable backup out of starter blockers', () => {
    const roster = [
      { id: 1, teamId: 1, name: 'QB One', pos: 'QB', depthChart: { rowKey: 'QB', order: 1 } },
      { id: 2, teamId: 1, name: 'Backup', pos: 'QB', holdout: { active: true }, depthChart: { rowKey: 'QB', order: 2 } },
    ];
    render(<TeamHub league={makeLeague(roster)} actions={{}} initialSection="Overview" />);
    const readiness = screen.getByTestId('team-hub-gameday-readiness');
    expect(readiness.textContent).toContain('1 available · 1 unavailable');
    expect(readiness.textContent).not.toContain('Lineup action required');
    expect(readiness.textContent).not.toContain('starters unavailable');
  });

  it('renders valid healthy readiness in TeamHub', () => {
    const healthy = [{ id: 1, teamId: 1, name: 'QB One', pos: 'QB', depthChart: { rowKey: 'QB', order: 1 } }];
    render(<TeamHub league={makeLeague(healthy)} actions={{}} initialSection="Overview" />);
    const readiness = screen.getByTestId('team-hub-gameday-readiness');
    expect(readiness.textContent).toContain('1 available · 0 unavailable');
    expect(readiness.textContent).not.toContain('Lineup action required');
  });
});
