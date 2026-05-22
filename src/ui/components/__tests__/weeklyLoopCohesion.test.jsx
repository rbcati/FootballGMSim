import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import TeamHub from '../TeamHub.jsx';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';
import GamePlanScreen from '../GamePlanScreen.jsx';
import NewsFeed from '../NewsFeed.jsx';
import WeeklyHub from '../WeeklyHub.jsx';
import FranchiseHQ from '../FranchiseHQ.jsx';

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
    expect(html).toContain('Weekly Prep War Room');
    expect(html).toContain('Readiness Command');
  });

  it('renders GamePlanScreen strategy header safely', () => {
    const html = renderToString(<GamePlanScreen league={league} actions={actions} />);
    expect(html).toContain('Game Plan');
    expect(html).toContain('Tactical Brief');
  });

  it('renders NewsFeed injury board safely', () => {
    const html = renderToString(<NewsFeed league={league} onNavigate={() => {}} onPlayerSelect={() => {}} />);
    expect(html).toContain('News &amp; Injuries');
    expect(html).toContain('Injury board');
  });
});

describe('WeeklyHub command center layout', () => {
  it('renders Actions Required section', () => {
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('Actions Required');
  });

  it('renders This Week section with advance controls', () => {
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('This Week');
    expect(html).toContain('Advance Week');
  });

  it('renders Pulse section for secondary KPIs', () => {
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('Pulse');
    expect(html).toContain('Record');
    expect(html).toContain('Cap');
  });

  it('renders matchup card when next game exists', () => {
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('Matchup');
    expect(html).toContain('DET');
  });

  it('renders Go To quick navigation section below decision area', () => {
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('Go To');
    // Quick nav must appear after decision sections in DOM order
    const actionsPos = html.indexOf('Actions Required');
    const goToPos = html.indexOf('Go To');
    expect(actionsPos).toBeLessThan(goToPos);
  });

  it('renders without crashing when no next game exists', () => {
    const noGameLeague = {
      ...league,
      schedule: { weeks: [{ week: 5, games: [{ id: 'g5', home: 2, away: 1, homeScore: 24, awayScore: 27, played: true }] }] },
    };
    expect(() => renderToString(
      <WeeklyHub league={noGameLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    )).not.toThrow();
  });

  it('shows ready badge when gate has no warnings', () => {
    // Offseason phase: gate short-circuits and returns no warnings → "Ready" badge visible
    const offseasonLeague = { ...league, phase: 'offseason_resign', schedule: { weeks: [] } };
    const html = renderToString(
      <WeeklyHub league={offseasonLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('Ready');
  });
});

describe('FranchiseHQ command center layout', () => {
  it('renders Actions Required section', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('Actions Required');
  });

  it('renders advance week CTA', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('Advance Week');
  });

  it('renders Coordinator Brief section', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('Coordinator Brief');
  });

  it('renders Season Pulse section', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('Season Pulse');
  });

  it('renders background sections with collapsible inner bodies', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    // These sections remain as SectionCards (heading preserved) with collapsible inner details
    expect(html).toContain('Operations Snapshot');
    expect(html).toContain('League Pulse');
    // Collapsible summary triggers are present inside section bodies
    expect(html).toContain('app-hq-background-section__inner');
  });

  it('renders advance-week-cta data-testid', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('data-testid="advance-week-cta"');
  });

  it('renders without crashing when no completed games exist', () => {
    const freshLeague = { ...league, schedule: { weeks: [{ week: 1, games: [{ id: 'g1', home: 1, away: 2, played: false }] }] } };
    expect(() => renderToString(
      <FranchiseHQ league={freshLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    )).not.toThrow();
  });
});
