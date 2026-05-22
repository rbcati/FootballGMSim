/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildAdvanceReadinessGate } from '../../utils/advanceReadinessGate.js';
import AdvanceReadinessGate from '../AdvanceReadinessGate.jsx';
import WeeklyHub from '../WeeklyHub.jsx';
import { markWeeklyPrepStep } from '../../utils/weeklyPrep.js';

// ─── shared fixtures ──────────────────────────────────────────────────────────

function makeLeague({ phase = 'regular', injuries = false, noNextGame = false } = {}) {
  const roster = [
    { id: 11, pos: 'QB', ovr: 80, teamId: 1, depthChart: { rowKey: 'QB' } },
  ];
  if (injuries) {
    roster.push({ id: 12, pos: 'WR', ovr: 75, teamId: 1, injuryWeeksRemaining: 3 });
  }
  return {
    year: 2027,
    week: 5,
    seasonId: 's5',
    phase,
    userTeamId: 1,
    teams: [
      {
        id: 1, name: 'Bears', abbr: 'CHI', conf: 0, div: 0,
        wins: 2, losses: 2, ovr: 80, offenseRating: 78, defenseRating: 79,
        recentResults: ['W', 'L', 'W', 'L'],
        roster,
      },
      {
        id: 2, name: 'Lions', abbr: 'DET', conf: 0, div: 1,
        wins: 3, losses: 1, ovr: 82, offenseRating: 80, defenseRating: 81,
        roster: [],
      },
    ],
    schedule: {
      weeks: noNextGame
        ? []
        : [{ week: 5, games: [{ id: 'g5', home: { id: 1 }, away: { id: 2 }, played: false }] }],
    },
    incomingTradeOffers: [],
    leaguePulse: [],
    newsItems: [],
  };
}

// Minimal prep objects for unit-testing buildAdvanceReadinessGate in isolation
function makeCleanPrep() {
  return {
    lineupIssues: [],
    completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
    nextGame: { week: 5, isHome: true },
    userTeam: { roster: [] },
    prepSummary: { severity: 'ok', reasons: [] },
    readinessTier: 'ok',
  };
}

function makePrepWithDepthBlocker() {
  return {
    lineupIssues: [{
      id: 'depth-QB',
      level: 'urgent',
      label: 'Depth chart blocker',
      detail: 'QB slot has no assigned starter.',
      actionTab: 'Roster:depth|ALL',
    }],
    completion: { lineupChecked: false, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
    nextGame: { week: 5, isHome: true },
    userTeam: { roster: [] },
    prepSummary: { severity: 'minor_risk', reasons: [] },
    readinessTier: 'minor_risk',
  };
}

function makePrepWithInjuries(reviewed = false) {
  return {
    lineupIssues: [],
    completion: { lineupChecked: true, injuriesReviewed: reviewed, opponentScouted: true, planReviewed: true },
    nextGame: { week: 5, isHome: true },
    userTeam: { roster: [{ id: 11, pos: 'QB', ovr: 80, injuryWeeksRemaining: 2 }] },
    prepSummary: { severity: 'minor_risk', reasons: [] },
    readinessTier: 'minor_risk',
  };
}

function makePrepWithPlanNotReviewed() {
  return {
    lineupIssues: [],
    completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: false },
    nextGame: { week: 5, isHome: true },
    userTeam: { roster: [] },
    prepSummary: { severity: 'minor_risk', reasons: [] },
    readinessTier: 'minor_risk',
  };
}

function makePrepWithMajorRisk() {
  return {
    lineupIssues: [],
    completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: true, planReviewed: true },
    nextGame: { week: 5, isHome: true },
    userTeam: { roster: [] },
    prepSummary: { severity: 'major_risk', reasons: ['Opponent defense is significantly stronger than your offense.'] },
    readinessTier: 'major_risk',
  };
}

// ─── buildAdvanceReadinessGate unit tests ────────────────────────────────────

describe('buildAdvanceReadinessGate — core logic', () => {
  it('returns no warning when prep is fully clean', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makeCleanPrep(),
    });
    expect(result.shouldWarn).toBe(false);
    expect(result.riskItems.filter((i) => i.severity !== 'info')).toHaveLength(0);
  });

  it('returns warning when game plan has not been reviewed', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithPlanNotReviewed(),
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.riskItems.some((i) => i.id === 'plan-not-reviewed')).toBe(true);
    expect(result.riskItems.find((i) => i.id === 'plan-not-reviewed')?.label).toMatch(/game plan has not been reviewed/i);
  });

  it('returns warning when injuries exist and injuriesReviewed is false', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithInjuries(false),
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.riskItems.some((i) => i.id === 'injuries-pending')).toBe(true);
    expect(result.riskItems.find((i) => i.id === 'injuries-pending')?.label).toMatch(/injuries have not been reviewed/i);
  });

  it('returns no injury warning when injuries exist but injuriesReviewed is true', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithInjuries(true),
    });
    const injuryItem = result.riskItems.find((i) => i.id === 'injuries-pending');
    expect(injuryItem).toBeUndefined();
  });

  it('returns warning when depth chart blocker exists', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithDepthBlocker(),
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.severity).toBe('danger');
    expect(result.riskItems.some((i) => i.id === 'depth-blocker')).toBe(true);
    expect(result.riskItems.find((i) => i.id === 'depth-blocker')?.label).toMatch(/depth chart blocker/i);
  });

  it('returns warning when prep impact is major_risk', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithMajorRisk(),
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.riskItems.some((i) => i.id === 'major-prep-risk')).toBe(true);
    expect(result.riskItems.find((i) => i.id === 'major-prep-risk')?.label).toMatch(/projected prep impact is negative/i);
  });

  it('returns no warning during offseason phases', () => {
    for (const phase of ['offseason_resign', 'free_agency', 'draft']) {
      const result = buildAdvanceReadinessGate({
        league: makeLeague({ phase }),
        prep: makePrepWithPlanNotReviewed(),
      });
      expect(result.shouldWarn).toBe(false);
    }
  });

  it('opponent-not-scouted alone does not trigger shouldWarn (info only)', () => {
    const prep = {
      ...makeCleanPrep(),
      completion: { lineupChecked: true, injuriesReviewed: true, opponentScouted: false, planReviewed: true },
    };
    const result = buildAdvanceReadinessGate({ league: makeLeague(), prep });
    expect(result.shouldWarn).toBe(false);
    expect(result.riskItems.find((i) => i.id === 'opponent-not-scouted')?.severity).toBe('info');
  });

  it('uses correct title copy when shouldWarn is true', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithPlanNotReviewed(),
    });
    expect(result.title).toMatch(/advance with unresolved prep/i);
    expect(result.summary).toMatch(/setup is not clean/i);
  });

  it('primaryFixDestination points to the most critical issue', () => {
    const result = buildAdvanceReadinessGate({
      league: makeLeague(),
      prep: makePrepWithDepthBlocker(),
    });
    expect(result.primaryFixDestination).toBe('Team:Roster / Depth');
  });

  it('handles undefined/missing inputs without throwing', () => {
    expect(() => buildAdvanceReadinessGate()).not.toThrow();
    expect(() => buildAdvanceReadinessGate({ league: null, prep: null })).not.toThrow();
    expect(buildAdvanceReadinessGate({ league: null }).shouldWarn).toBe(false);
  });
});

// ─── AdvanceReadinessGate component tests ────────────────────────────────────

describe('AdvanceReadinessGate component', () => {
  afterEach(cleanup);

  it('renders nothing when shouldWarn is false', () => {
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makeCleanPrep() });
    const { container } = render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={vi.fn()} onReview={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders gate panel with risk items when shouldWarn is true', () => {
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makePrepWithPlanNotReviewed() });
    render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={vi.fn()} onReview={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('advance-readiness-gate')).toBeTruthy();
    expect(screen.getByText(/advance with unresolved prep/i)).toBeTruthy();
    expect(screen.getByText(/game plan has not been reviewed/i)).toBeTruthy();
  });

  it('clicking Advance Anyway calls onAdvanceAnyway', () => {
    const onAdvanceAnyway = vi.fn();
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makePrepWithPlanNotReviewed() });
    render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={onAdvanceAnyway} onReview={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('gate-advance-anyway-btn'));
    expect(onAdvanceAnyway).toHaveBeenCalledTimes(1);
  });

  it('clicking Review Weekly Prep calls onReview with primaryFixDestination', () => {
    const onReview = vi.fn();
    // major-prep-risk → primaryFixDestination is 'Weekly Prep'
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makePrepWithMajorRisk() });
    render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={vi.fn()} onReview={onReview} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('gate-review-btn'));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledWith('Weekly Prep');
  });

  it('clicking Cancel calls onCancel and does not call onAdvanceAnyway', () => {
    const onCancel = vi.fn();
    const onAdvanceAnyway = vi.fn();
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makePrepWithInjuries() });
    render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={onAdvanceAnyway} onReview={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId('gate-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdvanceAnyway).not.toHaveBeenCalled();
  });

  it('shows the "Advance anyway" label from gate model', () => {
    const gate = buildAdvanceReadinessGate({ league: makeLeague(), prep: makePrepWithPlanNotReviewed() });
    render(
      <AdvanceReadinessGate gate={gate} onAdvanceAnyway={vi.fn()} onReview={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('gate-advance-anyway-btn').textContent).toMatch(/advance anyway/i);
  });
});

// ─── WeeklyHub advance gate integration tests ────────────────────────────────

describe('WeeklyHub — advance gate integration', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });
  afterEach(cleanup);

  it('clicking Advance Week with prep risks shows the gate panel instead of advancing', () => {
    const onAdvanceWeek = vi.fn();
    const league = makeLeague({ injuries: true });
    render(<WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={onAdvanceWeek} busy={false} simulating={false} onOpenBoxScore={vi.fn()} />);

    const advanceBtn = screen.getByRole('button', { name: /advance week/i });
    fireEvent.click(advanceBtn);

    expect(screen.getByTestId('advance-readiness-gate')).toBeTruthy();
    expect(onAdvanceWeek).not.toHaveBeenCalled();
  });

  it('clicking Advance Week with fully clean prep advances immediately without gate', () => {
    const onAdvanceWeek = vi.fn();
    const league = makeLeague();
    // Mark all prep steps complete in localStorage
    markWeeklyPrepStep(league, 'lineupChecked', true);
    markWeeklyPrepStep(league, 'injuriesReviewed', true);
    markWeeklyPrepStep(league, 'opponentScouted', true);
    markWeeklyPrepStep(league, 'planReviewed', true);
    render(<WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={onAdvanceWeek} busy={false} simulating={false} onOpenBoxScore={vi.fn()} />);

    const advanceBtn = screen.getByRole('button', { name: /advance week/i });
    fireEvent.click(advanceBtn);

    // Gate should not appear since prep is clean; onAdvanceWeek called directly
    expect(screen.queryByTestId('advance-readiness-gate')).toBeNull();
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
  });

  it('clicking Advance Anyway in gate calls onAdvanceWeek', () => {
    const onAdvanceWeek = vi.fn();
    const league = makeLeague({ injuries: true });
    render(<WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={onAdvanceWeek} busy={false} simulating={false} onOpenBoxScore={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /advance week/i }));
    expect(screen.getByTestId('advance-readiness-gate')).toBeTruthy();

    fireEvent.click(screen.getByTestId('gate-advance-anyway-btn'));
    expect(onAdvanceWeek).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel in gate closes the panel without advancing', () => {
    const onAdvanceWeek = vi.fn();
    const league = makeLeague({ injuries: true });
    render(<WeeklyHub league={league} onNavigate={vi.fn()} onAdvanceWeek={onAdvanceWeek} busy={false} simulating={false} onOpenBoxScore={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /advance week/i }));
    expect(screen.getByTestId('advance-readiness-gate')).toBeTruthy();

    fireEvent.click(screen.getByTestId('gate-cancel-btn'));
    expect(screen.queryByTestId('advance-readiness-gate')).toBeNull();
    expect(onAdvanceWeek).not.toHaveBeenCalled();
  });

  it('clicking Review Weekly Prep in gate navigates without advancing', () => {
    const onAdvanceWeek = vi.fn();
    const onNavigate = vi.fn();
    const league = makeLeague({ injuries: true });
    render(<WeeklyHub league={league} onNavigate={onNavigate} onAdvanceWeek={onAdvanceWeek} busy={false} simulating={false} onOpenBoxScore={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /advance week/i }));
    fireEvent.click(screen.getByTestId('gate-review-btn'));

    expect(onNavigate).toHaveBeenCalled();
    expect(onAdvanceWeek).not.toHaveBeenCalled();
    expect(screen.queryByTestId('advance-readiness-gate')).toBeNull();
  });
});
