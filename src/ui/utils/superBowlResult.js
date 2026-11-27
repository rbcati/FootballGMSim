/**
 * Resolve the completed Super Bowl for the Season Complete splash.
 *
 * Primary source: the WEEK_COMPLETE results the worker posted for week 22
 * (kept as `seasonFinale` in useWorker state). Fallback after a reload: the
 * persisted week-22 schedule row, which carries the final score.
 *
 * @returns {null | { homeId, awayId, homeScore, awayScore, homeName, awayName,
 *   homeAbbr, awayAbbr, winnerId, gameId, source }}
 */
export const SUPER_BOWL_WEEK = 22;

const toId = (value) => Number(typeof value === 'object' && value !== null ? value.id : value);

export function deriveSuperBowlResult(league, seasonFinale = null) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const teamOf = (id) => teams.find((t) => Number(t?.id) === Number(id)) ?? null;
  const build = (homeId, awayId, homeScore, awayScore, extra = {}) => {
    const home = teamOf(homeId);
    const away = teamOf(awayId);
    const hs = Number(homeScore);
    const as = Number(awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
    return {
      homeId: Number(homeId),
      awayId: Number(awayId),
      homeScore: hs,
      awayScore: as,
      homeName: extra.homeName ?? home?.name ?? 'Home',
      awayName: extra.awayName ?? away?.name ?? 'Away',
      homeAbbr: home?.abbr ?? String(extra.homeName ?? 'HOME').slice(0, 3).toUpperCase(),
      awayAbbr: away?.abbr ?? String(extra.awayName ?? 'AWAY').slice(0, 3).toUpperCase(),
      winnerId: hs >= as ? Number(homeId) : Number(awayId),
      gameId: extra.gameId ?? null,
      source: extra.source,
    };
  };

  const finaleSameSeason = seasonFinale
    && (seasonFinale.seasonId == null || league?.seasonId == null || String(seasonFinale.seasonId) === String(league.seasonId));
  const finaleGame = finaleSameSeason && Number(seasonFinale.week) === SUPER_BOWL_WEEK
    ? (seasonFinale.results ?? [])[0]
    : null;
  if (finaleGame) {
    const result = build(finaleGame.homeId, finaleGame.awayId, finaleGame.homeScore, finaleGame.awayScore, {
      homeName: finaleGame.homeName, awayName: finaleGame.awayName, gameId: finaleGame.gameId, source: 'week_complete',
    });
    if (result) return result;
  }

  const week = (league?.schedule?.weeks ?? []).find((w) => Number(w?.week) === SUPER_BOWL_WEEK);
  const game = (week?.games ?? []).find((g) => g?.played && g?.homeScore != null && g?.awayScore != null);
  if (game) return build(toId(game.home), toId(game.away), game.homeScore, game.awayScore, { source: 'schedule' });
  return null;
}
