import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import WeeklyHub from './WeeklyHub.jsx';

function makeLeague() {
  return {
    seasonId: '2032',
    week: 3,
    phase: 'regular',
    userTeamId: 1,
    ownerApproval: 0.62,
    teams: [
      { id: 1, name: 'Sharks', abbr: 'SHK', conf: 0, div: 0, wins: 1, losses: 1, ties: 0, capUsed: 210, payroll: 210 },
      { id: 2, name: 'Wolves', abbr: 'WLV', conf: 0, div: 0, wins: 2, losses: 0, ties: 0 },
      { id: 3, name: 'Hawks', abbr: 'HWK', conf: 0, div: 1, wins: 0, losses: 2, ties: 0 },
      { id: 4, name: 'Bulls', abbr: 'BUL', conf: 1, div: 0, wins: 1, losses: 1, ties: 0 },
      { id: 5, name: 'Kings', abbr: 'KNG', conf: 1, div: 1, wins: 1, losses: 1, ties: 0 },
      { id: 6, name: 'Jets', abbr: 'JET', conf: 0, div: 1, wins: 1, losses: 1, ties: 0 },
      { id: 7, name: 'Foxes', abbr: 'FOX', conf: 0, div: 1, wins: 1, losses: 1, ties: 0 },
      { id: 8, name: 'Owls', abbr: 'OWL', conf: 0, div: 1, wins: 1, losses: 1, ties: 0 },
    ],
    schedule: {
      weeks: [
        { week: 1, games: [{ home: 1, away: 2, played: true, homeScore: 27, awayScore: 20 }] },
        { week: 2, games: [{ home: 3, away: 1, played: true, homeScore: 14, awayScore: 17 }] },
        { week: 3, games: [{ home: 1, away: 4, played: false }] },
      ],
    },
  };
}

describe('WeeklyHub structure', () => {
  it('renders a single primary results surface with one game-book CTA', () => {
    const html = renderToString(
      <WeeklyHub
        league={makeLeague()}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        onOpenBoxScore={vi.fn()}
      />,
    );

    expect((html.match(/Latest completed game/g) ?? []).length).toBe(1);
    expect((html.match(/Open Game Book/g) ?? []).length).toBe(1);
    expect(html).toContain('This Week');
    expect(html).toContain('Team Snapshot');
    expect(html).toContain('Results');
  });
});
