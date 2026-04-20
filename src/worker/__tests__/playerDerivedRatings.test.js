import { describe, expect, it } from 'vitest';
import { calculateOverallFromAttributesV2, derivePlayerVisibleRatingsPatch } from '../playerDerivedRatings.js';

function makeAttrs(value) {
  return {
    release: value,
    routeRunning: value,
    separation: value,
    catchInTraffic: value,
    ballTracking: value,
    throwAccuracyShort: value,
    throwAccuracyDeep: value,
    throwPower: value,
    decisionMaking: value,
    pocketPresence: value,
    passBlockFootwork: value,
    passBlockStrength: value,
    passRush: value,
    pressCoverage: value,
    zoneCoverage: value,
  };
}

describe('playerDerivedRatings', () => {
  it('stays build/runtime safe when attributesV2 players have no ratings object', () => {
    const player = { id: 11, pos: 'QB', attributesV2: makeAttrs(82) };
    const patch = derivePlayerVisibleRatingsPatch(player, player.attributesV2);

    expect(patch).toBeTruthy();
    expect(patch.ovr).toBe(82);
    expect(patch.ratings.overall).toBe(82);
    expect(patch.ratings.ovr).toBe(82);
  });

  it('synchronizes visible ovr fields from offseason attributesV2 updates', () => {
    const player = {
      id: 7,
      pos: 'WR',
      ovr: 70,
      ratings: { overall: 70, ovr: 70 },
      attributesV2: makeAttrs(70),
    };

    const boosted = {
      ...makeAttrs(70),
      release: 88,
      routeRunning: 87,
      separation: 90,
      catchInTraffic: 84,
      ballTracking: 86,
    };

    const patch = derivePlayerVisibleRatingsPatch(player, boosted);
    expect(patch.ovr).toBeGreaterThan(player.ovr);
    expect(patch.ratings.overall).toBe(patch.ovr);
  });

  it('is deterministic and legacy-safe in mixed-mode saves', () => {
    const attrPlayer = { id: 1, pos: 'LB', attributesV2: makeAttrs(76) };
    const legacyPlayer = { id: 2, pos: 'LB', ovr: 73 };

    const first = calculateOverallFromAttributesV2(attrPlayer, attrPlayer.attributesV2);
    const second = calculateOverallFromAttributesV2(attrPlayer, attrPlayer.attributesV2);
    const legacy = derivePlayerVisibleRatingsPatch(legacyPlayer, legacyPlayer.attributesV2);

    expect(first).toBe(second);
    expect(legacy).toBeNull();
  });
});
