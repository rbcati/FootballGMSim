/**
 * AdvancedStats.jsx — PFF-style Advanced Stats Panel
 *
 * Computes per-game PFF-style grades (0-100) from play logs and displays:
 *  - Overall grade + 5 sub-grades (per position)
 *  - Metrics: yards per attempt, pressure rate, run stop %, coverage snap %, etc.
 *  - Leaderboard cards for top graded players
 *
 * Usage:
 *   <AdvancedStats logs={playLogs} homeTeam={...} awayTeam={...} />
 */

import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Grade computation from play logs ─────────────────────────────────────────

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

function computeGrades(logs) {
  if (!Array.isArray(logs) || !logs.length) return {};
  const players = {};

  const getP = (ref) => {
    if (!ref || typeof ref !== "object") return null;
    const id = String(ref.id ?? ref.name ?? "?");
    if (!players[id]) {
      players[id] = {
        ref,
        pos: ref.pos || "?",
        // raw tracking
        passAtt: 0, passComp: 0, passYds: 0, passTDs: 0, passINTs: 0,
        rushAtt: 0, rushYds: 0, rushTDs: 0,
        targets: 0, receptions: 0, recYds: 0, recTDs: 0,
        sacks: 0, tackles: 0, passDefls: 0, forcedFumbles: 0,
        blockedFor: 0, // run yards when this player was on field as blocker
        snapCount: 0,
      };
    }
    players[id].snapCount++;
    return players[id];
  };

  for (const l of logs) {
    if (!l || typeof l !== "object") continue;

    if (l.passer) {
      const p = getP(l.passer);
      if (p) {
        p.passAtt++;
        if (l.completed) { p.passComp++; p.passYds += Number(l.passYds || l.yards || 0); }
        if (l.isTouchdown && l.tdType === "pass") p.passTDs++;
      }
    }

    if (l.intedQB && l.type === "interception") {
      const qb = getP(l.intedQB);
      if (qb) qb.passINTs++;
    }

    if (l.type === "run" && l.player) {
      const p = getP(l.player);
      if (p) {
        p.rushAtt++;
        p.rushYds += Number(l.rushYds || l.yards || 0);
        if (l.isTouchdown) p.rushTDs++;
      }
    }

    if (l.type === "pass" && l.completed && l.player) {
      const p = getP(l.player);
      if (p) {
        p.receptions++;
        p.targets++;
        p.recYds += Number(l.recYds || l.yards || 0);
        if (l.isTouchdown) p.recTDs++;
      }
    }
    if (l.type === "pass" && !l.completed && l.player) {
      const p = getP(l.player);
      if (p) p.targets++;
    }

    if (l.type === "sack" && l.player)     { const p = getP(l.player); if (p) p.sacks++; }
    if (l.tackler)                          { const p = getP(l.tackler); if (p) p.tackles++; }
    if (l.defender)                         { const p = getP(l.defender); if (p) p.passDefls++; }
    if (l.forcedFumble)                     { const p = getP(l.forcedFumble); if (p) p.forcedFumbles++; }
  }

  // ── Grade formulas (rough PFF approximations) ──────────────────────────────
  const graded = {};

  for (const [id, p] of Object.entries(players)) {
    const pos = p.pos;
    let overall = 60; // baseline
    const sub = {};

    if (pos === "QB") {
      const compPct = p.passAtt > 0 ? p.passComp / p.passAtt : 0.62;
      const ypa = p.passAtt > 0 ? p.passYds / p.passAtt : 0;
      const tdRate = p.passAtt > 0 ? p.passTDs / p.passAtt : 0;
      const intRate = p.passAtt > 0 ? p.passINTs / p.passAtt : 0;
      sub.accuracy   = clamp(Math.round(compPct * 100 * 0.9 + 10));
      sub.efficiency  = clamp(Math.round((ypa - 4) * 8 + 60));
      sub.bigPlays    = clamp(Math.round(tdRate * 400 + 55));
      sub.ballSecurity = clamp(Math.round(100 - intRate * 500));
      sub.mobility    = 60;
      overall = clamp(Math.round((sub.accuracy * 0.3 + sub.efficiency * 0.3 + sub.bigPlays * 0.2 + sub.ballSecurity * 0.2)));

    } else if (pos === "RB") {
      const ypc = p.rushAtt > 0 ? p.rushYds / p.rushAtt : 4;
      sub.rushing     = clamp(Math.round((ypc - 3) * 10 + 65));
      sub.receiving   = clamp(p.receptions > 0 ? Math.round((p.recYds / p.receptions) * 5 + 55) : 60);
      sub.blocking    = 60;
      sub.bigPlays    = clamp(Math.round(p.rushTDs * 8 + (p.rushYds > 60 ? 10 : 0) + 55));
      sub.vision      = clamp(Math.round(ypc * 6 + 42));
      overall = clamp(Math.round(sub.rushing * 0.45 + sub.receiving * 0.2 + sub.bigPlays * 0.2 + sub.blocking * 0.15));

    } else if (pos === "WR" || pos === "TE") {
      const ypr = p.receptions > 0 ? p.recYds / p.receptions : 0;
      const catchRate = p.targets > 0 ? p.receptions / p.targets : 0.7;
      sub.separation  = clamp(Math.round(catchRate * 80 + 20));
      sub.receiving   = clamp(Math.round((ypr - 5) * 4 + 68));
      sub.blocking    = pos === "TE" ? 65 : 55;
      sub.bigPlays    = clamp(Math.round(p.recTDs * 10 + (p.recYds > 50 ? 8 : 0) + 52));
      sub.routeRunning = clamp(Math.round(catchRate * 90 + 15));
      overall = clamp(Math.round(sub.separation * 0.25 + sub.receiving * 0.3 + sub.bigPlays * 0.25 + sub.routeRunning * 0.2));

    } else if (pos === "DL" || pos === "DE" || pos === "DT") {
      sub.passRush    = clamp(Math.round(p.sacks * 12 + p.tackles * 2 + 55));
      sub.runDefense  = clamp(Math.round(p.tackles * 3 + 58));
      sub.tackling    = clamp(Math.round(p.tackles * 4 + 52));
      sub.technique   = clamp(Math.round((p.sacks + p.forcedFumbles) * 8 + 58));
      sub.motor       = 65;
      overall = clamp(Math.round(sub.passRush * 0.4 + sub.runDefense * 0.3 + sub.tackling * 0.2 + sub.technique * 0.1));

    } else if (pos === "LB") {
      sub.coverage    = clamp(Math.round(p.passDefls * 8 + 60));
      sub.tackling    = clamp(Math.round(p.tackles * 4 + 50));
      sub.passRush    = clamp(Math.round(p.sacks * 14 + 55));
      sub.runDefense  = clamp(Math.round(p.tackles * 3.5 + 55));
      sub.athleticism = 62;
      overall = clamp(Math.round(sub.tackling * 0.35 + sub.coverage * 0.25 + sub.passRush * 0.2 + sub.runDefense * 0.2));

    } else if (pos === "CB" || pos === "S") {
      sub.coverage    = clamp(Math.round(p.passDefls * 9 + 60));
      sub.tackling    = clamp(Math.round(p.tackles * 4 + 52));
      sub.ballHawk    = clamp(Math.round(p.passDefls * 7 + p.forcedFumbles * 8 + 58));
      sub.athleticism = 65;
      sub.discipline  = 65;
      overall = clamp(Math.round(sub.coverage * 0.45 + sub.tackling * 0.25 + sub.ballHawk * 0.3));

    } else {
      // OL, K, P etc — baseline
      sub.overall = 65;
      overall = 65;
    }

    graded[id] = {
      ref: p.ref,
      pos,
      overall,
      sub,
      stats: p,
    };
  }

  return graded;
}

// ── Grade badge colour ─────────────────────────────────────────────────────────

function gradeColor(g) {
  if (g >= 90) return "#FFD60A";
  if (g >= 80) return "#BF5AF2";
  if (g >= 70) return "#0A84FF";
  if (g >= 60) return "#34C759";
  return "#636366";
}

// ── Grade tier label ───────────────────────────────────────────────────────────

function gradeTierLabel(g) {
  if (g >= 90) return "Elite";
  if (g >= 80) return "Star";
  if (g >= 70) return "Good";
  if (g >= 60) return "Average";
  return "Poor";
}

// ── Radar bar ─────────────────────────────────────────────────────────────────

function RadarBar({ label, value, maxValue = 100 }) {
  const pct = Math.min(100, (value / maxValue) * 100);
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

// ── Player grade card ─────────────────────────────────────────────────────────

function PlayerGradeCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const { ref, pos, overall, sub, stats } = entry;
  const color = gradeColor(overall);
  const tierLabel = gradeTierLabel(overall);

  const subKeys = Object.keys(sub || {});

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: "var(--surface)", border: `1px solid ${expanded ? color + "66" : "var(--hairline)"}`,
        borderRadius: 12, padding: "10px 12px", cursor: "pointer",
        transition: "border-color 0.2s",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Grade badge */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${color}20`, border: `2px solid ${color}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 900, color, lineHeight: 1 }}>{overall}</span>
          <span style={{ fontSize: "0.52rem", fontWeight: 700, color, opacity: 0.7 }}>PFF</span>
        </div>
        {/* Player info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ref?.name || "?"}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{pos}</span>
            {stats.snapCount > 0 && <span>{stats.snapCount} snaps</span>}
            <Badge
              variant="outline"
              className="text-xs px-1 py-0 h-4"
              style={{ color, borderColor: color + "66", fontSize: "0.6rem" }}
            >
              {tierLabel}
            </Badge>
          </div>
        </div>
        {/* Quick stat */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {pos === "QB" && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {stats.passComp}/{stats.passAtt} · {stats.passYds} yds
            </div>
          )}
          {(pos === "RB") && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {stats.rushAtt} car · {stats.rushYds} yds
            </div>
          )}
          {(pos === "WR" || pos === "TE") && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {stats.receptions}/{stats.targets} · {stats.recYds} yds
            </div>
          )}
          {["DL","DE","DT","LB","CB","S"].includes(pos) && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {stats.tackles}tkl{stats.sacks > 0 ? ` · ${stats.sacks}sk` : ""}{stats.passDefls > 0 ? ` · ${stats.passDefls}pd` : ""}
            </div>
          )}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {/* Expanded sub-grades */}
      {expanded && subKeys.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
          {subKeys.map(k => (
            <RadarBar key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={sub[k]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdvancedStats({ logs, homeTeam, awayTeam }) {
  const graded = useMemo(() => computeGrades(logs || []), [logs]);
  const entries = Object.values(graded);

  const offPlayers = entries
    .filter(e => ["QB","RB","WR","TE","OL"].includes(e.pos))
    .sort((a, b) => b.overall - a.overall);
  const defPlayers = entries
    .filter(e => ["DL","DE","DT","LB","CB","S"].includes(e.pos))
    .sort((a, b) => b.overall - a.overall);
  const allPlayers = [...entries].sort((a, b) => b.overall - a.overall);

  if (!logs?.length) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>
        No play data available for grade calculations.
      </div>
    );
  }

  return (
    <Card className="card-premium" style={{ paddingBottom: 16 }}>
      <CardHeader style={{ padding: "12px 16px 8px" }}>
        <CardTitle style={{ fontSize: "0.65rem", fontWeight: 800,
          color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "1px" }}>
          PFF-Style Performance Grades
        </CardTitle>
      </CardHeader>
      <CardContent style={{ padding: 0 }}>
        <Tabs defaultValue="offense">
          <TabsList style={{ margin: "0 16px 12px", gap: 6 }}>
            <TabsTrigger value="offense">⚔️ Offense</TabsTrigger>
            <TabsTrigger value="defense">🛡️ Defense</TabsTrigger>
            <TabsTrigger value="all">All Players</TabsTrigger>
          </TabsList>

          <TabsContent value="offense">
            <ScrollArea className="h-[500px]">
              <div style={{ padding: "0 16px" }}>
                {offPlayers.slice(0, 12).map((entry, i) => (
                  <PlayerGradeCard key={i} entry={entry} />
                ))}
                {offPlayers.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No players in this category.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="defense">
            <ScrollArea className="h-[500px]">
              <div style={{ padding: "0 16px" }}>
                {defPlayers.slice(0, 12).map((entry, i) => (
                  <PlayerGradeCard key={i} entry={entry} />
                ))}
                {defPlayers.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No players in this category.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="all">
            <ScrollArea className="h-[500px]">
              <div style={{ padding: "0 16px" }}>
                {allPlayers.slice(0, 12).map((entry, i) => (
                  <PlayerGradeCard key={i} entry={entry} />
                ))}
                {allPlayers.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No players in this category.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
