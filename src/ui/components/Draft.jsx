/**
 * Draft.jsx
 *
 * Offseason NFL Draft interface.  Follows the ZenGM data-dense aesthetic:
 * sortable/filterable prospects table, live pick order panel, and inline
 * action buttons for user picks.
 *
 * Lifecycle:
 *  1. On mount — fetches current draft state (may be "not started yet").
 *  2. Pre-draft  — "Advance Offseason" (progression/retirements) → "Start Draft".
 *  3. AI on clock — "Sim to My Pick" auto-advances all AI picks.
 *  4. User on clock — prospect rows show a "Draft" button.
 *  5. Draft complete — summary + "Start New Season" button.
 *
 * Receives { league, actions } from LeagueDashboard (same shape as other tabs).
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import TraitBadge from "./TraitBadge";
import PlayerProfile from "./PlayerProfile";
import PlayerPreview from "./PlayerPreview";

// ── Helpers ────────────────────────────────────────────────────────────────────

const POSITIONS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "CB",
  "S",
  "K",
  "P",
];

function ovrColor(ovr) {
  if (ovr >= 85) return "var(--success)";
  if (ovr >= 75) return "var(--accent)";
  if (ovr >= 65) return "var(--warning)";
  return "var(--danger)";
}

// ── Draft Pick Grade Logic ────────────────────────────────────────────────────

/**
 * Grade a draft pick based on player OVR vs. expected OVR for draft position.
 * Higher picks should yield higher OVR players; picking a stud late = great grade.
 */
function calculatePickGrade(playerOvr, overallPick, totalPicks) {
  // Expected OVR curve: early picks ~80, late picks ~60
  const positionPct = overallPick / totalPicks;
  const expectedOvr = 82 - positionPct * 25; // 82 for #1, ~57 for last pick
  const diff = playerOvr - expectedOvr;

  if (diff >= 15) return { grade: "A+", color: "#34C759", emoji: "" };
  if (diff >= 10) return { grade: "A", color: "#34C759", emoji: "" };
  if (diff >= 5) return { grade: "B+", color: "#30D158", emoji: "" };
  if (diff >= 0) return { grade: "B", color: "#0A84FF", emoji: "" };
  if (diff >= -5) return { grade: "C+", color: "#FF9F0A", emoji: "" };
  if (diff >= -10) return { grade: "C", color: "#FF9F0A", emoji: "" };
  if (diff >= -15) return { grade: "D", color: "#FF453A", emoji: "" };
  return { grade: "F", color: "#FF453A", emoji: "" };
}

// ── Pick Grade Modal ──────────────────────────────────────────────────────────

function PickGradeModal({ pick, grade, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!pick || !grade) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "pickGradeFadeIn 0.3s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          textAlign: "center",
          minWidth: 280,
          border: `2px solid ${grade.color}`,
          boxShadow: `0 0 40px ${grade.color}44`,
          animation: "pickGradeScale 0.4s ease-out",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: "var(--space-2)" }}>
          {grade.emoji}
        </div>
        <div
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 900,
            color: grade.color,
            marginBottom: "var(--space-2)",
            letterSpacing: "2px",
          }}
        >
          GRADE: {grade.grade}
        </div>
        <div
          style={{
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "var(--space-1)",
          }}
        >
          {pick.playerName}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          {pick.playerPos} · OVR {pick.playerOvr} · Pick #{pick.overall}
        </div>
      </div>
      <style>{`
        @keyframes pickGradeFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pickGradeScale { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ── Draft Ticker ──────────────────────────────────────────────────────────────

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

// ── Trade Up Modal ────────────────────────────────────────────────────────────

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
          <button
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
          </button>
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
              <button
                key={r}
                className="btn"
                style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                onClick={() => addPick(r)}
              >
                + R{r}
              </button>
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
                  {pk.year} R{pk.round}
                  <button
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
                  </button>
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
                  <input
                    type="checkbox"
                    checked={offering.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    style={{
                      accentColor: "var(--accent)",
                      width: 12,
                      height: 12,
                    }}
                  />
                  <span
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
                  </span>
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
        <button
          className="btn btn-primary"
          onClick={handlePropose}
          disabled={!hasSelection || loading}
          style={{ width: "100%", fontWeight: 700 }}
        >
          {loading ? "Evaluating..." : "Propose Trade"}
        </button>
      </div>
    </div>
  );
}

function OvrBadge({ ovr }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 32,
        padding: "2px 4px",
        borderRadius: "var(--radius-pill)",
        background: `${ovrColor(ovr)}22`,
        color: ovrColor(ovr),
        fontWeight: 700,
        fontSize: "var(--text-xs)",
        textAlign: "center",
        border: `1px solid ${ovrColor(ovr)}55`,
      }}
    >
      {ovr}
    </span>
  );
}

function SortIcon({ active, dir }) {
  if (!active)
    return (
      <span style={{ color: "var(--text-subtle)", marginLeft: 3 }}>⇅</span>
    );
  return (
    <span style={{ color: "var(--accent)", marginLeft: 3 }}>
      {dir > 0 ? "↑" : "↓"}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PreDraftPanel({ league, actions, onDraftStarted }) {
  const [progressing, setProgressing] = useState(false);
  const [progressResult, setProgressResult] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const progressionDone = league?.offseasonProgressionDone ?? false;

  const handleProgression = async () => {
    setProgressing(true);
    setError(null);
    try {
      const res = await actions.advanceOffseason();
      setProgressResult(res?.payload ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgressing(false);
    }
  };

  const handleStartDraft = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await actions.startDraft();
      if (res?.payload && !res.payload.notStarted) {
        onDraftStarted(res.payload);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 800,
          color: "var(--text)",
          marginBottom: "var(--space-6)",
        }}
      >
        Offseason Operations
      </h2>

      {error && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "rgba(255,69,58,0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-md)",
            color: "var(--danger)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
          }}
        >
          {error}
        </div>
      )}

      {/* Step 1: Player Progression */}
      <div
        className="card"
        style={{ marginBottom: "var(--space-5)", padding: "var(--space-5)" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-4)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: progressionDone
                    ? "var(--success)"
                    : "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {progressionDone ? "✓" : "1"}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                }}
              >
                Player Progression &amp; Retirements
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                margin: 0,
                paddingLeft: 36,
              }}
            >
              Age every player by one year. Young players (&lt;26) develop;
              veterans (30+) decline. Players 34+ have a chance to retire.
            </p>
            {progressResult && (
              <div style={{ paddingLeft: 36, marginTop: "var(--space-3)" }}>
                <p
                  style={{
                    color: "var(--success)",
                    fontSize: "var(--text-xs)",
                    margin: 0,
                  }}
                >
                  {progressResult.message}
                </p>
                {progressResult.retired?.length > 0 && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      maxHeight: 100,
                      overflowY: "auto",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {progressResult.retired.map((r) => (
                      <span key={r.id} style={{ marginRight: 8 }}>
                        {r.name} ({r.pos}, Age {r.age})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="btn"
            disabled={progressing || progressionDone}
            onClick={handleProgression}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {progressing
              ? "Processing…"
              : progressionDone
                ? "Completed"
                : "Run Progression"}
          </button>
        </div>
      </div>

      {/* Step 2: Start Draft */}
      <div
        className="card"
        style={{
          padding: "var(--space-5)",
          opacity: progressionDone ? 1 : 0.55,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-4)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-2)",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                }}
              >
                NFL Draft
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                margin: 0,
                paddingLeft: 36,
              }}
            >
              Generate a draft class of rookies (Age 21). Worst record picks
              first; Super Bowl winner picks last. 5 rounds.
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={!progressionDone || starting}
            onClick={handleStartDraft}
            style={{ flexShrink: 0, minWidth: 120 }}
          >
            {starting ? "Starting…" : "Start Draft"}
          </button>
        </div>
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
}) {
  const [sortKey, setSortKey] = useState("ovr");
  const [sortDir, setSortDir] = useState(-1); // -1 = descending
  const [filterPos, setFilterPos] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [showTradeUp, setShowTradeUp] = useState(false);
  const [showTradeDown, setShowTradeDown] = useState(false);
  const [tradeDownProcessing, setTradeDownProcessing] = useState(false);

  const {
    currentPick,
    isUserPick,
    isDraftComplete,
    prospects = [],
    completedPicks = [],
    upcomingPicks = [],
    pendingTradeProposal = null,
  } = draftState;

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const sortedProspects = useMemo(() => {
    let list = [...prospects];
    if (filterPos) list = list.filter((p) => p.pos === filterPos);
    if (nameFilter)
      list = list.filter((p) =>
        p.name.toLowerCase().includes(nameFilter.toLowerCase()),
      );
    list.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * ((bv ?? 0) - (av ?? 0));
    });
    return list;
  }, [prospects, filterPos, nameFilter, sortKey, sortDir]);

  const posOptions = useMemo(
    () => [...new Set(prospects.map((p) => p.pos))].sort(),
    [prospects],
  );

  return (
    <div>
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

      <div
        className="draft-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: "var(--space-5)",
          alignItems: "start",
        }}
      >
        {/* ── Left Panel: Draft Board ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {/* Current pick clock */}
          <div
            className="card"
            style={{ padding: "var(--space-4)", overflow: "hidden" }}
          >
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
                  }}
                >
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
              </>
            )}
          </div>

          {/* Sim button (only when AI is picking) */}
          {!isDraftComplete && !isUserPick && (
            <button
              className="btn btn-primary"
              disabled={simming}
              onClick={onSimToMyPick}
              style={{ width: "100%" }}
            >
              {simming ? "Simulating…" : "Sim to My Pick"}
            </button>
          )}

          {/* Trade for this Pick button (only when AI is picking and we have actions) */}
          {!isDraftComplete && !isUserPick && actions && (
            <button
              className="btn"
              onClick={() => setShowTradeUp(true)}
              disabled={simming}
              style={{
                width: "100%",
                fontSize: "var(--text-xs)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                fontWeight: 700,
              }}
            >
              Trade for Pick #{currentPick?.overall}
            </button>
          )}

          {/* Upcoming order */}
          {!isDraftComplete && upcomingPicks.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--surface-strong)",
                  borderBottom: "1px solid var(--hairline)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                Pick Order
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
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
                      R{pk.round}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently completed (last 10) */}
          {completedPicks.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--surface-strong)",
                  borderBottom: "1px solid var(--hairline)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                }}
              >
                Recent Picks
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {[...completedPicks]
                  .reverse()
                  .slice(0, 10)
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
                        #{pk.overall} {pk.teamAbbr}
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
              </div>
            </div>
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
                <button
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
                </button>
              )}
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
                <button
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
                </button>
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
                <button
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
                </button>
                <button
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
                </button>
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
            <input
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

          {/* Prospects table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table
                className="standings-table"
                style={{ width: "100%", fontSize: "var(--text-sm)" }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        width: 36,
                        textAlign: "center",
                        paddingLeft: "var(--space-3)",
                      }}
                    >
                      #
                    </th>
                    {[
                      { key: "pos", label: "POS" },
                      { key: "name", label: "NAME" },
                      { key: "traits", label: "TRAITS" },
                      { key: "age", label: "AGE" },
                      { key: "ovr", label: "OVR" },
                      { key: "potential", label: "POT" },
                      { key: "college", label: "COLLEGE" },
                    ].map((col) => (
                      <th
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
                      </th>
                    ))}
                    {isUserPick && !isDraftComplete && (
                      <th
                        style={{
                          textAlign: "right",
                          paddingRight: "var(--space-4)",
                        }}
                      >
                        ACTION
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedProspects.length === 0 && (
                    <tr>
                      <td
                        colSpan={isUserPick ? 8 : 7}
                        style={{
                          textAlign: "center",
                          padding: "var(--space-6)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {isDraftComplete
                          ? "All prospects have been drafted."
                          : "No prospects match the filter."}
                      </td>
                    </tr>
                  )}
                  {sortedProspects.map((p, i) => (
                    <tr key={p.id}>
                      <td
                        style={{
                          textAlign: "center",
                          color: "var(--text-subtle)",
                          paddingLeft: "var(--space-3)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: "var(--radius-pill)",
                            background: "var(--surface-strong)",
                            fontSize: "var(--text-xs)",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {p.pos}
                        </span>
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--text)",
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
                              borderBottom: onPlayerClick
                                ? "1px dotted var(--text-muted)"
                                : "none",
                            }}
                          >
                            {p.name}
                          </span>
                        </PlayerPreview>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {(p.traits || []).map((t) => (
                          <TraitBadge key={t} traitId={t} />
                        ))}
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>{p.age}</td>
                      <td>
                        <OvrBadge ovr={p.ovr} />
                      </td>
                      <td
                        style={{
                          color: "var(--text-subtle)",
                          fontSize: "var(--text-xs)",
                        }}
                      >
                        {p.potential ?? "—"}
                      </td>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "var(--text-xs)",
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.college ?? "—"}
                      </td>
                      {isUserPick && !isDraftComplete && (
                        <td
                          style={{
                            textAlign: "right",
                            paddingRight: "var(--space-3)",
                          }}
                        >
                          <button
                            className="btn btn-primary"
                            style={{
                              padding: "3px 12px",
                              fontSize: "var(--text-xs)",
                            }}
                            onClick={() => onDraftPlayer(p.id)}
                          >
                            Draft
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftCompletePanel({ actions, draftState }) {
  const { completedPicks = [], totalPicks = 0 } = draftState;
  const userPicks = completedPicks.filter((pk) => pk.isUser);

  return (
    <div>
      <div
        style={{
          textAlign: "center",
          padding: "var(--space-8) 0",
          borderBottom: "1px solid var(--hairline)",
          marginBottom: "var(--space-6)",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>
          🏈
        </div>
        <h2
          style={{
            fontWeight: 800,
            fontSize: "var(--text-xl)",
            color: "var(--text)",
            marginBottom: "var(--space-2)",
          }}
        >
          Draft Complete
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-5)",
          }}
        >
          {totalPicks} picks made. Your team added {userPicks.length} new player
          {userPicks.length !== 1 ? "s" : ""}.
        </p>
        <button
          className="btn btn-primary"
          style={{ fontSize: "var(--text-base)" }}
          onClick={() => actions.startNewSeason()}
        >
          Start New Season →
        </button>
      </div>

      {/* Full pick history */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            background: "var(--surface-strong)",
            borderBottom: "1px solid var(--hairline)",
            fontWeight: 700,
            fontSize: "var(--text-xs)",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "var(--text-muted)",
          }}
        >
          All Picks
        </div>
        <div
          className="table-wrapper"
          style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}
        >
          <table
            className="standings-table"
            style={{ width: "100%", fontSize: "var(--text-sm)" }}
          >
            <thead>
              <tr>
                <th style={{ paddingLeft: "var(--space-4)" }}>#</th>
                <th>Round</th>
                <th>Team</th>
                <th>Player</th>
                <th>POS</th>
                <th style={{ paddingRight: "var(--space-4)" }}>OVR</th>
              </tr>
            </thead>
            <tbody>
              {completedPicks.map((pk) => (
                <tr key={pk.overall} className={pk.isUser ? "selected" : ""}>
                  <td
                    style={{
                      paddingLeft: "var(--space-4)",
                      color: "var(--text-subtle)",
                      fontWeight: 700,
                    }}
                  >
                    {pk.overall}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>R{pk.round}</td>
                  <td
                    style={{
                      fontWeight: pk.isUser ? 700 : 400,
                      color: pk.isUser ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {pk.teamAbbr}
                    {pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{pk.playerName ?? "—"}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {pk.playerPos ?? "—"}
                  </td>
                  <td style={{ paddingRight: "var(--space-4)" }}>
                    {pk.playerOvr != null ? (
                      <OvrBadge ovr={pk.playerOvr} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function Draft({ league, actions }) {
  const [draftState, setDraftState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [simming, setSimming] = useState(false);
  const [profilePlayerId, setProfilePlayerId] = useState(null);
  const [pickGrade, setPickGrade] = useState(null); // { pick, grade }

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
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await actions.getDraftState();
        if (!cancelled && res?.payload) {
          setDraftState(res.payload.notStarted ? null : res.payload);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actions]);

  const handleDraftStarted = useCallback((state) => {
    setDraftState(state);
  }, []);

  const handleSimToMyPick = useCallback(async () => {
    setSimming(true);
    setError(null);
    try {
      const res = await actions.simDraftPick();
      if (res?.payload) setDraftState(res.payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimming(false);
    }
  }, [actions]);

  const handleDraftPlayer = useCallback(
    async (playerId) => {
      setError(null);
      try {
        const res = await actions.makeDraftPick(playerId);
        if (res?.payload) {
          setDraftState(res.payload);

          // Show pick grade for the user's pick
          const picks = res.payload.completedPicks ?? [];
          const lastUserPick = [...picks]
            .reverse()
            .find(
              (pk) => pk.teamId === league?.userTeamId && pk.playerOvr != null,
            );
          if (lastUserPick) {
            const grade = calculatePickGrade(
              lastUserPick.playerOvr,
              lastUserPick.overall,
              res.payload.totalPicks ?? 160,
            );
            setPickGrade({ pick: lastUserPick, grade });
          }
        }
      } catch (err) {
        setError(err.message);
      }
    },
    [actions, league?.userTeamId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-6)",
        }}
      >
        <div>
          <h1
            style={{
              fontWeight: 800,
              fontSize: "var(--text-xl)",
              color: "var(--text)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            NFL Draft
          </h1>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {league?.year ?? ""} Season · Offseason
          </div>
        </div>
        {draftState &&
          !draftState.notStarted &&
          !draftState.isDraftComplete && (
            <div
              style={{
                padding: "4px 12px",
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-pill)",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
              }}
            >
              {draftState.currentPickIndex ?? 0} / {draftState.totalPicks ?? 0}{" "}
              picks made
            </div>
          )}
      </div>

      {/* Global error notice */}
      {error && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "rgba(255,69,58,0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-md)",
            color: "var(--danger)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            className="btn"
            style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-10)",
            color: "var(--text-muted)",
          }}
        >
          Loading draft data…
        </div>
      )}

      {/* Pre-draft: no draft started yet */}
      {!loading && !draftState && (
        <PreDraftPanel
          league={league}
          actions={actions}
          onDraftStarted={handleDraftStarted}
        />
      )}

      {/* Draft board: draft in progress */}
      {!loading && draftState && !draftState.isDraftComplete && (
        <DraftBoard
          draftState={enrichedDraftState}
          userTeamId={league?.userTeamId}
          onSimToMyPick={handleSimToMyPick}
          onDraftPlayer={handleDraftPlayer}
          onPlayerClick={setProfilePlayerId}
          simming={simming}
          league={league}
          actions={actions}
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
      {!loading && draftState && draftState.isDraftComplete && (
        <DraftCompletePanel actions={actions} draftState={enrichedDraftState} />
      )}

      {/* Player profile modal — opened by clicking a prospect's name */}
      {profilePlayerId && (
        <PlayerProfile
          playerId={profilePlayerId}
          onClose={() => setProfilePlayerId(null)}
          actions={actions}
          isUserOnClock={
            enrichedDraftState?.isUserPick &&
            !enrichedDraftState?.isDraftComplete
          }
          onDraftPlayer={(pid) => {
            handleDraftPlayer(pid);
            setProfilePlayerId(null);
          }}
        />
      )}
    </div>
  );
}
