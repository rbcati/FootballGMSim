import { describe, expect, it } from 'vitest';
import { buildShowingLabel, rowMatchesSearch, stableSortRows, uniqueFilterOptions } from './dataBrowser.js';

describe('dataBrowser helpers', () => {
  it('matches search across configured fields safely', () => {
    const row = { name: 'José Rocket', team: 'NYJ', pos: 'WR' };
    expect(rowMatchesSearch(row, 'jose', ['name', 'team'])).toBe(true);
    expect(rowMatchesSearch(row, 'qb', ['name', 'team', 'pos'])).toBe(false);
    expect(rowMatchesSearch(null, '', ['name'])).toBe(true);
  });

  it('sorts numeric and string values with stable same-key order', () => {
    const rows = [
      { id: 1, name: 'Beta', yards: 10 },
      { id: 2, name: 'Alpha', yards: 30 },
      { id: 3, name: 'Gamma', yards: 30 },
    ];
    expect(stableSortRows(rows, (r) => r.yards, 'desc').map((r) => r.id)).toEqual([2, 3, 1]);
    expect(stableSortRows(rows, (r) => r.name, 'asc').map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('builds compact filter metadata', () => {
    expect(uniqueFilterOptions([{ pos: 'QB' }, { pos: 'WR' }, { pos: 'QB' }], (r) => r.pos)).toEqual(['QB', 'WR']);
    expect(buildShowingLabel(2, 3, 'player')).toBe('Showing 2 of 3 players');
    expect(buildShowingLabel(1, 1, 'team')).toBe('Showing 1 of 1 team');
  });
});
