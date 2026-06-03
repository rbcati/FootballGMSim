import { describe, it, expect } from 'vitest';
import { advanceDownDistance, buildDriveBasedSummary } from '../../simulation/driveEngine.js';

describe('driveEngine.advanceDownDistance', () => {
  it('resets to first down when the gain converts the distance', () => {
    const next = advanceDownDistance({ down: 2, distance: 7, yardLine: 40 }, 8);
    expect(next.firstDown).toBe(true);
    expect(next.down).toBe(1);
    expect(next.distance).toBe(10);
    expect(next.yardLine).toBe(48);
    expect(next.turnoverOnDowns).toBe(false);
  });

  it('flags a turnover on downs when 4th down fails to convert', () => {
    const next = advanceDownDistance({ down: 4, distance: 5, yardLine: 50 }, 2);
    expect(next.firstDown).toBe(false);
    expect(next.turnoverOnDowns).toBe(true);
    expect(next.down).toBe(5);
    expect(next.distance).toBe(3);
  });

  it('flags a touchdown when the gain reaches the end zone', () => {
    const next = advanceDownDistance({ down: 1, distance: 10, yardLine: 95 }, 9);
    expect(next.touchdown).toBe(true);
    expect(next.yardLine).toBe(99); // field position clamped to [1,99]
  });
});

describe('driveEngine.buildDriveBasedSummary', () => {
  it('is deterministic for the same season/week/teams/seed', () => {
    const args = {
      season: 2025, week: 3,
      home: { id: 1 }, away: { id: 2 },
      homeOff: 80, awayOff: 78, homeDef: 76, awayDef: 75,
      globalSeed: 42,
    };
    const a = buildDriveBasedSummary(args);
    const b = buildDriveBasedSummary(args);
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.seed).toBe(b.seed);
  });
});
