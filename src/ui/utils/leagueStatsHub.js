const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const playerCategories = ["passing", "rushing", "receiving", "defense", "kicking"];

const sortDesc = (rows, key) => [...rows].sort((a, b) => NUM(b[key]) - NUM(a[key]));

const pick = (obj = {}, keys = []) => {
  for (const k of keys) {
    if (obj?.[k] != null) return obj[k];
  }
  return 0;
};

const safePct = (num, den) => (NUM(den) > 0 ? (NUM(num) / NUM(den)) * 100 : 0);
const safeRate = (num, den) => (NUM(den) > 0 ? NUM(num) / NUM(den) : 0);

const withDerived = (row) => ({
  ...row,
  passPct: safePct(row.cmp, row.att),
  ypa: safeRate(row.passYds, row.att),
  rushYpa: safeRate(row.rushYds, row.rushAtt),
  recYpr: safeRate(row.recYds, row.rec),
  fgPct: safePct(row.fgm, row.fga),
  rate: row.att > 0
    ? (((row.cmp / row.att) * 100) * 0.4 + (row.passYds / row.att) * 3 + (row.passTd / row.att) * 20 - (row.passInt / row.att) * 25)
    : 0,
});

function normalizeSeasonRow(player, team) {
  const s = player?.seasonStats ?? player?.stats ?? {};
  return withDerived({
    playerId: player?.id,
    name: player?.name ?? "Unknown",
    teamId: team?.id ?? null,
    team: team?.abbr ?? team?.name ?? "—",
    pos: player?.position ?? player?.pos ?? "—",
    g: NUM(pick(s, ["gamesPlayed", "g"])),
    cmp: NUM(pick(s, ["passComp", "completions"])),
    att: NUM(pick(s, ["passAtt", "attempts"])),
    passYds: NUM(pick(s, ["passYards", "passYd", "passingYards"])),
    passTd: NUM(pick(s, ["passTD", "passTd", "passTDs"])),
    passInt: NUM(pick(s, ["interceptions", "int", "passInt"])),
    rushAtt: NUM(pick(s, ["rushAtt", "rushingAttempts"])),
    rushYds: NUM(pick(s, ["rushYards", "rushYd", "rushingYards"])),
    rushTd: NUM(pick(s, ["rushTD", "rushTd", "rushTDs"])),
    rushLong: NUM(pick(s, ["rushLong", "longRush"])),
    tgt: NUM(pick(s, ["targets", "tgt"])),
    rec: NUM(pick(s, ["receptions", "rec"])),
    recYds: NUM(pick(s, ["recYards", "recYd", "receivingYards"])),
    recTd: NUM(pick(s, ["recTD", "recTd", "recTDs"])),
    recLong: NUM(pick(s, ["recLong", "longReception"])),
    tkl: NUM(pick(s, ["tackles", "totalTackles"])),
    sack: NUM(pick(s, ["sacks"])),
    tfl: NUM(pick(s, ["tfl", "tacklesForLoss"])),
    defInt: NUM(pick(s, ["interceptions", "defInt"])),
    pd: NUM(pick(s, ["passesDefended", "passDeflections", "pd"])),
    ff: NUM(pick(s, ["forcedFumbles", "ff"])),
    fr: NUM(pick(s, ["fumbleRecoveries", "fr"])),
    defTd: NUM(pick(s, ["defTD", "defensiveTD"])),
    fgm: NUM(pick(s, ["fgm", "fgMade", "fieldGoalsMade"])),
    fga: NUM(pick(s, ["fga", "fgAtt", "fieldGoalsAttempted"])),
    xpm: NUM(pick(s, ["xpm", "xpMade", "extraPointsMade"])),
    xpa: NUM(pick(s, ["xpa", "xpAtt", "extraPointsAttempted"])),
    pts: NUM(pick(s, ["kickingPoints", "points", "pts"])),
  });
}

function normalizePlayerStats(stats = {}) { return normalizeSeasonRow({ seasonStats: stats }, {}); }

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
        const base = normalizePlayerStats(raw?.stats ?? raw ?? {});
        const key = String(pid);
        const prev = byPlayer.get(key) ?? normalizeSeasonRow({ id: Number(pid), name: raw?.name ?? raw?.playerName, position: raw?.pos }, team);
        const next = { ...prev };
        next.g += 1;
        next.cmp += base.cmp; next.att += base.att; next.passYds += base.passYds; next.passTd += base.passTd; next.passInt += base.passInt;
        next.rushAtt += base.rushAtt; next.rushYds += base.rushYds; next.rushTd += base.rushTd; next.rushLong = Math.max(next.rushLong, base.rushLong);
        next.tgt += base.tgt; next.rec += base.rec; next.recYds += base.recYds; next.recTd += base.recTd; next.recLong = Math.max(next.recLong, base.recLong);
        next.tkl += base.tkl; next.sack += base.sack; next.tfl += base.tfl; next.defInt += base.defInt; next.pd += base.pd; next.ff += base.ff; next.fr += base.fr; next.defTd += base.defTd;
        next.fgm += base.fgm; next.fga += base.fga; next.xpm += base.xpm; next.xpa += base.xpa; next.pts += base.pts;
        byPlayer.set(key, withDerived(next));
      }
    }
  }
  return { rows: [...byPlayer.values()], missingDetail };
}

function aggregateTeams(league = {}, teamsById) {
  const games = Array.isArray(league?.schedule) ? league.schedule : [];
  const teamAgg = new Map();
  const ensure = (id) => teamAgg.get(id) ?? teamAgg.set(id, { teamId: id, team: teamsById.get(id)?.abbr ?? teamsById.get(id)?.name ?? String(id), g: 0, pf: 0, pa: 0, yds: 0, passYds: 0, rushYds: 0, turnovers: 0, sacks: 0, takeaways: 0, penalties: 0 }).get(id);
  let withTeamStats = 0;
  for (const game of games) {
    const played = game?.played || (game?.homeScore != null && game?.awayScore != null);
    if (!played) continue;
    const hid = Number(game?.homeId ?? game?.home);
    const aid = Number(game?.awayId ?? game?.away);
    const h = ensure(hid); const a = ensure(aid);
    h.g += 1; a.g += 1;
    const hs = NUM(game?.homeScore); const as = NUM(game?.awayScore);
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    const ts = game?.teamStats ?? game?.stats?.teams;
    if (ts?.home || ts?.away) {
      withTeamStats += 1;
      const hsx = ts.home ?? {}; const asx = ts.away ?? {};
      const nh = normalizeSeasonRow({ seasonStats: hsx }, {});
      const na = normalizeSeasonRow({ seasonStats: asx }, {});
      h.yds += nh.passYds + nh.rushYds; h.passYds += nh.passYds; h.rushYds += nh.rushYds; h.turnovers += nh.passInt; h.sacks += nh.sack; h.takeaways += nh.defInt + nh.fr; h.penalties += NUM(pick(hsx, ["penalties"]));
      a.yds += na.passYds + na.rushYds; a.passYds += na.passYds; a.rushYds += na.rushYds; a.turnovers += na.passInt; a.sacks += na.sack; a.takeaways += na.defInt + na.fr; a.penalties += NUM(pick(asx, ["penalties"]));
    }
  }
  const rows = [...teamAgg.values()].map((r) => ({ ...r, ppg: safeRate(r.pf, r.g), ppgAllowed: safeRate(r.pa, r.g), turnoverMargin: r.takeaways - r.turnovers }));
  const statSource = rows.length === 0 ? "unavailable" : withTeamStats > 0 ? "gameTeamStats" : "scoreOnly";
  return { rows, statSource };
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
  if (!useSeason && gameAgg.rows.length === 0) warnings.push("No completed games with detailed stats have been recorded yet.");

  const playerTables = {
    passing: sortDesc(baseRows.filter((r) => r.passYds > 0 || r.att > 0), "passYds"),
    rushing: sortDesc(baseRows.filter((r) => r.rushYds > 0 || r.rushAtt > 0), "rushYds"),
    receiving: sortDesc(baseRows.filter((r) => r.recYds > 0 || r.rec > 0), "recYds"),
    defense: sortDesc(baseRows.filter((r) => r.tkl > 0 || r.sack > 0 || r.defInt > 0), "tkl"),
    kicking: sortDesc(baseRows.filter((r) => r.fga > 0 || r.xpa > 0 || r.fgm > 0), "pts"),
  };

  const teamAgg = aggregateTeams(league, teamsById);
  const teamRankings = {
    offense: sortDesc(teamAgg.rows, "ppg"),
    defense: [...teamAgg.rows].sort((a, b) => NUM(a.ppgAllowed) - NUM(b.ppgAllowed)),
    discipline: sortDesc(teamAgg.rows, "turnoverMargin"),
  };

  const nz = (arr, key) => arr.filter((r) => NUM(r[key]) > 0);
  const leaders = {
    passing: (nz(baseRows, "passYds").length ? sortDesc(nz(baseRows, "passYds"), "passYds") : sortDesc(baseRows, "passYds")).slice(0, 5),
    rushing: (nz(baseRows, "rushYds").length ? sortDesc(nz(baseRows, "rushYds"), "rushYds") : sortDesc(baseRows, "rushYds")).slice(0, 5),
    receiving: (nz(baseRows, "recYds").length ? sortDesc(nz(baseRows, "recYds"), "recYds") : sortDesc(baseRows, "recYds")).slice(0, 5),
    defense: (nz(baseRows, "tkl").length ? sortDesc(nz(baseRows, "tkl"), "tkl") : sortDesc(baseRows, "tkl")).slice(0, 5),
    kicking: (nz(baseRows, "fgm").length ? sortDesc(nz(baseRows, "fgm"), "fgm") : sortDesc(baseRows, "fgm")).slice(0, 5),
  };

  return {
    playerLeaders: leaders,
    playerTables,
    teamRankings,
    statSources: {
      playerStats: useSeason ? "seasonStats" : (gameAgg.rows.length ? "gameLogs" : "unavailable"),
      teamStats: teamAgg.statSource,
    },
    warnings: teamAgg.statSource === "unavailable" ? [...warnings, "Team rankings are unavailable because completed games did not record team stats."] : warnings,
  };
}
