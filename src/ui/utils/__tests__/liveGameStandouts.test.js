import { describe, it, expect } from 'vitest';
import { deriveStandoutsFromBoxScore } from '../liveGameStandouts.js';

describe('deriveStandoutsFromBoxScore — sack semantics (#1700 review defect #3)', () => {
  // Review fixture: QB with 5 sacks TAKEN, EDGE with 1 sack MADE.
  const playerStats = {
    home: { qb: { name: 'Sacked QB', pos: 'QB', stats: { passAtt: 32, passComp: 20, passYd: 240, sacks: 5 } } },
    away: { edge: { name: 'Edge Rusher', pos: 'EDGE', stats: { passAtt: 0, sacks: 1, tackles: 3 } } },
  };

  it('shows the EDGE (defensive sacks) under Sacks, never the QB (sacks taken)', () => {
    const standouts = deriveStandoutsFromBoxScore(playerStats);
    expect(standouts.sacks).toBeTruthy();
    expect(standouts.sacks.player).toMatch(/Rusher/);
    expect(standouts.sacks.sacks).toBe(1);
  });

  it('does not surface a QB as the Sacks standout even when it has the highest raw sacks field', () => {
    const qbOnly = {
      home: { qb: { name: 'Only QB', pos: 'QB', stats: { passAtt: 30, sacks: 7 } } },
      away: {},
    };
    const standouts = deriveStandoutsFromBoxScore(qbOnly);
    // No genuine defensive sack production → no Sacks standout.
    expect(standouts.sacks).toBeNull();
  });

  it('still surfaces genuine defender sacks', () => {
    const standouts = deriveStandoutsFromBoxScore({
      home: { dl: { name: 'Real Sacker', pos: 'DL', stats: { passAtt: 0, sacks: 2 } } },
      away: {},
    });
    expect(standouts.sacks?.player).toMatch(/Sacker/);
    expect(standouts.sacks?.sacks).toBe(2);
  });
});
