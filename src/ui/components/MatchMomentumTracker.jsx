// Pure presentation: renders a quarter-segmented momentum timeline
// from gameFlowSummary data. No fabrication, no mutation, no dependencies.

import React, { useMemo } from "react";

// ── Short-label lookup ──────────────────────────────────────────────────────

const SHORT_LABEL_MAP = [
  [/touchdown|^td$/i, "TD"],
  [/field.?goal|^fg$/i, "FG"],
  [/safety/i, "SAF"],
  [/turnover/i, "TO"],
  [/lead.?change|lead_change/i, "LC"],
  [/momentum.?swing|^swing$/i, "SW"],
  [/final.?takeaway|final_takeaway/i, "TA"],
  [/explosive/i, "XP"],
  [/interception|^int$/i, "INT"],
  [/sack/i, "SK"],
];

function toShortLabel(label) {
  if (!label) return "·";
  for (const [re, short] of SHORT_LABEL_MAP) {
    if (re.test(label)) return short;
  }
  return String(label).slice(0, 3).toUpperCase() || "·";
}

// ── Event list builder (mirrors RGFV buildEventList sort order) ─────────────

export function buildTrackerEvents(gfs) {
  if (!gfs || typeof gfs !== "object") return [];
  const scores = Array.isArray(gfs.scoringTimeline) ? gfs.scoringTimeline : [];
  const turns = Array.isArray(gfs.turningPoints) ? gfs.turningPoints : [];
  const mapped = [
    ...scores
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        kind: "score",
        quarter: typeof e.quarter === "number" && e.quarter > 0 ? e.quarter : 1,
        teamId: e.teamId ?? null,
        label: String(e.label ?? "Score"),
        shortLabel: toShortLabel(String(e.label ?? "")),
      })),
    ...turns
      .filter((tp) => tp && typeof tp === "object")
      .map((tp) => ({
        kind: "turning_point",
        quarter: typeof tp.quarter === "number" && tp.quarter > 0 ? tp.quarter : 1,
        teamId: tp.teamId ?? null,
        label: String(tp.label ?? "Key Play"),
        shortLabel: toShortLabel(String(tp.label ?? "")),
      })),
  ];
  // Stable sort by quarter — mirrors buildEventList in ReplayableGameFlowViewer
  return mapped.sort((a, b) => a.quarter - b.quarter);
}

function resolveTeamSide(teamId, homeTeamId, awayTeamId) {
  if (teamId == null) return "neutral";
  const tid = String(teamId);
  if (homeTeamId != null && tid === String(homeTeamId)) return "home";
  if (awayTeamId != null && tid === String(awayTeamId)) return "away";
  return "neutral";
}

// ── Event tick chip ─────────────────────────────────────────────────────────

function EventTick({ shortLabel, kind, revealState }) {
  const isScore = kind === "score";

  let bg, color, outline, opacity;

  if (revealState === "current") {
    bg = isScore ? "#0A84FF" : "#FF9F0A";
    color = "#fff";
    outline = `2px solid ${isScore ? "#0A84FF" : "#FF9F0A"}`;
    opacity = 1;
  } else if (revealState === "past") {
    bg = isScore ? "rgba(10,132,255,0.18)" : "rgba(255,159,10,0.18)";
    color = isScore ? "#0A84FF" : "#FF9F0A";
    outline = "none";
    opacity = 0.8;
  } else if (revealState === "future") {
    bg = "var(--surface-strong, rgba(255,255,255,0.06))";
    color = "var(--text-muted, #888)";
    outline = "none";
    opacity = 0.25;
  } else {
    // static — no replay state passed, show all as revealed
    bg = isScore ? "rgba(10,132,255,0.18)" : "rgba(255,159,10,0.18)";
    color = isScore ? "#0A84FF" : "#FF9F0A";
    outline = "none";
    opacity = 0.85;
  }

  return (
    <span
      data-testid="mmt-tick"
      data-reveal={revealState}
      data-kind={kind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.52rem",
        fontWeight: 700,
        padding: "2px 4px",
        borderRadius: 3,
        letterSpacing: "0.3px",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        background: bg,
        color,
        outline,
        outlineOffset: revealState === "current" ? "1px" : undefined,
        opacity,
        transition: "opacity 0.15s",
      }}
      aria-label={`${shortLabel} ${isScore ? "scoring play" : "key play"}`}
    >
      {shortLabel}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * MatchMomentumTracker — read-only, CSS/flex visual timeline.
 *
 * Props:
 *   gameFlowSummary   — from buildGameFlowSummary(); required
 *   homeTeam          — { id, abbr } optional
 *   awayTeam          — { id, abbr } optional
 *   currentEventIndex — number; mirrors RGFV's `index` state
 *   revealedCount     — number; alternative to currentEventIndex
 *
 * When neither currentEventIndex nor revealedCount is provided the tracker
 * renders in "static" mode: all events shown as revealed (useful for a
 * completed-game summary without an active replay).
 */
export default function MatchMomentumTracker({
  gameFlowSummary,
  homeTeam,
  awayTeam,
  currentEventIndex,
  revealedCount,
}) {
  const events = useMemo(() => buildTrackerEvents(gameFlowSummary), [gameFlowSummary]);

  if (events.length === 0) return null;

  const homeId = homeTeam?.id ?? null;
  const awayId = awayTeam?.id ?? null;

  // Resolve reveal threshold — currentEventIndex takes precedence
  const threshold =
    currentEventIndex != null
      ? currentEventIndex
      : revealedCount != null
        ? revealedCount
        : null; // null = static mode

  // Group events by quarter, keeping their original global index
  const byQuarter = useMemo(() => {
    const map = {};
    events.forEach((ev, globalIdx) => {
      const q = ev.quarter;
      if (!map[q]) map[q] = [];
      map[q].push({ ...ev, globalIdx });
    });
    return map;
  }, [events]);

  const quarters = Object.keys(byQuarter).map(Number).sort((a, b) => a - b);

  function getRevealState(globalIdx) {
    if (threshold === null) return "static";
    if (globalIdx < threshold) return "past";
    if (globalIdx === threshold) return "current";
    return "future";
  }

  const homeLabel = homeTeam?.abbr ?? "HOME";
  const awayLabel = awayTeam?.abbr ?? "AWAY";

  return (
    <div
      data-testid="mmt-root"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        maxWidth: "100%",
        overflowX: "hidden",
      }}
      aria-label="Match momentum tracker"
    >
      {/* Team side labels — HOME (top row) vs AWAY (bottom row) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.56rem",
          fontWeight: 700,
          color: "var(--text-muted, #888)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          padding: "0 2px",
        }}
      >
        <span data-testid="mmt-home-label">{homeLabel}</span>
        <span data-testid="mmt-away-label">{awayLabel}</span>
      </div>

      {/* Quarter columns */}
      <div
        data-testid="mmt-grid"
        style={{
          display: "flex",
          gap: "1px",
          overflowX: "hidden",
          width: "100%",
        }}
      >
        {quarters.map((q) => {
          const qEvents = byQuarter[q];
          const homeEvts = qEvents.filter(
            (e) => resolveTeamSide(e.teamId, homeId, awayId) === "home",
          );
          const awayEvts = qEvents.filter(
            (e) => resolveTeamSide(e.teamId, homeId, awayId) === "away",
          );
          const neutralEvts = qEvents.filter(
            (e) => resolveTeamSide(e.teamId, homeId, awayId) === "neutral",
          );
          // Neutral events appear in the away row (below the timeline)
          const belowEvts = [...awayEvts, ...neutralEvts];

          return (
            <div
              key={q}
              data-testid={`mmt-quarter-${q}`}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
              }}
            >
              {/* Home events — top */}
              <div
                style={{
                  minHeight: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "flex-end",
                  gap: 2,
                  padding: "1px 1px 2px",
                }}
              >
                {homeEvts.map((ev, i) => (
                  <EventTick
                    key={i}
                    shortLabel={ev.shortLabel}
                    kind={ev.kind}
                    revealState={getRevealState(ev.globalIdx)}
                  />
                ))}
              </div>

              {/* Quarter marker — centerline */}
              <div
                data-testid={`mmt-q-label-${q}`}
                style={{
                  textAlign: "center",
                  fontSize: "0.56rem",
                  fontWeight: 700,
                  color: "var(--text-muted, #888)",
                  borderTop: "1px solid var(--hairline, rgba(255,255,255,0.1))",
                  borderBottom: "1px solid var(--hairline, rgba(255,255,255,0.1))",
                  padding: "2px 0",
                  letterSpacing: "0.3px",
                }}
              >
                Q{q}
              </div>

              {/* Away + neutral events — bottom */}
              <div
                style={{
                  minHeight: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: "2px 1px 1px",
                }}
              >
                {belowEvts.map((ev, i) => (
                  <EventTick
                    key={i}
                    shortLabel={ev.shortLabel}
                    kind={ev.kind}
                    revealState={getRevealState(ev.globalIdx)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
