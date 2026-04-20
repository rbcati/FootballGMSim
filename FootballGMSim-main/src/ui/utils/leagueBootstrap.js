export const NEW_SLOT_BOOTSTRAP_PHASES = Object.freeze({
  IDLE: 'idle',
  AWAITING_PLAYABLE: 'awaiting_playable',
  SAVING_SLOT: 'saving_slot',
});

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

export function shouldStartNewSlotInitialSave({ league, pendingNewSlot, bootstrapPhase = NEW_SLOT_BOOTSTRAP_PHASES.IDLE }) {
  if (!pendingNewSlot) return false;
  if (bootstrapPhase !== NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE) return false;
  return hasMinimumPlayableLeague(league);
}

export function shouldFinalizeNewSlotBootstrap({
  pendingNewSlot,
  bootstrapPhase = NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
  saveEvent = null,
}) {
  if (!pendingNewSlot) return false;
  if (bootstrapPhase !== NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT) return false;
  return saveEvent?.kind === 'slot' && saveEvent?.slotKey === pendingNewSlot;
}

export function shouldShowNewFranchiseBootstrapGate({
  league,
  pendingNewSlot,
  initFlowMode,
  initFlowActive = false,
  bootstrapPhase = NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
}) {
  if (initFlowMode !== 'new') return false;
  if (!pendingNewSlot) return false;
  if (!initFlowActive && bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.IDLE) return false;
  if (bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT) return true;
  return !hasMinimumPlayableLeague(league);
}

export function shouldShowAuthoritativeInitGate({
  league,
  initFlowMode,
  initFlowActive,
  pendingNewSlot,
  loadReady = false,
  bootstrapPhase = NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
}) {
  if (initFlowMode === 'new' && pendingNewSlot) {
    if (!initFlowActive && bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.IDLE) return false;
    return bootstrapPhase !== NEW_SLOT_BOOTSTRAP_PHASES.IDLE || !hasMinimumPlayableLeague(league);
  }
  if (initFlowMode === 'load' && initFlowActive) {
    return !loadReady;
  }
  return false;
}

export function canPersistActiveSlot({
  league,
  activeSlot,
  pendingNewSlot,
  bootstrapPhase = NEW_SLOT_BOOTSTRAP_PHASES.IDLE,
}) {
  if (!activeSlot) return false;
  if (!hasMinimumPlayableLeague(league)) return false;
  if (!pendingNewSlot) return true;
  return bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.IDLE;
}
