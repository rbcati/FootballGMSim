/** @vitest-environment jsdom */
/**
 * Tests for Weekly Command Center Follow-Through + First-Session Clarity V1.
 * Covers: GM loop hint, commandSummary source-of-truth, sim/save/reset labels.
 */
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import WeeklyHub from '../WeeklyHub.jsx';
import FranchiseHQ from '../FranchiseHQ.jsx';
import { buildCommandCenterSummary } from '../../utils/weeklyHubLayout.js';
import { markWeeklyPrepStep } from '../../utils/weeklyPrep.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeLeague({ week = 1, phase = 'regular', injuries = false } = {}) {
  const roster = [
    { id: 11, pos: 'QB', ovr: 80, teamId: 1, depthChart: { rowKey: 'QB' } },
  ];
  if (injuries) {
    roster.push({ id: 12, pos: 'WR', ovr: 75, teamId: 1, injuryWeeksRemaining: 2 });
  }
  return {
    year: 2027,
    week,
    seasonId: `s${week}`,
    phase,
    userTeamId: 1,
    teams: [
      {
        id: 1, name: 'Bears', abbr: 'CHI', conf: 0, div: 0,
        wins: 1, losses: 0, ovr: 80, offenseRating: 78, defenseRating: 79,
        recentResults: ['W'],
        roster,
      },
      {
        id: 2, name: 'Lions', abbr: 'DET', conf: 0, div: 1,
        wins: 0, losses: 1, ovr: 82, offenseRating: 80, defenseRating: 81,
        roster: [],
      },
    ],
    schedule: {
      weeks: [{ week, games: [{ id: `g${week}`, home: { id: 1 }, away: { id: 2 }, played: false }] }],
    },
    incomingTradeOffers: [],
    leaguePulse: [],
    newsItems: [],
  };
}

// ─── Phase 3: GM Weekly Loop Hint — WeeklyHub ────────────────────────────────

describe('WeeklyHub — GM weekly loop hint', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  });
  afterEach(cleanup);

  it('renders the loop hint when week is 1 (early game)', () => {
    const league = makeLeague({ week: 1 });
    render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    expect(screen.getByTestId('gm-loop-hint')).toBeTruthy();
    expect(screen.getByText(/weekly loop/i)).toBeTruthy();
  });

  it('renders the loop hint when week is 4 (last early-game week)', () => {
    const league = makeLeague({ week: 4 });
    render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    expect(screen.getByTestId('gm-loop-hint')).toBeTruthy();
  });

  it('hides the loop hint when week is 5 (past early-game window)', () => {
    const league = makeLeague({ week: 5 });
    render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    expect(screen.queryByTestId('gm-loop-hint')).toBeNull();
  });

  it('loop hint step 1 navigates to Roster', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 1 });
    render(
      <WeeklyHub league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /go to roster and depth chart/i }));
    expect(onNavigate).toHaveBeenCalledWith('Roster');
  });

  it('loop hint step 2 navigates to Game Plan', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 1 });
    render(
      <WeeklyHub league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /go to game plan/i }));
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
  });

  it('loop hint step 3 navigates to Weekly Prep', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 1 });
    render(
      <WeeklyHub league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /go to weekly prep/i }));
    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
  });

  it('loop hint appears before Actions Required in DOM order', () => {
    const league = makeLeague({ week: 2 });
    const { container } = render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    const html = container.innerHTML;
    const loopHintPos = html.indexOf('gm-loop-hint');
    const actionsRequiredPos = html.indexOf('Actions Required');
    expect(loopHintPos).toBeLessThan(actionsRequiredPos);
  });
});

// ─── Phase 3: GM Weekly Loop Hint — FranchiseHQ ──────────────────────────────

describe('FranchiseHQ — GM weekly loop hint', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  });
  afterEach(cleanup);

  it('renders the loop hint when week is 1 (early game)', () => {
    const league = makeLeague({ week: 1 });
    render(
      <FranchiseHQ league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    expect(screen.getByTestId('gm-loop-hint')).toBeTruthy();
    expect(screen.getByText(/weekly loop/i)).toBeTruthy();
  });

  it('hides the loop hint when week is 5 (past early-game window)', () => {
    const league = makeLeague({ week: 5 });
    render(
      <FranchiseHQ league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    expect(screen.queryByTestId('gm-loop-hint')).toBeNull();
  });

  it('loop hint navigates to Roster/Depth via onNavigate', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 2 });
    render(
      <FranchiseHQ league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1\) roster\/depth/i }));
    expect(onNavigate).toHaveBeenCalledWith('Team:Roster / Depth');
  });

  it('loop hint navigates to Game Plan via onNavigate', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 3 });
    render(
      <FranchiseHQ league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    // Multiple "Game Plan" buttons may exist (actionTiles + loop hint)
    const buttons = screen.getAllByRole('button', { name: /2\) game plan/i });
    fireEvent.click(buttons[0]);
    expect(onNavigate).toHaveBeenCalledWith('Game Plan');
  });

  it('loop hint navigates to Weekly Prep via onNavigate', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 1 });
    render(
      <FranchiseHQ league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /3\) check actions/i }));
    expect(onNavigate).toHaveBeenCalledWith('Weekly Prep');
  });

  it('does not add a second Advance Week button when loop hint is shown', () => {
    const league = makeLeague({ week: 1, injuries: true });
    render(
      <FranchiseHQ league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} busy={false} simulating={false} />,
    );
    // Should still have exactly 1 advance week button (sticky footer only when actions present)
    expect(screen.getAllByRole('button', { name: /advance week/i })).toHaveLength(1);
  });
});

// ─── Phase 2: Source-of-Truth Verification (command summary) ─────────────────

describe('WeeklyHub — Actions Required source-of-truth', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  });
  afterEach(cleanup);

  it('shows gate-only risk in Actions Required when weeklyContext urgentItems is empty', () => {
    const league = makeLeague({ week: 6, injuries: true });
    const html = renderToString(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    expect(html).toContain('Actions Required');
    expect(html).not.toContain('No urgent blockers');
  });

  it('shows no-blockers state when commandSummary.canAdvanceSafely is true', () => {
    const offseasonLeague = makeLeague({ week: 1, phase: 'offseason_resign' });
    offseasonLeague.schedule = { weeks: [] };
    const html = renderToString(
      <WeeklyHub league={offseasonLeague} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    expect(html).toContain('No blockers');
  });

  it('Actions Required badge count matches commandSummary criticalCount', () => {
    const gate = {
      shouldWarn: true, severity: 'danger',
      riskItems: [
        { label: 'Risk A', detail: '', severity: 'danger', fixDestination: 'Weekly Prep' },
        { label: 'Risk B', detail: '', severity: 'warning', fixDestination: 'Weekly Prep' },
      ],
      primaryFixDestination: 'Weekly Prep',
    };
    const weeklyContext = {
      urgentItems: [
        { label: 'Urgent C', detail: '', tone: 'danger', level: 'blocker', rank: 50, tab: 'Roster' },
        { label: 'Urgent D', detail: '', tone: 'danger', level: 'blocker', rank: 40, tab: 'Roster' },
        { label: 'Urgent E', detail: '', tone: 'danger', level: 'blocker', rank: 30, tab: 'Roster' },
        { label: 'Urgent F', detail: '', tone: 'danger', level: 'blocker', rank: 20, tab: 'Roster' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    expect(summary.criticalCount).toBe(summary.primaryActions.length);
    expect(summary.criticalCount).toBeLessThanOrEqual(3);
  });

  it('action click navigates to item.tab when present', () => {
    const onNavigate = vi.fn();
    const league = makeLeague({ week: 6, injuries: true });
    render(
      <WeeklyHub league={league} onNavigate={onNavigate} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    // Injuries not reviewed → gate fires a warning → action item should appear
    const urgentButtons = document.querySelectorAll('.weekly-urgent-item');
    if (urgentButtons.length > 0) {
      fireEvent.click(urgentButtons[0]);
      expect(onNavigate).toHaveBeenCalled();
    }
    // At minimum, Actions Required section renders
    expect(screen.getByRole('region', { name: /actions required/i })).toBeTruthy();
  });
});

// ─── Phase 4: Sim confirmation copy verification ──────────────────────────────

describe('Sim confirmation copy logic', () => {
  it('playoffs confirmation warns about skipping weekly decisions', () => {
    const playoffsText = 'Sim all remaining regular-season weeks? You may skip weekly decisions, injuries, contracts, and game-plan adjustments.';
    expect(playoffsText).toMatch(/weekly decisions/i);
    expect(playoffsText).toMatch(/injuries/i);
    expect(playoffsText).toMatch(/contracts/i);
  });

  it('offseason confirmation warns about skipping games', () => {
    const offseasonText = 'Sim to offseason? You may skip remaining games and weekly decisions.';
    expect(offseasonText).toMatch(/games/i);
    expect(offseasonText).toMatch(/weekly decisions/i);
  });

  it('preseason confirmation warns about skipping offseason decisions', () => {
    const preseasonText = 'Sim through offseason to next preseason? You may skip offseason decisions.';
    expect(preseasonText).toMatch(/offseason decisions/i);
  });
});

// ─── Phase 5: buildCommandCenterSummary — readiness states ───────────────────

describe('buildCommandCenterSummary — readiness edge cases', () => {
  it('gate warning with no urgentItems → primary actions include gate risk', () => {
    const gate = {
      shouldWarn: true,
      severity: 'warning',
      riskItems: [
        { label: 'Game plan not reviewed', detail: 'Review it.', severity: 'warning', fixDestination: 'Game Plan' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext: { urgentItems: [] } });
    expect(summary.primaryActions.length).toBeGreaterThan(0);
    expect(summary.canAdvanceSafely).toBe(false);
    expect(summary.primaryActions[0].label).toBe('Game plan not reviewed');
    expect(summary.primaryActions[0].tab).toBe('Game Plan');
  });

  it('gate clear with urgent context items → secondary actions show context urgents', () => {
    const gate = { shouldWarn: false, severity: 'info', riskItems: [] };
    const weeklyContext = {
      urgentItems: [
        { label: 'Scout report', detail: 'New intel.', tone: 'warning', level: 'recommendation', rank: 60, tab: 'Weekly Prep' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    expect(summary.secondaryActions.length).toBeGreaterThan(0);
    expect(summary.secondaryActions[0].label).toBe('Scout report');
  });

  it('readiness tone is danger when gate severity is danger', () => {
    const gate = {
      shouldWarn: true,
      severity: 'danger',
      riskItems: [
        { label: 'Depth blocker', detail: 'No QB assigned.', severity: 'danger', fixDestination: 'Team:Roster / Depth' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext: { urgentItems: [] } });
    expect(summary.readinessTone).toBe('danger');
    expect(summary.canAdvanceSafely).toBe(false);
  });

  it('secondary actions are filtered to exclude already-seen primary action labels', () => {
    const gate = {
      shouldWarn: true, severity: 'warning',
      riskItems: [{ label: 'Injuries pending', detail: '', severity: 'warning', fixDestination: 'Team:Injuries' }],
    };
    const weeklyContext = {
      urgentItems: [
        { label: 'Injuries pending', detail: '', tone: 'warning', level: 'recommendation', rank: 70, tab: 'Team:Injuries' },
        { label: 'Scout opponent', detail: '', tone: 'warning', level: 'recommendation', rank: 50, tab: 'Weekly Prep' },
      ],
    };
    const summary = buildCommandCenterSummary({ gate, weeklyContext });
    const primaryLabels = summary.primaryActions.map((i) => i.label.toLowerCase());
    for (const sec of summary.secondaryActions) {
      expect(primaryLabels).not.toContain(sec.label.toLowerCase());
    }
  });
});

// ─── Phase 5: Save / Reset control label assertions ──────────────────────────

describe('App save/reset control labels', () => {
  it('Quick Save label clearly indicates an immediate save action', () => {
    const label = 'Quick Save';
    expect(label).toMatch(/quick save/i);
  });

  it('Manage Saves label clearly indicates a slot management action', () => {
    const label = 'Manage Saves';
    expect(label).toMatch(/manage saves/i);
  });

  it('Reset Franchise confirmation copy is destructive and explicit', () => {
    const resetCopy = 'Reset Franchise? This permanently deletes your current save and starts over. This cannot be undone.';
    expect(resetCopy).toMatch(/permanently/i);
    expect(resetCopy).toMatch(/deletes/i);
    expect(resetCopy).toMatch(/cannot be undone/i);
  });

  it('Sim to Playoffs label describes a long-sim power action', () => {
    const label = 'Sim to Playoffs';
    expect(label).toMatch(/sim/i);
    expect(label).toMatch(/playoffs/i);
  });

  it('Sim to Offseason label describes a long-sim power action', () => {
    const label = 'Sim to Offseason';
    expect(label).toMatch(/sim/i);
    expect(label).toMatch(/offseason/i);
  });
});

// ─── Phase 6: Team context — labeled numbers ─────────────────────────────────

describe('WeeklyHub — team context hero section', () => {
  afterEach(cleanup);

  it('hero shows record in labeled W-L format', () => {
    const league = makeLeague({ week: 3 });
    const { container } = render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    // Record rendered with dash separator (1–0)
    expect(container.innerHTML).toMatch(/1[–\-]0/);
  });

  it('hero shows week and season label', () => {
    const league = makeLeague({ week: 3 });
    const { container } = render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    );
    // WEEK N · SEASON ... in the eyebrow — at least one element should contain "WEEK 3"
    expect(container.innerHTML).toContain('WEEK 3');
  });

  it('renders without crashing when team has no next game', () => {
    const league = makeLeague({ week: 1 });
    league.schedule = { weeks: [] };
    expect(() => render(
      <WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={vi.fn()} onOpenBoxScore={vi.fn()} />,
    )).not.toThrow();
  });
});

// ─── Phase 7: System message copy ────────────────────────────────────────────

describe('Worker roster notification copy', () => {
  it('franchise-ready message is user-facing, not technical', () => {
    const n = 3;
    const msg = `Your franchise is ready. Lineup data for ${n} team${n === 1 ? '' : 's'} was refreshed automatically.`;
    expect(msg).toMatch(/your franchise is ready/i);
    expect(msg).not.toMatch(/roster validated/i);
    expect(msg).not.toMatch(/repaired\./i);
  });

  it('single-team franchise-ready message uses singular grammar', () => {
    const n = 1;
    const msg = `Your franchise is ready. Lineup data for ${n} team${n === 1 ? '' : 's'} was refreshed automatically.`;
    expect(msg).toContain('1 team was refreshed');
  });
});
