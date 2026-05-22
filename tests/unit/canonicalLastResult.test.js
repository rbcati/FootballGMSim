import { describe, it, expect } from 'vitest';
import { getLatestUserCompletedGame, getLastGameDisplay } from '../../src/ui/utils/hqGameDisplay.js';

const makeLeague = (overrides = {}) => ({
  userTeamId: 1,
  teams: [
    { id: 1, abbr: 'ARI', name: 'Arizona' },
    { id: 2, abbr: 'LAR', name: 'LA Rams' },
  ],
  schedule: { weeks: [] },
  ...overrides,
});

describe('getLatestUserCompletedGame', () => {
  it('returns null when there are no schedule weeks', () => {
    expect(getLatestUserCompletedGame(makeLeague())).toBeNull();
  });

  it('returns null when no games have been played', () => {
    const league = makeLeague({
      schedule: {
        weeks: [{ week: 1, games: [{ home: 1, away: 2, played: false }] }],
      },
    });
    expect(getLatestUserCompletedGame(league)).toBeNull();
  });

  it('returns null when completed games do not involve the user team', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 3, away: 4, played: true, homeScore: 21, awayScore: 14 }] },
        ],
      },
    });
    expect(getLatestUserCompletedGame(league)).toBeNull();
  });

  it('returns the completed game for a home win', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 1, away: 2, played: true, homeScore: 24, awayScore: 17 }] },
        ],
      },
    });
    const result = getLatestUserCompletedGame(league);
    expect(result).not.toBeNull();
    expect(result.homeId).toBe(1);
    expect(result.awayId).toBe(2);
  });

  it('returns the completed game for an away result', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 2, away: 1, played: true, homeScore: 31, awayScore: 19 }] },
        ],
      },
    });
    const result = getLatestUserCompletedGame(league);
    expect(result).not.toBeNull();
    expect(result.homeId).toBe(2);
    expect(result.awayId).toBe(1);
  });

  it('returns the most recent week when multiple weeks have played games', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 1, away: 2, played: true, homeScore: 14, awayScore: 28 }] },
          { week: 2, games: [{ home: 2, away: 1, played: true, homeScore: 10, awayScore: 24 }] },
        ],
      },
    });
    const result = getLatestUserCompletedGame(league);
    expect(result).not.toBeNull();
    expect(result.week).toBe(2);
  });
});

describe('getLastGameDisplay — home win', () => {
  it('shows W result and correct scores', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 1, away: 2, played: true, homeScore: 24, awayScore: 17 }] },
        ],
      },
    });
    const game = getLatestUserCompletedGame(league);
    const display = getLastGameDisplay(game, 1);
    expect(display.heroLine).toMatch(/^W/);
    expect(display.heroLine).toContain('24');
    expect(display.heroLine).toContain('17');
    expect(display.oppAbbr).toBe('LAR');
    expect(display.oppAbbr).not.toBe('TBD');
  });
});

describe('getLastGameDisplay — away loss', () => {
  it('shows L result, user score, and real opponent abbreviation', () => {
    const league = makeLeague({
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 2, away: 1, played: true, homeScore: 31, awayScore: 19 }] },
        ],
      },
    });
    const game = getLatestUserCompletedGame(league);
    const display = getLastGameDisplay(game, 1);
    expect(display.heroLine).toMatch(/^L/);
    expect(display.heroLine).toContain('19');
    expect(display.heroLine).toContain('31');
    expect(display.oppAbbr).toBe('LAR');
    expect(display.oppAbbr).not.toBe('TBD');
  });
});

describe('getLastGameDisplay — missing opponent metadata', () => {
  it('does not throw and does not display TBD for opponent when schedule has opponent id', () => {
    const league = {
      userTeamId: 1,
      teams: [{ id: 1, abbr: 'ARI' }], // team 2 intentionally missing
      schedule: {
        weeks: [
          { week: 1, games: [{ home: 2, away: 1, played: true, homeScore: 28, awayScore: 14 }] },
        ],
      },
    };
    const game = getLatestUserCompletedGame(league);
    expect(game).not.toBeNull();
    // Should not throw even with missing team data
    const display = getLastGameDisplay(game, 1);
    expect(display).not.toBeNull();
    expect(display.heroLine).toMatch(/^L/); // user lost 14-28
  });
});

describe('getLastGameDisplay — no completed game', () => {
  it('returns a safe no-final message when null is passed', () => {
    const display = getLastGameDisplay(null, 1);
    expect(display.heroLine).toMatch(/no final/i);
    expect(display.oppAbbr).toBeDefined();
  });
});
