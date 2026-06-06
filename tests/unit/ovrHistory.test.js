import { describe, it, expect, beforeEach } from 'vitest';
import { Utils } from '../../src/core/utils.js';
import { makePlayer } from '../../src/core/player.js';
import { processPlayerProgression } from '../../src/core/progression-logic.js';

// Wave 4 Fix 3: player.ovrHistory must be written at each season rollover,
// capped at a rolling 20-entry window.

describe('player.ovrHistory write at rollover', () => {
  beforeEach(() => Utils.setSeed(123));

  function freshPlayer() {
    const p = makePlayer('QB', 24, 75);
    p.teamId = 0;
    p.status = 'active';
    return p;
  }

  it('appends an {season, ovr, age} entry on progression', () => {
    const p = freshPlayer();
    expect(p.ovrHistory).toEqual([]);
    processPlayerProgression([p], { season: 2026 });
    expect(p.ovrHistory).toHaveLength(1);
    expect(p.ovrHistory[0]).toMatchObject({ season: 2026, age: 24 });
    expect(typeof p.ovrHistory[0].ovr).toBe('number');
    expect(p.ovrHistory[0].ovr).toBe(p.ovr);
  });

  it('is idempotent for the same season', () => {
    const p = freshPlayer();
    processPlayerProgression([p], { season: 2026 });
    processPlayerProgression([p], { season: 2026 });
    expect(p.ovrHistory).toHaveLength(1);
  });

  it('accumulates one entry per distinct season', () => {
    const p = freshPlayer();
    for (let yr = 2026; yr <= 2030; yr++) processPlayerProgression([p], { season: yr });
    expect(p.ovrHistory.map((h) => h.season)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it('caps the rolling window at 20 entries', () => {
    const p = freshPlayer();
    for (let yr = 2000; yr < 2030; yr++) processPlayerProgression([p], { season: yr });
    expect(p.ovrHistory).toHaveLength(20);
    expect(p.ovrHistory[0].season).toBe(2010); // oldest 10 dropped
    expect(p.ovrHistory[19].season).toBe(2029);
  });
});
