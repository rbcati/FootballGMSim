export const LEAGUE_PULSE_SOURCE = 'league_pulse_v1';

const PRIORITY_IMPORTANCE = {
  high: 90,
  medium: 65,
  low: 40,
};

const TYPE_ORDER = {
  user_result: 100,
  user_pressure: 96,
  injury_opportunity: 92,
  contract_tension: 88,
  rookie_hype: 84,
  playoff_race: 80,
  rivalry_week: 76,
  standout_performance: 72,
  league_result: 68,
};

function safeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function teamIdOf(value) {
  if (value && typeof value === 'object') return safeNumber(value.id);
  return safeNumber(value);
}

function getTeamIdFromResult(result, side) {
  return teamIdOf(result?.[side] ?? result?.[`${side}TeamId`] ?? result?.[`${side}Id`]);
}

function getScore(result, side) {
  if (side === 'home') return safeNumber(result?.scoreHome ?? result?.homeScore, 0);
  return safeNumber(result?.scoreAway ?? result?.awayScore, 0);
}

function makeTeamMap(teams = []) {
  const map = new Map();
  for (const team of teams ?? []) {
    const id = safeNumber(team?.id);
    if (id != null) map.set(id, team);
  }
  return map;
}

function makePlayerMap(players = [], teams = []) {
  const map = new Map();
  for (const player of players ?? []) {
    if (player?.id != null) map.set(String(player.id), player);
  }
  for (const team of teams ?? []) {
    for (const player of team?.roster ?? []) {
      if (player?.id != null && !map.has(String(player.id))) map.set(String(player.id), player);
    }
  }
  return map;
}

function teamName(team, fallback = 'the team') {
  return team?.name ?? team?.abbr ?? fallback;
}

function teamAbbr(team, fallback = 'TEAM') {
  return team?.abbr ?? team?.name ?? fallback;
}

function recordLabel(team) {
  const wins = safeNumber(team?.wins, 0);
  const losses = safeNumber(team?.losses, 0);
  const ties = safeNumber(team?.ties, 0);
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function resultLabel(result, teamById) {
  const homeId = getTeamIdFromResult(result, 'home');
  const awayId = getTeamIdFromResult(result, 'away');
  const home = teamById.get(homeId);
  const away = teamById.get(awayId);
  return `${teamAbbr(away, 'AWY')} ${getScore(result, 'away')} at ${teamAbbr(home, 'HME')} ${getScore(result, 'home')}`;
}

function getResultGameId(result, seasonId, week) {
  const homeId = getTeamIdFromResult(result, 'home');
  const awayId = getTeamIdFromResult(result, 'away');
  return result?.gameId ?? result?.id ?? `${seasonId ?? 'season'}_w${week}_${homeId ?? 'h'}_${awayId ?? 'a'}`;
}

function stableHash(input) {
  const text = String(input ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableTimestamp(seed) {
  return 1700000000000 + stableHash(seed);
}

function normalizePriority(priority, importance) {
  if (priority === 'high' || priority === 'medium' || priority === 'low') return priority;
  if (importance >= 80) return 'high';
  if (importance >= 55) return 'medium';
  return 'low';
}

function buildItem(type, data, context) {
  const importance = safeNumber(data.importance, PRIORITY_IMPORTANCE[data.priority] ?? PRIORITY_IMPORTANCE.medium);
  const priority = normalizePriority(data.priority, importance);
  const dedupeKey = data.dedupeKey ?? `${type}:${data.relatedTeamId ?? data.teamId ?? 'league'}:${data.relatedPlayerId ?? data.playerId ?? data.gameId ?? 'story'}`;
  const seed = `${context.seasonId ?? context.season ?? 'season'}:${context.week}:${dedupeKey}`;
  const teamId = data.teamId ?? data.relatedTeamId ?? null;
  const playerId = data.playerId ?? data.relatedPlayerId ?? null;
  return {
    id: `pulse_${stableHash(seed).toString(36)}`,
    source: LEAGUE_PULSE_SOURCE,
    type,
    category: data.category ?? 'league_pulse',
    headline: data.headline,
    body: data.body,
    priority,
    importance,
    seasonId: context.seasonId ?? null,
    season: context.season ?? context.year ?? null,
    week: context.week,
    phase: context.phase ?? 'regular',
    teamId,
    relatedTeamId: teamId,
    playerId,
    relatedPlayerId: playerId,
    gameId: data.gameId ?? null,
    dedupeKey,
    createdAt: `S${context.seasonId ?? context.season ?? context.year ?? 'season'}:W${context.week}`,
    timestamp: stableTimestamp(seed),
    sortWeight: safeNumber(data.sortWeight, TYPE_ORDER[type] ?? 50),
  };
}

function recentResults(team) {
  return Array.isArray(team?.recentResults) ? team.recentResults.map((r) => String(r).toUpperCase()) : [];
}

function streak(team, marker) {
  const results = recentResults(team);
  let count = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i] !== marker) break;
    count += 1;
  }
  return count;
}

function winPct(team) {
  const wins = safeNumber(team?.wins, 0);
  const losses = safeNumber(team?.losses, 0);
  const ties = safeNumber(team?.ties, 0);
  const games = wins + losses + ties;
  if (!games) return 0;
  return (wins + ties * 0.5) / games;
}

function findUserResult(results, userTeamId) {
  if (userTeamId == null) return null;
  return (results ?? []).find((result) => getTeamIdFromResult(result, 'home') === Number(userTeamId) || getTeamIdFromResult(result, 'away') === Number(userTeamId)) ?? null;
}

function resultWinner(result) {
  const homeScore = getScore(result, 'home');
  const awayScore = getScore(result, 'away');
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? getTeamIdFromResult(result, 'home') : getTeamIdFromResult(result, 'away');
}

function allPlayerStatRows(results = [], playerById = new Map(), context = {}) {
  const rows = [];
  for (const result of results) {
    for (const side of ['home', 'away']) {
      const teamId = getTeamIdFromResult(result, side);
      for (const [rawId, entry] of Object.entries(result?.boxScore?.[side] ?? {})) {
        const player = playerById.get(String(rawId));
        const stats = entry?.stats ?? {};
        const passYd = safeNumber(stats.passYd, 0);
        const rushYd = safeNumber(stats.rushYd, 0);
        const recYd = safeNumber(stats.recYd, 0);
        const touchdowns = safeNumber(stats.passTD, 0) + safeNumber(stats.rushTD, 0) + safeNumber(stats.recTD, 0);
        const sacks = safeNumber(stats.sacks, 0);
        const interceptions = safeNumber(stats.interceptions, 0);
        const tackles = safeNumber(stats.tackles, 0);
        const score = passYd * 0.08 + rushYd * 0.1 + recYd * 0.1 + touchdowns * 12 + sacks * 7 + interceptions * 8 + tackles * 0.35;
        if (score <= 0) continue;
        rows.push({
          playerId: rawId,
          player: player ?? null,
          name: entry?.name ?? player?.name ?? 'Impact player',
          pos: entry?.pos ?? player?.pos ?? player?.position ?? 'Player',
          teamId,
          gameId: getResultGameId(result, context.seasonId, context.week),
          stats,
          passYd,
          rushYd,
          recYd,
          touchdowns,
          sacks,
          interceptions,
          tackles,
          score,
          isRookie: safeNumber(player?.yearsPro ?? player?.yearsWithTeam, 99) === 0 || safeNumber(player?.rookie, 0) === 1,
        });
      }
    }
  }
  return rows.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
}

function playerLine(row) {
  const parts = [];
  if (row.passYd) parts.push(`${row.passYd} passing yards`);
  if (row.rushYd) parts.push(`${row.rushYd} rushing yards`);
  if (row.recYd) parts.push(`${row.recYd} receiving yards`);
  if (row.touchdowns) parts.push(`${row.touchdowns} TD`);
  if (row.sacks) parts.push(`${row.sacks} sacks`);
  if (row.interceptions) parts.push(`${row.interceptions} INT`);
  if (!parts.length && row.tackles) parts.push(`${row.tackles} tackles`);
  return parts.slice(0, 3).join(', ');
}

function nextUserGame(league, completedWeek) {
  const userTeamId = safeNumber(league?.userTeamId);
  if (userTeamId == null) return null;
  const rows = [...(league?.schedule?.weeks ?? [])].sort((a, b) => safeNumber(a?.week, 0) - safeNumber(b?.week, 0));
  for (const weekRow of rows) {
    if (safeNumber(weekRow?.week, 0) <= completedWeek) continue;
    const game = (weekRow?.games ?? []).find((g) => {
      const homeId = teamIdOf(g?.homeId ?? g?.home);
      const awayId = teamIdOf(g?.awayId ?? g?.away);
      return homeId === userTeamId || awayId === userTeamId;
    });
    if (game) return { ...game, week: safeNumber(weekRow.week, completedWeek + 1) };
  }
  return null;
}

function addUserResultStory(items, context, results, teamById) {
  const result = findUserResult(results, context.userTeamId);
  if (!result) return;
  const homeId = getTeamIdFromResult(result, 'home');
  const awayId = getTeamIdFromResult(result, 'away');
  const userIsHome = homeId === Number(context.userTeamId);
  const userTeam = teamById.get(Number(context.userTeamId));
  const opponent = teamById.get(userIsHome ? awayId : homeId);
  const userScore = userIsHome ? getScore(result, 'home') : getScore(result, 'away');
  const oppScore = userIsHome ? getScore(result, 'away') : getScore(result, 'home');
  const won = userScore > oppScore;
  const tied = userScore === oppScore;
  const gameId = getResultGameId(result, context.seasonId, context.week);
  const outcome = tied ? 'tie' : won ? 'win' : 'loss';
  items.push(buildItem('user_result', {
    headline: `${teamAbbr(userTeam, 'Your team')} ${won ? 'cash in' : tied ? 'survive' : 'feel heat'} after ${userScore}-${oppScore} ${outcome}`,
    body: `${teamName(userTeam, 'Your team')} are ${recordLabel(userTeam)} after facing ${teamName(opponent, 'the opponent')}. ${won ? 'The result gives the front office a little more breathing room before the next prep cycle.' : tied ? 'The tie keeps pressure on the next matchup.' : 'The next week now carries extra weight for the locker room and fan base.'}`,
    relatedTeamId: context.userTeamId,
    gameId,
    dedupeKey: `user-result:${gameId}`,
    priority: won ? 'medium' : 'high',
    importance: won ? 74 : 88,
  }, context));
}

function addStandoutStory(items, context, statRows, teamById) {
  const row = statRows[0];
  if (!row) return;
  const team = teamById.get(safeNumber(row.teamId));
  items.push(buildItem('standout_performance', {
    headline: `${row.name} headlines the Week ${context.week} spotlight`,
    body: `${row.pos} ${row.name} gave ${teamAbbr(team)} a real swing with ${playerLine(row)}. That kind of single-game pop can change awards chatter and weekly prep priorities.`,
    relatedTeamId: row.teamId,
    relatedPlayerId: row.playerId,
    gameId: row.gameId,
    dedupeKey: `standout:${row.gameId}:${row.playerId}`,
    priority: row.score >= 45 ? 'high' : 'medium',
    importance: row.score >= 45 ? 86 : 70,
  }, context));
}

function addRookieStory(items, context, statRows, developmentEvents, teamById, playerById) {
  const rookieRow = statRows.find((row) => row.isRookie);
  if (rookieRow) {
    const team = teamById.get(safeNumber(rookieRow.teamId));
    items.push(buildItem('rookie_hype', {
      headline: `${rookieRow.name} is earning rookie buzz`,
      body: `${teamAbbr(team)} got a fresh spark from ${rookieRow.pos} ${rookieRow.name}: ${playerLine(rookieRow)}. The development staff now has a weekly proof point to build around.`,
      relatedTeamId: rookieRow.teamId,
      relatedPlayerId: rookieRow.playerId,
      gameId: rookieRow.gameId,
      dedupeKey: `rookie:${rookieRow.playerId}`,
      priority: 'medium',
      importance: 76,
    }, context));
    return;
  }

  const dev = (developmentEvents ?? []).find((event) => event?.playerId);
  if (!dev) return;
  const player = playerById.get(String(dev.playerId));
  const team = teamById.get(safeNumber(dev.teamId ?? player?.teamId));
  items.push(buildItem('rookie_hype', {
    headline: `${player?.name ?? 'Young player'} is trending up`,
    body: `${teamAbbr(team)} coaches have a development note worth tracking: ${dev.note ?? 'practice and game reps are starting to show up.'}`,
    relatedTeamId: dev.teamId ?? player?.teamId ?? null,
    relatedPlayerId: dev.playerId,
    dedupeKey: `development:${dev.playerId}`,
    priority: 'medium',
    importance: 72,
  }, context));
}

function addPressureStories(items, context, teams) {
  const userTeam = teams.find((team) => safeNumber(team?.id) === Number(context.userTeamId));
  const pressureTeam = userTeam && (streak(userTeam, 'L') >= 2 || safeNumber(userTeam.losses, 0) >= safeNumber(userTeam.wins, 0) + 2 || safeNumber(userTeam.fanApproval, 50) < 45)
    ? userTeam
    : [...teams].filter((team) => safeNumber(team.losses, 0) >= 3 || streak(team, 'L') >= 3)
      .sort((a, b) => streak(b, 'L') - streak(a, 'L') || safeNumber(b.losses, 0) - safeNumber(a.losses, 0))[0];
  if (!pressureTeam) return;
  const skid = streak(pressureTeam, 'L');
  items.push(buildItem('user_pressure', {
    headline: `${teamName(pressureTeam)} face mounting pressure`,
    body: `Fans are getting restless with ${teamAbbr(pressureTeam)} sitting at ${recordLabel(pressureTeam)}${skid >= 2 ? ` after ${skid} straight losses` : ''}. Ownership pressure is rising before the next divisional and roster decisions.`,
    relatedTeamId: pressureTeam.id,
    dedupeKey: `pressure:${pressureTeam.id}`,
    priority: safeNumber(pressureTeam.id) === Number(context.userTeamId) ? 'high' : 'medium',
    importance: safeNumber(pressureTeam.id) === Number(context.userTeamId) ? 90 : 72,
  }, context));
}

function addContractStory(items, context, players, teams, teamById) {
  const candidates = [];
  for (const team of teams ?? []) {
    for (const player of team?.roster ?? []) candidates.push(player);
  }
  for (const player of players ?? []) candidates.push(player);
  const seen = new Set();
  const expiring = candidates
    .filter((player) => {
      if (!player?.id || seen.has(String(player.id))) return false;
      seen.add(String(player.id));
      const years = safeNumber(player?.contract?.yearsRemaining ?? player?.contract?.years, 99);
      return years <= 1 && safeNumber(player?.ovr ?? player?.overall, 0) >= 82 && safeNumber(player?.teamId) != null;
    })
    .sort((a, b) => safeNumber(b.ovr ?? b.overall, 0) - safeNumber(a.ovr ?? a.overall, 0) || String(a.name).localeCompare(String(b.name)))[0];
  if (!expiring) return;
  const team = teamById.get(safeNumber(expiring.teamId));
  items.push(buildItem('contract_tension', {
    headline: `${expiring.name} contract watch is heating up`,
    body: `${teamAbbr(team)} have a high-value ${expiring.pos ?? 'starter'} approaching the market. Waiting could raise the price if the season stays competitive.`,
    relatedTeamId: expiring.teamId,
    relatedPlayerId: expiring.id,
    dedupeKey: `contract:${expiring.id}`,
    priority: safeNumber(expiring.teamId) === Number(context.userTeamId) ? 'high' : 'medium',
    importance: safeNumber(expiring.teamId) === Number(context.userTeamId) ? 86 : 68,
  }, context));
}

function addInjuryStory(items, context, players, teams, teamById) {
  const candidates = [];
  for (const team of teams ?? []) {
    for (const player of team?.roster ?? []) candidates.push(player);
  }
  for (const player of players ?? []) candidates.push(player);
  const seen = new Set();
  const injured = candidates
    .filter((player) => {
      if (!player?.id || seen.has(String(player.id))) return false;
      seen.add(String(player.id));
      const weeks = safeNumber(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.gamesRemaining, 0);
      const status = String(player?.status ?? '').toLowerCase();
      return weeks > 0 || status === 'injured' || status === 'ir';
    })
    .sort((a, b) => safeNumber(b.ovr ?? b.overall, 0) - safeNumber(a.ovr ?? a.overall, 0) || String(a.name).localeCompare(String(b.name)))[0];
  if (!injured) return;
  const weeks = safeNumber(injured?.injuryWeeksRemaining ?? injured?.injuredWeeks ?? injured?.injury?.gamesRemaining, 0);
  const team = teamById.get(safeNumber(injured.teamId));
  items.push(buildItem('injury_opportunity', {
    headline: `${teamAbbr(team)} depth chart gets tested`,
    body: `${injured.pos ?? 'Starter'} ${injured.name} is a concern${weeks ? ` for ${weeks} week${weeks === 1 ? '' : 's'}` : ''}. The next man up could swing weekly prep and roster priorities.`,
    relatedTeamId: injured.teamId,
    relatedPlayerId: injured.id,
    dedupeKey: `injury-depth:${injured.id}`,
    priority: safeNumber(injured.teamId) === Number(context.userTeamId) ? 'high' : 'medium',
    importance: safeNumber(injured.teamId) === Number(context.userTeamId) ? 88 : 70,
  }, context));
}

function addPlayoffRaceStory(items, context, teams) {
  if (context.week < 13 || teams.length < 8) return;
  const sorted = [...teams].sort((a, b) => winPct(b) - winPct(a) || safeNumber(b.ptsFor ?? b.pf, 0) - safeNumber(a.ptsFor ?? a.pf, 0));
  const bubble = sorted[6] ?? sorted[Math.min(sorted.length - 1, 3)];
  const chaser = sorted[7] ?? sorted[Math.min(sorted.length - 1, 4)];
  if (!bubble || !chaser) return;
  items.push(buildItem('playoff_race', {
    headline: `${teamAbbr(bubble)} are clinging to the playoff line`,
    body: `${teamName(bubble)} sit at ${recordLabel(bubble)}, with ${teamAbbr(chaser)} close enough to turn every late-season result into a standings swing.`,
    relatedTeamId: bubble.id,
    dedupeKey: `playoff-race:${bubble.id}:${chaser.id}`,
    priority: 'high',
    importance: 84,
  }, context));
}

function addRivalryStory(items, context, league, teamById) {
  const next = nextUserGame(league, context.week);
  if (!next) return;
  const homeId = teamIdOf(next.homeId ?? next.home);
  const awayId = teamIdOf(next.awayId ?? next.away);
  const userTeam = teamById.get(Number(context.userTeamId));
  const oppId = homeId === Number(context.userTeamId) ? awayId : homeId;
  const opponent = teamById.get(oppId);
  const isRival = Number(userTeam?.rivalTeamId) === Number(oppId)
    || (userTeam?.conf != null && userTeam?.div != null && Number(userTeam.conf) === Number(opponent?.conf) && Number(userTeam.div) === Number(opponent?.div));
  if (!isRival) return;
  items.push(buildItem('rivalry_week', {
    headline: `Rivalry week buzz: ${teamAbbr(userTeam)} vs ${teamAbbr(opponent)}`,
    body: `${teamName(userTeam, 'Your team')} get ${teamName(opponent, 'a rival')} next. Division pressure, fan noise, and locker-room stakes should make this more than another game on the schedule.`,
    relatedTeamId: context.userTeamId,
    dedupeKey: `rivalry-next:${context.userTeamId}:${oppId}:w${next.week}`,
    priority: 'medium',
    importance: 74,
  }, context));
}

function addLeagueResultStory(items, context, results, teamById) {
  if (!results.length) return;
  const sorted = [...results]
    .map((result) => ({ result, margin: Math.abs(getScore(result, 'home') - getScore(result, 'away')), total: getScore(result, 'home') + getScore(result, 'away') }))
    .sort((a, b) => a.margin - b.margin || b.total - a.total)[0];
  if (!sorted) return;
  const winnerId = resultWinner(sorted.result);
  const winner = teamById.get(winnerId);
  const gameId = getResultGameId(sorted.result, context.seasonId, context.week);
  items.push(buildItem('league_result', {
    headline: `${teamAbbr(winner, 'League')} grab the week's tightest finish`,
    body: `${resultLabel(sorted.result, teamById)} ended with a ${sorted.margin}-point margin. Around the league, that kind of finish can reshape momentum and pressure charts.`,
    relatedTeamId: winnerId,
    gameId,
    dedupeKey: `league-result:${gameId}`,
    priority: 'medium',
    importance: sorted.margin <= 3 ? 75 : 62,
  }, context));
}

export function buildLeaguePulseItems({ league = {}, results = [], developmentEvents = [], players = [], week = null, phase = null } = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const teamById = makeTeamMap(teams);
  const playerById = makePlayerMap(players, teams);
  const resolvedWeek = safeNumber(week ?? league?.week ?? league?.currentWeek, 1);
  const context = {
    seasonId: league?.seasonId ?? league?.currentSeasonId ?? null,
    season: league?.season ?? league?.year ?? null,
    year: league?.year ?? league?.season ?? null,
    week: resolvedWeek,
    phase: phase ?? league?.phase ?? 'regular',
    userTeamId: safeNumber(league?.userTeamId),
  };
  const normalizedResults = Array.isArray(results) ? results : [];
  const statRows = allPlayerStatRows(normalizedResults, playerById, context);
  const items = [];

  addUserResultStory(items, context, normalizedResults, teamById);
  addPressureStories(items, context, teams);
  addInjuryStory(items, context, players, teams, teamById);
  addContractStory(items, context, players, teams, teamById);
  addRookieStory(items, context, statRows, developmentEvents, teamById, playerById);
  addPlayoffRaceStory(items, context, teams);
  addRivalryStory(items, context, league, teamById);
  addStandoutStory(items, context, statRows, teamById);
  addLeagueResultStory(items, context, normalizedResults, teamById);

  const seen = new Set();
  return items
    .filter((item) => {
      if (!item?.headline || !item?.body || seen.has(item.dedupeKey)) return false;
      seen.add(item.dedupeKey);
      return true;
    })
    .sort((a, b) => {
      const aTeam = Number(a.relatedTeamId) === Number(context.userTeamId) ? 1 : 0;
      const bTeam = Number(b.relatedTeamId) === Number(context.userTeamId) ? 1 : 0;
      return (bTeam - aTeam)
        || safeNumber(b.importance, 0) - safeNumber(a.importance, 0)
        || safeNumber(b.sortWeight, 0) - safeNumber(a.sortWeight, 0)
        || String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 8);
}

export function mergeLeaguePulseItems(existingItems = [], pulseItems = [], { currentWeek = null, cooldownWeeks = 3, maxItems = 200 } = {}) {
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const accepted = [];
  const acceptedKeys = new Set();

  for (const item of pulseItems ?? []) {
    if (!item?.dedupeKey || acceptedKeys.has(item.dedupeKey)) continue;
    const itemWeek = safeNumber(item.week, safeNumber(currentWeek, 1));
    const duplicate = existing.some((existingItem) => {
      if (existingItem?.source !== LEAGUE_PULSE_SOURCE || existingItem?.dedupeKey !== item.dedupeKey) return false;
      const existingWeek = safeNumber(existingItem.week, itemWeek);
      return Math.abs(itemWeek - existingWeek) < cooldownWeeks;
    });
    if (duplicate) continue;
    accepted.push(item);
    acceptedKeys.add(item.dedupeKey);
  }

  return [...accepted, ...existing].slice(0, maxItems);
}

export function selectLeaguePulseHighlights(league, { limit = 5 } = {}) {
  const userTeamId = safeNumber(league?.userTeamId);
  const rows = Array.isArray(league?.newsItems) ? league.newsItems : [];
  return rows
    .filter((item) => item?.source === LEAGUE_PULSE_SOURCE || item?.category === 'league_pulse')
    .sort((a, b) => {
      const aTeam = Number(a?.relatedTeamId ?? a?.teamId) === Number(userTeamId) ? 1 : 0;
      const bTeam = Number(b?.relatedTeamId ?? b?.teamId) === Number(userTeamId) ? 1 : 0;
      return (bTeam - aTeam)
        || safeNumber(b?.importance, 0) - safeNumber(a?.importance, 0)
        || safeNumber(b?.timestamp, 0) - safeNumber(a?.timestamp, 0)
        || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    })
    .slice(0, limit);
}
