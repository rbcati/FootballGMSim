/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LiveGame from '../LiveGame.jsx';

// LiveGame only becomes visible when a simulation starts. To exercise the
// finished/results state we render with simulating=true first, then re-render
// with simulating=false — mirroring the real advance-week flow.
function renderFinished(props) {
  const view = render(<LiveGame simulating simProgress={10} {...props} />);
  view.rerender(<LiveGame simulating={false} simProgress={100} {...props} />);
  return view;
}

const USER_ID = 10;
const OPP_ID = 11;

const baseTeams = [
  { id: USER_ID, abbr: 'CHI', name: 'Bears' },
  { id: OPP_ID, abbr: 'DET', name: 'Lions' },
  { id: 12, abbr: 'GB', name: 'Packers' },
  { id: 13, abbr: 'MIN', name: 'Vikings' },
];

function leagueWith(weekGames) {
  return {
    week: 9,
    seasonId: 's9',
    userTeamId: USER_ID,
    teams: baseTeams,
    schedule: { weeks: [{ week: 9, games: weekGames }] },
  };
}

describe('LiveGame — week results integrity', () => {
  afterEach(() => cleanup());

  it('renders the resolved user game when game results are available', () => {
    const league = leagueWith([
      { home: USER_ID, away: OPP_ID },
      { home: 12, away: 13 },
    ]);
    const userEvent = { gameId: 's9_w9_10_11', homeId: USER_ID, awayId: OPP_ID, homeAbbr: 'CHI', awayAbbr: 'DET', homeScore: 27, awayScore: 17 };
    renderFinished({
      league,
      gameEvents: [userEvent],
      lastResults: [{ homeId: USER_ID, awayId: OPP_ID, homeName: 'Bears', awayName: 'Lions', homeScore: 27, awayScore: 17 }],
      simulatedWeek: 9,
    });

    // The final card surfaces the user's result.
    expect(screen.getByTestId('live-final-card')).toBeTruthy();
    expect(screen.queryByTestId('live-scoreboard-empty')).toBeNull();
    expect(document.body.textContent).toMatch(/27/);
    expect(document.body.textContent).toMatch(/17/);
  });

  it('does NOT show "No games to display" when other games have resolved but the user has none', () => {
    // User is on a bye (no user game in the schedule) but the league has results.
    const league = leagueWith([{ home: 12, away: 13 }]);
    const otherEvent = { gameId: 's9_w9_12_13', homeId: 12, awayId: 13, homeAbbr: 'GB', awayAbbr: 'MIN', homeScore: 21, awayScore: 14 };
    renderFinished({
      league,
      gameEvents: [otherEvent],
      lastResults: [{ homeId: 12, awayId: 13, homeName: 'Packers', awayName: 'Vikings', homeScore: 21, awayScore: 14 }],
      simulatedWeek: 9,
    });

    expect(document.body.textContent).not.toMatch(/No games to display/);
    // The completed game is surfaced instead of an empty panel.
    expect(document.body.textContent).toMatch(/GB|MIN/);
  });

  it('shows a compact partial-results warning when resolved games are fewer than total', () => {
    const league = leagueWith([
      { home: 12, away: 13 },
      { home: USER_ID, away: OPP_ID },
    ]);
    const otherEvent = { gameId: 's9_w9_12_13', homeId: 12, awayId: 13, homeAbbr: 'GB', awayAbbr: 'MIN', homeScore: 21, awayScore: 14 };
    renderFinished({
      league,
      gameEvents: [otherEvent], // 1 resolved of 2 scheduled
      lastResults: [{ homeId: 12, awayId: 13, homeName: 'Packers', awayName: 'Vikings', homeScore: 21, awayScore: 14 }],
      simulatedWeek: 9,
    });

    const warning = screen.getByTestId('live-partial-results');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toMatch(/still finishing/i);
  });
});

describe('LiveGame — final state presentation', () => {
  afterEach(() => cleanup());

  it('renders a FINAL badge, the final score, winner emphasis and a box-score action', () => {
    const onOpenBoxScore = vi.fn();
    const league = leagueWith([{ home: USER_ID, away: OPP_ID }]);
    const userEvent = { gameId: 'game-abc', homeId: USER_ID, awayId: OPP_ID, homeAbbr: 'CHI', awayAbbr: 'DET', homeScore: 30, awayScore: 13 };
    renderFinished({
      league,
      gameEvents: [userEvent],
      lastResults: [{ homeId: USER_ID, awayId: OPP_ID, homeName: 'Bears', awayName: 'Lions', homeScore: 30, awayScore: 13 }],
      simulatedWeek: 9,
      onOpenBoxScore,
    });

    const card = screen.getByTestId('live-final-card');
    expect(card.textContent).toMatch(/FINAL/);
    expect(card.textContent).toMatch(/30/);
    expect(card.textContent).toMatch(/13/);
    // Winner emphasis: the home team won and is marked as winner.
    expect(card.querySelector('.is-winner')).toBeTruthy();

    const cta = within(card).getByTestId('live-final-boxscore');
    fireEvent.click(cta);
    expect(onOpenBoxScore).toHaveBeenCalledWith('game-abc');
  });
});

describe('LiveGame — play feed highlighting', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('highlights scoring plays distinctly while simulating', () => {
    vi.useFakeTimers();
    const league = leagueWith([{ home: USER_ID, away: OPP_ID }]);
    render(<LiveGame simulating simProgress={20} league={league} gameEvents={[]} lastResults={[]} simulatedWeek={9} />);

    // Drive the synthetic play ticker enough to produce a scoring play.
    act(() => { vi.advanceTimersByTime(700 * 12); });

    const plays = screen.getAllByTestId('live-play');
    expect(plays.length).toBeGreaterThan(0);
    const scoring = plays.filter((el) => el.getAttribute('data-play-kind') === 'scoring');
    expect(scoring.length).toBeGreaterThan(0);
  });
});

describe('LiveGame — resilience', () => {
  afterEach(() => cleanup());

  it('handles a missing/empty play log and no game data without crashing', () => {
    const league = { week: 9, seasonId: 's9', userTeamId: USER_ID, teams: baseTeams, schedule: { weeks: [] } };
    expect(() =>
      renderFinished({ league, gameEvents: [], lastResults: [], simulatedWeek: 9 }),
    ).not.toThrow();
    // Empty state is shown rather than a crash or a contradictory message.
    expect(screen.queryByTestId('live-scoreboard-empty')).toBeTruthy();
  });
});
