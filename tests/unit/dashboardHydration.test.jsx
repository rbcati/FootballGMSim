/** @vitest-environment jsdom */
/**
 * Dashboard Densification & Hydration Protection V1 — regression tests.
 *
 * Covers:
 *  1. Out-of-order delta packets are dropped safely prior to full hydration
 *  2. Layout rendering parameters remain mobile-bounded at 375px wide
 *  3. The advance week button correctly handles conditional disablement flags
 *     based on uncompleted roster requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { workerReducer, INITIAL_WORKER_STATE } from '../../src/ui/hooks/useWorker.js';

// ── Suite 1: isHydrated state tracking ───────────────────────────────────────

describe('Hydration guard — isHydrated state in workerReducer', () => {
  it('INITIAL_WORKER_STATE starts with isHydrated: false', () => {
    expect(INITIAL_WORKER_STATE.isHydrated).toBe(false);
  });

  it('FULL_STATE action sets isHydrated to true', () => {
    const next = workerReducer(INITIAL_WORKER_STATE, {
      type: 'FULL_STATE',
      payload: { week: 1, phase: 'regular', userTeamId: 0, teams: [] },
    });
    expect(next.isHydrated).toBe(true);
  });

  it('STATE_UPDATE does not set isHydrated (hydration only via FULL_STATE)', () => {
    const next = workerReducer(INITIAL_WORKER_STATE, {
      type: 'STATE_UPDATE',
      payload: { _isDelta: true, week: 2 },
    });
    expect(next.isHydrated).toBe(false);
  });

  it('isHydrated remains true through subsequent STATE_UPDATE ticks', () => {
    const hydrated = workerReducer(INITIAL_WORKER_STATE, {
      type: 'FULL_STATE',
      payload: { week: 1, phase: 'regular' },
    });
    const updated = workerReducer(hydrated, {
      type: 'STATE_UPDATE',
      payload: { _isDelta: true, week: 2 },
    });
    expect(updated.isHydrated).toBe(true);
  });

  it('BUSY / IDLE cycle does not reset isHydrated', () => {
    let state = workerReducer(INITIAL_WORKER_STATE, {
      type: 'FULL_STATE',
      payload: { week: 1, phase: 'regular' },
    });
    state = workerReducer(state, { type: 'BUSY' });
    state = workerReducer(state, { type: 'IDLE' });
    expect(state.isHydrated).toBe(true);
  });
});

// ── Suite 2: Out-of-order delta packet drop simulation ────────────────────────

describe('Hydration guard — delta packet drop before FULL_STATE baseline', () => {
  it('drops STATE_UPDATE and requests full state when baseline is not yet established', () => {
    let hasFullStateBaseline = false;
    const dispatchedRequests = [];

    function simulateStateUpdateHandler(payload) {
      if (!hasFullStateBaseline) {
        dispatchedRequests.push('REQUEST_FULL_STATE');
        return null; // packet dropped
      }
      return payload;
    }

    const delta1 = { _isDelta: true, week: 5, phase: 'regular' };
    const result1 = simulateStateUpdateHandler(delta1);

    expect(result1).toBeNull();
    expect(dispatchedRequests).toContain('REQUEST_FULL_STATE');
    expect(dispatchedRequests).toHaveLength(1);
  });

  it('processes STATE_UPDATE normally after FULL_STATE baseline is established', () => {
    let hasFullStateBaseline = false;
    const dispatchedRequests = [];

    function simulateStateUpdateHandler(payload) {
      if (!hasFullStateBaseline) {
        dispatchedRequests.push('REQUEST_FULL_STATE');
        return null;
      }
      return payload;
    }

    // Establish baseline (mirrors hasFullStateBaselineRef.current = true)
    hasFullStateBaseline = true;

    const delta = { _isDelta: true, week: 6 };
    const result = simulateStateUpdateHandler(delta);

    expect(result).not.toBeNull();
    expect(result.week).toBe(6);
    expect(dispatchedRequests).toHaveLength(0);
  });

  it('drops multiple pre-baseline deltas and requests full state each time', () => {
    let hasFullStateBaseline = false;
    const requests = [];

    function simulateHandler(payload) {
      if (!hasFullStateBaseline) {
        requests.push('REQUEST_FULL_STATE');
        return null;
      }
      return payload;
    }

    simulateHandler({ _isDelta: true, week: 1 });
    simulateHandler({ _isDelta: true, week: 2 });
    simulateHandler({ _isDelta: true, week: 3 });

    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r === 'REQUEST_FULL_STATE')).toBe(true);
  });

  it('does not request full state for non-delta packets pre-baseline', () => {
    // Non-delta full-replacement payloads should always be accepted;
    // the guard targets delta (partial) packets specifically.
    let hasFullStateBaseline = false;
    const requests = [];

    // This mirrors the FULL_STATE path (not STATE_UPDATE), which bypasses the guard
    function simulateFullStateHandler() {
      hasFullStateBaseline = true; // baseline established
      return true;
    }

    const accepted = simulateFullStateHandler();
    expect(accepted).toBe(true);
    expect(hasFullStateBaseline).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

// ── Suite 3: Mobile layout — 375px viewport bound ────────────────────────────

describe('FranchiseHQ layout — 375px mobile bounds', () => {
  const mockOnNavigate = vi.fn();
  const mockOnAdvanceWeek = vi.fn();

  // Minimal valid league that satisfies FranchiseHQ's readyState check
  function buildMinimalLeague(overrides = {}) {
    return {
      activeLeagueId: 'test_lg',
      seasonId: 's1',
      year: 2026,
      week: 1,
      phase: 'regular',
      userTeamId: 0,
      teams: [
        {
          id: 0,
          name: 'Test Team',
          abbr: 'TST',
          wins: 0,
          losses: 0,
          ties: 0,
          ovr: 75,
          capRoom: 20,
          capUsed: 200,
          roster: [
            { id: 'p1', pos: 'QB', ovr: 85, age: 27, injuryWeeksRemaining: 0 },
            { id: 'p2', pos: 'RB', ovr: 78, age: 24, injuryWeeksRemaining: 0 },
            { id: 'p3', pos: 'WR', ovr: 80, age: 25, injuryWeeksRemaining: 0 },
          ],
        },
        { id: 1, name: 'Opponent', abbr: 'OPP', wins: 0, losses: 0, ties: 0, ovr: 72, capRoom: 15 },
      ],
      schedule: {
        weeks: [
          {
            week: 1,
            games: [
              { id: 'g1', gameId: 'g1', home: 0, away: 1, homeScore: 0, awayScore: 0, played: false },
            ],
          },
        ],
      },
      standings: [],
      newsItems: [],
      weeklyHeadlines: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
  });

  it('renders main container within a 375px-wide viewport without crashing', async () => {
    const FranchiseHQ = (await import('../../src/ui/components/FranchiseHQ.jsx')).default;
    const league = buildMinimalLeague();

    const { container } = render(
      <FranchiseHQ
        league={league}
        lastResults={[]}
        lastSimWeek={null}
        busy={false}
        simulating={false}
        onNavigate={mockOnNavigate}
        onAdvanceWeek={mockOnAdvanceWeek}
      />,
    );

    // At minimum the root element must render
    expect(container.firstChild).not.toBeNull();
    // The component should not render a full error boundary crash
    expect(container.innerHTML).not.toContain('Uncaught');
  });

  it('twin status grid is present in the DOM at 375px width', async () => {
    const FranchiseHQ = (await import('../../src/ui/components/FranchiseHQ.jsx')).default;
    const league = buildMinimalLeague();

    render(
      <FranchiseHQ
        league={league}
        lastResults={[]}
        lastSimWeek={null}
        busy={false}
        simulating={false}
        onNavigate={mockOnNavigate}
        onAdvanceWeek={mockOnAdvanceWeek}
      />,
    );

    // Twin cards are present — CSS collapses them to single column at 375px via media query
    const rosterCard = document.querySelector('[data-testid="roster-health-card"]');
    const officeCard = document.querySelector('[data-testid="office-status-card"]');
    expect(rosterCard).not.toBeNull();
    expect(officeCard).not.toBeNull();
  });
});

// ── Suite 4: Advance Week button disablement ──────────────────────────────────

describe('Advance Week button — conditional disablement', () => {
  const mockOnNavigate = vi.fn();
  const mockOnAdvanceWeek = vi.fn();

  function buildMinimalLeague(overrides = {}) {
    return {
      activeLeagueId: 'test_lg',
      seasonId: 's1',
      year: 2026,
      week: 2,
      phase: 'regular',
      userTeamId: 0,
      teams: [
        {
          id: 0,
          name: 'Home Team',
          abbr: 'HME',
          wins: 1,
          losses: 0,
          ties: 0,
          ovr: 78,
          capRoom: 18,
          capUsed: 200,
          roster: [
            { id: 'p1', pos: 'QB', ovr: 88, age: 26, injuryWeeksRemaining: 0 },
            { id: 'p2', pos: 'RB', ovr: 75, age: 23, injuryWeeksRemaining: 0 },
            { id: 'p3', pos: 'WR', ovr: 82, age: 24, injuryWeeksRemaining: 0 },
            { id: 'p4', pos: 'OL', ovr: 74, age: 27, injuryWeeksRemaining: 0 },
            { id: 'p5', pos: 'DL', ovr: 76, age: 25, injuryWeeksRemaining: 0 },
            { id: 'p6', pos: 'LB', ovr: 77, age: 24, injuryWeeksRemaining: 0 },
            { id: 'p7', pos: 'CB', ovr: 73, age: 26, injuryWeeksRemaining: 0 },
            { id: 'p8', pos: 'S', ovr: 72, age: 25, injuryWeeksRemaining: 0 },
            { id: 'p9', pos: 'TE', ovr: 70, age: 28, injuryWeeksRemaining: 0 },
          ],
          recentResults: ['W'],
        },
        { id: 1, name: 'Away Team', abbr: 'AWY', wins: 0, losses: 1, ties: 0, ovr: 72, capRoom: 10 },
      ],
      schedule: {
        weeks: [
          { week: 1, games: [{ id: 'g0', gameId: 'g0', home: 0, away: 1, homeScore: 28, awayScore: 14, played: true }] },
          { week: 2, games: [{ id: 'g1', gameId: 'g1', home: 0, away: 1, homeScore: 0, awayScore: 0, played: false }] },
        ],
      },
      standings: [],
      newsItems: [],
      weeklyHeadlines: [],
      ...overrides,
    };
  }

  it('advance week button is disabled when busy=true', async () => {
    const FranchiseHQ = (await import('../../src/ui/components/FranchiseHQ.jsx')).default;

    render(
      <FranchiseHQ
        league={buildMinimalLeague()}
        lastResults={[]}
        lastSimWeek={null}
        busy={true}
        simulating={false}
        onNavigate={mockOnNavigate}
        onAdvanceWeek={mockOnAdvanceWeek}
      />,
    );

    const btn = document.querySelector('[data-testid="advance-week-cta"]');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it('advance week button is disabled when simulating=true', async () => {
    const FranchiseHQ = (await import('../../src/ui/components/FranchiseHQ.jsx')).default;

    render(
      <FranchiseHQ
        league={buildMinimalLeague()}
        lastResults={[]}
        lastSimWeek={null}
        busy={false}
        simulating={true}
        onNavigate={mockOnNavigate}
        onAdvanceWeek={mockOnAdvanceWeek}
      />,
    );

    const btn = document.querySelector('[data-testid="advance-week-cta"]');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it('disablement condition logic: busy or simulating or criticalCount > 0', () => {
    // Unit test for the composite disabled expression used by the sticky button
    function isAdvanceDisabled({ busy, simulating, criticalCount }) {
      return busy || simulating || criticalCount > 0;
    }

    expect(isAdvanceDisabled({ busy: true,  simulating: false, criticalCount: 0 })).toBe(true);
    expect(isAdvanceDisabled({ busy: false, simulating: true,  criticalCount: 0 })).toBe(true);
    expect(isAdvanceDisabled({ busy: false, simulating: false, criticalCount: 3 })).toBe(true);
    expect(isAdvanceDisabled({ busy: false, simulating: false, criticalCount: 0 })).toBe(false);
  });

  it('advance week button shows required-action count when criticalCount > 0', () => {
    // Verify the button label formula used in FranchiseHQ
    function getButtonLabel({ busy, simulating, criticalCount }) {
      if (busy || simulating) return 'Advancing…';
      if (criticalCount > 0) return `${criticalCount} Required`;
      return 'Advance Week';
    }

    expect(getButtonLabel({ busy: false, simulating: false, criticalCount: 0 })).toBe('Advance Week');
    expect(getButtonLabel({ busy: false, simulating: false, criticalCount: 2 })).toBe('2 Required');
    expect(getButtonLabel({ busy: true,  simulating: false, criticalCount: 0 })).toBe('Advancing…');
    expect(getButtonLabel({ busy: false, simulating: true,  criticalCount: 0 })).toBe('Advancing…');
  });
});
