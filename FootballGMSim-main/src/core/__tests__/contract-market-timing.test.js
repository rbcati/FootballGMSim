import { describe, expect, it } from 'vitest';
import { buildDecisionTiming } from '../contract-market.js';

describe('contract market decision timing', () => {
  it('caps ordinary players to a one-cycle wait window', () => {
    const player = { id: 21, age: 27, ovr: 78 };

    const initial = buildDecisionTiming(player, 1.05, 1, 'free_agency', { waitCycles: 0, moneyGapRatio: 0.12 });
    const capped = buildDecisionTiming(player, 1.05, 1, 'free_agency', { waitCycles: 1, moneyGapRatio: 0.12 });

    expect(initial.maxWaitCycles).toBe(1);
    expect(capped.atWaitCap).toBe(true);
    expect(capped.resolveNow).toBe(true);
  });

  it('allows elite multi-bidder players up to two cycles before forced resolution', () => {
    const player = { id: 99, age: 26, ovr: 93 };

    const cycleOne = buildDecisionTiming(player, 1.3, 3, 'free_agency', { waitCycles: 1, moneyGapRatio: 0.1 });
    const cycleTwo = buildDecisionTiming(player, 1.3, 3, 'free_agency', { waitCycles: 2, moneyGapRatio: 0.1 });

    expect(cycleOne.eliteMarket).toBe(true);
    expect(cycleOne.maxWaitCycles).toBe(2);
    expect(cycleOne.atWaitCap).toBe(false);
    expect(cycleTwo.atWaitCap).toBe(true);
    expect(cycleTwo.resolveNow).toBe(true);
  });
});
