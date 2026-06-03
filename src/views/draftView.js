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
 *   phase: string|null,                        // current league phase key
 *   isDraftPhase: boolean,                     // true when phase === 'draft'
 *   draftLifecycleStatus: string|null,         // 'not_generated' | 'generated' | null
 *   isDraftGenerationPending: boolean,         // true when status === 'not_generated'
 *   userTeamId: (number|string|null),          // id of the human-controlled team
 *   returnDestination: ('HQ'|'League'),        // target for the back-navigation button
 *   returnLabel: ('HQ'|'League'),              // display label matching returnDestination
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
