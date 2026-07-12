import { describe, expect, it } from 'vitest';
import { buildLiveGameEvent, mapArchiveEventsToLiveFeed, getNextImportantEvent } from './liveGameEvents.js';

// The narration engine's per-play score snapshots belong to a different
// scoring engine than the league-recorded final (see the authority note in
// liveGameEvents.js), so the live feed must never surface them.

const context = { gameId: 'g1', homeTeamId: 1, awayTeamId: 2 };

describe('buildLiveGameEvent — score/clock trust', () => {
  it('omits the untrusted per-play score even when the log carries one', () => {
    const event = buildLiveGameEvent(
      { text: 'TOUCHDOWN! big play', homeScore: 7, awayScore: 0, quarter: 1, clock: '15:10' },
      0,
      context,
    );
    expect(event.eventType).toBe('touchdown');
    expect(event.score).toBeNull();
  });

  it('keeps a real event-sequence indicator instead of fabricating a per-play clock', () => {
    const event = buildLiveGameEvent({ text: 'run for 4 yds', quarter: 2 }, 4, context);
    expect(event.sequence).toBe(5);
    expect(event.quarter).toBe(2);
  });

  it('carries no default clock when the log has none', () => {
    const event = buildLiveGameEvent({ text: 'pass complete' }, 0, context);
    expect(event.clock).toBeNull();
  });
});

describe('mapArchiveEventsToLiveFeed — canonical final stamping', () => {
  const logs = [
    { text: 'run for 3 yds', quarter: 1, homeScore: 0, awayScore: 0 },
    { text: 'TOUCHDOWN! deep ball', quarter: 1, homeScore: 0, awayScore: 0 },
    { text: 'kneel down', quarter: 4, homeScore: 6, awayScore: 0 },
  ];

  it('stamps the canonical final only on the game_end marker when supplied', () => {
    const events = mapArchiveEventsToLiveFeed(logs, { ...context, finalScore: { home: 27, away: 24 } });
    const finalEvent = events[events.length - 1];
    expect(finalEvent.eventType).toBe('game_end');
    expect(finalEvent.score).toEqual({ home: 27, away: 24 });
    // Every non-final event stays score-free.
    events.slice(0, -1).forEach((e) => expect(e.score).toBeNull());
  });

  it('leaves the final marker score-free rather than guessing when no canonical final exists', () => {
    const events = mapArchiveEventsToLiveFeed(logs, context);
    const finalEvent = events[events.length - 1];
    expect(finalEvent.eventType).toBe('game_end');
    expect(finalEvent.score).toBeNull();
  });

  it('rejects a partial/non-numeric final instead of coercing to 0', () => {
    const events = mapArchiveEventsToLiveFeed(logs, { ...context, finalScore: { home: 21, away: undefined } });
    expect(events[events.length - 1].score).toBeNull();
  });
});

describe('getNextImportantEvent — jump filters still work on raw data', () => {
  it('finds the next scoring event', () => {
    const events = mapArchiveEventsToLiveFeed([
      { text: 'short gain', quarter: 1 },
      { text: 'TOUCHDOWN! strike', quarter: 1 },
      { text: 'punt', quarter: 2 },
    ], context);
    const idx = getNextImportantEvent(events, 0, 'score');
    expect(events[idx].eventType).toBe('touchdown');
  });
});
