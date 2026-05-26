// buildPlayerAdvancedStatsView is the public view-model getter for UI rendering.
// Internally we use a leaner aggregation to keep the hot filter loop tight (O(N) goal).
export { buildPlayerAdvancedStatsView } from './playerAdvancedStatsViewModel.js';

const ADVANCED_STAT_KEYS = [
  'targets',
  'drops',
  'battedPasses',
  'coverageTargets',
  'coverageCompletionsAllowed',
  'receptionsAllowed',
  'sacksAllowed',
  'sacksMade',
];

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

function emptyStats() {
  const s = {};
  for (const k of ADVANCED_STAT_KEYS) s[k] = 0;
  return s;
}

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
 * Falls back to all-zero stats when the player or season is absent (sparse saves, rookies).
 */
function getSeasonStats(playerId, archive, season) {
  const pid = String(playerId ?? '');
  const playerYears = archive[pid];
  if (!playerYears || typeof playerYears !== 'object') return emptyStats();
  const raw = playerYears[String(season)];
  if (!raw || typeof raw !== 'object') return emptyStats();
  const out = emptyStats();
  for (const k of ADVANCED_STAT_KEYS) out[k] = safeNum(raw[k]);
  return out;
}

// Internal keys on the sparse store that are not season buckets.
const INTERNAL_KEYS = new Set(['__meta', 'meta', 'archivedGameIds']);

/**
 * Aggregate all seasons into career totals directly from the archive.
 * Avoids the overhead of buildPlayerAdvancedStatsView (seasons array, sort, spread),
 * which matters when scanning 2,000+ players in the filter loop.
 * Falls back to all-zero stats for players absent from the archive.
 */
function getCareerStats(playerId, archive) {
  const pid = String(playerId ?? '');
  const playerYears = archive[pid];
  if (!playerYears || typeof playerYears !== 'object') return emptyStats();

  const career = emptyStats();
  // eslint-disable-next-line guard-for-in
  for (const key in playerYears) {
    if (INTERNAL_KEYS.has(key)) continue;
    const y = playerYears[key];
    if (!y || typeof y !== 'object') continue;
    career.targets                    += safeNum(y.targets);
    career.drops                      += safeNum(y.drops);
    career.battedPasses               += safeNum(y.battedPasses);
    career.coverageTargets            += safeNum(y.coverageTargets);
    career.coverageCompletionsAllowed += safeNum(y.coverageCompletionsAllowed);
    career.receptionsAllowed          += safeNum(y.receptionsAllowed);
    career.sacksAllowed               += safeNum(y.sacksAllowed);
    career.sacksMade                  += safeNum(y.sacksMade);
  }
  return career;
}

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
