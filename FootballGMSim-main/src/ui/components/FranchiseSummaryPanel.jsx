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

function Tile({ label, value, quiet = false }) {
  return (
    <div className={`franchise-summary-tile${quiet ? " is-quiet" : ""}`}>
      <span>{label}</span>
      <div>{value}</div>
    </div>
  );
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

  const record = `${safeNumber(userTeam.wins)}-${safeNumber(userTeam.losses)}${safeNumber(userTeam.ties) ? `-${safeNumber(userTeam.ties)}` : ""}`;

  return (
    <section className={`card franchise-summary-panel ${className}`.trim()} style={{ padding: compact ? "10px" : "var(--space-3)" }}>
      <div className="franchise-summary-header">
        <strong style={{ fontSize: compact ? "var(--text-sm)" : "var(--text-base)" }}>Franchise Summary</strong>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{league.year} · Week {league.week ?? 1}</span>
      </div>

      <div className="franchise-summary-tier">
        <p className="franchise-summary-tier__label">Primary</p>
        <div className="franchise-summary-grid primary">
          <Tile label="Record" value={record} />
          <Tile label="Conf / Playoff line" value={`#${rank?.confRank ?? "—"} conf · line ${rank?.playoffLineRecord ?? "—"}`} />
          <Tile label="Team OVR" value={`${safeNumber(userTeam.ovr, "—")} (O ${safeNumber(userTeam.offOvr ?? userTeam.ovr)} / D ${safeNumber(userTeam.defOvr ?? userTeam.ovr)})`} />
          <Tile label="Cap Room" value={formatMoneyM(cap.capRoom)} />
          <Tile label="Owner / Fans / Media" value={`${formatPercent(league.ownerApproval ?? league.ownerMood, "—", { digits: 0 })} · ${pressure?.fans?.state ?? "Steady"} · ${pressure?.media?.state ?? "Neutral"}`} />
        </div>
      </div>

      <div className="franchise-summary-tier">
        <p className="franchise-summary-tier__label">Secondary</p>
        <div className="franchise-summary-grid secondary">
          <Tile label="Payroll" value={formatMoneyM(cap.capUsed)} quiet />
          <Tile label="Dead Money" value={formatMoneyM(cap.deadCap)} quiet />
          <Tile label="Expiring" value={`${safeNumber(userTeam.expiringContracts ?? userTeam.contractsExpiring)} contracts`} quiet />
          <Tile label="Roster Spots" value={`${safeNumber(userTeam.rosterCount, userTeam.roster?.length ?? 0)}/53`} quiet />
          <Tile label="Next Draft Picks" value={`${nextDraftPicks}`} quiet />
          <Tile label="Last 5" value={recent.length ? recent.join(" · ") : "No recent form"} quiet />
        </div>
      </div>

      <div className="franchise-summary-metadata">
        <span>Phase: {league.phase ?? "regular"}</span>
        <span>Owner state: {pressure?.owner?.state ?? "Stable"}</span>
      </div>
    </section>
  );
}
