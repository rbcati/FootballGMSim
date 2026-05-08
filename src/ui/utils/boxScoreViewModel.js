import { normalizeArchivedGamePayload } from '../../core/gameArchive.js';
import { buildGameBookStory } from '../../core/gameBookNarrative.js';

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

function coercePlayerRowId(entryKey, row) {
  if (row && row.playerId != null) return row.playerId;
  const num = Number(entryKey);
  if (Number.isFinite(num) && String(num) === String(entryKey)) return num;
  return entryKey;
}

function rowStats(row) {
  if (!row || typeof row !== 'object') return {};
  if (row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats)) return row.stats;
  const { name, pos, teamId, playerId, stats, teamSide, ...rest } = row;
  return Object.keys(rest).length ? rest : {};
}

function normalizePlayers(raw = {}, side, teamId) {
  return Object.entries(raw || {}).map(([id, row]) => ({
    playerId: coercePlayerRowId(id, row),
    teamId: row?.teamId ?? teamId,
    teamSide: side,
    name: row?.name,
    pos: row?.pos,
    stats: rowStats(row),
  }));
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

  const homeTeam = teamInfo(league, homeId, 'home', payload);
  const awayTeam = teamInfo(league, awayId, 'away', payload);

  const hasScore = homeScore != null && awayScore != null;
  const hasQuarter = Array.isArray(quarterScores?.home) || Array.isArray(quarterScores?.away);
  const hasTeamTotals = [teamStats?.home, teamStats?.away].some((o) => o && typeof o === 'object' && Object.keys(o).length > 0);
  const hasPlayerStats = homePlayers.some((p) => p && Object.keys(p.stats ?? {}).length > 0)
    || awayPlayers.some((p) => p && Object.keys(p.stats ?? {}).length > 0);
  const hasScoringSummary = scoringSummary.length > 0;

  let archiveQuality = QUALITY.missing;
  if (hasScore && hasQuarter && hasTeamTotals && hasPlayerStats) archiveQuality = QUALITY.full;
  else if (hasScore && (hasQuarter || hasTeamTotals || hasPlayerStats || hasScoringSummary)) archiveQuality = QUALITY.partial;
  else if (hasScore) archiveQuality = QUALITY.score;

  const storedNarrative = Array.isArray(payload.gameNarrative) && payload.gameNarrative.length > 0
    ? payload.gameNarrative
    : null;
  const storyBullets = storedNarrative ?? buildGameBookStory({
    awayTeam,
    homeTeam,
    finalScore: { home: homeScore, away: awayScore },
    teamTotals: { home: teamStats?.home ?? {}, away: teamStats?.away ?? {} },
    playerTables: { home: homePlayers, away: awayPlayers },
    scoringSummary,
  });

  const detailWarning = archiveQuality === QUALITY.partial
    ? 'Some Game Book sections are missing — often from trimmed archives or older builds.'
    : archiveQuality === QUALITY.score
      ? 'Detailed stats were not recorded for this game. Older saves may only store the final score.'
      : archiveQuality === QUALITY.missing
        ? 'Game data missing.'
        : null;
  const missingDetailReason = detailWarning;

  return {
    gameId: payload?.gameId ?? payload?.id ?? gameId ?? null,
    season: payload?.seasonId ?? context?.season ?? league?.seasonId ?? null,
    week: payload?.week ?? context?.week ?? null,
    phase: payload?.phase ?? null,
    winnerTeamId: payload?.winnerTeamId ?? null,
    topPerformers: payload?.topPerformers ?? null,
    resultSchemaVersion: payload?.resultSchemaVersion ?? null,
    createdAt: payload?.createdAt ?? null,
    status: payload?.played ? 'Final' : 'Scheduled',
    archiveQuality,
    homeTeam,
    awayTeam,
    finalScore: { home: homeScore, away: awayScore },
    quarterScores,
    teamTotals: { home: teamStats?.home ?? {}, away: teamStats?.away ?? {} },
    scoringSummary,
    playerTables: { home: homePlayers, away: awayPlayers },
    storyBullets,
    prepImpact: Array.isArray(payload?.prepImpact) ? payload.prepImpact : (payload?.prepImpact ? [String(payload.prepImpact)] : []),
    detailWarning,
    missingDetailReason,
    hasDetailedStats: archiveQuality === QUALITY.full || archiveQuality === QUALITY.partial,
  };
}
