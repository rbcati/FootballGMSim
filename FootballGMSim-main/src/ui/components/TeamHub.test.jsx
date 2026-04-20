import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import TeamHub from './TeamHub.jsx';

const league = {
  year: 2026,
  week: 5,
  phase: 'regular',
  userTeamId: 7,
  teams: [
    {
      id: 7,
      name: 'Seattle Orcas',
      wins: 3,
      losses: 2,
      ties: 0,
      capRoom: 9,
      roster: [
        { id: 1, name: 'Starter QB', pos: 'QB', age: 27, ovr: 79, potential: 81, schemeFit: 72, progressionDelta: 2, depthChart: { order: 1 }, contract: { yearsRemaining: 1 } },
        { id: 2, name: 'Backup QB', pos: 'QB', age: 24, ovr: 70, potential: 76, schemeFit: 63, progressionDelta: 0, depthChart: { order: 2 }, contract: { yearsRemaining: 2 } },
        {
          id: 3,
          name: 'WR1',
          pos: 'WR',
          age: 30,
          ovr: 82,
          potential: 82,
          schemeFit: 80,
          progressionDelta: -1,
          wearAndTear: 31,
          depthChart: { order: 1 },
          contract: { yearsRemaining: 1 },
          injury: { gamesRemaining: 2 },
          growthHistory: [{ seasonId: 2026, week: 4, totalDelta: -1, usage: 0.82, wearDelta: 1.2 }],
        },
        {
          id: 4,
          name: 'Young WR',
          pos: 'WR',
          age: 22,
          ovr: 72,
          potential: 82,
          schemeFit: 78,
          progressionDelta: 2,
          depthChart: { order: 2 },
          contract: { yearsRemaining: 3 },
          growthHistory: [
            { seasonId: 2026, week: 3, totalDelta: 1, usage: 0.74, wearDelta: 0.4 },
            { seasonId: 2026, week: 4, totalDelta: 1, usage: 0.81, wearDelta: 0.5 },
          ],
        },
        {
          id: 5,
          name: 'Project TE',
          pos: 'TE',
          age: 23,
          ovr: 68,
          potential: 79,
          schemeFit: 61,
          progressionDelta: 0,
          depthChart: { order: 4 },
          contract: { yearsRemaining: 4 },
          growthHistory: [
            { seasonId: 2026, week: 3, totalDelta: 0, usage: 0.18, wearDelta: 0.1 },
            { seasonId: 2026, week: 4, totalDelta: 0, usage: 0.14, wearDelta: 0.1 },
          ],
        },
      ],
    },
  ],
  schedule: [
    { id: 'g1', week: 4, homeId: 7, awayId: 10, homeAbbr: 'SEA', awayAbbr: 'LAR', homeScore: 21, awayScore: 24 },
    { id: 'g2', week: 5, homeId: 11, awayId: 7, homeAbbr: 'SF', awayAbbr: 'SEA', homeScore: null, awayScore: null },
  ],
};

describe('TeamHub', () => {
  it('renders command center section tabs and useful overview summaries', () => {
    const html = renderToString(
      <TeamHub
        league={league}
        actions={{}}
        onOpenGameDetail={vi.fn()}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(html).toContain('Team Command Center');
    expect(html).toContain('Overview');
    expect(html).toContain('Roster / Depth');
    expect(html).toContain('Contracts');
    expect(html).toContain('Development');
    expect(html).toContain('Injuries');
    expect(html).toContain('Position pressure');
    expect(html).toContain('Expiring');
    expect(html).toContain('Development');
    expect(html).toContain('Development Snapshot');
    expect(html).toContain('Upside Snaps');
    expect(html).toContain('Usage Pressure');
  });

  it('supports direct section entry for team-context deep links', () => {
    const html = renderToString(
      <TeamHub
        league={league}
        actions={{}}
        initialSection="Contracts"
        onOpenGameDetail={vi.fn()}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(html).toContain('Contract Operations');
    expect(html).not.toContain('Position group pressure');
  });

  it('fails safe for partial/legacy saves', () => {
    expect(() => renderToString(
      <TeamHub
        league={{ year: 2026, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Legacy Team' }] }}
        actions={{}}
        onOpenGameDetail={vi.fn()}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )).not.toThrow();
  });
});
