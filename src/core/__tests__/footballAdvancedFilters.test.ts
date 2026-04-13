import { describe, expect, it } from 'vitest';
import {
  allFilters,
  applyAdvancedPlayerFilters,
  getExtraStatTypeKeys,
  getStats,
  getStatsTableByType,
} from '../footballAdvancedFilters';

describe('footballAdvancedFilters', () => {
  it('builds catalog from football metadata tables', () => {
    expect(allFilters.some((f) => f.key === 'age')).toBe(true);
    expect(allFilters.some((f) => f.key === 'ovr')).toBe(true);
    expect(allFilters.some((f) => f.key === 'passing:passYd')).toBe(true);
  });

  it('resolves stat tables and stat keys', () => {
    expect(getStatsTableByType('passing')?.sortBy).toBe('passYd');
    expect(getStats('receiving')).toContain('recYd');
    expect(getStatsTableByType('missing')).toBeNull();
  });

  it('collects extra worker field requirements', () => {
    const required = getExtraStatTypeKeys([
      { id: '1', fieldKey: 'age', operator: 'gte', value: 23 },
      { id: '2', fieldKey: 'tha', operator: 'gte', value: 70 },
      { id: '3', fieldKey: 'passing:passYd', operator: 'gte', value: 2500 },
    ]);

    expect(required.attrs).toContain('age');
    expect(required.ratings).toContain('tha');
    expect(required.stats).toContain('passYd');
  });

  it('supports numeric, string, and AND logic', () => {
    const players = [
      { id: 1, name: 'Alex One', pos: 'QB', age: 24, ovr: 81, potential: 87 },
      { id: 2, name: 'Brian Two', pos: 'WR', age: 29, ovr: 77, potential: 78 },
      { id: 3, name: 'Chris Three', pos: 'QB', age: 31, ovr: 70, potential: 72 },
    ];

    const filtered = applyAdvancedPlayerFilters(players, [
      { id: 'a', fieldKey: 'name', operator: 'contains', value: 'alex' },
      { id: 'b', fieldKey: 'ovr', operator: 'gte', value: 80 },
      { id: 'c', fieldKey: 'pos', operator: 'eq', value: 'QB' },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });
});
