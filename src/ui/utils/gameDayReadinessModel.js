import { deriveGameDayAvailability } from '../../core/gameDayAvailability.js';

/** A presentation-only projection of canonical game-day availability facts. */
export function buildGameDayReadinessModel({ roster = [], teamId = null } = {}) {
  const facts = deriveGameDayAvailability(roster, teamId == null ? {} : { teamId });
  const unavailableStarters = facts.unavailableStarters.map((player) => ({
    id: player.id,
    name: player.name ?? 'Unnamed player',
    position: player.pos ?? player.position ?? 'Player',
  }));

  return {
    availableCount: facts.eligiblePlayers.length,
    unavailableCount: facts.unavailablePlayers.length,
    unavailableStarterCount: unavailableStarters.length,
    blockingLineupIssue: facts.blockingLineupIssue,
    majorInjuryStress: facts.majorInjuryStress,
    unavailableStarters,
    // Availability concerns are useful context, but only an invalid lineup is a blocker.
    status: facts.blockingLineupIssue ? 'blocking' : 'ready',
    hasAvailabilityConcerns: facts.unavailablePlayers.length > 0,
    actionDestination: 'Team:Roster / Depth',
  };
}
