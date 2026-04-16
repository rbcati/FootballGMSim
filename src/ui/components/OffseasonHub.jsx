/**
 * OffseasonHub.jsx — Offseason Phased Calendar & Action Center
 *
 * Provides a visual timeline of all offseason phases with contextual
 * quick-actions, stats, and phase-specific tips for each stage.
 *
 * Phases order: offseason_resign → free_agency → draft → preseason → regular
 */

import React, { useMemo } from "react";
import {
  clampPercent,
  deriveTeamCapSnapshot,
  formatMoneyM,
  formatPercent,
  safeRound,
  toFiniteNumber,
} from "../utils/numberFormatting.js";
import { deriveFranchisePressure } from "../utils/pressureModel.js";
import { buildOffseasonActionCenter } from "../utils/offseasonActionCenter.js";

const PHASES = [
  {
    id: "offseason_resign",
    label: "Re-Signing",
    emoji: "✍️",
    color: "#0A84FF",
    description: "Lock up your own free agents before they hit the open market.",
    tips: [
      "Prioritize starters with expiring contracts first.",
      "Check each player's extension demand before the window closes.",
      "Players with >90 OVR may demand near max deals.",
    ],
    actions: [
      { label: "Re-signing Center", tab: "Contract Center" },
      { label: "Check Roster", tab: "Roster" },
      { label: "Financials", tab: "Financials" },
    ],
  },
  {
    id: "free_agency",
    label: "Free Agency",
    emoji: "💸",
    color: "#FF9F0A",
    description: "Sign available free agents — AI teams are bidding simultaneously.",
    tips: [
      "CPU teams escalate bids every 2.5 seconds — act decisively.",
      "Monitor your cap room before signing; any deal could tip you over.",
      "Look for scheme-fit free agents (green 70%+) for instant impact.",
    ],
    actions: [
      { label: "Free Agency", tab: "Free Agency" },
      { label: "Contract Center", tab: "Contract Center" },
      { label: "Financials", tab: "Financials" },
    ],
  },
  {
    id: "draft",
    label: "Draft",
    emoji: "📋",
    color: "#BF5AF2",
    description: "Select prospects in the 7-round NFL-style draft.",
    tips: [
      "Sort the Big Board by position to find your team's biggest needs.",
      "Use the Trade Calculator before accepting any AI trade-up offers.",
      "Rookie contracts are 10% cheaper — fill depth with late rounds.",
    ],
    actions: [
      { label: "Draft Room", tab: "Draft Room" },
      { label: "Mock Draft", tab: "Mock Draft" },
      { label: "Big Board", tab: "🎓 Draft" },
    ],
  },
  {
    id: "preseason",
    label: "Preseason",
    emoji: "🏕️",
    color: "#34C759",
    description: "Cut your roster from 90 to 53 and set your depth chart.",
    tips: [
      "You must cut to exactly 53 before the regular season begins.",
      "Set your scheme in Strategy to boost scheme-fit player OVRs.",
      "Run Training Camp drills to give depth players a performance boost.",
    ],
    actions: [
      { label: "Roster Hub", tab: "Roster Hub" },
      { label: "Depth Chart", tab: "Depth Chart" },
      { label: "Training", tab: "Training" },
    ],
  },
  {
    id: "regular",
    label: "Season",
    emoji: "🏈",
    color: "#64D2FF",
    description: "Regular season — 18 weeks to prove your franchise.",
    tips: [],
    actions: [],
  },
];

function PhaseTimelineItem({ phase, isActive, isPast, onNavigate }) {
  const opacity = isPast ? 0.5 : 1;
  const scale = isActive ? 1 : 0.97;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      opacity, transform: `scale(${scale})`, transition: "all 0.2s",
    }}>
      {/* Dot + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: isActive ? phase.color : isPast ? `${phase.color}44` : "var(--surface)",
          border: `2.5px solid ${isActive ? phase.color : isPast ? `${phase.color}66` : "var(--hairline)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", boxShadow: isActive ? `0 0 12px ${phase.color}66` : "none",
        }}>
          {isPast ? "✓" : phase.emoji}
        </div>
        <div style={{
          width: 2, height: 24, marginTop: 2,
          background: isPast ? `${phase.color}44` : "var(--hairline)",
        }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1, paddingBottom: 16,
        background: isActive ? `${phase.color}0c` : "transparent",
        border: isActive ? `1px solid ${phase.color}33` : "1px solid transparent",
        borderRadius: 10, padding: isActive ? "12px 14px" : "8px 4px",
        marginBottom: 4,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: "0.85rem", fontWeight: 800,
            color: isActive ? phase.color : "var(--text)",
          }}>
            {phase.label}
          </span>
          {isActive && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 800,
              background: phase.color, color: "#000",
              borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.5px",
            }}>
              NOW
            </span>
          )}
          {isPast && (
            <span style={{
              fontSize: "0.58rem", color: "var(--text-subtle)", fontWeight: 600,
            }}>Done</span>
          )}
        </div>

        {isActive && (
          <>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
              {phase.description}
            </p>

            {phase.tips.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {phase.tips.map((tip, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 6, alignItems: "flex-start",
                    fontSize: "0.68rem", color: "var(--text-subtle)", marginBottom: 4,
                  }}>
                    <span style={{ color: phase.color, flexShrink: 0, marginTop: 1 }}>•</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {phase.actions.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {phase.actions.map(({ label, tab }) => (
                  <button
                    key={label}
                    onClick={() => onNavigate?.(tab)}
                    style={{
                      padding: "5px 12px",
                      background: `${phase.color}18`,
                      border: `1px solid ${phase.color}44`,
                      borderRadius: 6, color: phase.color,
                      fontSize: "0.68rem", fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {label} →
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Offseason Stats Card ──────────────────────────────────────────────────────

function OffseasonStatsCard({ league, onNavigate }) {
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  if (!userTeam) return null;

  const cap = deriveTeamCapSnapshot(userTeam, { fallbackCapTotal: 301.2 });
  const capRoom = cap.capRoom;
  const capUsed = cap.capUsed;
  const capPct = safeRound(cap.usedPct, 0, 0);
  const rosterCount = userTeam.rosterCount ?? userTeam.roster?.length ?? 0;
  const overCap = capRoom < 0;
  const ownerApproval = clampPercent(
    safeRound(league?.ownerApproval ?? league?.ownerMood, 0, null),
    null,
  );
  const ownerApprovalDisplay = formatPercent(ownerApproval, "—");
  const ownerTone = ownerApproval == null
    ? "var(--text-muted)"
    : ownerApproval < 34
      ? "#FF453A"
      : ownerApproval < 60
        ? "#FF9F0A"
        : "#34C759";
  const ownerStatus = ownerApproval == null
    ? "Unknown"
    : ownerApproval < 34
    ? "Critical"
    : ownerApproval < 50
      ? "Hot Seat"
      : ownerApproval < 68
        ? "Warming Seat"
        : "Stable";
  const pressure = deriveFranchisePressure(league);
  const nextAction = overCap
    ? "Clear salary to get under the cap."
    : rosterCount < 53
      ? `Add ${53 - rosterCount} players before preseason cuts.`
      : "Target upgrades in weak positions.";

  const stats = [
    { label: "Cap Room", value: formatMoneyM(capRoom), color: overCap ? "#FF453A" : capRoom < 10 ? "#FF9F0A" : "#34C759" },
    { label: "Roster Size", value: `${rosterCount} / 53`, color: rosterCount > 53 ? "#FF453A" : "#34C759" },
    { label: "Team OVR", value: toFiniteNumber(userTeam.ovr, "—"), color: "#0A84FF" },
    { label: "Season", value: toFiniteNumber(league.year, "—"), color: "var(--text)" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/65 p-3 shadow-xl mb-3">
      <div className="mb-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
          <span>Owner Approval</span>
          <span style={{ color: ownerTone }}>{ownerApprovalDisplay} · {ownerStatus}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: formatPercent(ownerApproval, "0%"), background: ownerTone }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-300">
            {nextAction} {pressure?.fans?.state ? `· Fans ${pressure.fans.state}` : ""} {pressure?.media?.state ? `· Media ${pressure.media.state}` : ""}
          </span>
          <button onClick={() => onNavigate?.("Owner")} className="text-[11px] font-semibold text-blue-300 underline underline-offset-2">Owner goals</button>
        </div>
        {!!pressure?.directives?.length && (
          <div className="mt-2 text-[11px] text-slate-300">
            Directive: <strong style={{ color: "var(--text)" }}>{pressure.directives[0].theme}</strong> ({pressure.directives[0].progress}%)
          </div>
        )}
      </div>

      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {userTeam.abbr} — Offseason Summary
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] p-2 text-center">
            <div style={{ fontSize: "0.6rem", color: "var(--text-subtle)", fontWeight: 600, marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: "0.88rem", fontWeight: 800, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {/* Cap bar */}
      <div className="rounded-lg border border-white/5 bg-black/20 p-2">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "var(--text-subtle)", marginBottom: 3 }}>
          <span>Cap Used</span>
          <span>{formatPercent(capPct, "—")}</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "var(--hairline)", overflow: "hidden" }}>
          <div style={{
            width: `${capPct}%`, height: "100%",
            background: overCap ? "#FF453A" : capPct > 90 ? "#FF9F0A" : "#0A84FF",
            borderRadius: 3, transition: "width 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OffseasonHub({ league, onNavigate }) {
  const currentPhase = league?.phase ?? "regular";
  const actionCenter = useMemo(() => buildOffseasonActionCenter(league), [league]);

  const phaseOrder = PHASES.map(p => p.id);
  const currentIdx = phaseOrder.indexOf(currentPhase);

  // Only show during offseason phases
  const isOffseason = ["offseason_resign", "free_agency", "draft", "preseason"].includes(currentPhase);

  if (!isOffseason) {
    return (
      <div style={{
        textAlign: "center", padding: "60px 20px",
        color: "var(--text-muted)",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏈</div>
        <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>Regular Season Underway</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)" }}>
          The Offseason Hub will open after the season ends.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="mb-3 rounded-xl border border-white/10 bg-gradient-to-r from-[#1f3e70]/30 via-slate-900/75 to-[#2f7cff]/12 p-3.5 shadow-xl">
        <h2 className="mb-1 text-2xl font-extrabold tracking-tight text-white">
          Offseason Hub
        </h2>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 0 }}>
          {league?.year} Offseason · Complete each phase to begin the {(league?.year ?? 0) + 1} season
        </p>
      </div>

      <OffseasonStatsCard league={league} onNavigate={onNavigate} />

      <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3.5 shadow-xl">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", fontWeight: 800 }}>Offseason Action Center</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 800 }}>{actionCenter.phaseLabel} · Next: {actionCenter.nextPhaseLabel}</div>
          </div>
          <div style={{ fontSize: "0.72rem", color: actionCenter.canSkipPhase ? "var(--success)" : "var(--warning)", fontWeight: 700 }}>
            {actionCenter.canSkipPhase ? "No blockers — phase can be skipped." : "Blocking tasks remain."}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2"><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Cap Room</div><div style={{ fontWeight: 800 }}>${actionCenter.metrics.capRoom.toFixed(1)}M</div></div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2"><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Roster</div><div style={{ fontWeight: 800 }}>{actionCenter.metrics.rosterCount} players</div></div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2"><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Expiring</div><div style={{ fontWeight: 800 }}>{actionCenter.metrics.expiringContracts} ({actionCenter.unresolved?.keyExpiringContracts ?? 0} key)</div></div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2"><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Owned Picks</div><div style={{ fontWeight: 800 }}>{actionCenter.metrics.draftPickCount}</div></div>
        </div>
        {!!actionCenter.blockers?.length && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: "0.66rem", textTransform: "uppercase", color: "var(--warning)", fontWeight: 800 }}>Blockers</div>
            {actionCenter.blockers.map((item) => <div key={item} style={{ fontSize: "0.75rem" }}>• {item}</div>)}
          </div>
        )}
        {!!actionCenter.priorities?.length && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: "0.66rem", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800 }}>Unresolved Priorities</div>
            {actionCenter.priorities.map((item) => <div key={item} style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>• {item}</div>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(actionCenter.actions ?? []).map((action) => (
            <button key={action.label} className="btn btn-sm" onClick={() => onNavigate?.(action.tab)}>{action.label}</button>
          ))}
        </div>
      </div>

      {/* Phase timeline */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur-md">
        <div style={{
          fontSize: "0.62rem", fontWeight: 800, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10,
        }}>
          Phase Timeline
        </div>

        {PHASES.filter(p => p.id !== "regular").map((phase, i) => {
          const isActive = phase.id === currentPhase;
          const isPast = phaseOrder.indexOf(phase.id) < currentIdx;
          return (
            <PhaseTimelineItem
              key={phase.id}
              phase={phase}
              isActive={isActive}
              isPast={isPast}
              onNavigate={onNavigate}
            />
          );
        })}

        {/* Regular season target */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "var(--surface)", border: "2px dashed var(--hairline)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1rem",
          }}>
            🏈
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-subtle)" }}>
            {(league?.year ?? 0) + 1} Regular Season — complete all phases to unlock
          </div>
        </div>
      </div>
    </div>
  );
}
