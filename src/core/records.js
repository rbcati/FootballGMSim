/**
 * records.js — Record Book Engine
 *
 * Tracks single-season and all-time career records for key stat categories.
 * Designed to run at the end of every season during archiveSeason() without
 * blocking the worker thread (all operations are synchronous O(n) scans).
 *
 * Record categories tracked:
 *   Passing Yds, Rushing Yds, Receiving Yds, Passing TDs, Sacks
 *
 * Data shape stored in meta.records:
 *   {
 *     singleSeason: {
 *       passYd:  { playerId, name, pos, team, value, year },
 *       rushYd:  { playerId, name, pos, team, value, year },
 *       recYd:   { playerId, name, pos, team, value, year },
 *       passTD:  { playerId, name, pos, team, value, year },
 *       sacks:   { playerId, name, pos, team, value, year },
 *     },
 *     allTime: {
 *       passYd:  { playerId, name, pos, team, value, lastYear },
 *       rushYd:  { playerId, name, pos, team, value, lastYear },
 *       recYd:   { playerId, name, pos, team, value, lastYear },
 *       passTD:  { playerId, name, pos, team, value, lastYear },
 *       sacks:   { playerId, name, pos, team, value, lastYear },
 *     },
 *     history: []  // chronological log of broken records
 *   }
 */

import { getCareerStats } from './recordBookV1.js';

// Maps this engine's category statKey → the canonical RECORD_KEYS key returned
// by the shared getCareerStats aggregator (recordBookV1.js).
const CATEGORY_TO_RECORD_KEY = {
  passYd: 'passingYards',
  rushYd: 'rushingYards',
  recYd: 'receivingYards',
  passTD: 'passingTD',
  sacks: 'sacks',
};

const RECORD_CATEGORIES = [
  { key: 'passYd', label: 'Passing Yards',    statKey: 'passYd' },
  { key: 'rushYd', label: 'Rushing Yards',    statKey: 'rushYd' },
  { key: 'recYd',  label: 'Receiving Yards',  statKey: 'recYd' },
  { key: 'passTD', label: 'Passing Touchdowns', statKey: 'passTD' },
  { key: 'sacks',  label: 'Sacks',            statKey: 'sacks' },
];

export { RECORD_CATEGORIES };

/**
 * Returns a blank records object for initializing new leagues or
 * migrating saves that don't have record data yet.
 */
export function createEmptyRecords() {
  const blank = () => ({ playerId: null, name: null, pos: null, team: null, value: 0, year: null });
  const singleSeason = {};
  const allTime = {};
  for (const cat of RECORD_CATEGORIES) {
    singleSeason[cat.key] = blank();
    allTime[cat.key] = blank();
  }
  return { singleSeason, allTime, history: [] };
}

/**
 * Process end-of-season records.
 *
 * @param {Object}   existingRecords - Current records from meta (or null for first season)
 * @param {Object[]} seasonStats     - Array of { playerId, name, pos, teamId, totals: {} }
 * @param {Object[]} allPlayers      - All active players (for career totals from careerStats)
 * @param {number}   year            - The season year
 * @param {Object}   teamAbbrMap     - Map of teamId → abbreviation
 * @returns {{ records: Object, broken: Object[] }} Updated records and list of newly broken records
 */
export function processSeasonRecords(existingRecords, seasonStats, allPlayers, year, teamAbbrMap, leagueHistory = []) {
  const records = existingRecords ? structuredClone(existingRecords) : createEmptyRecords();
  if (!records.history) records.history = [];
  const broken = [];

  // ── Single-Season Records ─────────────────────────────────────────────────
  for (const cat of RECORD_CATEGORIES) {
    let best = null;
    let bestValue = 0;

    for (const s of seasonStats) {
      const val = s.totals?.[cat.statKey] ?? 0;
      if (val > bestValue) {
        bestValue = val;
        best = s;
      }
    }

    if (best && bestValue > (records.singleSeason[cat.key]?.value ?? 0)) {
      const prev = records.singleSeason[cat.key];
      records.singleSeason[cat.key] = {
        playerId: best.playerId,
        name: best.name,
        pos: best.pos,
        team: teamAbbrMap[best.teamId] ?? String(best.teamId ?? ''),
        value: bestValue,
        year,
      };
      broken.push({
        type: 'singleSeason',
        category: cat.key,
        label: cat.label,
        player: best.name,
        pos: best.pos,
        team: teamAbbrMap[best.teamId] ?? '',
        newValue: bestValue,
        oldValue: prev?.value ?? 0,
        oldPlayer: prev?.name ?? null,
        year,
      });
    }
  }

  // ── All-Time Career Records ───────────────────────────────────────────────
  // Career totals come from the single shared aggregator (getCareerStats), which
  // merges live careerStats with archive-only season lines — so an archive-only
  // player (no live careerStats) is no longer invisible to the all-time board.
  const careerTotalsCache = new Map();
  const totalsFor = (player) => {
    const id = player?.id ?? player?.playerId;
    if (id != null && careerTotalsCache.has(id)) return careerTotalsCache.get(id);
    const totals = getCareerStats(player, leagueHistory);
    if (id != null) careerTotalsCache.set(id, totals);
    return totals;
  };

  for (const cat of RECORD_CATEGORIES) {
    let best = null;
    let bestValue = 0;
    const recordKey = CATEGORY_TO_RECORD_KEY[cat.statKey] ?? cat.statKey;

    for (const player of allPlayers) {
      const totals = totalsFor(player);
      const careerTotal = Number(totals?.[recordKey] ?? 0);

      if (careerTotal > bestValue) {
        bestValue = careerTotal;
        best = player;
      }
    }

    if (best && bestValue > (records.allTime[cat.key]?.value ?? 0)) {
      const prev = records.allTime[cat.key];
      const primaryTeam = getMostPlayedTeam(best, teamAbbrMap);
      records.allTime[cat.key] = {
        playerId: best.id,
        name: best.name,
        pos: best.pos,
        team: primaryTeam,
        value: bestValue,
        lastYear: year,
      };
      broken.push({
        type: 'allTime',
        category: cat.key,
        label: cat.label,
        player: best.name,
        pos: best.pos,
        team: primaryTeam,
        newValue: bestValue,
        oldValue: prev?.value ?? 0,
        oldPlayer: prev?.name ?? null,
        year,
      });
    }
  }

  // Append broken records to history log (cap at 200 entries to bound storage)
  records.history = [...records.history, ...broken].slice(-200);

  return { records, broken };
}

/**
 * Determine which team a player spent the most seasons with.
 */
function getMostPlayedTeam(player, teamAbbrMap) {
  if (!Array.isArray(player.careerStats) || player.careerStats.length === 0) {
    return teamAbbrMap[player.teamId] ?? '';
  }
  const counts = {};
  for (const line of player.careerStats) {
    const t = line.team ?? '';
    counts[t] = (counts[t] || 0) + 1;
  }
  let maxTeam = '';
  let maxCount = 0;
  for (const [t, c] of Object.entries(counts)) {
    if (c > maxCount) { maxCount = c; maxTeam = t; }
  }
  return maxTeam;
}

/**
 * Utility: get the team a player played the most snaps/seasons for.
 * Exported for use by the HallOfFame component via the worker.
 */
export { getMostPlayedTeam };
