import { describe, it, expect } from 'vitest';
import { passerRating } from '../../simulation/mathHelpers.js';

describe('passerRating', () => {
  it('returns null when att is 0', () => {
    expect(passerRating({ comp: 0, att: 0, yds: 0, td: 0, ints: 0 })).toBeNull();
  });

  it('returns null when att is negative', () => {
    expect(passerRating({ comp: 0, att: -1, yds: 0, td: 0, ints: 0 })).toBeNull();
  });

  it('returns null when called with defaults (att defaults to 0)', () => {
    expect(passerRating()).toBeNull();
  });

  it('computes a correct rating for a typical QB stat line', () => {
    // 22/32, 280 yds, 2 TD, 1 INT — expected ~94.1
    const rating = passerRating({ comp: 22, att: 32, yds: 280, td: 2, ints: 1 });
    expect(typeof rating).toBe('number');
    expect(rating).toBeGreaterThan(80);
    expect(rating).toBeLessThan(110);
  });

  it('clamps to a perfect 158.3 for elite stats', () => {
    // Perfect-ish line: 30/30, 500 yds, 6 TD, 0 INT — all components max out at 2.375
    const rating = passerRating({ comp: 30, att: 30, yds: 500, td: 6, ints: 0 });
    expect(rating).toBe(158.3);
  });

  it('clamps to 0.0 (floor) for worst-case stats', () => {
    // 0 completions, minimal yards, 0 TD, many INTs — all components clamp to 0
    const rating = passerRating({ comp: 0, att: 10, yds: 0, td: 0, ints: 10 });
    expect(typeof rating).toBe('number');
    expect(rating).toBeGreaterThanOrEqual(0);
  });
});
