/**
 * RookieDraft.jsx — Premium 7-round draft room with big board,
 * combine-style player cards, radar charts, auto/manual picks,
 * and confetti on top-10 selections.
 *
 * Uses stadium-theme: gradient-draft bg, glassmorphism cards,
 * position badges, animated stagger entries, pulseGlow on pick.
 *
 * Props:
 *  - league: league view-model
 *  - actions: worker actions (draftPlayer, autoDraft, getDraftState)
 *  - onPlayerSelect: (playerId) => void
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import PlayerRadarChart, { getPlayerRadarAttributes } from "./PlayerRadarChart.jsx";
import { OvrPill } from "./LeagueDashboard.jsx";
import { launchConfetti } from "../../confetti.js";
import { buildTeamIntelligence, classifyNeedFitForProspect, scoreProspectForTeam } from "../utils/teamIntelligence.js";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const ROUND_NAMES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

function getPickNumber(round, pickInRound) {
  return (round - 1) * 32 + pickInRound;
}

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let hash = 0;
  for (let i = 0; i < abbr.length; i++)
    hash = abbr.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── Prospect Card (combine-style) ──
function ProspectCard({ player, rank, isOnClock, onDraft, onSelect, userPick, tagLabel }) {
  const pos = player.pos || player.position;
  const posColor = POS_COLORS[pos] || "#9ca3af";
  const radarAttrs = getPlayerRadarAttributes({ ...player, ...(player.ratings || {}) });

  const devLabel = player.devTrait === "X-Factor" ? "X" :
                   player.devTrait === "Superstar" ? "SS" :
                   player.devTrait === "Star" ? "S" : null;

  return (
    <div
      className={`card-premium ${isOnClock ? "pulse-glow" : "hover-lift"} fade-in`}
      style={{
        padding: "var(--space-4)",
        borderLeft: `3px solid ${posColor}`,
        cursor: "pointer",
        position: "relative",
        ...(isOnClock ? {
          borderColor: "var(--accent)",
          boxShadow: "0 0 20px rgba(10, 132, 255, 0.2)",
        } : {}),
      }}
      onClick={() => onSelect?.(player.id)}
    >
      {/* Rank badge */}
      <div style={{
        position: "absolute", top: 8, right: 8,
        width: 28, height: 28, borderRadius: "50%",
        background: rank <= 10 ? "var(--gradient-gold)" : "var(--surface-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 900,
        color: rank <= 10 ? "#000" : "var(--text-muted)",
      }}>
        {rank}
      </div>

      {/* Player info */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        {/* Avatar */}
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: `${posColor}22`, border: `2px solid ${posColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 14, color: posColor, flexShrink: 0,
        }}>
          {player.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: "var(--text-sm)", color: "var(--text)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            display: "flex", alignItems: "center", gap: "var(--space-2)",
          }}>
            {player.name}
            {devLabel && (
              <span style={{
                fontSize: 9, fontWeight: 900, padding: "1px 4px",
                borderRadius: "var(--radius-sm)",
                background: player.devTrait === "X-Factor" ? "rgba(255,215,0,0.15)" : "rgba(168,85,247,0.15)",
                color: player.devTrait === "X-Factor" ? "#FFD700" : "#a855f7",
              }}>
                {devLabel}
              </span>
            )}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)",
            marginTop: 2,
          }}>
            <span className={`pos-badge pos-${pos?.toLowerCase()}`}>{pos}</span>
            <OvrPill ovr={player.ovr || 50} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Age {player.age}
            </span>
          </div>
        </div>
      </div>

      {/* Compact radar chart */}
      <PlayerRadarChart attributes={radarAttrs} size={160} color={posColor} />

      {/* Combine stats */}
      {player.combineStats && (
        <div style={{
          marginTop: "var(--space-2)", padding: "var(--space-2)",
          background: "var(--bg)", borderRadius: "var(--radius-sm)",
          fontSize: 10, color: "var(--text-muted)", textAlign: "center",
          fontFamily: "monospace",
        }}>
          {player.combineStats}
        </div>
      )}

      {/* Scout grade */}
      {player.scoutStatus?.grade && (
        <div style={{
          marginTop: "var(--space-2)", textAlign: "center",
          fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent)",
        }}>
          {player.scoutStatus.grade}
        </div>
      )}
      {tagLabel && (
        <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-subtle)", textAlign: "center" }}>{tagLabel}</div>
      )}

      {/* Draft button */}
      {userPick && (
        <button
          className="btn-premium btn-primary-premium"
          onClick={(e) => { e.stopPropagation(); onDraft?.(player.id); }}
          style={{ width: "100%", marginTop: "var(--space-3)" }}
        >
          Draft {player.name?.split(" ").pop()}
        </button>
      )}
    </div>
  );
}

// ── Pick History Row ──
function DraftPickRow({ pick, teams, isUser, isNew }) {
  const team = teams?.find(t => t.id === pick.teamId);
  const pos = pick.pos || pick.position;
  const posColor = POS_COLORS[pos] || "#9ca3af";

  return (
    <div
      className={isNew ? "fade-in-up" : ""}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-3)",
        background: isUser ? "var(--accent-muted)" : "var(--surface)",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${isUser ? "var(--accent)" : "var(--hairline)"}`,
        marginBottom: "var(--space-1)",
      }}
    >
      {/* Pick number */}
      <span style={{
        width: 24, textAlign: "center", fontWeight: 800,
        fontSize: "var(--text-xs)", color: pick.overall <= 10 ? "var(--warning)" : "var(--text-muted)",
      }}>
        {pick.overall}
      </span>

      {/* Team circle */}
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: `${teamColor(team?.abbr || "")}22`,
        border: `2px solid ${teamColor(team?.abbr || "")}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 900, color: teamColor(team?.abbr || ""),
        flexShrink: 0,
      }}>
        {(team?.abbr || "?").slice(0, 3)}
      </div>

      {/* Player name + pos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {pick.name}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
          {team?.abbr || "?"} · Rd {pick.round}
        </div>
      </div>

      <span className={`pos-badge pos-${pos?.toLowerCase()}`} style={{ fontSize: 9 }}>{pos}</span>
      <OvrPill ovr={pick.ovr || 50} />
    </div>
  );
}

// ── Main Component ──

export default function RookieDraft({ league, actions, onPlayerSelect }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("board"); // "board" | "picks"
  const [searchQuery, setSearchQuery] = useState("");
  const lastPickCountRef = useRef(0);

  const draftState = league?.draftState;
  const draftClass = draftState?.prospects || league?.draftClass || [];
  const draftPicks = draftState?.picks || [];
  const currentPick = draftState?.currentPick;
  const isUserPick = draftState?.isUserPick ?? false;
  const isDraftComplete = draftState?.complete ?? false;
  const teams = league?.teams || [];
  const userTeam = teams.find((t) => t.id === league?.userTeamId);
  const teamIntel = useMemo(() => buildTeamIntelligence(userTeam, { week: league?.week ?? 1 }), [userTeam, league?.week]);

  // Confetti on top-10 user picks
  useEffect(() => {
    if (draftPicks.length > lastPickCountRef.current) {
      const newPicks = draftPicks.slice(lastPickCountRef.current);
      const userPick = newPicks.find(p => p.teamId === league?.userTeamId && p.overall <= 10);
      if (userPick) {
        launchConfetti();
      }
      lastPickCountRef.current = draftPicks.length;
    }
  }, [draftPicks.length, league?.userTeamId]);

  // Available prospects (not yet drafted)
  const draftedIds = useMemo(() => new Set(draftPicks.map(p => p.playerId || p.id)), [draftPicks]);
  const completedPicks = useMemo(() => [...draftPicks].sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999)), [draftPicks]);

  const availableProspects = useMemo(() => {
    let prospects = draftClass.filter(p => !draftedIds.has(p.id));

    // Position filter
    if (posFilter !== "ALL") {
      prospects = prospects.filter(p => (p.pos || p.position) === posFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      prospects = prospects.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        (p.pos || p.position || "").toLowerCase().includes(q) ||
        (p.college || "").toLowerCase().includes(q)
      );
    }

    // Sort by OVR descending
    prospects.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    return prospects.map((p, idx) => {
      const pos = p.pos || p.position;
      const fit = classifyNeedFitForProspect(pos, teamIntel);
      const scouting = scoreProspectForTeam(p, teamIntel);
      const upside = (Number(p?.potential ?? p?.pot ?? p?.ovr ?? 60) - Number(p?.ovr ?? 60)) >= 8 || Number(p?.age ?? 30) <= 21;
      const tagLabel = idx < 10 ? "Best Player Available" : fit.bucket === "Immediate need" ? "Best Need Fit" : upside ? "Long-term Upside" : "Balanced Option";
      return { ...p, _tagLabel: `${tagLabel} · ${fit.bucket}`, _fit: fit, _scouting: scouting };
    });
  }, [draftClass, draftedIds, posFilter, searchQuery, teamIntel]);

  const recentPicks = useMemo(() => completedPicks.slice(-8).reverse(), [completedPicks]);
  const upcomingPicks = useMemo(() => {
    if (!currentPick) return [];
    return (draftState?.picks || []).filter((p) => (p.overall ?? 999) >= currentPick).slice(0, 14);
  }, [draftState?.picks, currentPick]);
  const userUpcoming = useMemo(() => upcomingPicks.filter((p) => p.teamId === league?.userTeamId).slice(0, 4), [upcomingPicks, league?.userTeamId]);
  const positionRun = useMemo(() => {
    const posCounts = new Map();
    recentPicks.forEach((p) => {
      const pos = p.pos || p.playerPos;
      if (!pos) return;
      posCounts.set(pos, (posCounts.get(pos) ?? 0) + 1);
    });
    return [...posCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [recentPicks]);

  const draftNightPulse = useMemo(() => {
    if (draftPicks.length === 0) return "Draft night opens with a clean board and no positional run yet.";
    const surprise = recentPicks.find((p) => (p.overall ?? 999) > 20 && Number(p.ovr ?? 0) >= 80);
    if (surprise) return `Surprise swing: #${surprise.overall} ${surprise.name || surprise.playerName} (${surprise.pos || surprise.playerPos}) came off the board early.`;
    if (positionRun[0] && positionRun[0][1] >= 3) return `League run underway: ${positionRun[0][0]} has dominated recent picks (${positionRun[0][1]} of last 8).`;
    return `Board is balanced so far with ${draftPicks.length} picks completed.`;
  }, [draftPicks.length, recentPicks, positionRun]);

  const onClockFraming = useMemo(() => {
    const top = availableProspects[0];
    if (!top) return [];
    const fit = classifyNeedFitForProspect(top.pos || top.position, teamIntel);
    return [
      `Best available talent: ${top.name} (${top.pos || top.position})`,
      `Best fit signal: ${fit.bucket} — ${fit.short}`,
      positionRun.length > 0 ? `Current board movement: ${positionRun.map(([pos, c]) => `${pos} x${c}`).join(" · ")}` : "Current board movement: no clear run",
      userUpcoming.length > 1 ? `Trade-down angle: ${userUpcoming.length} upcoming picks in sight; depth may allow a move.` : "Trade-down angle: avoid overconfidence, depth uncertain.",
    ];
  }, [availableProspects, teamIntel, positionRun, userUpcoming.length]);

  const handleDraft = useCallback((playerId) => {
    if (actions?.draftPlayer) {
      actions.draftPlayer(playerId);
    }
  }, [actions]);

  const handleAutoDraft = useCallback(() => {
    if (actions?.autoDraft) {
      actions.autoDraft();
    }
  }, [actions]);

  // Current round info
  const currentRound = currentPick ? Math.ceil(currentPick / 32) : 1;
  const currentPickInRound = currentPick ? ((currentPick - 1) % 32) + 1 : 1;

  const posFilters = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];

  return (
    <div className="fade-in">
      {/* ── Draft Header ── */}
      <div style={{
        background: "var(--gradient-draft)",
        borderRadius: "var(--radius-xl)",
        padding: "var(--space-5)",
        marginBottom: "var(--space-5)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "var(--stadium-glow)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            fontSize: "clamp(1.2rem, 4vw, 2rem)", fontWeight: 900,
            color: "#fff", letterSpacing: "-1px",
            marginBottom: "var(--space-2)",
          }}>
            {isDraftComplete ? "Draft Complete" : `${league?.year || 2025} NFL Draft`}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.72)", marginBottom: "var(--space-2)" }}>
            Needs now: {teamIntel.needsNow.map((n) => n.pos).join(", ") || "None"} · Later: {teamIntel.needsLater.map((n) => n.pos).join(", ") || "None"}
          </div>

          {!isDraftComplete && currentPick && (
            <div style={{
              display: "flex", alignItems: "center", gap: "var(--space-4)",
              flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.6)" }}>
                  Round {currentRound} · Pick {currentPickInRound}
                </div>
                <div style={{
                  fontSize: "var(--text-lg)", fontWeight: 800, color: "#fff",
                  marginTop: 2,
                }}>
                  Overall #{currentPick}
                </div>
              </div>
              <div style={{
                display: "flex", gap: "var(--space-2)",
              }}>
                {isUserPick ? (
                  <span className="pulse-glow" style={{
                    padding: "var(--space-2) var(--space-4)",
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "var(--radius-pill)",
                    fontWeight: 800, fontSize: "var(--text-sm)",
                    color: "#FFD700",
                  }}>
                    YOUR PICK
                  </span>
                ) : (
                  <span style={{
                    padding: "var(--space-2) var(--space-4)",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "var(--radius-pill)",
                    fontWeight: 700, fontSize: "var(--text-xs)",
                    color: "rgba(255,255,255,0.7)",
                  }}>
                    On the Clock: {teams.find(t => t.id === draftState?.onClockTeamId)?.abbr || "..."}
                  </span>
                )}
              </div>
            </div>
          )}

          {isDraftComplete && (
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "var(--text-sm)" }}>
              {draftPicks.length} picks made across 7 rounds
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "var(--space-3)",
        marginBottom: "var(--space-4)", alignItems: "center",
      }}>
        {/* View toggle */}
        <div className="standings-tabs">
          <button
            className={`standings-tab${viewMode === "board" ? " active" : ""}`}
            onClick={() => setViewMode("board")}
          >
            Big Board
          </button>
          <button
            className={`standings-tab${viewMode === "picks" ? " active" : ""}`}
            onClick={() => setViewMode("picks")}
          >
            Picks ({draftPicks.length})
          </button>
        </div>

        {!isDraftComplete && !isUserPick && (
          <button
            className="btn-premium btn-primary-premium"
            onClick={handleAutoDraft}
            style={{ marginLeft: "auto" }}
          >
            Auto Pick
          </button>
        )}

        {viewMode === "board" && (
          <>
            <input
              type="text"
              placeholder="Search prospects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="settings-input"
              style={{ flex: "1 1 160px", maxWidth: 240 }}
            />
          </>
        )}
      </div>

      {/* ── Position filter (board view) ── */}
      {viewMode === "board" && (
        <div className="division-tabs" style={{ marginBottom: "var(--space-4)" }}>
          {posFilters.map(p => (
            <button
              key={p}
              className={`division-tab${posFilter === p ? " active" : ""}`}
              onClick={() => setPosFilter(p)}
              style={p !== "ALL" ? {
                borderColor: (POS_COLORS[p] || "var(--hairline)") + "40",
                color: posFilter === p ? "#fff" : POS_COLORS[p],
              } : {}}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="stat-box" style={{ padding: "var(--space-3)", marginBottom: "var(--space-3)", border: "1px solid var(--hairline)" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Draft night pulse</div>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{draftNightPulse}</div>
      </div>

      {/* ── Content ── */}
      {!isDraftComplete && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div className="stat-box" style={{ padding: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Recent picks</div>
            {recentPicks.slice(0, 4).map((pick) => <div key={`recent-${pick.overall}`} style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>#{pick.overall} {pick.name || pick.playerName} ({pick.pos || pick.playerPos})</div>)}
            {recentPicks.length === 0 && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Draft has not started yet.</div>}
          </div>
          <div className="stat-box" style={{ padding: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Your upcoming picks</div>
            {userUpcoming.map((pick) => <div key={`user-up-${pick.overall}`} style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>R{pick.round} · #{pick.overall}</div>)}
            {userUpcoming.length === 0 && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No user picks in the next window.</div>}
          </div>
          <div className="stat-box" style={{ padding: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Position run watch</div>
            {positionRun.map(([pos, count]) => <div key={`run-${pos}`} style={{ fontSize: "var(--text-xs)", color: "var(--text)" }}>{pos}: {count} of last 8 picks</div>)}
            {positionRun.length === 0 && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No run signal yet.</div>}
          </div>
        </div>
      )}
      {isUserPick && !isDraftComplete && (
        <div className="stat-box" style={{ padding: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div style={{ fontWeight: 800, fontSize: "var(--text-sm)", marginBottom: 6 }}>On-the-clock framing</div>
          {onClockFraming.map((line, idx) => <div key={`framing-${idx}`} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>• {line}</div>)}
        </div>
      )}
      {viewMode === "board" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "var(--space-4)",
        }}>
          {availableProspects.slice(0, 50).map((player, i) => (
            <ProspectCard
              key={player.id}
              player={player}
              rank={i + 1}
              isOnClock={isUserPick && i === 0}
              onDraft={isUserPick ? handleDraft : null}
              onSelect={onPlayerSelect}
              userPick={isUserPick}
              tagLabel={player._tagLabel}
            />
          ))}
          {availableProspects.length === 0 && (
            <div style={{
              gridColumn: "1/-1", textAlign: "center",
              padding: "var(--space-8)", color: "var(--text-muted)",
            }}>
              {isDraftComplete
                ? "All prospects have been drafted."
                : searchQuery
                  ? `No prospects matching "${searchQuery}"`
                  : "No prospects available at this position."
              }
            </div>
          )}
        </div>
      )}

      {viewMode === "picks" && (
        <div>
          {/* Round tabs */}
          <div className="division-tabs" style={{ marginBottom: "var(--space-4)" }}>
            {ROUND_NAMES.map((name, i) => {
              const round = i + 1;
              const roundPicks = draftPicks.filter(p => p.round === round);
              return (
                <button
                  key={round}
                  className={`division-tab${currentRound === round ? " active" : ""}`}
                  onClick={() => {
                    const el = document.getElementById(`draft-round-${round}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {name} ({roundPicks.length}/32)
                </button>
              );
            })}
          </div>

          {/* Picks list by round */}
          {ROUND_NAMES.map((name, i) => {
            const round = i + 1;
            const roundPicks = draftPicks.filter(p => p.round === round);
            if (roundPicks.length === 0 && round > currentRound) return null;

            return (
              <div key={round} id={`draft-round-${round}`} style={{ marginBottom: "var(--space-5)" }}>
                <div style={{
                  fontSize: "var(--text-sm)", fontWeight: 800,
                  color: "var(--text)", marginBottom: "var(--space-2)",
                  display: "flex", alignItems: "center", gap: "var(--space-2)",
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: round === currentRound ? "var(--accent)" : "var(--surface-strong)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900,
                    color: round === currentRound ? "#fff" : "var(--text-muted)",
                  }}>
                    {round}
                  </span>
                  Round {name}
                </div>

                {roundPicks.length === 0 ? (
                  <div style={{
                    padding: "var(--space-3)", color: "var(--text-subtle)",
                    fontSize: "var(--text-xs)", textAlign: "center",
                  }}>
                    No picks yet
                  </div>
                ) : (
                  roundPicks.map(pick => (
                    <DraftPickRow
                      key={pick.overall || pick.id}
                      pick={pick}
                      teams={teams}
                      isUser={pick.teamId === league?.userTeamId}
                      isNew={pick.overall === draftPicks.length}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
