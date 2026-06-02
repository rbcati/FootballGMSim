import React, { useState, useEffect, useMemo, useCallback } from "react";
import TraitBadge from "../components/TraitBadge";
import PlayerPreview from "../components/PlayerPreview";
import AdvancedPlayerSearch from "../components/AdvancedPlayerSearch.jsx";
import PlayerComparison from "../components/PlayerComparison.jsx";
import PlayerCompareTray from "../components/PlayerCompareTray.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { applyAdvancedPlayerFilters, allFilters } from "../../core/footballAdvancedFilters";
import { usePlayerCompare } from "../utils/playerCompare.js";
import { POS_COLORS } from "../constants/positionColors.js";
import { ScoutBadge, ProspectScoutingChips } from "./ScoutBadge.jsx";
import { OvrBadge, SortIcon } from "./DraftBadges.jsx";
import { DRAFT_ROOM_PHASES, formatClock, buildPickOrder, ovrColor, filterDraftProspectsForView } from "./draftShared.js";

function DraftTicker({ completedPicks }) {
  const lastPicks = useMemo(
    () => [...completedPicks].reverse().slice(0, 5),
    [completedPicks],
  );

  if (lastPicks.length === 0) return null;

  return (
    <div
      className="draft-ticker"
      style={{
        background: "var(--surface-strong)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-2) var(--space-3)",
        marginBottom: "var(--space-4)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "1px",
            flexShrink: 0,
            marginRight: "var(--space-2)",
          }}
        >
          LATEST
        </span>
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            overflowX: "auto",
            whiteSpace: "nowrap",
            flex: 1,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {lastPicks.map((pk) => (
            <span
              key={pk.overall}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--text-xs)",
                color: "var(--text)",
                animation: "tickerSlideIn 0.4s ease-out",
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  fontSize: 10,
                  minWidth: 18,
                }}
              >
                #{pk.overall}
              </span>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                {pk.teamAbbr}
              </span>
              <span style={{ color: "var(--text-muted)" }}>{pk.playerPos}</span>
              <span style={{ fontWeight: 600 }}>{pk.playerName}</span>
              <span
                style={{
                  padding: "0 4px",
                  borderRadius: "var(--radius-pill)",
                  background: `${ovrColor(pk.playerOvr ?? 0)}22`,
                  color: ovrColor(pk.playerOvr ?? 0),
                  fontWeight: 700,
                  fontSize: 10,
                }}
              >
                {pk.playerOvr}
              </span>
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes tickerSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}

function TradeUpModal({
  currentPick,
  league,
  actions,
  onClose,
  onTradeComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [myRoster, setMyRoster] = useState([]);
  const [offering, setOffering] = useState(new Set());
  const [myPicks, setMyPicks] = useState([]);
  const [result, setResult] = useState(null);

  const targetTeamId = currentPick?.teamId;
  const userTeamId = league?.userTeamId;

  // Fetch user roster on open
  useEffect(() => {
    if (!actions?.getRoster || userTeamId == null) return;
    (async () => {
      setLoading(true);
      try {
        const res = await actions.getRoster(userTeamId);
        if (res?.payload) setMyRoster(res.payload.players ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [actions, userTeamId]);

  const togglePlayer = (id) => {
    setOffering((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const addPick = (round) => {
    setMyPicks((prev) => [
      ...prev,
      {
        id: `up_${round}_${Date.now()}`,
        round,
        year: (league?.year ?? 2025) + 1,
      },
    ]);
  };

  const removePick = (id) => {
    setMyPicks((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePropose = async () => {
    if (targetTeamId == null || (offering.size === 0 && myPicks.length === 0))
      return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await actions.submitTrade(
        userTeamId,
        targetTeamId,
        { playerIds: [...offering], pickIds: myPicks.map((p) => p.id) },
        { playerIds: [], pickIds: [] },
      );
      if (resp?.payload) {
        setResult(resp.payload);
        if (resp.payload.accepted) {
          setTimeout(() => {
            onTradeComplete?.();
            onClose();
          }, 1500);
        }
      }
    } catch (e) {
      setResult({ accepted: false, reason: "Error: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  const hasSelection = offering.size > 0 || myPicks.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-5)",
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "var(--text-lg)",
                color: "var(--text)",
              }}
            >
              Trade for Pick #{currentPick?.overall}
            </div>
            <div
              style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
            >
              Currently owned by {currentPick?.teamAbbr} · Round{" "}
              {currentPick?.round}
            </div>
          </div>
          <Button
            className="btn"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            x
          </Button>
        </div>

        {/* Result banner */}
        {result && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${result.accepted ? "var(--success)" : "var(--danger)"}`,
              background: result.accepted
                ? "rgba(52,199,89,0.1)"
                : "rgba(255,69,58,0.1)",
              marginBottom: "var(--space-4)",
              fontWeight: 700,
              fontSize: "var(--text-sm)",
              color: result.accepted ? "var(--success)" : "var(--danger)",
            }}
          >
            {result.accepted
              ? "Trade Accepted! Pick is yours."
              : `Rejected: ${result.reason}`}
          </div>
        )}

        {/* Offer picks */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              color: "var(--text-muted)",
              marginBottom: "var(--space-2)",
              textTransform: "uppercase",
            }}
          >
            Offer Draft Picks
          </div>
          <div
            style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <Button
                key={r}
                className="btn"
                style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                onClick={() => addPick(r)}
              >
                + R{r}
              </Button>
            ))}
          </div>
          {myPicks.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "var(--space-1)",
                flexWrap: "wrap",
                marginTop: "var(--space-2)",
              }}
            >
              {myPicks.map((pk) => (
                <span
                  key={pk.id}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "1px 6px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--accent)22",
                    color: "var(--accent)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {pk.year} R{pk.round}{pk.isCompensatory ? " COMP" : ""}
                  <Button
                    className="btn"
                    onClick={() => removePick(pk.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 11,
                    }}
                  >
                    x
                  </Button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Offer players */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              color: "var(--text-muted)",
              marginBottom: "var(--space-2)",
              textTransform: "uppercase",
            }}
          >
            Offer Players
          </div>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {loading && (
              <div
                style={{
                  padding: "var(--space-3)",
                  color: "var(--text-muted)",
                  textAlign: "center",
                  fontSize: "var(--text-sm)",
                }}
              >
                Loading roster...
              </div>
            )}
            {myRoster
              .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))
              .map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-1) var(--space-2)",
                    borderBottom: "1px solid var(--hairline)",
                    cursor: "pointer",
                    fontSize: "var(--text-xs)",
                    background: offering.has(p.id)
                      ? "var(--accent)11"
                      : "transparent",
                  }}
                >
                  <Input
                    type="checkbox"
                    checked={offering.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    style={{
                      accentColor: "var(--accent)",
                      width: 12,
                      height: 12,
                    }}
                  />
                  <Badge
                    variant="outline"
                    style={{
                      padding: "0 3px",
                      borderRadius: "var(--radius-pill)",
                      background: `${ovrColor(p.ovr)}22`,
                      color: ovrColor(p.ovr),
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    {p.ovr}
                  </Badge>
                  <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                    {p.pos}
                  </span>
                  <span
                    style={{ flex: 1, fontWeight: 600, color: "var(--text)" }}
                  >
                    {p.name}
                  </span>
                </label>
              ))}
          </div>
        </div>

        {/* Propose */}
        <Button
          className="btn btn-primary"
          onClick={handlePropose}
          disabled={!hasSelection || loading}
          style={{ width: "100%", fontWeight: 700 }}
        >
          {loading ? "Evaluating..." : "Propose Trade"}
        </Button>
      </div>
    </div>
  );
}

function DraftBoard({
  draftState,
  userTeamId,
  onSimToMyPick,
  onDraftPlayer,
  onPlayerClick,
  simming,
  league,
  actions,
  disabled = false,
}) {
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState(-1); // -1 = descending
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
  } = draftState;

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
    if (isDraftComplete) {
      setDraftPhase(DRAFT_ROOM_PHASES.DRAFT_COMPLETE);
      return;
    }
    if (!currentPick) {
      setDraftPhase(DRAFT_ROOM_PHASES.PRE_DRAFT);
      return;
    }
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
      try {
        await onSimToMyPick();
      } finally {
        setCpuPending(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      setCpuPending(false);
    };
  }, [draftPhase, isUserPick, isDraftComplete, cpuPending, onSimToMyPick]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const draftAdvancedFields = useMemo(() => allFilters.filter((field) => {
    if (field.category === 'bio') {
      return !['contractAmount', 'contractExp'].includes(field.key);
    }
    if (field.category === 'stats') {
      return ['passing', 'rushing', 'receiving', 'defense'].includes(field.statGroup ?? '');
    }
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
    if (sortKey === 'boardRank' && manualBoard.length) {
      const orderMap = new Map(manualBoard.map((id, idx) => [String(id), idx + 1]));
      list.sort((a, b) => ((orderMap.get(String(a.id)) ?? 999) - (orderMap.get(String(b.id)) ?? 999)) * (sortDir === -1 ? 1 : -1));
    }
    return list;
  }, [prospects, filterPos, nameFilter, sortKey, sortDir, advancedFilters, manualBoard]);

  const {
    compareIds,
    setCompareIds,
    showComparison,
    setShowComparison,
    toggleCompare,
    comparePlayerA,
    comparePlayerB,
  } = usePlayerCompare(sortedProspects, 2);

  const posOptions = useMemo(
    () => [...new Set(prospects.map((p) => p.pos))].sort(),
    [prospects],
  );
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
      if (pk.teamId !== userTeamId) return;
      counts.set(pk.round, (counts.get(pk.round) ?? 0) + 1);
    });
    return counts;
  }, [completedPicks, userTeamId]);

  return (
    <div>
      {/* ── War Room Banner ── */}
      {!isDraftComplete && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: isUserPick
              ? "linear-gradient(135deg, #0f0c29 0%, #302b63 60%, #24243e 100%)"
              : "var(--surface-strong)",
            border: `1px solid ${isUserPick ? "var(--accent)" : "var(--hairline)"}`,
            padding: "var(--space-3) var(--space-5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: isUserPick ? "var(--accent)" : "var(--text-muted)",
                marginBottom: 2,
              }}
            >
              {isUserPick ? "★ You Are On The Clock" : "War Room — AI Picking"}
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "var(--text-lg)",
                color: "var(--text)",
              }}
            >
              {currentPick?.teamName ?? "—"}
              <span
                style={{
                  marginLeft: 10,
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                Round {currentPick?.round} · Pick #{currentPick?.overall}
              </span>
            </div>
          </div>
          {/* Position colour legend */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {Object.entries(POS_COLORS).filter(([pos]) => !["default", "DB", "CB", "S"].includes(pos)).map(([pos, color]) => (
              <span
                key={pos}
                style={{
                  padding: "1px 6px",
                  borderRadius: "var(--radius-pill)",
                  background: `${color}22`,
                  color,
                  fontSize: 10,
                  fontWeight: 700,
                  border: `1px solid ${color}44`,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {pos}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Draft Ticker — last 5 picks ── */}
      <DraftTicker completedPicks={completedPicks} />

      {/* ── Trade Up Modal ── */}
      {showTradeUp && currentPick && !isUserPick && !isDraftComplete && (
        <TradeUpModal
          currentPick={currentPick}
          league={league}
          actions={actions}
          onClose={() => setShowTradeUp(false)}
          onTradeComplete={() => onSimToMyPick()}
        />
      )}
      {pickOrder.length === 0 && (
        <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "rgba(255,69,58,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "var(--text-sm)" }}>
          Draft cannot start — no teams found.
        </div>
      )}

      <div
        className="draft-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)",
          gap: "var(--space-5)",
          alignItems: "start",
        }}
      >
        <style>{`
          @media (max-width: 900px) {
            .draft-layout {
              grid-template-columns: minmax(0, 1fr);
            }
          }
        `}</style>
        {/* ── Left Panel: Draft Board ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {/* Current pick clock */}
          <Card className="card-premium" style={{ overflow: "hidden" }}>
          <CardContent style={{ padding: "var(--space-4)" }}>
            {isDraftComplete ? (
              <div style={{ textAlign: "center", padding: "var(--space-3)" }}>
                <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>🏈</div>
                <div style={{ fontWeight: 800, color: "var(--success)" }}>
                  Draft Complete
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  On the Clock
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "var(--text-xl)",
                    color: "var(--text)",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface-strong)", border: "1px solid var(--hairline)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                    {currentPick?.teamAbbr?.slice(0, 2) ?? "TM"}
                  </span>
                  {currentPick?.teamAbbr ?? "???"}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  {currentPick?.teamName ?? "—"}
                </div>
                <div
                  style={{
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    background: isUserPick
                      ? "var(--accent)22"
                      : "var(--surface-strong)",
                    border: `1px solid ${isUserPick ? "var(--accent)" : "var(--hairline)"}`,
                    color: isUserPick ? "var(--accent)" : "var(--text-muted)",
                    fontWeight: 700,
                    fontSize: "var(--text-xs)",
                    display: "inline-block",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  {isUserPick ? "★ YOUR PICK" : "AI PICKING"}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Round {currentPick?.round}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    Overall #{currentPick?.overall}
                  </span>
                </div>
                {draftPhase === DRAFT_ROOM_PHASES.ON_THE_CLOCK && (
                  <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                    Clock: {formatClock(pickClock)}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700 }}>
                  Phase: {draftPhase.replaceAll("_", " ")}
                </div>
                {currentPick?.isCompensatory && (
                  <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                    Compensatory pick · {currentPick?.compensatoryForName ? `for loss of ${currentPick.compensatoryForName}` : "NFL comp selection"}
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={userAutoPick}
                    onChange={(e) => setUserAutoPick(e.target.checked)}
                  />
                  Enable Auto-Pick (BPA)
                </label>
              </>
            )}
          </CardContent>
          </Card>

          {/* Sim button (only when AI is picking) */}
          {!isDraftComplete && !isUserPick && (
            <Button
              className="btn btn-primary"
              disabled={simming || disabled}
              onClick={onSimToMyPick}
              style={{ width: "100%" }}
            >
              {simming ? "Simulating…" : "Sim to My Pick"}
            </Button>
          )}

          {/* Trade for this Pick button (only when AI is picking and we have actions) */}
          {!isDraftComplete && !isUserPick && actions && (
            <Button
              className="btn"
              onClick={() => setShowTradeUp(true)}
              disabled={simming || disabled}
              style={{
                width: "100%",
                fontSize: "var(--text-xs)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                fontWeight: 700,
              }}
            >
              Trade for Pick #{currentPick?.overall}
            </Button>
          )}

          {/* Upcoming order */}
          {!isDraftComplete && upcomingPicks.length > 0 && (
            <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader style={{ padding: "var(--space-2) var(--space-3)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
                <CardTitle style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
                  Pick Order
                </CardTitle>
              </CardHeader>
              <CardContent style={{ padding: 0 }}>
              <ScrollArea style={{ maxHeight: 320 }}>
                {upcomingPicks.map((pk, i) => (
                  <div
                    key={pk.overall}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-2) var(--space-3)",
                      borderBottom: "1px solid var(--hairline)",
                      background:
                        i === 0
                          ? pk.isUser
                            ? "var(--accent)11"
                            : "var(--surface-strong)"
                          : "transparent",
                      fontWeight: i === 0 ? 700 : 400,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 24,
                        textAlign: "center",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-subtle)",
                      }}
                    >
                      {pk.overall}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "var(--text-xs)",
                        color: pk.isUser ? "var(--accent)" : "var(--text)",
                        fontWeight: pk.isUser ? 700 : 400,
                      }}
                    >
                      {pk.teamAbbr}
                      {pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-subtle)",
                      }}
                    >
                      R{pk.round}{pk.isCompensatory ? " · COMP" : ""}
                    </span>
                  </div>
                ))}
              </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Recently completed (last 8) */}
          {completedPicks.length > 0 && (
            <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader style={{ padding: "var(--space-2) var(--space-3)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
                <CardTitle style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
                  Recent Picks
                </CardTitle>
              </CardHeader>
              <CardContent style={{ padding: 0 }}>
              <ScrollArea style={{ maxHeight: 240 }}>
                {[...completedPicks]
                  .reverse()
                  .filter((pk) => Number(pk.round) === Number(activeRound))
                  .slice(0, 8)
                  .map((pk) => (
                    <div
                      key={pk.overall}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        borderBottom: "1px solid var(--hairline)",
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      <div
                        style={{ color: "var(--text-muted)", marginBottom: 1 }}
                      >
                        #{pk.overall} {pk.teamAbbr}{pk.isCompensatory ? " · COMP" : ""}
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>
                        {pk.playerName}
                        <span
                          style={{ marginLeft: 6, color: "var(--text-subtle)" }}
                        >
                          {pk.playerPos} · <OvrBadge ovr={pk.playerOvr ?? 0} />
                        </span>
                      </div>
                    </div>
                  ))}
              </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Main Panel: Prospects Table ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {/* User pick banner */}
          {isUserPick && !isDraftComplete && (
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                background: "var(--accent)18",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-md)",
                fontWeight: 700,
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>★</span>
              <span style={{ flex: 1 }}>
                You're on the clock! Round {currentPick?.round}, Pick #
                {currentPick?.overall} — select a prospect below.
              </span>
              {pendingTradeProposal && (
                <Button
                  className="btn"
                  onClick={() => setShowTradeDown(true)}
                  style={{
                    flexShrink: 0,
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                    border: "1px solid var(--warning, #FF9F0A)",
                    color: "var(--warning, #FF9F0A)",
                    background: "rgba(255,159,10,0.12)",
                    padding: "var(--space-1) var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    animation: "pulse 2s infinite",
                  }}
                >
                  Trade Down / View Offers
                </Button>
              )}
            </div>
          )}
          {recommendedPick && !isDraftComplete && (
            <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.45)", color: "var(--text)" }}>
              <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: 1, color: "var(--success)" }}>Recommended pick</div>
              <div style={{ fontWeight: 700 }}>
                #{recommendedPick.rank ?? 1} on your board · {sortedProspects.find((p) => String(p.id) === String(recommendedPick.playerId))?.name ?? "Top option"}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{recommendedPick.reason}</div>
            </div>
          )}

          {/* AI Trade-Up Proposal popup */}
          {isUserPick && !isDraftComplete && pendingTradeProposal && showTradeDown && (
            <div
              style={{
                padding: "var(--space-4)",
                background: "var(--surface-strong)",
                border: "1px solid var(--warning, #FF9F0A)",
                borderRadius: "var(--radius-md)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "var(--space-3)",
                }}
              >
                <div style={{ fontWeight: 800, color: "var(--text)" }}>
                  Trade Offer from {pendingTradeProposal.aiTeamAbbr}
                </div>
                <Button
                  className="btn"
                  onClick={() => setShowTradeDown(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 16,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </Button>
              </div>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                  lineHeight: 1.5,
                }}
              >
                The <strong style={{ color: "var(--text)" }}>{pendingTradeProposal.aiTeamName}</strong> are
                offering to trade up for your pick #{pendingTradeProposal.userPickOverall}.
                They want to draft <strong style={{ color: "var(--text)" }}>
                  {pendingTradeProposal.targetProspect?.name} ({pendingTradeProposal.targetProspect?.pos},{" "}
                  {pendingTradeProposal.targetProspect?.ovr} OVR)
                </strong>.
              </div>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text)",
                  marginBottom: "var(--space-3)",
                  fontWeight: 600,
                }}
              >
                You receive: their pick #{pendingTradeProposal.aiPickOverall} (Round{" "}
                {pendingTradeProposal.aiPickRound}) + a later pick swap in this draft.
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <Button
                  className="btn btn-primary"
                  disabled={tradeDownProcessing}
                  onClick={async () => {
                    setTradeDownProcessing(true);
                    try {
                      const res = await actions.acceptDraftTrade(pendingTradeProposal);
                      if (res?.payload) {
                        setShowTradeDown(false);
                        // After trade, sim to next user pick
                        onSimToMyPick();
                      }
                    } catch (e) {
                      console.error("[Draft] acceptDraftTrade failed:", e);
                    } finally {
                      setTradeDownProcessing(false);
                    }
                  }}
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--text-sm)",
                    padding: "var(--space-2) var(--space-4)",
                  }}
                >
                  {tradeDownProcessing ? "Processing…" : "Accept Trade"}
                </Button>
                <Button
                  className="btn"
                  onClick={async () => {
                    await actions.rejectDraftTrade?.();
                    setShowTradeDown(false);
                  }}
                  style={{
                    fontWeight: 600,
                    fontSize: "var(--text-sm)",
                    padding: "var(--space-2) var(--space-4)",
                  }}
                >
                  Decline
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Input
              type="text"
              placeholder="Search name…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              style={{
                padding: "5px 10px",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "var(--text-sm)",
                width: 180,
              }}
            />
            <select
              value={filterPos}
              onChange={(e) => setFilterPos(e.target.value)}
              style={{
                padding: "5px 10px",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: "var(--text-sm)",
              }}
            >
              <option value="">All Positions</option>
              {posOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                marginLeft: "auto",
              }}
            >
              {sortedProspects.length} prospect
              {sortedProspects.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Button className="btn" onClick={() => setShowAdvancedFilters((v) => !v)} style={{ fontSize: 'var(--text-xs)' }}>
              {showAdvancedFilters ? 'Hide advanced filters' : 'Show advanced filters'}
            </Button>
          </div>
          {showAdvancedFilters && (
            <AdvancedPlayerSearch
              filters={advancedFilters}
              onChange={setAdvancedFilters}
              title="Draft advanced search"
              allowedFields={draftAdvancedFields}
              presetKeys={["youngHighPotential", "day1Starters", "developmentalUpside", "bestAthletes", "valuePicks", "qbUpside", "skillUpside"]}
            />
          )}
          {showComparison && comparePlayerA && comparePlayerB && (
            <PlayerComparison playerA={comparePlayerA} playerB={comparePlayerB} onClose={() => setShowComparison(false)} />
          )}
          <PlayerCompareTray
            compareIds={compareIds}
            resolvePlayer={(id) => sortedProspects.find((p) => p.id === id)}
            onRemove={toggleCompare}
            onOpenCompare={() => setShowComparison(true)}
            onClear={() => setCompareIds([])}
          />

          {/* Prospects table */}
          <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
            <CardContent style={{ padding: 0 }}>
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <Table
                className="standings-table"
                style={{ width: "100%", fontSize: "var(--text-sm)" }}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead
                      style={{
                        width: 36,
                        textAlign: "center",
                        paddingLeft: "var(--space-3)",
                      }}
                    >
                      #
                    </TableHead>
                    {[
                      { key: "boardRank", label: "BOARD" },
                      { key: "pos", label: "POS" },
                      { key: "name", label: "NAME" },
                      { key: "traits", label: "TRAITS" },
                      { key: "age", label: "AGE" },
                      { key: "compare", label: "CMP" },
                      { key: "ovr", label: isDraftComplete ? "OVR" : "GRADE" },
                      { key: "potential", label: isDraftComplete ? "POT" : "???" },
                      { key: "fortyTime", label: "40Y" },
                      { key: "benchPress", label: "BENCH" },
                      { key: "college", label: "COLLEGE" },
                    ].map((col) => (
                      <TableHead
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{
                          cursor: "pointer",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </TableHead>
                    ))}
                    {isUserPick && !isDraftComplete && (
                      <TableHead
                        style={{
                          textAlign: "right",
                          paddingRight: "var(--space-4)",
                        }}
                      >
                        ACTION
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedProspects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isUserPick ? 12 : 11} style={{ padding: 0 }}>
                        <EmptyState
                          icon="🎯"
                          title={isDraftComplete ? "No prospects remain" : "No prospects match"}
                          subtitle={isDraftComplete ? "All prospects have been drafted." : "Adjust your filters to broaden the board."}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {sortedProspects.map((p, i) => (
                    <TableRow
                      key={p.id}
                      style={
                        String(p.id) === String(recommendedPick?.playerId ?? '')
                          ? { background: "rgba(52,199,89,0.1)" }
                          : (topProspectByPos.get(p.pos) === String(p.id)
                            ? { background: "rgba(10,132,255,0.08)" }
                            : undefined)
                      }
                    >
                      <TableCell style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {Math.max(1, manualBoard.indexOf(String(p.id)) + 1)}
                      </TableCell>
                      <TableCell
                        style={{
                          textAlign: "center",
                          color: "var(--text-subtle)",
                          paddingLeft: "var(--space-3)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                        }}
                      >
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: "var(--radius-pill)",
                            background: `${POS_COLORS[p.pos] ?? "#666"}22`,
                            fontSize: "var(--text-xs)",
                            fontWeight: 700,
                            color: POS_COLORS[p.pos] ?? "var(--text-muted)",
                            border: `1px solid ${POS_COLORS[p.pos] ?? "#666"}55`,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {p.pos}
                        </Badge>
                      </TableCell>
                      <TableCell
                        style={{
                          fontWeight: 600,
                          color: onPlayerClick ? "var(--accent)" : "var(--text)",
                          cursor: onPlayerClick ? "pointer" : "default",
                        }}
                        onClick={() => onPlayerClick && onPlayerClick(p.id)}
                        title={
                          onPlayerClick ? `View ${p.name}'s profile` : undefined
                        }
                      >
                        <PlayerPreview player={p}>
                          <span
                            style={{
                              textDecoration: onPlayerClick ? "underline" : "none",
                              textDecorationStyle: "dotted",
                              textUnderlineOffset: 3,
                            }}
                          >
                            {p.name}
                          </span>
                        </PlayerPreview>
                      </TableCell>
                      <TableCell style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {(p.traits || []).map((t) => (
                          <TraitBadge key={t} traitId={t} />
                        ))}
                      </TableCell>
                      <TableCell style={{ color: "var(--text-muted)" }}>{p.age}</TableCell>
                      <TableCell style={{ textAlign: "center" }}><Button title={compareIds.includes(p.id) ? "Remove from compare" : "Add to compare"} onClick={() => toggleCompare(p)} style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: `1.5px solid ${compareIds.includes(p.id) ? "var(--accent)" : "var(--hairline)"}`, background: compareIds.includes(p.id) ? "var(--accent-muted)" : "transparent", fontSize: 12, color: compareIds.includes(p.id) ? "var(--accent)" : "var(--text-subtle)" }}>{compareIds.includes(p.id) ? "✓" : "⊕"}</Button></TableCell>
                      <TableCell>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                          {/* Fog of War: show scout grade before drafted, true OVR after */}
                          {isDraftComplete ? (
                            <OvrBadge ovr={p.ovr} />
                          ) : (
                            <>
                              <ScoutBadge player={p} team={(league?.teams ?? []).find((t) => t.id === league?.userTeamId)} />
                              <ProspectScoutingChips
                                prospect={p}
                                team={(league?.teams ?? []).find((t) => t.id === league?.userTeamId)}
                              />
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        style={{
                          color: "var(--text-subtle)",
                          fontSize: "var(--text-xs)",
                        }}
                      >
                        {/* Hide potential until draft is complete */}
                        {isDraftComplete ? (p.potential ?? "—") : "??"}
                      </TableCell>
                      <TableCell style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title="40-yard dash (seconds). Lower is better.">
                        {p?.combineResults?.fortyTime ?? "—"}
                      </TableCell>
                      <TableCell style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }} title="Bench press reps at 225 lbs. Higher is better.">
                        {p?.combineResults?.benchPress ?? "—"}
                      </TableCell>
                      <TableCell
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "var(--text-xs)",
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.college ?? p.origin ?? "—"}
                      </TableCell>
                      {isUserPick && !isDraftComplete && (
                        <TableCell
                          style={{
                            textAlign: "right",
                            paddingRight: "var(--space-3)",
                          }}
                        >
                          <Button
                            className="btn btn-primary"
                            disabled={!(draftPhase === DRAFT_ROOM_PHASES.ON_THE_CLOCK && isUserPick) || disabled}
                            style={{
                              padding: "3px 12px",
                              fontSize: "var(--text-xs)",
                            }}
                            onClick={() => onDraftPlayer(p.id)}
                          >
                            {disabled ? "Drafting…" : "Draft"}
                          </Button>
                          <div style={{ display: "inline-flex", marginLeft: 8, gap: 4 }}>
                            <Button className="btn" title="Move up board" onClick={() => setManualBoard((prev) => {
                              const next = [...prev];
                              const idx = next.indexOf(String(p.id));
                              if (idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              return next;
                            })} style={{ padding: "2px 6px", fontSize: 10 }}>↑</Button>
                            <Button className="btn" title="Move down board" onClick={() => setManualBoard((prev) => {
                              const next = [...prev];
                              const idx = next.indexOf(String(p.id));
                              if (idx > -1 && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                              return next;
                            })} style={{ padding: "2px 6px", fontSize: 10 }}>↓</Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Card className="card-premium" style={{ marginTop: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 700, marginRight: 6 }}>Round Navigator</span>
            {Array.from({ length: 7 }).map((_, idx) => {
              const round = idx + 1;
              const userPicksInRound = userPickCountsByRound.get(round) ?? 0;
              return (
                <button
                  key={round}
                  className="btn"
                  onClick={() => setActiveRound(round)}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "3px 8px",
                    borderColor: activeRound === round ? "var(--accent)" : "var(--hairline)",
                    color: activeRound === round ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  R{round}: {userPicksInRound > 0 ? "✓" : "—"} {userPicksInRound} pick{userPicksInRound === 1 ? "" : "s"}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Memoized sortable/filterable prospect list (formerly the inline DraftBoard).
const ProspectTable = React.memo(DraftBoard);
export { ProspectTable, DraftBoard };
export default ProspectTable;
