import { normalizeArchivedGamePayload } from '../../core/gameArchive.js';

const QUALITY = { full: 'Full detail', partial: 'Partial detail', score: 'Score only', missing: 'Missing detail' };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function teamInfo(league, id, side, game) {
  const team = (league?.teams ?? []).find((t) => Number(t?.id) === Number(id)) ?? league?.teamById?.[id] ?? null;
  return {
    id: id ?? null,
    abbr: team?.abbr ?? game?.[`${side}Abbr`] ?? (side === 'home' ? 'HOME' : 'AWAY'),
    name: team?.name ?? game?.[`${side}Name`] ?? team?.abbr ?? 'Unknown',
    logo: team?.logo ?? team?.logoUrl ?? null,
  };
}

function normalizePlayers(raw = {}, side, teamId) {
  return Object.entries(raw || {}).map(([id, row]) => ({ playerId: Number(id), teamId, teamSide: side, ...row, stats: row?.stats ?? row ?? {} }));
}

export function buildBoxScoreViewModel({ league, game, gameId, context = {} } = {}) {
  const payload = normalizeArchivedGamePayload(game ?? null) ?? game ?? null;
  if (!payload) {
    return { gameId: gameId ?? null, status: 'unavailable', archiveQuality: QUALITY.missing, hasDetailedStats: false, missingDetailReason: 'Game data missing' };
  }
  const homeId = payload?.homeId ?? payload?.home;
  const awayId = payload?.awayId ?? payload?.away;
  const homeScore = toNum(payload?.homeScore);
  const awayScore = toNum(payload?.awayScore);
  const quarterScores = payload?.quarterScores ?? null;
  const scoringSummary = Array.isArray(payload?.scoringSummary) ? payload.scoringSummary : [];
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

  return {
    gameId: payload?.gameId ?? payload?.id ?? gameId ?? null,
    season: payload?.seasonId ?? context?.season ?? league?.seasonId ?? null,
    week: payload?.week ?? context?.week ?? null,
    status: payload?.played ? 'Final' : 'Scheduled',
    archiveQuality,
    homeTeam: teamInfo(league, homeId, 'home', payload),
    awayTeam: teamInfo(league, awayId, 'away', payload),
    finalScore: { home: homeScore, away: awayScore },
    quarterScores,
    teamTotals: { home: teamStats?.home ?? {}, away: teamStats?.away ?? {} },
    scoringSummary,
    playerTables: { home: homePlayers, away: awayPlayers },
    prepImpact: Array.isArray(payload?.prepImpact) ? payload.prepImpact : (payload?.prepImpact ? [String(payload.prepImpact)] : []),
    detailWarning: archiveQuality === QUALITY.partial ? 'Partial archive: some Game Book sections were not recorded.' : archiveQuality === QUALITY.score ? 'Detailed box score data was not recorded for this game.' : archiveQuality === QUALITY.missing ? 'Game data missing.' : null,
    missingDetailReason: archiveQuality === QUALITY.partial ? 'Partial archive: some Game Book sections were not recorded.' : archiveQuality === QUALITY.score ? 'Detailed box score data was not recorded for this game.' : archiveQuality === QUALITY.missing ? 'Game data missing.' : null,
    hasDetailedStats: archiveQuality === QUALITY.full || archiveQuality === QUALITY.partial,
  };
}
