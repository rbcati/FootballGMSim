import { describe, expect, it } from 'vitest';
import { RESIGN_DECISION_TAB_DEFS, buildResignDecisionTabs, filterResignDecisionRows } from '../resignDecisionFilters.js';

const rows = [
  { id: 1, rec: { tier: 'priority_resign', negotiationRisk: 'Low', replacementDifficulty: 'High' } },
  { id: 2, rec: { tier: 'let_walk', negotiationRisk: 'High', replacementDifficulty: 'Low' } },
  { id: 3, rec: { tier: 'trade_or_tag', negotiationRisk: 'High', replacementDifficulty: 'Medium' } },
];
const getDecision = (row) => row.rec;

describe('resignDecisionFilters', () => {
  it('exposes All, Priority, High Risk, Hard to Replace, Let Walk, Trade / Tag tabs in order', () => {
    expect(RESIGN_DECISION_TAB_DEFS.map((t) => t.key)).toEqual([
      'all', 'priority', 'high_risk', 'hard_to_replace', 'let_walk', 'trade_or_tag',
    ]);
  });

  it('builds counts from the unfiltered row set', () => {
    const tabs = buildResignDecisionTabs(rows, getDecision);
    const byKey = Object.fromEntries(tabs.map((t) => [t.key, t.count]));
    expect(byKey).toEqual({
      all: 3, priority: 1, high_risk: 2, hard_to_replace: 1, let_walk: 1, trade_or_tag: 1,
    });
  });

  it('filters rows by the active tab without mutating the source array', () => {
    const original = [...rows];
    expect(filterResignDecisionRows(rows, getDecision, 'let_walk').map((r) => r.id)).toEqual([2]);
    expect(filterResignDecisionRows(rows, getDecision, 'trade_or_tag').map((r) => r.id)).toEqual([3]);
    expect(rows).toEqual(original);
  });

  it('falls back to the "all" tab for an unknown key', () => {
    expect(filterResignDecisionRows(rows, getDecision, 'nonsense').length).toBe(3);
  });
});
