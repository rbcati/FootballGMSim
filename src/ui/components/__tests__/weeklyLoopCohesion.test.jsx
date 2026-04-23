import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import TeamHub from '../TeamHub.jsx';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';
import GamePlanScreen from '../GamePlanScreen.jsx';
import NewsFeed from '../NewsFeed.jsx';

const league = {
  year: 2026,
  week: 6,
  seasonId: 's6',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      city: 'Chicago',
      name: 'Bears',
      abbr: 'CHI',
      wins: 3,
      losses: 2,
      ties: 0,
      offenseRating: 82,
      defenseRating: 80,
      ovr: 81,
      roster: [
        { id: 11, name: 'Starter QB', pos: 'QB', ovr: 84, contract: { yearsRemaining: 2 }, depthChart: { order: 1, rowKey: 'QB' } },
        { id: 12, name: 'WR1', pos: 'WR', ovr: 82, contract: { yearsRemaining: 1 }, depthChart: { order: 1, rowKey: 'WR' }, injury: { name: 'Hamstring', gamesRemaining: 2 } },
      ],
      recentResults: ['W', 'L', 'W'],
      strategies: { offSchemeId: 'WEST_COAST', defSchemeId: 'COVER_2' },
    },
    {
      id: 2,
      city: 'Detroit',
      name: 'Lions',
      abbr: 'DET',
      wins: 4,
      losses: 1,
      ties: 0,
      offenseRating: 85,
      defenseRating: 83,
      ovr: 84,
      roster: [],
    },
  ],
  schedule: {
    weeks: [
      { week: 5, games: [{ id: 'g5', home: 2, away: 1, homeScore: 24, awayScore: 27, played: true }] },
      { week: 6, games: [{ id: 'g6', home: 1, away: 2, played: false }] },
    ],
  },
  newsItems: [{ id: 'n1', headline: 'Bears adjust red zone package.', body: 'Coaches looking for situational edge.', priority: 'medium', week: 6, phase: 'regular', teamId: 1 }],
  incomingTradeOffers: [],
};

const actions = { send: vi.fn() };

describe('weekly loop cohesion surfaces', () => {
  it('renders TeamHub lineup framing safely', () => {
    const html = renderToString(<TeamHub league={league} actions={actions} onNavigate={() => {}} onPlayerSelect={() => {}} />);
    expect(html).toContain('Lineup Check Before Kickoff');
    expect(html).toContain('Roster / Depth');
  });

  it('renders WeeklyPrepScreen matchup framing safely', () => {
    const html = renderToString(<WeeklyPrepScreen league={league} onNavigate={() => {}} />);
    expect(html).toContain('Scout &amp; Prep');
    expect(html).toContain('Lineup readiness');
  });

  it('renders GamePlanScreen strategy header safely', () => {
    const html = renderToString(<GamePlanScreen league={league} actions={actions} />);
    expect(html).toContain('Game Plan');
    expect(html).toContain('Matchup Plan');
  });

  it('renders NewsFeed injury board safely', () => {
    const html = renderToString(<NewsFeed league={league} onNavigate={() => {}} onPlayerSelect={() => {}} />);
    expect(html).toContain('News &amp; Injuries');
    expect(html).toContain('Injury board');
  });
});
