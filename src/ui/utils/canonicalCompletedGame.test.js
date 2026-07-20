import { describe, it, expect } from 'vitest';
import { resolveCanonicalCompletedGame } from './canonicalCompletedGame.js';

const gid = 's2026_w1_1_2';

describe('resolveCanonicalCompletedGame — archive sources', () => {
  it('resolves from the async worker archive when it carries a valid final', () => {
    const out = resolveCanonicalCompletedGame({
      gameId: gid,
      archivedGame: { gameId: gid, homeId: 1, awayId: 2, score: { home: 24, away: 17 }, homeAbbr: 'HME', awayAbbr: 'AWY' },
    });
    expect(out.homeScore).toBe(24);
    expect(out.awayScore).toBe(17);
    expect(out.played).toBe(true);
  });

  it('falls back to the SYNCHRONOUS localStorage archive when the async fetch has no final yet (#1700 watch→Game Book race fix)', () => {
    // Simulate the race: the async worker response has not resolved a final, but
    // PostGameScreen already wrote the postgame archive synchronously.
    const out = resolveCanonicalCompletedGame({
      gameId: gid,
      archivedGame: null,
      localArchivedGame: { gameId: gid, homeId: 1, awayId: 2, score: { home: 31, away: 20 }, homeAbbr: 'HME', awayAbbr: 'AWY' },
    });
    expect(out.homeScore).toBe(31);
    expect(out.awayScore).toBe(20);
    expect(out.played).toBe(true);
  });

  it('prefers whichever archive source actually carries a valid final', () => {
    const out = resolveCanonicalCompletedGame({
      gameId: gid,
      // Worker response present but WITHOUT a usable final; local archive has it.
      archivedGame: { gameId: gid, homeId: 1, awayId: 2 },
      localArchivedGame: { gameId: gid, homeId: 1, awayId: 2, score: { home: 10, away: 7 } },
    });
    expect(out.homeScore).toBe(10);
    expect(out.awayScore).toBe(7);
  });

  it('returns null when no source has any reference', () => {
    expect(resolveCanonicalCompletedGame({ gameId: gid })).toBeNull();
  });
});
