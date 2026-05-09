import { describe, it, expect } from 'vitest';
import { filterAwardRows } from '../../src/ui/utils/historyDestinations.js';

describe('filterAwardRows', () => {
  it('filters MVP scope using awardKey or display name', () => {
    const rows = [
      { season: 2030, awardKey: 'mvp', award: 'Most Valuable Player', name: 'A' },
      { season: 2030, awardKey: 'opoy', award: 'Offensive Player of the Year', name: 'B' },
    ];
    const mvp = filterAwardRows(rows, 'mvp');
    expect(mvp).toHaveLength(1);
    expect(mvp[0].awardKey).toBe('mvp');
  });
});
