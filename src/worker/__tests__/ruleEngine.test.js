import { describe, expect, it } from 'vitest';
import { buildDraftOrder, getSuspensionProbabilityMultiplier } from '../modding/ruleEngine.js';

const teams = [
  { id: 1, wins: 2, ptsFor: 200, ptsAgainst: 300 },
  { id: 2, wins: 6, ptsFor: 250, ptsAgainst: 240 },
  { id: 3, wins: 10, ptsFor: 350, ptsAgainst: 210 },
];

describe('modding rule engine', () => {
  it('uses reverse standings by default', () => {
    const order = buildDraftOrder(teams, { draftOrderLogic: 'reverse_standings' }, 3, () => 0.1);
    expect(order[0]).toBe(1);
    expect(order[order.length - 1]).toBe(3);
  });

  it('supports random draft order', () => {
    const order = buildDraftOrder(teams, { draftOrderLogic: 'random' }, null, () => 0.6);
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
  });

  it('maps suspension frequency to multiplier', () => {
    expect(getSuspensionProbabilityMultiplier({ suspensionFrequency: 0 })).toBe(0);
    expect(getSuspensionProbabilityMultiplier({ suspensionFrequency: 50 })).toBe(1);
  });
});
