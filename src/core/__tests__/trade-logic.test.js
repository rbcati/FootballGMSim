import { describe, expect, it } from 'vitest';
import { calculatePlayerValue } from '../trade-logic.js';

describe('calculatePlayerValue', () => {
  it('values younger high-potential players above older equivalents', () => {
    const young = {
      pos: 'WR',
      ovr: 85,
      potential: 92,
      age: 23,
      contract: { baseAnnual: 8 },
    };
    const old = {
      pos: 'WR',
      ovr: 85,
      potential: 92,
      age: 32,
      contract: { baseAnnual: 8 },
    };

    expect(calculatePlayerValue(young)).toBeGreaterThan(calculatePlayerValue(old));
  });

  it('penalizes expensive contracts', () => {
    const cheapDeal = {
      pos: 'QB',
      ovr: 84,
      potential: 84,
      age: 28,
      contract: { baseAnnual: 8 },
    };
    const expensiveDeal = {
      pos: 'QB',
      ovr: 84,
      potential: 84,
      age: 28,
      contract: { baseAnnual: 45 },
    };

    expect(calculatePlayerValue(cheapDeal)).toBeGreaterThan(calculatePlayerValue(expensiveDeal));
  });

  it('never returns negative value', () => {
    const poorAsset = {
      pos: 'RB',
      ovr: 55,
      potential: 55,
      age: 36,
      contract: { baseAnnual: 55 },
    };

    expect(calculatePlayerValue(poorAsset)).toBeGreaterThanOrEqual(0);
  });
});
