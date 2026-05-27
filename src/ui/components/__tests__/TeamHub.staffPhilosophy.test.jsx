import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import TeamHub from '../TeamHub.jsx';

const baseLeague = {
  week: 1,
  year: 2026,
  phase: 'regular',
  userTeamId: 1,
  teams: [{ id: 1, name: 'User Team', abbr: 'USR', wins: 0, losses: 0, capRoom: 25, roster: [] }],
  schedule: [],
};

describe('TeamHub staff philosophy card', () => {
  it('renders compact staff philosophy card for staffed team', () => {
    const league = {
      ...baseLeague,
      teams: [{ ...baseLeague.teams[0], staff: { headCoach: { name: 'Jordan Shaw', offensivePhilosophy: 'VERTICAL', defensivePhilosophy: 'HYBRID', traits: ['SCHEME_TEACHER'] } } }],
    };
    const html = renderToString(<TeamHub league={league} actions={{}} />);
    expect(html).toContain('Staff philosophy');
    expect(html).toContain('Jordan Shaw');
    expect(html).toContain('Vertical passing offense');
  });

  it('renders safe fallback when staff is missing', () => {
    const html = renderToString(<TeamHub league={baseLeague} actions={{}} />);
    expect(html).toContain('Staff philosophy');
    expect(html).toContain('Interim Staff');
    expect(html).toContain('Balanced offense');
  });
});
