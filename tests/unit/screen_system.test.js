import { describe, it, expect } from 'vitest';
import { buildHeaderMetadata, getStickyTopOffset } from '../../src/ui/utils/screenSystem.js';

describe('screen system utilities', () => {
  it('keeps only complete metadata items and normalizes values', () => {
    expect(buildHeaderMetadata([
      { label: 'Week', value: 7 },
      { label: 'Phase', value: 'Regular' },
      { label: '', value: 'skip' },
      { label: 'Blank', value: '  ' },
      null,
    ])).toEqual([
      { label: 'Week', value: '7' },
      { label: 'Phase', value: 'Regular' },
    ]);
  });

  it('uses one sticky offset scale for subnav patterns', () => {
    expect(getStickyTopOffset('default')).toBe('calc(env(safe-area-inset-top) + 56px)');
    expect(getStickyTopOffset('compact')).toBe('calc(env(safe-area-inset-top) + 52px)');
    expect(getStickyTopOffset('detail')).toBe('calc(env(safe-area-inset-top) + 60px)');
  });
});
