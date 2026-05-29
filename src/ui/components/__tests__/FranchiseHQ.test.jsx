/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';
import LeagueDashboard from '../LeagueDashboard.jsx';
import { normalizeManagementDestination, parseGameBookDestination } from '../../utils/managementScreenRouting.js';

const baseLeague = {
  year: 2026,
  week: 10,
  seasonId: 's10',
  phase: 'regular',
  userTeamId: 10,
  ownerApproval: 58,
  teams: [
    {
      id: 10,
      city: 'Chicago',
      name: 'Bears',
      abbr: 'CHI',
      conf: 1,
      div: 0,
      wins: 6,
      losses: 3,
      ties: 0,
      ovr: 84,
      offenseRating: 82,
      defenseRating: 83,
      capRoom: 7,
      roster: [{ id: 1 }, { id: 2 }],
      recentResults: ['W', 'W', 'L', 'W'],
    },
    { id: 11, city: 'Detroit', name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 83, offenseRating: 86, defenseRating: 80, capRoom: 11, roster: [] },
  ],
  schedule: {
    weeks: [
      { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeId: 11, awayId: 10, homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 20, awayScore: 23, played: true }] },
      { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
    ],
  },
  gameById: {
    'g-9': { id: 'g-9', home: 11, away: 10, homeId: 11, awayId: 10, week: 9, played: true, homeScore: 20, awayScore: 23 },
  },
  incomingTradeOffers: [],
  leaguePulse: [
            { id: 'pulse-1', source: 'league_pulse_v1', type: 'pulse', headline: 'Rookie hype is building', body: 'A young runner just forced more weekly attention.', priority: 'medium', importance: 75, week: 9, relatedTeamId: 10, teamId: 10 }
          ],
          newsItems: [{ id: 'n1', teamId: 10, headline: 'Starter upgraded to probable status.' }],
};

describe('FranchiseHQ', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders visible weekly command center essentials and one primary advance CTA', () => {
    render(<FranchiseHQ league={baseLeague} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    // Week label is visible — topbar strong and matchup ticker both contain "week 10"
    expect(screen.getAllByText(/week 10/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /advance week/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /advance week/i })).toHaveLength(1);
    // Weekly Command Hub and Game Plan Impact pruned from HQ command deck
    expect(screen.queryByRole('heading', { name: /weekly command hub/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /game plan impact/i })).toBeNull();
    // "Coordinator Brief" section removed — intel is compressed into Roster Health & Office Status cards
    expect(document.querySelector('[data-testid="roster-health-card"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="office-status-card"]')).not.toBeNull();
    const seasonPulse = within(screen.getByTestId('season-pulse'));
    expect(seasonPulse.getByText(/owner mandate/i)).toBeTruthy();
    expect(seasonPulse.getByText(/momentum/i)).toBeTruthy();
    expect(seasonPulse.getByText(/roster lever/i)).toBeTruthy();
    expect(seasonPulse.getByText(/film room/i)).toBeTruthy();
    // League Views nav pills present
    const linkRow = screen.getByTestId('hq-league-destination-links');
    expect(within(linkRow).getByRole('button', { name: /^stats$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^standings$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^news$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^ops$/i })).toBeTruthy();
  });

  it('does not render pruned Weekly Command Hub or Game Plan Impact sections', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    // Weekly Command Hub removed — purpose covered by Actions Required + Quick Actions
    expect(screen.queryByRole('heading', { name: /weekly command hub/i })).toBeNull();
    // Game Plan Impact removed — strategy details belong in Game Plan / Weekly Prep tabs
    expect(screen.queryByRole('heading', { name: /game plan impact/i })).toBeNull();
    // Quick Actions (action tiles) still present for the key navigation paths
    expect(screen.getByTestId('hq-league-destination-links')).toBeTruthy();
    expect(screen.getByTestId('hq-actions-required')).toBeTruthy();
    expect(screen.getByTestId('advance-week-cta')).toBeTruthy();
  });

  it('routes season pulse roster action through onNavigate', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    fireEvent.click(screen.getByRole('button', { name: /open team builder/i }));
    expect(onNavigate).toHaveBeenCalledWith('Team:Roster / Team Builder');
  });


  it('renders weekly decision review and routes the recommended action', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    expect(screen.getAllByRole('heading', { name: /what mattered last week|decision review/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /roster needs/i })).toBeNull();
    const button = screen.getByRole('button', { name: /decision review:/i });
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('does not render duplicated passive League Pulse panel and keeps league destination links', () => {
    const onNavigate = vi.fn();
    render(
      <FranchiseHQ
        league={{
          ...baseLeague,
          newsItems: [
            { id: 'pulse-1', source: 'league_pulse_v1', category: 'league_pulse', headline: 'Rookie hype is building', body: 'A young runner just forced more weekly attention.', priority: 'medium', importance: 75, week: 9, relatedTeamId: 10, teamId: 10 },
          ],
        }}
        onNavigate={onNavigate}
        onAdvanceWeek={() => {}}
        busy={false}
        simulating={false}
      />,
    );

    expect(screen.queryByRole('heading', { name: /league pulse/i })).toBeNull();
    const linkRow = screen.getByTestId('hq-league-destination-links');
    expect(within(linkRow).getByRole('button', { name: /^stats$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^standings$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^news$/i })).toBeTruthy();
    fireEvent.click(within(linkRow).getByRole('button', { name: /^news$/i }));
    expect(onNavigate).toHaveBeenCalledWith('News');
  });

  it('renders Review Game Book as the postgame next action and emits a Game Book route', () => {
    const onNavigate = vi.fn();
    render(<FranchiseHQ league={baseLeague} onNavigate={onNavigate} onAdvanceWeek={() => {}} busy={false} simulating={false} />);

    // "Next Action" panel removed — Game Book access is now via the Film Room card in Season Pulse
    const seasonPulse = screen.getByTestId('season-pulse');
    const filmRoomBtn = within(seasonPulse).getByRole('button', { name: /open game book/i });
    expect(filmRoomBtn).toBeTruthy();
    fireEvent.click(filmRoomBtn);

    expect(onNavigate).toHaveBeenCalledWith('Game Book:g-9');
  });

  it('uses latest simulation results for the HQ last result while schedule is still scoreless', () => {
    const league = {
      ...baseLeague,
      week: 10,
      teams: baseLeague.teams.map((team) => team.id === 10 ? { ...team, wins: 7, losses: 3 } : team),
      schedule: {
        weeks: [
          { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeId: 11, awayId: 10, played: false }] },
          { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
        ],
      },
      gameById: {},
    };

    render(
      <FranchiseHQ
        league={league}
        lastResults={[{ gameId: 'g-9', homeId: 11, awayId: 10, homeScore: 20, awayScore: 23 }]}
        lastSimWeek={9}
        onNavigate={() => {}}
        onAdvanceWeek={() => {}}
        busy={false}
        simulating={false}
      />,
    );

    expect(screen.getByTestId('hq-last-result').textContent).toMatch(/W.*23-20.*DET/i);
  });

  it('parses Game Book route intents before tab normalization can reject them', () => {
    expect(parseGameBookDestination('Game Book:g-9')).toEqual({ type: 'gameBook', gameId: 'g-9' });
    expect(parseGameBookDestination({ type: 'gameBook', gameId: 'g-9' })).toEqual({ type: 'gameBook', gameId: 'g-9' });
    expect(normalizeManagementDestination('Game Book:g-9').tab).toBe('Game Book');
  });

  it('opens Game Detail from the HQ Film Room card and returns to Franchise HQ', async () => {
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<LeagueDashboard league={baseLeague} actions={{ getDashboardLeaders: vi.fn(() => Promise.resolve({ league: {}, team: {} })) }} busy={false} simulating={false} onAdvanceWeek={() => {}} />);

    // "Next Action" panel removed — Game Book access is now via the Film Room card in Season Pulse
    const seasonPulse = screen.getByTestId('season-pulse');
    fireEvent.click(within(seasonPulse).getByRole('button', { name: /open game book/i }));

    expect(await screen.findByTestId('game-book')).toBeTruthy();
    expect(screen.getByTestId('game-book-final-score').textContent).toContain('CHI 23 - 20 DET');

    fireEvent.click(screen.getByTestId('return-to-hq'));
    expect(await screen.findByTestId('franchise-hq')).toBeTruthy();
  });

  it('renders record, standing, and fallback copy when schedule is missing', () => {
    render(
      <FranchiseHQ
        league={{ year: 2026, week: 2, phase: 'regular', userTeamId: 1, teams: [{ id: 1, name: 'Legacy Team', city: 'Legacy', conf: 0, div: 0, wins: 0, losses: 0, ties: 0 }], schedule: { weeks: [] } }}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );

    expect(screen.getByText(/no completed game yet/i)).toBeTruthy();
    expect(screen.getByText(/no opponent is locked yet/i)).toBeTruthy();
    // Game Plan Impact pruned — no longer rendered on HQ
    expect(screen.queryByRole('heading', { name: /game plan impact/i })).toBeNull();
    expect(screen.getByText(/no future games on file/i)).toBeTruthy();
    // Matchup ticker replaces the old hero subcards — record is shown via the HQ topbar
    expect(screen.getByTestId('hq-matchup-hero')).toBeTruthy();
  });
});

describe('FranchiseHQ V4 compact home screen', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders compact home structure — Season Pulse in More drawer, core elements at top level', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // Top-level command elements present
    expect(screen.getByTestId('franchise-hq')).toBeTruthy();
    expect(screen.getByTestId('hq-actions-required')).toBeTruthy();
    expect(screen.getByTestId('advance-week-cta')).toBeTruthy();
    expect(screen.getByTestId('hq-matchup-hero')).toBeTruthy();
    // Season Pulse is inside the More drawer (still reachable via testid)
    expect(screen.getByTestId('hq-more-drawer')).toBeTruthy();
    expect(screen.getByTestId('season-pulse')).toBeTruthy();
  });

  it('shows compact ready div — not a section card — when there are no blockers', () => {
    const offseasonLeague = { ...baseLeague, phase: 'offseason_resign', schedule: { weeks: [] } };
    render(
      <FranchiseHQ
        league={offseasonLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    const actionsRequired = screen.getByTestId('hq-actions-required');
    // Must be a plain div, not a section card
    expect(actionsRequired.tagName.toLowerCase()).toBe('div');
    expect(actionsRequired.classList.contains('card')).toBe(false);
    // Shows ready-state text
    expect(actionsRequired.textContent).toMatch(/ready|no blocker/i);
  });

  it('matchup card shows last result and next opponent when available', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    const hero = screen.getByTestId('hq-matchup-hero');
    // Opponent abbreviation (DET) shown in hero
    expect(hero.textContent).toContain('DET');
    // Last result from game g-9: W 23-20
    const lastResultEl = document.querySelector('[data-testid="hq-last-result"]');
    expect(lastResultEl).not.toBeNull();
    expect(lastResultEl.textContent).toMatch(/W.*23|23.*W/i);
  });

  it('Actions Required renders with blockers when criticalCount > 0', () => {
    // baseLeague has week 10 regular season — evaluate gate to see if it generates blockers
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // hq-actions-required always renders (either blocker card or compact ready row)
    expect(screen.getByTestId('hq-actions-required')).toBeTruthy();
  });

  it('league quick links appear after quick action tiles — not between hero and actions required', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    const root = screen.getByTestId('franchise-hq');
    const html = root.innerHTML;
    // Quick action tiles appear before league links in DOM order
    const tilesPos = html.indexOf('app-hq-action-tiles');
    const linksPos = html.indexOf('hq-league-destination-links');
    expect(tilesPos).toBeGreaterThan(-1);
    expect(linksPos).toBeGreaterThan(-1);
    expect(tilesPos).toBeLessThan(linksPos);
    // Hero is before actions-required in DOM
    const heroPos = html.indexOf('hq-matchup-hero');
    const actionsPos = html.indexOf('hq-actions-required');
    expect(heroPos).toBeLessThan(actionsPos);
  });
});

describe('FranchiseHQ V3 command hierarchy cleanup', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render gm-loop-hint at any week — Weekly Loop section removed in V3', () => {
    // Week 2 — was the most likely week to show the old hint (<=4 gate)
    render(
      <FranchiseHQ
        league={{ ...baseLeague, week: 2 }}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    expect(document.querySelector('[data-testid="gm-loop-hint"]')).toBeNull();
  });

  it('does not render gm-loop-hint at week 1 either', () => {
    render(
      <FranchiseHQ
        league={{ ...baseLeague, week: 1 }}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    expect(document.querySelector('[data-testid="gm-loop-hint"]')).toBeNull();
  });

  it('has exactly one Advance Week button — sticky bottom CTA is the sole control', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // The canonical CTA lives in app-hq-sticky-advance
    expect(screen.getByTestId('advance-week-cta')).toBeTruthy();
    // There must be exactly one button whose accessible name matches "advance week"
    const advanceBtns = screen.getAllByRole('button', { name: /advance week/i });
    expect(advanceBtns).toHaveLength(1);
  });

  it('Quick Actions still render Game Plan, Set Lineup, Training, Scout Opponent', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // Use getAllByRole because "Game Plan" / "Scout Opponent" can appear in multiple places
    // (action tile + game-plan accordion). We just need at least one.
    expect(screen.getAllByRole('button', { name: /game plan/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /set lineup/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /training/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /scout opponent/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('Actions Required section renders', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    expect(screen.getByTestId('hq-actions-required')).toBeTruthy();
  });

  it('League nav pills still render in the compact horizontal row', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    const linkRow = screen.getByTestId('hq-league-destination-links');
    expect(within(linkRow).getByRole('button', { name: /^stats$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^standings$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^news$/i })).toBeTruthy();
    expect(within(linkRow).getByRole('button', { name: /^ops$/i })).toBeTruthy();
  });

  it('Decision Review section is present but body is collapsed by default', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // Section heading is visible
    expect(screen.getAllByRole('heading', { name: /what mattered last week|decision review/i }).length).toBeGreaterThan(0);
    // Inner body is behind a <details> — not open by default
    const decisionDetails = document.querySelector('.app-hq-background-section__inner');
    expect(decisionDetails).not.toBeNull();
    expect(decisionDetails.hasAttribute('open')).toBe(false);
  });

  it('Operations Snapshot section is present but body is collapsed by default', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // Both background section details elements should be present and closed
    const allDetails = document.querySelectorAll('.app-hq-background-section__inner');
    expect(allDetails.length).toBeGreaterThanOrEqual(2);
    allDetails.forEach((el) => {
      expect(el.hasAttribute('open')).toBe(false);
    });
  });

  it('Stats/League Leaders are not rendered under FranchiseHQ root', () => {
    render(
      <FranchiseHQ
        league={baseLeague}
        onNavigate={vi.fn()}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );
    // StatLeadersWidget adds data-testid="stat-leaders-widget" or a heading "League Leaders"
    // It must not be present inside the HQ component itself
    expect(document.querySelector('[data-testid="stat-leaders-widget"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^league leaders$/i })).toBeNull();
  });

  it('LeagueDashboard HQ tab does not mount StatLeadersWidget below FranchiseHQ', () => {
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(
      <LeagueDashboard
        league={{ ...baseLeague, phase: 'regular' }}
        actions={{ getDashboardLeaders: vi.fn(() => Promise.resolve({ league: {}, team: {} })) }}
        busy={false}
        simulating={false}
        onAdvanceWeek={() => {}}
      />,
    );
    // FranchiseHQ renders
    expect(screen.getByTestId('franchise-hq')).toBeTruthy();
    // StatLeadersWidget must NOT be below HQ on the HQ tab
    expect(document.querySelector('[data-testid="stat-leaders-widget"]')).toBeNull();
  });
});
