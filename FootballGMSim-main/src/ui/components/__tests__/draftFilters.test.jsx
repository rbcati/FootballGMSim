import { describe, expect, it } from 'vitest';
import { filterDraftProspectsForView } from '../Draft.jsx';

describe('draft advanced filter integration', () => {
  it('applies position/name baseline plus advanced filters', () => {
    const prospects = [
      { id: 1, name: 'Aaron Ace', pos: 'QB', age: 22, ovr: 77, potential: 88, ratings: { tha: 79 } },
      { id: 2, name: 'Ben Bolt', pos: 'QB', age: 24, ovr: 71, potential: 75, ratings: { tha: 68 } },
      { id: 3, name: 'Will Wideout', pos: 'WR', age: 22, ovr: 74, potential: 86, ratings: { spd: 85 } },
    ];

    const result = filterDraftProspectsForView(prospects, {
      filterPos: 'QB',
      nameFilter: 'a',
      advancedFilters: [{ id: 'f1', fieldKey: 'potential', operator: 'gte', value: 80 }],
    });

    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it('handles prospects without names during draft state hydration', () => {
    const prospects = [{ id: 4, pos: 'QB', potential: 81 }, { id: 5, name: 'Chris Clean', pos: 'QB', potential: 79 }];
    const result = filterDraftProspectsForView(prospects, {
      filterPos: 'QB',
      nameFilter: 'ch',
      advancedFilters: [],
    });
    expect(result.map((p) => p.id)).toEqual([5]);
  });
});
