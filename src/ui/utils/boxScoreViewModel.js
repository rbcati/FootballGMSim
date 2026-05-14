import { mergeArchivedGameWithScheduleResult, normalizeArchivedGamePayload } from '../../core/gameArchive.js';

const QUALITY = { full: 'Full detail', partial: 'Partial detail', score: 'Score only', missing: 'Missing detail' };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const mdash = '—';

function teamInfo(league, id, side, game) {
  const team = (league?.teams ?? []).find((t) => Number(t?.id) === Number(id)) ?? league?.teamById?.[id] ?? null;
  return {
    id: id ?? null,
    abbr: team?.abbr ?? game?.[`${side}Abbr`] ?? game?.[side]?.abbr ?? (side === 'home' ? 'HOME' : 'AWAY'),
    name: team?.name ?? game?.[`${side}Name`] ?? game?.[side]?.name ?? team?.abbr ?? 'Unknown',
    logo: team?.logo ?? team?.logoUrl ?? null,
  };
}

function normalizePlayerId(id) {
  const numeric = Number(id);
  return Number.isFinite(numeric) ? numeric : id;
}

function normalizePlayers(raw = {}, side, teamId) {
  return Object.entries(raw || {}).map(([id, row]) => ({ playerId: normalizePlayerId(id), teamId, teamSide: side, ...row, stats: row?.stats ?? row ?? {} }));
}

function formatScoreLine(awayTeam, homeTeam, finalScore) {
  return `${awayTeam?.abbr ?? 'AWY'} ${finalScore?.away ?? mdash} - ${finalScore?.home ?? mdash} ${homeTeam?.abbr ?? 'HME'}`;
}

function buildHeadline({ awayTeam, homeTeam, finalScore, status }) {
  const away = toNum(finalScore?.away);
  const home = toNum(finalScore?.home);
  if (away == null || home == null) return status === 'Final' ? 'Final score unavailable' : 'Game not final';
  if (away === home) return `${awayTeam?.abbr ?? 'Away'} and ${homeTeam?.abbr ?? 'Home'} finished tied`;
  const winner = away > home ? awayTeam : homeTeam;
  const loser = away > home ? homeTeam : awayTeam;
  return `${winner?.abbr ?? 'Winner'} defeated ${loser?.abbr ?? 'Opponent'} by ${Math.abs(away - home)}`;
}

function teamStatValue(teamTotals, side, keys) {
  const stats = teamTotals?.[side] ?? {};
  for (const key of keys) {
    if (stats[key] != null) return stats[key];
  }
  return null;
}

function formatThirdDown(stats) {
  const made = stats?.thirdDownMade;
  const att = stats?.thirdDownAtt;
  if (made == null && att == null) return null;
  return `${made ?? 0}/${att ?? 0}`;
}

function formatRedZone(stats) {
  const made = stats?.redZoneMade ?? stats?.redZoneScores;
  const att = stats?.redZoneAtt ?? stats?.redZoneTrips;
  if (made == null && att == null) return null;
  return `${made ?? 0}/${att ?? 0}`;
}

function buildTeamComparisonRows(teamTotals = {}) {
  const rows = [
    { key: 'totalYards', label: 'Total Yards', away: teamStatValue(teamTotals, 'away', ['totalYards']), home: teamStatValue(teamTotals, 'home', ['totalYards']), higherIsBetter: true },
    { key: 'passYards', label: 'Pass Yards', away: teamStatValue(teamTotals, 'away', ['passYards', 'passYd', 'passYds']), home: teamStatValue(teamTotals, 'home', ['passYards', 'passYd', 'passYds']), higherIsBetter: true },
    { key: 'rushYards', label: 'Rush Yards', away: teamStatValue(teamTotals, 'away', ['rushYards', 'rushYd', 'rushYds']), home: teamStatValue(teamTotals, 'home', ['rushYards', 'rushYd', 'rushYds']), higherIsBetter: true },
    { key: 'plays', label: 'Plays', away: teamStatValue(teamTotals, 'away', ['plays']), home: teamStatValue(teamTotals, 'home', ['plays']), higherIsBetter: true },
    { key: 'yardsPerPlay', label: 'Yards/Play', away: teamStatValue(teamTotals, 'away', ['yardsPerPlay']), home: teamStatValue(teamTotals, 'home', ['yardsPerPlay']), higherIsBetter: true },
    { key: 'turnovers', label: 'Turnovers', away: teamStatValue(teamTotals, 'away', ['turnovers']), home: teamStatValue(teamTotals, 'home', ['turnovers']), higherIsBetter: false },
    { key: 'sacks', label: 'Sacks', away: teamStatValue(teamTotals, 'away', ['sacks']), home: teamStatValue(teamTotals, 'home', ['sacks']), higherIsBetter: true },
    { key: 'sacksAllowed', label: 'Sacks Allowed', away: teamStatValue(teamTotals, 'away', ['sacksAllowed']), home: teamStatValue(teamTotals, 'home', ['sacksAllowed']), higherIsBetter: false },
    { key: 'penalties', label: 'Penalties', away: teamStatValue(teamTotals, 'away', ['penalties']), home: teamStatValue(teamTotals, 'home', ['penalties']), higherIsBetter: false },
    { key: 'firstDowns', label: 'First Downs', away: teamStatValue(teamTotals, 'away', ['firstDowns']), home: teamStatValue(teamTotals, 'home', ['firstDowns']), higherIsBetter: true },
    { key: 'thirdDown', label: 'Third Down', away: formatThirdDown(teamTotals.away), home: formatThirdDown(teamTotals.home), compareAway: teamStatValue(teamTotals, 'away', ['thirdDownMade']), compareHome: teamStatValue(teamTotals, 'home', ['thirdDownMade']), higherIsBetter: true },
    { key: 'redZone', label: 'Red Zone', away: formatRedZone(teamTotals.away), home: formatRedZone(teamTotals.home), compareAway: teamStatValue(teamTotals, 'away', ['redZoneMade', 'redZoneScores']), compareHome: teamStatValue(teamTotals, 'home', ['redZoneMade', 'redZoneScores']), higherIsBetter: true },
    { key: 'timePossession', label: 'Time of Possession', away: teamStatValue(teamTotals, 'away', ['timePossession']), home: teamStatValue(teamTotals, 'home', ['timePossession']), higherIsBetter: true },
  ].filter((row) => row.away != null || row.home != null);

  return rows.map((row) => {
    const awayNum = toNum(row.compareAway ?? row.away);
    const homeNum = toNum(row.compareHome ?? row.home);
    let winner = null;
    if (awayNum != null && homeNum != null && awayNum !== homeNum) {
      winner = row.higherIsBetter === false
        ? (awayNum < homeNum ? 'away' : 'home')
        : (awayNum > homeNum ? 'away' : 'home');
    }
    return { ...row, winner };
  });
}

const PLAYER_SECTION_SPECS = [
  { key: 'passing', title: 'Passing', defaultSort: 'passYd', countLabel: 'passers', cols: [['passComp', 'Cmp'], ['passAtt', 'Att'], ['passYd', 'Yds'], ['passTD', 'TD'], ['interceptions', 'INT'], ['sacked', 'Sck'], ['passerRating', 'Rate']], include: (s) => toNum(s.passAtt) > 0 },
  { key: 'rushing', title: 'Rushing', defaultSort: 'rushYd', countLabel: 'rushers', cols: [['rushAtt', 'Att'], ['rushYd', 'Yds'], ['rushTD', 'TD'], ['fumbles', 'Fum'], ['rushLong', 'Long']], include: (s) => toNum(s.rushAtt) > 0 },
  { key: 'receiving', title: 'Receiving', defaultSort: 'recYd', countLabel: 'receivers', cols: [['targets', 'Tgt'], ['receptions', 'Rec'], ['recYd', 'Yds'], ['recTD', 'TD'], ['drops', 'Drop'], ['recLong', 'Long']], include: (s) => toNum(s.receptions) > 0 || toNum(s.targets) > 0 },
  { key: 'defense', title: 'Defense', defaultSort: 'tackles', countLabel: 'defenders', cols: [['tackles', 'Tkl'], ['sacks', 'Sack'], ['tfl', 'TFL'], ['interceptions', 'INT'], ['passesDefended', 'PD'], ['forcedFumbles', 'FF'], ['fumbleRecoveries', 'FR'], ['defTD', 'TD']], include: (s) => toNum(s.tackles) > 0 || toNum(s.sacks) > 0 || toNum(s.interceptions) > 0 || toNum(s.passesDefended) > 0 || toNum(s.forcedFumbles) > 0 },
  { key: 'specialTeams', title: 'Special Teams', defaultSort: 'points', countLabel: 'specialists', cols: [['fieldGoalsMade', 'FGM'], ['fieldGoalsAttempted', 'FGA'], ['extraPointsMade', 'XPM'], ['extraPointsAttempted', 'XPA'], ['punts', 'Punt'], ['puntYards', 'Punt Yds'], ['kickReturns', 'KR'], ['kickReturnYards', 'KR Yds'], ['puntReturns', 'PR'], ['puntReturnYards', 'PR Yds'], ['returnTD', 'TD']], include: (s) => toNum(s.fieldGoalsAttempted) > 0 || toNum(s.extraPointsAttempted) > 0 || toNum(s.punts) > 0 || toNum(s.kickReturns) > 0 || toNum(s.puntReturns) > 0 },
  { key: 'kicking', title: 'Kicking', defaultSort: 'points', countLabel: 'kickers', cols: [['fieldGoalsMade', 'FGM'], ['fieldGoalsAttempted', 'FGA'], ['fieldGoalPct', 'FG%'], ['extraPointsMade', 'XPM'], ['extraPointsAttempted', 'XPA'], ['points', 'Pts']], include: (s) => toNum(s.fieldGoalsAttempted) > 0 || toNum(s.extraPointsAttempted) > 0 },
  { key: 'punting', title: 'Punting', defaultSort: 'puntYards', countLabel: 'punters', cols: [['punts', 'Punt'], ['puntYards', 'Yds'], ['puntAvg', 'Avg'], ['puntLong', 'Long'], ['puntsInside20', 'In20']], include: (s) => toNum(s.punts) > 0 },
  { key: 'returns', title: 'Returns', defaultSort: 'returnYards', countLabel: 'returners', cols: [['kickReturns', 'KR'], ['kickReturnYards', 'KR Yds'], ['puntReturns', 'PR'], ['puntReturnYards', 'PR Yds'], ['returnTD', 'TD']], include: (s) => toNum(s.kickReturns) > 0 || toNum(s.puntReturns) > 0 },
  { key: 'blocking', title: 'Blocking', defaultSort: 'passBlockWinRate', countLabel: 'blockers', cols: [['passBlockWins', 'PBW'], ['passBlockAttempts', 'PBA'], ['passBlockWinRate', 'PBWR'], ['runBlockWins', 'RBW'], ['runBlockAttempts', 'RBA'], ['runBlockWinRate', 'RBWR']], include: (s) => toNum(s.passBlockAttempts) > 0 || toNum(s.runBlockAttempts) > 0 },
];

function sortPlayers(players, sortKey, dir = 'desc') {
  const direction = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    const aVal = toNum(a?.stats?.[sortKey]) ?? -Infinity;
    const bVal = toNum(b?.stats?.[sortKey]) ?? -Infinity;
    const delta = (aVal - bVal) * direction;
    if (delta !== 0) return delta;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? '')) || Number(a?.playerId ?? 0) - Number(b?.playerId ?? 0);
  });
}

export function buildPlayerStatSections(playerTables = {}, sortOverrides = {}) {
  return PLAYER_SECTION_SPECS.map((spec) => {
    const sort = sortOverrides[spec.title] ?? { key: spec.defaultSort, dir: 'desc' };
    const away = sortPlayers((playerTables.away ?? []).filter((p) => spec.include(p.stats ?? {})), sort.key, sort.dir);
    const home = sortPlayers((playerTables.home ?? []).filter((p) => spec.include(p.stats ?? {})), sort.key, sort.dir);
    return {
      ...spec,
      sort,
      teams: { away, home },
      totalPlayers: away.length + home.length,
      empty: away.length === 0 && home.length === 0,
      showingLabel: `Showing ${away.length + home.length} ${spec.countLabel}`,
    };
  }).filter((section) => !section.empty);
}


function formatPlayerName(player) {
  return player?.name ?? player?.playerName ?? 'Unknown player';
}

function firstFiniteStat(stats = {}, keys = []) {
  for (const key of keys) {
    const value = toNum(stats?.[key]);
    if (value != null) return { key, value };
  }
  return null;
}

function sortLeaderCandidates(players, primaryKeys = [], tieKeys = []) {
  return [...players].sort((a, b) => {
    const aPrimary = firstFiniteStat(a?.stats, primaryKeys)?.value ?? -Infinity;
    const bPrimary = firstFiniteStat(b?.stats, primaryKeys)?.value ?? -Infinity;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;
    for (const key of tieKeys) {
      const aTie = toNum(a?.stats?.[key]) ?? -Infinity;
      const bTie = toNum(b?.stats?.[key]) ?? -Infinity;
      if (aTie !== bTie) return bTie - aTie;
    }
    return String(a?.teamSide ?? '').localeCompare(String(b?.teamSide ?? ''))
      || String(formatPlayerName(a)).localeCompare(String(formatPlayerName(b)))
      || String(a?.playerId ?? '').localeCompare(String(b?.playerId ?? ''));
  });
}

function formatLeaderLine(player, statKeys = []) {
  if (!player) return 'Not recorded';
  const parts = statKeys
    .map(([key, label]) => {
      const value = player?.stats?.[key];
      if (value == null || Number(value) === 0) return null;
      return `${value} ${label}`;
    })
    .filter(Boolean);
  return `${formatPlayerName(player)}${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

const LEADER_SPECS = [
  { key: 'passing', label: 'Passing', includeKeys: ['passAtt', 'passYd'], primaryKeys: ['passYd'], tieKeys: ['passTD', 'passComp'], lineKeys: [['passYd', 'yds'], ['passTD', 'TD'], ['interceptions', 'INT']] },
  { key: 'rushing', label: 'Rushing', includeKeys: ['rushAtt', 'rushYd'], primaryKeys: ['rushYd'], tieKeys: ['rushTD', 'rushAtt'], lineKeys: [['rushYd', 'yds'], ['rushTD', 'TD'], ['rushAtt', 'att']] },
  { key: 'receiving', label: 'Receiving', includeKeys: ['targets', 'receptions', 'recYd'], primaryKeys: ['recYd'], tieKeys: ['recTD', 'receptions'], lineKeys: [['recYd', 'yds'], ['recTD', 'TD'], ['receptions', 'rec']] },
  { key: 'defense', label: 'Defense', includeKeys: ['tackles', 'sacks', 'interceptions', 'passesDefended', 'forcedFumbles'], primaryKeys: ['sacks', 'interceptions', 'tackles'], tieKeys: ['passesDefended', 'forcedFumbles'], lineKeys: [['tackles', 'tkl'], ['sacks', 'sack'], ['interceptions', 'INT'], ['forcedFumbles', 'FF']] },
  { key: 'kicking', label: 'Kicking', includeKeys: ['fieldGoalsAttempted', 'extraPointsAttempted', 'points'], primaryKeys: ['points', 'fieldGoalsMade'], tieKeys: ['extraPointsMade'], lineKeys: [['points', 'pts'], ['fieldGoalsMade', 'FGM'], ['fieldGoalsAttempted', 'FGA'], ['extraPointsMade', 'XPM']] },
];

export function buildStatLeaderCards(playerTables = {}) {
  const players = [...(playerTables.away ?? []), ...(playerTables.home ?? [])];
  return LEADER_SPECS.map((spec) => {
    const candidates = players.filter((player) => spec.includeKeys.some((key) => (toNum(player?.stats?.[key]) ?? 0) > 0));
    const player = sortLeaderCandidates(candidates, spec.primaryKeys, spec.tieKeys)[0] ?? null;
    return {
      key: spec.key,
      label: spec.label,
      player,
      playerId: player?.playerId ?? null,
      teamSide: player?.teamSide ?? null,
      teamId: player?.teamId ?? null,
      statKey: player ? firstFiniteStat(player?.stats, spec.primaryKeys)?.key ?? null : null,
      line: formatLeaderLine(player, spec.lineKeys),
      available: Boolean(player),
    };
  });
}

function normalizeScoringSummary(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, idx) => ({
    id: row?.id ?? `score-${idx}`,
    quarter: row?.quarter ?? row?.period ?? null,
    time: row?.time ?? row?.clock ?? null,
    teamAbbr: row?.teamAbbr ?? row?.team ?? null,
    type: row?.type ?? row?.scoreType ?? null,
    description: row?.description ?? row?.text ?? null,
    scoreAfter: row?.scoreAfter ?? row?.runningScore ?? row?.score ?? null,
  }));
}

export function unwrapBoxScoreResponse(response) {
  if (response == null) return null;
  if (response?.payload && typeof response.payload === 'object' && Object.prototype.hasOwnProperty.call(response.payload, 'game')) {
    return response.payload.game;
  }
  if (typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'game')) {
    return response.game;
  }
  return response;
}

export function buildBoxScoreViewModel({ league, game, gameId, context = {}, scheduleGame = null } = {}) {
  const rawGame = unwrapBoxScoreResponse(game);
  const payload = mergeArchivedGameWithScheduleResult(rawGame, scheduleGame) ?? normalizeArchivedGamePayload(rawGame ?? null) ?? rawGame ?? null;
  if (!payload) {
    return { gameId: gameId ?? null, status: 'unavailable', archiveQuality: QUALITY.missing, hasDetailedStats: false, missingDetailReason: 'Game data missing' };
  }
  const homeId = payload?.homeId ?? payload?.home;
  const awayId = payload?.awayId ?? payload?.away;
  const homeScore = toNum(payload?.homeScore);
  const awayScore = toNum(payload?.awayScore);
  const quarterScores = payload?.quarterScores ?? null;
  const scoringSummary = normalizeScoringSummary(payload?.scoringSummary);
  const teamStats = payload?.teamStats ?? payload?.stats?.team ?? {};
  const playerStats = payload?.playerStats ?? payload?.stats?.players ?? payload?.stats ?? {};
  const homePlayers = normalizePlayers(playerStats?.home, 'home', homeId);
  const awayPlayers = normalizePlayers(playerStats?.away, 'away', awayId);

  const hasScore = homeScore != null && awayScore != null;
  const hasQuarter = Array.isArray(quarterScores?.home) || Array.isArray(quarterScores?.away);
  const hasTeamTotals = Boolean(teamStats?.home || teamStats?.away);
  const hasPlayerStats = homePlayers.length > 0 || awayPlayers.length > 0;
  const hasScoringSummary = scoringSummary.length > 0;

  let archiveQuality = QUALITY.missing;
  if (hasScore && hasQuarter && hasTeamTotals && hasPlayerStats) archiveQuality = QUALITY.full;
  else if (hasScore && (hasQuarter || hasTeamTotals || hasPlayerStats || hasScoringSummary)) archiveQuality = QUALITY.partial;
  else if (hasScore) archiveQuality = QUALITY.score;

  const awayTeam = teamInfo(league, awayId, 'away', payload);
  const homeTeam = teamInfo(league, homeId, 'home', payload);
  const finalScore = { home: homeScore, away: awayScore };
  const teamTotals = { home: teamStats?.home ?? {}, away: teamStats?.away ?? {} };
  const playerTables = { home: homePlayers, away: awayPlayers };
  const winnerSide = hasScore && awayScore !== homeScore ? (awayScore > homeScore ? 'away' : 'home') : null;

  return {
    gameId: payload?.gameId ?? payload?.id ?? gameId ?? null,
    season: payload?.seasonId ?? context?.season ?? league?.seasonId ?? null,
    week: payload?.week ?? context?.week ?? null,
    status: payload?.played === false ? 'Scheduled' : 'Final',
    archiveQuality,
    homeTeam,
    awayTeam,
    finalScore,
    finalScoreLine: formatScoreLine(awayTeam, homeTeam, finalScore),
    headlineSummary: buildHeadline({ awayTeam, homeTeam, finalScore, status: payload?.played === false ? 'Scheduled' : 'Final' }),
    winnerSide,
    margin: hasScore ? Math.abs(homeScore - awayScore) : null,
    quarterScores,
    teamTotals,
    teamComparisonRows: buildTeamComparisonRows(teamTotals),
    scoringSummary,
    playerTables,
    playerStatSections: buildPlayerStatSections(playerTables),
    statLeaderCards: buildStatLeaderCards(playerTables),
    availableData: {
      finalScore: hasScore,
      quarterScores: hasQuarter,
      teamStats: hasTeamTotals,
      playerStats: hasPlayerStats,
      scoringSummary: hasScoringSummary,
      playByPlay: Array.isArray(payload?.playLog) && payload.playLog.length > 0,
      drives: Array.isArray(payload?.driveSummary) && payload.driveSummary.length > 0,
    },
    prepImpact: Array.isArray(payload?.prepImpact) ? payload.prepImpact : (payload?.prepImpact ? [String(payload.prepImpact)] : []),
    detailWarning: archiveQuality === QUALITY.partial ? 'Partial archive: some Game Book sections were not recorded.' : archiveQuality === QUALITY.score ? 'Detailed box score data was not recorded for this game.' : archiveQuality === QUALITY.missing ? 'Game data missing.' : null,
    missingDetailReason: archiveQuality === QUALITY.partial ? 'Partial archive: some Game Book sections were not recorded.' : archiveQuality === QUALITY.score ? 'Detailed box score data was not recorded for this game.' : archiveQuality === QUALITY.missing ? 'Game data missing.' : null,
    hasDetailedStats: archiveQuality === QUALITY.full || archiveQuality === QUALITY.partial,
  };
}
