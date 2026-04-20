import {
  classifyScoringEvent,
  describeDriveResult,
  isScoringLikeLog,
  normalizePlayLogEntry,
  parseClock,
  resolveLogTeamId,
} from './gameEvents.js';

const sideKeys = ['home', 'away'];

const asNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function toRows(boxScore = {}, context = {}) {
  const rows = [];
  for (const side of sideKeys) {
    const teamId = Number(context?.[`${side}Id`]);
    for (const [playerId, row] of Object.entries(boxScore?.[side] ?? {})) {
      rows.push({
        playerId,
        teamId,
        name: row?.name ?? 'Unknown',
        pos: row?.pos ?? '—',
        stats: row?.stats ?? row ?? {},
      });
    }
  }
  return rows;
}

export function buildScoringSummaryFromSimulation(playLogs = [], context = {}) {
  const logs = Array.isArray(playLogs) ? playLogs : [];
  const scoring = [];
  let prevHome = 0;
  let prevAway = 0;
  for (let i = 0; i < logs.length; i++) {
    const log = normalizePlayLogEntry(logs[i], i, context);
    if (!isScoringLikeLog(log)) continue;
    const teamId = resolveLogTeamId(log, context);
    const event = classifyScoringEvent(log);
    const homeAfter = Number(log?.scoreHomeAfter ?? log?.homeScore);
    const awayAfter = Number(log?.scoreAwayAfter ?? log?.awayScore);
    const pointsFromDelta = Number.isFinite(homeAfter) && Number.isFinite(awayAfter)
      ? Math.max(0, (homeAfter - prevHome) + (awayAfter - prevAway))
      : null;
    prevHome = Number.isFinite(homeAfter) ? homeAfter : prevHome;
    prevAway = Number.isFinite(awayAfter) ? awayAfter : prevAway;
    scoring.push({
      id: `score_${i}`,
      quarter: Number(log?.quarter ?? 1),
      clock: log?.clock ?? log?.timeLeft ?? log?.time ?? '',
      teamId,
      scoreType: event.type,
      type: event.label,
      points: pointsFromDelta ?? event.points,
      text: log?.text ?? 'Scoring play',
      scoreAfter: Number.isFinite(homeAfter) && Number.isFinite(awayAfter)
        ? { home: homeAfter, away: awayAfter }
        : null,
      teamAbbr: teamId === Number(context?.homeId) ? context?.homeAbbr : (teamId === Number(context?.awayId) ? context?.awayAbbr : null),
      passerId: log?.passer?.id ?? null,
      rusherId: log?.rusher?.id ?? null,
      receiverId: log?.receiver?.id ?? null,
      defenderId: log?.defender?.id ?? null,
      kickerId: log?.kicker?.id ?? null,
    });
  }
  return scoring;
}

export function buildDriveSummaryFromSimulation(playLogs = [], context = {}) {
  const logs = Array.isArray(playLogs) ? playLogs : [];
  if (!logs.length) return [];

  const drives = [];
  let current = null;

  const closeDrive = () => {
    if (!current) return;
    const firstClock = parseClock(current.startClock);
    const lastClock = parseClock(current.endClock);
    const consumedSeconds = firstClock != null && lastClock != null ? Math.max(0, firstClock - lastClock) : null;
    drives.push({
      id: `drv_${drives.length}`,
      teamId: current.teamId,
      teamAbbr: current.teamId === Number(context?.homeId) ? context?.homeAbbr : context?.awayAbbr,
      quarter: current.quarter,
      startClock: current.startClock,
      endClock: current.endClock,
      startFieldPos: current.startFieldPos,
      plays: current.plays,
      yards: current.yards,
      points: current.points,
      timeConsumed: consumedSeconds,
      result: describeDriveResult(current.lastLog),
      endState: describeDriveResult(current.lastLog),
      keyPlay: current.lastLog?.text ?? null,
      summary: current.lastLog?.text ?? `${current.plays} plays`,
    });
    current = null;
  };

  for (const log of logs) {
    const normalized = normalizePlayLogEntry(log, 0, context);
    const teamId = resolveLogTeamId(normalized, context);
    const quarter = Number(normalized?.quarter ?? 1);
    const clock = normalized?.clock ?? '';
    const changed = !current || current.teamId !== teamId || quarter !== current.quarter || /punt|touchdown|field goal|interception|fumble|safety/i.test(String(current.lastLog?.text ?? ''));
    if (changed) {
      closeDrive();
      current = {
        teamId,
        quarter,
        startClock: clock,
        endClock: clock,
        startFieldPos: Number(normalized?.fieldPosition ?? null),
        plays: 0,
        yards: 0,
        points: 0,
        lastLog: normalized,
      };
    }
    current.plays += 1;
    current.yards += asNum(normalized?.yards);
    current.endClock = clock || current.endClock;
    if (isScoringLikeLog(normalized)) current.points += asNum(classifyScoringEvent(normalized)?.points);
    current.lastLog = normalized;
  }
  closeDrive();
  return drives;
}

export function buildQuarterScoresFromScoring(scoringSummary = [], context = {}) {
  const scoring = Array.isArray(scoringSummary) ? scoringSummary : [];
  const homeId = Number(context?.homeId);
  const awayId = Number(context?.awayId);
  let maxQuarter = 4;
  scoring.forEach((event) => {
    maxQuarter = Math.max(maxQuarter, Number(event?.quarter ?? 1));
  });
  const home = Array.from({ length: maxQuarter }, () => 0);
  const away = Array.from({ length: maxQuarter }, () => 0);
  scoring.forEach((event) => {
    const idx = Math.max(0, Number(event?.quarter ?? 1) - 1);
    const points = asNum(event?.points);
    if (Number(event?.teamId) === homeId) home[idx] += points;
    if (Number(event?.teamId) === awayId) away[idx] += points;
  });
  return { home, away };
}

export function buildTurningPointsFromGameEvents(playLogs = [], context = {}) {
  const logs = Array.isArray(playLogs) ? playLogs : [];
  const points = [];
  const scoring = buildScoringSummaryFromSimulation(logs, context);

  scoring.forEach((event) => {
    const after = event.scoreAfter;
    if (!after) return;
    const margin = Math.abs(after.home - after.away);
    const winningTeam = after.home > after.away ? Number(context?.homeId) : (after.away > after.home ? Number(context?.awayId) : null);
    if (event.quarter >= 4 && winningTeam != null && event.teamId === winningTeam && margin <= 8) {
      points.push({ id: `tp_go_ahead_${event.id}`, quarter: event.quarter, clock: event.clock, text: `Go-ahead ${event.type.toLowerCase()} in the ${event.quarter}th quarter.` });
    }
  });

  logs.forEach((log, idx) => {
    const text = String(log?.text ?? '').toLowerCase();
    const q = Number(log?.quarter ?? 1);
    const late = q >= 4;
    if ((text.includes('interception') || text.includes('fumble')) && Number(log?.yardLine ?? 0) >= 75) {
      points.push({ id: `tp_redzone_to_${idx}`, quarter: q, text: 'Red-zone turnover erased a scoring chance.' });
    }
    if (late && text.includes('sack') && text.includes('fumble')) {
      points.push({ id: `tp_strip_sack_${idx}`, quarter: q, text: 'Late strip sack swung momentum.' });
    }
    if (late && (text.includes('interception') || text.includes('fumble'))) {
      points.push({ id: `tp_late_to_${idx}`, quarter: q, text: 'Late turnover changed the finish.' });
    }
    if (Number(log?.yards ?? 0) >= 25 && late) {
      points.push({ id: `tp_explosive_${idx}`, quarter: q, text: `Explosive ${log.yards}-yard play flipped field position.` });
    }
  });

  return points.slice(0, 6);
}

export function buildPlayerLeadersFromArchive(boxScore = {}, context = {}) {
  const rows = toRows(boxScore, context);
  const pick = (key, min = 1) => rows.filter((r) => asNum(r.stats?.[key]) >= min).sort((a, b) => asNum(b.stats?.[key]) - asNum(a.stats?.[key]))[0] ?? null;
  const defense = rows
    .filter((r) => asNum(r.stats?.sacks) + asNum(r.stats?.interceptions) + asNum(r.stats?.tacklesForLoss) + asNum(r.stats?.tackles) > 0)
    .sort((a, b) => (asNum(b.stats?.sacks) * 2 + asNum(b.stats?.interceptions) * 2 + asNum(b.stats?.tacklesForLoss) + asNum(b.stats?.tackles)) - (asNum(a.stats?.sacks) * 2 + asNum(a.stats?.interceptions) * 2 + asNum(a.stats?.tacklesForLoss) + asNum(a.stats?.tackles)))[0] ?? null;

  const categories = {
    passing: pick('passYd', 20),
    rushing: pick('rushYd', 10),
    receiving: pick('recYd', 10),
    defense,
    kicking: pick('fieldGoalsMade', 1),
  };

  const scored = rows
    .map((row) => ({ row, impact: asNum(row.stats?.passYd) / 12 + asNum(row.stats?.passTD) * 5 + asNum(row.stats?.rushYd) / 10 + asNum(row.stats?.rushTD) * 6 + asNum(row.stats?.recYd) / 10 + asNum(row.stats?.recTD) * 6 + asNum(row.stats?.sacks) * 4 + asNum(row.stats?.interceptions) * 5 + asNum(row.stats?.fieldGoalsMade) * 3 }))
    .sort((a, b) => b.impact - a.impact);

  const playerOfGame = scored[0]?.row ?? null;
  const standouts = scored.slice(0, 4).map((item, idx) => ({ ...item.row, standout: idx > 0 }));

  return { categories, playerOfGame, standouts };
}

export function buildTeamStatComparisonFromArchive(boxScore = {}, context = {}) {
  const rows = toRows(boxScore, context);
  const byTeam = { [context.homeId]: [], [context.awayId]: [] };
  rows.forEach((row) => {
    if (!byTeam[row.teamId]) byTeam[row.teamId] = [];
    byTeam[row.teamId].push(row);
  });
  const sum = (teamRows, key) => teamRows.reduce((acc, row) => acc + asNum(row.stats?.[key]), 0);
  const buildSide = (teamId) => {
    const teamRows = byTeam[teamId] ?? [];
    const passYards = sum(teamRows, 'passYd');
    const rushYards = sum(teamRows, 'rushYd');
    return {
      totalYards: passYards + rushYards,
      passYards,
      rushYards,
      firstDowns: sum(teamRows, 'firstDowns'),
      turnovers: sum(teamRows, 'interceptions') + sum(teamRows, 'fumblesLost'),
      sacks: sum(teamRows, 'sacks'),
      thirdDownMade: sum(teamRows, 'thirdDownMade'),
      thirdDownAtt: sum(teamRows, 'thirdDownAtt'),
      redZoneMade: sum(teamRows, 'redZoneMade'),
      redZoneAtt: sum(teamRows, 'redZoneAtt'),
      penalties: sum(teamRows, 'penalties'),
      timePossession: sum(teamRows, 'timePossession'),
    };
  };
  return { home: buildSide(Number(context.homeId)), away: buildSide(Number(context.awayId)) };
}

export function classifyGameScript({ homeScore = 0, awayScore = 0, isPlayoff = false, wentOvertime = false, wasUpset = false }) {
  const total = homeScore + awayScore;
  const margin = Math.abs(homeScore - awayScore);
  if (wentOvertime && isPlayoff) return 'playoff_thriller';
  if (wentOvertime) return 'overtime_thriller';
  if (margin >= 21) return 'blowout';
  if (total >= 65) return 'shootout';
  if (total <= 27) return 'defensive_struggle';
  if (wasUpset) return 'upset';
  return margin <= 8 ? 'one_score_game' : 'balanced';
}

export function summarizeWhyTeamWon({ winnerAbbr, loserAbbr, teamStats, homeId, awayId, winnerId }) {
  if (!teamStats) return `${winnerAbbr} closed stronger than ${loserAbbr} in key moments.`;
  const winnerSide = winnerId === homeId ? teamStats.home : teamStats.away;
  const loserSide = winnerId === homeId ? teamStats.away : teamStats.home;
  const yardEdge = asNum(winnerSide?.totalYards) - asNum(loserSide?.totalYards);
  const turnoverEdge = asNum(loserSide?.turnovers) - asNum(winnerSide?.turnovers);
  if (turnoverEdge >= 2) return `${winnerAbbr} won the turnover battle (+${turnoverEdge}) and protected the lead.`;
  if (yardEdge >= 80) return `${winnerAbbr} controlled the game with a ${yardEdge}-yard offensive edge.`;
  return `${winnerAbbr} made enough situational plays to outlast ${loserAbbr}.`;
}

export function buildGameNarrativeSummary({ homeTeam, awayTeam, homeScore, awayScore, gameScript, leaders, whyWon, isPlayoff = false, rivalry = false }) {
  const homeWon = homeScore > awayScore;
  const winner = homeWon ? homeTeam : awayTeam;
  const loser = homeWon ? awayTeam : homeTeam;
  const passLeader = leaders?.categories?.passing;
  const defenseLeader = leaders?.categories?.defense;
  const stage = isPlayoff ? 'in the postseason' : 'in regular-season action';

  const tone = {
    blowout: `${winner?.abbr} dominated from the opening quarter and never looked back ${stage}.`,
    shootout: `${winner?.abbr} survived a high-octane shootout ${stage}.`,
    defensive_struggle: `${winner?.abbr} ground out a defensive battle ${stage}.`,
    playoff_thriller: `${winner?.abbr} survived a playoff thriller with elimination pressure on every snap.`,
    overtime_thriller: `${winner?.abbr} finished an overtime thriller after trading late punches.`,
    upset: `${winner?.abbr} pulled off the upset against ${loser?.abbr}.`,
    one_score_game: `${winner?.abbr} escaped a one-score contest against ${loser?.abbr}.`,
    balanced: `${winner?.abbr} finished stronger in a balanced matchup against ${loser?.abbr}.`,
  };

  const rivalryTag = rivalry ? ' The rivalry angle made every late possession heavier.' : '';
  const passerTag = passLeader ? ` ${passLeader.name} led the air attack with ${asNum(passLeader.stats?.passYd)} yards.` : '';
  const defenseTag = defenseLeader ? ` ${defenseLeader.name} anchored the defensive swings.` : '';
  return `${tone[gameScript] ?? tone.balanced} ${whyWon}${passerTag}${defenseTag}${rivalryTag}`.trim();
}
