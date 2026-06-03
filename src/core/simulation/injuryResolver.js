/*
 * Injury Resolver Domain Module
 * ─────────────────────────────
 * Owns in-game injury resolution: rolling for an injury on a player and the
 * mutations that follow (marking the player injured, recording the game-injury
 * entry, and the substitution share that shifts snaps to the backup).
 *
 * The actual injury generator and availability predicate are injected so this
 * module stays decoupled from the injury system and the orchestrator keeps
 * control of the seeded RNG draws.
 */

/**
 * Roll for an in-game injury on a player.
 * @param {object} player
 * @param {{ injuryChanceMod?: number }} opts
 * @param {{ generateInjury: Function, canPlayerPlay: Function }} deps
 * @returns {object|null} the generated injury, or null if none / unavailable
 */
export function rollInGameInjury(player, opts = {}, deps = {}) {
  const { generateInjury, canPlayerPlay } = deps;
  if (!player || typeof generateInjury !== 'function') return null;
  if (typeof canPlayerPlay === 'function' && !canPlayerPlay(player)) return null;
  return generateInjury(player, { injuryChanceMod: opts.injuryChanceMod ?? 1.0 });
}

/**
 * Apply an injury's effects to a player object (mutates the player).
 */
export function applyInjuryToPlayer(player, injury) {
  if (!player || !injury) return;
  if (!player.injuries) player.injuries = [];
  player.injuries.push(injury);
  player.injured = true;
  player.injuryWeeksRemaining = Math.max(player.injuryWeeksRemaining || 0, injury.weeksRemaining);
  if (injury.seasonEnding) player.seasonEndingInjury = true;
}

/**
 * Build the structured game-injury entry collected for post-game reporting.
 */
export function buildGameInjuryEntry(player, teamId, injury) {
  return {
    playerId: player.id,
    name: player.name,
    teamId,
    type: injury.name,
    duration: injury.weeksRemaining,
    seasonEnding: injury.seasonEnding,
  };
}

/**
 * Resolve the share of the game a starter played before getting hurt, and the
 * complementary share that shifts to the backup. `playedShare` is the fraction
 * of the game completed when the injury occurred (drawn by the caller).
 * @returns {{ starterShare: number, backupShare: number }}
 */
export function resolveInjurySubstitutionShare(baseShare, playedShare) {
  const starterShare = baseShare * playedShare;
  const backupShare = baseShare - starterShare;
  return { starterShare, backupShare };
}
