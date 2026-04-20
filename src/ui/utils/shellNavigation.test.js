import { describe, it, expect } from 'vitest';
import { getShellSectionForDashboardTab, normalizeDashboardTab, normalizeShellSectionId } from './shellNavigation.js';

describe('shell navigation mapping', () => {
  it('normalizes legacy aliases to canonical dashboard tabs', () => {
    expect(normalizeDashboardTab('Weekly Hub')).toBe('HQ');
    expect(normalizeDashboardTab('📰 News')).toBe('News');
    expect(normalizeDashboardTab('History')).toBe('History Hub');
  });

  it('maps dashboard tabs into new shell sections', () => {
    expect(getShellSectionForDashboardTab('Roster')).toBe('team');
    expect(getShellSectionForDashboardTab('Standings')).toBe('league');
    expect(getShellSectionForDashboardTab('Transactions')).toBe('league');
    expect(getShellSectionForDashboardTab('Season Recap')).toBe('league');
  });

  it('accepts legacy mobile ids as section inputs', () => {
    expect(normalizeShellSectionId('weekly')).toBe('hq');
    expect(normalizeShellSectionId('trade')).toBe('league');
    expect(normalizeShellSectionId('history')).toBe('league');
  });
});
