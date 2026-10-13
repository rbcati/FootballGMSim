/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
          { id: 'g1', home: 1, away: 2, played: true, homeScore: 24, awayScore: 21, driveSummary: [{ teamId: 1, result: 'TD', points: 7 }] },
        ],
      },
    ],
  },
  newsItems: [
    { id: 'n1', week: 4, headline: 'Blockbuster trade shakes up playoff race.', body: 'Two contenders swapped starting talent.' },
  ],
};

describe('LeagueHub', () => {
  afterEach(cleanup);
  it('exposes the existing schedule and weekly recap in one section', () => {
    render(<LeagueHub league={league} initialSection="Schedule" renderSchedule={() => <div>Schedule content</div>} renderResults={() => <div>Recap content</div>} />);
    expect(screen.getByText('Schedule content')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weekly Recap', exact: true }));
    expect(screen.getByText('Recap content')).toBeTruthy();
    expect(screen.queryByText('Schedule content')).toBeNull();
  });
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

    expect(html).toContain('League Season Pulse');
    expect(html).toContain('Overview');
    expect(html).toContain('Results');
    expect(html).toContain('Standings');
    expect(html).toContain('News');
    expect(html).toContain('Stats');
    expect(html).toContain('Around the League');
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

  it('hides unsupported sections instead of rendering empty containers', () => {
    const html = renderToString(<LeagueHub league={{ year: 2026, week: 1, seasonId: 'empty' }} />);
    expect(html).toContain('No league pulse is available yet');
    expect(html).not.toContain('Award Watch');
    expect(html).not.toContain('League Health');
    expect(html).not.toContain('Trending Teams');
  });

  it('renders long player names in the mobile-safe stacked row layout', () => {
    const html = renderToString(<LeagueHub league={{ ...league, teams: league.teams.map((team, index) => index ? team : { ...team, roster: [{ id: 'long', name: 'A Very Long Player Name That Must Wrap Cleanly', pos: 'QB', injuryWeeksRemaining: 6 }] }) }} />);
    expect(html).toContain('A Very Long Player Name That Must Wrap Cleanly');
    expect(html).toContain('app-row-stack');
  });

  it('opens a recorded spotlight through the existing Game Book callback', () => {
    const onOpenGameDetail = vi.fn();
    render(<LeagueHub league={league} onOpenGameDetail={onOpenGameDetail} />);
    const spotlights = screen.getByText('Spotlight Games').closest('section');
    fireEvent.click(within(spotlights).getByRole('button', { name: /Open Game Book:/ }));
    expect(onOpenGameDetail).toHaveBeenCalledWith('g1');
  });

  it('does not advertise Game Book for a score-only spotlight', () => {
    const scoreOnlyLeague = {
      ...league,
      schedule: { weeks: [{ week: 4, games: [{ id: 'legacy-score', home: 1, away: 2, played: true, homeScore: 24, awayScore: 21 }] }] },
    };
    render(<LeagueHub league={scoreOnlyLeague} onOpenGameDetail={vi.fn()} />);
    const spotlights = screen.getByText('Spotlight Games').closest('section');
    expect(within(spotlights).queryByRole('button', { name: 'Open Game' })).toBeNull();
    expect(within(spotlights).getByText('Game Book unavailable').tagName).toBe('SPAN');
  });

  it('renders factual deadline candidates and opens the existing Trade Center destination', () => {
    const onNavigateTrade = vi.fn();
    const roster = [{ id: 7, teamId: 1, name: 'A Very Long Veteran Receiver Name', pos: 'WR', age: 30, ovr: 82, potential: 82, status: 'active', depthChart: { order: 1, role: 'starter' }, contract: { yearsRemaining: 1, baseAnnual: 8 } }];
    render(<LeagueHub league={{ ...league, phase: 'regular', week: 7, userTeamId: 1, settings: { tradeDeadlineWeek: 9 }, players: roster, teams: [{ ...league.teams[0], roster }, league.teams[1]] }} onNavigateTrade={onNavigateTrade} />);
    expect(screen.getByText(/2 weeks remaining/)).toBeTruthy();
    expect(screen.getByText('A Very Long Veteran Receiver Name')).toBeTruthy();
    expect(screen.queryByText(/buyer|seller|market demand|interest/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review Trade' }));
    expect(onNavigateTrade).toHaveBeenCalledTimes(1);
  });

  it('hides deadline context outside supported phases and renders no candidate filler when empty', () => {
    const offseason = renderToString(<LeagueHub league={{ ...league, phase: 'offseason', userTeamId: 1, settings: { tradeDeadlineWeek: 9 } }} />);
    expect(offseason).not.toContain('Trade Deadline');
    const regular = renderToString(<LeagueHub league={{ ...league, phase: 'regular', userTeamId: 1, settings: { tradeDeadlineWeek: 9 } }} />);
    expect(regular).toContain('No roster decisions currently require trade review.');
  });

  it('does not label archived preseason standings as the current division position', () => {
    const html = renderToString(<LeagueHub league={{
      ...league,
      phase: 'preseason',
      week: 1,
      userTeamId: 1,
      settings: { tradeDeadlineWeek: 9 },
      standings: [
        { id: 2, wins: 12, losses: 5, conf: 'A', div: 'East' },
        { id: 1, wins: 9, losses: 8, conf: 'A', div: 'East' },
      ],
      teams: league.teams.map((team) => ({ ...team, wins: 0, losses: 0 })),
    }} />);
    expect(html).toContain('Trade Deadline');
    expect(html).not.toMatch(/\d+(?:st|nd|rd|th) in division/);
  });
});
