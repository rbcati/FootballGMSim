import { describe, expect, it } from 'vitest';
import { buildResignDecisionTabs, filterResignDecisionRows } from '../resignDecisionFilters.js';

const mockRow = (id, tier, risk = 'Medium', difficulty = 'Medium') => ({
  id,
  _resignMeta: {
    tier,
    negotiationRisk: risk,
    replacementDifficulty: difficulty,
  },
});

const buildMixedRows = () => [
  mockRow(1, 'priority_resign', 'Low', 'High'),
  mockRow(2, 'resign_if_price', 'High', 'Medium'),
  mockRow(3, 'let_walk', 'Medium', 'Low'),
  mockRow(4, 'trade_or_tag', 'High', 'High'),
  mockRow(5, 'replaceable_depth', 'Low', 'Low'),
  { id: 6 }, // no _resignMeta
];

const tabCounts = (rows) =>
  Object.fromEntries(buildResignDecisionTabs(rows).map((t) => [t.id, t.count]));

describe('buildResignDecisionTabs', () => {
  it('returns correct counts from a mixed enriched row set', () => {
    expect(tabCounts(buildMixedRows())).toEqual({
      all: 6,
      priority: 1,
      'high-risk': 2,
      'hard-to-replace': 2,
      'let-walk': 1,
      'trade-tag': 1,
    });
  });

  it('counts all rows under All, including rows without _resignMeta', () => {
    const rows = buildMixedRows();
    const tabs = buildResignDecisionTabs(rows);
    expect(tabs.find((t) => t.id === 'all').count).toBe(rows.length);
  });

  it('exposes the expected tab ids and labels in order', () => {
    expect(buildResignDecisionTabs([]).map(({ id, label, count }) => ({ id, label, count }))).toEqual([
      { id: 'all', label: 'All', count: 0 },
      { id: 'priority', label: 'Priority', count: 0 },
      { id: 'high-risk', label: 'High Risk', count: 0 },
      { id: 'hard-to-replace', label: 'Hard to Replace', count: 0 },
      { id: 'let-walk', label: 'Let Walk', count: 0 },
      { id: 'trade-tag', label: 'Trade / Tag', count: 0 },
    ]);
  });
});

describe('filterResignDecisionRows', () => {
  it('returns the exact same array reference for the all tab', () => {
    const rows = buildMixedRows();
    expect(filterResignDecisionRows(rows, 'all')).toBe(rows);
  });

  it('returns the exact same array reference for an unknown tab', () => {
    const rows = buildMixedRows();
    expect(filterResignDecisionRows(rows, 'unknown-tab')).toBe(rows);
  });

  it('priority tab returns only priority_resign rows', () => {
    const filtered = filterResignDecisionRows(buildMixedRows(), 'priority');
    expect(filtered.map((r) => r.id)).toEqual([1]);
    expect(filtered.every((r) => r._resignMeta.tier === 'priority_resign')).toBe(true);
  });

  it('high-risk tab returns only rows with negotiationRisk High', () => {
    const filtered = filterResignDecisionRows(buildMixedRows(), 'high-risk');
    expect(filtered.map((r) => r.id)).toEqual([2, 4]);
    expect(filtered.every((r) => r._resignMeta.negotiationRisk === 'High')).toBe(true);
  });

  it('hard-to-replace tab returns only rows with replacementDifficulty High', () => {
    const filtered = filterResignDecisionRows(buildMixedRows(), 'hard-to-replace');
    expect(filtered.map((r) => r.id)).toEqual([1, 4]);
    expect(filtered.every((r) => r._resignMeta.replacementDifficulty === 'High')).toBe(true);
  });

  it('let-walk tab returns only let_walk rows', () => {
    expect(filterResignDecisionRows(buildMixedRows(), 'let-walk').map((r) => r.id)).toEqual([3]);
  });

  it('trade-tag tab returns only trade_or_tag rows', () => {
    expect(filterResignDecisionRows(buildMixedRows(), 'trade-tag').map((r) => r.id)).toEqual([4]);
  });

  it('resign_if_price rows appear only under All', () => {
    const rows = [mockRow(1, 'resign_if_price')];
    expect(filterResignDecisionRows(rows, 'all')).toBe(rows);
    for (const tab of ['priority', 'high-risk', 'hard-to-replace', 'let-walk', 'trade-tag']) {
      expect(filterResignDecisionRows(rows, tab)).toEqual([]);
    }
  });

  it('replaceable_depth rows appear only under All', () => {
    const rows = [mockRow(1, 'replaceable_depth')];
    expect(filterResignDecisionRows(rows, 'all')).toBe(rows);
    for (const tab of ['priority', 'high-risk', 'hard-to-replace', 'let-walk', 'trade-tag']) {
      expect(filterResignDecisionRows(rows, tab)).toEqual([]);
    }
  });

  it('rows with no _resignMeta appear only under All and count 0 on specific tabs', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(filterResignDecisionRows(rows, 'all')).toBe(rows);
    const counts = tabCounts(rows);
    expect(counts).toEqual({
      all: 2,
      priority: 0,
      'high-risk': 0,
      'hard-to-replace': 0,
      'let-walk': 0,
      'trade-tag': 0,
    });
    for (const tab of ['priority', 'high-risk', 'hard-to-replace', 'let-walk', 'trade-tag']) {
      expect(filterResignDecisionRows(rows, tab)).toEqual([]);
    }
  });

  it('preserves original insertion order in filtered results', () => {
    const rows = [
      mockRow('c', 'trade_or_tag', 'High'),
      mockRow('a', 'priority_resign', 'High'),
      mockRow('b', 'let_walk', 'High'),
    ];
    expect(filterResignDecisionRows(rows, 'high-risk').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('never mutates the original rows', () => {
    const rows = buildMixedRows().map((row) => Object.freeze({ ...row }));
    const snapshot = structuredClone(rows);
    for (const tab of ['all', 'priority', 'high-risk', 'hard-to-replace', 'let-walk', 'trade-tag', 'unknown-tab']) {
      filterResignDecisionRows(rows, tab);
    }
    expect(rows).toEqual(snapshot);
  });
});
