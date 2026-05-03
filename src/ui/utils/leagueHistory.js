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

const asArray = (v) => (Array.isArray(v) ? v : []);
const num = (v) => Number(v ?? 0);

export function deriveAwardWinnersFromStats(leagueStatsModel = {}) {
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
  const standings = asArray(league.standings);
  if (!standings.length) warnings.push('Current standings are unavailable.');
  return {
    season: league.seasonId ?? league.year ?? null,
    week: league.week ?? null,
    standings,
    stats: asArray(league.playerStats ?? league.stats),
    warnings,
  };
}

export function deriveLeagueRecords(history = [], currentSeasonStats = []) {
  const best = new Map(RECORD_CATEGORIES.map(([k, label]) => [k, { key: k, label, value: 0, player: null, team: null, season: null }]));
  const pools = [...asArray(currentSeasonStats), ...asArray(history).flatMap((s) => asArray(s.leaders))];
  for (const row of pools) {
    const stats = row?.stats ?? row?.totals ?? row;
    for (const [key] of RECORD_CATEGORIES) {
      const value = num(stats?.[key]);
      if (value <= 0) continue;
      const cur = best.get(key);
      if (value > cur.value) best.set(key, { ...cur, value, player: row?.name ?? row?.playerName ?? 'Unknown', team: row?.teamAbbr ?? row?.team ?? '—', season: row?.season ?? null });
    }
  }
  return [...best.values()].filter((r) => r.value > 0);
}

export function buildTeamYearHistory(history = [], league = {}) {
  const teams = asArray(league.teams);
  const byTeam = new Map(teams.map((t) => [Number(t.id), { teamId: t.id, team: t.abbr ?? t.name ?? `Team ${t.id}`, seasons: 0, championships: 0, playoffApps: 0, bestRecord: null, lastSeasonRecord: null }]));
  for (const season of asArray(history)) {
    for (const row of asArray(season.standings)) {
      const id = Number(row.id);
      if (!byTeam.has(id)) byTeam.set(id, { teamId: id, team: row.abbr ?? row.name ?? `Team ${id}`, seasons: 0, championships: 0, playoffApps: 0, bestRecord: null, lastSeasonRecord: null });
      const item = byTeam.get(id);
      item.seasons += 1;
      const rec = `${num(row.wins)}-${num(row.losses)}${num(row.ties) ? `-${num(row.ties)}` : ''}`;
      item.lastSeasonRecord = rec;
      if (!item.bestRecord || num(row.wins) > item.bestRecord.wins) item.bestRecord = { wins: num(row.wins), text: rec };
      if (num(row.wins) >= 10) item.playoffApps += 1;
      if (Number(season?.champion?.id) === id) item.championships += 1;
    }
  }
  return [...byTeam.values()];
}

export function buildLeagueHistoryModel(league = {}) {
  const warnings = [];
  const historySeasons = asArray(league?.history?.seasons).length ? asArray(league.history.seasons) : asArray(league?.leagueHistory);
  if (!historySeasons.length) warnings.push('No archived seasons found yet.');
  const currentSeasonSnapshot = buildCurrentSeasonSnapshot(league);
  const champions = historySeasons.filter((s) => s?.champion).map((s) => ({ season: s.year ?? s.id, ...s.champion, runnerUp: s.runnerUp ?? null, result: s?.playoffSummary?.finals ?? null }));
  const awards = historySeasons.map((s) => ({ season: s.year ?? s.id, awards: s.awards ?? null, source: s?.awards?.source ?? 'recorded' }));
  const playoffHistory = historySeasons.flatMap((s) => asArray(s?.playoffResults).map((g) => ({ season: s.year ?? s.id, ...g })));
  const leagueRecords = deriveLeagueRecords(historySeasons, currentSeasonSnapshot.stats);
  const teamHistory = buildTeamYearHistory(historySeasons, league);
  return { currentSeasonSnapshot, seasons: historySeasons, champions, playoffHistory, awards, leagueRecords, teamHistory, playerLegacy: {}, warnings: [...warnings, ...currentSeasonSnapshot.warnings] };
}
