import { describe, expect, it } from 'vitest';
import { mapFootballRatingsToLegacyRatings, mapLegacyRatingsToFootballRatings } from '../footballRatings';

describe('footballRatings adapters', () => {
  it('maps legacy ratings into canonical shorthand keys', () => {
    expect(
      mapLegacyRatingsToFootballRatings({ throwAccuracy: 88, throwPower: 92, coverage: 77 }),
    ).toEqual({ tha: 88, thp: 92, cov: 77 });
  });

  it('maps canonical shorthand keys back to legacy ratings', () => {
    expect(
      mapFootballRatingsToLegacyRatings({ tha: 85, prs: 79, rbk: 72 }),
    ).toEqual({ throwAccuracy: 85, passRushSpeed: 79, runBlock: 72 });
  });
});
