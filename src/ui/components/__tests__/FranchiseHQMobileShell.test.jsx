/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';

const baseLeague = {
  year: 2026,
  week: 10,
  seasonId: 's10',
  phase: 'regular',
  userTeamId: 10,
  ownerApproval: 58,
  teams: [
    {
      id: 10, city: 'Chicago', name: 'Bears', abbr: 'CHI', conf: 1, div: 0,
      wins: 6, losses: 3, ties: 0, ovr: 84, offenseRating: 82, defenseRating: 83,
      capRoom: 7,
      roster: [
        { id: 1, pos: 'QB', ovr: 88 },
        { id: 2, pos: 'RB', ovr: 80, injuryWeeksRemaining: 2 },
      ],
      recentResults: ['W', 'W', 'L', 'W'],
    },
    { id: 11, city: 'Detroit', name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 83, offenseRating: 86, defenseRating: 80, capRoom: 11, roster: [] },
  ],
  schedule: {
    weeks: [
      { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeId: 11, awayId: 10, homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 20, awayScore: 23, played: true }] },
      { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
    ],
  },
  gameById: {
    'g-9': { id: 'g-9', home: 11, away: 10, homeId: 11, awayId: 10, week: 9, played: true, homeScore: 20, awayScore: 23 },
  },
  incomingTradeOffers: [],
  newsItems: [{ id: 'n1', teamId: 10, headline: 'Starter upgraded to probable status.' }],
};

describe('FranchiseHQ — mobile shell & safe-area layout', () => {
  afterEach(() => cleanup());

  it('keeps the primary Advance Week control outside the bottom nav so the nav cannot obscure it', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    const advance = screen.getByTestId('advance-week-cta');
    expect(advance).toBeTruthy();

    // The advance CTA lives in its own sticky footer container...
    const stickyFooter = document.querySelector('.app-hq-sticky-advance');
    expect(stickyFooter).toBeTruthy();
    expect(stickyFooter.contains(advance)).toBe(true);

    // ...which is a separate element from the bottom navigation bar.
    const bottomNav = document.querySelector('.app-hq-bottom-nav');
    expect(bottomNav).toBeTruthy();
    expect(bottomNav.contains(advance)).toBe(false);
  });

  it('exposes exactly one primary Advance Week action', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    expect(screen.getAllByRole('button', { name: /advance week/i })).toHaveLength(1);
  });

  it('collapses roster/simulation notices into the compact activity strip while simulating', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={true} />);
    const strip = screen.getByTestId('activity-toast-stack');
    expect(strip).toBeTruthy();
    // Simulation + roster (injury) notices are surfaced compactly.
    expect(strip.textContent).toMatch(/Simulating week/);
    expect(strip.textContent).toMatch(/injury report/);
  });
});
