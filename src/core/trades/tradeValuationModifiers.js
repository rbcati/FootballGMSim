/**
 * Trade valuation modifier helpers.
 * Pure/stateless — no I/O, no cache access, no mutations.
 *
 * Provides two independent mechanisms:
 *  1. Future pick decay   — picks farther in the future are discounted.
 *  2. Multi-asset diminishing returns — packages of many low-value assets
 *     cannot easily equal one elite asset.
 *
 * Integration: used by tradeFinderAnalysis.js for scoring/ranking only.
 * These helpers do NOT affect trade finalization, ownership transfer,
 * or worker transaction paths.
 */

// ── Pick Decay Constants ──────────────────────────────────────────────────────

/**
 * Retention factors applied to base pick value per years into the future.
 *
 *   yearsOut = 0   → 100% (current-season or past picks)
 *   yearsOut = 1   →  92% (next season)
 *   yearsOut = 2   →  80% (92% − 12%)
 *   yearsOut = 3   →  68%
 *   yearsOut = 4   →  56%
 *   yearsOut ≥ 5   →  45% (floor — picks never drop below this)
 *
 * All values are configurable via the `options` argument.
 */
export const PICK_DECAY = Object.freeze({
  SAME_SEASON_RETENTION: 1.0,
  NEXT_SEASON_RETENTION: 0.92,
  PER_YEAR_DECAY_RATE: 0.12,
  MIN_RETENTION: 0.45,
});

// ── Package Diminishing Returns Constants ─────────────────────────────────────

/**
 * Retention applied to each asset in a package, sorted by value descending
 * so the highest-value asset always retains its full value.
 *
 *   rank 0 (highest value): 100%
 *   rank 1:  90%
 *   rank 2:  72%
 *   rank 3+: 55%
 *
 * Example — 5 assets worth 50 each:
 *   50×1.00 + 50×0.90 + 50×0.72 + 50×0.55 + 50×0.55 = 186
 *   vs one elite asset worth 200 → elite clearly wins.
 *
 * Example — 2 solid assets worth 150 each:
 *   150×1.00 + 150×0.90 = 285
 *   → legitimate two-asset packages retain meaningful combined value.
 */
export const PACKAGE_DR = Object.freeze({
  RETENTION_BY_RANK: Object.freeze([1.0, 0.90, 0.72]),
  ADDITIONAL_ASSET_RETENTION: 0.55,
});

// ── Pick Decay Helpers ────────────────────────────────────────────────────────

/**
 * Calculate the decayed value for a draft pick based on how far in the future
 * it falls relative to the current game season.
 *
 * Safe defaults:
 *   - If either `pickSeason` or `currentSeason` is missing or non-finite,
 *     the function returns `basePickValue` unchanged (no decay).
 *   - Picks from the current season or earlier retain full value.
 *
 * @param {number}      basePickValue  – raw base value of the pick (e.g. from round table)
 * @param {number|null} pickSeason     – draft year of the pick (e.g. 2028)
 * @param {number|null} currentSeason  – current game season (e.g. 2026)
 * @param {object}      options        – optional overrides for PICK_DECAY constants
 * @returns {number} decayed value, rounded to nearest integer
 */
export function calculateFuturePickDecay(basePickValue, pickSeason, currentSeason, options = {}) {
  const {
    sameSeasonRetention = PICK_DECAY.SAME_SEASON_RETENTION,
    nextSeasonRetention = PICK_DECAY.NEXT_SEASON_RETENTION,
    perYearDecayRate    = PICK_DECAY.PER_YEAR_DECAY_RATE,
    minRetention        = PICK_DECAY.MIN_RETENTION,
  } = options;

  const base = Number(basePickValue);
  if (!Number.isFinite(base) || base <= 0) return Math.max(0, base || 0);

  // Missing season data → no decay (safe, deterministic default).
  // Explicit null/undefined check before Number() since Number(null) === 0 (finite).
  if (pickSeason == null || currentSeason == null
      || !Number.isFinite(Number(pickSeason)) || !Number.isFinite(Number(currentSeason))) {
    return base;
  }

  const yearsOut = Number(pickSeason) - Number(currentSeason);

  if (yearsOut <= 0) return Math.round(base * sameSeasonRetention);
  if (yearsOut === 1) return Math.round(base * nextSeasonRetention);

  // Beyond year 1: each additional year adds another perYearDecayRate discount
  const additionalDecay = perYearDecayRate * (yearsOut - 1);
  const retention = Math.max(minRetention, nextSeasonRetention - additionalDecay);
  return Math.round(base * retention);
}

/**
 * Convenience wrapper: apply future pick decay to a pick object's base value.
 * Reads the pick's season from `pick.season` (canonical) or `pick.year` (legacy).
 *
 * Does NOT mutate the pick object.
 *
 * @param {object}      pick          – pick object with season/year field
 * @param {number}      baseValue     – base value before decay
 * @param {number|null} currentSeason – current game season
 * @param {object}      options       – optional overrides for PICK_DECAY constants
 * @returns {number} decayed value
 */
export function applyFuturePickDecayToPickValue(pick, baseValue, currentSeason, options = {}) {
  const pickSeason = pick?.season ?? pick?.year;
  return calculateFuturePickDecay(baseValue, pickSeason, currentSeason, options);
}

// ── Package Diminishing Returns ───────────────────────────────────────────────

/**
 * Calculate total package value with diminishing returns applied.
 *
 * The highest-value asset retains full value; each subsequent asset (sorted
 * descending) contributes progressively less.  A single-asset package is
 * unaffected (first asset always retains 100%).
 *
 * Does NOT mutate the input array.
 *
 * @param {number[]} assetValues – array of individual asset values (order does not matter)
 * @param {object}   options     – optional overrides for PACKAGE_DR constants
 * @returns {number} total adjusted package value
 */
export function evaluateMultiAssetPackageValue(assetValues, options = {}) {
  const {
    retentionByRank         = PACKAGE_DR.RETENTION_BY_RANK,
    additionalAssetRetention = PACKAGE_DR.ADDITIONAL_ASSET_RETENTION,
  } = options;

  if (!Array.isArray(assetValues) || assetValues.length === 0) return 0;

  const sorted = assetValues
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  if (sorted.length === 0) return 0;

  return sorted.reduce((total, value, idx) => {
    const retention = retentionByRank[idx] ?? additionalAssetRetention;
    return total + Math.round(value * retention);
  }, 0);
}

/**
 * Calculate total package score for a mixed set of player and pick assets,
 * applying pick decay then diminishing returns across all assets.
 *
 * Does NOT mutate any input objects.
 *
 * @param {object}   params
 * @param {object[]} params.players       – player asset objects (each has valueScore)
 * @param {object[]} params.picks         – pick asset objects (each has valueScore + season/year)
 * @param {number|null} params.currentSeason – current game season for pick decay
 * @param {object}   params.valueLookups  – { getPlayerValue?, getPickBaseValue? } overrides
 * @param {object}   params.options       – optional overrides for decay/DR constants
 * @returns {number}
 */
export function calculateTotalPackageScore({
  players = [],
  picks   = [],
  currentSeason = null,
  valueLookups  = {},
  options = {},
} = {}) {
  const {
    getPlayerValue   = (p) => Number(p?.valueScore ?? 0),
    getPickBaseValue = (p) => Number(p?.valueScore ?? 0),
  } = valueLookups;

  const playerValues = players.map(getPlayerValue).filter(Number.isFinite);

  const pickValues = picks.map((pick) => {
    const base = getPickBaseValue(pick);
    return applyFuturePickDecayToPickValue(pick, base, currentSeason, options);
  });

  return evaluateMultiAssetPackageValue([...playerValues, ...pickValues], options);
}

/**
 * Return a verbose breakdown for tests and debugging.
 * Shows per-asset decay, rank-based retention, and final contribution.
 *
 * Does NOT mutate any input objects.
 *
 * @param {object[]}    assets        – mixed player/pick assets (each has assetType + valueScore)
 * @param {number|null} currentSeason
 * @param {object}      options
 * @returns {{ assets: object[], rawTotal: number, adjustedTotal: number }}
 */
export function explainPackageValueBreakdown(assets = [], currentSeason = null, options = {}) {
  const {
    retentionByRank         = PACKAGE_DR.RETENTION_BY_RANK,
    additionalAssetRetention = PACKAGE_DR.ADDITIONAL_ASSET_RETENTION,
  } = options;

  const withDecay = assets.map((a) => {
    const base = Number(a?.valueScore ?? 0);
    const decayedValue = a?.assetType === 'pick'
      ? applyFuturePickDecayToPickValue(a, base, currentSeason, options)
      : base;
    return { ...a, decayedValue };
  });

  const sorted = [...withDecay].sort((a, b) => b.decayedValue - a.decayedValue);

  const rawTotal = assets.reduce((s, a) => s + Number(a?.valueScore ?? 0), 0);
  let adjustedTotal = 0;

  const breakdown = sorted.map((a, idx) => {
    const retention = retentionByRank[idx] ?? additionalAssetRetention;
    const contribution = Math.round(a.decayedValue * retention);
    adjustedTotal += contribution;
    return { ...a, rank: idx, retention, contribution };
  });

  return { assets: breakdown, rawTotal, adjustedTotal };
}
