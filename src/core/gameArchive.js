import { buildCanonicalGameId, toTeamId } from './gameIdentity.js';

const QUALITY = {
  full: 'full',
  partial: 'partial',
  missing: 'missing',
};

const asNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const hasValues = (obj) => Boolean(obj && typeof obj === 'object' && Object.keys(obj).length > 0);

function normalizeQuarterScores(input) {
  if (!input || typeof input !== 'object') return null;
  const home = Array.isArray(input.home) ? input.home : Array.isArray(input.h) ? input.h : null;
  const away = Array.isArray(input.away) ? input.away : Array.isArray(input.a) ? input.a : null;
  if (!home && !away) return null;
  const maxLen = Math.max(home?.length ?? 0, away?.length ?? 0, 4);
  const normalizeSide = (rows) => Array.from({ length: maxLen }, (_, idx) => {
    if (!rows) return null;
    const val = asNumberOrNull(rows[idx]);
    return val == null ? null : val;
  });
  return { home: normalizeSide(home), away: normalizeSide(away) };
}

export function deriveTeamStatsFromPlayerRows(playerRows = {}) {
  const rows = Object.values(playerRows ?? {});
  if (!rows.length) return null;
  const sum = (key) => rows.reduce((acc, row) => acc + (Number(row?.stats?.[key]) || 0), 0);
  const hasAnyStat = rows.some((row) => hasValues(row?.stats));
  if (!hasAnyStat) return null;
  const passYards = sum('passYd');
  const rushYards = sum('rushYd');
  return {
    totalYards: passYards + rushYards,
    passYards,
    rushYards,
    turnovers: sum('interceptions') + sum('fumblesLost'),
    sacks: sum('sacks'),
    firstDowns: sum('firstDowns'),
    thirdDownMade: sum('thirdDownMade'),
    thirdDownAtt: sum('thirdDownAtt'),
    redZoneMade: sum('redZoneMade'),
    redZoneAtt: sum('redZoneAtt'),
    penalties: sum('penalties'),
  };
}

export function classifyArchiveQuality(rawGame) {
  if (!rawGame || typeof rawGame !== 'object') return QUALITY.missing;
  const hasFinal = Number.isFinite(Number(rawGame?.homeScore)) && Number.isFinite(Number(rawGame?.awayScore));
  const hasTeamStats = hasValues(rawGame?.teamStats?.home) && hasValues(rawGame?.teamStats?.away);
  const hasPlayerStats = hasValues(rawGame?.playerStats?.home) && hasValues(rawGame?.playerStats?.away);
  const hasSections = (rawGame?.scoringSummary?.length ?? 0) > 0
    || (rawGame?.driveSummary?.length ?? 0) > 0
    || (rawGame?.playLog?.length ?? 0) > 0
    || (rawGame?.eventLog?.length ?? 0) > 0;
  if (hasFinal && hasTeamStats && hasPlayerStats && hasSections) return QUALITY.full;
  if (hasFinal && (hasTeamStats || hasPlayerStats || hasSections || rawGame?.summary || rawGame?.recap || rawGame?.quarterScores)) return QUALITY.partial;
  return QUALITY.missing;
}

export function summarizeArchiveDefects(rawGame) {
  const g = normalizeArchivedGamePayload(rawGame);
  const defects = [];
  const declaredQuality = rawGame?.archiveQuality;
  if (!g?.id) defects.push('missing_id');
  if (!Number.isFinite(Number(g?.homeId))) defects.push('missing_home_id');
  if (!Number.isFinite(Number(g?.awayId))) defects.push('missing_away_id');
  if (!Number.isFinite(Number(g?.homeScore)) || !Number.isFinite(Number(g?.awayScore))) defects.push('missing_final_score');
  const classified = classifyArchiveQuality(g);
  if (declaredQuality === QUALITY.full) {
    if (!(hasValues(g?.teamStats?.home) && hasValues(g?.teamStats?.away))) defects.push('full_without_team_stats');
    if (!(hasValues(g?.playerStats?.home) && hasValues(g?.playerStats?.away))) defects.push('full_without_player_stats');
  }
  if (declaredQuality && declaredQuality !== classified) defects.push(`quality_mismatch:${declaredQuality}->${classified}`);
  return defects;
}

export function validateArchivedGame(rawGame) {
  const defects = summarizeArchiveDefects(rawGame);
  return { valid: defects.length === 0, defects };
}

export function normalizeArchivedGamePayload(rawGame) {
  if (!rawGame || typeof rawGame !== 'object') return null;
  const seasonId = rawGame?.seasonId ?? null;
  const week = asNumberOrNull(rawGame?.week);
  const homeId = toTeamId(rawGame?.homeId ?? rawGame?.home);
  const awayId = toTeamId(rawGame?.awayId ?? rawGame?.away);
  const id = rawGame?.id ?? rawGame?.gameId ?? buildCanonicalGameId({ seasonId, week, homeId, awayId });

  const legacyStats = rawGame?.stats ?? null;
  const playerStats = rawGame?.playerStats ?? (legacyStats ? {
    home: legacyStats.home ?? null,
    away: legacyStats.away ?? null,
  } : null);

  const playLog = Array.isArray(rawGame?.playLog)
    ? rawGame.playLog
    : Array.isArray(rawGame?.eventLog)
      ? rawGame.eventLog
      : Array.isArray(legacyStats?.playLogs)
        ? legacyStats.playLogs
        : [];

  const scoringSummary = Array.isArray(rawGame?.scoringSummary)
    ? rawGame.scoringSummary
    : [];

  const teamStats = rawGame?.teamStats ?? {
    home: deriveTeamStatsFromPlayerRows(playerStats?.home ?? {}),
    away: deriveTeamStatsFromPlayerRows(playerStats?.away ?? {}),
  };

  const normalized = {
    id,
    gameId: id,
    seasonId,
    week,
    phase: rawGame?.phase ?? null,
    homeId,
    awayId,
    homeScore: asNumberOrNull(rawGame?.homeScore),
    awayScore: asNumberOrNull(rawGame?.awayScore),
    quarterScores: normalizeQuarterScores(rawGame?.quarterScores ?? rawGame?.linescore),
    recap: rawGame?.recap ?? null,
    summary: rawGame?.summary ?? null,
    teamStats,
    playerStats,
    scoringSummary,
    driveSummary: Array.isArray(rawGame?.driveSummary)
      ? rawGame.driveSummary
      : (Array.isArray(rawGame?.drives)
        ? rawGame.drives
        : (Array.isArray(rawGame?.teamDriveStats?.drives) ? rawGame.teamDriveStats.drives : [])),
    turningPoints: Array.isArray(rawGame?.turningPoints) ? rawGame.turningPoints : [],
    playLog,
    eventLog: Array.isArray(rawGame?.eventLog) ? rawGame.eventLog : playLog,
    notablePerformances: Array.isArray(rawGame?.notablePerformances) ? rawGame.notablePerformances : [],
    injuries: Array.isArray(rawGame?.injuries) ? rawGame.injuries : [],
    archiveQuality: rawGame?.archiveQuality,
    // legacy compatibility fields
    stats: legacyStats ?? (playerStats ? { ...playerStats, playLogs: playLog } : null),
    drives: Array.isArray(rawGame?.drives) ? rawGame.drives : (Array.isArray(rawGame?.driveSummary) ? rawGame.driveSummary : []),
  };

  normalized.archiveQuality = classifyArchiveQuality(normalized);
  return normalized;
}

export function recoverArchivedGameFromSchedule(gameId, leagueState) {
  if (!gameId || !leagueState?.schedule?.weeks) return null;
  const parsed = String(gameId).match(/(.+)_w(\d+)_(\d+)_(\d+)$/);
  if (!parsed) return null;
  const [, seasonId, weekValue, homeValue, awayValue] = parsed;
  const weekNumber = Number(weekValue);
  for (const weekRow of leagueState.schedule.weeks) {
    if (Number(weekRow?.week) !== weekNumber) continue;
    for (const row of weekRow?.games ?? []) {
      const rowHome = toTeamId(row?.homeId ?? row?.home?.id ?? row?.home);
      const rowAway = toTeamId(row?.awayId ?? row?.away?.id ?? row?.away);
      if (rowHome !== Number(homeValue) || rowAway !== Number(awayValue)) continue;
      if (row?.homeScore == null && row?.awayScore == null) continue;
      return normalizeArchivedGamePayload({
        id: gameId,
        seasonId: row?.seasonId ?? seasonId,
        week: row?.week ?? weekNumber,
        homeId: rowHome,
        awayId: rowAway,
        homeScore: row?.homeScore,
        awayScore: row?.awayScore,
        quarterScores: row?.quarterScores ?? null,
        recap: row?.recap ?? 'Legacy result restored from schedule final score.',
        summary: row?.summary ?? null,
        archiveQuality: 'partial',
      });
    }
  }
  return null;
}
