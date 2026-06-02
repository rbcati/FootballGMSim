/**
 * Draft.jsx
 *
 * Thin orchestrator for the offseason NFL Draft interface. All state/effects
 * live in useDraftState; presentation is split across the src/ui/draft module
 * (DraftControls, ProspectTable, PreDraftPanel, DraftCompletePanel,
 * PickGradeModal, ScoutBadge). Behavior is unchanged from the former monolith.
 *
 * Receives { league, actions } from LeagueDashboard (same shape as other tabs).
 */

import React from "react";
import PlayerProfile from "./PlayerProfile";
import PlayerProfileModalBoundary from "./PlayerProfileModalBoundary.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { useDraftState } from "../draft/useDraftState.js";
import DraftControls from "../draft/DraftControls.jsx";
import ProspectTable from "../draft/ProspectTable.jsx";
import PreDraftPanel from "../draft/PreDraftPanel.jsx";
import DraftCompletePanel from "../draft/DraftCompletePanel.jsx";
import { PickGradeModal } from "../draft/PickGradeModal.jsx";

// Re-exported for tests and other modules that imported them from Draft.jsx.
export { normalizeIncomingDraftState, filterDraftProspectsForView } from "../draft/draftShared.js";

export default function Draft({ league, actions, onNavigate = null, busy = false }) {
  const {
    draftState,
    enrichedDraftState,
    isLoading,
    draftError,
    setDraftError,
    simming,
    profilePlayerId,
    setProfilePlayerId,
    pickGrade,
    setPickGrade,
    loadDraftState,
    handleDraftStarted,
    handleSimToMyPick,
    handleDraftPlayer,
  } = useDraftState({ league, actions });

  const actionsDisabled = isLoading || busy;

  return (
    <div>
      <DraftControls
        league={league}
        draftState={draftState}
        isLoading={isLoading}
        busy={busy}
        draftError={draftError}
        onNavigate={onNavigate}
        onRetry={loadDraftState}
        onDismissError={() => setDraftError(null)}
      />

      {/* Pre-draft: no draft started yet */}
      {!isLoading && !draftState && league?.phase !== "draft" && (
        <PreDraftPanel
          league={league}
          actions={actions}
          onDraftStarted={handleDraftStarted}
          disabled={actionsDisabled}
        />
      )}

      {/* Draft phase recovery: entered draft but state is missing/unhydrated */}
      {!isLoading && !draftState && league?.phase === "draft" && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle>Draft data is still initializing</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: "var(--space-3)" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              {league?.draftLifecycleStatus === "not_generated"
                ? "Draft generation is pending. Starting draft setup now."
                : "The draft is active, but board data has not been hydrated yet. Retry loading or return to League HQ."}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button className="btn" disabled={actionsDisabled} onClick={loadDraftState}>Retry Draft Load</Button>
              <Button className="btn btn-secondary" onClick={() => onNavigate?.(league?.phase === "draft" ? "HQ" : "League")}>
                Return to {league?.phase === "draft" ? "HQ" : "League"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draft board: draft in progress */}
      {!isLoading && draftState && !draftState.isDraftComplete && (
        <ProspectTable
          draftState={enrichedDraftState}
          userTeamId={league?.userTeamId}
          onSimToMyPick={handleSimToMyPick}
          onDraftPlayer={handleDraftPlayer}
          onPlayerClick={setProfilePlayerId}
          simming={simming}
          league={league}
          actions={actions}
          disabled={actionsDisabled}
        />
      )}

      {/* Pick Grade modal */}
      {pickGrade && (
        <PickGradeModal
          pick={pickGrade.pick}
          grade={pickGrade.grade}
          onDismiss={() => setPickGrade(null)}
        />
      )}

      {/* Draft complete */}
      {!isLoading && draftState && draftState.isDraftComplete && (
        <DraftCompletePanel actions={actions} draftState={enrichedDraftState} />
      )}

      {/* Player profile modal — opened by clicking a prospect's name */}
      {profilePlayerId && (
        <PlayerProfileModalBoundary playerId={profilePlayerId} onClose={() => setProfilePlayerId(null)}>
          <PlayerProfile
            playerId={profilePlayerId}
            onClose={() => setProfilePlayerId(null)}
            actions={actions}
            league={league}
            isUserOnClock={
              enrichedDraftState?.isUserPick &&
              !enrichedDraftState?.isDraftComplete
            }
            onDraftPlayer={(pid) => {
              handleDraftPlayer(pid);
              setProfilePlayerId(null);
            }}
          />
        </PlayerProfileModalBoundary>
      )}
    </div>
  );
}
