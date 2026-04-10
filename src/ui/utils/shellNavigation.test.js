import { describe, it, expect } from 'vitest';
import { getShellSectionForDashboardTab, normalizeDashboardTab, normalizeShellSectionId } from './shellNavigation.js';

describe('shell navigation mapping', () => {
  it('normalizes legacy aliases to canonical dashboard tabs', () => {
    expect(normalizeDashboardTab('Weekly Hub')).toBe('HQ');
    expect(normalizeDashboardTab('📰 News')).toBe('News');
  });

  it('maps dashboard tabs into shell sections', () => {
    expect(getShellSectionForDashboardTab('Roster')).toBe('team');
    expect(getShellSectionForDashboardTab('Standings')).toBe('league');
    expect(getShellSectionForDashboardTab('News')).toBe('news');
    expect(getShellSectionForDashboardTab('Transactions')).toBe('more');
  });

  it('accepts legacy mobile ids as section inputs', () => {
    expect(normalizeShellSectionId('weekly')).toBe('hq');
    expect(normalizeShellSectionId('trade')).toBe('more');
    expect(normalizeShellSectionId('league')).toBe('league');
  });
});
