import { describe, expect, it } from 'vitest';
import { ensureAttributesV2, mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';

describe('attributeMigrator', () => {
  it('maps a legacy overall rating to varied attributes', () => {
    const attrs = mapOverallToAttributesV2(90, 5.5, 'seed-90');
    const uniqueValues = new Set(Object.values(attrs));

    expect(Object.values(attrs).every((value) => value >= 25 && value <= 99)).toBe(true);
    expect(uniqueValues.size).toBeGreaterThan(8);
  });

  it('is idempotent when attributesV2 already exists', () => {
    const player = {
      id: 12,
      name: 'Existing Player',
      ovr: 88,
      attributesV2: mapOverallToAttributesV2(88, 5.5, 'existing'),
    };

    const migrated = ensureAttributesV2(player);

    expect(migrated.attributesV2).toEqual(player.attributesV2);
  });
});
