import { describe, it, expect } from 'vitest';
import { filterFreeAgentsForView, formatPlaybookKnowledge, sortFreeAgentsForView } from '../FreeAgency.jsx';

describe('free agency playbook knowledge display', () => {
  it('formats label and score for UI rows/cards', () => {
    expect(formatPlaybookKnowledge({ label: 'High', score: 88 })).toBe('High (88)');
    expect(formatPlaybookKnowledge(null)).toBe('None (0)');
  });

  it('applies advanced filters on top of baseline FA filters', () => {
    const pool = [
      { id: 1, name: 'Alex QB', pos: 'QB', ovr: 82, age: 24, potential: 88 },
      { id: 2, name: 'Brett WR', pos: 'WR', ovr: 79, age: 28, potential: 80 },
      { id: 3, name: 'Chris QB', pos: 'QB', ovr: 68, age: 31, potential: 69 },
    ];
    const result = filterFreeAgentsForView(pool, {
      signedIds: new Set(),
      posFilter: 'QB',
      minOvr: 60,
      nameFilter: '',
      advancedFilters: [{ id: 'a', fieldKey: 'age', operator: 'lte', value: 25 }],
    });
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it('supports tactical evaluation filters', () => {
    const pool = [
      { id: 1, name: 'Alex QB', pos: 'QB', ovr: 82, _eval: { archetype: { archetype: 'Timing Distributor' }, schemeFit: { tier: 'Strong' }, roleProjection: { role: 'Starter' } } },
      { id: 2, name: 'Brett WR', pos: 'WR', ovr: 79, _eval: { archetype: { archetype: 'Deep Threat' }, schemeFit: { tier: 'Poor' }, roleProjection: { role: 'Depth' } } },
    ];
    const result = filterFreeAgentsForView(pool, {
      signedIds: new Set(),
      posFilter: 'ALL',
      minOvr: 60,
      nameFilter: '',
      advancedFilters: [],
      fitTierFilter: 'Strong',
      roleFilter: 'Starter',
      archetypeFilter: 'Timing Distributor',
      positionNeedOnly: true,
      needs: ['QB'],
    });
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it('sorts by tactical fit using evaluation score', () => {
    const sorted = sortFreeAgentsForView([
      { id: 1, ovr: 80, _eval: { schemeFit: { score: 66 } } },
      { id: 2, ovr: 77, _eval: { schemeFit: { score: 83 } } },
      { id: 3, ovr: 82, _eval: { schemeFit: { score: 74 } } },
    ], { sortPreset: 'tactical_fit', sortKey: 'ovr', sortDir: 'desc', needs: [] });
    expect(sorted.map((p) => p.id)).toEqual([2, 3, 1]);
  });
});
