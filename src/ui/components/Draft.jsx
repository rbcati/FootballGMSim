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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getProspectRegionTag, getScoutingConfidenceProfile } from "../utils/franchiseInvestments.js";
import AdvancedPlayerSearch from "./AdvancedPlayerSearch.jsx";
import PlayerComparison from "./PlayerComparison.jsx";
import PlayerCompareTray from "./PlayerCompareTray.jsx";
import { applyAdvancedPlayerFilters, allFilters } from "../../core/footballAdvancedFilters";
import { usePlayerCompare } from "../utils/playerCompare.js";

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

// ── Position colour map ───────────────────────────────────────────────────────
const POS_COLORS = {
  QB:  "#FF6B35",
  RB:  "#34C759",
  WR:  "#0A84FF",
  TE:  "#5E5CE6",
  OL:  "#64D2FF",
  DL:  "#FF453A",
  LB:  "#FF9F0A",
  CB:  "#30D158",
  S:   "#FFD60A",
  K:   "#AEC6CF",
  P:   "#B4A0E5",
};

// ── Scouting Fog of War ───────────────────────────────────────────────────────
// Uses the player id as a stable seed so grades don't change on re-render.
function _seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Returns a stable { grade, gradeColor, range } object for a prospect.
 * scoutAccuracy: 0–1 (1 = perfect info, 0 = pure guesswork).
 */
function getScoutReport(trueOvr, playerId, scoutAccuracy = 0.65) {
  const noise = Math.round((_seededRand(playerId) - 0.5) * 2 * (1 - scoutAccuracy) * 18);
  const scoutedOvr = Math.min(99, Math.max(50, trueOvr + noise));
  const spread = Math.round((1 - scoutAccuracy) * 10);
  const low  = Math.max(50, scoutedOvr - spread);
  const high = Math.min(99, scoutedOvr + spread);

  let grade, gradeColor;
  if (scoutedOvr >= 88)      { grade = "A+"; gradeColor = "#34C759"; }
  else if (scoutedOvr >= 83) { grade = "A";  gradeColor = "#34C759"; }
  else if (scoutedOvr >= 78) { grade = "B+"; gradeColor = "#30D158"; }
  else if (scoutedOvr >= 73) { grade = "B";  gradeColor = "#0A84FF"; }
  else if (scoutedOvr >= 68) { grade = "C+"; gradeColor = "#FF9F0A"; }
  else if (scoutedOvr >= 63) { grade = "C";  gradeColor = "#FF9F0A"; }
  else if (scoutedOvr >= 58) { grade = "D";  gradeColor = "#FF453A"; }
  else                        { grade = "F";  gradeColor = "#FF453A"; }

  return { grade, gradeColor, range: `${low}–${high}` };
}

function ScoutBadge({ player, team }) {
  const profile = getScoutingConfidenceProfile(team, player);
  const accuracy = profile.accuracy;
  const { grade, gradeColor, range } = getScoutReport(player?.ovr, player?.id, accuracy);
  const region = profile.regionTag ?? getProspectRegionTag(player);
  return (
    <span
      title={`Scout range: ${range} OVR · ${profile.confidence} (${Math.round(accuracy * 100)}%) · ${profile.fogBand} · Region ${region} · ${profile.reasons.join(' · ')}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 7px",
        borderRadius: "var(--radius-pill)",
        background: `${gradeColor}22`,
        color: gradeColor,
        fontWeight: 700,
        fontSize: "var(--text-xs)",
        border: `1px solid ${gradeColor}55`,
        cursor: "default",
        letterSpacing: "0.5px",
      }}
    >
      {grade}
    </span>
  );
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

function OvrBadge({ ovr }) {
  return (
    <Badge
      variant="outline"
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
    </Badge>
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

  const phase = league?.phase ?? '';
  // Progression can only run during the 'offseason_resign' / 'offseason' phase.
  // In every other phase it has either already happened (free_agency / draft) or
  // isn't applicable (regular / preseason / playoffs).  Treating it as "done"
  // disables the button and prevents the "Not in offseason phase" error.
  const progressionDone =
    !['offseason_resign', 'offseason'].includes(phase) ||
    (league?.offseasonProgressionDone ?? false);
  // "Start Draft" is only valid once the worker has entered the 'draft' phase.
  const isDraftPhase = phase === 'draft';

  // Guard: show an informational placeholder when we're nowhere near the draft
  if (!['offseason_resign', 'offseason', 'free_agency', 'draft'].includes(phase)) {
    return (
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto',
          textAlign: 'center',
          padding: 'var(--space-10) var(--space-4)',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>🏈</div>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
          Draft Not Available
        </div>
        <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          The NFL Draft opens during the offseason after Free Agency concludes.
          Come back once the season ends and player progression has run.
        </p>
      </div>
    );
  }

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
      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardContent style={{ padding: "var(--space-5)" }}>
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
          <Button
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
          </Button>
        </div>
        </CardContent>
      </Card>

      {/* FA waiting notice */}
      {phase === 'free_agency' && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--accent)11', border: '1px solid var(--accent)44', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Free Agency is in progress. Advance through all FA days to unlock the draft.
        </div>
      )}

      {/* Step 2: Start Draft */}
      <Card className="card-premium" style={{ opacity: isDraftPhase ? 1 : 0.55 }}>
        <CardContent style={{ padding: "var(--space-5)" }}>
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
          <Button
            className="btn btn-primary"
            disabled={!isDraftPhase || starting}
            onClick={handleStartDraft}
            style={{ flexShrink: 0, minWidth: 120 }}
            title={!isDraftPhase ? 'Available once Free Agency is complete' : undefined}
          >
            {starting ? "Starting…" : "Start Draft"}
          </Button>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function filterDraftProspectsForView(prospects, { filterPos, nameFilter, advancedFilters }) {
  let list = [...(prospects ?? [])];
  if (filterPos) list = list.filter((p) => p.pos === filterPos);
  if (nameFilter) list = list.filter((p) => p.name.toLowerCase().includes(nameFilter.toLowerCase()));
  return applyAdvancedPlayerFilters(list, advancedFilters);
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
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showTradeUp, setShowTradeUp] = useState(false);
  const [showTradeDown, setShowTradeDown] = useState(false);
  const [tradeDownProcessing, setTradeDownProcessing] = useState(false);
  const [manualBoard, setManualBoard] = useState([]);
  const [pickClock, setPickClock] = useState(90);

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
    if (isDraftComplete) return undefined;
    const timer = setInterval(() => setPickClock((prev) => (prev <= 0 ? 90 : prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [isDraftComplete]);

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
            {Object.entries(POS_COLORS).map(([pos, color]) => (
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
                  fontFamily: "monospace",
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
                <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                  Clock: {pickClock}s
                </div>
                {currentPick?.isCompensatory && (
                  <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--warning, #FF9F0A)", fontWeight: 700 }}>
                    Compensatory pick · {currentPick?.compensatoryForName ? `for loss of ${currentPick.compensatoryForName}` : "NFL comp selection"}
                  </div>
                )}
              </>
            )}
          </CardContent>
          </Card>

          {/* Sim button (only when AI is picking) */}
          {!isDraftComplete && !isUserPick && (
            <Button
              className="btn btn-primary"
              disabled={simming}
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

          {/* Recently completed (last 10) */}
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
                      <TableCell
                        colSpan={isUserPick ? 12 : 11}
                        style={{
                          textAlign: "center",
                          padding: "var(--space-6)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {isDraftComplete
                          ? "All prospects have been drafted."
                          : "No prospects match the filter."}
                      </TableCell>
                    </TableRow>
                  )}
                  {sortedProspects.map((p, i) => (
                    <TableRow key={p.id} style={String(p.id) === String(recommendedPick?.playerId ?? '') ? { background: "rgba(52,199,89,0.1)" } : undefined}>
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
                            fontFamily: "monospace",
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
                        {/* Fog of War: show scout grade before drafted, true OVR after */}
                        {isDraftComplete
                          ? <OvrBadge ovr={p.ovr} />
                          : <ScoutBadge player={p} team={(league?.teams ?? []).find((t) => t.id === league?.userTeamId)} />
                        }
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
                        {p.college ?? "—"}
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
                            style={{
                              padding: "3px 12px",
                              fontSize: "var(--text-xs)",
                            }}
                            onClick={() => onDraftPlayer(p.id)}
                          >
                            Draft
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
        <Button
          className="btn btn-primary"
          style={{ fontSize: "var(--text-base)" }}
          onClick={() => actions.startNewSeason()}
        >
          Start New Season →
        </Button>
      </div>

      {/* Full pick history */}
      <Card className="card-premium" style={{ padding: 0, overflow: "hidden" }}>
        <CardHeader style={{ padding: "var(--space-3) var(--space-5)", background: "var(--surface-strong)", borderBottom: "1px solid var(--hairline)" }}>
          <CardTitle style={{ fontWeight: 700, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
            All Picks
          </CardTitle>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
        <ScrollArea style={{ maxHeight: 480 }}>
        <div
          className="table-wrapper"
          style={{ overflowX: "auto" }}
        >
          <Table
            className="standings-table"
            style={{ width: "100%", fontSize: "var(--text-sm)" }}
          >
            <TableHeader>
              <TableRow>
                <TableHead style={{ paddingLeft: "var(--space-4)" }}>#</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>POS</TableHead>
                <TableHead style={{ paddingRight: "var(--space-4)" }}>OVR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedPicks.map((pk) => (
                <TableRow key={pk.overall} className={pk.isUser ? "selected" : ""}>
                  <TableCell
                    style={{
                      paddingLeft: "var(--space-4)",
                      color: "var(--text-subtle)",
                      fontWeight: 700,
                    }}
                  >
                    {pk.overall}
                  </TableCell>
                  <TableCell style={{ color: "var(--text-muted)" }}>R{pk.round}</TableCell>
                  <TableCell
                    style={{
                      fontWeight: pk.isUser ? 700 : 400,
                      color: pk.isUser ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {pk.teamAbbr}
                    {pk.isUser && <span style={{ marginLeft: 4 }}>★</span>}
                  </TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{pk.playerName ?? "—"}</TableCell>
                  <TableCell style={{ color: "var(--text-muted)" }}>
                    {pk.playerPos ?? "—"}
                  </TableCell>
                  <TableCell style={{ paddingRight: "var(--space-4)" }}>
                    {pk.playerOvr != null ? (
                      <OvrBadge ovr={pk.playerOvr} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function Draft({ league, actions, onNavigate = null }) {
  const [draftState, setDraftState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [simming, setSimming] = useState(false);
  const [profilePlayerId, setProfilePlayerId] = useState(null);
  const [pickGrade, setPickGrade] = useState(null); // { pick, grade }

  const loadDraftState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await actions.getDraftState();
      if (res?.payload) setDraftState(res.payload.notStarted ? null : res.payload);
    } catch (err) {
      setError(err?.message ?? 'Unable to load draft state');
    } finally {
      setLoading(false);
    }
  }, [actions]);

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
            {league?.year ?? ""} Season · Offseason · Evaluate <abbr title="Overall rating">OVR</abbr>/<abbr title="Potential rating">POT</abbr> with scouting context
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => onNavigate?.("League")} aria-label="Back to league hub">Back to League</button>
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
          <Button
            className="btn"
            style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
            onClick={loadDraftState}
          >
            Retry
          </Button>
          <Button
            className="btn"
            style={{ padding: "2px 10px", fontSize: "var(--text-xs)" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
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
