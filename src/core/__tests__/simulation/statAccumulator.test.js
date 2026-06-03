import { describe, it, expect } from 'vitest';
import { accumulateStats, initializePlayerStats } from '../../simulation/statAccumulator.js';

describe('statAccumulator.accumulateStats', () => {
  it('accumulates passing stats and ignores derived fields', () => {
    const season = {};
    accumulateStats({ passYd: 280, passTD: 2, passComp: 22, completionPct: 68.8, passerRating: 110.4 }, season);
    accumulateStats({ passYd: 305, passTD: 3, passComp: 25, completionPct: 71.4, passerRating: 121.0 }, season);
    expect(season.passYd).toBe(585);
    expect(season.passTD).toBe(5);
    expect(season.passComp).toBe(47);
    // Derived/calculated fields must NOT be summed.
    expect(season.completionPct).toBeUndefined();
    expect(season.passerRating).toBeUndefined();
  });

  it('accumulates rushing stats across multiple games', () => {
    const season = {};
    accumulateStats({ rushAtt: 18, rushYd: 92, rushTD: 1, yardsPerCarry: 5.1 }, season);
    accumulateStats({ rushAtt: 22, rushYd: 110, rushTD: 0, yardsPerCarry: 5.0 }, season);
    expect(season.rushAtt).toBe(40);
    expect(season.rushYd).toBe(202);
    expect(season.rushTD).toBe(1);
    // yardsPerCarry is derived → not accumulated.
    expect(season.yardsPerCarry).toBeUndefined();
  });
});

describe('statAccumulator.initializePlayerStats', () => {
  it('creates game/season/career buckets when absent', () => {
    const player = {};
    initializePlayerStats(player);
    expect(player.stats.game).toBeTypeOf('object');
    expect(player.stats.season).toBeTypeOf('object');
    expect(player.stats.career).toBeTypeOf('object');
  });
});
