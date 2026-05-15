import { deriveCompactResultRecap, selectWeekGames } from './gameCenterResults.js';

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamIdOf(side) {
  if (side && typeof side === 'object') return safeNumber(side.id);
  return safeNumber(side);
}

function toTeamMap(teams = []) {
  const map = new Map();
  for (const team of teams) {
    const id = safeNumber(team?.id);
    if (id != null) map.set(id, team);
  }
  return map;
}

function teamLabel(team, fallback = 'Team') {
  return team?.abbr ?? team?.name ?? fallback;
}

function gameKey(game, idx = 0) {
  return game?.id ?? game?.gameId ?? `${teamIdOf(game?.away) ?? 'a'}-${teamIdOf(game?.home) ?? 'h'}-${idx}`;
}

function isCompleted(game) {
  return Boolean(game?.played || (safeNumber(game?.homeScore) != null && safeNumber(game?.awayScore) != null));
}

function getCompletedGamesForWeek(league, week) {
  return selectWeekGames(league?.schedule, week).filter(isCompleted);
}

function buildSeasonStatsToWeek(league, week) {
  const stats = new Map();
  const ensure = (teamId) => {
    if (teamId == null) return null;
    if (!stats.has(teamId)) {
      stats.set(teamId, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, results: [] });
    }
    return stats.get(teamId);
  };
  for (const weekRow of league?.schedule?.weeks ?? []) {
    if (safeNumber(weekRow?.week) == null || Number(weekRow.week) > Number(week)) continue;
    for (const game of weekRow?.games ?? []) {
      if (!isCompleted(game)) continue;
      const homeId = teamIdOf(game?.home);
      const awayId = teamIdOf(game?.away);
      const homeScore = safeNumber(game?.homeScore);
      const awayScore = safeNumber(game?.awayScore);
      if (homeId == null || awayId == null || homeScore == null || awayScore == null) continue;
      const home = ensure(homeId);
      const away = ensure(awayId);
      home.pf += homeScore; home.pa += awayScore;
      away.pf += awayScore; away.pa += homeScore;
      if (homeScore > awayScore) {
        home.wins += 1; away.losses += 1; home.results.push('W'); away.results.push('L');
      } else if (homeScore < awayScore) {
        away.wins += 1; home.losses += 1; away.results.push('W'); home.results.push('L');
      } else {
        home.ties += 1; away.ties += 1; home.results.push('T'); away.results.push('T');
      }
    }
  }
  return stats;
}

function winPct(row) {
  const games = (row?.wins ?? 0) + (row?.losses ?? 0) + (row?.ties ?? 0);
  if (!games) return 0;
  return ((row?.wins ?? 0) + 0.5 * (row?.ties ?? 0)) / games;
}

function streakFromResults(results = []) {
  if (!results.length) return { type: null, length: 0 };
  const last = results[results.length - 1];
  if (last === 'T') return { type: 'T', length: 1 };
  let length = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i] !== last) break;
    length += 1;
  }
  return { type: last, length };
}

function rankConference(teams, stats, conf) {
  return teams
    .filter((t) => safeNumber(t?.conf) === conf)
    .map((t) => ({ team: t, stat: stats.get(safeNumber(t?.id)) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, results: [] } }))
    .sort((a, b) => {
      const pctDiff = winPct(b.stat) - winPct(a.stat);
      if (Math.abs(pctDiff) > 1e-9) return pctDiff;
      const pdDiff = (b.stat.pf - b.stat.pa) - (a.stat.pf - a.stat.pa);
      if (pdDiff !== 0) return pdDiff;
      return teamLabel(a.team).localeCompare(teamLabel(b.team));
    });
}

function calculateSpotlightScore(game, teamMap, weekStats) {
  const home = teamMap.get(teamIdOf(game?.home));
  const away = teamMap.get(teamIdOf(game?.away));
  const homeScore = safeNumber(game?.homeScore);
  const awayScore = safeNumber(game?.awayScore);
  if (homeScore == null || awayScore == null) return -1;
  const margin = Math.abs(homeScore - awayScore);
  let score = 0;
  score += Math.max(0, 14 - margin) * 3;
  const quarters = safeNumber(game?.quarterScores?.home?.length ?? game?.quarterScores?.away?.length) ?? 0;
  if (quarters > 4 || game?.wentToOT || game?.overtime) score += 14;
  const winnerId = homeScore > awayScore ? teamIdOf(game?.home) : (awayScore > homeScore ? teamIdOf(game?.away) : null);
  const loserId = winnerId === teamIdOf(game?.home) ? teamIdOf(game?.away) : teamIdOf(game?.home);
  const winnerPct = winPct(weekStats.get(winnerId));
  const loserPct = winPct(weekStats.get(loserId));
  if (winnerId != null && loserId != null && winnerPct + 0.2 < loserPct) score += 12;
  if (winnerPct >= 0.65 || loserPct >= 0.65) score += 5;
  if (typeof game?.summary?.storyline === 'string' && game.summary.storyline.trim()) score += 4;
  if ((home?.wins ?? 0) + (away?.wins ?? 0) >= 10) score += 2;
  return score;
}

function buildTrajectory(team, stat) {
  const results = stat?.results ?? [];
  const streak = streakFromResults(results);
  const shortStreak = streak.type === 'W' ? `${streak.length}W streak` : streak.type === 'L' ? `${streak.length}L skid` : 'mixed form';
  const pd = (stat?.pf ?? 0) - (stat?.pa ?? 0);
  const tail = results.slice(-3);
  const winsLast3 = tail.filter((r) => r === 'W').length;
  const form = winsLast3 >= 2 ? 'trending up' : winsLast3 === 0 && tail.length === 3 ? 'under pressure' : 'holding steady';
  const pdLabel = pd >= 0 ? `+${pd}` : `${pd}`;
  return `${shortStreak}; point diff ${pdLabel}; ${form}.`;
}

export function buildWeeklyLeagueRecap(league, { week, maxBullets = 6 } = {}) {
  const selectedWeek = Number(week ?? league?.week ?? 1);
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const teamMap = toTeamMap(teams);
  const completedGames = getCompletedGamesForWeek(league, selectedWeek);
  const weekStats = buildSeasonStatsToWeek(league, selectedWeek);
  const prevStats = buildSeasonStatsToWeek(league, selectedWeek - 1);

  const ranked = teams
    .map((team) => ({ team, stat: weekStats.get(safeNumber(team?.id)) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, results: [] } }))
    .sort((a, b) => {
      const pctDiff = winPct(b.stat) - winPct(a.stat);
      if (Math.abs(pctDiff) > 1e-9) return pctDiff;
      return ((b.stat.pf - b.stat.pa) - (a.stat.pf - a.stat.pa)) || teamLabel(a.team).localeCompare(teamLabel(b.team));
    });

  const bullets = [];
  if (ranked[0]) {
    const leader = ranked[0];
    bullets.push(`${teamLabel(leader.team)} stayed on top at ${leader.stat.wins}-${leader.stat.losses}${leader.stat.ties ? `-${leader.stat.ties}` : ''}.`);
  }

  if (completedGames.length > 0) {
    const biggestUpset = completedGames
      .map((game, idx) => {
        const homeId = teamIdOf(game?.home);
        const awayId = teamIdOf(game?.away);
        const homeScore = safeNumber(game?.homeScore);
        const awayScore = safeNumber(game?.awayScore);
        if (homeId == null || awayId == null || homeScore == null || awayScore == null) return null;
        const winnerId = homeScore > awayScore ? homeId : awayId;
        const loserId = winnerId === homeId ? awayId : homeId;
        const winnerPct = winPct(prevStats.get(winnerId));
        const loserPct = winPct(prevStats.get(loserId));
        return { game, idx, delta: loserPct - winnerPct, winnerId, loserId };
      })
      .filter(Boolean)
      .sort((a, b) => (b.delta - a.delta) || gameKey(a.game, a.idx).localeCompare(gameKey(b.game, b.idx)))[0];
    if (biggestUpset && biggestUpset.delta > 0.15) {
      const winner = teamLabel(teamMap.get(biggestUpset.winnerId));
      const loser = teamLabel(teamMap.get(biggestUpset.loserId));
      bullets.push(`Biggest upset: ${winner} knocked off ${loser}.`);
    }

    const closest = completedGames
      .map((game, idx) => ({ game, idx, margin: Math.abs((safeNumber(game?.homeScore) ?? 0) - (safeNumber(game?.awayScore) ?? 0)) }))
      .sort((a, b) => (a.margin - b.margin) || gameKey(a.game, a.idx).localeCompare(gameKey(b.game, b.idx)))[0];
    if (closest && Number.isFinite(closest.margin)) {
      const home = teamLabel(teamMap.get(teamIdOf(closest.game?.home)), 'Home');
      const away = teamLabel(teamMap.get(teamIdOf(closest.game?.away)), 'Away');
      bullets.push(`${away} vs ${home} was the tightest finish (${closest.margin}-point margin).`);
    }
  }

  const streakRows = ranked
    .map(({ team, stat }) => ({ team, streak: streakFromResults(stat.results) }))
    .filter((row) => row.streak.length >= 3 && (row.streak.type === 'W' || row.streak.type === 'L'))
    .sort((a, b) => (b.streak.length - a.streak.length) || teamLabel(a.team).localeCompare(teamLabel(b.team)));
  if (streakRows[0]) {
    const s = streakRows[0];
    bullets.push(`${teamLabel(s.team)} is on a ${s.streak.length}-game ${s.streak.type === 'W' ? 'winning streak' : 'slide'}.`);
  }

  const movers = ranked
    .map((row, idx) => {
      const id = safeNumber(row.team?.id);
      const prevRank = teams
        .map((team) => ({ team, stat: prevStats.get(safeNumber(team?.id)) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 } }))
        .sort((a, b) => (winPct(b.stat) - winPct(a.stat)) || ((b.stat.pf - b.stat.pa) - (a.stat.pf - a.stat.pa)) || teamLabel(a.team).localeCompare(teamLabel(b.team)))
        .findIndex((entry) => safeNumber(entry.team?.id) === id);
      return { team: row.team, change: (prevRank + 1) - (idx + 1) };
    })
    .sort((a, b) => (b.change - a.change) || teamLabel(a.team).localeCompare(teamLabel(b.team)));
  if (movers[0]?.change > 0) bullets.push(`${teamLabel(movers[0].team)} climbed ${movers[0].change} spot${movers[0].change > 1 ? 's' : ''} in league order.`);

  const conf0 = rankConference(teams, weekStats, 0);
  const conf1 = rankConference(teams, weekStats, 1);
  const bubbleLine = [conf0, conf1]
    .map((conf) => {
      if (conf.length < 8) return null;
      const line = conf[6];
      const chaser = conf[7];
      const gap = winPct(line.stat) - winPct(chaser.stat);
      return { line, chaser, gap };
    })
    .filter(Boolean)
    .sort((a, b) => a.gap - b.gap)[0];
  if (bubbleLine && selectedWeek >= 5) {
    bullets.push(`Playoff bubble watch: ${teamLabel(bubbleLine.line.team)} leads ${teamLabel(bubbleLine.chaser.team)} by ${(bubbleLine.gap * 100).toFixed(1)} pct points.`);
  }

  const hottest = ranked
    .map(({ team, stat }) => ({ team, streak: streakFromResults(stat.results), pct: winPct(stat) }))
    .sort((a, b) => {
      const streakDiff = ((b.streak.type === 'W') ? b.streak.length : -b.streak.length) - ((a.streak.type === 'W') ? a.streak.length : -a.streak.length);
      if (streakDiff !== 0) return streakDiff;
      return b.pct - a.pct;
    });

  const coldest = [...hottest].reverse();

  const spotlights = completedGames
    .map((game, idx) => {
      const score = calculateSpotlightScore(game, teamMap, prevStats);
      return {
        key: gameKey(game, idx),
        game,
        week: selectedWeek,
        reason: deriveCompactResultRecap(game, {
          awayTeam: teamMap.get(teamIdOf(game?.away)),
          homeTeam: teamMap.get(teamIdOf(game?.home)),
        }),
        score,
      };
    })
    .sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key))
    .slice(0, 3);

  const trajectories = ranked.slice(0, 2).concat(ranked.slice(-2))
    .filter((entry, idx, arr) => arr.findIndex((r) => safeNumber(r.team?.id) === safeNumber(entry.team?.id)) === idx)
    .slice(0, 4)
    .map(({ team, stat }) => ({
      teamId: safeNumber(team?.id),
      label: teamLabel(team),
      snippet: buildTrajectory(team, stat),
    }));

  return {
    bullets: bullets.filter(Boolean).slice(0, Math.max(3, maxBullets)),
    raceCenter: {
      hottest: hottest.filter((entry) => entry.streak.type === 'W' && entry.streak.length >= 2).slice(0, 3),
      coldest: coldest.filter((entry) => entry.streak.type === 'L' && entry.streak.length >= 2).slice(0, 3),
      longestWinning: hottest.find((entry) => entry.streak.type === 'W') ?? null,
      longestLosing: coldest.find((entry) => entry.streak.type === 'L') ?? null,
      biggestMover: movers[0] ?? null,
      bubble: bubbleLine,
    },
    spotlights,
    trajectories,
  };
}
