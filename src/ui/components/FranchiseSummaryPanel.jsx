import React, { useMemo } from "react";
import { deriveTeamCapSnapshot, formatMoneyM, formatPercent } from "../utils/numberFormatting.js";
import { deriveFranchisePressure } from "../utils/pressureModel.js";

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function conferenceRank(league, userTeam) {
  if (!league?.teams?.length || !userTeam) return null;
  const pct = (team) => {
    const g = safeNumber(team.wins) + safeNumber(team.losses) + safeNumber(team.ties);
    return g ? (safeNumber(team.wins) + 0.5 * safeNumber(team.ties)) / g : 0;
  };
  const confTeams = league.teams
    .filter((t) => Number(t.conf) === Number(userTeam.conf))
    .sort((a, b) => pct(b) - pct(a));
  const idx = confTeams.findIndex((t) => Number(t.id) === Number(userTeam.id));
  const playoffLine = confTeams[6];
  return {
    confRank: idx >= 0 ? idx + 1 : null,
    playoffLineRecord: playoffLine ? `${safeNumber(playoffLine.wins)}-${safeNumber(playoffLine.losses)}` : "—",
  };
}

export default function FranchiseSummaryPanel({ league, compact = false, className = "" }) {
  const userTeam = useMemo(
    () => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)),
    [league],
  );
  if (!league || !userTeam) return null;

  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 255 });
  const pressure = deriveFranchisePressure(league);
  const rank = conferenceRank(league, userTeam);
  const recent = Array.isArray(userTeam.recentResults) ? userTeam.recentResults.slice(-5) : [];
  const nextDraftPicks = Array.isArray(userTeam.draftPicks)
    ? userTeam.draftPicks.filter((p) => Number(p.season ?? p.year) === Number(league.year) + 1).length
    : 0;

  const items = [
    ["Record", `${safeNumber(userTeam.wins)}-${safeNumber(userTeam.losses)}${safeNumber(userTeam.ties) ? `-${safeNumber(userTeam.ties)}` : ""}`],
    ["Conf/Div Rank", `#${rank?.confRank ?? "—"} conf · playoff line ${rank?.playoffLineRecord ?? "—"}`],
    ["Team OVR", `${safeNumber(userTeam.ovr, "—")} (O ${safeNumber(userTeam.offOvr ?? userTeam.ovr)} / D ${safeNumber(userTeam.defOvr ?? userTeam.ovr)})`],
    ["Cap Room", formatMoneyM(cap.capRoom)],
    ["Payroll", formatMoneyM(cap.capUsed)],
    ["Dead Money", formatMoneyM(cap.deadCap)],
    ["Expiring", `${safeNumber(userTeam.expiringContracts ?? userTeam.contractsExpiring)} contracts`],
    ["Roster Spots", `${safeNumber(userTeam.rosterCount, userTeam.roster?.length ?? 0)}/53`],
    ["Next Draft Picks", `${nextDraftPicks}`],
    ["Owner/Fans/Media", `${formatPercent(league.ownerApproval ?? league.ownerMood, "—", { digits: 0 })} · ${pressure?.fans?.state ?? "Steady"} · ${pressure?.media?.state ?? "Neutral"}`],
    ["Last 5", recent.length ? recent.join(" · ") : "No recent form"],
  ];

  return (
    <section className={`card ${className}`.trim()} style={{ padding: compact ? "10px" : "var(--space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <strong style={{ fontSize: compact ? "var(--text-sm)" : "var(--text-base)" }}>Franchise Summary</strong>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{league.year} · Week {league.week ?? 1}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(auto-fit,minmax(170px,1fr))" : "repeat(auto-fit,minmax(190px,1fr))", gap: 6 }}>
        {items.map(([label, value]) => (
          <div key={label} style={{ fontSize: compact ? "11px" : "12px", color: "var(--text-muted)" }}>
            <span>{label}</span>
            <div style={{ color: "var(--text)", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

