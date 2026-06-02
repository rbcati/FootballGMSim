/**
 * useDraftState.js
 *
 * Custom hook holding all of the Draft screen's state and side effects.
 * Extracted verbatim from the former monolithic Draft.jsx so the main
 * component can stay a thin orchestrator (behavior unchanged).
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { normalizeIncomingDraftState, calculatePickGrade } from "./draftShared.js";
import { logCompletedDraftAction, persistFranchiseChronicle } from "../utils/franchiseChronicle.js";

export function useDraftState({ league, actions }) {
  const [draftState, setDraftState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draftError, setDraftError] = useState(null);
  const [simming, setSimming] = useState(false);
  const [profilePlayerId, setProfilePlayerId] = useState(null);
  const [pickGrade, setPickGrade] = useState(null); // { pick, grade }

  const normalizeDraftState = useCallback((incoming) => normalizeIncomingDraftState(incoming), []);

  const loadDraftState = useCallback(async () => {
    if (!actions?.getDraftState) {
      setIsLoading(false);
      setDraftError("Draft service unavailable for this save.");
      setDraftState(null);
      return;
    }
    setIsLoading(true);
    setDraftError(null);
    try {
      if (league?.phase === "draft" && !league?.draftStarted) {
        await actions.startDraft?.();
      }
      const res = await actions.getDraftState();
      setDraftState(normalizeDraftState(res?.payload));
    } catch (err) {
      setDraftError(err?.message ?? 'Unable to load draft state');
    } finally {
      setIsLoading(false);
    }
  }, [actions, normalizeDraftState, league?.phase, league?.draftStarted]);

  // Enrich each pick with isUser flag for the completed-picks panel
  const enrichedDraftState = useMemo(() => {
    if (!draftState) return null;
    return {
      ...draftState,
      completedPicks: (draftState.completedPicks ?? []).map((pk) => ({
        ...pk,
        isUser: pk.teamId === league?.userTeamId,
      })),
    };
  }, [draftState, league?.userTeamId]);

  // Load draft state on mount
  useEffect(() => {
    (async () => {
      try {
        await loadDraftState();
      } catch {
        // handled in loadDraftState
      }
    })();
    return undefined;
  }, [loadDraftState]);

  const handleDraftStarted = useCallback((state) => {
      setDraftState(normalizeDraftState(state));
  }, [normalizeDraftState]);

  const handleSimToMyPick = useCallback(async () => {
    setSimming(true);
    setDraftError(null);
    try {
      const res = await actions.simDraftPick();
      if (res?.payload) setDraftState(normalizeDraftState(res.payload));
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSimming(false);
    }
  }, [actions, normalizeDraftState]);

  const handleDraftPlayer = useCallback(
    async (playerId) => {
      setDraftError(null);
      try {
        const res = await actions.makeDraftPick(playerId);
        if (res?.payload) {
          setDraftState(normalizeDraftState(res.payload));

          // Show pick grade for the user's pick
          const picks = res.payload.completedPicks ?? [];
          const lastUserPick = [...picks]
            .reverse()
            .find(
              (pk) => pk.teamId === league?.userTeamId && pk.playerOvr != null,
            );
          if (lastUserPick) {
            logCompletedDraftAction(league, {
              id: `draft-${league?.seasonId ?? league?.year}-${lastUserPick.overall ?? lastUserPick.pickInRound}-${lastUserPick.playerId}`,
              pick: lastUserPick,
              source: 'draft_room',
            });
            await persistFranchiseChronicle(actions, league);
            const grade = calculatePickGrade(
              lastUserPick.playerOvr,
              lastUserPick.overall,
              res.payload.totalPicks ?? 160,
            );
            setPickGrade({ pick: lastUserPick, grade });
          }
        }
      } catch (err) {
        setDraftError(err.message);
      }
    },
    [actions, league, normalizeDraftState],
  );

  return {
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
  };
}

export default useDraftState;
