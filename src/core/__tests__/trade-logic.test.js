import { describe, expect, it } from 'vitest';
import { calculatePlayerValue, shouldBlockCpuUniformPlayerSwap } from '../trade-logic.js';

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

describe('shouldBlockCpuUniformPlayerSwap', () => {
  it('blocks uniform swaps that involve a quarterback', () => {
    expect(shouldBlockCpuUniformPlayerSwap({ pos: 'QB' }, { pos: 'WR' })).toBe(true);
    expect(shouldBlockCpuUniformPlayerSwap({ pos: 'LB' }, { pos: 'QB' })).toBe(true);
  });

  it('allows non-QB uniform swaps', () => {
    expect(shouldBlockCpuUniformPlayerSwap({ pos: 'WR' }, { pos: 'CB' })).toBe(false);
  });

  it('blocks directionless veteran-for-veteran swaps involving a quarterback', () => {
    const expensiveQb = { pos: 'QB', age: 35, ovr: 76, potential: 76, contract: { baseAnnual: 22 } };
    const expensiveWr = { pos: 'WR', age: 33, ovr: 79, potential: 79, contract: { baseAnnual: 14 } };

    expect(shouldBlockCpuUniformPlayerSwap(expensiveQb, expensiveWr)).toBe(true);
  });
});


describe('Trade Market Realism V2 valuation guardrails', () => {
  it('protects young premium quarterbacks from being undervalued', () => {
    const youngQb = {
      pos: 'QB',
      ovr: 77,
      potential: 90,
      age: 23,
      contract: { baseAnnual: 5 },
    };
    const veteranRb = {
      pos: 'RB',
      ovr: 84,
      potential: 84,
      age: 30,
      contract: { baseAnnual: 9 },
    };

    expect(calculatePlayerValue(youngQb)).toBeGreaterThan(calculatePlayerValue(veteranRb));
  });

  it('contract burden lowers offer value for old expensive veterans', () => {
    const reasonableVeteran = {
      pos: 'CB',
      ovr: 82,
      potential: 82,
      age: 31,
      contract: { baseAnnual: 7 },
    };
    const burdenVeteran = {
      pos: 'CB',
      ovr: 82,
      potential: 82,
      age: 31,
      contract: { baseAnnual: 24 },
    };

    expect(calculatePlayerValue(burdenVeteran)).toBeLessThan(calculatePlayerValue(reasonableVeteran));
  });
});
