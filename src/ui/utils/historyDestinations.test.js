import { describe, it, expect } from 'vitest';
import { resolveHistoryDestination, filterAwardRows } from './historyDestinations.js';

describe('history destinations and browsing helpers', () => {
  it('resolves team history destination distinctly from league history', () => {
    expect(resolveHistoryDestination('Team History')).toBe('team');
    expect(resolveHistoryDestination('History')).toBe('league');
  });

  it('filters awards for recent scope browsing', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ award: i % 2 ? 'MVP' : 'DPOY', season: 2000 + i }));
    expect(filterAwardRows(rows, 'recent')).toHaveLength(24);
    expect(filterAwardRows(rows, 'mvp').every((r) => r.award === 'MVP')).toBe(true);
  });
});
