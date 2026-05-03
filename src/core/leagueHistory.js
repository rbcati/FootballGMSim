const RECORD_CATEGORIES = [
  ['passYd', 'Passing Yards'],
  ['passTD', 'Passing TD'],
  ['rushYd', 'Rushing Yards'],
  ['rushTD', 'Rushing TD'],
  ['recYd', 'Receiving Yards'],
  ['recTD', 'Receiving TD'],
  ['tackles', 'Tackles'],
  ['sacks', 'Sacks'],
  ['interceptions', 'Interceptions'],
  ['fgm', 'Field Goals Made'],
];

const LEADER_KEYS = ['passYd', 'passTD', 'rushYd', 'recYd', 'tackles', 'sacks', 'interceptions'];

const asArray = (v) => (Array.isArray(v) ? v : []);
const num = (v) => Number(v ?? 0);
const seasonNumber = (row) => Number(row?.season ?? row?.year ?? row?.id);
const seasonToken = (row) => String(row?.season ?? row?.year ?? row?.id);
const richnessScore = (s = {}) => {
  let score = 0;
  if (s.champion) score += 3;
  if (s.runnerUp) score += 1;
  if (asArray(s.playoffResults).length) score += 2;
  if (asArray(s.leaders).length) score += 2;
  if (s.awards) score += 2;
  if (asArray(s.stats ?? s.playerStats).length) score += 2;
  if (asArray(s.standings).length) score += 1;
  if (asArray(s.warnings).length === 0) score += 1;
  return score;
};

export function deriveAwardWinnersFromStats(leagueStatsModel = {}) { /* unchanged */
  const rows = asArray(leagueStatsModel.playerRows ?? leagueStatsModel.players);
  const nonZero = rows.filter((r) => Object.values(r?.stats ?? r?.totals ?? {}).some((x) => num(x) > 0));
  const scoreOff = (s) => num(s.passTD) * 6 + num(s.passYd) / 25 + num(s.rushTD) * 6 + num(s.recTD) * 6 + num(s.rushYd) / 10 + num(s.recYd) / 10 - num(s.interceptions) * 3;
  const scoreDef = (s) => num(s.tackles) + num(s.sacks) * 6 + num(s.interceptions) * 8 + num(s.forcedFumbles) * 5;
  const top = (filter, score) => nonZero.filter(filter).map((r) => ({ r, score: score(r?.stats ?? r?.totals ?? {}) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)[0]?.r;
  const mvp = top(() => true, scoreOff);
  const opoy = top((r) => String(r.position ?? '').toUpperCase() !== 'QB', scoreOff) ?? top(() => true, scoreOff);
  const dpoy = top((r) => ['DL', 'LB', 'CB', 'S', 'DE', 'EDGE'].includes(String(r.position ?? '').toUpperCase()), scoreDef);
  return {
    source: 'derived',
    derivedLabel: 'Derived from season stats',
    mvp: mvp ? { playerId: mvp.playerId ?? mvp.id, name: mvp.name ?? 'Unknown' } : null,
    opoy: opoy ? { playerId: opoy.playerId ?? opoy.id, name: opoy.name ?? 'Unknown' } : null,
    dpoy: dpoy ? { playerId: dpoy.playerId ?? dpoy.id, name: dpoy.name ?? 'Unknown' } : null,
  };
}

export function buildCurrentSeasonSnapshot(league = {}) {
  const warnings = [];
  const season = league.seasonId ?? league.year ?? league.season ?? null;
  const standings = asArray(league.standings);
  if (!standings.length) warnings.push('Current standings are unavailable.');
  const stats = asArray(league.playerStats ?? league.stats);
  const awards = league.awards ?? (stats.length ? deriveAwardWinnersFromStats({ playerRows: stats }) : null);
  const snapshot = {
    year: season,
    season,
    week: league.week ?? null,
    standings,
    champion: league.champion ?? null,
    runnerUp: league.runnerUp ?? null,
    playoffResults: asArray(league.playoffResults),
    leaders: asArray(league.leaders),
    awards,
    stats,
    playerStats: stats,
    warnings,
  };
  return snapshot;
}

export function deriveLeagueRecords(history = [], currentSeasonStats = []) { const best = new Map(RECORD_CATEGORIES.map(([k, label]) => [k, { key: k, label, value: 0, player: null, team: null, season: null }]));
  const pools = [...asArray(currentSeasonStats), ...asArray(history).flatMap((s) => asArray(s.leaders))];
  for (const row of pools) { const stats = row?.stats ?? row?.totals ?? row;
    for (const [key] of RECORD_CATEGORIES) { const value = num(stats?.[key]); if (value <= 0) continue; const cur = best.get(key);
      if (value > cur.value) best.set(key, { ...cur, value, player: row?.name ?? row?.playerName ?? 'Unknown', playerId: row?.playerId ?? row?.id ?? null, team: row?.teamAbbr ?? row?.team ?? '—', teamId: row?.teamId ?? null, season: row?.season ?? row?.year ?? null }); } }
  return [...best.values()].filter((r) => r.value > 0);
}

export function buildTeamYearHistory(history = [], league = {}) { const teams = asArray(league.teams);
  const byTeam = new Map(teams.map((t) => [Number(t.id), { teamId: t.id, team: t.abbr ?? t.name ?? `Team ${t.id}`, seasons: 0, championships: 0, playoffApps: 0, bestRecord: null, lastSeasonRecord: null }]));
  for (const season of asArray(history)) { for (const row of asArray(season.standings)) { const id = Number(row.id);
      if (!byTeam.has(id)) byTeam.set(id, { teamId: id, team: row.abbr ?? row.name ?? `Team ${id}`, seasons: 0, championships: 0, playoffApps: 0, bestRecord: null, lastSeasonRecord: null });
      const item = byTeam.get(id); item.seasons += 1;
      const rec = `${num(row.wins)}-${num(row.losses)}${num(row.ties) ? `-${num(row.ties)}` : ''}`;
      item.lastSeasonRecord = rec;
      if (!item.bestRecord || num(row.wins) > item.bestRecord.wins) item.bestRecord = { wins: num(row.wins), text: rec };
      if (num(row.wins) >= 10) item.playoffApps += 1;
      if (Number(season?.champion?.id) === id) item.championships += 1; } }
  return [...byTeam.values()];
}

export function ensureLeagueHistoryContainer(league = {}) {
  const history = league?.history && typeof league.history === 'object' ? league.history : {};
  return { ...league, history: { ...history, seasons: asArray(history.seasons) } };
}

export function archiveCompletedSeasonIfNeeded(league = {}, options = {}) {
  const safeLeague = ensureLeagueHistoryContainer(league);
  const seasonKey = options.season ?? safeLeague.seasonId ?? safeLeague.year ?? safeLeague.season ?? null;
  if (seasonKey == null) return safeLeague;

  const snapshot = buildCurrentSeasonSnapshot({ ...safeLeague, seasonId: seasonKey, year: seasonKey, season: seasonKey });
  const warnings = [...asArray(snapshot.warnings)];
  if (!snapshot.champion) warnings.push('Champion data unavailable at archive time.');
  if (!asArray(snapshot.playoffResults).length) warnings.push('Playoff results unavailable at archive time.');
  if (!snapshot.awards) warnings.push('Awards unavailable at archive time.');

  const archivedSeason = { ...snapshot, year: seasonKey, season: seasonKey, warnings: [...new Set(warnings)] };
  const existing = asArray(safeLeague.history?.seasons);
  const match = existing.find((s) => seasonNumber(s) === Number(seasonKey) || seasonToken(s) === String(seasonKey));
  const seasons = match
    ? existing.map((s) => {
      const isMatch = seasonNumber(s) === Number(seasonKey) || seasonToken(s) === String(seasonKey);
      if (!isMatch) return s;
      return richnessScore(s) >= richnessScore(archivedSeason) ? s : archivedSeason;
    })
    : [...existing, archivedSeason];

  seasons.sort((a, b) => seasonNumber(a) - seasonNumber(b));
  return { ...safeLeague, history: { ...safeLeague.history, seasons } };
}

export function buildLeagueHistoryModel(league = {}) {
  const warnings = [];
  const historySeasons = asArray(league?.history?.seasons).length ? asArray(league.history.seasons) : asArray(league?.leagueHistory);
  if (!historySeasons.length) warnings.push('No archived seasons found yet.');
  const currentSeasonSnapshot = buildCurrentSeasonSnapshot(league);
  const champions = historySeasons.filter((s) => s?.champion).map((s) => ({ season: s.year ?? s.season ?? s.id, ...s.champion, runnerUp: s.runnerUp ?? null, result: s?.playoffSummary?.finals ?? null }));
  const awards = historySeasons.map((s) => ({ season: s.year ?? s.season ?? s.id, awards: s.awards ?? null, source: s?.awards?.source ?? 'recorded' }));
  const playoffHistory = historySeasons.flatMap((s) => asArray(s?.playoffResults).map((g) => ({ season: s.year ?? s.season ?? s.id, ...g })));
  const leaderSnapshots = historySeasons.flatMap((s) => asArray(s.leaders)
    .flatMap((row) => LEADER_KEYS.filter((key) => num((row?.stats ?? row?.totals ?? row)?.[key]) > 0).map((key) => ({ season: s.year ?? s.season ?? s.id, category: key, label: RECORD_CATEGORIES.find(([k]) => k === key)?.[1] ?? key, player: row?.name ?? row?.playerName ?? 'Unknown', playerId: row?.playerId ?? row?.id ?? null, team: row?.teamAbbr ?? row?.team ?? '—', teamId: row?.teamId ?? null, value: num((row?.stats ?? row?.totals ?? row)?.[key]) }))));
  const seasonSummaries = historySeasons.map((s) => ({ season: s.year ?? s.season ?? s.id, champion: s.champion ?? null, bestRecord: asArray(s.standings).slice().sort((a, b) => num(b.wins) - num(a.wins))[0] ?? null, mvp: s?.awards?.mvp ?? null, opoy: s?.awards?.opoy ?? null, dpoy: s?.awards?.dpoy ?? null, notes: asArray(s.warnings) }));
  const archiveWarnings = historySeasons.flatMap((s) => asArray(s.warnings).map((warning) => ({ season: s.year ?? s.season ?? s.id, warning })));
  const leagueRecords = deriveLeagueRecords(historySeasons, currentSeasonSnapshot.stats);
  const teamHistory = buildTeamYearHistory(historySeasons, league);
  return { currentSeasonSnapshot, seasons: historySeasons, champions, seasonSummaries, playoffHistory, awards, leagueRecords, leaderSnapshots, teamHistory, archiveWarnings, playerLegacy: {}, warnings: [...warnings, ...currentSeasonSnapshot.warnings] };
}
