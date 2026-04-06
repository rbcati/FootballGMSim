import React, { useState, useMemo, useEffect } from "react";
import PlayerCard from "./PlayerCard.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeTeamNeedsSummary, formatNeedsLine, summarizeFreeAgentMarket } from "../utils/marketSignals.js";

const POS_COLORS = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6", TE: "#a855f7",
  OL: "#f59e0b", DL: "#ec4899", LB: "#0ea5e9", CB: "#14b8a6",
  S: "#6366f1", K: "#9ca3af", P: "#6b7280",
};

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];
const SORT_KEYS = [
  { key: "ovr", label: "OVR" },
  { key: "age", label: "Age" },
  { key: "ask", label: "Ask" },
  { key: "pressure", label: "Pressure" },
];

function MiniStat({ label, value, color = "var(--text)" }) {
  return (
    <Card className="card-premium" style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center" }}>
      <CardContent className="p-0">
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: "var(--text-base)", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </CardContent>
    </Card>
  );
}

function pressureScore(player) {
  const market = player?.market ?? {};
  const offers = player?.offers ?? {};
  const bidderCount = Number(offers?.count ?? market?.bidderCount ?? 0);
  const urgency = market?.urgency === "high" ? 3 : market?.urgency === "medium" ? 2 : 1;
  const leadPenalty = offers?.userOffered && !offers?.userIsTopBidder ? 2 : 0;
  return bidderCount + urgency + leadPenalty;
}

export default function FreeAgencyHub({ league, actions, onNavigate }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("pressure");
  const [search, setSearch] = useState("");
  const [faState, setFaState] = useState(null);
  const [loading, setLoading] = useState(false);

  const userTeam = league?.teams?.find((t) => t.id === league.userTeamId);
  const capRoom = userTeam?.capRoom ?? 0;
  const needsSummary = useMemo(() => computeTeamNeedsSummary(userTeam), [userTeam]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    actions?.getFreeAgents?.()
      .then((res) => {
        if (!active) return;
        setFaState(res?.payload ?? null);
      })
      .catch((err) => {
        if (!active) return;
        console.error("FA Hub load error", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [actions, league?.week, league?.phase]);

  const freeAgents = faState?.freeAgents ?? [];

  const filtered = useMemo(() => {
    let players = [...freeAgents];
    if (posFilter !== "ALL") players = players.filter((p) => (p.pos || p.position) === posFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      players = players.filter((p) => p.name?.toLowerCase().includes(q));
    }
    players.sort((a, b) => {
      if (sortKey === "pressure") return pressureScore(b) - pressureScore(a);
      if (sortKey === "ovr") return (b.ovr || 0) - (a.ovr || 0);
      if (sortKey === "age") return (a.age || 0) - (b.age || 0);
      if (sortKey === "ask") return ((b?.demandProfile?.askAnnual ?? 0) - (a?.demandProfile?.askAnnual ?? 0));
      return 0;
    });
    return players;
  }, [freeAgents, posFilter, sortKey, search]);

  const trackedTargets = useMemo(() => filtered.filter((p) => p?.offers?.userOffered).slice(0, 5), [filtered]);
  const userLeadCount = useMemo(() => filtered.filter((p) => summarizeFreeAgentMarket(p).userLeads).length, [filtered]);
  const noSnapshotCount = useMemo(() => filtered.filter((p) => !summarizeFreeAgentMarket(p).hasVisibleSnapshot).length, [filtered]);

  return (
    <div className="fade-in">
      <Card className="card-premium" style={{ marginBottom: "var(--space-4)" }}>
        <CardContent style={{ padding: "var(--space-4)", display: "grid", gap: 8 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>FA Hub · Market overview</div>
          <div style={{ fontWeight: 700 }}>Use FA Hub to triage pressure and shortlist targets. Use Free Agency to execute and adjust bids.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => onNavigate?.("Free Agency")}>Open Free Agency Workspace</Button>
            <Badge variant="outline">{formatNeedsLine(needsSummary)}</Badge>
          </div>
        </CardContent>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <MiniStat label="Available" value={freeAgents.length} />
        <MiniStat label="Tracked" value={trackedTargets.length} color={trackedTargets.length ? "var(--accent)" : "var(--text)"} />
        <MiniStat label="You Lead" value={userLeadCount} color={userLeadCount ? "var(--success)" : "var(--text)"} />
        <MiniStat label="Unknown" value={noSnapshotCount} color={noSnapshotCount ? "var(--warning)" : "var(--text)"} />
        <MiniStat label="Cap Room" value={`$${capRoom.toFixed(1)}M`} color={capRoom > 10 ? "var(--success)" : capRoom > 0 ? "var(--warning)" : "var(--danger)"} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-4)", alignItems: "center" }}>
        <Input type="text" placeholder="Search free agents..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 180px", maxWidth: 280 }} />
        <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
          {SORT_KEYS.map((s) => (
            <button key={s.key} className={`division-tab${sortKey === s.key ? " active" : ""}`} onClick={() => setSortKey(s.key)} style={{ fontSize: 11 }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="division-tabs" style={{ marginBottom: "var(--space-4)" }}>
        {POS_FILTERS.map((p) => (
          <button key={p} className={`division-tab${posFilter === p ? " active" : ""}`} onClick={() => setPosFilter(p)}>{p}</button>
        ))}
      </div>

      <Card className="card-premium hover-lift">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Market Overview ({filtered.length})</CardTitle>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {loading ? "Refreshing market snapshot..." : "All activity shown below comes from current market state"}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-3)", padding: "var(--space-3)" }}>
              {filtered.slice(0, 60).map((fa, i) => {
                const pos = fa.pos || fa.position;
                const posColor = POS_COLORS[pos] || "#9ca3af";
                const market = summarizeFreeAgentMarket(fa);
                return (
                  <div
                    key={fa.id}
                    className={`card-premium hover-lift fade-in stagger-${Math.min(i + 1, 8)}`}
                    style={{ padding: "var(--space-3) var(--space-4)", borderLeft: `3px solid ${posColor}` }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${posColor}22`, border: `2px solid ${posColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, color: posColor, flexShrink: 0 }}>
                        {fa.name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fa.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 2 }}>
                          <Badge className="text-[10px] font-bold" style={{ background: `${posColor}22`, color: posColor, borderColor: posColor }}>{pos}</Badge>
                          <PlayerCard player={fa} variant="compact" style={{ margin: 0, padding: 0 }} />
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Age {fa.age}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: 3 }}>
                          {market.hasVisibleSnapshot ? `${market.competitionLabel} · ${market.decision}` : "No visible market snapshot"}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {market.preference ?? "No preference profile visible"}{market.patienceLabel ? ` · ${market.patienceLabel}` : ""}
                        </div>
                        {market.decisionReason && (
                          <div style={{ fontSize: "10px", color: "var(--text-subtle)" }}>{market.decisionReason}</div>
                        )}
                      </div>

                      <div className="text-right" style={{ minWidth: 116 }}>
                        <div className="text-sm font-bold tabular-nums" style={{ color: market.userLeads ? "var(--success)" : "var(--text)" }}>{market.topOfferLabel}</div>
                        <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{market.topBidTeam ?? "No current market snapshot"}</div>
                        <div className="text-xs" style={{ color: market.userLeads ? "var(--success)" : "var(--warning)" }}>{market.leadLabel}</div>
                        <Button size="sm" variant="secondary" style={{ marginTop: 6 }} onClick={() => onNavigate?.("Free Agency")}>
                          Open workspace
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
