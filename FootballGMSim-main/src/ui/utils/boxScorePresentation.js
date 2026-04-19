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

function parseClockToSec(clockValue) {
  if (clockValue == null) return -1;
  const normalized = String(clockValue).trim();
  const match = normalized.match(/^(\d+):(\d{1,2})$/);
  if (!match) return -1;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function sortScoringSummaryRows(rows = []) {
  return [...rows].sort((a, b) => {
    const quarterDelta = Number(a.quarter ?? 0) - Number(b.quarter ?? 0);
    if (quarterDelta !== 0) return quarterDelta;
    const clockDelta = parseClockToSec(b.clock) - parseClockToSec(a.clock);
    if (clockDelta !== 0) return clockDelta;
    return Number(a.sortIndex ?? 0) - Number(b.sortIndex ?? 0);
  });
}

export function deriveScoringSummary(logs = [], teamsById = {}) {
  const scoring = logs
    .filter((log) => log?.isScore || log?.isTouchdown || /touchdown|field goal|safety/i.test(log?.text ?? ""))
    .map((log, idx) => {
      const teamId = Number(log.teamId ?? log.scoringTeamId ?? log.team?.id);
      const team = teamsById[teamId];
      return {
        id: `${idx}-${teamId}`,
        sortIndex: idx,
        quarter: log.quarter ?? "—",
        clock: log.clock ?? log.time ?? "",
        teamId,
        teamAbbr: team?.abbr ?? "—",
        type: parseScoreType(log.text),
        runningScore: log.score ?? (log.awayScore != null && log.homeScore != null ? `${log.awayScore}-${log.homeScore}` : null),
        text: log.text ?? "Scoring play",
      };
    });

  return sortScoringSummaryRows(scoring);
}

export function groupScoringByPeriod(scoring = []) {
  const groups = new Map();
  scoring.forEach((row) => {
    const period = Number(row.quarter) > 4 ? `OT${Number(row.quarter) - 4}` : `Q${row.quarter ?? "—"}`;
    if (!groups.has(period)) groups.set(period, []);
    groups.get(period).push(row);
  });
  return Array.from(groups.entries()).map(([period, items]) => ({ period, items }));
}

export function deriveQuarterScores(game, logs = []) {
  const fallback = { home: [null, null, null, null], away: [null, null, null, null] };

  const q = game?.quarterScores;
  if (q?.home?.length || q?.away?.length) {
    const maxLen = Math.max(q?.home?.length ?? 0, q?.away?.length ?? 0, 4);
    return {
      home: Array.from({ length: maxLen }, (_, idx) => q.home?.[idx] ?? null),
      away: Array.from({ length: maxLen }, (_, idx) => q.away?.[idx] ?? null),
    };
  }

  if (!logs.length) return fallback;

  const maxQuarter = Math.max(4, ...logs.map((log) => Number(log?.quarter ?? 1)));
  const home = Array.from({ length: maxQuarter }, () => 0);
  const away = Array.from({ length: maxQuarter }, () => 0);
  for (const log of logs) {
    const qtr = Math.max(1, Number(log.quarter) || 1);
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

function getSidePlayers(game, side) {
  const sideRows = game?.playerStats?.[side] ?? game?.stats?.[side] ?? {};
  return toPlayerArray(sideRows, side === 'home' ? game?.homeId : game?.awayId);
}

function getLeaderByStat(players, statKey, min = 1) {
  return players
    .filter((player) => Number(player?.stats?.[statKey] ?? 0) >= min)
    .sort((a, b) => Number(b?.stats?.[statKey] ?? 0) - Number(a?.stats?.[statKey] ?? 0))[0] ?? null;
}

export function deriveTeamLeaders(game = {}) {
  const build = (side) => {
    const players = getSidePlayers(game, side);
    return {
      passing: getLeaderByStat(players, 'passYd', 1),
      rushing: getLeaderByStat(players, 'rushYd', 1),
      receiving: getLeaderByStat(players, 'recYd', 1),
      tackles: getLeaderByStat(players, 'tackles', 1),
      sacks: getLeaderByStat(players, 'sacks', 1),
      interceptions: getLeaderByStat(players, 'interceptions', 1),
      kicking: players
        .filter((player) => Number(player?.stats?.fieldGoalsAttempted ?? 0) > 0 || Number(player?.stats?.extraPointsAttempted ?? 0) > 0)
        .sort((a, b) => (
          Number(b?.stats?.fieldGoalsMade ?? 0) - Number(a?.stats?.fieldGoalsMade ?? 0)
          || Number(b?.stats?.extraPointsMade ?? 0) - Number(a?.stats?.extraPointsMade ?? 0)
        ))[0] ?? null,
    };
  };
  return { away: build('away'), home: build('home') };
}

function numericDelta(away, home) {
  const awayNum = Number(away);
  const homeNum = Number(home);
  if (!Number.isFinite(awayNum) || !Number.isFinite(homeNum) || awayNum === homeNum) return null;
  return { winner: awayNum > homeNum ? 'away' : 'home', margin: Math.abs(awayNum - homeNum), awayNum, homeNum };
}

export function deriveStandoutStorylines({
  game,
  awayTeam,
  homeTeam,
  teamTotals,
  driveStats,
} = {}) {
  if (!game) return [];
  const lines = [];
  const awayAbbr = awayTeam?.abbr ?? 'Away';
  const homeAbbr = homeTeam?.abbr ?? 'Home';

  const pushUnique = (text) => {
    if (!text || lines.includes(text) || lines.length >= 5) return;
    lines.push(text);
  };

  const thirdDownAway = Number(teamTotals?.away?.thirdDownMade ?? 0) / Math.max(1, Number(teamTotals?.away?.thirdDownAtt ?? 0));
  const thirdDownHome = Number(teamTotals?.home?.thirdDownMade ?? 0) / Math.max(1, Number(teamTotals?.home?.thirdDownAtt ?? 0));
  const thirdDownEdge = numericDelta(thirdDownAway, thirdDownHome);
  if (thirdDownEdge && thirdDownEdge.margin >= 0.15) {
    const winner = thirdDownEdge.winner === "away" ? awayAbbr : homeAbbr;
    pushUnique(`${winner} stayed on schedule, winning the critical third-down conversion battle.`);
  }

  const turnoverEdge = numericDelta(teamTotals?.home?.turnovers, teamTotals?.away?.turnovers);
  if (turnoverEdge && turnoverEdge.margin >= 1) {
    const winner = turnoverEdge.winner === 'away' ? awayAbbr : homeAbbr;
    const loser = turnoverEdge.winner === 'away' ? homeAbbr : awayAbbr;
    pushUnique(`${winner} protected the football better and finished +${turnoverEdge.margin} in turnover margin.`);
  }

  const redZoneAway = Number(driveStats?.away?.redZoneScores ?? 0) / Math.max(1, Number(driveStats?.away?.redZoneTrips ?? 0));
  const redZoneHome = Number(driveStats?.home?.redZoneScores ?? 0) / Math.max(1, Number(driveStats?.home?.redZoneTrips ?? 0));
  const redZoneEdge = numericDelta(redZoneAway, redZoneHome);
  if (redZoneEdge && Number.isFinite(redZoneAway) && Number.isFinite(redZoneHome)) {
    const winner = redZoneEdge.winner === 'away' ? awayAbbr : homeAbbr;
    pushUnique(`The difference was red-zone finishing: ${winner} converted at a higher rate inside the 20.`);
  }

  const rushEdge = numericDelta(teamTotals?.away?.rushYards, teamTotals?.home?.rushYards);
  if (rushEdge && rushEdge.margin >= 75) {
    const winner = rushEdge.winner === "away" ? awayAbbr : homeAbbr;
    pushUnique(`${winner} imposed their will on the ground, out-rushing their opponent by ${Math.round(rushEdge.margin)} yards.`);
  }

  const explosivesEdge = numericDelta(driveStats?.away?.explosivePlays, driveStats?.home?.explosivePlays);
  if (explosivesEdge && explosivesEdge.margin >= 1) {
    const winner = explosivesEdge.winner === 'away' ? awayAbbr : homeAbbr;
    pushUnique(`${winner} created the bigger chunk plays edge (${Math.round(explosivesEdge.margin)} more explosives).`);
  }

  const sacksEdge = numericDelta(teamTotals?.away?.sacks, teamTotals?.home?.sacks);
  if (sacksEdge && sacksEdge.margin >= 1) {
    const winner = sacksEdge.winner === 'away' ? awayAbbr : homeAbbr;
    const loser = sacksEdge.winner === 'away' ? homeAbbr : awayAbbr;
    pushUnique(`${winner}'s pass rush won key downs with ${Math.round(sacksEdge.margin)} more sacks than ${loser}.`);
  }

  const simReasons = [game?.topReason1, game?.topReason2, game?.summary?.topReason1, game?.summary?.topReason2]
    .filter((reason) => typeof reason === 'string' && reason.trim());
  const reasonText = simReasons[0] ?? '';
  if (/pocket survived pressure/i.test(reasonText)) {
    const awaySacks = Number(teamTotals?.away?.sacks ?? 0);
    const homeSacks = Number(teamTotals?.home?.sacks ?? 0);
    const winner = awaySacks <= homeSacks ? awayAbbr : homeAbbr;
    const loser = winner === awayAbbr ? homeAbbr : awayAbbr;
    pushUnique(`${winner}'s pass protection neutralized ${loser}'s pass rush in the defining stretches.`);
  } else if (/route leverage over zone/i.test(reasonText)) {
    const winner = Number(teamTotals?.away?.passYards ?? 0) >= Number(teamTotals?.home?.passYards ?? 0) ? awayAbbr : homeAbbr;
    const loser = winner === awayAbbr ? homeAbbr : awayAbbr;
    pushUnique(`${winner}'s route running consistently beat ${loser}'s zone coverage leverage.`);
  } else if (/win on the release/i.test(reasonText)) {
    const winner = Number(teamTotals?.away?.passYards ?? 0) >= Number(teamTotals?.home?.passYards ?? 0) ? awayAbbr : homeAbbr;
    const loser = winner === awayAbbr ? homeAbbr : awayAbbr;
    pushUnique(`${winner}'s release quickness separated from ${loser}'s press coverage at the catch point.`);
  }

  const yardsEdge = numericDelta(teamTotals?.away?.totalYards, teamTotals?.home?.totalYards);
  if (yardsEdge && yardsEdge.margin >= 40) {
    const winner = yardsEdge.winner === 'away' ? awayAbbr : homeAbbr;
    pushUnique(`${winner} controlled field position with a ${Math.round(yardsEdge.margin)}-yard total offense edge.`);
  }

  if (lines.length < 3) {
    const winnerAbbr = Number(game?.awayScore) > Number(game?.homeScore) ? awayAbbr : homeAbbr;
    const loserAbbr = winnerAbbr === awayAbbr ? homeAbbr : awayAbbr;
    pushUnique(`${winnerAbbr} executed cleaner situational football late to close out ${loserAbbr}.`);
  }

  return lines.slice(0, 5);
}

export function getGameDetailSections(game = {}) {
  const scoringCount = Array.isArray(game?.scoringSummary) ? game.scoringSummary.length : 0;
  const driveCount = Array.isArray(game?.driveSummary) ? game.driveSummary.length : (Array.isArray(game?.drives) ? game.drives.length : 0);
  const turningCount = Array.isArray(game?.turningPoints) ? game.turningPoints.length : 0;
  const playLogCount = Array.isArray(game?.playLog) ? game.playLog.length : (Array.isArray(game?.stats?.playLogs) ? game.stats.playLogs.length : 0);
  const hasTeamStats = Boolean(game?.teamStats?.home || game?.teamStats?.away || game?.playerStats || game?.stats);
  return {
    recap: Boolean(game?.summary?.storyline || game?.recap),
    teamComparison: hasTeamStats,
    leaders: hasTeamStats,
    scoringSummary: scoringCount > 0 || playLogCount > 0,
    driveSummary: driveCount > 0,
    turningPoints: turningCount > 0 || playLogCount > 0,
    playLog: playLogCount > 0,
    quarterByQuarter: Boolean(game?.quarterScores || (game?.homeScore != null && game?.awayScore != null)),
  };
}
