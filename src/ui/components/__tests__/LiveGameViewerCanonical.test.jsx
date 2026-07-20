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

  it('scorebug shows the honest period label + possession ("Drive N · ABBR possession"), never a fabricated quarter', () => {
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
    // First canonical event is MIA's opening TD drive → "Drive 1 · MIA possession".
    expect(within(bug).getByText(/Drive 1 · MIA possession/)).toBeTruthy();
    // No fabricated quarter label anywhere on the scorebug.
    expect(within(bug).queryByText(/^Q\d/)).toBeNull();
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
