/**
 * InjuryReport.jsx — Availability-first injury operations screen.
 *
 * Top hierarchy now supports weekly readiness loop while preserving
 * league-wide injury browsing, filters, stats, and injury history.
 */

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markWeeklyPrepStep } from "../utils/weeklyPrep.js";
import { deriveInjuryReadinessModel, getInjuryWeeksRemaining, isPlayerInjured } from "../utils/injuryReadinessModel.js";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const STATUS_COLORS = {
  ok: { color: "#22c55e", bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.4)" },
  info: { color: "#3b82f6", bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.4)" },
  warning: { color: "#f59e0b", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.4)" },
  danger: { color: "#ef4444", bg: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.4)" },
};

const SEVERITY_LEVELS = {
  Minor: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Minor" },
  Moderate: { color: "#eab308", bg: "rgba(234,179,8,0.12)", label: "Moderate" },
  Serious: { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "Serious" },
  Severe: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Severe" },
  "Season-Ending": { color: "#991b1b", bg: "rgba(153,27,27,0.15)", label: "Season-Ending" },
};

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
const SEVERITY_FILTERS = ["ALL", "Minor", "Moderate", "Serious", "Severe", "Season-Ending"];
const SORT_OPTIONS = [
  { key: "weeksRemaining", label: "Weeks Left" },
  { key: "severity", label: "Severity" },
  { key: "ovr", label: "OVR" },
];

const SEVERITY_ORDER = { "Season-Ending": 5, Severe: 4, Serious: 3, Moderate: 2, Minor: 1 };

function getSeverity(injury) {
  if (!injury) return SEVERITY_LEVELS.Minor;
  const w = getInjuryWeeksRemaining({ injury });
  if (injury.type?.toLowerCase().includes("acl") || injury.type?.toLowerCase().includes("achilles") || injury.seasonEnding || w >= 16) return SEVERITY_LEVELS["Season-Ending"];
  if (w >= 8) return SEVERITY_LEVELS.Severe;
  if (w >= 4) return SEVERITY_LEVELS.Serious;
  if (w >= 2) return SEVERITY_LEVELS.Moderate;
  return SEVERITY_LEVELS.Minor;
}

function RecoveryTimeline({ weeksRemaining, totalWeeks, severity }) {
  const total = totalWeeks || Math.max(weeksRemaining + 2, weeksRemaining * 1.5) || 4;
  const elapsed = Math.max(0, total - weeksRemaining);
  const pct = Math.min(100, (elapsed / total) * 100);

  return (
    <div style={{ width: "100%", marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>
        <span>Recovery Progress</span>
        <span>{weeksRemaining}w remaining</span>
      </div>
      <div style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--hairline)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: severity.color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function InjuryCard({ player, onPlayerSelect, showTeam = false }) {
  const injury = player.injury || {};
  const severity = getSeverity(injury);
  const pos = player.pos || player.position || "??";
  const posColor = POS_COLORS[pos] || "var(--text-muted)";
  const isIR = player.onIR || injury.ir || false;
  const weeksRemaining = getInjuryWeeksRemaining(player);

  return (
    <button
      type="button"
      className="fade-in"
      onClick={() => onPlayerSelect?.(player.id ?? player.pid)}
      style={{
        width: "100%",
        textAlign: "left",
        background: "var(--surface)",
        border: `1px solid var(--hairline)`,
        borderLeft: `4px solid ${severity.color}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: onPlayerSelect ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{player.name || "Unknown"}</span>
            {isIR && <Badge variant="destructive" className="text-xs px-1 py-0">IR</Badge>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            <Badge variant="outline" style={{ fontWeight: 700, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${posColor}18`, color: posColor }}>{pos}</Badge>
            <span>OVR {player.ovr ?? "?"}</span>
            {showTeam && <span>· {player.teamAbbr}</span>}
          </div>
        </div>

        <Badge style={{ background: severity.bg, color: severity.color, border: "none" }} className="text-xs font-bold whitespace-nowrap">
          {severity.label}
        </Badge>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" }}>
        <span style={{ fontSize: 16 }}>🩹</span>
        <span style={{ fontWeight: 600 }}>{injury.type || "General Injury"}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
          {weeksRemaining} {weeksRemaining === 1 ? "week" : "weeks"}
        </span>
      </div>

      <RecoveryTimeline weeksRemaining={weeksRemaining} totalWeeks={injury.totalWeeks} severity={severity} />
    </button>
  );
}

function QuickStats({ players }) {
  const total = players.length;
  const avgRecovery = total > 0 ? (players.reduce((s, p) => s + getInjuryWeeksRemaining(p), 0) / total).toFixed(1) : "0.0";
  const seasonEnding = players.filter(p => getSeverity(p.injury).label === "Season-Ending").length;
  const onIR = players.filter(p => p.onIR || p.injury?.ir).length;
  const stats = [
    { label: "Total Injuries", value: total, color: "var(--accent)" },
    { label: "Avg Recovery", value: `${avgRecovery}w`, color: "var(--warning)" },
    { label: "Season-Ending", value: seasonEnding, color: "var(--danger)" },
    { label: "On IR", value: onIR, color: "#ef4444" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
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

function AvailabilityCommand({ model, onNavigate }) {
  const statusColors = STATUS_COLORS[model.status?.tone] ?? STATUS_COLORS.info;
  return (
    <Card className="card-premium" style={{ marginBottom: 16 }}>
      <CardContent className="p-4" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Availability Command</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Season {model.context?.season ?? "?"} · Week {model.context?.week ?? "?"}</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 999, color: statusColors.color, background: statusColors.bg, border: `1px solid ${statusColors.border}` }}>
            {model.status?.label ?? 'Manageable'}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>My Team Injured</div><strong>{model.myTeamInjured.length}</strong></div>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>Injured Starters</div><strong>{model.injuredStarterCount}</strong></div>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>Replacement Risk</div><strong>{model.replacementRiskCount}</strong></div>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{model.recommendedNextAction}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => onNavigate?.(model.routeHints.rosterDepth)}>Open Roster / Depth for Replacements</Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.(model.routeHints.weeklyPrep)}>Back to Weekly Prep</Button>
          <Button size="sm" variant="secondary" onClick={() => onNavigate?.(model.routeHints.hq)}>Back to HQ</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyTeamAvailability({ model, onPlayerSelect, onNavigate }) {
  return (
    <Card className="card-premium" style={{ marginBottom: 20 }}>
      <CardContent className="p-4">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>⭐ My Team Availability</h2>
        {model.myTeamInjured.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 0", color: "var(--text-muted)", fontSize: 13 }}>✅ No active injuries on your roster.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {model.myTeamInjured.map((player) => {
              const weeksRemaining = getInjuryWeeksRemaining(player);
              const severity = getSeverity(player.injury || {});
              return (
                <div key={player.id ?? player.pid ?? player.name} style={{ border: "1px solid var(--hairline)", borderLeft: `4px solid ${severity.color}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14 }}>{player.name}</strong>
                    <Badge variant="outline">{player.pos || player.position || '??'}</Badge>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>OVR {player.ovr ?? '?'}</span>
                    {player.isStarter && <Badge style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "none" }}>Starter</Badge>}
                    {!player.isStarter && player.isKeyContributor && <Badge style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6", border: "none" }}>Key Contributor</Badge>}
                    {player.replacementRisk && <Badge style={{ background: "rgba(245,158,11,0.16)", color: "#f59e0b", border: "none" }}>Replacement Risk</Badge>}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, color: "var(--text-muted)" }}>
                    {player.injury?.type || 'General Injury'} · {weeksRemaining} {weeksRemaining === 1 ? 'week' : 'weeks'} remaining
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {onPlayerSelect && <Button size="sm" variant="outline" onClick={() => onPlayerSelect(player.id ?? player.pid)}>View Player</Button>}
                    <Button size="sm" onClick={() => onNavigate?.('Team:Roster / Depth')}>Open Roster / Depth for Replacements</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterBar({ posFilter, setPosFilter, sevFilter, setSevFilter, teamFilter, setTeamFilter, sortKey, setSortKey, teams }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {POS_FILTERS.map(p => (
          <Button key={p} variant={posFilter === p ? "default" : "outline"} size="sm" onClick={() => setPosFilter(p)}>{p}</Button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>
          {SEVERITY_FILTERS.map(s => <option key={s} value={s}>{s === "ALL" ? "All Severities" : s}</option>)}
        </select>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>
          <option value="ALL">All Teams</option>
          {teams.map(t => <option key={t.id ?? t.tid} value={t.id ?? t.tid}>{t.abbr || t.name}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sort:</span>
          {SORT_OPTIONS.map(o => <Button key={o.key} variant={sortKey === o.key ? "default" : "outline"} size="sm" onClick={() => setSortKey(o.key)}>{o.label}</Button>)}
        </div>
      </div>
    </div>
  );
}

function InjuryHistoryLog({ league }) {
  const log = league?.injuryLog || league?.injuries || [];
  const recent = log.slice(-15).reverse();
  if (recent.length === 0) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 10, padding: 16, marginTop: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>📋 Recent Injury Log</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recent.map((entry, i) => {
          const sev = getSeverity(entry);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 0", borderBottom: i < recent.length - 1 ? "1px solid var(--hairline)" : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: sev.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{entry.playerName || entry.name || "Unknown"}</span>
              <span style={{ color: "var(--text-muted)" }}>{entry.teamAbbr && `(${entry.teamAbbr})`}</span>
              <span style={{ color: "var(--text-muted)", flex: 1 }}>— {entry.type || "Injury"}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Wk {entry.week ?? "?"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InjuryReport({ league, onPlayerSelect, onNavigate }) {
  useEffect(() => {
    markWeeklyPrepStep(league, 'injuriesReviewed', true);
  }, [league?.seasonId, league?.week, league?.userTeamId]);

  const [posFilter, setPosFilter] = useState("ALL");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("weeksRemaining");

  const teams = league?.teams || [];
  const availabilityModel = useMemo(() => deriveInjuryReadinessModel({ league, source: 'team-injuries' }), [league]);
  const allInjured = availabilityModel.leagueInjuredPlayers;

  const teamBurden = useMemo(() => teams.map((t) => {
    const roster = t.roster || t.players || [];
    const injured = roster.filter((p) => isPlayerInjured(p));
    const totalWeeks = injured.reduce((sum, p) => sum + getInjuryWeeksRemaining(p), 0);
    return { id: t.id ?? t.tid, abbr: t.abbr || t.name, count: injured.length, totalWeeks };
  }).sort((a, b) => (b.count - a.count) || (b.totalWeeks - a.totalWeeks)).slice(0, 8), [teams]);

  const positionPressure = useMemo(() => {
    const buckets = {};
    allInjured.forEach((p) => {
      const pos = String(p.pos || p.position || "?").toUpperCase();
      buckets[pos] = (buckets[pos] ?? 0) + 1;
    });
    return Object.entries(buckets).map(([pos, count]) => ({ pos, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [allInjured]);

  const filteredLeague = useMemo(() => {
    let list = [...allInjured];
    if (posFilter !== "ALL") list = list.filter(p => (p.pos || p.position) === posFilter);
    if (sevFilter !== "ALL") list = list.filter(p => getSeverity(p.injury).label === sevFilter);
    if (teamFilter !== "ALL") {
      const tid = typeof teamFilter === "string" ? parseInt(teamFilter, 10) : teamFilter;
      list = list.filter(p => p.teamId === tid || p.teamId === teamFilter);
    }
    list.sort((a, b) => {
      if (sortKey === "weeksRemaining") return getInjuryWeeksRemaining(b) - getInjuryWeeksRemaining(a);
      if (sortKey === "severity") {
        const sa = getSeverity(a.injury).label;
        const sb = getSeverity(b.injury).label;
        return (SEVERITY_ORDER[sb] || 0) - (SEVERITY_ORDER[sa] || 0);
      }
      if (sortKey === "ovr") return (b.ovr ?? 0) - (a.ovr ?? 0);
      return 0;
    });
    return list;
  }, [allInjured, posFilter, sevFilter, teamFilter, sortKey]);

  return (
    <div className="fade-in" style={{ padding: "var(--space-4)", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>🏥 Injury Report</h1>
        <Badge variant="outline" style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--hairline)" }}>
          Season {league?.season ?? "?"} · Week {league?.week ?? "?"}
        </Badge>
      </div>

      <AvailabilityCommand model={availabilityModel} onNavigate={onNavigate} />
      <MyTeamAvailability model={availabilityModel} onPlayerSelect={onPlayerSelect} onNavigate={onNavigate} />

      <QuickStats players={allInjured} />

      <Card className="card-premium" style={{ marginBottom: 20 }}>
        <CardContent className="p-4" style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Availability pressure snapshots</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Most impacted teams</div>
              {teamBurden.map((t) => <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span>{t.abbr}</span><span>{t.count} injuries · {t.totalWeeks} wks</span></div>)}
            </div>
            <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Position-group pressure</div>
              {positionPressure.map((p) => <div key={p.pos} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span>{p.pos}</span><span>{p.count} out</span></div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-premium">
        <CardContent className="p-4">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            🏈 League Injuries
            <Badge style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "none" }} className="text-xs font-semibold">{filteredLeague.length} players</Badge>
          </h2>

          <FilterBar posFilter={posFilter} setPosFilter={setPosFilter} sevFilter={sevFilter} setSevFilter={setSevFilter} teamFilter={teamFilter} setTeamFilter={setTeamFilter} sortKey={sortKey} setSortKey={setSortKey} teams={teams} />

          {filteredLeague.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>No injuries match current filters.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filteredLeague.map(p => (
                <InjuryCard key={`${p.teamId}-${p.id ?? p.pid ?? p.name}`} player={p} onPlayerSelect={onPlayerSelect} showTeam />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InjuryHistoryLog league={league} />
    </div>
  );
}
