import { describe, it, expect } from 'vitest';
import {
  PICK_DECAY,
  PACKAGE_DR,
  DEFAULT_PICK_VALUE_MATRIX,
  getPickBaseValueFromMatrix,
  calculateFuturePickDecay,
  applyFuturePickDecayToPickValue,
  evaluateMultiAssetPackageValue,
  calculateTotalPackageScore,
  explainPackageValueBreakdown,
} from '../../src/core/trades/tradeValuationModifiers.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePick(overrides = {}) {
  return {
    id: 'pk-1',
    round: 1,
    season: 2026,
    originalOwner: 10,
    currentOwner: 10,
    ...overrides,
  };
}

function makePickAsset(overrides = {}) {
  return {
    assetType: 'pick',
    pickId: 'pk-1',
    round: 1,
    season: 2026,
    valueScore: 191,
    valueTier: 'premium',
    ...overrides,
  };
}

function makePlayerAsset(overrides = {}) {
  return {
    assetType: 'player',
    playerId: 'p-1',
    pos: 'WR',
    ovr: 85,
    valueScore: 200,
    ...overrides,
  };
}

// ── calculateFuturePickDecay ──────────────────────────────────────────────────

describe('calculateFuturePickDecay — current-season picks', () => {
  it('current-season pick retains full value (yearsOut = 0)', () => {
    const value = calculateFuturePickDecay(200, 2026, 2026);
    expect(value).toBe(200);
  });

  it('past-season pick retains full value (yearsOut < 0)', () => {
    const value = calculateFuturePickDecay(200, 2025, 2026);
    expect(value).toBe(200);
  });

  it('SAME_SEASON_RETENTION constant is 1.0', () => {
    expect(PICK_DECAY.SAME_SEASON_RETENTION).toBe(1.0);
  });
});

describe('calculateFuturePickDecay — future picks lose value', () => {
  it('next-season pick (yearsOut = 1) is discounted', () => {
    const next = calculateFuturePickDecay(200, 2027, 2026);
    expect(next).toBeLessThan(200);
    // Should be ~92% of 200 = 184
    expect(next).toBe(Math.round(200 * PICK_DECAY.NEXT_SEASON_RETENTION));
  });

  it('two years out has more decay than one year out', () => {
    const oneYear = calculateFuturePickDecay(200, 2027, 2026);
    const twoYears = calculateFuturePickDecay(200, 2028, 2026);
    expect(twoYears).toBeLessThan(oneYear);
  });

  it('three years out has more decay than two years out', () => {
    const twoYears = calculateFuturePickDecay(200, 2028, 2026);
    const threeYears = calculateFuturePickDecay(200, 2029, 2026);
    expect(threeYears).toBeLessThan(twoYears);
  });

  it('2029 pick < 2026 pick for same base value', () => {
    const current = calculateFuturePickDecay(191, 2026, 2026);
    const future = calculateFuturePickDecay(191, 2029, 2026);
    expect(future).toBeLessThan(current);
  });

  it('applies floor: extremely distant picks do not drop below MIN_RETENTION', () => {
    const floor = calculateFuturePickDecay(200, 2040, 2026);
    expect(floor).toBeGreaterThanOrEqual(Math.round(200 * PICK_DECAY.MIN_RETENTION));
  });
});

describe('calculateFuturePickDecay — round ordering preserved after decay', () => {
  it('Round 1 remains more valuable than Round 3 after same future decay', () => {
    const r1 = calculateFuturePickDecay(175, 2028, 2026);
    const r3 = calculateFuturePickDecay(98, 2028, 2026);
    expect(r1).toBeGreaterThan(r3);
  });

  it('Round 2 decayed is still > Round 5 decayed (same years out)', () => {
    const r2 = calculateFuturePickDecay(135, 2028, 2026);
    const r5 = calculateFuturePickDecay(64, 2028, 2026);
    expect(r2).toBeGreaterThan(r5);
  });
});

describe('calculateFuturePickDecay — missing season defaults safely', () => {
  it('missing pickSeason returns base value unchanged', () => {
    const value = calculateFuturePickDecay(150, null, 2026);
    expect(value).toBe(150);
  });

  it('missing currentSeason returns base value unchanged', () => {
    const value = calculateFuturePickDecay(150, 2028, null);
    expect(value).toBe(150);
  });

  it('both missing returns base value unchanged', () => {
    const value = calculateFuturePickDecay(150, null, null);
    expect(value).toBe(150);
  });

  it('undefined currentSeason returns base value unchanged', () => {
    const value = calculateFuturePickDecay(150, 2028, undefined);
    expect(value).toBe(150);
  });

  it('non-finite pickSeason returns base value unchanged', () => {
    const value = calculateFuturePickDecay(150, NaN, 2026);
    expect(value).toBe(150);
  });

  it('zero base value returns 0', () => {
    expect(calculateFuturePickDecay(0, 2029, 2026)).toBe(0);
  });

  it('negative base value is clamped to 0', () => {
    expect(calculateFuturePickDecay(-50, 2026, 2026)).toBe(0);
  });
});

describe('calculateFuturePickDecay — configurable options', () => {
  it('custom nextSeasonRetention is applied', () => {
    const value = calculateFuturePickDecay(100, 2027, 2026, { nextSeasonRetention: 0.80 });
    expect(value).toBe(80);
  });

  it('custom minRetention floor is respected', () => {
    const value = calculateFuturePickDecay(100, 2040, 2026, { minRetention: 0.30 });
    expect(value).toBeGreaterThanOrEqual(30);
  });
});

// ── applyFuturePickDecayToPickValue ───────────────────────────────────────────

describe('applyFuturePickDecayToPickValue — reads season from pick object', () => {
  it('reads season field from pick', () => {
    const pick = makePick({ season: 2028 });
    const base = 191;
    const decayed = applyFuturePickDecayToPickValue(pick, base, 2026);
    const direct = calculateFuturePickDecay(base, 2028, 2026);
    expect(decayed).toBe(direct);
  });

  it('falls back to year field when season is absent', () => {
    const pick = { round: 1, year: 2028 };
    const base = 191;
    const decayed = applyFuturePickDecayToPickValue(pick, base, 2026);
    const direct = calculateFuturePickDecay(base, 2028, 2026);
    expect(decayed).toBe(direct);
  });

  it('returns base value when currentSeason is null', () => {
    const pick = makePick({ season: 2029 });
    expect(applyFuturePickDecayToPickValue(pick, 200, null)).toBe(200);
  });

  it('does NOT mutate the pick object', () => {
    const pick = makePick({ season: 2029 });
    const original = JSON.stringify(pick);
    applyFuturePickDecayToPickValue(pick, 200, 2026);
    expect(JSON.stringify(pick)).toBe(original);
  });
});

// ── evaluateMultiAssetPackageValue ────────────────────────────────────────────

describe('evaluateMultiAssetPackageValue — single asset', () => {
  it('single asset retains full value (1.0 retention)', () => {
    expect(evaluateMultiAssetPackageValue([200])).toBe(200);
  });

  it('single low-value asset retains full value', () => {
    expect(evaluateMultiAssetPackageValue([50])).toBe(50);
  });
});

describe('evaluateMultiAssetPackageValue — two assets', () => {
  it('second asset is penalized (< full value)', () => {
    const total = evaluateMultiAssetPackageValue([150, 150]);
    expect(total).toBeLessThan(300); // strict linear sum
    expect(total).toBeGreaterThan(150); // but still adds meaningful value
  });

  it('second asset uses RETENTION_BY_RANK[1] = 0.90', () => {
    const total = evaluateMultiAssetPackageValue([100, 100]);
    // 100 × 1.0 + 100 × 0.9 = 190
    expect(total).toBe(100 + Math.round(100 * PACKAGE_DR.RETENTION_BY_RANK[1]));
  });

  it('two strong assets are still valued meaningfully together', () => {
    const twoStrong = evaluateMultiAssetPackageValue([150, 150]);
    const oneElite = evaluateMultiAssetPackageValue([200]);
    // Two solid assets worth 150+150 should exceed a single 200-value asset
    expect(twoStrong).toBeGreaterThan(oneElite);
  });
});

describe('evaluateMultiAssetPackageValue — many low-value assets', () => {
  it('one elite asset beats many low-value assets', () => {
    // Five assets worth 50 each, diminishing returns applied
    const trashPile = evaluateMultiAssetPackageValue([50, 50, 50, 50, 50]);
    const elite = evaluateMultiAssetPackageValue([200]);
    expect(elite).toBeGreaterThan(trashPile);
  });

  it('four weak assets (40 each) do not match one strong asset (200)', () => {
    const weakPile = evaluateMultiAssetPackageValue([40, 40, 40, 40]);
    const strong = evaluateMultiAssetPackageValue([200]);
    expect(strong).toBeGreaterThan(weakPile);
  });

  it('third asset uses RETENTION_BY_RANK[2] = 0.72', () => {
    const total = evaluateMultiAssetPackageValue([100, 100, 100]);
    const expected = 100 + Math.round(100 * 0.90) + Math.round(100 * 0.72);
    expect(total).toBe(expected);
  });

  it('fourth+ assets use ADDITIONAL_ASSET_RETENTION = 0.55', () => {
    const total = evaluateMultiAssetPackageValue([100, 100, 100, 100]);
    const expected =
      100 +
      Math.round(100 * 0.90) +
      Math.round(100 * 0.72) +
      Math.round(100 * PACKAGE_DR.ADDITIONAL_ASSET_RETENTION);
    expect(total).toBe(expected);
  });
});

describe('evaluateMultiAssetPackageValue — sorting', () => {
  it('highest-value asset always gets full retention regardless of input order', () => {
    const ascending  = evaluateMultiAssetPackageValue([50, 200]);
    const descending = evaluateMultiAssetPackageValue([200, 50]);
    expect(ascending).toBe(descending);
  });

  it('three unordered assets give the same result when sorted vs unsorted input', () => {
    const a = evaluateMultiAssetPackageValue([30, 200, 100]);
    const b = evaluateMultiAssetPackageValue([200, 100, 30]);
    const c = evaluateMultiAssetPackageValue([100, 30, 200]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('evaluateMultiAssetPackageValue — edge cases', () => {
  it('empty array returns 0', () => {
    expect(evaluateMultiAssetPackageValue([])).toBe(0);
  });

  it('null returns 0', () => {
    expect(evaluateMultiAssetPackageValue(null)).toBe(0);
  });

  it('non-finite values are filtered out', () => {
    const total = evaluateMultiAssetPackageValue([100, NaN, Infinity, 50]);
    // Only 100 and 50 are finite; 100 × 1.0 + 50 × 0.90 = 145
    expect(total).toBe(100 + Math.round(50 * 0.90));
  });

  it('does NOT mutate the input array', () => {
    const values = [50, 200, 100];
    const original = [...values];
    evaluateMultiAssetPackageValue(values);
    expect(values).toEqual(original);
  });
});

// ── calculateTotalPackageScore ────────────────────────────────────────────────

describe('calculateTotalPackageScore — mixed players and picks', () => {
  it('returns 0 for empty package', () => {
    expect(calculateTotalPackageScore({ players: [], picks: [], currentSeason: 2026 })).toBe(0);
  });

  it('single player returns full player value', () => {
    const player = makePlayerAsset({ valueScore: 200 });
    expect(calculateTotalPackageScore({ players: [player], picks: [], currentSeason: 2026 })).toBe(200);
  });

  it('applies pick decay to picks before diminishing returns', () => {
    const futurePick = makePickAsset({ season: 2029, valueScore: 191 });
    const score = calculateTotalPackageScore({ picks: [futurePick], currentSeason: 2026 });
    const decayedBase = calculateFuturePickDecay(191, 2029, 2026);
    // Single pick — no DR penalty, just decay
    expect(score).toBe(decayedBase);
  });

  it('current-year pick scores same as base (no decay)', () => {
    const currentPick = makePickAsset({ season: 2026, valueScore: 191 });
    const score = calculateTotalPackageScore({ picks: [currentPick], currentSeason: 2026 });
    expect(score).toBe(191);
  });

  it('player + pick package applies DR across combined sorted values', () => {
    const player = makePlayerAsset({ valueScore: 200 });
    const pick = makePickAsset({ season: 2026, valueScore: 100 });
    const score = calculateTotalPackageScore({
      players: [player],
      picks:   [pick],
      currentSeason: 2026,
    });
    // No pick decay (same season). DR: 200×1.0 + 100×0.90 = 290
    expect(score).toBe(200 + Math.round(100 * 0.90));
  });

  it('future pick is worth less than current-year pick of same round in package', () => {
    const currentPick = makePickAsset({ season: 2026, valueScore: 191 });
    const futurePick  = makePickAsset({ season: 2029, valueScore: 191 });
    const current = calculateTotalPackageScore({ picks: [currentPick], currentSeason: 2026 });
    const future  = calculateTotalPackageScore({ picks: [futurePick],  currentSeason: 2026 });
    expect(future).toBeLessThan(current);
  });

  it('does NOT mutate player or pick inputs', () => {
    const player = makePlayerAsset({ valueScore: 200 });
    const pick   = makePickAsset({ season: 2028, valueScore: 150 });
    const origPlayer = JSON.stringify(player);
    const origPick   = JSON.stringify(pick);
    calculateTotalPackageScore({ players: [player], picks: [pick], currentSeason: 2026 });
    expect(JSON.stringify(player)).toBe(origPlayer);
    expect(JSON.stringify(pick)).toBe(origPick);
  });

  it('missing currentSeason applies no pick decay', () => {
    const pick = makePickAsset({ season: 2030, valueScore: 100 });
    const withSeason    = calculateTotalPackageScore({ picks: [pick], currentSeason: 2026 });
    const withoutSeason = calculateTotalPackageScore({ picks: [pick], currentSeason: null });
    expect(withoutSeason).toBeGreaterThan(withSeason);
    expect(withoutSeason).toBe(100); // no decay, no DR penalty on single asset
  });
});

// ── explainPackageValueBreakdown ──────────────────────────────────────────────

describe('explainPackageValueBreakdown', () => {
  it('returns rawTotal as simple sum of all valueScores', () => {
    const assets = [
      makePlayerAsset({ valueScore: 200 }),
      makePickAsset({ season: 2028, valueScore: 100 }),
    ];
    const { rawTotal } = explainPackageValueBreakdown(assets, 2026);
    expect(rawTotal).toBe(300);
  });

  it('adjustedTotal is less than rawTotal for multi-asset package', () => {
    const assets = [
      makePlayerAsset({ valueScore: 200 }),
      makePickAsset({ season: 2028, valueScore: 150 }),
    ];
    const { rawTotal, adjustedTotal } = explainPackageValueBreakdown(assets, 2026);
    expect(adjustedTotal).toBeLessThan(rawTotal);
  });

  it('rank 0 asset has retention = 1.0 and no pick decay for current-season pick', () => {
    const assets = [makePickAsset({ season: 2026, valueScore: 200 })];
    const { assets: breakdown } = explainPackageValueBreakdown(assets, 2026);
    expect(breakdown[0].rank).toBe(0);
    expect(breakdown[0].retention).toBe(1.0);
    expect(breakdown[0].contribution).toBe(200);
  });

  it('future pick shows decayed value before DR is applied', () => {
    const assets = [makePickAsset({ season: 2029, valueScore: 200 })];
    const { assets: breakdown } = explainPackageValueBreakdown(assets, 2026);
    const expectedDecayed = calculateFuturePickDecay(200, 2029, 2026);
    expect(breakdown[0].decayedValue).toBe(expectedDecayed);
  });

  it('does NOT mutate input asset objects', () => {
    const asset = makePlayerAsset({ valueScore: 200 });
    const original = JSON.stringify(asset);
    explainPackageValueBreakdown([asset], 2026);
    expect(JSON.stringify(asset)).toBe(original);
  });

  it('empty assets array returns rawTotal 0 and adjustedTotal 0', () => {
    const { rawTotal, adjustedTotal } = explainPackageValueBreakdown([], 2026);
    expect(rawTotal).toBe(0);
    expect(adjustedTotal).toBe(0);
  });
});

// ── Integration-level assertions ──────────────────────────────────────────────

describe('broad trade valuation invariants', () => {
  it('future 1st-round pick < current 1st-round pick (same base value)', () => {
    const base = 191;
    const current = calculateFuturePickDecay(base, 2026, 2026);
    const future  = calculateFuturePickDecay(base, 2029, 2026);
    expect(future).toBeLessThan(current);
  });

  it('five weak assets have diminishing total value (not linear sum)', () => {
    const linear = 5 * 50;
    const diminished = evaluateMultiAssetPackageValue([50, 50, 50, 50, 50]);
    expect(diminished).toBeLessThan(linear);
  });

  it('one elite asset (200) beats a trash pile of five 40-value assets', () => {
    const elite     = evaluateMultiAssetPackageValue([200]);
    const trashPile = evaluateMultiAssetPackageValue([40, 40, 40, 40, 40]);
    expect(elite).toBeGreaterThan(trashPile);
  });

  it('two strong assets (150 each) remain meaningfully valued together', () => {
    const twoStrong = evaluateMultiAssetPackageValue([150, 150]);
    // Should be well above 150 (both assets contribute meaningfully)
    expect(twoStrong).toBeGreaterThan(200);
  });

  it('pick decay: 2029 pick is worth less than 2026 pick (same round, base 191)', () => {
    const current2026 = applyFuturePickDecayToPickValue({ season: 2026 }, 191, 2026);
    const future2029  = applyFuturePickDecayToPickValue({ season: 2029 }, 191, 2026);
    expect(future2029).toBeLessThan(current2026);
  });

  it('round 1 pick stays more valuable than round 3 pick even after 2-year decay', () => {
    const r1 = calculateFuturePickDecay(175, 2028, 2026);
    const r3 = calculateFuturePickDecay(98,  2028, 2026);
    expect(r1).toBeGreaterThan(r3);
  });
});

// ── Constants are exported and stable ────────────────────────────────────────

describe('exported constants', () => {
  it('PICK_DECAY has expected keys', () => {
    expect(PICK_DECAY).toHaveProperty('SAME_SEASON_RETENTION');
    expect(PICK_DECAY).toHaveProperty('NEXT_SEASON_RETENTION');
    expect(PICK_DECAY).toHaveProperty('PER_YEAR_DECAY_RATE');
    expect(PICK_DECAY).toHaveProperty('MIN_RETENTION');
  });

  it('PACKAGE_DR has expected keys', () => {
    expect(PACKAGE_DR).toHaveProperty('RETENTION_BY_RANK');
    expect(PACKAGE_DR).toHaveProperty('ADDITIONAL_ASSET_RETENTION');
  });

  it('PICK_DECAY values are in (0, 1] range', () => {
    expect(PICK_DECAY.SAME_SEASON_RETENTION).toBe(1.0);
    expect(PICK_DECAY.NEXT_SEASON_RETENTION).toBeGreaterThan(0);
    expect(PICK_DECAY.NEXT_SEASON_RETENTION).toBeLessThanOrEqual(1);
    expect(PICK_DECAY.MIN_RETENTION).toBeGreaterThan(0);
    expect(PICK_DECAY.MIN_RETENTION).toBeLessThan(1);
  });

  it('PACKAGE_DR retention values decrease by rank', () => {
    const ranks = PACKAGE_DR.RETENTION_BY_RANK;
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThan(ranks[i - 1]);
    }
    expect(PACKAGE_DR.ADDITIONAL_ASSET_RETENTION).toBeLessThanOrEqual(ranks[ranks.length - 1]);
  });
});


describe('unified pick value matrix', () => {
  it('preserves descending round ordering and default fallback', () => {
    expect(DEFAULT_PICK_VALUE_MATRIX[1]).toBeGreaterThan(DEFAULT_PICK_VALUE_MATRIX[2]);
    expect(DEFAULT_PICK_VALUE_MATRIX[2]).toBeGreaterThan(DEFAULT_PICK_VALUE_MATRIX[3]);
    expect(getPickBaseValueFromMatrix(99)).toBe(DEFAULT_PICK_VALUE_MATRIX.default);
  });
});
