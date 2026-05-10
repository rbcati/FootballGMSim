/**
 * Pure franchise history / records model from archived seasons (+ optional HOF payload).
 * No simulation, no persistence writes.
 */

import {
  ARCHIVE_LEADER_TO_RECORD,
  RECORD_BOOK_PLAYER_KEYS,
  RECORD_LABELS,
  RECORD_KEYS,
  careerTotalsFromPlayer,
  dedupeCareerStatLines,
  defensiveInterceptionsSeasonValue,
  leaderEntryToRecordRow,
} from './recordBookV1.js';

const PLAYOFF_CALIBER_WINS = 10;
const ELITE_WINS = 12;

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function seasonGamesFromStandings(row) {
  return num(row?.wins) + num(row?.losses) + num(row?.ties);
}

function normAbbr(a) {
  if (a == null || a === '') return '';
  return String(a).trim().toUpperCase();
}

function teamMatchesFranchise(row, teamId, teamAbbr) {
  if (!row) return false;
  const tid = row.teamId ?? row.id;
  if (teamId != null && Number.isFinite(Number(teamId)) && tid != null && Number(tid) === Number(teamId)) return true;
  const ab = normAbbr(row.teamAbbr ?? row.abbr);
  const want = normAbbr(teamAbbr);
  if (want && ab === want) return true;
  return false;
}

function findFranchiseStanding(season, teamId, teamAbbr) {
  const rows = season?.standings ?? [];
  const byId = rows.find((t) => teamId != null && Number(t?.id) === Number(teamId));
  if (byId) return byId;
  if (teamAbbr) return rows.find((t) => normAbbr(t?.abbr) === normAbbr(teamAbbr)) ?? null;
  return null;
}

function championMatches(season, teamId, teamAbbr) {
  const c = season?.champion;
  if (!c) return false;
  if (teamId != null && c.id != null && Number(c.id) === Number(teamId)) return true;
  if (teamAbbr && normAbbr(c.abbr) === normAbbr(teamAbbr)) return true;
  return false;
}

function runnerUpMatches(season, teamId, teamAbbr) {
  const r = season?.runnerUp;
  if (!r) return false;
  if (teamId != null && r.id != null && Number(r.id) === Number(teamId)) return true;
  if (teamAbbr && normAbbr(r.abbr) === normAbbr(teamAbbr)) return true;
  return false;
}

function teamInBracketSnapshot(snapshot, teamId) {
  if (!snapshot || snapshot.mode === 'empty' || !Array.isArray(snapshot.rounds)) return false;
  const tid = Number(teamId);
  for (const r of snapshot.rounds) {
    for (const g of r.games ?? []) {
      if (Number(g?.homeId) === tid || Number(g?.awayId) === tid) return true;
    }
  }
  return false;
}

function leagueHasAnyBracketArchive(seasons) {
  return (seasons || []).some((s) => s?.playoffBracketSnapshot && s.playoffBracketSnapshot.mode !== 'empty');
}

function seasonHasTruePlayoffAppearance(season, teamId, teamAbbr) {
  if (championMatches(season, teamId, teamAbbr) || runnerUpMatches(season, teamId, teamAbbr)) return true;
  const snap = season?.playoffBracketSnapshot;
  if (snap && snap.mode !== 'empty' && teamId != null && Number.isFinite(Number(teamId))) {
    return teamInBracketSnapshot(snap, teamId);
  }
  return false;
}

/** Save has any documented postseason outcome or bracket (enables "Playoff appearances" labeling). */
function actualPostseasonArchivePresent(seasons) {
  return (seasons || []).some((s) => {
    if (s?.champion || s?.runnerUp) return true;
    if (s?.playoffBracketSnapshot && s.playoffBracketSnapshot.mode !== 'empty') return true;
    return false;
  });
}

function buildSeasonTeamMap(season) {
  const map = {};
  for (const row of season?.standings ?? []) {
    map[Number(row?.id)] = row;
  }
  return map;
}

function opponentAbbrForGame(season, game, franchiseTeamId) {
  const map = buildSeasonTeamMap(season);
  const hid = Number(game?.homeId);
  const aid = Number(game?.awayId);
  if (hid === franchiseTeamId) return map[aid]?.abbr ?? 'OPP';
  if (aid === franchiseTeamId) return map[hid]?.abbr ?? 'OPP';
  return 'OPP';
}

function franchiseStandingMetrics(season, standing, teamId, teamAbbr) {
  const games = seasonGamesFromStandings(standing);
  if (games <= 0) return null;
  const pf = num(standing.pf ?? standing.ptsFor);
  const pa = num(standing.pa ?? standing.ptsAgainst);
  const wins = num(standing.wins);
  const losses = num(standing.losses);
  const ties = num(standing.ties);
  const winPct = (wins + ties * 0.5) / games;
  return {
    year: Number(season?.year ?? season?.season ?? 0) || 0,
    seasonId: season?.seasonId ?? season?.id ?? null,
    wins,
    losses,
    ties,
    games,
    pf,
    pa,
    winPct,
    pointDifferential: pf - pa,
    ppg: pf / games,
    papg: pa / games,
    champion: championMatches(season, teamId, teamAbbr),
    runnerUp: runnerUpMatches(season, teamId, teamAbbr),
    playoffCaliber: wins >= PLAYOFF_CALIBER_WINS,
    losingSeason: wins < losses,
    eliteSeason: wins >= ELITE_WINS,
    truePlayoff: seasonHasTruePlayoffAppearance(season, teamId, teamAbbr),
    mvp: season?.awards?.mvp ?? null,
  };
}

function pickBetterSeason(a, b, mode) {
  if (!a) return b;
  if (!b) return a;
  if (mode === 'best') {
    if (a.wins !== b.wins) return a.wins > b.wins ? a : b;
    if (a.winPct !== b.winPct) return a.winPct > b.winPct ? a : b;
    return a.pointDifferential >= b.pointDifferential ? a : b;
  }
  if (a.wins !== b.wins) return a.wins < b.wins ? a : b;
  if (a.winPct !== b.winPct) return a.winPct < b.winPct ? a : b;
  return a.pointDifferential <= b.pointDifferential ? a : b;
}

function franchiseTeamSeasonBlock(seasonRows) {
  const candidates = seasonRows.filter(Boolean);
  if (!candidates.length) {
    return {
      wins: null,
      winPct: null,
      pointsFor: null,
      pointsAllowed: null,
      pointDifferential: null,
      pointsPerGame: null,
      pointsAllowedPerGame: null,
    };
  }
  let bestWins = null;
  let bestWinPct = null;
  let bestPf = null;
  let bestPa = null;
  let bestDiff = null;
  let bestPpg = null;
  let bestPapg = null;
  for (const c of candidates) {
    bestWins = pickBetterSeason(bestWins, c, 'best');
    if (
      !bestWinPct
      || c.winPct > bestWinPct.winPct
      || (c.winPct === bestWinPct.winPct && c.wins > bestWinPct.wins)
    ) bestWinPct = c;
    bestPf = pickBetterSeason(bestPf, c, 'best');
    bestPa = bestPa == null || c.pa < bestPa.pa ? c : bestPa;
    bestDiff = pickBetterSeason(bestDiff, c, 'best');
    bestPpg = pickBetterSeason(bestPpg, c, 'best');
    bestPapg = bestPapg == null || c.papg < bestPapg.papg ? c : bestPapg;
  }
  const toRow = (key, label, src, valuePick) => {
    if (!src) return { recordKey: key, label, value: null, year: null, sourceSeasonId: null, source: 'franchise' };
    return {
      recordKey: key,
      label,
      value: valuePick(src),
      teamId: src.teamId ?? null,
      teamAbbr: src.teamAbbr ?? null,
      year: src.year,
      sourceSeasonId: src.sourceSeasonId ?? null,
      source: 'franchiseArchive',
    };
  };
  const tid = candidates[0]?.teamId ?? null;
  const ab = candidates[0]?.teamAbbr ?? null;
  const attach = (row) => (row ? { ...row, teamId: tid, teamAbbr: ab } : row);
  return {
    wins: attach(toRow('wins', 'Most wins in a season', bestWins, (s) => s.wins)),
    winPct: attach(toRow('winPct', 'Best win percentage', bestWinPct, (s) => Math.round(s.winPct * 1000) / 1000)),
    pointsFor: attach(toRow('pointsFor', 'Most points scored (season)', bestPf, (s) => s.pf)),
    pointsAllowed: attach(toRow('pointsAllowed', 'Fewest points allowed (season)', bestPa, (s) => s.pa)),
    pointDifferential: attach(toRow('pointDifferential', 'Best point differential', bestDiff, (s) => s.pointDifferential)),
    pointsPerGame: attach(toRow('pointsPerGame', 'Best points per game', bestPpg, (s) => Math.round(s.ppg * 100) / 100)),
    pointsAllowedPerGame: attach(toRow('pointsAllowedPerGame', 'Fewest points allowed per game', bestPapg, (s) => Math.round(s.papg * 100) / 100)),
  };
}

function readFromTotals(totals, keys) {
  if (!totals || typeof totals !== 'object') return 0;
  for (const k of keys) {
    const v = num(totals[k]);
    if (v !== 0) return v;
  }
  return 0;
}

const STAT_ROW_VALUE = {
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

function collectAwardRows(season, teamId, teamAbbr) {
  const out = [];
  const awards = season?.awards;
  if (!awards || typeof awards !== 'object') return out;
  for (const [awardKey, v] of Object.entries(awards)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (v.playerId == null && v.id == null) continue;
    const pid = v.playerId ?? v.id;
    if (!teamMatchesFranchise(v, teamId, teamAbbr)) continue;
    out.push({
      awardKey,
      playerId: pid,
      name: v.name ?? null,
      pos: v.pos ?? v.position ?? null,
      year: Number(season?.year ?? 0) || null,
    });
  }
  return out;
}

function archiveRowToCareerLine(row, seasonYear) {
  const t = row?.totals ?? row?.stats ?? {};
  const seasonToken = row?.season ?? row?.year ?? seasonYear;
  const wrap = { ...row, totals: t, pos: row?.pos };
  return {
    season: seasonToken,
    passYds: num(t.passYd ?? t.passingYards),
    passTDs: num(t.passTD ?? t.passingTd),
    rushYds: num(t.rushYd ?? t.rushingYards),
    rushTDs: num(t.rushTD ?? t.rushingTd),
    recYds: num(t.recYd ?? t.receivingYards),
    recTDs: num(t.recTD ?? t.receivingTd),
    tackles: num(t.tackles),
    sacks: num(t.sacks),
    fgMade: num(t.fgMade ?? t.fieldGoalsMade),
    defInts: defensiveInterceptionsSeasonValue(wrap),
  };
}

function buildFranchiseCareerLeadersFromArchives(seasons, teamId, teamAbbr) {
  const byPlayer = new Map();
  for (const season of seasons || []) {
    const year = Number(season?.year ?? 0) || null;
    const seasonId = season?.seasonId ?? season?.id ?? null;
    const pool = [...(season.playerStats ?? []), ...(season.seasonStats ?? [])];
    if (!Array.isArray(pool) || !pool.length) continue;
    for (const row of pool) {
      if (!teamMatchesFranchise(row, teamId, teamAbbr)) continue;
      const pid = row.playerId ?? row.id;
      if (pid == null) continue;
      const key = String(pid);
      if (!byPlayer.has(key)) byPlayer.set(key, { playerId: pid, name: row.name ?? null, pos: row.pos ?? null, lines: [] });
      byPlayer.get(key).lines.push(archiveRowToCareerLine(row, year ?? seasonId));
    }
  }
  const leaders = {};
  for (const k of RECORD_BOOK_PLAYER_KEYS) leaders[k] = [];
  for (const { playerId, name, pos, lines } of byPlayer.values()) {
    if (!lines.length) continue;
    const deduped = dedupeCareerStatLines(lines);
    const synthetic = { id: playerId, name, pos, careerStats: deduped };
    const totals = careerTotalsFromPlayer(synthetic);
    for (const k of RECORD_BOOK_PLAYER_KEYS) {
      const v = num(totals[k]);
      if (v <= 0) continue;
      leaders[k].push({
        recordKey: k,
        label: RECORD_LABELS[k],
        value: v,
        playerId,
        playerName: name,
        position: pos,
        source: 'franchiseCareerArchive',
      });
    }
  }
  for (const k of RECORD_BOOK_PLAYER_KEYS) {
    leaders[k].sort((a, b) => b.value - a.value);
    leaders[k] = leaders[k].slice(0, 5);
  }
  return { leaders, hadPerSeasonStats: byPlayer.size > 0 };
}

function summarizeBracket(snapshot) {
  if (!snapshot || snapshot.mode === 'empty') return null;
  const parts = [];
  for (const r of snapshot.rounds ?? []) {
    const g0 = (r.games ?? [])[0];
    if (g0) parts.push(`${r.label}: ${g0.awayAbbr ?? '?'} ${g0.awayScore ?? '—'}-${g0.homeScore ?? '—'} ${g0.homeAbbr ?? '?'}`);
  }
  return parts.slice(0, 4).join(' · ') || null;
}

function buildPlayoffHistoryRows(seasons, teamId, teamAbbr) {
  const rows = [];
  for (const season of seasons || []) {
    const year = Number(season?.year ?? 0) || 0;
    if (!year) continue;
    const isChamp = championMatches(season, teamId, teamAbbr);
    const isRun = runnerUpMatches(season, teamId, teamAbbr);
    if (!isChamp && !isRun && !seasonHasTruePlayoffAppearance(season, teamId, teamAbbr)) continue;
    const cg = (season.notableGames ?? []).find((g) => g.type === 'championship');
    const franchiseSide = cg && teamId != null && (Number(cg.homeId) === Number(teamId) || Number(cg.awayId) === Number(teamId));
    rows.push({
      year,
      role: isChamp ? 'champion' : isRun ? 'runner_up' : 'playoffs',
      finalsText: season?.playoffSummary?.finals ?? null,
      bracketSummary: summarizeBracket(season.playoffBracketSnapshot),
      championshipScores: franchiseSide && cg
        ? { homeScore: cg.homeScore, awayScore: cg.awayScore, week: cg.week, gameId: cg.gameId ?? cg.id }
        : null,
    });
  }
  return rows.sort((a, b) => b.year - a.year);
}

function buildBestGames(seasons, teamId, teamAbbr) {
  if (teamId == null || !Number.isFinite(Number(teamId))) return [];
  const tid = Number(teamId);
  const candidates = [];

  const pushCand = (ctx) => {
    if (!ctx.gameId && !ctx.id) return;
    candidates.push(ctx);
  };

  for (const season of seasons || []) {
    const year = Number(season?.year ?? 0) || 0;
    const teamMap = buildSeasonTeamMap(season);
    for (const ng of season.notableGames ?? []) {
      const hid = Number(ng?.homeId);
      const aid = Number(ng?.awayId);
      if (hid !== tid && aid !== tid) continue;
      if (!Number.isFinite(Number(ng?.homeScore)) || !Number.isFinite(Number(ng?.awayScore))) continue;
      const opp = opponentAbbrForGame(season, ng, tid);
      const won = (hid === tid && num(ng.homeScore) > num(ng.awayScore)) || (aid === tid && num(ng.awayScore) > num(ng.homeScore));
      let reason = ng.type === 'championship' ? 'Championship game' : ng.type === 'highest_scoring' ? 'League highest-scoring game' : 'Notable game';
      pushCand({
        gameId: ng.gameId ?? ng.id,
        id: ng.id ?? ng.gameId,
        year,
        week: ng.week,
        homeId: hid,
        awayId: aid,
        home: teamMap[hid],
        away: teamMap[aid],
        homeScore: ng.homeScore,
        awayScore: ng.awayScore,
        opponentAbbr: opp,
        reason,
        margin: Math.abs(num(ng.homeScore) - num(ng.awayScore)),
        total: num(ng.homeScore) + num(ng.awayScore),
        won,
      });
    }

    for (const g of season.gameIndex ?? []) {
      const hid = Number(g?.homeId);
      const aid = Number(g?.awayId);
      if (hid !== tid && aid !== tid) continue;
      if (!Number.isFinite(Number(g?.homeScore)) || !Number.isFinite(Number(g?.awayScore))) continue;
      const hs = num(g.homeScore);
      const as = num(g.awayScore);
      const margin = Math.abs(hs - as);
      const total = hs + as;
      const won = (hid === tid && hs > as) || (aid === tid && as > hs);
      let reason = 'Regular season';
      if (margin <= 3 && margin > 0) reason = won ? 'Close win' : 'Close loss';
      else if (margin >= 28 && won) reason = 'Big win';
      pushCand({
        gameId: g.id,
        id: g.id,
        year,
        week: g.week,
        homeId: hid,
        awayId: aid,
        home: teamMap[hid],
        away: teamMap[aid],
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        opponentAbbr: opponentAbbrForGame(season, g, tid),
        reason,
        margin,
        total,
        won,
      });
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const k = `${c.year}-${c.week}-${c.gameId ?? c.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }

  const highest = [...uniq].sort((a, b) => b.total - a.total).slice(0, 3).map((c) => ({ ...c, reason: c.total >= 55 ? 'High-scoring game' : c.reason }));
  const bigWins = [...uniq].filter((c) => c.won).sort((a, b) => b.margin - a.margin).slice(0, 3).map((c) => ({ ...c, reason: 'Biggest win margin' }));
  const close = [...uniq].filter((c) => c.margin >= 1 && c.margin <= 3).sort((a, b) => b.year - a.year).slice(0, 4);

  const merged = [...highest, ...bigWins, ...close];
  const out = [];
  const oseen = new Set();
  for (const m of merged) {
    const k = `${m.year}-${m.week}-${m.gameId ?? m.id}`;
    if (oseen.has(k)) continue;
    oseen.add(k);
    out.push(m);
  }
  return out.slice(0, 12);
}

function buildMilestones(summary, bestSeason, worstSeason, titles) {
  const m = [];
  if (titles > 0 && bestSeason) m.push({ type: 'peak', text: `Best archived season: ${bestSeason.year} (${bestSeason.wins}-${bestSeason.losses}${bestSeason.ties ? `-${bestSeason.ties}` : ''}).` });
  if (worstSeason) m.push({ type: 'valley', text: `Toughest archived season: ${worstSeason.year} (${worstSeason.wins}-${worstSeason.losses}${worstSeason.ties ? `-${worstSeason.ties}` : ''}).` });
  if (summary.titles > 0) m.push({ type: 'titles', text: `${summary.titles} championship${summary.titles === 1 ? '' : 's'} in the archive window.` });
  return m.slice(0, 8);
}

const LEGEND_REASON = {
  HOF: { rank: 100, label: 'Hall of Famer' },
  MVP: { rank: 85, label: 'League MVP' },
  CHAMP_STAR: { rank: 78, label: 'Championship star' },
  RECORD: { rank: 60, label: 'Franchise record holder' },
  CAREER: { rank: 45, label: 'Franchise career leader' },
};

function mergeLegend(map, entry) {
  const id = String(entry.playerId);
  const prev = map.get(id);
  if (!prev || entry.rank > prev.rank) {
    map.set(id, { ...entry });
    return;
  }
  if (entry.rank === prev.rank && num(entry.legacyScore) > num(prev.legacyScore)) {
    map.set(id, { ...prev, ...entry });
  }
}

function buildFranchiseLegends({
  seasons,
  teamId,
  teamAbbr,
  franchiseRecords,
  careerLeadersHadStats,
  careerLeaders,
  hallOfFamePlayers,
  hallOfFameClasses,
}) {
  const map = new Map();

  for (const cls of hallOfFameClasses || []) {
    for (const ind of cls.inductees || []) {
      const match = teamMatchesFranchise(
        { teamId: ind.primaryTeamId, teamAbbr: ind.primaryTeamAbbr },
        teamId,
        teamAbbr,
      );
      if (!match) continue;
      mergeLegend(map, {
        playerId: ind.playerId,
        name: ind.name,
        pos: ind.pos,
        yearsSummary: ind.careerSummary ? String(ind.careerSummary).slice(0, 80) : `Class of ${cls.year}`,
        legacyScore: ind.legacyScore ?? ind.score ?? null,
        topReason: LEGEND_REASON.HOF.label,
        rank: LEGEND_REASON.HOF.rank,
        hof: true,
      });
    }
  }

  for (const p of hallOfFamePlayers || []) {
    const abMatch = normAbbr(p.primaryTeamAbbr ?? p.primaryTeam) === normAbbr(teamAbbr);
    const hist = Array.isArray(p.teamHistory) && p.teamHistory.some((x) => normAbbr(x) === normAbbr(teamAbbr));
    if (!abMatch && !hist) continue;
    if (p.fromClassOnly && map.has(String(p.id))) continue;
    mergeLegend(map, {
      playerId: p.id,
      name: p.name,
      pos: p.pos,
      yearsSummary: p.careerSummary ?? (hist ? `Played for ${teamAbbr}` : null),
      legacyScore: p.legacyScore ?? p.hofScore ?? null,
      topReason: LEGEND_REASON.HOF.label,
      rank: LEGEND_REASON.HOF.rank,
      hof: true,
    });
  }

  for (const season of seasons || []) {
    for (const a of collectAwardRows(season, teamId, teamAbbr)) {
      if (String(a.awardKey).toLowerCase() === 'mvp') {
        mergeLegend(map, {
          playerId: a.playerId,
          name: a.name,
          pos: a.pos,
          yearsSummary: `${a.year} ${a.awardKey}`,
          legacyScore: null,
          topReason: LEGEND_REASON.MVP.label,
          rank: LEGEND_REASON.MVP.rank,
        });
      }
    }
    if (championMatches(season, teamId, teamAbbr)) {
      const sb = season?.awards?.sbMvp;
      if (sb?.playerId != null) {
        mergeLegend(map, {
          playerId: sb.playerId,
          name: sb.name,
          pos: sb.pos,
          yearsSummary: `${season.year} SB MVP`,
          legacyScore: null,
          topReason: LEGEND_REASON.CHAMP_STAR.label,
          rank: LEGEND_REASON.CHAMP_STAR.rank,
        });
      }
    }
  }

  for (const row of Object.values(franchiseRecords.playerSingleSeason ?? {})) {
    if (!row?.playerId) continue;
    mergeLegend(map, {
      playerId: row.playerId,
      name: row.playerName,
      pos: row.position,
      yearsSummary: row.year ? `${row.year}` : null,
      legacyScore: null,
      topReason: LEGEND_REASON.RECORD.label,
      rank: LEGEND_REASON.RECORD.rank,
    });
  }

  if (careerLeadersHadStats) {
    for (const k of RECORD_BOOK_PLAYER_KEYS) {
      const top = (careerLeaders[k] ?? [])[0];
      if (!top?.playerId) continue;
      mergeLegend(map, {
        playerId: top.playerId,
        name: top.playerName,
        pos: top.position,
        yearsSummary: 'Career (franchise games in archive)',
        legacyScore: null,
        topReason: LEGEND_REASON.CAREER.label,
        rank: LEGEND_REASON.CAREER.rank,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return num(b.legacyScore) - num(a.legacyScore);
  }).slice(0, 24);
}

/**
 * @param {{
 *   teamId: number|string|null,
 *   teamAbbr?: string|null,
 *   teamName?: string|null,
 *   archivedSeasons: any[],
 *   hallOfFamePlayers?: any[],
 *   hallOfFameClasses?: any[],
 * }} args
 */
export function buildFranchiseHistoryModel({
  teamId,
  teamAbbr = null,
  teamName = null,
  archivedSeasons = [],
  hallOfFamePlayers = [],
  hallOfFameClasses = [],
} = {}) {
  const seasonsSorted = [...(archivedSeasons || [])].sort((a, b) => (Number(a?.year ?? 0) - Number(b?.year ?? 0)));
  const tid = teamId != null ? Number(teamId) : null;
  const ab = teamAbbr ?? '';

  const seasonRows = [];
  for (const season of seasonsSorted) {
    let st = findFranchiseStanding(season, tid, ab);
    if (!st && championMatches(season, tid, ab) && season.champion) {
      const c = season.champion;
      st = {
        id: c.id,
        name: c.name,
        abbr: c.abbr,
        wins: num(c.wins),
        losses: num(c.losses),
        ties: num(c.ties),
        pf: num(c.pf),
        pa: num(c.pa),
      };
    }
    if (!st) continue;
    const m = franchiseStandingMetrics(season, st, tid, ab);
    if (!m) continue;
    seasonRows.push({
      ...m,
      seasonId: season?.seasonId ?? season?.id ?? null,
      teamId: st.id ?? tid,
      teamAbbr: st.abbr ?? ab,
      standing: st,
    });
  }

  const timeline = seasonRows;
  const titles = timeline.filter((t) => t.champion).length;
  const runnerUps = timeline.filter((t) => t.runnerUp).length;
  const playoffCaliberYears = timeline.filter((t) => t.playoffCaliber).length;
  const postseasonArchive = actualPostseasonArchivePresent(archivedSeasons);
  const bracketArchive = leagueHasAnyBracketArchive(archivedSeasons);
  const truePlayoffYears = timeline.filter((t) => t.truePlayoff).length;

  let allW = 0;
  let allL = 0;
  let allT = 0;
  let diffSum = 0;
  for (const t of timeline) {
    allW += t.wins;
    allL += t.losses;
    allT += t.ties;
    diffSum += t.pointDifferential;
  }
  const denom = allW + allL + allT;
  const winPct = denom > 0 ? (allW + allT * 0.5) / denom : 0;

  const bestSeason = timeline.reduce((a, t) => pickBetterSeason(a, t, 'best'), null);
  const worstSeason = timeline.reduce((a, t) => pickBetterSeason(a, t, 'worst'), null);

  const lastFive = timeline.slice(-5);
  const recentFiveYearAvgWins = lastFive.length ? lastFive.reduce((s, t) => s + t.wins, 0) / lastFive.length : 0;
  const avgPointDifferential = timeline.length ? diffSum / timeline.length : 0;

  const titleYears = timeline.filter((t) => t.champion).map((t) => t.year);
  const lastTitleYear = titleYears.length ? Math.max(...titleYears) : null;
  const lastArchivedYear = timeline.length ? timeline[timeline.length - 1].year : null;
  let currentTitleDroughtSeasons = 0;
  if (!titleYears.length) {
    currentTitleDroughtSeasons = timeline.length;
  } else if (lastArchivedYear != null && lastTitleYear != null) {
    currentTitleDroughtSeasons = timeline.filter((t) => t.year > lastTitleYear).length;
  }

  const playerSingleSeason = {};
  for (const recordKey of RECORD_BOOK_PLAYER_KEYS) {
    const archiveKey = Object.keys(ARCHIVE_LEADER_TO_RECORD).find((k) => ARCHIVE_LEADER_TO_RECORD[k] === recordKey);
    if (!archiveKey) continue;
    let best = null;
    for (const season of seasonsSorted) {
      const leader = season?.playerStatLeaders?.[archiveKey];
      if (!leader || !teamMatchesFranchise(leader, tid, ab)) continue;
      const row = leaderEntryToRecordRow(recordKey, leader, season);
      if (!row) continue;
      if (!best || row.value > best.value) best = row;
    }
    for (const season of seasonsSorted) {
      const pool = [...(season.playerStats ?? []), ...(season.seasonStats ?? [])];
      if (!Array.isArray(pool)) continue;
      const pick = STAT_ROW_VALUE[recordKey];
      if (!pick) continue;
      for (const s of pool) {
        if (!teamMatchesFranchise(s, tid, ab)) continue;
        const v = num(pick(s));
        if (v <= 0) continue;
        const year = Number(season?.year ?? 0) || null;
        const cand = {
          recordKey,
          label: RECORD_LABELS[recordKey],
          value: v,
          playerId: s.playerId ?? s.id ?? null,
          playerName: s.name ?? null,
          position: s.pos ?? null,
          teamId: s.teamId ?? null,
          teamAbbr: s.teamAbbr ?? null,
          year,
          sourceSeasonId: season?.seasonId ?? season?.id ?? null,
          source: 'archivedSeason',
        };
        if (!best || cand.value > best.value) best = cand;
      }
    }
    playerSingleSeason[recordKey] = best;
  }

  const metricsForTeamBlock = timeline.map((t) => ({
    year: t.year,
    sourceSeasonId: t.seasonId ?? null,
    teamId: t.teamId,
    teamAbbr: t.teamAbbr,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    games: t.games,
    pf: t.pf,
    pa: t.pa,
    winPct: t.winPct,
    ppg: t.ppg,
    papg: t.papg,
    pointDifferential: t.pointDifferential,
  }));
  const teamSeasonRecords = franchiseTeamSeasonBlock(metricsForTeamBlock);

  const { leaders: careerFranchiseLeaders, hadPerSeasonStats } = buildFranchiseCareerLeadersFromArchives(seasonsSorted, tid, ab);

  const franchiseRecords = {
    teamSeason: teamSeasonRecords,
    playerSingleSeason,
    careerFranchiseLeaders: hadPerSeasonStats ? careerFranchiseLeaders : {},
    careerFranchiseLeadersAvailable: hadPerSeasonStats,
  };

  const playoffHistory = buildPlayoffHistoryRows(seasonsSorted, tid, ab);
  const bestGames = buildBestGames(seasonsSorted, tid, ab);

  const franchiseLegends = buildFranchiseLegends({
    seasons: seasonsSorted,
    teamId: tid,
    teamAbbr: ab,
    franchiseRecords,
    careerLeadersHadStats: hadPerSeasonStats,
    careerLeaders: careerFranchiseLeaders,
    hallOfFamePlayers,
    hallOfFameClasses,
  });

  const summary = {
    seasonsArchived: timeline.length,
    allTimeWins: allW,
    allTimeLosses: allL,
    allTimeTies: allT,
    winPct,
    titles,
    runnerUpFinishes: runnerUps,
    playoffAppearances: truePlayoffYears,
    playoffCaliberYears,
    postseasonArchivePresent: postseasonArchive,
    bracketArchivePresent: bracketArchive,
    bestSeason,
    worstSeason,
    currentTitleDroughtSeasons,
    recentFiveYearAvgWins,
    avgPointDifferential,
  };

  const milestones = buildMilestones(summary, bestSeason, worstSeason, titles);

  return {
    teamId: tid,
    teamName: teamName ?? null,
    teamAbbr: ab || null,
    summary,
    seasons: timeline,
    franchiseRecords,
    franchiseLegends,
    bestGames,
    playoffHistory,
    milestones,
  };
}

export { PLAYOFF_CALIBER_WINS, ELITE_WINS };
