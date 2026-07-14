import { mergeArchivedGameWithScheduleResult, normalizeArchivedGamePayload, readStrictFinalScore } from '../../core/gameArchive.js';
import { isScoringLikeLog, normalizePlayLogEntry } from '../../core/gameEvents.js';
import { buildGameFlowSummary } from '../../core/sim/gameFlowSummary.js';
import { buildLeaguePlayerMap, resolvePlayerName } from './playerNameResolver.js';
import { buildSpecialTeamsSummary } from './specialTeamsSummary.js';

const QUALITY = { full: 'Full detail', partial: 'Partial detail', score: 'Score only', missing: 'Missing detail' };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const mdash = '—';

function normalizeAdvancedAttribution(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).map(([playerId, row]) => [String(playerId), {
    targets: Number(row?.targets ?? 0),
    receptionsAllowed: Number(row?.receptionsAllowed ?? 0),
    coverageTargets: Number(row?.coverageTargets ?? 0),
    coverageCompletionsAllowed: Number(row?.coverageCompletionsAllowed ?? 0),
    drops: Number(row?.drops ?? 0),
    battedPasses: Number(row?.battedPasses ?? 0),
    sacksAllowed: Number(row?.sacksAllowed ?? 0),
    sacksMade: Number(row?.sacksMade ?? 0),
  }]));
}

function hasValues(obj) {
  return Boolean(obj && typeof obj === 'object' && Object.keys(obj).length > 0);
}

function pickFirst(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

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

function normalizePlayers(raw = {}, side, teamId, playerMap = null) {
  return Object.entries(raw || {}).map(([id, row]) => {
    const playerId = normalizePlayerId(id);
    const name = resolvePlayerName(playerId, { row, playerMap });
    return { playerId, teamId, teamSide: side, ...row, name, stats: row?.stats ?? row ?? {} };
  });
}

function formatScoreLine(awayTeam, homeTeam, finalScore) {
  return `${awayTeam?.abbr ?? 'AWY'} ${finalScore?.away ?? mdash} - ${finalScore?.home ?? mdash} ${homeTeam?.abbr ?? 'HME'}`;
}

function buildHeadline({ awayTeam, homeTeam, finalScore, status }) {
  const away = finalScore?.away;
  const home = finalScore?.home;
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
  // TODO(rushLong/recLong): rich engine does not track per-play max yards; columns always blank.
  //   Requires play-level stat modeling (out of scope). Deferred — see post-engine-flip-verification.md.
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
  return player?.name ?? player?.playerName ?? (player?.playerId != null ? `Player #${player.playerId}` : 'Player');
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

function teamAbbrForId(teamId, teams = {}) {
  const id = Number(teamId);
  if (Number.isFinite(id)) {
    if (id === Number(teams.home?.id)) return teams.home?.abbr ?? null;
    if (id === Number(teams.away?.id)) return teams.away?.abbr ?? null;
  }
  return null;
}

function teamAbbrForSide(value, teams = {}) {
  const side = String(value ?? '').toLowerCase();
  if (side === 'home') return teams.home?.abbr ?? null;
  if (side === 'away') return teams.away?.abbr ?? null;
  return null;
}

function formatClockValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  const seconds = toNum(value);
  if (seconds == null) return value;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function normalizeScoreAfter(row = {}) {
  const scoreAfter = row?.scoreAfter ?? row?.runningScore ?? row?.score ?? null;
  if (typeof scoreAfter === 'string') return scoreAfter;
  if (scoreAfter && typeof scoreAfter === 'object') return scoreAfter;
  const home = toNum(row?.scoreHomeAfter ?? row?.homeScore ?? row?.scoreHome);
  const away = toNum(row?.scoreAwayAfter ?? row?.awayScore ?? row?.scoreAway);
  return home != null && away != null ? { home, away } : null;
}

function normalizeDriveSummaryRows(payload = {}, teams = {}) {
  const rows = Array.isArray(payload?.driveSummary)
    ? payload.driveSummary
    : Array.isArray(payload?.drives)
      ? payload.drives
      : Array.isArray(payload?.teamDriveStats?.drives)
        ? payload.teamDriveStats.drives
        : [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => {
      const teamId = pickFirst(row, ['teamId', 'offenseTeamId', 'possessionTeamId']);
      return {
        id: row?.id ?? row?.driveId ?? `drive-${idx}`,
        quarter: pickFirst(row, ['quarter', 'qtr', 'period']),
        teamId: teamId ?? null,
        teamAbbr: row?.teamAbbr ?? row?.abbr ?? teamAbbrForSide(row?.team ?? row?.possession, teams) ?? row?.team ?? teamAbbrForId(teamId, teams),
        startClock: formatClockValue(pickFirst(row, ['startClock', 'startTime', 'start', 'startClockSec'])),
        endClock: formatClockValue(pickFirst(row, ['endClock', 'endTime', 'end', 'endClockSec'])),
        result: pickFirst(row, ['result', 'endState', 'outcome']) ?? 'Drive',
        yards: pickFirst(row, ['yards', 'driveYards', 'netYards']),
        plays: pickFirst(row, ['plays', 'playCount', 'numPlays']),
        points: pickFirst(row, ['points', 'pointsScored']),
        summary: pickFirst(row, ['summary', 'description', 'text']),
        keyPlay: pickFirst(row, ['keyPlay', 'lastPlay']),
      };
    });
}

function classifyPlayRow(normalized = {}) {
  const text = String(normalized?.text ?? normalized?.result ?? '').toLowerCase();
  const tags = [];
  const scoring = isScoringLikeLog(normalized);
  const turnover = Boolean(normalized?.turnover) || /interception|fumble|turnover/.test(text);
  const sack = normalized?.playType === 'sack' || text.includes('sack');
  const explosive = Math.abs(Number(normalized?.yards ?? 0)) >= 20;
  const fourthDown = Boolean(normalized?.fourthDown) || /4th|fourth|turnover on downs/.test(text);
  const redZone = Boolean(normalized?.redZone) || (Number(normalized?.fieldPosition ?? normalized?.yardLine) >= 80);
  if (scoring) tags.push('scoring');
  if (turnover) tags.push('turnover');
  if (sack) tags.push('sack');
  if (explosive) tags.push('explosive');
  if (fourthDown) tags.push('fourth-down');
  if (redZone) tags.push('red-zone');
  return { tags, isKey: tags.length > 0 };
}

function normalizePlayByPlayRows(payload = {}, teams = {}) {
  const source = Array.isArray(payload?.playLog) && payload.playLog.length
    ? payload.playLog
    : Array.isArray(payload?.eventLog) && payload.eventLog.length
      ? payload.eventLog
      : Array.isArray(payload?.eventDigest)
        ? payload.eventDigest
        : [];
  return source
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => {
      const normalized = normalizePlayLogEntry(row, idx, { homeId: teams.home?.id, awayId: teams.away?.id });
      const text = normalized.text && normalized.text !== 'Play'
        ? normalized.text
        : (row?.playText ?? row?.description ?? row?.summary ?? row?.result ?? 'Play');
      const tagData = classifyPlayRow({ ...normalized, text });
      const teamId = normalized.teamId ?? normalized.offenseTeamId ?? row?.teamId ?? row?.scoringTeamId ?? null;
      const rawClock = normalized.clock || row?.clockSec || row?.timeSec || row?.timeLeftSec || row?.time || row?.timeLeft;
      const clock = formatClockValue(rawClock);
      return {
        id: normalized.id ?? row?.id ?? `play-${idx}`,
        sortIndex: idx,
        quarter: normalized.quarter ?? row?.qtr ?? row?.period ?? null,
        clock,
        teamId,
        teamAbbr: row?.teamAbbr ?? row?.abbr ?? teamAbbrForSide(row?.team ?? row?.possession, teams) ?? row?.team ?? teamAbbrForId(teamId, teams),
        playType: normalized.playType ?? row?.type ?? 'play',
        text,
        yards: normalized.yards ?? toNum(row?.yards),
        scoreAfter: normalizeScoreAfter(row),
        tags: tagData.tags,
        isKey: tagData.isKey,
      };
    });
}

function applyCloseGameLastPlays(playRows = [], finalScore = {}) {
  const home = finalScore.home;
  const away = finalScore.away;
  if (home == null || away == null || Math.abs(home - away) > 8 || playRows.length <= 5) return playRows;
  const lastFiveIds = new Set(playRows.slice(-5).map((row) => row.id));
  return playRows.map((row) => lastFiveIds.has(row.id)
    ? { ...row, isKey: true, tags: Array.from(new Set([...(row.tags ?? []), 'late-close'])) }
    : row);
}

function normalizeTurningPointRows({ payload = {}, scoringSummary = [], playByPlayRows = [], teams = {}, finalScore = {} } = {}) {
  const explicit = Array.isArray(payload?.turningPoints) ? payload.turningPoints : [];
  if (explicit.length) {
    return explicit
      .filter((row) => row && typeof row === 'object')
      .map((row, idx) => {
        const teamId = pickFirst(row, ['teamId', 'scoringTeamId', 'offenseTeamId']);
        return {
          id: row?.id ?? `turning-${idx}`,
          quarter: pickFirst(row, ['quarter', 'qtr', 'period']),
          clock: pickFirst(row, ['clock', 'time', 'timeLeft']),
          teamId,
          teamAbbr: row?.teamAbbr ?? row?.abbr ?? row?.team ?? teamAbbrForId(teamId, teams),
          text: pickFirst(row, ['text', 'description', 'summary']) ?? 'Turning point',
          source: 'recorded',
          inferred: false,
        };
      }).slice(0, 6);
  }

  const inferred = [];
  const seen = new Set();
  const add = (row) => {
    const key = `${row.quarter}-${row.clock}-${row.teamAbbr}-${row.text}`;
    if (seen.has(key) || inferred.length >= 6) return;
    seen.add(key);
    inferred.push({ ...row, source: 'inferred', inferred: true });
  };

  scoringSummary.forEach((row, idx) => {
    const score = normalizeScoreAfter(row);
    if (!score || typeof score === 'string') return;
    const home = toNum(score.home);
    const away = toNum(score.away);
    if (home == null || away == null || home === away) return;
    const q = Number(row?.quarter ?? 0);
    const margin = Math.abs(home - away);
    const teamAbbr = row?.teamAbbr ?? row?.team ?? null;
    if (q >= 4 && margin <= 8) {
      add({ id: `turning-score-${idx}`, quarter: row?.quarter, clock: row?.time ?? row?.clock, teamAbbr, text: `Late ${row?.type ?? 'score'} kept this a one-score game.` });
    } else if (margin <= 7) {
      add({ id: `turning-go-ahead-${idx}`, quarter: row?.quarter, clock: row?.time ?? row?.clock, teamAbbr, text: `${row?.type ?? 'Score'} created a one-score swing.` });
    }
  });

  playByPlayRows.forEach((row) => {
    if (row.tags?.includes('turnover')) add({ id: `turning-${row.id}`, quarter: row.quarter, clock: row.clock, teamAbbr: row.teamAbbr, text: row.text });
    if (Number(row.quarter) >= 4 && row.tags?.includes('explosive')) add({ id: `turning-${row.id}`, quarter: row.quarter, clock: row.clock, teamAbbr: row.teamAbbr, text: row.text });
  });

  const home = finalScore.home;
  const away = finalScore.away;
  if (inferred.length === 0 && home != null && away != null && Math.abs(home - away) <= 8) {
    playByPlayRows.filter((row) => row.isKey).slice(-2).forEach((row) => add({ id: `turning-close-${row.id}`, quarter: row.quarter, clock: row.clock, teamAbbr: row.teamAbbr, text: row.text }));
  }

  return inferred.slice(0, 6);
}

function normalizeNotablePerformanceRows(payload = {}, teams = {}) {
  const rows = Array.isArray(payload?.notablePerformances) ? payload.notablePerformances : [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => {
      const teamId = pickFirst(row, ['teamId', 'team']);
      return {
        id: row?.id ?? row?.playerId ?? `notable-${idx}`,
        playerId: row?.playerId ?? row?.id ?? null,
        teamId,
        teamAbbr: row?.teamAbbr ?? row?.abbr ?? teamAbbrForId(teamId, teams),
        name: row?.name ?? row?.playerName ?? 'Impact player',
        label: row?.label ?? row?.pos ?? row?.role ?? 'Notable',
        text: row?.text ?? row?.summary ?? row?.description ?? null,
        stats: row?.stats ?? {},
      };
    });
}

function normalizeInjuryRows(payload = {}, teams = {}) {
  const rows = Array.isArray(payload?.injuries) ? payload.injuries : [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => {
      const teamId = pickFirst(row, ['teamId', 'team']);
      return {
        id: row?.id ?? row?.playerId ?? `injury-${idx}`,
        playerId: row?.playerId ?? row?.id ?? null,
        teamId,
        teamAbbr: row?.teamAbbr ?? row?.abbr ?? teamAbbrForId(teamId, teams),
        name: row?.name ?? row?.playerName ?? 'Player',
        detail: row?.detail ?? row?.injury ?? row?.type ?? row?.description ?? 'Injury recorded',
        duration: row?.duration ?? row?.weeks ?? row?.gamesRemaining ?? row?.weeksRemaining ?? null,
      };
    });
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
    return {
      gameId: gameId ?? null,
      status: 'unavailable',
      archiveQuality: QUALITY.missing,
      hasDetailedStats: false,
      missingDetailReason: 'Game data missing',
      statLeaderCards: [],
      turningPointRows: [],
    };
  }
  const homeId = payload?.homeId ?? payload?.home;
  const awayId = payload?.awayId ?? payload?.away;
  const strictFinalScore = readStrictFinalScore(payload);
  const homeScore = strictFinalScore?.home ?? null;
  const awayScore = strictFinalScore?.away ?? null;
  const quarterScores = payload?.quarterScores ?? null;
  const scoringSummary = normalizeScoringSummary(payload?.scoringSummary);
  const teamStats = payload?.teamStats ?? payload?.stats?.team ?? {};
  const playerStats = payload?.playerStats ?? payload?.stats?.players ?? payload?.stats ?? {};
  const playerMap = buildLeaguePlayerMap(league, payload);
  const homePlayers = normalizePlayers(playerStats?.home, 'home', homeId, playerMap);
  const awayPlayers = normalizePlayers(playerStats?.away, 'away', awayId, playerMap);

  const hasScore = homeScore != null && awayScore != null;
  const hasQuarter = Array.isArray(quarterScores?.home) || Array.isArray(quarterScores?.away);
  const hasTeamTotals = hasValues(teamStats?.home) || hasValues(teamStats?.away);
  const hasPlayerStats = homePlayers.length > 0 || awayPlayers.length > 0;
  const hasScoringSummary = scoringSummary.length > 0;

  const awayTeam = teamInfo(league, awayId, 'away', payload);
  const homeTeam = teamInfo(league, homeId, 'home', payload);
  const finalScore = { home: homeScore, away: awayScore };
  const teamTotals = { home: teamStats?.home ?? {}, away: teamStats?.away ?? {} };
  // Special-teams rollup — legacy scalar counters (homeFGs/homeXPs) and raw
  // drive-summary stats only exist on the unnormalized record, so feed both.
  const specialTeams = buildSpecialTeamsSummary({
    teamDriveStats: payload?.teamDriveStats ?? rawGame?.teamDriveStats,
    teamStats: teamTotals,
    homeStats: rawGame?.homeStats,
    awayStats: rawGame?.awayStats,
    homeFGs: rawGame?.homeFGs,
    awayFGs: rawGame?.awayFGs,
    homeXPs: rawGame?.homeXPs,
    awayXPs: rawGame?.awayXPs,
  });
  const playerTables = { home: homePlayers, away: awayPlayers };
  const winnerSide = hasScore && awayScore !== homeScore ? (awayScore > homeScore ? 'away' : 'home') : null;
  const teamContext = { home: homeTeam, away: awayTeam };
  const driveSummaryRows = normalizeDriveSummaryRows(payload, teamContext);
  const playByPlayRows = applyCloseGameLastPlays(normalizePlayByPlayRows(payload, teamContext), finalScore);
  const turningPointRows = normalizeTurningPointRows({ payload, scoringSummary, playByPlayRows, teams: teamContext, finalScore });
  const notablePerformanceRows = normalizeNotablePerformanceRows(payload, teamContext);
  const injuryRows = normalizeInjuryRows(payload, teamContext);
  const hasDriveRows = driveSummaryRows.length > 0;
  const hasPlayRows = playByPlayRows.length > 0;
  const hasTurningPoints = turningPointRows.length > 0;
  const hasNotablePerformances = notablePerformanceRows.length > 0;
  const hasInjuries = injuryRows.length > 0;
  const hasStoryLayerDetail = hasScoringSummary || hasDriveRows || hasPlayRows || hasTurningPoints || hasNotablePerformances || hasInjuries;
  const hasAnyMeaningfulDetail = hasQuarter || hasTeamTotals || hasPlayerStats || hasStoryLayerDetail;

  let archiveQuality = QUALITY.missing;
  if (hasScore && hasQuarter && hasTeamTotals && hasPlayerStats && hasStoryLayerDetail) archiveQuality = QUALITY.full;
  else if (hasScore && hasAnyMeaningfulDetail) archiveQuality = QUALITY.partial;
  else if (hasScore) archiveQuality = QUALITY.score;

  const detailWarning = (() => {
    if (archiveQuality === QUALITY.full) return null;
    if (archiveQuality === QUALITY.partial) {
      if (!hasTeamTotals || !hasPlayerStats) return 'Partial archive: some Game Book sections were recorded, but team/player stat detail is incomplete.';
      return 'Partial archive: some Game Book sections were recorded, but full detail is incomplete.';
    }
    if (archiveQuality === QUALITY.score) return 'Score-only archive: no detailed Game Book sections were recorded.';
    return 'Game data missing.';
  })();

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
    specialTeams,
    scoringSummary,
    driveSummaryRows,
    playByPlayRows,
    turningPointRows,
    notablePerformanceRows,
    injuryRows,
    playerTables,
    playerStatSections: buildPlayerStatSections(playerTables),
    statLeaderCards: buildStatLeaderCards(playerTables),
    availableData: {
      finalScore: hasScore,
      quarterScores: hasQuarter,
      teamStats: hasTeamTotals,
      playerStats: hasPlayerStats,
      scoringSummary: hasScoringSummary,
      playByPlay: hasPlayRows,
      drives: hasDriveRows,
      turningPoints: hasTurningPoints,
      notablePerformances: hasNotablePerformances,
      injuries: hasInjuries,
    },
    gameFlowSummary: buildGameFlowSummary(payload),
    gameReasoningFlags: Array.isArray(payload?.gameReasoningFlags) ? payload.gameReasoningFlags : [],
    prepImpact: Array.isArray(payload?.prepImpact) ? payload.prepImpact : (payload?.prepImpact ? [String(payload.prepImpact)] : []),
    advancedAttribution: normalizeAdvancedAttribution(payload?.advancedAttribution ?? game?.advancedAttribution),
    detailWarning,
    missingDetailReason: detailWarning,
    hasDetailedStats: archiveQuality === QUALITY.full || archiveQuality === QUALITY.partial,
  };
}
