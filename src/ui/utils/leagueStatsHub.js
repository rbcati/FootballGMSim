const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const playerCategories = ["passing", "rushing", "receiving", "defense", "kicking"];

const sortDesc = (rows, key) => [...rows].sort((a, b) => NUM(b[key]) - NUM(a[key]));

function normalizeSeasonRow(player, team) {
  const s = player?.seasonStats ?? player?.stats ?? {};
  return {
    playerId: player?.id,
    name: player?.name ?? "Unknown",
    teamId: team?.id ?? null,
    team: team?.abbr ?? team?.name ?? "—",
    pos: player?.position ?? player?.pos ?? "—",
    g: NUM(s.gamesPlayed ?? s.g),
    cmp: NUM(s.passComp ?? s.completions),
    att: NUM(s.passAtt ?? s.attempts),
    passYds: NUM(s.passYards),
    passTd: NUM(s.passTD ?? s.passTDs),
    passInt: NUM(s.int ?? s.passInt),
    rushAtt: NUM(s.rushAtt),
    rushYds: NUM(s.rushYards),
    rushTd: NUM(s.rushTD ?? s.rushTDs),
    rushLong: NUM(s.rushLong ?? s.longRush),
    tgt: NUM(s.targets ?? s.tgt),
    rec: NUM(s.receptions ?? s.rec),
    recYds: NUM(s.recYards ?? s.receivingYards),
    recTd: NUM(s.recTD ?? s.recTDs),
    recLong: NUM(s.recLong ?? s.longReception),
    tkl: NUM(s.tackles ?? s.totalTackles),
    sack: NUM(s.sacks),
    tfl: NUM(s.tfl ?? s.tacklesForLoss),
    defInt: NUM(s.interceptions ?? s.defInt),
    pd: NUM(s.passesDefended ?? s.pd),
    ff: NUM(s.forcedFumbles ?? s.ff),
    fr: NUM(s.fumbleRecoveries ?? s.fr),
    defTd: NUM(s.defTD ?? s.defensiveTD),
    fgm: NUM(s.fgMade ?? s.fgm),
    fga: NUM(s.fgAtt ?? s.fga),
    xpm: NUM(s.xpMade ?? s.xpm),
    xpa: NUM(s.xpAtt ?? s.xpa),
    pts: NUM(s.kickingPoints ?? s.pts),
  };
}

function aggregateGamePlayers(games, teamsById) {
  const byPlayer = new Map();
  let missingDetail = 0;
  for (const game of games) {
    const played = game?.played || (game?.homeScore != null && game?.awayScore != null);
    if (!played) continue;
    const pstats = game?.playerStats ?? game?.stats?.players;
    if (!pstats?.home && !pstats?.away) { missingDetail += 1; continue; }
    for (const side of ["home", "away"]) {
      const teamId = side === "home" ? game?.homeId ?? game?.home : game?.awayId ?? game?.away;
      const team = teamsById.get(Number(teamId));
      const rows = pstats?.[side] ?? {};
      for (const [pid, raw] of Object.entries(rows)) {
        const stats = raw?.stats ?? raw ?? {};
        const key = String(pid);
        const prev = byPlayer.get(key) ?? normalizeSeasonRow({ id: Number(pid), name: raw?.name ?? raw?.playerName, position: raw?.pos }, team);
        const next = { ...prev };
        next.g += 1;
        next.cmp += NUM(stats.passComp ?? stats.completions);
        next.att += NUM(stats.passAtt ?? stats.passAttempts ?? stats.attempts);
        next.passYds += NUM(stats.passYards);
        next.passTd += NUM(stats.passTD ?? stats.passTDs);
        next.passInt += NUM(stats.int ?? stats.passInt);
        next.rushAtt += NUM(stats.rushAtt ?? stats.rushingAttempts);
        next.rushYds += NUM(stats.rushYards);
        next.rushTd += NUM(stats.rushTD ?? stats.rushTDs);
        next.rushLong = Math.max(next.rushLong, NUM(stats.rushLong ?? stats.longRush));
        next.tgt += NUM(stats.targets);
        next.rec += NUM(stats.receptions);
        next.recYds += NUM(stats.recYards ?? stats.receivingYards);
        next.recTd += NUM(stats.recTD ?? stats.recTDs);
        next.recLong = Math.max(next.recLong, NUM(stats.recLong ?? stats.longReception));
        next.tkl += NUM(stats.tackles ?? stats.totalTackles);
        next.sack += NUM(stats.sacks);
        next.tfl += NUM(stats.tfl ?? stats.tacklesForLoss);
        next.defInt += NUM(stats.interceptions ?? stats.defInt);
        next.pd += NUM(stats.pd ?? stats.passesDefended);
        next.ff += NUM(stats.ff ?? stats.forcedFumbles);
        next.fr += NUM(stats.fr ?? stats.fumbleRecoveries);
        next.defTd += NUM(stats.defTD ?? stats.defensiveTD);
        next.fgm += NUM(stats.fgm ?? stats.fgMade);
        next.fga += NUM(stats.fga ?? stats.fgAtt);
        next.xpm += NUM(stats.xpm ?? stats.xpMade);
        next.xpa += NUM(stats.xpa ?? stats.xpAtt);
        next.pts += NUM(stats.pts ?? stats.kickingPoints);
        byPlayer.set(key, next);
      }
    }
  }
  return { rows: [...byPlayer.values()], missingDetail };
}

export function buildLeagueStatsHubModel(league = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const games = Array.isArray(league?.schedule) ? league.schedule : [];
  const teamsById = new Map(teams.map((t) => [Number(t?.id), t]));
  const seasonRows = teams.flatMap((team) => (team?.roster ?? []).map((p) => normalizeSeasonRow(p, team))).filter((p) => Object.values(p).some((v) => typeof v === 'number' && v > 0));
  const gameAgg = aggregateGamePlayers(games, teamsById);
  const useSeason = seasonRows.length > 0;
  const baseRows = useSeason ? seasonRows : gameAgg.rows;
  const warnings = [];
  if (!useSeason && gameAgg.rows.length > 0) warnings.push("Stats are aggregated from completed game logs.");
  if (!useSeason && gameAgg.missingDetail > 0) warnings.push("Some games did not record detailed player stats.");
  if (useSeason && gameAgg.rows.length === 0) warnings.push("Season totals are unavailable for this save.");
  if (!useSeason && gameAgg.rows.length === 0) warnings.push("No completed games with detailed stats have been recorded yet.");

  const playerTables = {
    passing: sortDesc(baseRows.filter((r) => r.passYds > 0 || r.att > 0), "passYds"),
    rushing: sortDesc(baseRows.filter((r) => r.rushYds > 0 || r.rushAtt > 0), "rushYds"),
    receiving: sortDesc(baseRows.filter((r) => r.recYds > 0 || r.rec > 0), "recYds"),
    defense: sortDesc(baseRows.filter((r) => r.tkl > 0 || r.sack > 0 || r.defInt > 0), "tkl"),
    kicking: sortDesc(baseRows.filter((r) => r.fga > 0 || r.xpa > 0), "fgm"),
  };

  const teamRankings = { offense: [], defense: [], discipline: [] };

  const leaders = {
    passing: sortDesc(baseRows, "passYds").slice(0,5),
    rushing: sortDesc(baseRows, "rushYds").slice(0,5),
    receiving: sortDesc(baseRows, "recYds").slice(0,5),
    defense: sortDesc(baseRows, "tkl").slice(0,5),
    kicking: sortDesc(baseRows, "fgm").slice(0,5),
  };

  return {
    playerLeaders: leaders,
    playerTables,
    teamRankings,
    statSources: {
      playerStats: useSeason ? "seasonStats" : (gameAgg.rows.length ? "gameLogs" : "unavailable"),
      teamStats: "unavailable",
    },
    warnings,
  };
}
