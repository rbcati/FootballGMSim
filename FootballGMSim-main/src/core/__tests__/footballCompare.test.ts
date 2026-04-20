import { describe, expect, it } from 'vitest';
import { compareNumbers, getPlayerRatingValue, resolveCompareStatSections } from '../footballCompare';

describe('footballCompare helpers', () => {
  it('highlights better values correctly', () => {
    expect(compareNumbers(82, 79)).toBe('a');
    expect(compareNumbers(70, 91)).toBe('b');
    expect(compareNumbers(4, 2, true)).toBe('b');
    expect(compareNumbers(null, 2)).toBe('tie');
  });

  it('supports canonical and legacy rating access', () => {
    expect(getPlayerRatingValue({ ratings: { tha: 78 } }, 'tha')).toBe(78);
    expect(getPlayerRatingValue({ ratings: { throwAccuracy: 74 } }, 'tha')).toBe(74);
  });

  it('filters empty stat sections for mismatched players', () => {
    const sections = resolveCompareStatSections(
      { pos: 'QB', stats: { passYd: 4100 } },
      { pos: 'WR', stats: { recYd: 1200 } },
      false,
    );
    expect(sections.some((s) => s.key === 'passing')).toBe(true);
    expect(sections.some((s) => s.key === 'receiving')).toBe(true);
  });
});
