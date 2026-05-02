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

function normalizePlayers(raw = {}, side) {
  return Object.entries(raw || {}).map(([id, row]) => ({ playerId: Number(id), teamSide: side, ...row, stats: row?.stats ?? row ?? {} }));
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
  const teamStats = payload?.teamStats ?? payload?.stats?.team ?? payload?.stats ?? {};
  const playerStats = payload?.playerStats ?? payload?.stats ?? {};
  const homePlayers = normalizePlayers(playerStats?.home, 'home');
  const awayPlayers = normalizePlayers(playerStats?.away, 'away');
  const hasDetailedStats = Boolean(quarterScores || scoringSummary.length || homePlayers.length || awayPlayers.length || teamStats?.home || teamStats?.away);
  const hasScore = homeScore != null && awayScore != null;
  const archiveQuality = hasDetailedStats ? QUALITY.full : (hasScore ? QUALITY.score : QUALITY.missing);

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
    missingDetailReason: hasDetailedStats ? null : 'Detailed box score data was not recorded for this game.',
    hasDetailedStats,
  };
}
