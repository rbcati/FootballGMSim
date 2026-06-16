/**
 * statLeaderboard.js — All-Time Career Stat Leaderboards
 *
 * Pure module. No side effects. No imports from worker, UI, news, morale,
 * holdout, coaching, or sim. No Math.random. Fully deterministic.
 *
 * Data sources:
 *  - meta.hofRoster[].careerStats  — snapshots at HOF induction time
 *  - activePlayers                 — live player objects for non-inducted players
 *
 * Exported API:
 *   TRACKED_STATS
 *   buildLeaderboard(hofRoster, activePlayers, statKey)  → LeaderboardEntry[]
 *   buildAllLeaderboards(hofRoster, activePlayers)       → { [statKey]: LeaderboardEntry[] }
 *   getPlayerAllTimeRank(playerId, hofRoster, activePlayers, statKey) → number | null
 */

// ── Tracked stat definitions ──────────────────────────────────────────────────

export const TRACKED_STATS = Object.freeze([
  { key: 'passTd',  label: 'Career Pass TDs',      positions: ['QB'] },
  { key: 'passYd',  label: 'Career Pass Yards',     positions: ['QB'] },
  { key: 'rushTd',  label: 'Career Rush TDs',       positions: ['RB', 'FB'] },
  { key: 'rushYd',  label: 'Career Rush Yards',     positions: ['RB', 'FB'] },
  { key: 'recTd',   label: 'Career Rec TDs',        positions: ['WR', 'TE'] },
  { key: 'recYd',   label: 'Career Rec Yards',      positions: ['WR', 'TE'] },
  { key: 'sacks',   label: 'Career Sacks',          positions: ['DL', 'LB'] },
  { key: 'int',     label: 'Career Interceptions',  positions: ['DB', 'LB'] },
]);

// ── Field aliases — logical key → candidate field names in stat objects ───────
// Handles mixed casing found in player.careerStats season rows and HOF snapshots.

const STAT_ALIASES = Object.freeze({
  passTd: ['passTD', 'passTd', 'passTDs'],
  passYd: ['passYd', 'passYds'],
  rushTd: ['rushTD', 'rushTd', 'rushTDs'],
  rushYd: ['rushYd', 'rushYds'],
  recTd:  ['recTD',  'recTd',  'recTDs'],
  recYd:  ['recYd',  'recYds'],
  sacks:  ['sacks'],
  int:    ['interceptions', 'defInts', 'int', 'defInterceptions'],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Read a single stat value from a flat stat object using field aliases. */
function readStat(obj, statKey) {
  if (!obj || typeof obj !== 'object') return 0;
  const aliases = STAT_ALIASES[statKey];
  if (!aliases) return 0;
  for (const field of aliases) {
    const v = obj[field];
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/** Aggregate a stat across a player's careerStats array (per-season rows). */
function aggregatePlayerStat(player, statKey) {
  const lines = Array.isArray(player?.careerStats) ? player.careerStats : [];
  return lines.reduce((sum, s) => sum + readStat(s, statKey), 0);
}

/**
 * Check whether a position string matches the stat's position list.
 * Handles normalized HOF positions (DL, LB, CB, S) and raw positions
 * (DE, DT, MLB, OLB, SS, FS, FB).
 */
function positionMatchesStat(rawPos, statPositions) {
  const p = String(rawPos ?? '').toUpperCase();
  if (statPositions.includes(p)) return true;
  // DB: covers CB, S, SS, FS
  if (statPositions.includes('DB') && ['CB', 'S', 'SS', 'FS', 'DB'].includes(p)) return true;
  // DL aliases
  if (statPositions.includes('DL') && ['DE', 'DT', 'EDGE', 'NT'].includes(p)) return true;
  // LB aliases
  if (statPositions.includes('LB') && ['MLB', 'OLB'].includes(p)) return true;
  // RB covers FB for rush stats
  if (statPositions.includes('RB') && p === 'FB') return true;
  return false;
}

/** Resolve a display team label from a HOF roster entry's teamIds array. */
function hofTeamLabel(entry) {
  const ids = Array.isArray(entry?.teamIds) ? entry.teamIds.filter(Boolean) : [];
  if (!ids.length) return '';
  return ids.length === 1 ? ids[0] : ids[ids.length - 1];
}

// ── buildLeaderboard ──────────────────────────────────────────────────────────

/**
 * Build the top-10 career leaderboard for a single stat category.
 *
 * Merge strategy:
 *  1. HOF roster entries (careerStats snapshot at induction)
 *  2. Active / non-inducted players (aggregate from careerStats array)
 *  3. Deduplicate by playerId — HOF entry takes precedence
 *  4. Sort descending; stable tiebreaker by playerId string
 *  5. Return top 10 with rank numbers
 *
 * @param {Array}  hofRoster      — meta.hofRoster entries
 * @param {Array}  activePlayers  — all live player objects (may include retired)
 * @param {string} statKey        — one of TRACKED_STATS[].key
 * @returns {Array<LeaderboardEntry>}
 */
export function buildLeaderboard(hofRoster, activePlayers, statKey) {
  const statDef = TRACKED_STATS.find((s) => s.key === statKey);
  if (!statDef) return [];

  const { positions } = statDef;
  const seen = new Set();
  const entries = [];

  // 1. HOF inductees — use the careerStats snapshot stored at induction
  const hofArr = Array.isArray(hofRoster) ? hofRoster : [];
  for (const entry of hofArr) {
    const pid = String(entry?.playerId ?? '');
    if (!pid) continue;
    if (!positionMatchesStat(entry?.position, positions)) continue;

    const value = readStat(entry?.careerStats, statKey);
    seen.add(pid);
    entries.push({
      playerId:     pid,
      playerName:   entry.playerName ?? '',
      position:     entry.position ?? '',
      teamName:     hofTeamLabel(entry),
      value,
      isActive:     false,
      isInducted:   true,
      isHofNominee: false,
    });
  }

  // 2. Active / non-inducted players
  const activeArr = Array.isArray(activePlayers) ? activePlayers : [];
  for (const player of activeArr) {
    const pid = String(player?.id ?? '');
    if (!pid) continue;
    if (seen.has(pid)) continue; // HOF entry already covers this player
    if (!positionMatchesStat(player?.pos, positions)) continue;

    const value = aggregatePlayerStat(player, statKey);
    seen.add(pid);

    const hofStatus = player?.hofStatus ?? 'none';
    entries.push({
      playerId:     pid,
      playerName:   player.name ?? '',
      position:     player.pos ?? '',
      teamName:     player.teamName ?? player.teamAbbr ?? String(player.teamId ?? ''),
      value,
      isActive:     player.status !== 'retired',
      isInducted:   hofStatus === 'inducted',
      isHofNominee: hofStatus === 'nominee',
    });
  }

  // 3. Sort descending; stable tiebreaker by playerId string ascending
  entries.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return String(a.playerId).localeCompare(String(b.playerId));
  });

  // 4. Top 10 with rank
  return entries.slice(0, 10).map((e, i) => ({ rank: i + 1, ...e }));
}

// ── buildAllLeaderboards ──────────────────────────────────────────────────────

/**
 * Build leaderboards for every TRACKED_STATS entry.
 *
 * @param {Array} hofRoster      — meta.hofRoster
 * @param {Array} activePlayers  — all player objects
 * @returns {{ [statKey]: LeaderboardEntry[] }}
 */
export function buildAllLeaderboards(hofRoster, activePlayers) {
  const result = {};
  for (const stat of TRACKED_STATS) {
    result[stat.key] = buildLeaderboard(hofRoster, activePlayers, stat.key);
  }
  return result;
}

// ── getPlayerAllTimeRank ──────────────────────────────────────────────────────

/**
 * Return the all-time rank (1-based) of a player for a given stat, or null
 * if the player does not appear in the top 10.
 *
 * @param {string|number} playerId
 * @param {Array}  hofRoster
 * @param {Array}  activePlayers
 * @param {string} statKey
 * @returns {number|null}
 */
export function getPlayerAllTimeRank(playerId, hofRoster, activePlayers, statKey) {
  const pid = String(playerId ?? '');
  if (!pid) return null;
  const board = buildLeaderboard(hofRoster, activePlayers, statKey);
  const entry = board.find((e) => String(e.playerId) === pid);
  return entry ? entry.rank : null;
}
