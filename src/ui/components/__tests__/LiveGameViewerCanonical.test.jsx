/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import LiveGameViewer from '../LiveGameViewer.jsx';
import { buildCanonicalGameEvents } from '../../../core/simulation/canonicalGameEvents.js';
import { mapCanonicalEventsToLiveFeed } from '../../../core/liveGame/liveGameEvents.js';

const homeTeam = { id: 1, abbr: 'MIA', name: 'Miami' };
const awayTeam = { id: 0, abbr: 'BUF', name: 'Buffalo' };

// Canonical ledger: MIA scores a TD (drive 1), then BUF a FG (drive 2).
const { events: canonicalEvents } = buildCanonicalGameEvents({
  gameId: 'g', homeId: 1, awayId: 0, homeAbbr: 'MIA', awayAbbr: 'BUF',
  homeDriveLog: [{ result: 'TOUCHDOWN', points: 7, plays: 9, yards: 75 }],
  awayDriveLog: [{ result: 'FIELD_GOAL', points: 3, plays: 6, yards: 42 }],
  seed: 0, // home possesses first
});
const canonicalFinal = { home: 7, away: 3 };

afterEach(() => cleanup());

describe('LiveGameViewer — canonical event ledger', () => {
  it('scorebug shows the canonical running scoreAfter during playback (not dashes)', () => {
    // Pause on the first event (MIA TD) — the scorebug must read scoreAfter 7-0.
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="pause"
        finalScore={canonicalFinal}
      />,
    );
    const bug = screen.getByTestId('watch-scorebug');
    // The first canonical event is the MIA touchdown → running score 7 (home), 0 (away).
    expect(within(bug).getByText('7')).toBeTruthy();
    expect(within(bug).getByText('0')).toBeTruthy();
    // No pending-dash placeholders in canonical mode.
    expect(within(bug).queryByLabelText(/score shown at the final whistle/i)).toBeNull();
  });

  it('scorebug shows honest drive progress + possession, never a fabricated quarter', () => {
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="pause"
        finalScore={canonicalFinal}
      />,
    );
    const bug = screen.getByTestId('watch-scorebug');
    // First canonical event is MIA's opening TD drive. Two regulation drives in
    // the fixture, and the game_end marker is NOT counted (defect #4) → "of 2".
    expect(within(bug).getByText(/Drive 1 of 2 · MIA possession/)).toBeTruthy();
    // No fabricated quarter label anywhere on the scorebug.
    expect(within(bug).queryByText(/^Q\d/)).toBeNull();
  });

  it('drive progress excludes the terminal game_end marker and shows Final at the end (defect #4)', () => {
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="instant"
        finalScore={canonicalFinal}
      />,
    );
    const bug = screen.getByTestId('watch-scorebug');
    // At the terminal marker the scorebug reads "Final", never "Drive 3 of 2".
    expect(within(bug).getByText(/Final/)).toBeTruthy();
    expect(within(bug).queryByText(/of 3/)).toBeNull();
  });

  it('labels the intermediate progression honestly with a "Reconstructed order" chip during playback (post-review point 2)', () => {
    // Mid-game (paused): the reconstruction is disclosed.
    const { unmount } = render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="pause"
        finalScore={canonicalFinal}
      />,
    );
    expect(screen.getByTestId('reconstructed-order-chip').textContent).toMatch(/Reconstructed order/i);
    unmount();

    // At the final whistle the chip disappears (the final IS official).
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="instant"
        finalScore={canonicalFinal}
      />,
    );
    expect(screen.queryByTestId('reconstructed-order-chip')).toBeNull();
  });

  it('hides final box-score Standouts until the final whistle (post-review point 3)', () => {
    const playerStats = {
      home: { qb: { name: 'Home QB', pos: 'QB', stats: { passAtt: 30, passComp: 20, passYd: 260, passTD: 2 } } },
      away: {},
    };
    // Paused mid-game: standouts are locked, the QB's final line is NOT shown.
    const { unmount } = render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        playerStats={playerStats}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="pause"
        finalScore={canonicalFinal}
      />,
    );
    expect(screen.getByTestId('standouts-locked').textContent).toMatch(/unlock at the final whistle/i);
    expect(screen.queryByText(/260y/)).toBeNull();
    unmount();

    // At the final whistle the standouts appear.
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        playerStats={playerStats}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="instant"
        finalScore={canonicalFinal}
      />,
    );
    expect(screen.queryByTestId('standouts-locked')).toBeNull();
    expect(screen.getByText(/260y/)).toBeTruthy();
  });

  it('canonical playback renders NO Run Heavy / Pass Heavy / Timeout controls (defect #2)', () => {
    const overrideSpy = () => { throw new Error('onPlaycallOverride must never be called in canonical playback'); };
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="pause"
        finalScore={canonicalFinal}
        onPlaycallOverride={overrideSpy}
      />,
    );
    expect(screen.queryByRole('button', { name: /Run Heavy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pass Heavy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Timeout/i })).toBeNull();
    // Preserved controls remain reachable.
    expect(screen.getByRole('button', { name: /Slow/i })).toBeTruthy();
    // Honest copy replaces the fake strategic agency.
    expect(screen.getByTestId('strategy-locked-note').textContent).toMatch(/locked when simulation began/i);
  });

  it('shows the canonical final once complete, matching the league-recorded score', () => {
    render(
      <LiveGameViewer
        canonicalEvents={canonicalEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        initialMode="instant"
        finalScore={canonicalFinal}
      />,
    );
    const finalCard = document.querySelector('.watch-final-card');
    expect(finalCard).toBeTruthy();
    expect(finalCard.textContent).toContain('MIA 7');
    expect(finalCard.textContent).toContain('BUF 3');
  });

  it('mapCanonicalEventsToLiveFeed carries scoreAfter on every event and stamps score chips only on scoring events', () => {
    const feed = mapCanonicalEventsToLiveFeed(canonicalEvents, { gameId: 'g' });
    // Every feed event carries a trustworthy running score.
    feed.forEach((e) => {
      expect(e.scoreAfter).toBeTruthy();
      expect(Number.isFinite(e.scoreAfter.home)).toBe(true);
    });
    // Score chip present on scoring events + final, absent on the (empty) rest.
    const chipped = feed.filter((e) => e.score);
    expect(chipped.length).toBeGreaterThanOrEqual(2); // two scores + game_end
    // Monotonic running score.
    let prevHome = 0;
    feed.forEach((e) => {
      expect(e.scoreAfter.home).toBeGreaterThanOrEqual(prevHome);
      prevHome = e.scoreAfter.home;
    });
    expect(feed[feed.length - 1].scoreAfter).toEqual(canonicalFinal);
  });
});
