import { describe, expect, it } from 'vitest';
import { buildSortedFreeAgentsMapForOffers } from '../../src/core/ai-logic.js';

function fa(id, pos = 'WR', ovr = 70) {
  return { id, pos, ovr, teamId: null, status: 'free_agent' };
}

describe('AI free-agency offer pool ordering', () => {
  it('orders equal-OVR free agents by canonical id so contract writes are deterministic', () => {
    const a = buildSortedFreeAgentsMapForOffers([fa('10'), fa('2'), fa('1'), fa('9')]);
    const b = buildSortedFreeAgentsMapForOffers([fa('9'), fa('1'), fa('2'), fa('10')]);
    expect(a.WR.map((p) => p.id)).toEqual(['1', '2', '9', '10']);
    expect(b.WR.map((p) => p.id)).toEqual(a.WR.map((p) => p.id));
  });
});
