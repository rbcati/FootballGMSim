/**
 * leagueLeadersViewModel.js
 * Builds filterable league leaders / player stats from current-season or
 * archived player stat rows. Pure helpers; safe on null/partial/legacy data.
 */

const DEFENSIVE_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readMulti(obj, keys) {
  if (!obj || typeof obj !== 'object') return 0;
  for (const k of keys) {
    const v = num(obj[k]);
    if (v !== 0) return v;
  }
  return 0;
}

function defIntsFromTotals(pos, totals) {
  const t = totals ?? {};
  const p = String(pos ?? '').toUpperCase();
  const explicit = readMulti(t, ['defInterceptions', 'interceptionsDef', 'interceptionsMade']);
  if (explicit > 0) return explicit;
  if (DEFENSIVE_POS.has(p)) return readMulti(t, ['interceptions']);
  return 0;
}

export const LEADER_CATEGORIES = ['Passing', 'Rushing', 'Receiving', 'Defense', 'Kicking'];

export const LEADER_STAT_DEFS = [
  { category: 'Passing',   statKey: 'passYds',    statLabel: 'Pass Yds',   pick: (r) => r.passYds },
  { category: 'Passing',   statKey: 'passTDs',    statLabel: 'Pass TD',    pick: (r) => r.passTDs },
  { category: 'Passing',   statKey: 'passInts',   statLabel: 'INT Thrown', pick: (r) => r.passInts },
  { category: 'Rushing',   statKey: 'rushYds',    statLabel: 'Rush Yds',   pick: (r) => r.rushYds },
  { category: 'Rushing',   statKey: 'rushTDs',    statLabel: 'Rush TD',    pick: (r) => r.rushTDs },
  { category: 'Receiving', statKey: 'recYds',     statLabel: 'Rec Yds',    pick: (r) => r.recYds },
  { category: 'Receiving', statKey: 'recTDs',     statLabel: 'Rec TD',     pick: (r) => r.recTDs },
  { category: 'Receiving', statKey: 'receptions', statLabel: 'Receptions', pick: (r) => r.receptions },
  { category: 'Defense',   statKey: 'tackles',    statLabel: 'Tackles',    pick: (r) => r.tackles },
  { category: 'Defense',   statKey: 'sacks',      statLabel: 'Sacks',      pick: (r) => r.sacks },
  { category: 'Defense',   statKey: 'defInts',    statLabel: 'INT',        pick: (r) => r.defInts },
  { category: 'Kicking',   statKey: 'fgMade',     statLabel: 'FG Made',    pick: (r) => r.fgMade },
  { category: 'Kicking',   statKey: 'xpMade',     statLabel: 'XP Made',    pick: (r) => r.xpMade },
];

export const DEFAULT_STAT_KEY = {
  Passing: 'passYds',
  Rushing: 'rushYds',
  Receiving: 'recYds',
  Defense: 'tackles',
  Kicking: 'fgMade',
};

/** Normalize a current-season player row (from getAllPlayerStats totals) to shared stat shape. */
export function normalizeCurrentSeasonRow(player) {
  if (!player || typeof player !== 'object') return null;
  const totals = player.totals && typeof player.totals === 'object' ? player.totals : {};
  const playerId = player.playerId ?? player.id ?? null;
  if (playerId == null) return null;
  const pos = String(player.pos ?? '');
  const isQB = pos.toUpperCase() === 'QB';
  return {
    playerId,
    playerName: player.name ?? player.playerName ?? null,
    pos,
    teamId: player.teamId != null ? Number(player.teamId) : null,
    teamAbbr: player.teamAbbr ?? null,
    gamesPlayed: num(totals.gamesPlayed),
    passYds: readMulti(totals, ['passYd', 'passingYards', 'passYds']),
    passTDs: readMulti(totals, ['passTD', 'passTDs', 'passingTd', 'passingTDs']),
    passInts: isQB ? readMulti(totals, ['interceptions', 'passInts', 'ints']) : 0,
    rushYds: readMulti(totals, ['rushYd', 'rushingYards', 'rushYds']),
    rushTDs: readMulti(totals, ['rushTD', 'rushTDs', 'rushingTd', 'rushingTDs']),
    recYds: readMulti(totals, ['recYd', 'receivingYards', 'recYds']),
    recTDs: readMulti(totals, ['recTD', 'recTDs', 'receivingTd', 'receivingTDs']),
    receptions: readMulti(totals, ['receptions', 'rec', 'catches']),
    tackles: readMulti(totals, ['tackles', 'totalTackles']),
    sacks: readMulti(totals, ['sacks']),
    defInts: defIntsFromTotals(pos, totals),
    fgMade: readMulti(totals, ['fgMade', 'fieldGoalsMade', 'fgm']),
    xpMade: readMulti(totals, ['xpMade', 'extraPointsMade', 'patMade', 'xpm']),
  };
}

/** Normalize an archived stat row (playerSeasonStatsV1) to shared stat shape. */
export function normalizeArchivedLeaderRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.playerId == null) return null;
  return {
    playerId: row.playerId,
    playerName: row.playerName ?? null,
    pos: String(row.pos ?? ''),
    teamId: row.teamId != null ? Number(row.teamId) : null,
    teamAbbr: row.teamAbbr ?? null,
    gamesPlayed: num(row.gamesPlayed),
    passYds: num(row.passYds),
    passTDs: num(row.passTDs),
    passInts: num(row.passInts),
    rushYds: num(row.rushYds),
    rushTDs: num(row.rushTDs),
    recYds: num(row.recYds),
    recTDs: num(row.recTDs),
    receptions: 0,
    tackles: num(row.tackles),
    sacks: num(row.sacks),
    defInts: num(row.defInts),
    fgMade: num(row.fgMade),
    xpMade: num(row.xpMade),
  };
}

function formatDisplayValue(value) {
  const n = num(value);
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

/**
 * Build league leaders by category and stat key.
 * @param {Array} normalizedRows - Pre-normalized rows
 * @param {{ topN?: number }} opts
 * @returns {{ [category]: { [statKey]: leaderRow[] } }}
 */
export function buildLeagueLeadersRows(normalizedRows, { topN = 25 } = {}) {
  const rows = Array.isArray(normalizedRows) ? normalizedRows.filter(Boolean) : [];
  const result = {};
  for (const def of LEADER_STAT_DEFS) {
    const { category, statKey, statLabel, pick } = def;
    if (!result[category]) result[category] = {};
    const sorted = rows
      .filter((r) => num(pick(r)) > 0)
      .sort((a, b) => {
        const diff = num(pick(b)) - num(pick(a));
        if (diff !== 0) return diff;
        return String(a.playerName ?? '').localeCompare(String(b.playerName ?? ''));
      });
    result[category][statKey] = sorted.slice(0, topN).map((r, i) => ({
      id: `${statKey}-${i}`,
      playerId: r.playerId,
      playerName: r.playerName,
      pos: r.pos,
      teamId: r.teamId,
      teamAbbr: r.teamAbbr,
      category,
      statKey,
      statLabel,
      value: num(pick(r)),
      displayValue: formatDisplayValue(pick(r)),
      rank: i + 1,
    }));
  }
  return result;
}

/** Filter leader rows by free-text search (player name, team abbr, position). */
export function filterLeaderRows(rows, search = '') {
  const q = String(search ?? '').trim().toLowerCase();
  if (!q) return rows ?? [];
  return (rows ?? []).filter(
    (r) =>
      (r.playerName ?? '').toLowerCase().includes(q) ||
      (r.teamAbbr ?? '').toLowerCase().includes(q) ||
      (r.pos ?? '').toLowerCase().includes(q),
  );
}

/** Return the top leader row for a given statKey, or null if no data. */
export function getTopLeader(normalizedRows, statKey) {
  const def = LEADER_STAT_DEFS.find((d) => d.statKey === statKey);
  if (!def) return null;
  const { pick } = def;
  const valid = (Array.isArray(normalizedRows) ? normalizedRows : []).filter(
    (r) => r && num(pick(r)) > 0,
  );
  if (!valid.length) return null;
  valid.sort((a, b) => num(pick(b)) - num(pick(a)));
  const r = valid[0];
  return {
    playerId: r.playerId,
    playerName: r.playerName,
    pos: r.pos,
    teamAbbr: r.teamAbbr,
    statLabel: def.statLabel,
    value: num(pick(r)),
    displayValue: formatDisplayValue(pick(r)),
  };
}
