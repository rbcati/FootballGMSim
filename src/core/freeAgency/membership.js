/**
 * Canonical free-agency membership predicate.
 *
 * A player is a FREE AGENT when they hold no team — `teamId` is null/undefined
 * or the legacy `'FA'` sentinel — or they carry the explicit `'free_agent'`
 * status. Retired and draft-eligible players are NOT free agents (they are never
 * signable through the offseason market), so callers that build signable pools
 * should combine this with a status guard where relevant.
 *
 * WHY THIS EXISTS — the user team has id `0`. The historical shortcut
 * `!player.teamId` evaluates to `true` for `teamId === 0`, so every player on the
 * user's roster was misclassified as a free agent and signed away by AI teams
 * during the offseason free-agency phase (post-rollover roster collapse to ~11).
 * Membership must be tested against `null`, never falsiness.
 *
 * @param {{ teamId?: unknown, status?: unknown } | null | undefined} player
 * @returns {boolean}
 */
export function isFreeAgent(player) {
  if (!player) return false;
  const { teamId, status } = player;
  return teamId == null || teamId === 'FA' || status === 'free_agent';
}
