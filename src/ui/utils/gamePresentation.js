function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function normalizeTeamId(maybeTeam) {
  if (typeof maybeTeam === 'object' && maybeTeam) return safeNum(maybeTeam.id, null);
  return safeNum(maybeTeam, null);
}

export function computeWinPct(team) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  return games > 0 ? (wins + ties * 0.5) / games : 0;
}

export function computeStreak(results = []) {
  if (!Array.isArray(results) || !results.length) return null;
  let type = null;
  let count = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const value = results[i];
    if (value !== 'W' && value !== 'L') continue;
    if (!type) {
      type = value;
      count = 1;
    } else if (value === type) {
      count += 1;
    } else {
      break;
    }
  }
  return type ? { type, count } : null;
}

function confRankings(teams = [], conf) {
  return teams
    .filter((team) => String(team?.conf) === String(conf))
    .sort((a, b) => computeWinPct(b) - computeWinPct(a));
}

function findPreviousMatchup(schedule, week, homeId, awayId) {
  for (const wk of schedule?.weeks ?? []) {
    if (safeNum(wk?.week) >= safeNum(week)) continue;
    for (const game of wk?.games ?? []) {
      const gHome = normalizeTeamId(game?.home);
      const gAway = normalizeTeamId(game?.away);
      if ((gHome === homeId && gAway === awayId) || (gHome === awayId && gAway === homeId)) {
        return { week: safeNum(wk?.week), game };
      }
    }
  }
  return null;
}

export function derivePregameAngles({ league, game, week }) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const homeId = normalizeTeamId(game?.home);
  const awayId = normalizeTeamId(game?.away);
  const home = teams.find((t) => t.id === homeId) ?? null;
  const away = teams.find((t) => t.id === awayId) ?? null;
  if (!home || !away) return [];

  const angles = [];
  const prior = findPreviousMatchup(league?.schedule, week, homeId, awayId);
  if (prior) angles.push({ key: 'rematch', tone: 'warning', label: `Rematch from Week ${prior.week}` });

  const isDivision = String(home.conf) === String(away.conf) && String(home.div) === String(away.div);
  if (isDivision) angles.push({ key: 'division', tone: 'info', label: 'Division battle' });

  if (safeNum(home?.rivalTeamId, null) === awayId || safeNum(away?.rivalTeamId, null) === homeId) {
    angles.push({ key: 'rivalry', tone: 'danger', label: 'Rivalry game' });
  }

  const homeStreak = computeStreak(home?.recentResults ?? []);
  const awayStreak = computeStreak(away?.recentResults ?? []);
  if (homeStreak?.type === 'W' && homeStreak.count >= 2 && awayStreak?.type === 'L' && awayStreak.count >= 2) {
    angles.push({ key: 'form', tone: 'success', label: `${home.abbr} hot vs ${away.abbr} cold` });
  } else if (awayStreak?.type === 'W' && awayStreak.count >= 2 && homeStreak?.type === 'L' && homeStreak.count >= 2) {
    angles.push({ key: 'form', tone: 'success', label: `${away.abbr} hot vs ${home.abbr} cold` });
  }

  const conf = String(home.conf);
  const rankings = confRankings(teams, conf);
  const homeSeed = rankings.findIndex((t) => t.id === homeId) + 1;
  const awaySeed = rankings.findIndex((t) => t.id === awayId) + 1;
  if (safeNum(week) >= 11 && homeSeed > 0 && awaySeed > 0 && (homeSeed <= 9 || awaySeed <= 9)) {
    angles.push({ key: 'playoff', tone: 'warning', label: `Playoff pressure: #${homeSeed} vs #${awaySeed} in ${conf}` });
  }

  const offenseRank = [...teams].sort((a, b) => safeNum(b?.ptsFor) - safeNum(a?.ptsFor));
  const defenseRank = [...teams].sort((a, b) => safeNum(a?.ptsAgainst) - safeNum(b?.ptsAgainst));
  const homeOff = offenseRank.findIndex((t) => t.id === homeId) + 1;
  const awayOff = offenseRank.findIndex((t) => t.id === awayId) + 1;
  const homeDef = defenseRank.findIndex((t) => t.id === homeId) + 1;
  const awayDef = defenseRank.findIndex((t) => t.id === awayId) + 1;
  if (homeOff > 0 && awayDef > 0 && homeOff <= 5 && awayDef <= 5) {
    angles.push({ key: 'style-home', tone: 'info', label: `${home.abbr} top offense vs ${away.abbr} top defense` });
  } else if (awayOff > 0 && homeDef > 0 && awayOff <= 5 && homeDef <= 5) {
    angles.push({ key: 'style-away', tone: 'info', label: `${away.abbr} top offense vs ${home.abbr} top defense` });
  }

  const homePct = computeWinPct(home);
  const awayPct = computeWinPct(away);
  const gap = Math.abs(homePct - awayPct);
  if (gap >= 0.25) {
    const underdog = homePct < awayPct ? home : away;
    const favorite = underdog.id === home.id ? away : home;
    angles.push({ key: 'upset-watch', tone: 'warning', label: `Upset watch: ${underdog.abbr} chasing ${favorite.abbr}` });
  }

  return angles.slice(0, 3);
}

export function derivePostgameStory({ league, game, week }) {
  if (!game?.played) return null;
  const homeId = normalizeTeamId(game?.home);
  const awayId = normalizeTeamId(game?.away);
  const home = league?.teams?.find((t) => t.id === homeId);
  const away = league?.teams?.find((t) => t.id === awayId);
  if (!home || !away) return null;

  const homeScore = safeNum(game?.homeScore);
  const awayScore = safeNum(game?.awayScore);
  const margin = Math.abs(homeScore - awayScore);
  const total = homeScore + awayScore;
  const winner = homeScore >= awayScore ? home : away;
  const loser = winner.id === home.id ? away : home;
  const winnerScore = winner.id === home.id ? homeScore : awayScore;
  const loserScore = winner.id === home.id ? awayScore : homeScore;
  const winnerPct = computeWinPct(winner);
  const loserPct = computeWinPct(loser);

  let headline = `${winner.abbr} ${winnerScore}-${loserScore} ${loser.abbr}`;
  let detail = `${winner.name} banked a key result.`;
  let tag = 'Final';

  if (margin >= 21) {
    tag = 'Blowout';
    detail = `${winner.abbr} controlled all phases and won by ${margin}.`;
  } else if (total >= 60) {
    tag = 'Shootout';
    detail = `${winner.abbr} survived a ${total}-point shootout.`;
  } else if (total <= 27) {
    tag = 'Defensive struggle';
    detail = `Defense carried this one: only ${total} total points.`;
  } else if (margin <= 3) {
    tag = 'Nail-biter';
    detail = `${winner.abbr} escaped by one possession.`;
  }

  if (winnerPct + 0.2 < loserPct) {
    tag = 'Upset';
    detail = `${winner.abbr} upset ${loser.abbr} despite the record gap.`;
  }

  if (safeNum(game?.overtimePeriods ?? game?.ot, 0) > 0) {
    tag = 'Overtime thriller';
    detail = `${winner.abbr} won it in overtime after a late swing.`;
  }

  const possibleComeback = (() => {
    const winnerIsHome = winner.id === home.id;
    const winnerScoredSecondHalf = safeNum(winnerIsHome ? game?.secondHalfHomeScore : game?.secondHalfAwayScore);
    const loserScoredSecondHalf = safeNum(winnerIsHome ? game?.secondHalfAwayScore : game?.secondHalfHomeScore);
    return winnerScoredSecondHalf >= loserScoredSecondHalf + 10 && margin <= 10;
  })();
  if (possibleComeback) {
    tag = 'Comeback';
    detail = `${winner.abbr} closed stronger in the second half to complete the comeback.`;
  }

  if (safeNum(week) >= 17 && league?.phase === 'regular') {
    const confTeams = league?.teams?.filter((t) => String(t.conf) === String(winner.conf)) ?? [];
    const confRank = confTeams.sort((a, b) => computeWinPct(b) - computeWinPct(a));
    const winnerSeed = confRank.findIndex((t) => t.id === winner.id) + 1;
    if (winnerSeed === 1) {
      detail += ' They now sit on the conference top line.';
    } else if (winnerSeed > 0 && winnerSeed <= 7) {
      detail += ' This keeps them in the playoff field.';
    }
  }

  headline = `${tag}: ${headline}`;
  return { headline, detail, tag, winnerId: winner.id, loserId: loser.id };
}

function gatherResultGame(league, game, week) {
  const bucket = league?.resultsByWeek?.[week];
  if (!Array.isArray(bucket)) return null;
  const homeId = normalizeTeamId(game?.home);
  const awayId = normalizeTeamId(game?.away);
  return bucket.find((r) => {
    const rHome = normalizeTeamId(r?.home);
    const rAway = normalizeTeamId(r?.away);
    return (rHome === homeId && rAway === awayId) || (rHome === awayId && rAway === homeId);
  }) ?? null;
}

function topPerformer(resultGame, side) {
  const rosterStats = resultGame?.boxScore?.[side] ?? {};
  const rows = Object.entries(rosterStats)
    .map(([pid, row]) => ({ playerId: safeNum(pid, null), ...row }))
    .filter((row) => row?.stats && row?.name);
  if (!rows.length) return null;
  const scored = rows.map((row) => {
    const s = row.stats;
    const passYds = safeNum(s.passYds);
    const rushYds = safeNum(s.rushYds);
    const recYds = safeNum(s.recYds);
    const tds = safeNum(s.passTD) + safeNum(s.rushTD) + safeNum(s.recTD);
    const sacks = safeNum(s.sacks);
    const ints = safeNum(s.ints);
    const tackles = safeNum(s.tackles);
    const ff = safeNum(s.ff);
    const fr = safeNum(s.fr);
    const score = (passYds * 0.08) + (rushYds * 0.1) + (recYds * 0.1) + (tds * 12) + (sacks * 7) + (ints * 10) + (tackles * 0.4) + (ff * 4) + (fr * 4);
    return { ...row, score, tds, passYds, rushYds, recYds, sacks, ints, tackles };
  }).sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

function formatLine(player) {
  if (!player) return null;
  const parts = [];
  if (player.passYds > 0) parts.push(`${player.passYds} pass yds`);
  if (player.rushYds > 0) parts.push(`${player.rushYds} rush yds`);
  if (player.recYds > 0) parts.push(`${player.recYds} rec yds`);
  if (player.tds > 0) parts.push(`${player.tds} TD`);
  if (player.sacks > 0) parts.push(`${player.sacks} sacks`);
  if (player.ints > 0) parts.push(`${player.ints} INT`);
  if (!parts.length && player.tackles > 0) parts.push(`${player.tackles} tackles`);
  return parts.slice(0, 3).join(', ');
}

export function deriveBoxScoreImmersion({ league, game, week }) {
  if (!game?.played) return null;
  const resultGame = gatherResultGame(league, game, week);
  if (!resultGame) return null;
  const awayId = normalizeTeamId(game?.away);
  const homeId = normalizeTeamId(game?.home);
  const winnerSide = safeNum(game?.homeScore) >= safeNum(game?.awayScore) ? 'home' : 'away';
  const winnerId = winnerSide === 'home' ? homeId : awayId;
  const winner = league?.teams?.find((t) => t.id === winnerId);
  const awayBest = topPerformer(resultGame, 'away');
  const homeBest = topPerformer(resultGame, 'home');
  const playerOfGame = [awayBest, homeBest].filter(Boolean).sort((a, b) => b.score - a.score)[0] ?? null;
  const notable = [awayBest, homeBest]
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((p) => ({ playerId: p.playerId, name: p.name, pos: p.pos, line: formatLine(p) }));

  const winnerStreak = computeStreak(winner?.recentResults ?? []);
  const streakImpact = winnerStreak?.count >= 3
    ? `${winner?.abbr ?? winner?.name} pushed the streak to ${winnerStreak.type}${winnerStreak.count}.`
    : null;

  return {
    playerOfGame: playerOfGame
      ? { playerId: playerOfGame.playerId, name: playerOfGame.name, pos: playerOfGame.pos, line: formatLine(playerOfGame) }
      : null,
    notable,
    streakImpact,
    hasPlayLog: Array.isArray(resultGame?.playLogs) && resultGame.playLogs.length > 0,
  };
}

export function getLastCompletedWeek(league) {
  const currentWeek = safeNum(league?.week, 1);
  const weeks = league?.schedule?.weeks ?? [];
  for (let w = currentWeek - 1; w >= 1; w -= 1) {
    const weekData = weeks.find((wk) => safeNum(wk?.week) === w);
    if (!weekData) continue;
    const played = (weekData.games ?? []).filter((g) => g?.played);
    if (played.length) return { week: w, games: played };
  }
  return null;
}

export function deriveWeeklyHonors(league) {
  const completed = getLastCompletedWeek(league);
  if (!completed) return null;

  const stories = completed.games
    .map((game) => derivePostgameStory({ league, game, week: completed.week }))
    .filter(Boolean);
  if (!stories.length) return null;

  const gameWithLargestMargin = completed.games
    .slice()
    .sort((a, b) => Math.abs(safeNum(b.homeScore) - safeNum(b.awayScore)) - Math.abs(safeNum(a.homeScore) - safeNum(a.awayScore)))[0];

  const topScoring = completed.games
    .slice()
    .sort((a, b) => (safeNum(b.homeScore) + safeNum(b.awayScore)) - (safeNum(a.homeScore) + safeNum(a.awayScore)))[0];

  const teamOfWeekId = (() => {
    if (!gameWithLargestMargin) return null;
    return safeNum(gameWithLargestMargin.homeScore) > safeNum(gameWithLargestMargin.awayScore)
      ? normalizeTeamId(gameWithLargestMargin.home)
      : normalizeTeamId(gameWithLargestMargin.away);
  })();

  const resultsBucket = league?.resultsByWeek?.[completed.week];
  const topPlayers = [];
  const playerSeasonMap = new Map();
  for (const team of league?.teams ?? []) {
    for (const p of team?.roster ?? []) playerSeasonMap.set(safeNum(p?.id, null), safeNum(p?.yearsPro, null));
  }
  if (Array.isArray(resultsBucket)) {
    for (const result of resultsBucket) {
      const homeTop = topPerformer(result, 'home');
      const awayTop = topPerformer(result, 'away');
      if (homeTop) {
        const yearsPro = playerSeasonMap.get(homeTop.playerId);
        topPlayers.push({ ...homeTop, teamId: normalizeTeamId(result.home), gameId: result.id, isRookie: yearsPro === 0 });
      }
      if (awayTop) {
        const yearsPro = playerSeasonMap.get(awayTop.playerId);
        topPlayers.push({ ...awayTop, teamId: normalizeTeamId(result.away), gameId: result.id, isRookie: yearsPro === 0 });
      }
    }
  }
  const rankedPlayers = topPlayers.sort((a, b) => b.score - a.score);
  const playerOfWeek = rankedPlayers[0] ?? null;
  const rookieOfWeek = rankedPlayers.find((p) => p.isRookie) ?? null;

  return {
    week: completed.week,
    story: stories[0],
    statementWin: stories.find((s) => s.tag === 'Upset') ?? stories[0],
    teamOfWeekId,
    topScoringGame: topScoring,
    playerOfWeek: playerOfWeek ? {
      playerId: playerOfWeek.playerId,
      teamId: playerOfWeek.teamId,
      name: playerOfWeek.name,
      pos: playerOfWeek.pos,
      line: formatLine(playerOfWeek),
    } : null,
    rookieOfWeek: rookieOfWeek ? {
      playerId: rookieOfWeek.playerId,
      teamId: rookieOfWeek.teamId,
      name: rookieOfWeek.name,
      pos: rookieOfWeek.pos,
      line: formatLine(rookieOfWeek),
    } : null,
  };
}
