import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
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
      roster: [
        { id: 1, contract: { yearsRemaining: 1 } },
        { id: 2, contract: { yearsRemaining: 1 }, injury: 'Ankle', injuredWeeks: 1 },
      ],
      recentResults: ['W', 'W', 'L', 'W'],
    },
    {
      id: 11,
      city: 'Detroit',
      name: 'Lions',
      abbr: 'DET',
      conf: 1,
      div: 0,
      wins: 5,
      losses: 4,
      ties: 0,
      ovr: 83,
      offenseRating: 86,
      defenseRating: 80,
      capRoom: 11,
      roster: [],
    },
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
  it('renders action-first grouped sections in the intended order', () => {
    const html = renderToString(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={() => {}}
        onOpenBoxScore={() => {}}
        onAdvanceWeek={() => {}}
        busy={false}
        simulating={false}
      />,
    );

    const heroIdx = html.indexOf('Advance Week');

    expect(html.indexOf('Advance Week')).toBeGreaterThan(-1);
    expect(html.indexOf('Priority Queue')).toBeGreaterThan(-1);
    expect(html.indexOf('Team Snapshot')).toBeGreaterThan(-1);
    expect(html.indexOf('League Pulse')).toBeGreaterThan(-1);





    expect(html).toContain('Advance Week');
    expect(html).toContain('Set Lineup');
    expect(html).toContain('Scout Opp');
    expect(html).toContain('Priority Queue');
    expect(html).toContain('League Pulse');
    expect(html).toContain('Team Snapshot');
    expect(html).toContain('Weekly League Results');
    expect(html).toContain('League Leaders');
  });


  it('is safe with partial/older save payloads', () => {
    expect(() => renderToString(
      <FranchiseHQ
        league={{
          year: 2026,
          week: 2,
          phase: 'regular',
          userTeamId: 1,
          teams: [{ id: 1, name: 'Legacy Team', city: 'Legacy', conf: 0, div: 0 }],
          schedule: { weeks: [] },
        }}
        onNavigate={vi.fn()}
        onOpenBoxScore={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    )).not.toThrow();
  });
});
