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
  schedule: { weeks: [
    { week: 4, games: [{ id: 'g1', home: 7, away: 10, homeAbbr: 'SEA', awayAbbr: 'LAR', homeScore: 21, awayScore: 24, played: true }] },
    { week: 5, games: [{ id: 'g2', home: 11, away: 7, homeAbbr: 'SF', awayAbbr: 'SEA', played: false }] },
  ] },
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

    expect(html).toContain('Lineup Check Before Kickoff');
    expect(html).toContain('Overview');
    expect(html).toContain('Roster / Depth');
    expect(html).toContain('Contracts');
    expect(html).toContain('Development');
    expect(html).toContain('Injuries');
    expect(html).toContain('Position pressure');
    expect(html).toContain('Expiring');
    expect(html).toContain('Development');
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

  it('renders the same canonical nested Week 5 matchup instead of an empty fallback', () => {
    const withOpponent = { ...league, teams: [...league.teams, { id: 11, abbr: 'SF', name: 'San Francisco' }] };
    const html = renderToString(<TeamHub league={withOpponent} actions={{}} />);
    expect(html).toContain('@ SF · Week 5');
    expect(html).not.toContain('No upcoming matchup');
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
