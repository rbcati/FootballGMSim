/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoxScore from '../BoxScore.jsx';

vi.mock('../../hooks/useStableRouteRequest.js', () => ({ default: vi.fn(() => ({ data: null })) }));

const baseLeague = {
  seasonId: 2031,
  week: 5,
  teams: [{ id: 1, abbr: 'KC' }, { id: 2, abbr: 'BUF' }],
};

// Game with scoringSummary so buildGameFlowSummary produces a non-null gfs,
// which is required for the replay section to render at all.
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

// Fake timers prevent the ReplayableGameFlowViewer setInterval (started when
// initialMode="playing") from firing real ticks and causing act() warnings.
describe('BoxScore – opt-in auto-open replay gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('auto-opens the replay panel on mount when isManualSimRun is true', () => {
    const { getByTestId } = render(
      <BoxScore
        gameId="g-manual"
        league={{ ...baseLeague, gameById: { 'g-manual': gameWithFlow } }}
        isManualSimRun
        embedded
      />,
    );
    expect(getByTestId('rgfv-root')).toBeTruthy();
    expect(getByTestId('game-book-replay-toggle').textContent).toBe('Hide');
  });

  it('defaults to collapsed replay panel for standard history / archive loads', () => {
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-history"
        league={{ ...baseLeague, gameById: { 'g-history': gameWithFlow } }}
        embedded
      />,
    );
    expect(queryByTestId('rgfv-root')).toBeNull();
    expect(getByTestId('game-book-replay-toggle').textContent).toBe('Replay');
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
    expect(getByTestId('rgfv-root')).toBeTruthy();

    fireEvent.click(getByTestId('game-book-skip-to-box-score'));

    expect(queryByTestId('rgfv-root')).toBeNull();
    expect(getByTestId('game-book-replay-toggle').textContent).toBe('Replay');
  });

  it('skip button is absent when replay was opened via the manual toggle (not auto-opened)', () => {
    const { queryByTestId, getByTestId } = render(
      <BoxScore
        gameId="g-toggle-open"
        league={{ ...baseLeague, gameById: { 'g-toggle-open': gameWithFlow } }}
        embedded
      />,
    );
    // Manually expand the replay section via the toggle
    fireEvent.click(getByTestId('game-book-replay-toggle'));
    expect(getByTestId('rgfv-root')).toBeTruthy();
    // Skip button should NOT be present when isManualSimRun is false
    expect(queryByTestId('game-book-skip-to-box-score')).toBeNull();
  });

  it('passes initialMode="playing" to the viewer on manual sim launch', () => {
    const { getByTestId } = render(
      <BoxScore
        gameId="g-autoplay"
        league={{ ...baseLeague, gameById: { 'g-autoplay': gameWithFlow } }}
        isManualSimRun
        embedded
      />,
    );
    // The viewer renders in playing state — progress label reads "Playing…"
    expect(getByTestId('rgfv-progress').textContent).toBe('Playing…');
  });

  it('passes initialMode="paused" when viewer opened manually via toggle', () => {
    const { getByTestId } = render(
      <BoxScore
        gameId="g-paused"
        league={{ ...baseLeague, gameById: { 'g-paused': gameWithFlow } }}
        embedded
      />,
    );
    fireEvent.click(getByTestId('game-book-replay-toggle'));
    // Without isManualSimRun the viewer starts paused
    expect(getByTestId('rgfv-progress').textContent).toBe('Paused');
  });
});
