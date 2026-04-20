import { describe, expect, it } from 'vitest';
import {
  applyRangeFilter,
  inTier,
  normalizeViewMode,
  cycleSort,
  createQuickActionState,
  toggleQuickAction,
} from './managementList.js';

describe('management list helpers', () => {
  it('applies numeric range filters', () => {
    expect(applyRangeFilter(26, [24, 30])).toBe(true);
    expect(applyRangeFilter(31, [24, 30])).toBe(false);
  });

  it('maps overall values into tiers', () => {
    expect(inTier(90, 'elite')).toBe(true);
    expect(inTier(79, 'starter')).toBe(true);
    expect(inTier(62, 'fringe')).toBe(true);
    expect(inTier(90, 'depth')).toBe(false);
  });

  it('normalizes view modes and sort cycles', () => {
    expect(normalizeViewMode('table')).toBe('table');
    expect(normalizeViewMode('depth')).toBe('cards');
    expect(cycleSort('ovr', 'desc', 'ovr')).toEqual({ key: 'ovr', dir: 'asc' });
    expect(cycleSort('ovr', 'asc', 'salary', ['salary'])).toEqual({ key: 'salary', dir: 'desc' });
  });

  it('handles quick-action open/close state', () => {
    const state = createQuickActionState();
    const opened = toggleQuickAction(state, 9);
    expect(opened.openForId).toBe(9);
    expect(toggleQuickAction(opened, 9).openForId).toBe(null);
  });
});
