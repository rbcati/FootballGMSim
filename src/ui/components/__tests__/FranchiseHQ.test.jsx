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

    const actNowIdx = html.indexOf('Act Now');
    const thisWeekIdx = html.indexOf('This Week');
    const teamStatusIdx = html.indexOf('Team Status');
    expect(actNowIdx).toBeGreaterThan(-1);
    expect(thisWeekIdx).toBeGreaterThan(actNowIdx);
    expect(teamStatusIdx).toBeGreaterThan(thisWeekIdx);

    expect(html).toContain('This Week');
    expect(html).toContain('Scout opponent');
    expect(html).toContain('Priority Queue');
    expect(html).toContain('Next Opponent');
    expect(html).toContain('Latest Team Result');
    expect(html).toContain('Matchup note');
    expect(html).toContain('Prep status');
    expect(html).toContain('Owner mandate');
    expect(html).toContain('Team Command Center');
    expect(html).not.toContain('Injury pressure');
    expect(html).toContain('League Watch (Teasers)');
    expect(html).toContain('Open Results');
    expect(html).toContain('Open League');
    expect(html).toContain('Open Leaders');
    expect(html).not.toContain('News & Leaders');
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
