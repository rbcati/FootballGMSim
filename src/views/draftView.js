/*
 * Draft View (data-preparation layer)
 * ───────────────────────────────────
 * ZenGM-style `worker/views` pattern: the UI never reads raw league state
 * directly. `prepareDraftView` accepts the raw league slice and returns a plain,
 * serializable view-model with exactly the fields the Draft screen needs to
 * decide which panel to render and where the "return" button should go.
 *
 * Pure: no React, no JSX, no hooks. Independently unit-testable.
 */

/**
 * @param {object} state - the raw league state (or relevant slice)
 * @returns {{
 *   phase: string|null,
 *   isDraftPhase: boolean,
 *   draftLifecycleStatus: string|null,
 *   isDraftGenerationPending: boolean,
 *   userTeamId: (number|string|null),
 *   returnDestination: ('HQ'|'League'),
 *   returnLabel: ('HQ'|'League'),
 * }}
 */
export function prepareDraftView(state) {
  const league = state ?? {};
  const phase = league.phase ?? null;
  const isDraftPhase = phase === 'draft';
  const draftLifecycleStatus = league.draftLifecycleStatus ?? null;

  return {
    phase,
    isDraftPhase,
    draftLifecycleStatus,
    isDraftGenerationPending: draftLifecycleStatus === 'not_generated',
    userTeamId: league.userTeamId ?? null,
    // When mid-draft, the natural "back" target is League HQ; otherwise League.
    returnDestination: isDraftPhase ? 'HQ' : 'League',
    returnLabel: isDraftPhase ? 'HQ' : 'League',
  };
}
