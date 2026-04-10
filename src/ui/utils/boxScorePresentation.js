const sum = (arr) => arr.reduce((acc, value) => acc + (Number(value) || 0), 0);

const normalizePlayer = (pid, row, teamId) => ({
  playerId: Number(pid),
  teamId,
  name: row?.name ?? "Unknown",
  pos: row?.pos ?? "—",
  stats: row?.stats ?? {},
});

const STAT_LABELS = {
  passYd: "Pass Yds",
  passTD: "Pass TD",
  interceptions: "INT",
  completionPct: "Comp%",
  rushYd: "Rush Yds",
  rushTD: "Rush TD",
  receptions: "Rec",
  recYd: "Rec Yds",
  recTD: "Rec TD",
  tackles: "Tackles",
  sacks: "Sacks",
  forcedFumbles: "FF",
  fumblesRecovered: "FR",
  passesDefended: "PD",
  fieldGoalsMade: "FGM",
  fieldGoalsAttempted: "FGA",
  extraPointsMade: "XPM",
  extraPointsAttempted: "XPA",
  punts: "Punts",
  puntYards: "Punt Yds",
};

export function toPlayerArray(sideStats, teamId) {
  return Object.entries(sideStats ?? {}).map(([pid, row]) => normalizePlayer(pid, row, teamId));
}

function leader(players, sortKey, { min = 1 } = {}) {
  return players
    .filter((p) => Number(p.stats?.[sortKey] ?? 0) >= min)
    .sort((a, b) => Number(b.stats?.[sortKey] ?? 0) - Number(a.stats?.[sortKey] ?? 0))[0] ?? null;
}

export function deriveLeaders(game) {
  const homePlayers = toPlayerArray(game?.stats?.home, game?.homeId);
  const awayPlayers = toPlayerArray(game?.stats?.away, game?.awayId);
  const players = [...homePlayers, ...awayPlayers];
  const summaryLeaders = game?.summary?.leaders ?? {};
  const toFallbackLeader = (row) => {
    if (!row) return null;
    return {
      playerId: row.playerId ?? null,
      teamId: row.teamId ?? null,
      name: row.name ?? "Unknown",
      pos: row.pos ?? "—",
      stats: row.stats ?? {},
    };
  };

  return {
    pass: leader(players, "passYd", { min: 20 }) ?? toFallbackLeader(summaryLeaders.pass),
    rush: leader(players, "rushYd", { min: 10 }) ?? toFallbackLeader(summaryLeaders.rush),
    receive: leader(players, "recYd", { min: 10 }) ?? toFallbackLeader(summaryLeaders.receive),
    defense: players
      .filter((p) => (p.stats?.tackles || 0) + ((p.stats?.sacks || 0) * 2) + ((p.stats?.interceptions || 0) * 2) > 0)
      .sort((a, b) => ((b.stats?.tackles || 0) + ((b.stats?.sacks || 0) * 2) + ((b.stats?.interceptions || 0) * 2)) - ((a.stats?.tackles || 0) + ((a.stats?.sacks || 0) * 2) + ((a.stats?.interceptions || 0) * 2)))[0] ?? toFallbackLeader(summaryLeaders.defense),
    special: leader(players, "fieldGoalsMade", { min: 1 }),
  };
}

export function deriveTeamTotals(sideStats) {
  const players = toPlayerArray(sideStats, null);
  const hasAnyStats = players.some((p) => p?.stats && Object.keys(p.stats).length > 0);
  if (!hasAnyStats) {
    return {
      passYards: null,
      rushYards: null,
      turnovers: null,
      sacks: null,
      penalties: null,
      firstDowns: null,
      totalYards: null,
      thirdDownMade: null,
      thirdDownAtt: null,
      timePossession: null,
    };
  }
  return {
    passYards: sum(players.map((p) => p.stats?.passYd)),
    rushYards: sum(players.map((p) => p.stats?.rushYd)),
    turnovers: sum(players.map((p) => p.stats?.interceptions)) + sum(players.map((p) => p.stats?.fumblesLost)),
    sacks: sum(players.map((p) => p.stats?.sacks)),
    penalties: sum(players.map((p) => p.stats?.penalties)),
    firstDowns: sum(players.map((p) => p.stats?.firstDowns)),
    totalYards: sum(players.map((p) => p.stats?.passYd)) + sum(players.map((p) => p.stats?.rushYd)),
    thirdDownMade: sum(players.map((p) => p.stats?.thirdDownMade)),
    thirdDownAtt: sum(players.map((p) => p.stats?.thirdDownAtt)),
    timePossession: sum(players.map((p) => p.stats?.timePossession)),
  };
}

function parseScoreType(play = "") {
  const text = String(play).toLowerCase();
  if (text.includes("field goal")) return "FG";
  if (text.includes("safety")) return "Safety";
  if (text.includes("extra point")) return "XP";
  if (text.includes("touchdown") || text.includes(" td ")) return "TD";
  return "Score";
}

export function deriveScoringSummary(logs = [], teamsById = {}) {
  const scoring = logs
    .filter((log) => log?.isScore || log?.isTouchdown || /touchdown|field goal|safety/i.test(log?.text ?? ""))
    .map((log, idx) => {
      const teamId = Number(log.teamId ?? log.scoringTeamId ?? log.team?.id);
      const team = teamsById[teamId];
      return {
        id: `${idx}-${teamId}`,
        quarter: log.quarter ?? "—",
        clock: log.clock ?? log.time ?? "",
        teamId,
        teamAbbr: team?.abbr ?? "—",
        type: parseScoreType(log.text),
        text: log.text ?? "Scoring play",
      };
    });

  return scoring;
}

export function deriveQuarterScores(game, logs = []) {
  const fallback = {
    home: [null, null, null, null],
    away: [null, null, null, null],
  };

  const q = game?.quarterScores;
  if (q?.home?.length || q?.away?.length) {
    return {
      home: [q.home?.[0] ?? null, q.home?.[1] ?? null, q.home?.[2] ?? null, q.home?.[3] ?? null],
      away: [q.away?.[0] ?? null, q.away?.[1] ?? null, q.away?.[2] ?? null, q.away?.[3] ?? null],
    };
  }

  if (!logs.length) return fallback;

  const home = [0, 0, 0, 0];
  const away = [0, 0, 0, 0];
  for (const log of logs) {
    const qtr = Math.max(1, Math.min(4, Number(log.quarter) || 1));
    const idx = qtr - 1;
    const points = Number(log.points ?? (String(log.text || "").toLowerCase().includes("field goal") ? 3 : String(log.text || "").toLowerCase().includes("safety") ? 2 : String(log.text || "").toLowerCase().includes("extra point") ? 1 : (log.isTouchdown ? 6 : 0)));
    const teamId = Number(log.teamId ?? log.scoringTeamId ?? log.team?.id);
    if (teamId === Number(game?.homeId)) home[idx] += points;
    if (teamId === Number(game?.awayId)) away[idx] += points;
  }
  return { home, away };
}

export function describeStatLine(player, keys) {
  if (!player) return "—";
  return keys
    .map((key) => {
      const v = player.stats?.[key];
      if (v == null || Number(v) === 0) return null;
      return `${v} ${STAT_LABELS[key] ?? key}`;
    })
    .filter(Boolean)
    .join(" · ") || "—";
}

export function deriveMomentumNotes(logs = []) {
  if (!logs.length) return [];
  const swings = logs.filter((log) => Number(log?.winProbSwing ?? 0) >= 0.15 || log?.turnover || /interception|fumble|4th and|sack/i.test(log?.text ?? ""));
  return swings.slice(-4).map((log, idx) => ({
    id: `${idx}-${log.quarter ?? 0}`,
    quarter: log.quarter ?? "—",
    text: log.text ?? "Momentum shifted",
  }));
}
