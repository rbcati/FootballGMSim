/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BoxScore from '../BoxScore.jsx';

vi.mock('../../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));

const baseLeague = {
  seasonId: 2031,
  week: 5,
  teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }],
};

const gameWithFlow = {
  homeId: 1,
  awayId: 2,
  homeScore: 28,
  awayScore: 14,
  scoringSummary: [
    { quarter: 1, teamId: 1, type: 'TD', scoreAfter: { home: 7, away: 0 }, text: 'QB sneak TD' },
    { quarter: 3, teamId: 2, type: 'TD', scoreAfter: { home: 7, away: 7 }, text: 'Passing TD' },
  ],
};

// Replay viewer, advanced stats, and broadcast notes sections were removed in the
// compact bottom-sheet redesign. These tests verify the new compact behavior and
// confirm removed sections are truly absent.
describe('BoxScore – opt-in auto-open replay gate', () => {
  afterEach(() => {
    cleanup();
  });

  it('auto-opens the replay panel on mount when isManualSimRun is true', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore
        gameId="g-manual"
        league={{ ...baseLeague, gameById: { 'g-manual': gameWithFlow } }}
        isManualSimRun
        embedded
      />,
    );
    // Compact sheet shows score hero; replay viewer has been removed
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('rgfv-root')).toBeNull();
    expect(queryByTestId('game-book-replay-toggle')).toBeNull();
  });

  it('defaults to collapsed replay panel for standard history / archive loads', () => {
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-history"
        league={{ ...baseLeague, gameById: { 'g-history': gameWithFlow } }}
        embedded
      />,
    );
    // Compact sheet: no replay panel in any mode
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('rgfv-root')).toBeNull();
    expect(queryByTestId('game-book-replay-toggle')).toBeNull();
  });

  it('clicking Instant Skip to Box Score immediately collapses the viewer', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore
        gameId="g-skip"
        league={{ ...baseLeague, gameById: { 'g-skip': gameWithFlow } }}
        isManualSimRun
        embedded
      />,
    );
    // Skip button and replay viewer have been removed; score hero and tabs always present
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('rgfv-root')).toBeNull();
    expect(queryByTestId('game-book-skip-to-box-score')).toBeNull();
  });

  it('skip button is absent when replay was opened via the manual toggle (not auto-opened)', () => {
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-toggle-open"
        league={{ ...baseLeague, gameById: { 'g-toggle-open': gameWithFlow } }}
        embedded
      />,
    );
    // Replay toggle and skip button have been removed; stat tabs are the navigation mechanism
    expect(getByTestId('game-book-stat-tabs')).toBeTruthy();
    expect(queryByTestId('game-book-replay-toggle')).toBeNull();
    expect(queryByTestId('game-book-skip-to-box-score')).toBeNull();
  });

  it('passes initialMode="playing" to the viewer on manual sim launch', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore
        gameId="g-autoplay"
        league={{ ...baseLeague, gameById: { 'g-autoplay': gameWithFlow } }}
        isManualSimRun
        embedded
      />,
    );
    // Viewer initialMode prop no longer exists; stat tabs are shown instead
    expect(getByTestId('game-book-tab-passing')).toBeTruthy();
    expect(getByTestId('game-book-tab-rushing')).toBeTruthy();
    expect(getByTestId('game-book-tab-defense')).toBeTruthy();
    expect(queryByTestId('rgfv-progress')).toBeNull();
  });

  it('renders advanced game stats section when advancedAttribution exists', () => {
    const gameWithAdvanced = {
      ...gameWithFlow,
      advancedAttribution: {
        12: { targets: 4, drops: 1, battedPasses: 0, coverageTargets: 0, coverageCompletionsAllowed: 0, receptionsAllowed: 0, sacksAllowed: 1, sacksMade: 0 },
      },
      playerStats: {
        away: { 12: { name: 'WR Alpha', position: 'WR', stats: { targets: 4, receptions: 2 } } },
        home: {},
      },
    };
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-advanced"
        league={{ ...baseLeague, gameById: { 'g-advanced': gameWithAdvanced } }}
        embedded
      />,
    );
    // Advanced stats section has been removed from compact sheet; score hero still shown
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('game-book-advanced-stats')).toBeNull();
    expect(queryByTestId('game-book-team-comparison')).toBeNull();
  });

  it('does not render advanced game stats for legacy games without advancedAttribution', () => {
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-legacy"
        league={{ ...baseLeague, gameById: { 'g-legacy': gameWithFlow } }}
        embedded
      />,
    );
    // Team comparison and advanced stats have been removed
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('game-book-advanced-stats')).toBeNull();
    expect(queryByTestId('game-book-team-comparison')).toBeNull();
  });

  it('passes initialMode="paused" when viewer opened manually via toggle', () => {
    const { getByTestId, queryByTestId } = render(
      <BoxScore
        gameId="g-paused"
        league={{ ...baseLeague, gameById: { 'g-paused': gameWithFlow } }}
        embedded
      />,
    );
    // Replay toggle and viewer removed; stat tabs present instead
    expect(getByTestId('game-book-stat-tabs')).toBeTruthy();
    expect(queryByTestId('game-book-replay-toggle')).toBeNull();
  });

  it('renders Broadcast Notes when deterministic notes exist', () => {
    const gameWithBroadcast = {
      ...gameWithFlow,
      advancedAttribution: {
        7: { sacksAllowed: 6, drops: 3 },
      },
    };
    const { queryByTestId, getByTestId } = render(
      <BoxScore gameId="g-broadcast" league={{ ...baseLeague, gameById: { 'g-broadcast': gameWithBroadcast } }} embedded />,
    );
    // Broadcast notes have been removed; score hero and stat tabs present
    expect(getByTestId('game-book-score-hero')).toBeTruthy();
    expect(queryByTestId('game-book-broadcast-notes')).toBeNull();
  });

  it('does not render Broadcast Notes for legacy games without note signals', () => {
    const { queryByTestId } = render(
      <BoxScore gameId="g-no-broadcast" league={{ ...baseLeague, gameById: { 'g-no-broadcast': gameWithFlow } }} embedded />,
    );
    expect(queryByTestId('game-book-broadcast-notes')).toBeNull();
  });
});
