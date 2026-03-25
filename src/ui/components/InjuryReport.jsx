/**
 * InjuryReport.jsx — League-wide injury report with focus on user's team.
 *
 * Shows injured players across the league with severity color-coding,
 * recovery timeline visualization, filtering, sorting, and quick stats.
 *
 * Props:
 *  - league: league view-model (roster, teams, userTeamId, season)
 *  - onPlayerSelect: (playerId) => void
 */

import React, { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Constants ────────────────────────────────────────────────────────────────

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const SEVERITY_LEVELS = {
  Minor:         { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  label: "Minor" },
  Moderate:      { color: "#eab308", bg: "rgba(234,179,8,0.12)",  label: "Moderate" },
  Serious:       { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "Serious" },
  Severe:        { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "Severe" },
  "Season-Ending": { color: "#991b1b", bg: "rgba(153,27,27,0.15)", label: "Season-Ending" },
};

function getSeverity(injury) {
  if (!injury) return SEVERITY_LEVELS.Minor;
  const w = injury.weeksRemaining ?? 0;
  if (injury.type?.toLowerCase().includes("acl") ||
      injury.type?.toLowerCase().includes("achilles") ||
      injury.seasonEnding || w >= 16) return SEVERITY_LEVELS["Season-Ending"];
  if (w >= 8) return SEVERITY_LEVELS.Severe;
  if (w >= 4) return SEVERITY_LEVELS.Serious;
  if (w >= 2) return SEVERITY_LEVELS.Moderate;
  return SEVERITY_LEVELS.Minor;
}

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
const SEVERITY_FILTERS = ["ALL", "Minor", "Moderate", "Serious", "Severe", "Season-Ending"];
const SORT_OPTIONS = [
  { key: "weeksRemaining", label: "Weeks Left" },
  { key: "severity", label: "Severity" },
  { key: "ovr", label: "OVR" },
];

const SEVERITY_ORDER = { "Season-Ending": 5, Severe: 4, Serious: 3, Moderate: 2, Minor: 1 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAllInjuredPlayers(league) {
  const players = [];
  const teams = league.teams || [];

  for (const team of teams) {
    const roster = team.roster || team.players || [];
    for (const p of roster) {
      if (p.injured || (p.injury && p.injury.weeksRemaining > 0)) {
        players.push({
          ...p,
          teamName: team.name || team.abbr || "???",
          teamAbbr: team.abbr || team.name?.slice(0, 3)?.toUpperCase() || "???",
          teamId: team.id ?? team.tid,
        });
      }
    }
  }

  // Also check league.roster for user team players not in teams array
  if (league.roster) {
    const existingIds = new Set(players.map(p => p.id ?? p.pid));
    for (const p of league.roster) {
      if ((p.injured || (p.injury && p.injury.weeksRemaining > 0)) && !existingIds.has(p.id ?? p.pid)) {
        const userTeam = teams.find(t => (t.id ?? t.tid) === league.userTeamId);
        players.push({
          ...p,
          teamName: userTeam?.name || "My Team",
          teamAbbr: userTeam?.abbr || "USR",
          teamId: league.userTeamId,
        });
      }
    }
  }

  return players;
}

// ── Timeline Bar ─────────────────────────────────────────────────────────────

function RecoveryTimeline({ weeksRemaining, totalWeeks, severity }) {
  const total = totalWeeks || Math.max(weeksRemaining + 2, weeksRemaining * 1.5) || 4;
  const elapsed = Math.max(0, total - weeksRemaining);
  const pct = Math.min(100, (elapsed / total) * 100);

  return (
    <div style={{ width: "100%", marginTop: 6 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--text-muted)", marginBottom: 3,
      }}>
        <span>Recovery Progress</span>
        <span>{weeksRemaining}w remaining</span>
      </div>
      <div style={{
        width: "100%", height: 6, borderRadius: 3,
        background: "var(--hairline)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 3,
          background: severity.color,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ── Injury Card ──────────────────────────────────────────────────────────────

function InjuryCard({ player, onPlayerSelect, showTeam = false }) {
  const injury = player.injury || {};
  const severity = getSeverity(injury);
  const pos = player.pos || player.position || "??";
  const posColor = POS_COLORS[pos] || "var(--text-muted)";
  const isIR = player.onIR || injury.ir || false;

  return (
    <div
      className="fade-in"
      onClick={() => onPlayerSelect?.(player.id ?? player.pid)}
      style={{
        background: "var(--surface)",
        border: `1px solid var(--hairline)`,
        borderLeft: `4px solid ${severity.color}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: onPlayerSelect ? "pointer" : "default",
        transition: "transform 0.15s, box-shadow 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Player avatar circle */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: `${posColor}18`, border: `2px solid ${posColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 12, color: posColor,
        }}>
          {player.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "??"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
              {player.name || "Unknown"}
            </span>
            {isIR && (
              <Badge variant="destructive" className="text-xs px-1 py-0">IR</Badge>
            )}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 2,
            fontSize: 12, color: "var(--text-muted)",
          }}>
            <span style={{
              fontWeight: 700, fontSize: 10, padding: "1px 6px", borderRadius: 4,
              background: `${posColor}18`, color: posColor,
            }}>{pos}</span>
            <span>OVR {player.ovr ?? "?"}</span>
            {showTeam && <span>· {player.teamAbbr}</span>}
          </div>
        </div>

        {/* Severity badge */}
        <Badge
          style={{ background: severity.bg, color: severity.color, border: "none" }}
          className="text-xs font-bold whitespace-nowrap"
        >
          {severity.label}
        </Badge>
      </div>

      {/* Injury info */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 13, color: "var(--text)",
      }}>
        <span style={{ fontSize: 16 }}>🩹</span>
        <span style={{ fontWeight: 600 }}>{injury.type || "General Injury"}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
          {injury.weeksRemaining ?? 0} {(injury.weeksRemaining ?? 0) === 1 ? "week" : "weeks"}
        </span>
      </div>

      {/* Recovery timeline */}
      <RecoveryTimeline
        weeksRemaining={injury.weeksRemaining ?? 0}
        totalWeeks={injury.totalWeeks}
        severity={severity}
      />
    </div>
  );
}

// ── Quick Stats Banner ───────────────────────────────────────────────────────

function QuickStats({ players }) {
  const total = players.length;
  const avgRecovery = total > 0
    ? (players.reduce((s, p) => s + (p.injury?.weeksRemaining ?? 0), 0) / total).toFixed(1)
    : "0.0";
  const seasonEnding = players.filter(p => getSeverity(p.injury).label === "Season-Ending").length;
  const onIR = players.filter(p => p.onIR || p.injury?.ir).length;

  const stats = [
    { label: "Total Injuries", value: total, color: "var(--accent)" },
    { label: "Avg Recovery", value: `${avgRecovery}w`, color: "var(--warning)" },
    { label: "Season-Ending", value: seasonEnding, color: "var(--danger)" },
    { label: "On IR", value: onIR, color: "#ef4444" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
      gap: 10, marginBottom: 20,
    }}>
      {stats.map(s => (
        <Card key={s.label} className="card-premium">
          <CardContent className="p-3 text-center">
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Filter / Sort Bar ────────────────────────────────────────────────────────

function FilterBar({ posFilter, setPosFilter, sevFilter, setSevFilter, teamFilter,
  setTeamFilter, sortKey, setSortKey, teams }) {

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      {/* Position filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {POS_FILTERS.map(p => (
          <Button
            key={p}
            variant={posFilter === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPosFilter(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      {/* Severity + team + sort row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          value={sevFilter}
          onChange={e => setSevFilter(e.target.value)}
          style={{
            background: "var(--surface)", color: "var(--text)",
            border: "1px solid var(--hairline)", borderRadius: 6,
            padding: "5px 8px", fontSize: 12,
          }}
        >
          {SEVERITY_FILTERS.map(s => (
            <option key={s} value={s}>{s === "ALL" ? "All Severities" : s}</option>
          ))}
        </select>

        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          style={{
            background: "var(--surface)", color: "var(--text)",
            border: "1px solid var(--hairline)", borderRadius: 6,
            padding: "5px 8px", fontSize: 12,
          }}
        >
          <option value="ALL">All Teams</option>
          {teams.map(t => (
            <option key={t.id ?? t.tid} value={t.id ?? t.tid}>
              {t.abbr || t.name}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sort:</span>
          {SORT_OPTIONS.map(o => (
            <Button
              key={o.key}
              variant={sortKey === o.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSortKey(o.key)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Injury History Log ───────────────────────────────────────────────────────

function InjuryHistoryLog({ league }) {
  const log = league.injuryLog || league.injuries || [];
  const recent = log.slice(-15).reverse();

  if (recent.length === 0) return null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline)",
      borderRadius: 10, padding: 16, marginTop: 20,
    }}>
      <h3 style={{
        fontSize: 14, fontWeight: 700, color: "var(--text)",
        marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
      }}>
        📋 Recent Injury Log
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recent.map((entry, i) => {
          const sev = getSeverity(entry);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, padding: "6px 0",
              borderBottom: i < recent.length - 1 ? "1px solid var(--hairline)" : "none",
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: sev.color, flexShrink: 0,
              }} />
              <span style={{ fontWeight: 600, color: "var(--text)" }}>
                {entry.playerName || entry.name || "Unknown"}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {entry.teamAbbr && `(${entry.teamAbbr})`}
              </span>
              <span style={{ color: "var(--text-muted)", flex: 1 }}>
                — {entry.type || "Injury"}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                Wk {entry.week ?? "?"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function InjuryReport({ league, onPlayerSelect }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("weeksRemaining");

  const teams = league.teams || [];
  const userTeamId = league.userTeamId;

  const allInjured = useMemo(() => getAllInjuredPlayers(league), [league]);

  const myTeamInjured = useMemo(
    () => allInjured.filter(p => p.teamId === userTeamId),
    [allInjured, userTeamId],
  );

  const filteredLeague = useMemo(() => {
    let list = [...allInjured];

    if (posFilter !== "ALL") {
      list = list.filter(p => (p.pos || p.position) === posFilter);
    }
    if (sevFilter !== "ALL") {
      list = list.filter(p => getSeverity(p.injury).label === sevFilter);
    }
    if (teamFilter !== "ALL") {
      const tid = typeof teamFilter === "string" ? parseInt(teamFilter, 10) : teamFilter;
      list = list.filter(p => p.teamId === tid || p.teamId === teamFilter);
    }

    list.sort((a, b) => {
      if (sortKey === "weeksRemaining") {
        return (b.injury?.weeksRemaining ?? 0) - (a.injury?.weeksRemaining ?? 0);
      }
      if (sortKey === "severity") {
        const sa = getSeverity(a.injury).label;
        const sb = getSeverity(b.injury).label;
        return (SEVERITY_ORDER[sb] || 0) - (SEVERITY_ORDER[sa] || 0);
      }
      if (sortKey === "ovr") {
        return (b.ovr ?? 0) - (a.ovr ?? 0);
      }
      return 0;
    });

    return list;
  }, [allInjured, posFilter, sevFilter, teamFilter, sortKey]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fade-in" style={{ padding: "var(--space-4)", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, flexWrap: "wrap", gap: 10,
      }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          🏥 Injury Report
        </h1>
        <span style={{
          fontSize: 12, color: "var(--text-muted)",
          background: "var(--surface)", padding: "4px 10px", borderRadius: 6,
          border: "1px solid var(--hairline)",
        }}>
          Season {league.season ?? "?"} · Week {league.week ?? "?"}
        </span>
      </div>

      {/* Quick Stats */}
      <QuickStats players={allInjured} />

      {/* ── My Team Section ─────────────────────────────────────────────── */}
      <Card className="card-premium" style={{ marginBottom: 24 }}>
        <CardContent className="p-4">
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: "var(--text)",
            marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
          }}>
            ⭐ My Team
            <Badge
              style={{
                background: myTeamInjured.length > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                color: myTeamInjured.length > 0 ? "#ef4444" : "#22c55e",
                border: "none",
              }}
              className="text-xs font-semibold"
            >
              {myTeamInjured.length} {myTeamInjured.length === 1 ? "injury" : "injuries"}
            </Badge>
          </h2>

          {myTeamInjured.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "24px 0",
              color: "var(--text-muted)", fontSize: 13,
            }}>
              ✅ No injuries on your team — full strength!
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}>
              {myTeamInjured.map(p => (
                <InjuryCard
                  key={p.id ?? p.pid ?? p.name}
                  player={p}
                  onPlayerSelect={onPlayerSelect}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── League Injuries Section ─────────────────────────────────────── */}
      <Card className="card-premium">
        <CardContent className="p-4">
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: "var(--text)",
            marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
          }}>
            🏈 League Injuries
            <Badge
              style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "none" }}
              className="text-xs font-semibold"
            >
              {filteredLeague.length} players
            </Badge>
          </h2>

          <FilterBar
            posFilter={posFilter} setPosFilter={setPosFilter}
            sevFilter={sevFilter} setSevFilter={setSevFilter}
            teamFilter={teamFilter} setTeamFilter={setTeamFilter}
            sortKey={sortKey} setSortKey={setSortKey}
            teams={teams}
          />

          {filteredLeague.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 0",
              color: "var(--text-muted)", fontSize: 13,
            }}>
              No injuries match current filters.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}>
              {filteredLeague.map(p => (
                <InjuryCard
                  key={`${p.teamId}-${p.id ?? p.pid ?? p.name}`}
                  player={p}
                  onPlayerSelect={onPlayerSelect}
                  showTeam
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Injury History Log ──────────────────────────────────────────── */}
      <InjuryHistoryLog league={league} />
    </div>
  );
}
