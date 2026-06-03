import { useState, useEffect, useMemo, useCallback } from "react";
import { applyAdvancedPlayerFilters, allFilters } from "../../core/footballAdvancedFilters";
import { usePlayerCompare } from "../utils/playerCompare.js";
import { DRAFT_ROOM_PHASES, buildPickOrder, filterDraftProspectsForView } from "./draftShared.js";

/**
 * Owns all DraftBoard display state, effects, and derived data.
 * Extracted from ProspectTable.jsx (DraftBoard) — behavior unchanged.
 */
export function useDraftBoard({ draftState, onDraftPlayer, onSimToMyPick, league }) {
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState(-1);
  const [filterPos, setFilterPos] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showTradeUp, setShowTradeUp] = useState(false);
  const [showTradeDown, setShowTradeDown] = useState(false);
  const [tradeDownProcessing, setTradeDownProcessing] = useState(false);
  const [manualBoard, setManualBoard] = useState([]);
  const [pickClock, setPickClock] = useState(90);
  const [userAutoPick, setUserAutoPick] = useState(false);
  const [draftPhase, setDraftPhase] = useState(DRAFT_ROOM_PHASES.PRE_DRAFT);
  const [pickFlash, setPickFlash] = useState(null);
  const [cpuPending, setCpuPending] = useState(false);
  const [activeRound, setActiveRound] = useState(1);

  const {
    currentPick,
    isUserPick,
    isDraftComplete,
    prospects = [],
    completedPicks = [],
    upcomingPicks = [],
    pendingTradeProposal = null,
    recommendedPick = null,
    userBigBoard = [],
  } = draftState ?? {};

  useEffect(() => {
    setManualBoard((userBigBoard ?? []).map((entry) => String(entry.playerId)));
  }, [userBigBoard]);

  useEffect(() => {
    setPickClock(90);
  }, [currentPick?.overall]);

  useEffect(() => {
    if (currentPick?.round) setActiveRound(currentPick.round);
  }, [currentPick?.round]);

  useEffect(() => {
    if (isDraftComplete) { setDraftPhase(DRAFT_ROOM_PHASES.DRAFT_COMPLETE); return; }
    if (!currentPick) { setDraftPhase(DRAFT_ROOM_PHASES.PRE_DRAFT); return; }
    if (isUserPick) setDraftPhase(DRAFT_ROOM_PHASES.ON_THE_CLOCK);
    else setDraftPhase(DRAFT_ROOM_PHASES.CPU_PICKING);
  }, [currentPick, isUserPick, isDraftComplete]);

  useEffect(() => {
    if (!completedPicks.length) return;
    const lastPick = completedPicks[completedPicks.length - 1];
    if (!lastPick || lastPick.overall === pickFlash?.overall) return;
    setPickFlash(lastPick);
    setDraftPhase(DRAFT_ROOM_PHASES.PICK_MADE);
    const timer = setTimeout(() => {
      setPickFlash(null);
      if (isDraftComplete) setDraftPhase(DRAFT_ROOM_PHASES.DRAFT_COMPLETE);
      else if (isUserPick) setDraftPhase(DRAFT_ROOM_PHASES.ON_THE_CLOCK);
      else setDraftPhase(DRAFT_ROOM_PHASES.CPU_PICKING);
    }, 700);
    return () => clearTimeout(timer);
  }, [completedPicks, isDraftComplete, isUserPick, pickFlash?.overall]);

  const sortedByOvr = useMemo(
    () => [...prospects].sort((a, b) => (b?.ovr ?? 0) - (a?.ovr ?? 0)),
    [prospects],
  );

  useEffect(() => {
    if (draftPhase !== DRAFT_ROOM_PHASES.ON_THE_CLOCK || !isUserPick || isDraftComplete) return undefined;
    if (!userAutoPick) return undefined;
    const bestProspect = sortedByOvr[0];
    if (bestProspect) onDraftPlayer(bestProspect.id);
    return undefined;
  }, [draftPhase, isUserPick, isDraftComplete, userAutoPick, sortedByOvr, onDraftPlayer]);

  useEffect(() => {
    if (draftPhase !== DRAFT_ROOM_PHASES.ON_THE_CLOCK || !isUserPick || userAutoPick || isDraftComplete) return undefined;
    const timer = setInterval(() => {
      setPickClock((prev) => {
        if (prev <= 1) {
          const bestProspect = sortedByOvr[0];
          if (bestProspect) onDraftPlayer(bestProspect.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [draftPhase, isUserPick, isDraftComplete, userAutoPick, sortedByOvr, onDraftPlayer]);

  useEffect(() => {
    if (draftPhase !== DRAFT_ROOM_PHASES.CPU_PICKING || isUserPick || isDraftComplete || cpuPending) return undefined;
    setCpuPending(true);
    const delay = 400 + Math.random() * 800;
    const timer = setTimeout(async () => {
      try { await onSimToMyPick(); } finally { setCpuPending(false); }
    }, delay);
    return () => { clearTimeout(timer); setCpuPending(false); };
  }, [draftPhase, isUserPick, isDraftComplete, cpuPending, onSimToMyPick]);

  const toggleSort = useCallback((key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(-1); }
  }, [sortKey]);

  const draftAdvancedFields = useMemo(() => allFilters.filter((field) => {
    if (field.category === "bio") return !["contractAmount", "contractExp"].includes(field.key);
    if (field.category === "stats") return ["passing", "rushing", "receiving", "defense"].includes(field.statGroup ?? "");
    return true;
  }), []);

  const sortedProspects = useMemo(() => {
    const filtered = filterDraftProspectsForView(prospects, { filterPos, nameFilter, advancedFilters });
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * ((bv ?? 0) - (av ?? 0));
    });
    if (sortKey === "boardRank" && manualBoard.length) {
      const orderMap = new Map(manualBoard.map((id, idx) => [String(id), idx + 1]));
      list.sort((a, b) => ((orderMap.get(String(a.id)) ?? 999) - (orderMap.get(String(b.id)) ?? 999)) * (sortDir === -1 ? 1 : -1));
    }
    return list;
  }, [prospects, filterPos, nameFilter, sortKey, sortDir, advancedFilters, manualBoard]);

  const { compareIds, setCompareIds, showComparison, setShowComparison, toggleCompare, comparePlayerA, comparePlayerB } = usePlayerCompare(sortedProspects, 2);

  const posOptions = useMemo(() => [...new Set(prospects.map((p) => p.pos))].sort(), [prospects]);

  const pickOrder = useMemo(
    () => buildPickOrder(league?.teams ?? [], 7, league?.userTeamId),
    [league?.teams, league?.userTeamId],
  );

  const topProspectByPos = useMemo(() => {
    const map = new Map();
    sortedByOvr.forEach((prospect) => {
      if (!map.has(prospect.pos)) map.set(prospect.pos, String(prospect.id));
    });
    return map;
  }, [sortedByOvr]);

  const userPickCountsByRound = useMemo(() => {
    const counts = new Map();
    completedPicks.forEach((pk) => {
      if (pk.teamId !== (league?.userTeamId)) return;
      counts.set(pk.round, (counts.get(pk.round) ?? 0) + 1);
    });
    return counts;
  }, [completedPicks, league?.userTeamId]);

  return {
    sortKey, setSortKey, sortDir, setSortDir, toggleSort,
    filterPos, setFilterPos,
    nameFilter, setNameFilter,
    advancedFilters, setAdvancedFilters,
    showAdvancedFilters, setShowAdvancedFilters,
    showTradeUp, setShowTradeUp,
    showTradeDown, setShowTradeDown,
    tradeDownProcessing, setTradeDownProcessing,
    manualBoard, setManualBoard,
    pickClock,
    userAutoPick, setUserAutoPick,
    draftPhase,
    pickFlash,
    activeRound, setActiveRound,
    currentPick, isUserPick, isDraftComplete,
    prospects, completedPicks, upcomingPicks,
    pendingTradeProposal, recommendedPick,
    sortedByOvr, sortedProspects,
    compareIds, setCompareIds, showComparison, setShowComparison,
    toggleCompare, comparePlayerA, comparePlayerB,
    posOptions, pickOrder, topProspectByPos, userPickCountsByRound,
    draftAdvancedFields,
  };
}

export default useDraftBoard;
