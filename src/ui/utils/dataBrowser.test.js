/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import {
  normalizeSearchText,
  rowMatchesSearch,
  compareValues,
  stableSortRows,
  uniqueFilterOptions,
  buildShowingLabel,
} from './dataBrowser.js';

describe('dataBrowser helpers', () => {
  describe('normalizeSearchText', () => {
    it('lowercases and trims', () => {
      expect(normalizeSearchText('  Hello World  ')).toBe('hello world');
    });
    it('returns empty string for null/undefined', () => {
      expect(normalizeSearchText(null)).toBe('');
      expect(normalizeSearchText(undefined)).toBe('');
    });
    it('coerces numbers to strings', () => {
      expect(normalizeSearchText(2032)).toBe('2032');
    });
  });

  describe('rowMatchesSearch', () => {
    const row = { name: 'Aaron Rodgers', team: 'NYJ', year: 2025 };
    it('returns true when query is empty', () => {
      expect(rowMatchesSearch(row, '', ['name'])).toBe(true);
      expect(rowMatchesSearch(row, '  ', ['name'])).toBe(true);
    });
    it('matches partial name', () => {
      expect(rowMatchesSearch(row, 'rod', ['name', 'team'])).toBe(true);
    });
    it('matches team abbr', () => {
      expect(rowMatchesSearch(row, 'nyj', ['name', 'team'])).toBe(true);
    });
    it('matches year as string', () => {
      expect(rowMatchesSearch(row, '2025', ['name', 'year'])).toBe(true);
    });
    it('does not match unrelated text', () => {
      expect(rowMatchesSearch(row, 'mahomes', ['name', 'team'])).toBe(false);
    });
    it('returns false for null row', () => {
      expect(rowMatchesSearch(null, 'test', ['name'])).toBe(false);
    });
  });

  describe('compareValues', () => {
    it('sorts numbers ascending', () => {
      expect(compareValues(3, 7, 'asc')).toBeLessThan(0);
      expect(compareValues(10, 2, 'asc')).toBeGreaterThan(0);
    });
    it('sorts numbers descending', () => {
      expect(compareValues(3, 7, 'desc')).toBeGreaterThan(0);
    });
    it('sorts strings with locale compare', () => {
      expect(compareValues('alpha', 'beta', 'asc')).toBeLessThan(0);
    });
    it('pushes nullish to end', () => {
      expect(compareValues(null, 5, 'asc')).toBeGreaterThan(0);
      expect(compareValues(5, null, 'asc')).toBeLessThan(0);
      expect(compareValues(null, null, 'asc')).toBe(0);
    });
  });

  describe('stableSortRows', () => {
    it('sorts by numeric key ascending', () => {
      const rows = [{ year: 2030 }, { year: 2028 }, { year: 2032 }];
      const sorted = stableSortRows(rows, 'year', 'asc');
      expect(sorted.map((r) => r.year)).toEqual([2028, 2030, 2032]);
    });
    it('sorts by numeric key descending', () => {
      const rows = [{ year: 2030 }, { year: 2028 }, { year: 2032 }];
      const sorted = stableSortRows(rows, 'year', 'desc');
      expect(sorted.map((r) => r.year)).toEqual([2032, 2030, 2028]);
    });
    it('preserves order for equal elements (stable)', () => {
      const rows = [
        { year: 2030, name: 'A' },
        { year: 2030, name: 'B' },
        { year: 2030, name: 'C' },
      ];
      const sorted = stableSortRows(rows, 'year', 'asc');
      expect(sorted.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    });
    it('handles empty array', () => {
      expect(stableSortRows([], 'year', 'asc')).toEqual([]);
    });
    it('handles null input', () => {
      expect(stableSortRows(null, 'year', 'asc')).toEqual([]);
    });
  });

  describe('uniqueFilterOptions', () => {
    it('returns sorted unique values', () => {
      const rows = [{ type: 'trade' }, { type: 'signing' }, { type: 'trade' }, { type: 'draft' }];
      expect(uniqueFilterOptions(rows, 'type')).toEqual(['draft', 'signing', 'trade']);
    });
    it('skips null/empty values', () => {
      const rows = [{ type: 'trade' }, { type: null }, { type: '' }, { type: 'draft' }];
      expect(uniqueFilterOptions(rows, 'type')).toEqual(['draft', 'trade']);
    });
    it('returns empty for empty input', () => {
      expect(uniqueFilterOptions([], 'type')).toEqual([]);
      expect(uniqueFilterOptions(null, 'type')).toEqual([]);
    });
  });

  describe('buildShowingLabel', () => {
    it('shows total when all visible', () => {
      expect(buildShowingLabel(10, 10, 'seasons')).toBe('10 seasons');
    });
    it('shows filtered count', () => {
      expect(buildShowingLabel(3, 10, 'seasons')).toBe('Showing 3 of 10 seasons');
    });
    it('handles zero total', () => {
      expect(buildShowingLabel(0, 0, 'seasons')).toBe('No seasons');
    });
    it('uses default noun', () => {
      expect(buildShowingLabel(5, 5)).toBe('5 items');
    });
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
