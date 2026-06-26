/**
 * viewStateStats.js — expose recorded season stats on roster players.
 *
 * Background
 * ----------
 * Per-player season totals are accumulated in a dedicated cache map
 * (cache._seasonStats), keyed by player id, NOT on the player objects
 * themselves. The League Stats hub (buildLeagueStatsHubModel) reads each
 * player's totals from `player.seasonStats` on the view-model roster. Because
 * the view-model never copied those totals onto roster players, League Stats
 * fell back to game-log aggregation — and since the slim schedule carries no
 * box scores either, it rendered all-zero leaders even when games had been
 * recorded and standings updated.
 *
 * This helper bridges the gap: it copies the recorded season totals onto a
 * shallow copy of each roster player so the UI sees real numbers, without
 * mutating the canonical cache player objects.
 */

/**
 * Attach recorded season-stat totals onto roster players.
 *
 * @param {Array<object>} roster                   Player objects from the cache.
 * @param {(playerId: unknown) => (object|null|undefined)} getSeasonStatTotals
 *        Lookup returning the recorded `totals` object for a player id (or
 *        null/undefined when none exist yet).
 * @returns {Array<object>} New roster array with `seasonStats` populated where
 *        totals exist. Malformed rows and players without totals pass through
 *        unchanged.
 */
export function attachSeasonStatsToRoster(roster, getSeasonStatTotals) {
  if (!Array.isArray(roster)) return [];
  if (typeof getSeasonStatTotals !== "function") return roster;

  return roster.map((player) => {
    if (!player || typeof player !== "object") return player;
    // Respect an already-present seasonStats object (some code paths attach it).
    if (player.seasonStats && typeof player.seasonStats === "object") return player;

    const totals = getSeasonStatTotals(player.id);
    if (!totals || typeof totals !== "object") return player;

    return { ...player, seasonStats: totals };
  });
}
