import { isAvailableForGameDay } from './holdouts/holdoutEngine.js';
import { getCanonicalScrimmageAssignment } from './depthChart.js';

/** Preserve the worker's established readiness-only injury interpretation. */
export function hasReadinessInjury(player) {
  const weeks = Number(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injuryDuration ?? 0);
  const status = String(player?.status ?? '').toLowerCase();
  return weeks > 0 || status === 'injured' || status === 'ir';
}

function isScrimmageStarter(player) {
  return getCanonicalScrimmageAssignment(player)?.order === 1;
}

/**
 * Derive participation and readiness facts without altering the owned roster.
 * Readiness injury context preserves the established worker semantics; the
 * broader game-day gate (and its canPlayerPlay authority) is reserved for the
 * eligible participant pool.
 */
export function deriveGameDayAvailability(roster = [], context = {}) {
  const fullRoster = Array.isArray(roster) ? roster.filter(Boolean) : [];
  const injuredPlayers = fullRoster.filter(hasReadinessInjury);
  const injuredStarters = injuredPlayers.filter(isScrimmageStarter);
  const eligiblePlayers = fullRoster.filter((player) => isAvailableForGameDay(player, context));
  const unavailablePlayers = fullRoster.filter((player) => !isAvailableForGameDay(player, context));
  const unavailableStarters = unavailablePlayers.filter(isScrimmageStarter);

  return {
    fullRoster,
    eligiblePlayers,
    unavailablePlayers,
    injuredPlayers,
    injuredStarters,
    unavailableStarters,
    majorInjuryStress: injuredPlayers.length >= 3,
    blockingLineupIssue: injuredStarters.length >= 2,
  };
}
