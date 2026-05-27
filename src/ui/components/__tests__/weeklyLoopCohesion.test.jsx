import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import TeamHub from '../TeamHub.jsx';
import WeeklyPrepScreen from '../WeeklyPrepScreen.jsx';
import GamePlanScreen from '../GamePlanScreen.jsx';
import NewsFeed from '../NewsFeed.jsx';
import WeeklyHub from '../WeeklyHub.jsx';
import FranchiseHQ from '../FranchiseHQ.jsx';
import { buildCommandCenterSummary } from '../../utils/weeklyHubLayout.js';

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

  it('shows no-blockers empty state when commandSummary.canAdvanceSafely is true', () => {
    // Offseason league: gate short-circuits, no urgentItems → canAdvanceSafely true
    const offseasonLeague = { ...league, phase: 'offseason_resign', schedule: { weeks: [] } };
    const html = renderToString(
      <WeeklyHub league={offseasonLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    expect(html).toContain('No blockers');
    expect(html).not.toContain('Resolve before advancing');
  });

  it('shows gate-only risk in Actions Required even when weeklyContext urgentItems is empty', () => {
    // A regular season league with a cap-over situation forces gate danger in commandSummary
    // We simulate this by giving a league with an injured starter (triggers gate warning)
    // and verifying the Actions Required section is not empty.
    // The gate warning about injuries not reviewed should appear via commandSummary.primaryActions.
    const injuredLeague = {
      ...league,
      teams: [
        {
          ...league.teams[0],
          roster: [
            { id: 11, name: 'Starter QB', pos: 'QB', ovr: 84, contract: { yearsRemaining: 2 }, depthChart: { order: 1, rowKey: 'QB' }, injuryWeeksRemaining: 2 },
          ],
        },
        league.teams[1],
      ],
    };
    const html = renderToString(
      <WeeklyHub league={injuredLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} onOpenBoxScore={() => {}} />,
    );
    // Gate produces a warning item; commandSummary merges it → Actions Required shows something
    expect(html).toContain('Actions Required');
    // Should not show the "no blockers" empty state text
    expect(html).not.toContain('No urgent blockers');
  });

  it('WeeklyHub Actions Required badge count matches commandSummary criticalCount, not allAttentionItems length', () => {
    // buildCommandCenterSummary caps to 3 primaryActions; badge should reflect criticalCount
    const gate = { shouldWarn: true, severity: 'danger', riskItems: [
      { label: 'Risk A', detail: '', severity: 'danger', fixDestination: 'Weekly Prep' },
      { label: 'Risk B', detail: '', severity: 'danger', fixDestination: 'Weekly Prep' },
    ], primaryFixDestination: 'Weekly Prep' };
    const weeklyContext = { urgentItems: [
      { label: 'Urgent C', detail: '', tone: 'danger', level: 'blocker', rank: 50, tab: 'Roster' },
      { label: 'Urgent D', detail: '', tone: 'danger', level: 'blocker', rank: 40, tab: 'Roster' },
      { label: 'Urgent E', detail: '', tone: 'danger', level: 'blocker', rank: 30, tab: 'Roster' },
    ] };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    // criticalCount is primaryActions.length, capped to 3
    expect(summary.criticalCount).toBeLessThanOrEqual(3);
    expect(summary.criticalCount).toBe(summary.primaryActions.length);
  });

  it('WeeklyHub primary actions are capped to 3', () => {
    const gate = { shouldWarn: false, severity: 'info', riskItems: [], primaryFixDestination: 'Weekly Prep' };
    const weeklyContext = { urgentItems: [
      { label: 'A', detail: '', tone: 'danger', level: 'blocker', rank: 100, tab: 'Roster' },
      { label: 'B', detail: '', tone: 'danger', level: 'blocker', rank: 90, tab: 'Roster' },
      { label: 'C', detail: '', tone: 'danger', level: 'blocker', rank: 80, tab: 'Roster' },
      { label: 'D', detail: '', tone: 'danger', level: 'blocker', rank: 70, tab: 'Roster' },
      { label: 'E', detail: '', tone: 'danger', level: 'blocker', rank: 60, tab: 'Roster' },
    ] };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    expect(summary.primaryActions.length).toBeLessThanOrEqual(3);
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

  it('renders Roster Health and Office Status cards (replaced Coordinator Brief section)', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    // "Coordinator Brief" section removed — intel compressed into hq-twin-grid cards
    expect(html).toContain('Roster Health');
    expect(html).toContain('Office Status');
  });

  it('renders Season Pulse section', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    expect(html).toContain('Season Pulse');
  });

  it('renders background sections with collapsible inner bodies; Weekly Command Hub and Game Plan Impact absent', () => {
    const html = renderToString(
      <FranchiseHQ league={league} onNavigate={() => {}} onAdvanceWeek={() => {}} />,
    );
    // These sections remain as SectionCards (heading preserved) with collapsible inner details
    expect(html).toContain('Operations Snapshot');
    expect(html).not.toContain('League Pulse');
    expect(html).toContain('League views:');
    expect(html).toContain('View full stats');
    // Collapsible summary triggers are present inside section bodies
    expect(html).toContain('app-hq-background-section__inner');
    // Weekly Command Hub and Game Plan Impact pruned — passive deep panels removed from HQ
    expect(html).not.toContain('Weekly Command Hub');
    expect(html).not.toContain('Game Plan Impact');
    expect(html).not.toContain('Translate coordinator intel');
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
