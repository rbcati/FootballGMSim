/**
 * recordBookV1.js — compact all-time record book from archived seasons + career stats.
 * Pure helpers; safe on partial / legacy saves.
 */

export const RECORD_BOOK_SCHEMA_VERSION = 1;

/** Canonical record keys (persisted under singleSeason / careerLeaders) */
export const RECORD_KEYS = {
  passingYards: 'passingYards',
  passingTD: 'passingTD',
  rushingYards: 'rushingYards',
  rushingTD: 'rushingTD',
  receivingYards: 'receivingYards',
  receivingTD: 'receivingTD',
  tackles: 'tackles',
  sacks: 'sacks',
  interceptions: 'interceptions',
  fieldGoalsMade: 'fieldGoalsMade',
};

export const RECORD_LABELS = {
  [RECORD_KEYS.passingYards]: 'Passing yards',
  [RECORD_KEYS.passingTD]: 'Passing touchdowns',
  [RECORD_KEYS.rushingYards]: 'Rushing yards',
  [RECORD_KEYS.rushingTD]: 'Rushing touchdowns',
  [RECORD_KEYS.receivingYards]: 'Receiving yards',
  [RECORD_KEYS.receivingTD]: 'Receiving touchdowns',
  [RECORD_KEYS.tackles]: 'Tackles',
  [RECORD_KEYS.sacks]: 'Sacks',
  [RECORD_KEYS.interceptions]: 'Defensive interceptions',
  [RECORD_KEYS.fieldGoalsMade]: 'Field goals made',
};

/** playerStatLeaders / leader blob keys → canonical record key */
export const ARCHIVE_LEADER_TO_RECORD = {
  passingYards: RECORD_KEYS.passingYards,
  passingTd: RECORD_KEYS.passingTD,
  rushingYards: RECORD_KEYS.rushingYards,
  rushingTd: RECORD_KEYS.rushingTD,
  receivingYards: RECORD_KEYS.receivingYards,
  receivingTd: RECORD_KEYS.receivingTD,
  tackles: RECORD_KEYS.tackles,
  sacks: RECORD_KEYS.sacks,
  interceptions: RECORD_KEYS.interceptions,
  fieldGoalsMade: RECORD_KEYS.fieldGoalsMade,
};

/** Stable iteration order for UI + rebuild loops */
export const RECORD_BOOK_PLAYER_KEYS = [
  RECORD_KEYS.passingYards,
  RECORD_KEYS.passingTD,
  RECORD_KEYS.rushingYards,
  RECORD_KEYS.rushingTD,
  RECORD_KEYS.receivingYards,
  RECORD_KEYS.receivingTD,
  RECORD_KEYS.tackles,
  RECORD_KEYS.sacks,
  RECORD_KEYS.interceptions,
  RECORD_KEYS.fieldGoalsMade,
];

const PLAYER_STAT_ORDER = RECORD_BOOK_PLAYER_KEYS;

const TEAM_RECORD_ORDER = [
  'wins',
  'winPct',
  'pointsFor',
  'pointsAllowed',
  'pointDifferential',
  'pointsPerGame',
  'pointsAllowedPerGame',
];

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readFromTotals(totals, keys) {
  if (!totals || typeof totals !== 'object') return 0;
  for (const k of keys) {
    const v = num(totals[k]);
    if (v !== 0) return v;
  }
  return 0;
}

const DEFENSIVE_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);

/**
 * Season value for defensive INT leaderboards — never uses QB thrown picks.
 */
export function defensiveInterceptionsSeasonValue(row) {
  const totals = row?.totals ?? {};
  const pos = String(row?.pos ?? '').toUpperCase();
  const defPick = readFromTotals(totals, ['defInterceptions', 'interceptionsDef', 'interceptionsMade']);
  if (defPick > 0) return defPick;
  if (DEFENSIVE_POS.has(pos)) return readFromTotals(totals, ['interceptions']);
  return 0;
}

export function careerLineDefensiveInts(line) {
  return num(line?.defInts ?? line?.defInterceptions ?? line?.interceptionsDef);
}

/**
 * Map archive `playerStatLeaders` entry + season meta → record row.
 */
export function leaderEntryToRecordRow(recordKey, leader, season) {
  if (!leader || num(leader.value) <= 0) return null;
  const year = Number(season?.year ?? 0) || null;
  const seasonId = season?.seasonId ?? season?.id ?? null;
  return {
    recordKey,
    label: RECORD_LABELS[recordKey] ?? recordKey,
    value: num(leader.value),
    playerId: leader.playerId ?? null,
    playerName: leader.playerName ?? leader.name ?? null,
    position: leader.position ?? leader.pos ?? null,
    teamId: leader.teamId ?? null,
    teamName: leader.teamName ?? null,
    teamAbbr: leader.teamAbbr ?? null,
    year,
    sourceSeasonId: seasonId,
    statKey: leader.stat ?? null,
    source: 'archivedSeason',
  };
}

function blankTeamRow() {
  return {
    recordKey: null,
    label: null,
    value: 0,
    teamId: null,
    teamName: null,
    teamAbbr: null,
    year: null,
    sourceSeasonId: null,
    source: 'archivedSeason',
  };
}

function seasonGamesFromStandings(row) {
  return num(row?.wins) + num(row?.losses) + num(row?.ties);
}

/**
 * Dedupe career stat lines by season id; if duplicates, numeric fields are summed per season bucket.
 */
export function dedupeCareerStatLines(lines) {
  const buckets = new Map();
  for (const line of lines || []) {
    const sid = line?.season != null ? String(line.season) : line?.year != null ? String(line.year) : '';
    if (!sid) continue;
    buckets.set(sid, {
      season: line.season ?? line.year,
      passYds: num(line.passYds ?? line.passingYards),
      passTDs: num(line.passTDs ?? line.passingTDs),
      rushYds: num(line.rushYds ?? line.rushingYards),
      rushTDs: num(line.rushTDs ?? line.rushingTDs),
      recYds: num(line.recYds ?? line.receivingYards),
      recTDs: num(line.recTDs ?? line.receivingTDs),
      tackles: num(line.tackles),
      sacks: num(line.sacks),
      fgMade: num(line.fgMade ?? line.fieldGoalsMade),
      defInts: careerLineDefensiveInts(line),
    });
  }
  return [...buckets.values()];
}

const CAREER_FIELD = {
  [RECORD_KEYS.passingYards]: (l) => num(l.passYds ?? l.passingYards),
  [RECORD_KEYS.passingTD]: (l) => num(l.passTDs ?? l.passingTDs),
  [RECORD_KEYS.rushingYards]: (l) => num(l.rushYds ?? l.rushingYards),
  [RECORD_KEYS.rushingTD]: (l) => num(l.rushTDs ?? l.rushingTDs),
  [RECORD_KEYS.receivingYards]: (l) => num(l.recYds ?? l.receivingYards),
  [RECORD_KEYS.receivingTD]: (l) => num(l.recTDs ?? l.receivingTDs),
  [RECORD_KEYS.tackles]: (l) => num(l.tackles),
  [RECORD_KEYS.sacks]: (l) => num(l.sacks),
  [RECORD_KEYS.interceptions]: (l) => careerLineDefensiveInts(l),
  [RECORD_KEYS.fieldGoalsMade]: (l) => num(l.fgMade ?? l.fieldGoalsMade),
};

export function careerTotalsFromPlayer(player) {
  const lines = dedupeCareerStatLines(player?.careerStats);
  const out = {};
  for (const k of PLAYER_STAT_ORDER) out[k] = 0;
  for (const line of lines) {
    for (const k of PLAYER_STAT_ORDER) {
      out[k] += CAREER_FIELD[k](line);
    }
  }
  return out;
}

function topNPlayersByCareer(players, recordKey, n = 10) {
  const rows = [];
  for (const p of players || []) {
    const totals = careerTotalsFromPlayer(p);
    const v = num(totals[recordKey]);
    if (v <= 0) continue;
    rows.push({
      recordKey,
      label: RECORD_LABELS[recordKey],
      value: v,
      playerId: p.id ?? p.playerId,
      playerName: p.name,
      position: p.pos,
      teamId: p.teamId ?? null,
      teamName: null,
      teamAbbr: null,
      year: null,
      sourceSeasonId: null,
      statKey: recordKey,
      source: 'careerStats',
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return rows.slice(0, n);
}

function bestSingleSeasonFromArchives(leagueHistory, recordKey) {
  let best = null;
  for (const season of leagueHistory || []) {
    const leaders = season?.playerStatLeaders ?? {};
    const archiveKey = Object.keys(ARCHIVE_LEADER_TO_RECORD).find((k) => ARCHIVE_LEADER_TO_RECORD[k] === recordKey);
    if (!archiveKey) continue;
    const leader = leaders[archiveKey];
    const row = leaderEntryToRecordRow(recordKey, leader, season);
    if (!row) continue;
    if (!best || row.value > best.value) best = row;
  }
  return best;
}

function scanSeasonStatsForBest(leagueHistory, pickValueFn, recordKey) {
  let best = null;
  for (const season of leagueHistory || []) {
    const stats = season?.playerStats ?? season?.seasonStats ?? [];
    if (!Array.isArray(stats) || !stats.length) continue;
    const year = Number(season?.year ?? 0) || null;
    const seasonId = season?.seasonId ?? season?.id ?? null;
    for (const s of stats) {
      const v = num(pickValueFn(s));
      if (v <= 0) continue;
      const cand = {
        recordKey,
        label: RECORD_LABELS[recordKey],
        value: v,
        playerId: s.playerId ?? null,
        playerName: s.name ?? null,
        position: s.pos ?? null,
        teamId: s.teamId ?? null,
        teamName: null,
        teamAbbr: null,
        year,
        sourceSeasonId: seasonId,
        statKey: recordKey,
        source: 'archivedSeason',
      };
      if (!best || cand.value > best.value) best = cand;
    }
  }
  return best;
}

function singleSeasonBestForKey(leagueHistory, recordKey) {
  const fromLeaders = bestSingleSeasonFromArchives(leagueHistory, recordKey);
  const pickFns = {
    [RECORD_KEYS.passingYards]: (s) => readFromTotals(s.totals, ['passYd', 'passingYards']),
    [RECORD_KEYS.passingTD]: (s) => readFromTotals(s.totals, ['passTD', 'passingTd']),
    [RECORD_KEYS.rushingYards]: (s) => readFromTotals(s.totals, ['rushYd', 'rushingYards']),
    [RECORD_KEYS.rushingTD]: (s) => readFromTotals(s.totals, ['rushTD', 'rushingTd']),
    [RECORD_KEYS.receivingYards]: (s) => readFromTotals(s.totals, ['recYd', 'receivingYards']),
    [RECORD_KEYS.receivingTD]: (s) => readFromTotals(s.totals, ['recTD', 'receivingTd']),
    [RECORD_KEYS.tackles]: (s) => readFromTotals(s.totals, ['tackles']),
    [RECORD_KEYS.sacks]: (s) => readFromTotals(s.totals, ['sacks']),
    [RECORD_KEYS.interceptions]: (s) => defensiveInterceptionsSeasonValue(s),
    [RECORD_KEYS.fieldGoalsMade]: (s) => readFromTotals(s.totals, ['fgMade', 'fieldGoalsMade']),
  };
  const fromStats = scanSeasonStatsForBest(leagueHistory, pickFns[recordKey], recordKey);
  if (!fromLeaders) return fromStats;
  if (!fromStats) return fromLeaders;
  return fromStats.value > fromLeaders.value ? fromStats : fromLeaders;
}

function mergeRecordRowPreferMax(existing, incoming) {
  if (!incoming || num(incoming.value) <= 0) return existing ?? null;
  if (!existing || num(existing.value) <= 0) return incoming;
  if (num(incoming.value) > num(existing.value)) return incoming;
  return existing;
}

function teamRecordFromStandings(leagueHistory, isBetter) {
  let best = null;
  for (const season of leagueHistory || []) {
    const standings = season?.standings ?? [];
    const year = Number(season?.year ?? 0) || null;
    const seasonId = season?.seasonId ?? season?.id ?? null;
    for (const t of standings) {
      const games = seasonGamesFromStandings(t);
      if (games <= 0) continue;
      const pf = num(t.pf ?? t.ptsFor);
      const pa = num(t.pa ?? t.ptsAgainst);
      const wins = num(t.wins);
      const losses = num(t.losses);
      const ties = num(t.ties);
      const winPct = (wins + ties * 0.5) / games;
      const ppg = pf / games;
      const papg = pa / games;
      const diff = pf - pa;
      const cand = {
        teamId: t.id,
        teamName: t.name ?? null,
        teamAbbr: t.abbr ?? null,
        year,
        sourceSeasonId: seasonId,
        wins,
        losses,
        ties,
        games,
        pf,
        pa,
        winPct,
        ppg,
        papg,
        pointDifferential: diff,
      };
      if (!best || isBetter(cand, best)) best = cand;
    }
  }
  return best;
}

function buildTeamSeasonBlock(leagueHistory) {
  const wins = teamRecordFromStandings(leagueHistory, (a, b) => a.wins > b.wins);
  const winPct = teamRecordFromStandings(
    leagueHistory,
    (a, b) => a.winPct > b.winPct || (a.winPct === b.winPct && a.wins > b.wins),
  );
  const pointsFor = teamRecordFromStandings(leagueHistory, (a, b) => a.pf > b.pf);
  const pointsAllowed = teamRecordFromStandings(leagueHistory, (a, b) => a.pa < b.pa);
  const pointDifferential = teamRecordFromStandings(leagueHistory, (a, b) => a.pointDifferential > b.pointDifferential);
  const pointsPerGame = teamRecordFromStandings(leagueHistory, (a, b) => a.ppg > b.ppg);
  const pointsAllowedPerGame = teamRecordFromStandings(leagueHistory, (a, b) => a.papg < b.papg);

  const toRow = (key, label, src, valuePick) => {
    if (!src) return { ...blankTeamRow(), recordKey: key, label };
    return {
      recordKey: key,
      label,
      value: valuePick(src),
      teamId: src.teamId,
      teamName: src.teamName,
      teamAbbr: src.teamAbbr,
      year: src.year,
      sourceSeasonId: src.sourceSeasonId,
      source: 'archivedSeason',
    };
  };

  return {
    wins: toRow('wins', 'Most wins in a season', wins, (s) => s.wins),
    winPct: toRow('winPct', 'Best win percentage (min 1 game)', winPct, (s) => Math.round(s.winPct * 1000) / 1000),
    pointsFor: toRow('pointsFor', 'Most points scored (season)', pointsFor, (s) => s.pf),
    pointsAllowed: toRow('pointsAllowed', 'Fewest points allowed (season)', pointsAllowed, (s) => s.pa),
    pointDifferential: toRow('pointDifferential', 'Best point differential', pointDifferential, (s) => s.pointDifferential),
    pointsPerGame: toRow('pointsPerGame', 'Best points per game', pointsPerGame, (s) => Math.round(s.ppg * 100) / 100),
    pointsAllowedPerGame: toRow('pointsAllowedPerGame', 'Fewest points allowed per game', pointsAllowedPerGame, (s) => Math.round(s.papg * 100) / 100),
  };
}

/** Legacy `recordBook.singleSeason` keys from pre-V1 saves */
const LEGACY_TO_CANON = {
  passYd: RECORD_KEYS.passingYards,
  passTD: RECORD_KEYS.passingTD,
  rushYd: RECORD_KEYS.rushingYards,
  rushTD: RECORD_KEYS.rushingTD,
  recYd: RECORD_KEYS.receivingYards,
  recTD: RECORD_KEYS.receivingTD,
  tackles: RECORD_KEYS.tackles,
  sacks: RECORD_KEYS.sacks,
  interceptions: RECORD_KEYS.interceptions,
};

function migrateLegacySingleSeason(previousRecordBook) {
  const out = {};
  const legacy = previousRecordBook?.singleSeason ?? {};
  for (const [legacyKey, row] of Object.entries(legacy)) {
    const canon = LEGACY_TO_CANON[legacyKey];
    if (!canon) continue;
    const normalized = normalizeLegacySingleRow(canon, row);
    out[canon] = mergeRecordRowPreferMax(out[canon], normalized);
  }
  return out;
}

export function rebuildRecordBookV1({ leagueHistory = [], players = [], previousRecordBook = null } = {}) {
  const migrated = migrateLegacySingleSeason(previousRecordBook);
  const singleSeason = {};
  for (const key of PLAYER_STAT_ORDER) {
    const computed = singleSeasonBestForKey(leagueHistory, key);
    const prevRow = mergeRecordRowPreferMax(
      migrated[key],
      normalizeLegacySingleRow(key, previousRecordBook?.singleSeasonV1?.[key]),
    );
    singleSeason[key] = mergeRecordRowPreferMax(prevRow, computed);
  }

  const careerLeaders = {};
  for (const key of PLAYER_STAT_ORDER) {
    careerLeaders[key] = topNPlayersByCareer(players, key, 10);
  }

  const teamSeason = buildTeamSeasonBlock(leagueHistory);
  const prevTeamV1 = previousRecordBook?.teamSeasonV1 ?? {};
  const legacyTeam = previousRecordBook?.team ?? {};
  const legacyWins = legacyTeam.winsSeason;
  if (legacyWins && num(legacyWins.value) > num(teamSeason.wins?.value)) {
    teamSeason.wins = {
      recordKey: 'wins',
      label: 'Most wins in a season',
      value: num(legacyWins.value),
      teamId: legacyWins.teamId,
      teamName: legacyWins.teamName ?? null,
      teamAbbr: legacyWins.teamAbbr ?? null,
      year: legacyWins.season ?? legacyWins.year ?? null,
      sourceSeasonId: legacyWins.sourceSeasonId ?? null,
      source: 'legacyRecordBook',
    };
  }
  for (const tk of TEAM_RECORD_ORDER) {
    const pr = prevTeamV1[tk];
    if (!pr || num(pr.value) <= 0) continue;
    const cur = teamSeason[tk];
    const curVal = num(cur?.value);
    const prVal = num(pr.value);
    const curMissing = !cur?.sourceSeasonId && curVal === 0;
    const higherIsBetter = !['pointsAllowed', 'pointsAllowedPerGame'].includes(tk);
    const keepPrev = higherIsBetter
      ? (curMissing || prVal > curVal)
      : (curMissing || prVal < curVal);
    if (keepPrev) teamSeason[tk] = { ...pr, recordKey: tk };
  }

  const partialCareer = (leagueHistory || []).length > 0
    && !(players || []).some((p) => Array.isArray(p?.careerStats) && p.careerStats.length > 0);
  const partialSingleSeason = !(leagueHistory || []).some(
    (s) => s?.playerStatLeaders && Object.keys(s.playerStatLeaders).length > 0,
  );

  return {
    schemaVersion: RECORD_BOOK_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    singleSeasonV1: singleSeason,
    careerLeadersV1: careerLeaders,
    teamSeasonV1: teamSeason,
    meta: {
      partialCareer: partialCareer && (players || []).length > 0,
      partialSingleSeason,
      careerSourceNote:
        'Career totals include archived seasons stored on each player in this save. Players without career lines only contribute once their seasons are archived.',
    },
  };
}

function normalizeLegacySingleRow(recordKey, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = num(raw.value);
  if (value <= 0) return null;
  const playerId = raw.playerId ?? raw.holderId ?? null;
  return {
    recordKey,
    label: RECORD_LABELS[recordKey] ?? recordKey,
    value,
    playerId,
    playerName: raw.playerName ?? raw.name ?? raw.holderName ?? null,
    position: raw.position ?? raw.pos ?? null,
    teamId: raw.teamId ?? null,
    teamName: raw.teamName ?? null,
    teamAbbr: raw.team ?? raw.teamAbbr ?? null,
    year: raw.year ?? raw.season ?? null,
    sourceSeasonId: raw.sourceSeasonId ?? null,
    statKey: raw.statKey ?? null,
    source: raw.source ?? 'legacyRecordBook',
  };
}

/**
 * Player-facing lines: single-season record holder, career rank, career #1.
 */
const CANON_TO_LEGACY_SINGLE = {
  [RECORD_KEYS.passingYards]: 'passYd',
  [RECORD_KEYS.passingTD]: 'passTD',
  [RECORD_KEYS.rushingYards]: 'rushYd',
  [RECORD_KEYS.rushingTD]: 'rushTD',
  [RECORD_KEYS.receivingYards]: 'recYd',
  [RECORD_KEYS.receivingTD]: 'recTD',
  [RECORD_KEYS.tackles]: 'tackles',
  [RECORD_KEYS.sacks]: 'sacks',
  [RECORD_KEYS.interceptions]: 'interceptions',
  [RECORD_KEYS.fieldGoalsMade]: 'fgMade',
};

/**
 * Populate legacy `singleSeason` / `career` keys for older UI (e.g. LeagueHistory Record Book tab).
 */
export function mirrorRecordBookForLegacyUi(v1Book) {
  const singleSeason = {};
  for (const [canon, row] of Object.entries(v1Book?.singleSeasonV1 ?? {})) {
    const leg = CANON_TO_LEGACY_SINGLE[canon];
    if (!leg || !row || num(row.value) <= 0) continue;
    singleSeason[leg] = {
      playerId: row.playerId,
      name: row.playerName,
      pos: row.position,
      team: row.teamAbbr,
      value: row.value,
      year: row.year,
    };
  }
  const career = {};
  for (const [canon, list] of Object.entries(v1Book?.careerLeadersV1 ?? {})) {
    const leg = CANON_TO_LEGACY_SINGLE[canon];
    if (!leg || !Array.isArray(list) || !list[0]) continue;
    const top = list[0];
    career[leg] = {
      holderId: top.playerId,
      holderName: top.playerName,
      playerId: top.playerId,
      name: top.playerName,
      pos: top.position,
      teamId: top.teamId,
      season: top.year,
      value: top.value,
    };
  }
  const topWins = v1Book?.teamSeasonV1?.wins;
  const team = {
    winsSeason: topWins && num(topWins.value) > 0
      ? {
        holderId: null,
        holderName: null,
        teamId: topWins.teamId,
        teamAbbr: topWins.teamAbbr,
        season: topWins.year,
        value: topWins.value,
      }
      : { holderId: null, holderName: null, teamId: null, teamAbbr: null, season: null, value: 0 },
    championships: { holderId: null, holderName: null, teamId: null, teamAbbr: null, season: null, value: 0 },
    playoffStreak: { holderId: null, holderName: null, teamId: null, teamAbbr: null, season: null, value: 0 },
  };
  return { singleSeason, career, team };
}

export function buildPlayerRecordContext(recordBook, playerId) {
  if (playerId == null || !recordBook) return [];
  const pid = String(playerId);
  const lines = [];
  const ss = recordBook.singleSeasonV1 ?? {};
  const cl = recordBook.careerLeadersV1 ?? {};

  for (const key of PLAYER_STAT_ORDER) {
    const holder = ss[key];
    if (holder && holder.playerId != null && String(holder.playerId) === pid && num(holder.value) > 0) {
      lines.push({
        kind: 'singleSeasonRecord',
        text: `Single-season ${RECORD_LABELS[key]} record (${num(holder.value).toLocaleString()}, ${holder.year ?? '—'})`,
        recordKey: key,
      });
    }
  }

  for (const key of PLAYER_STAT_ORDER) {
    const board = Array.isArray(cl[key]) ? cl[key] : [];
    const idx = board.findIndex((r) => r.playerId != null && String(r.playerId) === pid);
    if (idx === 0 && board.length) {
      lines.push({
        kind: 'careerLeader',
        text: `Career ${RECORD_LABELS[key]} leader (${num(board[0].value).toLocaleString()})`,
        recordKey: key,
      });
    } else if (idx > 0) {
      lines.push({
        kind: 'careerRank',
        text: `#${idx + 1} all-time ${RECORD_LABELS[key]} (${num(board[idx].value).toLocaleString()})`,
        recordKey: key,
      });
    }
  }

  return lines;
}
