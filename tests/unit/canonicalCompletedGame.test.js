import { describe, it, expect } from 'vitest';
import { resolveCanonicalCompletedGame, isValidGameId } from '../../src/ui/utils/canonicalCompletedGame.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ARCHIVED_FINAL = {
  id: 'game_w1_1_2',
  gameId: 'game_w1_1_2',
  homeId: 1,
  awayId: 2,
  homeAbbr: 'CLE',
  awayAbbr: 'PIT',
  homeScore: 10,
  awayScore: 27,
  week: 1,
};

const SCHEDULE_STALE_ZERO = {
  id: 'game_w1_1_2',
  gameId: 'game_w1_1_2',
  homeId: 1,
  awayId: 2,
  homeAbbr: 'CLE',
  awayAbbr: 'PIT',
  homeScore: 0,
  awayScore: 0,
  week: 1,
};

const SCHEDULE_VALID = {
  id: 'game_w1_1_2',
  gameId: 'game_w1_1_2',
  homeId: 1,
  awayId: 2,
  homeAbbr: 'CLE',
  awayAbbr: 'PIT',
  homeScore: 14,
  awayScore: 21,
  week: 1,
};

// ── resolveCanonicalCompletedGame ─────────────────────────────────────────────

describe('resolveCanonicalCompletedGame — archive wins', () => {
  it('returns archived score when schedule shows 0-0', () => {
    const result = resolveCanonicalCompletedGame({
      scheduleGame: SCHEDULE_STALE_ZERO,
      archivedGame: ARCHIVED_FINAL,
    });
    expect(result.homeScore).toBe(10);
    expect(result.awayScore).toBe(27);
  });

  it('never returns 0-0 when archived final score exists', () => {
    const result = resolveCanonicalCompletedGame({
      scheduleGame: SCHEDULE_STALE_ZERO,
      archivedGame: ARCHIVED_FINAL,
    });
    expect(result.homeScore).not.toBe(0);
    expect(result.awayScore).not.toBe(0);
  });

  it('archived score wins even if schedule has a different valid score', () => {
    const result = resolveCanonicalCompletedGame({
      scheduleGame: SCHEDULE_VALID,
      archivedGame: ARCHIVED_FINAL,
    });
    expect(result.homeScore).toBe(ARCHIVED_FINAL.homeScore);
    expect(result.awayScore).toBe(ARCHIVED_FINAL.awayScore);
  });

  it('preserves archived team abbrevs when schedule also has them', () => {
    const result = resolveCanonicalCompletedGame({
      scheduleGame: { ...SCHEDULE_VALID, homeAbbr: 'OLD', awayAbbr: 'OLD' },
      archivedGame: ARCHIVED_FINAL,
    });
    expect(result.homeAbbr).toBe('CLE');
    expect(result.awayAbbr).toBe('PIT');
  });

  it('fills abbrevs from schedule when archive is missing them', () => {
    const archiveNoAbbr = { ...ARCHIVED_FINAL, homeAbbr: undefined, awayAbbr: undefined };
    const result = resolveCanonicalCompletedGame({
      scheduleGame: SCHEDULE_STALE_ZERO,
      archivedGame: archiveNoAbbr,
    });
    expect(result.homeAbbr).toBe('CLE');
    expect(result.awayAbbr).toBe('PIT');
  });

  it('returns archived game directly when no schedule is provided', () => {
    const result = resolveCanonicalCompletedGame({ archivedGame: ARCHIVED_FINAL });
    expect(result.homeScore).toBe(10);
    expect(result.awayScore).toBe(27);
  });
});

describe('resolveCanonicalCompletedGame — schedule fallback', () => {
  it('returns schedule game when no archive is provided and schedule has valid score', () => {
    const result = resolveCanonicalCompletedGame({ scheduleGame: SCHEDULE_VALID });
    expect(result.homeScore).toBe(14);
    expect(result.awayScore).toBe(21);
  });

  it('returns null when all inputs are missing', () => {
    const result = resolveCanonicalCompletedGame({});
    expect(result).toBeNull();
  });

  it('returns null when only undefined args', () => {
    const result = resolveCanonicalCompletedGame();
    expect(result).toBeNull();
  });

  it('returns archive (even without score) before schedule 0-0 when archive exists', () => {
    // Archived game exists but has no valid score — falls through to schedule
    const archiveNoScore = { id: 'game_w1_1_2', homeId: 1, awayId: 2 };
    const result = resolveCanonicalCompletedGame({
      scheduleGame: SCHEDULE_VALID,
      archivedGame: archiveNoScore,
    });
    // Schedule has valid score so it should be used
    expect(result.homeScore).toBe(14);
    expect(result.awayScore).toBe(21);
  });
});

describe('resolveCanonicalCompletedGame — league.gameById fallback', () => {
  it('uses league.gameById as last resort when no archive or schedule', () => {
    const league = {
      gameById: { 'game_w1_1_2': { ...SCHEDULE_VALID } },
    };
    const result = resolveCanonicalCompletedGame({ league, gameId: 'game_w1_1_2' });
    expect(result.homeScore).toBe(14);
    expect(result.awayScore).toBe(21);
  });

  it('archived score still wins over league.gameById', () => {
    const league = {
      gameById: { 'game_w1_1_2': SCHEDULE_STALE_ZERO },
    };
    const result = resolveCanonicalCompletedGame({
      league,
      gameId: 'game_w1_1_2',
      archivedGame: ARCHIVED_FINAL,
    });
    expect(result.homeScore).toBe(10);
    expect(result.awayScore).toBe(27);
  });
});

describe('resolveCanonicalCompletedGame — score field aliases', () => {
  it('reads homeScore from scoreHome alias', () => {
    const archive = { ...ARCHIVED_FINAL, homeScore: undefined, scoreHome: 10 };
    const result = resolveCanonicalCompletedGame({ archivedGame: archive });
    expect(result.homeScore).toBe(10);
  });

  it('reads awayScore from score.away nested field', () => {
    const archive = { ...ARCHIVED_FINAL, awayScore: undefined, score: { away: 27, home: 10 } };
    const result = resolveCanonicalCompletedGame({ archivedGame: archive });
    expect(result.awayScore).toBe(27);
  });
});

// ── isValidGameId ─────────────────────────────────────────────────────────────

describe('isValidGameId', () => {
  it('returns true for a real game ID', () => {
    expect(isValidGameId('game_s1_w1_1_2')).toBe(true);
    expect(isValidGameId(42)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidGameId(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidGameId(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidGameId('')).toBe(false);
    expect(isValidGameId('  ')).toBe(false);
  });

  it('returns false for the string "undefined"', () => {
    expect(isValidGameId('undefined')).toBe(false);
  });

  it('returns false for the string "null"', () => {
    expect(isValidGameId('null')).toBe(false);
  });
});
