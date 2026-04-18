import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import LeagueHub from './LeagueHub.jsx';

const league = {
  year: 2026,
  week: 4,
  seasonId: 's4',
  teams: [
    { id: 1, abbr: 'DAL', name: 'Dallas', wins: 3, losses: 1, streak: ['W', 'W', 'W'], roster: [] },
    { id: 2, abbr: 'PHI', name: 'Philadelphia', wins: 2, losses: 2, streak: ['L', 'W'], roster: [] },
  ],
  schedule: {
    weeks: [
      {
        week: 4,
        games: [
          { id: 'g1', home: 1, away: 2, played: true, homeScore: 24, awayScore: 21 },
        ],
      },
    ],
  },
  newsItems: [
    { id: 'n1', week: 4, headline: 'Blockbuster trade shakes up playoff race.', body: 'Two contenders swapped starting talent.' },
  ],
};

describe('LeagueHub', () => {
  it('renders command-center sections with overview as default', () => {
    const html = renderToString(
      <LeagueHub
        league={league}
        actions={{ getLeagueLeaders: vi.fn().mockResolvedValue({ payload: { categories: {} } }) }}
        onPlayerSelect={vi.fn()}
        onOpenGameDetail={vi.fn()}
        renderResults={() => <div>Weekly Results Stub</div>}
        renderStandings={() => <div>Standings Stub</div>}
      />,
    );

    expect(html).toContain('League Command Center');
    expect(html).toContain('Overview');
    expect(html).toContain('Results');
    expect(html).toContain('Standings');
    expect(html).toContain('News');
    expect(html).toContain('Leaders');
    expect(html).toContain('League Pulse');
    expect(html).not.toContain('Weekly Results Stub');
  });

  it('supports section deep links and keeps recap/spotlight owned by results section', () => {
    const html = renderToString(
      <LeagueHub
        league={league}
        initialSection="Results"
        actions={{ getLeagueLeaders: vi.fn().mockResolvedValue({ payload: { categories: {} } }) }}
        onPlayerSelect={vi.fn()}
        onOpenGameDetail={vi.fn()}
        renderResults={() => <div>Weekly League Recap · Weekly Spotlight</div>}
        renderStandings={() => <div>Standings Stub</div>}
      />,
    );

    expect(html).toContain('Weekly League Recap');
    expect(html).toContain('Weekly Spotlight');
    expect(html).not.toContain('League Pulse');
  });

  it('fails safe for legacy/partial saves without schedule or teams', () => {
    expect(() => renderToString(
      <LeagueHub
        league={{ year: 2026, week: 1, seasonId: 'legacy' }}
        actions={{ getLeagueLeaders: vi.fn().mockResolvedValue({ payload: { categories: {} } }) }}
        onPlayerSelect={vi.fn()}
        onOpenGameDetail={vi.fn()}
        renderResults={() => <div>No schedule data available for weekly results.</div>}
        renderStandings={() => <div>Standings unavailable</div>}
      />,
    )).not.toThrow();
  });
});
