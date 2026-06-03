import { describe, it, expect } from 'vitest';
import {
  computeQuarter,
  drivesPerQuarter,
  getQuarterClockMinutes,
  isHalfExpired,
  isOvertimeGameOver,
  decideLateGameSequence,
} from '../../simulation/clockManager.js';

describe('clockManager clock/half logic', () => {
  it('runs the quarter clock to zero at end-of-half', () => {
    const totalDrives = 24;
    const perQtr = drivesPerQuarter(totalDrives); // 6
    // Start of a quarter has a full 15 minutes; the last drive of the quarter expires it.
    expect(getQuarterClockMinutes(0, perQtr)).toBe(15);
    expect(getQuarterClockMinutes(perQtr - 1, perQtr)).toBeLessThan(15);
    expect(getQuarterClockMinutes(perQtr, perQtr)).toBe(0);

    // Final drive of Q2 (the half) registers as half-expired.
    const lastDriveOfHalf = perQtr * 2 - 1;
    expect(computeQuarter(lastDriveOfHalf, totalDrives)).toBe(2);
    expect(isHalfExpired(lastDriveOfHalf, totalDrives)).toBe(true);
    expect(isHalfExpired(0, totalDrives)).toBe(false);
  });

  it('go-for-2 triggers inside 2 minutes when down 2, not at 600s', () => {
    const base = { quarter: 4, scoreDiff: -2, down: 1, distance: 10, yardLine: 50, timeouts: 3 };
    // 600s (10 min left) — should NOT go for 2; the old threshold was wrong
    expect(decideLateGameSequence({ ...base, clockSeconds: 600 }).goForTwo).toBe(false);
    // 90s (inside 2 min) — should go for 2
    expect(decideLateGameSequence({ ...base, clockSeconds: 90 }).goForTwo).toBe(true);
    // Exactly at the threshold boundary (120s) — should go for 2
    expect(decideLateGameSequence({ ...base, clockSeconds: 119 }).goForTwo).toBe(true);
    // Just above the threshold — should NOT go for 2
    expect(decideLateGameSequence({ ...base, clockSeconds: 120 }).goForTwo).toBe(false);
  });

  it('decides end-of-game from overtime possession pairs', () => {
    // NFL: after a complete pair, unequal scores end the game.
    expect(isOvertimeGameOver({ overtimeFormat: 'nfl', possessions: 2, homeScore: 6, awayScore: 3 })).toBe(true);
    // Tied after the first pair → keep playing (sudden death).
    expect(isOvertimeGameOver({ overtimeFormat: 'nfl', possessions: 2, homeScore: 3, awayScore: 3 })).toBe(false);
    // Mid-pair (odd possession count) is never a terminal state.
    expect(isOvertimeGameOver({ overtimeFormat: 'nfl', possessions: 1, homeScore: 6, awayScore: 0 })).toBe(false);
    // Ties allowed and enough pairs played → game ends in a tie.
    expect(isOvertimeGameOver({ overtimeFormat: 'nfl', possessions: 4, homeScore: 10, awayScore: 10, allowTies: true })).toBe(true);
  });
});
