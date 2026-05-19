/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FranchiseStoryHub from './FranchiseStoryHub.jsx';

function buildLeague() {
  return {
    year: 2026,
    week: 8,
    userTeamId: 1,
    teams: [{ id: 1, conf: 0, abbr: 'PIT', wins: 5, losses: 3, roster: [] }],
    schedule: { weeks: [] },
    franchiseChronicle: [
      {
        id: 'legacy-game',
        season: 2026,
        week: 3,
        result: 'W',
        score: { away: 17, home: 24 },
        headline: 'Legacy comeback win',
        summary: 'W BAL 17-24 PIT',
      },
      {
        id: 'trade-1',
        season: 2026,
        week: 5,
        type: 'trade',
        headline: 'PIT lands Dev Grant',
        summary: 'Trade negotiation completed.',
        meta: {
          type: 'trade',
          incomingPlayers: [{ name: 'Dev Grant', pos: 'CB', ovr: 82 }],
          outgoingPicks: ['2027 Round 2 Pick 52'],
          teams: ['PIT', 'ARI'],
        },
      },
      {
        id: 'contract-1',
        season: 2026,
        week: 6,
        type: 'contract',
        headline: 'Jay Stone signs extension',
        summary: 'Contract decision recorded.',
        meta: {
          type: 'contract',
          player: { name: 'Jay Stone', pos: 'WR', ovr: 84 },
          years: 3,
          totalValue: 48,
          aav: 16,
        },
      },
      {
        id: 'draft-1',
        season: 2026,
        week: 7,
        type: 'draft',
        headline: 'Rico Vale joins the class',
        summary: '2026 Round 3 Pick 91',
        meta: {
          type: 'draft',
          player: { name: 'Rico Vale', pos: 'EDGE', ovr: 74 },
          pickLabel: '2026 Round 3 Pick 91',
        },
      },
      {
        id: 'injury-1',
        season: 2026,
        week: 8,
        type: 'injury',
        headline: 'Ty Cole injury update',
        summary: 'Hamstring strain - 2 weeks',
        meta: {
          type: 'injury',
          player: { name: 'Ty Cole', pos: 'CB', ovr: 80 },
          injury: 'Hamstring strain',
          duration: '2 weeks',
        },
      },
      {
        id: 'milestone-1',
        season: 2026,
        week: 8,
        type: 'milestone',
        headline: 'First playoff berth',
        summary: 'Clinched in Week 17',
        meta: {
          type: 'milestone',
          label: 'First playoff berth',
          description: 'Clinched in Week 17',
          unlockedOn: '2026 Week 17',
        },
      },
    ],
  };
}

describe('FranchiseStoryHub typed timeline', () => {
  afterEach(() => cleanup());

  it('renders typed event labels and keeps legacy game entries safe', () => {
    render(<FranchiseStoryHub league={buildLeague()} />);

    expect(screen.getByText('Game')).toBeTruthy();
    expect(screen.getByText('Trade')).toBeTruthy();
    expect(screen.getByText('Contract')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Injury')).toBeTruthy();
    expect(screen.getByText('Milestone')).toBeTruthy();
    expect(screen.getByText('Legacy comeback win')).toBeTruthy();
  });

  it('expands non-game metadata without rendering empty placeholders', () => {
    render(<FranchiseStoryHub league={buildLeague()} />);

    fireEvent.click(screen.getByText('PIT lands Dev Grant'));

    expect(screen.getByText('Added:')).toBeTruthy();
    expect(screen.getByText(/Dev Grant - CB - 82 OVR/)).toBeTruthy();
    expect(screen.getByText('Picks:')).toBeTruthy();
    expect(screen.getByText(/2027 Round 2 Pick 52/)).toBeTruthy();
    expect(screen.queryByText('undefined')).toBeNull();
  });
});
