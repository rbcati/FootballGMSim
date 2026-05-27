// buildPlayerAdvancedStatsView is the public view-model getter for UI rendering.
// Internally we use a leaner aggregation to keep the hot filter loop tight (O(N) goal).
export { buildPlayerAdvancedStatsView } from './playerAdvancedStatsViewModel.js';

// Maps each public criteria key → [archiveStatKey, comparison operator]
const CRITERIA_MAP = {
  minTargets:                    ['targets',                    '>='],
  maxTargets:                    ['targets',                    '<='],
  minDrops:                      ['drops',                      '>='],
  maxDrops:                      ['drops',                      '<='],
  minBattedPasses:               ['battedPasses',               '>='],
  maxBattedPasses:               ['battedPasses',               '<='],
  minCoverageTargets:            ['coverageTargets',            '>='],
  maxCoverageTargets:            ['coverageTargets',            '<='],
  minReceptionsAllowed:          ['receptionsAllowed',          '>='],
  maxReceptionsAllowed:          ['receptionsAllowed',          '<='],
  minSacksAllowed:               ['sacksAllowed',               '>='],
  maxSacksAllowed:               ['sacksAllowed',               '<='],
  minSacksMade:                  ['sacksMade',                  '>='],
  maxSacksMade:                  ['sacksMade',                  '<='],
  minCoverageCompletionsAllowed: ['coverageCompletionsAllowed', '>='],
  maxCoverageCompletionsAllowed: ['coverageCompletionsAllowed', '<='],
};

/** All supported criteria keys, exported for form generation. */
export const CRITERIA_KEYS = Object.keys(CRITERIA_MAP);

/**
 * Shared frozen sentinel returned for players absent from the archive.
 * Reusing a single object avoids per-player heap allocation on the miss path,
 * which keeps the hot filter loop lean when scanning large rosters (2 000+ players).
 */
const EMPTY_STATS = Object.freeze({
  targets: 0, drops: 0, battedPasses: 0,
  coverageTargets: 0, coverageCompletionsAllowed: 0,
  receptionsAllowed: 0, sacksAllowed: 0, sacksMade: 0,
});

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convert raw criteria object into a pre-compiled array of threshold checks.
 * Only entries with finite numeric values are included, keeping the hot loop tight.
 */
function compileThresholds(criteria) {
  const thresholds = [];
  for (const [criterionKey, [statKey, op]] of Object.entries(CRITERIA_MAP)) {
    const val = criteria[criterionKey];
    if (val == null || val === '') continue;
    const threshold = Number(val);
    if (!Number.isFinite(threshold)) continue;
    thresholds.push({ statKey, op, threshold });
  }
  return thresholds;
}

/**
 * Read a single season's advanced stats for a player without mutating the archive.
 *
 * Returns the raw archive entry directly — passesThresholds reads via `?? 0` so
 * any keys absent from a sparse entry safely default to zero without a copy-out
 * allocation. Falls back to the shared EMPTY_STATS sentinel (no heap allocation)
 * when the player or requested season is missing from the archive.
 */
function getSeasonStats(playerId, archive, season) {
  const pid = String(playerId ?? '');
  const playerYears = archive[pid];
  if (!playerYears || typeof playerYears !== 'object') return EMPTY_STATS;
  const raw = playerYears[String(season)];
  if (!raw || typeof raw !== 'object') return EMPTY_STATS;
  // Return the raw archive entry directly — passesThresholds uses `?? 0` for
  // any missing stat keys, so no intermediate copy object is needed.
  return raw;
}

// Internal keys on the sparse store that are not season buckets.
const INTERNAL_KEYS = new Set(['__meta', 'meta', 'archivedGameIds']);

/**
 * Aggregate all seasons into career totals directly from the archive.
 * Avoids the overhead of buildPlayerAdvancedStatsView (seasons array, sort, spread),
 * which matters when scanning 2,000+ players in the filter loop.
 *
 * Uses local numeric variables for accumulation (registers/stack rather than
 * repeated object property writes) and constructs the result object only once at
 * the end — a meaningful win in V8's JIT-optimised hot path.
 *
 * Falls back to the shared EMPTY_STATS sentinel for players absent from the archive
 * (no heap allocation on the miss path).
 */
function getCareerStats(playerId, archive) {
  const pid = String(playerId ?? '');
  const playerYears = archive[pid];
  if (!playerYears || typeof playerYears !== 'object') return EMPTY_STATS;

  // Accumulate into local numeric variables; object is constructed once at the end.
  let targets = 0, drops = 0, battedPasses = 0, coverageTargets = 0,
      coverageCompletionsAllowed = 0, receptionsAllowed = 0, sacksAllowed = 0, sacksMade = 0;

  // eslint-disable-next-line guard-for-in
  for (const key in playerYears) {
    if (INTERNAL_KEYS.has(key)) continue;
    const y = playerYears[key];
    if (!y || typeof y !== 'object') continue;
    targets                    += safeNum(y.targets);
    drops                      += safeNum(y.drops);
    battedPasses               += safeNum(y.battedPasses);
    coverageTargets            += safeNum(y.coverageTargets);
    coverageCompletionsAllowed += safeNum(y.coverageCompletionsAllowed);
    receptionsAllowed          += safeNum(y.receptionsAllowed);
    sacksAllowed               += safeNum(y.sacksAllowed);
    sacksMade                  += safeNum(y.sacksMade);
  }

  return { targets, drops, battedPasses, coverageTargets,
           coverageCompletionsAllowed, receptionsAllowed, sacksAllowed, sacksMade };
}

/**
 * Check a stats object (or raw archive entry) against the compiled threshold list.
 * Uses `?? 0` to handle undefined keys from sparse raw entries without extra allocation.
 */
function passesThresholds(stats, thresholds) {
  for (const { statKey, op, threshold } of thresholds) {
    const val = stats[statKey] ?? 0;
    if (op === '>=' && val < threshold) return false;
    if (op === '<=' && val > threshold) return false;
  }
  return true;
}

/**
 * Filter a player pool using advanced stat thresholds from the sparse archive.
 *
 * Time complexity: O(N) where N = players.length.
 * Each player is visited once; per-player season aggregation is bounded by
 * career length (S ≤ ~25 seasons), making it effectively constant per player.
 *
 * The archive is never mutated — all reads are purely structural.
 *
 * @param {any[]} players  Player objects. Each must have an `id` or `playerId` field.
 * @param {object} archive Sparse advanced-stats store: { [playerId]: { [year]: AdvancedStats } }
 * @param {object} [criteria] Filter criteria object. Supported keys:
 *   - seasonMode: 'career' (default) | 'season'
 *   - season: string or number — used when seasonMode = 'season'
 *   - minTargets, maxTargets, minDrops, maxDrops
 *   - minBattedPasses, maxBattedPasses
 *   - minCoverageTargets, maxCoverageTargets
 *   - minReceptionsAllowed, maxReceptionsAllowed
 *   - minSacksAllowed, maxSacksAllowed
 *   - minSacksMade, maxSacksMade
 *   - minCoverageCompletionsAllowed, maxCoverageCompletionsAllowed
 * @returns {any[]} Filtered subset of the players array (new array, same object references).
 */
export function filterPlayerPool(players, archive, criteria = {}) {
  if (!Array.isArray(players)) return [];

  const safeArchive = archive && typeof archive === 'object' ? archive : {};
  const thresholds = compileThresholds(criteria);

  // No active thresholds — return original array reference unchanged.
  if (thresholds.length === 0) return players;

  const seasonMode = criteria.seasonMode ?? 'career';
  const season = criteria.season;
  const useSeasonMode = seasonMode === 'season' && season != null && season !== '';

  const result = [];
  for (const player of players) {
    if (player == null) continue;
    const playerId = player.id ?? player.playerId;
    const stats = useSeasonMode
      ? getSeasonStats(playerId, safeArchive, season)
      : getCareerStats(playerId, safeArchive);
    if (passesThresholds(stats, thresholds)) result.push(player);
  }
  return result;
}
