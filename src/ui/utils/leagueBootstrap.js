/**
 * leagueBootstrap.js
 *
 * Authoritative readiness gates for league initialization.
 * Prevents race conditions during new franchise creation.
 */
import { getPlayableLeagueValidation, isPlayableLeagueState } from '../../state/leagueInit.ts';

export const NEW_SLOT_BOOTSTRAP_PHASES = {
  IDLE: 'idle',
  AWAITING_PLAYABLE: 'awaiting_playable',
  SAVING_SLOT: 'saving_slot',
  FINALIZING: 'finalizing',
};

/**
 * Returns true only if the league object has all critical fields
 * required to render the dashboard and simulate games.
 */

export function hasMinimumPlayableLeague(league) {
  return isPlayableLeagueState(league);
}

/**
 * Diagnostic helper to see exactly why a league isn't ready.
 */
export function summarizeBootstrapState(league) {
  const validation = getPlayableLeagueValidation(league);
  const reasons = validation.valid ? [] : validation.reasons;

  return {
    ready: validation.valid,
    reasons,
  };
}

/**
 * Gate for the very first save of a brand new slot.
 */
export function shouldStartNewSlotInitialSave({ league, pendingNewSlot, bootstrapPhase }) {
  if (!pendingNewSlot) return false;
  if (bootstrapPhase !== NEW_SLOT_BOOTSTRAP_PHASES.AWAITING_PLAYABLE) return false;
  return hasMinimumPlayableLeague(league);
}

/**
 * General persistence gate. Prevents auto-saves during
 * sensitive bootstrap transitions.
 */
export function canPersistActiveSlot({ league, activeSlot, pendingNewSlot, bootstrapPhase }) {
  if (!activeSlot) return false;
  // If we are bootstrapping a new slot, don't auto-save until it's finalized
  if (pendingNewSlot && bootstrapPhase !== NEW_SLOT_BOOTSTRAP_PHASES.IDLE) return false;
  return hasMinimumPlayableLeague(league);
}

/**
 * Decides if we show the "Initializing League..." authoritative overlay.
 */
export function shouldShowAuthoritativeInitGate({
  league,
  initFlowMode,
  initFlowActive,
  pendingNewSlot,
  bootstrapPhase,
  loadReady
}) {
  if (!initFlowActive) return false;

  if (initFlowMode === 'new') {
    // Show gate if league isn't playable yet OR if we are still in the saving phase
    if (!hasMinimumPlayableLeague(league)) return true;
    if (bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT) return true;
    return false;
  }

  if (initFlowMode === 'load') {
    return !loadReady;
  }

  return false;
}

/**
 * Finalizing check. Handles both simple App.jsx check and complex
 * bootstrap-aware save-event check.
 */
export function shouldFinalizeNewSlotBootstrap({ pendingNewSlot, bootstrapPhase, saveEvent, league }) {
  if (!pendingNewSlot) return false;

  // Simple check for App.jsx effects that don't track fine-grained phases
  if (league && bootstrapPhase === undefined) {
     return hasMinimumPlayableLeague(league);
  }

  // Robust check for multi-step bootstrap flow
  if (bootstrapPhase === NEW_SLOT_BOOTSTRAP_PHASES.SAVING_SLOT) {
    if (!saveEvent) return false;
    return saveEvent.kind === 'slot' && saveEvent.slotKey === pendingNewSlot;
  }

  return false;
}

/**
 * Gates the main dashboard view during new franchise creation.
 */
export function shouldShowNewFranchiseBootstrapGate({ league, pendingNewSlot, initFlowMode }) {
  if (initFlowMode !== 'new' || !pendingNewSlot) return false;
  return !hasMinimumPlayableLeague(league);
}
