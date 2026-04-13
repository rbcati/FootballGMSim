import type { LegacyPlayerRatings, PlayerRatings, RatingKey, LegacyRatingKey } from './footballTypes';

export const LEGACY_TO_CANONICAL_RATING_KEY: Record<LegacyRatingKey, RatingKey> = {
  throwAccuracy: 'tha',
  throwPower: 'thp',
  speed: 'spd',
  acceleration: 'acc',
  awareness: 'awr',
  catching: 'cth',
  catchInTraffic: 'cit',
  runBlock: 'rbk',
  passBlock: 'pbk',
  passRushSpeed: 'prs',
  passRushPower: 'prp',
  runStop: 'rns',
  coverage: 'cov',
  kickPower: 'kpw',
  kickAccuracy: 'kac',
  trucking: 'trk',
  juking: 'jkm',
};

export const CANONICAL_TO_LEGACY_RATING_KEY: Record<RatingKey, LegacyRatingKey> = Object.entries(LEGACY_TO_CANONICAL_RATING_KEY)
  .reduce((acc, [legacyKey, canonicalKey]) => {
    acc[canonicalKey as RatingKey] = legacyKey as LegacyRatingKey;
    return acc;
  }, {} as Record<RatingKey, LegacyRatingKey>);

export function mapLegacyRatingsToFootballRatings(ratings: LegacyPlayerRatings = {}): PlayerRatings {
  const mapped: PlayerRatings = {};
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_TO_CANONICAL_RATING_KEY)) {
    const value = ratings[legacyKey as LegacyRatingKey];
    if (typeof value === 'number') {
      mapped[canonicalKey] = value;
    }
  }
  return mapped;
}

export function mapFootballRatingsToLegacyRatings(ratings: PlayerRatings = {}): LegacyPlayerRatings {
  const mapped: LegacyPlayerRatings = {};
  for (const [canonicalKey, legacyKey] of Object.entries(CANONICAL_TO_LEGACY_RATING_KEY)) {
    const value = ratings[canonicalKey as RatingKey];
    if (typeof value === 'number') {
      mapped[legacyKey] = value;
    }
  }
  return mapped;
}
