/**
 * HomeDashboard.jsx — PREMIUM UPGRADE (FULL VERSION)
 * 100% of original code preserved + glassmorphism / hover-lift / Advance Week CTA
 */

import React, { useMemo } from "react";
import { OvrPill } from "./LeagueDashboard.jsx";
import PlayerCard from "./PlayerCard.jsx";

// ── Helpers (100% original) ────────────────────────────────────────────────────

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

function TeamCircle({ abbr, size = 44, isUser = false }) {
  const color = teamColor(abbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`,
      border: `2.5px solid ${isUser ? "var(--accent)" : color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: size * 0.28,
      color: isUser ? "var(--accent)" : color,
      flexShrink: 0, letterSpacing: "-0.5px",
    }}>
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

function winPct(w, l, t) {
  const g = w + l + t;
  return g === 0 ? ".000" : ((w + t * 0.5) / g).toFixed(3).replace(/^0/, "");
}

function FormStrip({ results = [] }) {
  if (!results.length) return <span style={{ color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>No games yet</span>;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {results.slice(-5).map((r, i) => (
        <span
          key={i}
          className={`form-dot form-dot-${r.toLowerCase()}`}
          title={r === "W" ? "Win" : r === "L" ? "Loss" : "Tie"}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function getRecentForm(schedule, teamId) {
  if (!schedule?.weeks) return [];
  const results = [];
  for (const week of [...schedule.weeks].reverse()) {
    if (results.length >= 5) break;
    for (const game of week.games ?? []) {
      if (!game.played) continue;
      const isHome = Number(game.home) === teamId || game.home?.id === teamId;
      const isAway = Number(game.away) === teamId || game.away?.id === teamId;
      if (!isHome && !isAway) continue;
      const userScore = isHome ? game.homeScore : game.awayScore;
      const oppScore = isHome ? game.awayScore : game.homeScore;
      if (userScore > oppScore) results.push("W");
      else if (userScore < oppScore) results.push("L");
      else results.push("T");
    }
  }
  return results.reverse();
}

function getNextGame(schedule, teamId, teamById) {
  if (!schedule?.weeks) return null;
  for (const week of schedule.weeks) {
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId === teamId || awayId === teamId) {
        const isHome = homeId === teamId;
        const oppId = isHome ? awayId : homeId;
        const opp = teamById[oppId];
        return { week: week.week, isHome, opp, oppId };
      }
    }
  }
  return null;
}

// ── Premium SectionCard (glassmorphism + hover-lift) ───────────────────────────
function SectionCard({ title, icon, children, accent }) {
  return (
    <div className="card-premium hover-lift" style={{
      border: accent ? `1px solid ${accent}33` : undefined,
    }}>
      <div style={{
        padding: "var(--space-3) var(--space-5)",
        borderBottom: "1px solid var(--hairline)",
        background: accent ? `${accent}0a` : "var(--surface-strong)",
        display: "flex", alignItems: "center", gap: "var(--space-2)",
      }}>
        {icon && <span style={{ fontSize: "1rem" }}>{icon}</span>}
        <span style={{
          fontSize: "var(--text-xs)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "1px",
          color: accent ?? "var(--text-muted)",
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "var(--space-4) var(--space-5)" }}>
        {children}
      </div>
    </div>
  );
}

// ── NEW: Large Advance Week CTA ────────────────────────────────────────────────
function AdvanceWeekCTA({ phase, week, onAdvanceWeek, isBusy }) {
  const label = phase === "regular" ? `Sim Week ${week}` : 
                phase === "preseason" ? "Start Season" : 
                phase === "free_agency" ? "Enter Draft" : "Advance Phase";
  return (
    <button
      onClick={onAdvanceWeek}
      disabled={isBusy}
      className="btn-premium w-full py-4 text-xl font-bold mb-6"
      style={{ minHeight: "68px" }}
    >
      {isBusy ? "Simulating..." : label}
    </button>
  );
}

// ── Sub-components (100% original, now inside premium cards) ───────────────────

function TeamSnapshotCard({ userTeam, league }) {
  const color = teamColor(userTeam.abbr);
  const divName = typeof userTeam.div === "number"
    ? ["East","North","South","West"][userTeam.div] ?? "?"
    : userTeam.div ?? "?";
  const confName = typeof userTeam.conf === "number"
    ? ["AFC","NFC"][userTeam.conf] ?? "?"
    : userTeam.conf ?? "?";

  const confIdx = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
  const divIdx2 = typeof userTeam.div === "number" ? userTeam.div : { East:0, North:1, South:2, West:3 }[userTeam.div] ?? 0;
  const divTeams = (league.teams ?? [])
    .filter(t => {
      const tc = typeof t.conf === "number" ? t.conf : t.conf === "AFC" ? 0 : 1;
      const td = typeof t.div === "number" ? t.div : { East:0, North:1, South:2, West:3 }[t.div] ?? 0;
      return tc === confIdx && td === divIdx2;
    })
    .sort((a,b) => (b.wins + b.ties*0.5) - (a.wins + a.ties*0.5) || b.wins - a.wins);
  const divRank = divTeams.findIndex(t => t.id === userTeam.id) + 1;

  const capRoom = userTeam.capRoom ?? (userTeam.capTotal ?? 301.2) - (userTeam.capUsed ?? 0);
  const capColor = capRoom > 20 ? "var(--success)" : capRoom > 5 ? "var(--warning)" : "var(--danger)";

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}18 0%, transparent 60%)`,
      border: `1px solid ${color}44`,
      borderRadius: "var(--radius-xl)",
      padding: "var(--space-5)",
      backdropFilter: "var(--glass-blur)",
      WebkitBackdropFilter: "var(--glass-blur)",
      boxShadow: `0 4px 24px ${color}22`,
      gridColumn: "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <TeamCircle abbr={userTeam.abbr} size={64} isUser />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
            {userTeam.name}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2 }}>
            {confName} {divName} · Season {league.year ?? ""}
          </div>
        </div>
        <OvrPill ovr={userTeam.ovr} size="lg" />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "var(--space-3)",
      }}>
        {[
          { label: "Record", value: `${userTeam.wins}-${userTeam.losses}${userTeam.ties ? `-${userTeam.ties}` : ""}`, color: "var(--text)" },
          { label: "Win %", value: winPct(userTeam.wins, userTeam.losses, userTeam.ties), color: "var(--text)" },
          { label: `Div Rank`, value: `#${divRank} ${confName} ${divName}`, color: divRank === 1 ? "var(--success)" : "var(--text-muted)" },
          { label: "Cap Space", value: `$${capRoom.toFixed(1)}M`, color: capColor },
        ].map(({ label, value, color: vc }) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius