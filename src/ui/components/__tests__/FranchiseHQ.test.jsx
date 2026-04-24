/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      id: 10,
      city: 'Chicago',
      name: 'Bears',
      abbr: 'CHI',
      conf: 1,
      div: 0,
      wins: 6,
      losses: 3,
      ties: 0,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      capRoom: 7,
      roster: [{ id: 1 }, { id: 2 }],
      recentResults: ['W', 'W', 'L', 'W'],
    },
    { id: 11, city: 'Detroit', name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 83, offenseRating: 86, defenseRating: 80, capRoom: 11, roster: [] },
  ],
  schedule: {
    weeks: [
      { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeScore: 20, awayScore: 23, played: true }] },
      { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
    ],
  },
  incomingTradeOffers: [],
  newsItems: [{ id: 'n1', teamId: 10, headline: 'Starter upgraded to probable status.' }],
};

describe('FranchiseHQ', () => {
  it('renders visible weekly command center essentials and one primary advance CTA', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    expect(screen.getByRole('heading', { name: /week 10/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /advance week/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /advance week/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^game plan:/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^set lineup:/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^training:/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^scout opponent:/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /coordinator brief/i })).toBeTruthy();
    expect(screen.getAllByText(/home matchup vs det/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ratings are tightly clustered/i)).toBeTruthy();
    expect(screen.getByText(/open roster \/ depth/i)).toBeTruthy();
  });

  it('renders record, standing, and fallback copy when schedule is missing', () => {
    render(
      <FranchiseHQ
        league={{ year: 2026, week: 2, phase: 'regular', userTeamId: 1, teams: [{ id: 1, name: 'Legacy Team', city: 'Legacy', conf: 0, div: 0, wins: 0, losses: 0, ties: 0 }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );

    expect(screen.getByText(/no completed game yet/i)).toBeTruthy();
    expect(screen.getByText(/no opponent is locked yet/i)).toBeTruthy();
    expect(screen.getByText(/no future games on file/i)).toBeTruthy();
    expect(screen.getAllByText(/0-0 · 0 0/i).length).toBeGreaterThan(0);
  });
});
