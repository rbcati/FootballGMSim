export function toTeamId(value) {
  const normalized = Number(typeof value === 'object' ? value?.id : value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function buildCanonicalGameId({ seasonId, week, homeId, awayId }) {
  const parsedWeek = Number(week);
  const hId = toTeamId(homeId);
  const aId = toTeamId(awayId);
  if (!seasonId || !Number.isFinite(parsedWeek) || hId == null || aId == null) return null;
  return `${seasonId}_w${parsedWeek}_${hId}_${aId}`;
}

export function buildArchivedGame({ gameId, seasonId, week, homeId, awayId, homeScore, awayScore, stats = null, recap = null, drives = null, quarterScores = null }) {
  const canonicalId = gameId ?? buildCanonicalGameId({ seasonId, week, homeId, awayId });
  return {
    id: canonicalId,
    seasonId,
    week: Number(week),
    homeId: toTeamId(homeId),
    awayId: toTeamId(awayId),
    homeScore: Number(homeScore ?? 0),
    awayScore: Number(awayScore ?? 0),
    quarterScores: quarterScores ?? null,
    recap: recap ?? null,
    drives: drives ?? null,
    stats: stats ?? null,
  };
}
