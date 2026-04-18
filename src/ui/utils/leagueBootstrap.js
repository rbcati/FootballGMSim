export function hasMinimumPlayableLeague(league) {
  if (!league || typeof league !== 'object') return false;
  const teams = Array.isArray(league.teams) ? league.teams : [];
  const hasTeams = teams.length > 0;
  const hasPhase = typeof league.phase === 'string' && league.phase.length > 0;
  const hasWeek = Number.isFinite(Number(league.week ?? 1));
  const hasUserTeam = teams.some((t) => Number(t?.id) === Number(league?.userTeamId));
  return hasTeams && hasPhase && hasWeek && hasUserTeam;
}

export function summarizeBootstrapState(league) {
  if (!league) return { ready: false, reasons: ['No league payload yet.'] };
  const reasons = [];
  if (!Array.isArray(league?.teams) || league.teams.length === 0) reasons.push('Teams are still loading.');
  if (!league?.phase) reasons.push('Phase is missing.');
  if (!Number.isFinite(Number(league?.week ?? 1))) reasons.push('Week is missing.');
  const hasUserTeam = Array.isArray(league?.teams)
    ? league.teams.some((t) => Number(t?.id) === Number(league?.userTeamId))
    : false;
  if (!hasUserTeam) reasons.push('Your team assignment is still resolving.');
  return { ready: hasMinimumPlayableLeague(league), reasons };
}

export function shouldFinalizeNewSlotBootstrap({ league, pendingNewSlot }) {
  if (!pendingNewSlot) return false;
  return hasMinimumPlayableLeague(league);
}

export function shouldShowNewFranchiseBootstrapGate({ league, pendingNewSlot, initFlowMode }) {
  if (initFlowMode !== 'new') return false;
  if (!pendingNewSlot) return false;
  return !hasMinimumPlayableLeague(league);
}
