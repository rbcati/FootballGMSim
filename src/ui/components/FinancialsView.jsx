/**
 * FinancialsView.jsx — Phase 30: Financial Consequences & Cap Management
 *
 * Dashboard showing:
 *   • Hard Cap usage bar (active cap + dead money vs. $301.2M ceiling)
 *   • Dead Money (Current Year) and Projected Dead Money (Next Year)
 *   • Per-player cap hit table with Restructure action for eligible players
 *   • June 1st rule indicator (which dead-money rule applies given current phase)
 *
 * Data flow:
 *   Mount / teamId change → actions.getRoster(teamId) → local state
 *   Restructure → actions.restructureContract(playerId, teamId) → re-fetch
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import DonutChart from "./DonutChart";
import { getAvailableCap } from "../../data/team-utils.js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FranchiseInvestmentsPanel from "./FranchiseInvestmentsPanel.jsx";
import { classifyTeamDirection, evaluateResignRecommendation } from "../utils/contractInsights.js";
import { CONTRACT_PLAN_LABELS, normalizeManagement } from "../utils/playerManagement.js";
import InfoTip from "./InfoTip.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const HARD_CAP = 301.2;

function fmt(val) {
  if (val == null || isNaN(val)) return "—";
  const sign = val < 0 ? "-" : "";
  return `${sign}$${Math.abs(val).toFixed(2)}M`;
}

function capHitOf(player) {
  const c = player.contract;
  if (!c) return 0;
  return (c.baseAnnual ?? 0) + (c.signingBonus ?? 0) / (c.yearsTotal || 1);
}

function pct(used, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

/** Phase → human-readable June-1 label */
function june1Label(phase) {
  const post = ["free_agency", "draft", "preseason", "regular", "playoffs"];
  return post.includes(phase) ? "Post-June 1" : "Pre-June 1";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CapBar({ activeCap, deadCap, total }) {
  const activeW = pct(activeCap, total);
  const deadW = pct(deadCap, total);
  const over = activeCap + deadCap > total;

  return (
    <div style={{ marginBottom: "var(--space-4)" }}>

      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
        <DonutChart data={[
            { value: activeCap, color: "var(--accent)" },
            { value: deadCap, color: "var(--danger)" },
            { value: Math.max(0, total - activeCap - deadCap), color: "var(--surface-strong)", label: over ? "OVER" : `${fmt(total - activeCap - deadCap)}` }
        ]} size={100} strokeWidth={12} />

        <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: "var(--accent)" }}>Active: {fmt(activeCap)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: "var(--danger)" }}>Dead: {fmt(deadCap)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: over ? "var(--danger)" : "var(--success)" }}>
                  {over ? "⚠ OVER CAP" : `Available: ${fmt(total - activeCap - deadCap)}`}
                </span>
                <span style={{ color: "var(--text-muted)" }}>Limit: {fmt(total)}</span>
            </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 6,
          fontSize: 11,
          color: "var(--text-secondary)",
        }}
      >
        <span>
          <span style={{ color: "var(--accent, #0A84FF)" }}>■</span> Active Cap
        </span>
        <span>
          <span style={{ color: "rgba(255,149,0,0.9)" }}>■</span> Dead Money
        </span>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, danger }) {
  return (
    <div
      style={{
        background: "var(--bg-secondary, #1e1e2e)",
        borderRadius: 8,
        padding: "12px 16px",
        minWidth: 130,
        flex: 1,
        border: danger
          ? "1px solid var(--danger)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: danger ? "var(--danger)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FinancialsView({ league, actions }) {
  const [rosterData, setRosterData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restructuring, setRestructuring] = useState(null); // playerId being restructured
  const [sortCol, setSortCol] = useState("capHit");
  const [sortDir, setSortDir] = useState("desc");
  const [notification, setNotification] = useState(null);
  const [contractMarks, setContractMarks] = useState({});
  const [applyingBatch, setApplyingBatch] = useState(false);

  const teamId = league?.userTeamId;
  const phase = league?.phase ?? "";

  const fetchRoster = useCallback(async () => {
    if (!teamId || !actions?.getRoster) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await actions.getRoster(teamId);
      if (resp?.payload) setRosterData(resp.payload);
    } catch (e) {
      setError(e.message ?? "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [teamId, actions]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Re-fetch when league state changes (after restructure, release, etc.)
  useEffect(() => {
    fetchRoster();
  }, [league?.phase, fetchRoster]);

  const team = rosterData?.team ?? {};
  const userTeam = (league?.teams ?? []).find((t) => t.id === teamId) ?? null;
  const players = rosterData?.players ?? [];

  const hardCap = team.capTotal ?? HARD_CAP;
  const activeCap = Math.max(0, (team.capUsed ?? 0) - (team.deadCap ?? 0));
  const deadCap = team.deadCap ?? 0;
  const deadMoneyNext = team.deadMoneyNextYear ?? 0;
  const capUsedTotal = team.capUsed ?? 0;
  const capRoom = Math.round((hardCap - capUsedTotal) * 100) / 100;
  const isOverCap = capUsedTotal > hardCap;
  const june1 = june1Label(phase);

  // Enrich players with computed cap hit
  const enriched = useMemo(
    () =>
      players.map((p) => ({
        ...p,
        capHit: capHitOf(p),
        yearsRemaining: p.contract?.years ?? p.years ?? 0,
        baseAnnual: p.contract?.baseAnnual ?? p.baseAnnual ?? 0,
        signingBonus: p.contract?.signingBonus ?? 0,
        yearsTotal: p.contract?.yearsTotal ?? 1,
        canRestructure:
          (p.contract?.years ?? 1) >= 2 &&
          (p.contract?.baseAnnual ?? p.baseAnnual ?? 0) > 0,
      })),
    [players],
  );

  // Sorted player list
  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      let va = a[sortCol] ?? 0;
      let vb = b[sortCol] ?? 0;
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [enriched, sortCol, sortDir]);

  const expiringDashboard = useMemo(() => {
    const direction = classifyTeamDirection(userTeam, Number(league?.week ?? 1));
    const expiring = enriched
      .filter((p) => Number(p?.contract?.years ?? p?.contract?.yearsRemaining ?? 0) <= 1)
      .map((p) => {
        const rec = evaluateResignRecommendation(p, { team: userTeam, direction, roster: enriched });
        const estimatedDemand = Math.max(Number(p?.contract?.baseAnnual ?? 0) * 1.12, Number(p?.ovr ?? 60) * 0.14);
        const willingness = rec.negotiationRisk === 'Low' ? 'High' : rec.negotiationRisk === 'High' ? 'Low' : 'Medium';
        const marketPressure = rec.replacementDifficulty === 'High' ? 'High' : rec.replacementDifficulty === 'Medium' ? 'Medium' : 'Low';
        const management = normalizeManagement(p);
        return { ...p, rec, estimatedDemand, willingness, marketPressure, management };
      });
    const summary = {
      expiringStarters: expiring.filter((p) => (p.ovr ?? 0) >= 75).length,
      likelyWalk: expiring.filter((p) => p.rec.tier === 'let_walk').length,
      estimatedExtensionCost: expiring.reduce((sum, p) => sum + p.estimatedDemand, 0),
      capRiskNextYear: expiring.filter((p) => (p.age ?? 0) >= 30 && p.estimatedDemand >= 12).length,
    };
    return { rows: expiring, summary };
  }, [enriched, userTeam, league?.week]);


  const applyExpiringBatchAction = useCallback(async (flag) => {
    const rows = expiringDashboard.rows ?? [];
    if (!rows.length || !actions?.updatePlayerManagement || !teamId) return;
    setApplyingBatch(true);
    try {
      await Promise.all(rows.map((row) => {
        const current = normalizeManagement(row);
        const nextPlan = current.contractPlan.includes(flag)
          ? current.contractPlan.filter((f) => f !== flag)
          : [...current.contractPlan.filter((f) => f !== flag), flag];
        return actions.updatePlayerManagement(row.id, teamId, {
          contractPlan: nextPlan,
          tradeStatus: flag === 'trade_candidate' ? 'actively_shopping' : current.tradeStatus,
        });
      }));
      await fetchRoster();
      setContractMarks((prev) => ({ ...prev, batchAction: flag }));
      setNotification({ type: 'success', msg: `Updated contract plan: ${CONTRACT_PLAN_LABELS[flag]}.` });
    } catch (e) {
      setNotification({ type: 'error', msg: e?.message ?? 'Unable to apply contract plan batch action.' });
    } finally {
      setApplyingBatch(false);
    }
  }, [actions, expiringDashboard.rows, fetchRoster, teamId]);
  const capByYear = useMemo(() => {
    const years = [1, 2, 3, 4];
    return years.map((yr) => {
      const committed = enriched.reduce((sum, p) => {
        const rem = Number(p.yearsRemaining ?? 0);
        if (rem < yr) return sum;
        const bonusYears = Math.max(Number(p.yearsTotal ?? 1), 1);
        return sum + Number(p.baseAnnual ?? 0) + (Number(p.signingBonus ?? 0) / bonusYears);
      }, 0);
      return { yearOffset: yr, committed };
    });
  }, [enriched]);

  const expiringDeals = useMemo(
    () => [...enriched].filter((p) => Number(p.yearsRemaining) === 1).sort((a, b) => (b.capHit ?? 0) - (a.capHit ?? 0)).slice(0, 8),
    [enriched],
  );

  const largestDeals = useMemo(
    () => [...enriched].sort((a, b) => (b.capHit ?? 0) - (a.capHit ?? 0)).slice(0, 8),
    [enriched],
  );

  const capByGroup = useMemo(() => {
    const groupOf = (pos = "") => {
      const p = String(pos).toUpperCase();
      if (["QB"].includes(p)) return "QB";
      if (["RB", "FB"].includes(p)) return "RB";
      if (["WR", "TE"].includes(p)) return "Receivers";
      if (["OL", "OT", "OG", "C"].includes(p)) return "OL";
      if (["DL", "DE", "DT", "EDGE"].includes(p)) return "DL";
      if (["LB"].includes(p)) return "LB";
      if (["CB", "S", "SS", "FS"].includes(p)) return "DB";
      return "ST";
    };
    const buckets = {};
    for (const p of enriched) {
      const g = groupOf(p.pos);
      buckets[g] = (buckets[g] ?? 0) + Number(p.capHit ?? 0);
    }
    return Object.entries(buckets).map(([group, cap]) => ({ group, cap, pct: hardCap > 0 ? (cap / hardCap) * 100 : 0 })).sort((a, b) => b.cap - a.cap);
  }, [enriched, hardCap]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const handleRestructure = async (player) => {
    if (!actions?.restructureContract) return;
    setRestructuring(player.id);
    setNotification(null);
    try {
      const resp = await actions.restructureContract(player.id, teamId);
      if (resp?.payload?.restructureResult) {
        const r = resp.payload.restructureResult;
        setNotification({
          type: "success",
          message: `Restructured ${r.playerName}: converted $${r.convertAmount?.toFixed(2)}M → saves $${r.capSavingsThisYear?.toFixed(2)}M this year.`,
        });
      } else {
        setNotification({ type: "success", message: "Contract restructured." });
      }
      await fetchRoster();
    } catch (e) {
      setNotification({
        type: "error",
        message: e.message ?? "Restructure failed.",
      });
    } finally {
      setRestructuring(null);
    }
  };

  const SortArrow = ({ col }) =>
    sortCol === col ? (
      <span style={{ marginLeft: 4, fontSize: 10 }}>
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    ) : (
      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.3 }}>⇅</span>
    );

  const thStyle = (col) => ({
    padding: "7px 10px",
    textAlign: col === "name" || col === "pos" ? "left" : "right",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    color: sortCol === col ? "var(--accent, #0A84FF)" : "var(--text-secondary)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  });

  const tdStyle = (align = "right") => ({
    padding: "7px 10px",
    textAlign: align,
    fontSize: 13,
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "middle",
  });

  if (loading)
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        Loading financials…
      </div>
    );

  if (error)
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--danger)" }}>
        {error}
      </div>
    );

  return (
    <div style={{ padding: "var(--space-4)", maxWidth: 900, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: "var(--space-5)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          Cap Management
        </h2>
        <InfoTip term="Cap management" explanation="Cap room, dead money, and staff investments all change roster flexibility and future risk." />
        <Badge variant="secondary">
          {june1} Rule Active
        </Badge>
        <Badge variant={isOverCap ? "destructive" : "secondary"}>
          Hard Cap: ${hardCap.toFixed(1)}M
        </Badge>
      </div>

      {/* ── Notification ── */}
      {notification && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            padding: "10px 16px",
            borderRadius: 8,
            background:
              notification.type === "error"
                ? "rgba(255,69,58,0.1)"
                : "rgba(52,199,89,0.1)",
            color:
              notification.type === "error"
                ? "var(--danger)"
                : "var(--success)",
            border: `1px solid ${notification.type === "error" ? "rgba(255,69,58,0.3)" : "rgba(52,199,89,0.3)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{notification.message}</span>
          <button
            className="btn"
            onClick={() => setNotification(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ marginBottom: "var(--space-5)" }}>
        <FranchiseInvestmentsPanel team={userTeam} actions={actions} />
      </div>

      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardHeader><CardTitle>How this works</CardTitle></CardHeader>
        <CardContent style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
          <div><strong style={{ color: "var(--text)" }}>Weekly:</strong> cap overages and injuries force immediate roster moves. Training and medical investments affect development and recovery outcomes.</div>
          <div><strong style={{ color: "var(--text)" }}>Seasonal:</strong> ticket/concession/stadium choices influence fan sentiment and ownership pressure, which feed future directives and franchise momentum.</div>
          <div><strong style={{ color: "var(--text)" }}>Yearly:</strong> restructures and dead money can buy short-term wins but squeeze future cap. Use the multi-year commitments below to avoid cliff years.</div>
        </CardContent>
      </Card>

      {/* ── Cap Bar ── */}
      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardHeader>
          <CardTitle>Cap Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <CapBar activeCap={activeCap} deadCap={deadCap} total={hardCap} />
        </CardContent>
      </Card>

      {/* ── Stat Boxes ── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: "var(--space-5)",
          flexWrap: "wrap",
        }}
      >
        <StatBox
          label="Active Cap"
          value={fmt(activeCap)}
          sub={`${players.length} players under contract`}
        />
        <StatBox
          label="Dead Money (Current)"
          value={fmt(deadCap)}
          sub={deadCap > 0 ? "Released players still on books" : "No dead cap"}
          danger={deadCap > 10}
        />
        <StatBox
          label="Projected Dead Money (Next Year)"
          value={deadMoneyNext > 0 ? fmt(deadMoneyNext) : "—"}
          sub={
            deadMoneyNext > 0
              ? "Post-June-1 deferred obligations"
              : "None deferred"
          }
          danger={deadMoneyNext > 5}
        />
        <StatBox
          label="Cap Available"
          value={fmt(capRoom)}
          sub={`vs. $${hardCap}M hard cap`}
          danger={isOverCap}
        />
      </div>

      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardHeader><CardTitle>Cap Commitments & Allocation</CardTitle></CardHeader>
        <CardContent style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {capByYear.map((slot) => (
              <div key={slot.yearOffset} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px", background: "var(--surface-strong)" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Year +{slot.yearOffset - 1}</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{fmt(slot.committed)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(Math.max(hardCap - slot.committed, 0))} projected room*</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            {capByGroup.map((g) => (
              <div key={g.group} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{g.group}</div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 12 }}>
                  <span>{fmt(g.cap)}</span>
                  <span>{g.pct.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>*Commitment view uses current contracts only; no speculative future signings.</div>
        </CardContent>
      </Card>

      <div style={{ display: "grid", gap: 12, marginBottom: "var(--space-5)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card className="card-premium">
          <CardHeader><CardTitle style={{ fontSize: 15 }}>Top Cap Hits</CardTitle></CardHeader>
          <CardContent style={{ display: "grid", gap: 6 }}>
            {largestDeals.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{p.name} ({p.pos})</span>
                <strong>{fmt(p.capHit)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="card-premium">
          <CardHeader><CardTitle style={{ fontSize: 15 }}>Expiring Deals (1y left)</CardTitle></CardHeader>
          <CardContent style={{ display: "grid", gap: 6 }}>
            {expiringDeals.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No expiring contracts.</div> : expiringDeals.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{p.name} ({p.pos}, age {p.age})</span>
                <strong>{fmt(p.capHit)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="card-premium" style={{ marginBottom: "var(--space-5)" }}>
        <CardHeader><CardTitle>Expiring Contracts Dashboard</CardTitle></CardHeader>
        <CardContent style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <StatBox label="Expiring starters" value={expiringDashboard.summary.expiringStarters} />
            <StatBox label="Likely walk" value={expiringDashboard.summary.likelyWalk} />
            <StatBox label="Est. extension cost" value={fmt(expiringDashboard.summary.estimatedExtensionCost)} />
            <StatBox label="Next-year cap risk" value={expiringDashboard.summary.capRiskNextYear} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button className="btn" disabled={applyingBatch} onClick={() => applyExpiringBatchAction('shortlist_extension')}>Shortlist for extension</Button>
            <Button className="btn" disabled={applyingBatch} onClick={() => applyExpiringBatchAction('trade_candidate')}>Mark as trade candidate</Button>
            <Button className="btn" disabled={applyingBatch} onClick={() => applyExpiringBatchAction('defer_offseason')}>Defer to offseason</Button>
            <Button className="btn" disabled={applyingBatch} onClick={() => applyExpiringBatchAction('prioritize_deadline')}>Prioritize before deadline</Button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Recommended focus: {expiringDashboard.summary.expiringStarters >= 3 ? 'address starters now' : 'selective extensions'} · batch mode: {contractMarks.batchAction ? (CONTRACT_PLAN_LABELS[contractMarks.batchAction] ?? contractMarks.batchAction) : 'none'}.
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--hairline)', borderRadius: 8 }}>
            {expiringDashboard.rows.map((row) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr repeat(7, minmax(70px, 1fr))', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--hairline)', fontSize: 12 }}>
                <div><strong>{row.name}</strong><div style={{ color: 'var(--text-muted)' }}>{row.pos} · age {row.age} · morale {row.morale ?? 70}</div><div style={{ color: row.rec.tone }}>{row.rec.label}</div><div style={{ color: 'var(--text-subtle)' }}>Plan: {row.management.contractPlan[0] ? (CONTRACT_PLAN_LABELS[row.management.contractPlan[0]] ?? row.management.contractPlan[0]) : 'None'} · Trade status: {row.management.tradeStatus}</div></div>
                <div>{row.ovr}/{row.potential ?? row.ovr}</div>
                <div>{fmt(row.capHit)}</div>
                <div>{fmt(row.estimatedDemand)}</div>
                <div>{row.willingness}</div>
                <div>{row.marketPressure}</div>
                <div>{row.rec.replacementDifficulty}</div>
                <div style={{ color: 'var(--text-muted)' }}>{row.rec.reason}</div>
              </div>
            ))}
            {expiringDashboard.rows.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>No expiring players currently.</div>}
          </div>
        </CardContent>
      </Card>

      {/* ── June 1st Explanation ── */}
      <div
        style={{
          marginBottom: "var(--space-4)",
          padding: "10px 14px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.04)",
          fontSize: 12,
          color: "var(--text-secondary)",
          borderLeft: "3px solid rgba(255,255,255,0.15)",
        }}
      >
        <strong style={{ color: "var(--text-primary)" }}>
          June 1st Dead Money Rule:{" "}
        </strong>
        {june1 === "Pre-June 1"
          ? "Cuts before June 1st accelerate ALL remaining prorated bonus to this year's dead cap."
          : "Cuts after June 1st: this year's prorated bonus hits now; future years defer to next season's cap (\"Projected Dead Money\")."}{" "}
        <strong>Restructuring</strong> converts up to 50% of base salary into
        prorated bonus, saving cap space now.
      </div>

      {/* ── Player Cap Hit Table ── */}
      <Card className="card-premium">
        <CardHeader>
          <CardTitle style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Player Contracts</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>
              {enriched.length} players · Total cap hit:{" "}
              {fmt(enriched.reduce((s, p) => s + p.capHit, 0))}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <ScrollArea className="h-[500px]">
            <Table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={thStyle("name")} onClick={() => handleSort("name")}>
                    Name
                    <SortArrow col="name" />
                  </TableHead>
                  <TableHead style={thStyle("pos")} onClick={() => handleSort("pos")}>
                    Pos
                    <SortArrow col="pos" />
                  </TableHead>
                  <TableHead style={thStyle("ovr")} onClick={() => handleSort("ovr")}>
                    OVR
                    <SortArrow col="ovr" />
                  </TableHead>
                  <TableHead style={thStyle("age")} onClick={() => handleSort("age")}>
                    Age
                    <SortArrow col="age" />
                  </TableHead>
                  <TableHead
                    style={thStyle("baseAnnual")}
                    onClick={() => handleSort("baseAnnual")}
                  >
                    Base Salary
                    <SortArrow col="baseAnnual" />
                  </TableHead>
                  <TableHead
                    style={thStyle("signingBonus")}
                    onClick={() => handleSort("signingBonus")}
                  >
                    Bonus
                    <SortArrow col="signingBonus" />
                  </TableHead>
                  <TableHead
                    style={thStyle("yearsRemaining")}
                    onClick={() => handleSort("yearsRemaining")}
                  >
                    Yrs Left
                    <SortArrow col="yearsRemaining" />
                  </TableHead>
                  <TableHead
                    style={thStyle("capHit")}
                    onClick={() => handleSort("capHit")}
                  >
                    Cap Hit
                    <SortArrow col="capHit" />
                  </TableHead>
                  <TableHead style={{ ...thStyle("name"), textAlign: "center" }}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((player, idx) => {
                  const isRestructuring = restructuring === player.id;
                  const rowBg =
                    idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
                  const isHighCap = player.capHit > 20;
                  const isExpiring = player.yearsRemaining === 1;

                  return (
                    <TableRow key={player.id} style={{ background: rowBg }}>
                      <TableCell style={{ ...tdStyle("left"), fontWeight: 600 }}>
                        {player.name}
                      </TableCell>
                      <TableCell style={{ ...tdStyle("left") }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(255,255,255,0.07)",
                          }}
                        >
                          {player.pos}
                        </span>
                      </TableCell>
                      <TableCell style={tdStyle()}>
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              player.ovr >= 85
                                ? "var(--success)"
                                : player.ovr >= 75
                                  ? "var(--text-primary)"
                                  : "var(--text-secondary)",
                          }}
                        >
                          {player.ovr}
                        </span>
                      </TableCell>
                      <TableCell
                        style={{ ...tdStyle(), color: "var(--text-secondary)" }}
                      >
                        {player.age}
                      </TableCell>
                      <TableCell
                        style={{ ...tdStyle(), color: "var(--text-secondary)" }}
                      >
                        {fmt(player.baseAnnual)}
                      </TableCell>
                      <TableCell
                        style={{ ...tdStyle(), color: "var(--text-secondary)" }}
                      >
                        {player.signingBonus > 0 ? fmt(player.signingBonus) : "—"}
                      </TableCell>
                      <TableCell style={tdStyle()}>
                        {isExpiring ? (
                          <Badge variant="destructive" className="text-xs">
                            Expiring
                          </Badge>
                        ) : (
                          player.yearsRemaining > 0 ? player.yearsRemaining : "—"
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          ...tdStyle(),
                          fontWeight: 700,
                          color: isHighCap ? "#FF9F0A" : "var(--text-primary)",
                        }}
                      >
                        {fmt(player.capHit)}
                      </TableCell>
                      <TableCell style={{ ...tdStyle(), textAlign: "center" }}>
                        {player.canRestructure ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            disabled={isRestructuring}
                            onClick={() => handleRestructure(player)}
                          >
                            {isRestructuring ? "…" : "Restructure"}
                          </Button>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              color: "rgba(255,255,255,0.2)",
                            }}
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          {sorted.length === 0 && (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--text-secondary)",
              }}
            >
              No players under contract.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── RFA Prep Notice ── */}
      <div
        style={{
          marginTop: "var(--space-5)",
          padding: "12px 16px",
          borderRadius: 8,
          background: "rgba(100,210,255,0.06)",
          border: "1px solid rgba(100,210,255,0.2)",
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        <strong style={{ color: "#64D2FF" }}>
          Phase 31 — Restricted Free Agency (Upcoming):
        </strong>{" "}
        Players with 1–3 years of service on expiring contracts will be eligible
        for RFA tenders (Original Round, Second Round, First Round). Placing a
        tender lets you match any outside offer and retain your young stars.
        Check back during the offseason to protect your core.
      </div>
    </div>
  );
}
