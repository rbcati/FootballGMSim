/**
 * AdvancedStats.jsx — Game Performance Grades panel
 *
 * Renders per-game performance grades computed from the CANONICAL player box
 * score (the same authority that owns the final score) — never from narration
 * play-logs or live per-play references. Grades are an in-game performance
 * estimate based on simulated production and participation; they carry no
 * external-analytics branding.
 *
 * Features:
 *  - Team attribution on every row (each row is tagged with its team).
 *  - Team filter defaulting to the user's team, with opponent + all views.
 *  - Offense / Defense sub-filter that never hides team ownership.
 *  - Small-sample protection: tiny samples are regressed toward a neutral
 *    baseline and labeled "Limited sample" — no one-play "Elite" grades.
 *
 * Usage:
 *   <AdvancedStats
 *     playerStats={{ home: {...}, away: {...} }}
 *     homeTeam={...} awayTeam={...} userTeamId={id} />
 */

import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gradeTeamBoxScore, gradeColor } from "../utils/gamePerformanceGrades.js";

// ── Radar bar (expanded sub-grades) ─────────────────────────────────────────
function RadarBar({ label, value }) {
  const pct = Math.min(100, value);
  const color = gradeColor(value);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: "0.68rem", color, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function PlayerGradeCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const { name, pos, overall, sub, participation, limitedSample, tier, statLine, teamAbbr } = entry;
  const color = gradeColor(overall, { limitedSample });
  const subKeys = Object.keys(sub || {});

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      data-testid="grade-row"
      data-team={teamAbbr || ""}
      data-pos={pos || ""}
      data-limited={limitedSample ? "1" : "0"}
      style={{
        background: "var(--surface)",
        border: `1px solid ${expanded ? color + "66" : "var(--hairline)"}`,
        borderRadius: 12, padding: "10px 12px", cursor: "pointer",
        transition: "border-color 0.2s", marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Grade badge — number only, no external-brand stamp */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${color}20`, border: `2px solid ${color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 900, color, lineHeight: 1 }}>{overall}</span>
        </div>
        {/* Player info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {teamAbbr && (
              <span data-testid="grade-team-tag" style={{
                fontSize: "0.55rem", fontWeight: 800, color: "var(--text-subtle)",
                background: "var(--surface-strong, rgba(255,255,255,0.08))",
                border: "1px solid var(--hairline)", borderRadius: 5,
                padding: "1px 5px", letterSpacing: "0.5px", flexShrink: 0,
              }}>
                {teamAbbr}
              </span>
            )}
            <span style={{
              fontSize: "0.82rem", fontWeight: 800, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {name || "?"}
            </span>
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>{pos}</span>
            {participation?.label && <span>{participation.label}</span>}
            <Badge
              variant="outline"
              className="text-xs px-1 py-0 h-4"
              style={{ color, borderColor: color + "66", fontSize: "0.58rem" }}
            >
              {limitedSample ? "Limited sample" : tier}
            </Badge>
          </div>
        </div>
        {/* Quick stat line */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {statLine}
          </div>
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {expanded && subKeys.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
          {limitedSample && (
            <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginBottom: 8, fontStyle: "italic" }}>
              Limited sample — grade regressed toward league-average until participation is sufficient.
            </div>
          )}
          {subKeys.map((k) => (
            <RadarBar key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={sub[k]} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        padding: "5px 12px",
        background: active ? "var(--accent, #0A84FF)" : "transparent",
        color: active ? "#fff" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--accent, #0A84FF)" : "var(--hairline)"}`,
        borderRadius: 8, fontWeight: 700, fontSize: "0.72rem", cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function AdvancedStats({ playerStats, homeTeam, awayTeam, userTeamId }) {
  const userIsHome = homeTeam?.id != null && homeTeam.id === userTeamId;
  const userIsAway = awayTeam?.id != null && awayTeam.id === userTeamId;

  // Grade each team's canonical box score with team attribution.
  const { homeRows, awayRows } = useMemo(() => {
    const home = gradeTeamBoxScore(playerStats?.home ?? {}, {
      teamId: homeTeam?.id, teamAbbr: homeTeam?.abbr, teamSide: "home",
    });
    const away = gradeTeamBoxScore(playerStats?.away ?? {}, {
      teamId: awayTeam?.id, teamAbbr: awayTeam?.abbr, teamSide: "away",
    });
    return { homeRows: home, awayRows: away };
  }, [playerStats, homeTeam?.id, homeTeam?.abbr, awayTeam?.id, awayTeam?.abbr]);

  const hasAny = homeRows.length > 0 || awayRows.length > 0;

  // Default team view: the user's team when identifiable, else home.
  const defaultTeam = userIsAway ? "away" : "home";
  const [teamView, setTeamView] = useState(defaultTeam); // "home" | "away" | "all"
  const [sideView, setSideView] = useState("offense");   // "offense" | "defense"

  const rows = useMemo(() => {
    let base = teamView === "home" ? homeRows : teamView === "away" ? awayRows : [...homeRows, ...awayRows];
    base = base.filter((r) => r.side === sideView);
    return base.sort((a, b) => b.overall - a.overall).slice(0, 16);
  }, [teamView, sideView, homeRows, awayRows]);

  if (!hasAny) {
    return (
      <div data-testid="grades-unavailable" style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Canonical player stats are not available for this game, so performance grades cannot be shown.
      </div>
    );
  }

  const homeLabel = homeTeam?.abbr ?? "HOME";
  const awayLabel = awayTeam?.abbr ?? "AWAY";

  return (
    <Card className="card-premium" style={{ paddingBottom: 16 }}>
      <CardHeader style={{ padding: "12px 16px 8px" }}>
        <CardTitle style={{ fontSize: "0.65rem", fontWeight: 800,
          color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "1px" }}>
          Game Performance Grades
        </CardTitle>
        <div style={{ fontSize: "0.6rem", color: "var(--text-subtle)", marginTop: 2, fontWeight: 500 }}>
          In-game estimate from simulated production &amp; participation
        </div>
      </CardHeader>
      <CardContent style={{ padding: "0 16px" }}>
        {/* Team attribution filter (defaults to the user's team) */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }} data-testid="grade-team-filter">
          <FilterButton active={teamView === "home"} onClick={() => setTeamView("home")}>
            {homeLabel}{userIsHome ? " ★" : ""}
          </FilterButton>
          <FilterButton active={teamView === "away"} onClick={() => setTeamView("away")}>
            {awayLabel}{userIsAway ? " ★" : ""}
          </FilterButton>
          <FilterButton active={teamView === "all"} onClick={() => setTeamView("all")}>All</FilterButton>
        </div>
        {/* Offense / Defense sub-filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <FilterButton active={sideView === "offense"} onClick={() => setSideView("offense")}>⚔️ Offense</FilterButton>
          <FilterButton active={sideView === "defense"} onClick={() => setSideView("defense")}>🛡️ Defense</FilterButton>
        </div>

        <div>
          {rows.length > 0 ? (
            rows.map((entry) => <PlayerGradeCard key={`${entry.teamSide}-${entry.playerId}`} entry={entry} />)
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: "0.82rem" }}>
              No graded {sideView} players for this team.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
