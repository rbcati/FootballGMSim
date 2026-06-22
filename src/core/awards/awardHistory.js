/**
 * awardHistory.js — Awards & Honors Expansion V2: compact per-season award ledger.
 *
 * Pure, deterministic module. No Math.random, no I/O, no UI/worker imports.
 * It does NOT compute awards — it *composes* the outputs of the existing award
 * engines (awardEngine.determineSeasonAwards + prestigeEngine selections) into a
 * compact, serializable, replay-safe season ledger persisted at meta.awardHistory.
 *
 * Persisted shape (meta.awardHistory is an array of these, one per season):
 *   {
 *     year,                      // numeric season year (stable key)
 *     seasonId,                  // optional engine season id (e.g. "s7")
 *     awards: {
 *       MVP:  { playerId, playerName, teamId, teamAbbr, pos, score } | null,
 *       OPOY: {…} | null,
 *       DPOY: {…} | null,
 *       ORoy: {…} | null,
 *       DRoy: {…} | null,
 *       COY:  { teamId, teamAbbr, coachName } | null
 *     },
 *     allPro: {
 *       firstTeam:  [{ playerId, playerName, teamAbbr, pos }],  // positional (11 slots)
 *       secondTeam: [{ playerId, playerName, teamAbbr, pos }]
 *     },
 *     proBowl: [{ playerId, playerName, teamAbbr, pos }],
 *     leaders: { [statKey]: { playerId, playerName, teamAbbr, pos, value } | null }
 *   }
 *
 * Design notes:
 *  - Compact: only ids/names/abbrs + a single numeric score/value are stored, so a
 *    50-season dynasty ledger stays small and serializable.
 *  - Bounded: appendAwardHistory replaces any existing entry for the same year, so
 *    re-running a season never duplicates and growth is at most one entry/season.
 *  - Retire-safe: entries snapshot player/team names at award time, so career honor
 *    aggregation never needs a live player reference.
 *
 * Exported API:
 *   LEAGUE_LEADER_CATEGORIES
 *   computeLeagueLeaders(stats, teamResolver) → { [statKey]: leaderEntry|null }
 *   buildAwardHistoryEntry(params) → entry
 *   appendAwardHistory(awardHistory, entry) → entry[]
 *   hydrateAwardHistory(meta) → entry[]
 *   getCareerHonorCounts(awardHistory, playerId) → counts
 *   aggregateCareerHonors(awardHistory) → Map<playerId, counts>
 *   summarizeSeasonAwards(entry) → compact UI rows
 */

import { AWARD_TYPES } from './awardEngine.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read a stat value from a flat totals object using a list of alias field names. */
function _stat(totals, keys) {
  if (!totals || typeof totals !== 'object') return 0;
  for (const key of keys) {
    const v = totals[key];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

const OFF_SKILL_POS = new Set(['QB', 'RB', 'FB', 'WR', 'TE']);
const DEF_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'NT', 'LB', 'MLB', 'OLB', 'CB', 'S', 'SS', 'FS', 'DB']);

function _isDefPos(pos) {
  return DEF_POS.has(String(pos ?? '').toUpperCase());
}

// ── League leaders ────────────────────────────────────────────────────────────

/**
 * League-leader categories. Each derives a per-player value from a stat row's
 * `totals`. `posFilter` (optional) restricts which positions are eligible so that,
 * e.g. QB interceptions-thrown never count toward the defensive INT leader.
 */
export const LEAGUE_LEADER_CATEGORIES = Object.freeze([
  { key: 'passYd', label: 'Passing Yards',    value: (t) => _stat(t, ['passYd', 'passingYards']) },
  { key: 'passTD', label: 'Passing TDs',      value: (t) => _stat(t, ['passTD', 'passingTd']) },
  { key: 'rushYd', label: 'Rushing Yards',    value: (t) => _stat(t, ['rushYd', 'rushingYards']) },
  { key: 'rushTD', label: 'Rushing TDs',      value: (t) => _stat(t, ['rushTD', 'rushingTd']) },
  { key: 'recYd',  label: 'Receiving Yards',  value: (t) => _stat(t, ['recYd', 'receivingYards']) },
  { key: 'recTD',  label: 'Receiving TDs',    value: (t) => _stat(t, ['recTD', 'receivingTd']) },
  { key: 'sacks',  label: 'Sacks',            value: (t) => _stat(t, ['sacks']) },
  {
    key: 'defInt',
    label: 'Interceptions',
    posFilter: 'def',
    value: (t) => _stat(t, ['defInterceptions', 'interceptions']),
  },
  {
    key: 'totalTD',
    label: 'Total Touchdowns',
    value: (t) =>
      _stat(t, ['passTD', 'passingTd']) +
      _stat(t, ['rushTD', 'rushingTd']) +
      _stat(t, ['recTD', 'receivingTd']),
  },
]);

/**
 * Compute deterministic league leaders for every category.
 *
 * Determinism: the highest value wins; ties are broken by ascending playerId
 * string. A category with no positive value resolves to null.
 *
 * @param {Array} stats          — populated season stat rows: { playerId, name, pos, teamId, totals }
 * @param {Function} [teamResolver] — (teamId) => team | null, for teamAbbr snapshot
 * @returns {{ [statKey]: { playerId, playerName, teamId, teamAbbr, pos, value }|null }}
 */
export function computeLeagueLeaders(stats, teamResolver) {
  const rows = Array.isArray(stats) ? stats : [];
  const resolve = typeof teamResolver === 'function' ? teamResolver : () => null;
  const leaders = {};

  for (const cat of LEAGUE_LEADER_CATEGORIES) {
    let best = null;
    for (const row of rows) {
      if (!row || row.playerId == null) continue;
      if (cat.posFilter === 'def' && !_isDefPos(row.pos)) continue;
      const value = cat.value(row.totals ?? {});
      if (!(value > 0)) continue;
      if (
        best == null ||
        value > best.value ||
        (value === best.value && String(row.playerId).localeCompare(String(best.playerId)) < 0)
      ) {
        best = { row, value };
      }
    }
    if (best == null) {
      leaders[cat.key] = null;
    } else {
      const team = resolve(best.row.teamId);
      leaders[cat.key] = {
        playerId: best.row.playerId,
        playerName: best.row.name ?? '',
        teamId: best.row.teamId ?? null,
        teamAbbr: team?.abbr ?? null,
        pos: best.row.pos ?? '',
        value: best.value,
      };
    }
  }

  return leaders;
}

// ── Entry construction ──────────────────────────────────────────────────────

/** Compact a playerAward record into a stable, retire-safe winner snapshot. */
function _compactWinner(award, teamResolver) {
  if (!award || award.playerId == null) return null;
  const team = typeof teamResolver === 'function' ? teamResolver(award.teamId) : null;
  return {
    playerId: award.playerId,
    playerName: award.name ?? '',
    teamId: award.teamId ?? null,
    teamAbbr: team?.abbr ?? null,
    pos: award.pos ?? '',
    score: Number.isFinite(Number(award.score)) ? Number(award.score) : null,
  };
}

/** Compact an All-Pro / Pro Bowl honor record into a stable snapshot. */
function _compactHonor(rec, teamResolver) {
  if (!rec || rec.playerId == null) return null;
  const team = typeof teamResolver === 'function' ? teamResolver(rec.teamId) : null;
  return {
    playerId: rec.playerId,
    playerName: rec.name ?? rec.playerName ?? '',
    teamAbbr: team?.abbr ?? rec.teamAbbr ?? null,
    pos: rec.pos ?? '',
  };
}

/**
 * Build a single compact season award-history entry by composing engine outputs.
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {string} [params.seasonId]
 * @param {Object} params.awardResults          — output of determineSeasonAwards
 * @param {Array}  [params.prestigeAssignments] — prestigeEngine All-Pro/Pro Bowl honors
 * @param {Array}  [params.stats]               — populated stat rows (for league leaders)
 * @param {Function} [params.teamResolver]
 * @returns {Object} compact award-history entry
 */
export function buildAwardHistoryEntry(params = {}) {
  const {
    year,
    seasonId = null,
    awardResults = {},
    prestigeAssignments = [],
    stats = [],
    teamResolver,
  } = params;

  const playerAwards = Array.isArray(awardResults.playerAwards) ? awardResults.playerAwards : [];
  const franchiseAwards = Array.isArray(awardResults.franchiseAwards) ? awardResults.franchiseAwards : [];
  const allProTeam = Array.isArray(awardResults.allProTeam) ? awardResults.allProTeam : [];
  const prestige = Array.isArray(prestigeAssignments) ? prestigeAssignments : [];

  const findAward = (type) => playerAwards.find((a) => a?.type === type) ?? null;

  // Prefer the V2 split rookie awards; fall back to the legacy combined ROY.
  const offRookie = findAward(AWARD_TYPES.OFF_ROOKIE_OF_YEAR) ?? findAward(AWARD_TYPES.ROOKIE_OF_YEAR);
  const defRookie = findAward(AWARD_TYPES.DEF_ROOKIE_OF_YEAR);

  const awards = {
    MVP: _compactWinner(findAward(AWARD_TYPES.MVP), teamResolver),
    OPOY: _compactWinner(findAward(AWARD_TYPES.OFFENSIVE_POY), teamResolver),
    DPOY: _compactWinner(findAward(AWARD_TYPES.DEFENSIVE_POY), teamResolver),
    ORoy: _compactWinner(offRookie, teamResolver),
    DRoy: _compactWinner(defRookie, teamResolver),
    COY: (() => {
      const coy = franchiseAwards.find((a) => a?.type === AWARD_TYPES.COACH_OF_YEAR);
      if (!coy) return null;
      const team = typeof teamResolver === 'function' ? teamResolver(coy.teamId) : null;
      return { teamId: coy.teamId ?? null, teamAbbr: team?.abbr ?? null, coachName: coy.coachName ?? null };
    })(),
  };

  // First-team All-Pro: use the positional All-Pro team (covers QB/RB/WR/TE/OL/
  // DL/LB/CB/S/K/P). Second-team + Pro Bowl reuse the prestige selections.
  const firstTeam = allProTeam.map((r) => _compactHonor(r, teamResolver)).filter(Boolean);
  const secondTeam = prestige
    .filter((h) => h?.type === 'SECOND_TEAM_ALL_PRO')
    .map((r) => _compactHonor(r, teamResolver))
    .filter(Boolean);
  const proBowl = prestige
    .filter((h) => h?.type === 'PRO_BOWL')
    .map((r) => _compactHonor(r, teamResolver))
    .filter(Boolean);

  return {
    year: _num(year),
    seasonId: seasonId != null ? String(seasonId) : null,
    awards,
    allPro: { firstTeam, secondTeam },
    proBowl,
    leaders: computeLeagueLeaders(stats, teamResolver),
  };
}

// ── Persistence helpers ────────────────────────────────────────────────────────

/**
 * Append (or replace) a season entry in the award-history ledger.
 *
 * Idempotent + bounded: any existing entry with the same `year` is replaced, so
 * re-running the same season never duplicates and the ledger grows by at most one
 * entry per season. Returns a new array sorted chronologically; never mutates input.
 *
 * @param {Array} awardHistory
 * @param {Object} entry
 * @returns {Array}
 */
export function appendAwardHistory(awardHistory, entry) {
  const arr = Array.isArray(awardHistory) ? awardHistory : [];
  if (!entry || entry.year == null) return [...arr];
  const year = _num(entry.year);
  const filtered = arr.filter((e) => _num(e?.year) !== year);
  return [...filtered, entry].sort((a, b) => _num(a?.year) - _num(b?.year));
}

/**
 * Backward-compatible hydration: returns a safe array for old saves that predate
 * meta.awardHistory. Filters out malformed entries (missing year) defensively.
 *
 * @param {Object} meta
 * @returns {Array}
 */
export function hydrateAwardHistory(meta) {
  const raw = meta?.awardHistory;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && e.year != null);
}

// ── Career honor aggregation ────────────────────────────────────────────────

function _emptyCounts() {
  return {
    mvp: 0,
    opoy: 0,
    dpoy: 0,
    oroy: 0,
    droy: 0,
    firstTeamAllPro: 0,
    secondTeamAllPro: 0,
    allPro: 0,
    proBowl: 0,
  };
}

function _accumulate(counts, entry, pid) {
  const a = entry?.awards ?? {};
  if (a.MVP && String(a.MVP.playerId) === pid) counts.mvp += 1;
  if (a.OPOY && String(a.OPOY.playerId) === pid) counts.opoy += 1;
  if (a.DPOY && String(a.DPOY.playerId) === pid) counts.dpoy += 1;
  if (a.ORoy && String(a.ORoy.playerId) === pid) counts.oroy += 1;
  if (a.DRoy && String(a.DRoy.playerId) === pid) counts.droy += 1;

  const first = entry?.allPro?.firstTeam ?? [];
  const second = entry?.allPro?.secondTeam ?? [];
  const pro = entry?.proBowl ?? [];
  for (const h of first) if (h && String(h.playerId) === pid) counts.firstTeamAllPro += 1;
  for (const h of second) if (h && String(h.playerId) === pid) counts.secondTeamAllPro += 1;
  for (const h of pro) if (h && String(h.playerId) === pid) counts.proBowl += 1;
}

/**
 * Aggregate a single player's career honor counts from the award-history ledger.
 * Retire-safe: reads only the persisted snapshots, never a live player reference.
 *
 * @param {Array} awardHistory
 * @param {string|number} playerId
 * @returns {{ mvp, opoy, dpoy, oroy, droy, firstTeamAllPro, secondTeamAllPro, allPro, proBowl }}
 */
export function getCareerHonorCounts(awardHistory, playerId) {
  const counts = _emptyCounts();
  if (playerId == null) return counts;
  const pid = String(playerId);
  const arr = Array.isArray(awardHistory) ? awardHistory : [];
  for (const entry of arr) _accumulate(counts, entry, pid);
  counts.allPro = counts.firstTeamAllPro + counts.secondTeamAllPro;
  return counts;
}

/**
 * Aggregate career honor counts for every player that appears anywhere in the
 * ledger. Single pass; returns a Map keyed by stringified playerId.
 *
 * @param {Array} awardHistory
 * @returns {Map<string, object>}
 */
export function aggregateCareerHonors(awardHistory) {
  const arr = Array.isArray(awardHistory) ? awardHistory : [];
  const map = new Map();
  const ensure = (pid) => {
    const key = String(pid);
    if (!map.has(key)) map.set(key, _emptyCounts());
    return map.get(key);
  };

  for (const entry of arr) {
    const a = entry?.awards ?? {};
    if (a.MVP?.playerId != null) ensure(a.MVP.playerId).mvp += 1;
    if (a.OPOY?.playerId != null) ensure(a.OPOY.playerId).opoy += 1;
    if (a.DPOY?.playerId != null) ensure(a.DPOY.playerId).dpoy += 1;
    if (a.ORoy?.playerId != null) ensure(a.ORoy.playerId).oroy += 1;
    if (a.DRoy?.playerId != null) ensure(a.DRoy.playerId).droy += 1;
    for (const h of entry?.allPro?.firstTeam ?? []) if (h?.playerId != null) ensure(h.playerId).firstTeamAllPro += 1;
    for (const h of entry?.allPro?.secondTeam ?? []) if (h?.playerId != null) ensure(h.playerId).secondTeamAllPro += 1;
    for (const h of entry?.proBowl ?? []) if (h?.playerId != null) ensure(h.playerId).proBowl += 1;
  }

  for (const counts of map.values()) {
    counts.allPro = counts.firstTeamAllPro + counts.secondTeamAllPro;
  }
  return map;
}

// ── UI summary ──────────────────────────────────────────────────────────────

const _MAJOR_AWARD_ROWS = Object.freeze([
  { key: 'MVP', label: 'MVP' },
  { key: 'OPOY', label: 'Offensive POY' },
  { key: 'DPOY', label: 'Defensive POY' },
  { key: 'ORoy', label: 'Off. Rookie of the Year' },
  { key: 'DRoy', label: 'Def. Rookie of the Year' },
]);

/**
 * Build compact, render-ready rows for a single season's awards. Degrades safely
 * when the entry or any field is missing.
 *
 * @param {Object} entry — an award-history entry
 * @returns {{ year, seasonId, majorAwards: Array, firstTeamCount, secondTeamCount, proBowlCount, leaders: Array }}
 */
export function summarizeSeasonAwards(entry) {
  const safe = entry && typeof entry === 'object' ? entry : {};
  const awards = safe.awards ?? {};

  const majorAwards = _MAJOR_AWARD_ROWS.map(({ key, label }) => {
    const w = awards[key];
    return {
      key,
      label,
      playerName: w?.playerName ?? null,
      pos: w?.pos ?? null,
      teamAbbr: w?.teamAbbr ?? null,
    };
  }).filter((r) => r.playerName);

  const leaders = LEAGUE_LEADER_CATEGORIES.map((cat) => {
    const l = safe.leaders?.[cat.key];
    return l
      ? { key: cat.key, label: cat.label, playerName: l.playerName, teamAbbr: l.teamAbbr, value: l.value }
      : null;
  }).filter(Boolean);

  return {
    year: safe.year ?? null,
    seasonId: safe.seasonId ?? null,
    majorAwards,
    firstTeamCount: Array.isArray(safe.allPro?.firstTeam) ? safe.allPro.firstTeam.length : 0,
    secondTeamCount: Array.isArray(safe.allPro?.secondTeam) ? safe.allPro.secondTeam.length : 0,
    proBowlCount: Array.isArray(safe.proBowl) ? safe.proBowl.length : 0,
    leaders,
  };
}
