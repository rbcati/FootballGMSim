/**
 * Compact per-player season stat snapshots for archived seasons (pure helpers).
 * @see playerSeasonStatsV1 on season archive rows.
 *
 * Intentionally does not import recordBookV1 (recordBookV1 imports this module for scans).
 */

export const PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION = 1;

const DEFENSIVE_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readTotals(totals, keys) {
  if (!totals || typeof totals !== 'object') return 0;
  for (const k of keys) {
    const v = num(totals[k]);
    if (v !== 0) return v;
  }
  return 0;
}

/**
 * Mirrors recordBookV1.defensiveInterceptionsSeasonValue — QB thrown INT never counts as defensive INT.
 */
export function defensiveIntsFromTotalsForArchive(pos, totals) {
  const t = totals || {};
  const p = String(pos ?? '').toUpperCase();
  const defPick = readTotals(t, ['defInterceptions', 'interceptionsDef', 'interceptionsMade']);
  if (defPick > 0) return defPick;
  if (DEFENSIVE_POS.has(p)) return readTotals(t, ['interceptions']);
  return 0;
}

/** QB thrown interceptions (distinct from defensive INT). */
export function passIntsThrownFromTotals(pos, totals) {
  const p = String(pos ?? '').toUpperCase();
  if (p !== 'QB') return 0;
  return num(totals?.interceptions);
}

function teamAbbrForId(teams, teamId) {
  if (teamId == null || !Array.isArray(teams)) return '';
  const t = teams.find((x) => Number(x?.id) === Number(teamId));
  return t?.abbr != null ? String(t.abbr) : '';
}

function rowHasMeaningfulStats(r) {
  if (!r || typeof r !== 'object') return false;
  if (num(r.gamesPlayed) >= 1) return true;
  return (
    num(r.passYds) > 0
    || num(r.passTDs) > 0
    || num(r.passInts) > 0
    || num(r.rushYds) > 0
    || num(r.rushTDs) > 0
    || num(r.recYds) > 0
    || num(r.recTDs) > 0
    || num(r.tackles) > 0
    || num(r.sacks) > 0
    || num(r.defInts) > 0
    || num(r.fgMade) > 0
    || num(r.xpMade) > 0
  );
}

/**
 * @param {Array<object>} populatedStats - worker season stat rows with totals, name, pos, teamId, age
 * @param {{ teams?: any[], year: number, seasonId: string, createdAt?: string }} ctx
 */
export function buildPlayerSeasonStatsArchiveRows(populatedStats, ctx = {}) {
  const { teams = [], year, seasonId, createdAt } = ctx;
  const y = Number(year);
  const sid = seasonId != null ? String(seasonId) : '';
  const rows = [];
  const seen = new Set();
  let skippedEmpty = 0;
  for (const s of populatedStats || []) {
    const playerId = s.playerId ?? s.id;
    if (playerId == null) continue;
    const dedupeKey = String(playerId);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const totals = s.totals && typeof s.totals === 'object' ? s.totals : {};
    const pos = s.pos ?? '';
    const passYds = readTotals(totals, ['passYd', 'passingYards']);
    const passTDs = readTotals(totals, ['passTD', 'passingTd']);
    const rushYds = readTotals(totals, ['rushYd', 'rushingYards']);
    const rushTDs = readTotals(totals, ['rushTD', 'rushingTd']);
    const recYds = readTotals(totals, ['recYd', 'receivingYards']);
    const recTDs = readTotals(totals, ['recTD', 'receivingTd']);
    const tackles = readTotals(totals, ['tackles']);
    const sacks = readTotals(totals, ['sacks']);
    const fgMade = readTotals(totals, ['fgMade', 'fieldGoalsMade']);
    const xpMade = readTotals(totals, ['xpMade', 'extraPointsMade', 'patMade']);
    const gamesPlayed = num(totals.gamesPlayed);
    const defInts = defensiveIntsFromTotalsForArchive(pos, totals);
    const passInts = passIntsThrownFromTotals(pos, totals);

    const row = normalizeArchivedPlayerStatRow({
      playerId,
      playerName: s.name ?? null,
      pos,
      teamId: s.teamId ?? null,
      teamAbbr: s.teamAbbr ?? teamAbbrForId(teams, s.teamId),
      age: s.age ?? null,
      year: Number.isFinite(y) ? y : null,
      seasonId: sid || null,
      gamesPlayed,
      passYds,
      passTDs,
      passInts,
      rushYds,
      rushTDs,
      recYds,
      recTDs,
      tackles,
      sacks,
      defInts,
      fgMade,
      xpMade,
    });
    if (!rowHasMeaningfulStats(row)) {
      skippedEmpty += 1;
      continue;
    }
    rows.push(row);
  }

  const partial = skippedEmpty > 0;
  return {
    schemaVersion: PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION,
    rows,
    meta: {
      source: 'seasonStats',
      partial,
      createdAt: createdAt ?? new Date().toISOString(),
    },
  };
}

export function normalizeArchivedPlayerStatRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {
    playerId: row.playerId ?? row.id ?? null,
    playerName: row.playerName ?? row.name ?? null,
    pos: row.pos ?? null,
    teamId: row.teamId != null ? Number(row.teamId) : null,
    teamAbbr: row.teamAbbr != null && row.teamAbbr !== '' ? String(row.teamAbbr) : null,
    age: row.age != null ? num(row.age) : null,
    year: row.year != null ? num(row.year) : null,
    seasonId: row.seasonId != null ? String(row.seasonId) : null,
    gamesPlayed: num(row.gamesPlayed),
    passYds: num(row.passYds),
    passTDs: num(row.passTDs),
    passInts: num(row.passInts),
    rushYds: num(row.rushYds),
    rushTDs: num(row.rushTDs),
    recYds: num(row.recYds),
    recTDs: num(row.recTDs),
    tackles: num(row.tackles),
    sacks: num(row.sacks),
    defInts: num(row.defInts),
    fgMade: num(row.fgMade),
    xpMade: num(row.xpMade),
  };
  if (out.playerId == null) return null;
  return out;
}

export function getArchivedPlayerSeasonRows(season) {
  const raw = season?.playerSeasonStatsV1?.rows;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeArchivedPlayerStatRow).filter(Boolean);
}

export function summarizePlayerSeasonRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    rowCount: list.length,
    gamesSum: list.reduce((s, r) => s + num(r?.gamesPlayed), 0),
  };
}

export function groupArchivedPlayerStatsByPlayer(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const id = r?.playerId;
    if (id == null) continue;
    const k = String(id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

export function archivedRowSeasonDedupeKey(row) {
  if (!row) return '';
  if (row.seasonId) return `id:${String(row.seasonId)}`;
  if (row.year != null && Number.isFinite(num(row.year))) return `y:${num(row.year)}`;
  return '';
}

/**
 * Convert a compact V1 row to the same shape as `dedupeCareerStatLines` input (per-season bucket).
 */
export function v1ArchiveRowToCareerLineInput(row) {
  const r = normalizeArchivedPlayerStatRow(row);
  if (!r) return null;
  const seasonToken = r.seasonId ?? r.year;
  if (seasonToken == null || String(seasonToken) === '') return null;
  return {
    season: seasonToken,
    passYds: r.passYds,
    passTDs: r.passTDs,
    rushYds: r.rushYds,
    rushTDs: r.rushTDs,
    recYds: r.recYds,
    recTDs: r.recTDs,
    tackles: r.tackles,
    sacks: r.sacks,
    fgMade: r.fgMade,
    defInts: r.defInts,
    ints: r.passInts,
    gamesPlayed: r.gamesPlayed,
    team: r.teamAbbr ?? (r.teamId != null ? String(r.teamId) : 'FA'),
    year: r.year,
    seasonId: r.seasonId,
    pos: r.pos,
  };
}

export function careerLineSeasonKey(line) {
  if (!line) return '';
  if (line.season != null && String(line.season) !== '') return `s:${String(line.season)}`;
  if (line.seasonId != null) return `s:${String(line.seasonId)}`;
  if (line.year != null) return `y:${num(line.year)}`;
  return '';
}

export function collectArchiveOnlyCareerLinesForPlayer(playerId, leagueHistory, existingLineKeys) {
  const keys = new Set(existingLineKeys || []);
  const out = [];
  if (playerId == null) return out;
  for (const season of leagueHistory || []) {
    for (const row of getArchivedPlayerSeasonRows(season)) {
      if (String(row.playerId) !== String(playerId)) continue;
      const conv = v1ArchiveRowToCareerLineInput(row);
      if (!conv) continue;
      const k = careerLineSeasonKey(conv);
      if (!k || keys.has(k)) continue;
      keys.add(k);
      out.push(conv);
    }
  }
  return out;
}

/** Canonical record key string → value from a normalized V1 row */
export function singleSeasonStatValueFromV1Row(recordKey, row) {
  const r = normalizeArchivedPlayerStatRow(row);
  if (!r) return 0;
  switch (recordKey) {
    case 'passingYards': return r.passYds;
    case 'passingTD': return r.passTDs;
    case 'rushingYards': return r.rushYds;
    case 'rushingTD': return r.rushTDs;
    case 'receivingYards': return r.recYds;
    case 'receivingTD': return r.recTDs;
    case 'tackles': return r.tackles;
    case 'sacks': return r.sacks;
    case 'interceptions': return r.defInts;
    case 'fieldGoalsMade': return r.fgMade;
    default: return 0;
  }
}

const TOP_SORTS = [
  { key: 'passYds', pick: (r) => r.passYds, label: 'Pass yds' },
  { key: 'rushYds', pick: (r) => r.rushYds, label: 'Rush yds' },
  { key: 'recYds', pick: (r) => r.recYds, label: 'Rec yds' },
  { key: 'tackles', pick: (r) => r.tackles, label: 'Tackles' },
  { key: 'defInts', pick: (r) => r.defInts, label: 'Def INT' },
];

// ── Advanced Game-Attribution Archive ─────────────────────────────────────────

/** Zero-initialized advanced stats counter bag. */
export function createEmptyAdvancedStats() {
  return {
    targets: 0,
    receptionsAllowed: 0,
    coverageTargets: 0,
    coverageCompletionsAllowed: 0,
    drops: 0,
    battedPasses: 0,
    sacksAllowed: 0,
    sacksMade: 0,
  };
}

/**
 * Merge the advancedAttribution from one RichGameSummary into the persistent
 * sparse store.  Purely additive → order-independent (replaying games in any
 * order always produces the same career totals).
 *
 * @param {object} playerStatsStore  Mutable sparse store; mutated in place and returned.
 *                                   Shape: { [playerId]: { [year]: AdvancedStats } }
 * @param {object} gameSummary       RichGameSummary (must have advancedAttribution).
 * @param {number} year              Season year used as the bucket key.
 * @returns {object}  The same (mutated) playerStatsStore.
 */
export function archiveGameStats(playerStatsStore, gameSummary, year) {
  if (!playerStatsStore || typeof playerStatsStore !== 'object') return playerStatsStore ?? {};

  const attribution = gameSummary?.advancedAttribution;
  if (!attribution || typeof attribution !== 'object') return playerStatsStore;

  const y = num(year);
  if (!Number.isFinite(y) || y === 0) return playerStatsStore;
  const yKey = String(y);
  const gameId = gameSummary?.gameId != null ? String(gameSummary.gameId) : '';
  if (gameId) {
    const meta = (playerStatsStore.__meta && typeof playerStatsStore.__meta === 'object')
      ? playerStatsStore.__meta
      : (playerStatsStore.__meta = { archivedGameIds: {} });
    const archivedGameIds = (meta.archivedGameIds && typeof meta.archivedGameIds === 'object')
      ? meta.archivedGameIds
      : (meta.archivedGameIds = {});
    const dedupeKey = `${yKey}:${gameId}`;
    if (archivedGameIds[dedupeKey]) return playerStatsStore;
    archivedGameIds[dedupeKey] = true;
  }

  for (const playerId of Object.keys(attribution)) {
    if (!playerId) continue;
    const gameStats = attribution[playerId];
    if (!gameStats || typeof gameStats !== 'object') continue;

    const pid = String(playerId);
    if (!Object.prototype.hasOwnProperty.call(playerStatsStore, pid)) {
      playerStatsStore[pid] = {};
    }
    const playerYears = playerStatsStore[pid];
    const prev = playerYears[yKey] ?? createEmptyAdvancedStats();

    playerYears[yKey] = {
      targets:                    prev.targets                    + num(gameStats.targets),
      receptionsAllowed:          prev.receptionsAllowed          + num(gameStats.receptionsAllowed),
      coverageTargets:            prev.coverageTargets            + num(gameStats.coverageTargets),
      coverageCompletionsAllowed: prev.coverageCompletionsAllowed + num(gameStats.coverageCompletionsAllowed),
      drops:                      prev.drops                      + num(gameStats.drops),
      battedPasses:               prev.battedPasses               + num(gameStats.battedPasses),
      sacksAllowed:               prev.sacksAllowed               + num(gameStats.sacksAllowed),
      sacksMade:                  prev.sacksMade                  + num(gameStats.sacksMade),
    };
  }

  return playerStatsStore;
}

/**
 * Sum all per-season AdvancedStats for a given player into career totals.
 * Pure function — never mutates the archive.
 *
 * @param {string|number} playerId
 * @param {object} statsArchive  playerStatsStore (sparse)
 * @returns {object} Career-total AdvancedStats; all fields are zero if player not found.
 */
export function getCareerStats(playerId, statsArchive) {
  const pid = String(playerId ?? '');
  const playerYears = statsArchive?.[pid];
  if (!playerYears || typeof playerYears !== 'object') return createEmptyAdvancedStats();

  const career = createEmptyAdvancedStats();
  for (const yearStats of Object.values(playerYears)) {
    if (!yearStats || typeof yearStats !== 'object') continue;
    career.targets                    += num(yearStats.targets);
    career.receptionsAllowed          += num(yearStats.receptionsAllowed);
    career.coverageTargets            += num(yearStats.coverageTargets);
    career.coverageCompletionsAllowed += num(yearStats.coverageCompletionsAllowed);
    career.drops                      += num(yearStats.drops);
    career.battedPasses               += num(yearStats.battedPasses);
    career.sacksAllowed               += num(yearStats.sacksAllowed);
    career.sacksMade                  += num(yearStats.sacksMade);
  }
  return career;
}

/**
 * Compact buckets for League History "Top performers" (max 2 per bucket, unique players preferred).
 */
export function buildLeagueHistoryTopPerformers(season, opts = {}) {
  const perBucket = Number(opts.perBucket ?? 2);
  const rows = getArchivedPlayerSeasonRows(season).map(normalizeArchivedPlayerStatRow).filter(Boolean);
  if (!rows.length) return null;
  const buckets = {};
  for (const { key, pick, label } of TOP_SORTS) {
    const sorted = [...rows].filter((r) => num(pick(r)) > 0).sort((a, b) => num(pick(b)) - num(pick(a)));
    const used = new Set();
    const acc = [];
    for (const r of sorted) {
      if (acc.length >= perBucket) break;
      const pid = String(r.playerId);
      if (used.has(pid)) continue;
      used.add(pid);
      acc.push({
        category: label,
        statKey: key,
        value: num(pick(r)),
        playerId: r.playerId,
        playerName: r.playerName,
        pos: r.pos,
        teamAbbr: r.teamAbbr,
      });
    }
    buckets[key] = acc;
  }
  return buckets;
}
