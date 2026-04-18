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
        { id: 1, name: 'Starter QB', pos: 'QB', schemeFit: 72, progressionDelta: 2, depthChart: { order: 1 }, contract: { yearsRemaining: 1 } },
        { id: 2, name: 'Backup QB', pos: 'QB', schemeFit: 63, progressionDelta: 0, depthChart: { order: 2 }, contract: { yearsRemaining: 2 } },
        { id: 3, name: 'WR1', pos: 'WR', schemeFit: 80, progressionDelta: -1, depthChart: { order: 1 }, contract: { yearsRemaining: 1 }, injury: { gamesRemaining: 2 } },
        { id: 4, name: 'WR2', pos: 'WR', schemeFit: 65, progressionDelta: 1, depthChart: { order: 2 }, contract: { yearsRemaining: 3 } },
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

    expect(html).toContain('Operations');
    expect(html).toContain('Overview');
    expect(html).toContain('Roster Summary');

  });

  it('supports direct section entry for team-context deep links', () => {
    const html = renderToString(
      <TeamHub
        league={league}
        actions={{}}
        initialSubtab="Development"
        onOpenGameDetail={vi.fn()}
        onPlayerSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );


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
