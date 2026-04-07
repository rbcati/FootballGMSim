import { describe, it, expect } from 'vitest';
import { evaluateResignRecommendation } from './contractInsights.js';

describe('contract insights prioritization', () => {
  it('marks elite expensive non-contender as trade/tag candidate', () => {
    const rec = evaluateResignRecommendation(
      { pos: 'WR', ovr: 88, potential: 90, age: 28, morale: 72, schemeFit: 81, contract: { baseAnnual: 16 }, extensionAsk: { baseAnnual: 24 } },
      { team: { capRoom: 20 }, direction: 'rebuilding', roster: [{ pos: 'WR' }, { pos: 'WR' }] },
    );
    expect(rec.tier).toBe('trade_or_tag');
  });

  it('marks core player as must keep', () => {
    const rec = evaluateResignRecommendation(
      { pos: 'QB', ovr: 91, potential: 93, age: 25, morale: 80, schemeFit: 85, contract: { baseAnnual: 12 }, extensionAsk: { baseAnnual: 13 } },
      { team: { capRoom: 35 }, direction: 'contender', roster: [{ pos: 'QB' }] },
    );
    expect(rec.tier).toBe('priority_resign');
  });
});
