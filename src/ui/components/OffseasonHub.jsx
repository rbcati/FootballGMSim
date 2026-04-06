/**
 * OffseasonHub.jsx — Offseason Phased Calendar & Action Center
 *
 * Provides a visual timeline of all offseason phases with contextual
 * quick-actions, stats, and phase-specific tips for each stage.
 *
 * Phases order: offseason_resign → free_agency → draft → preseason → regular
 */

import React, { useMemo } from "react";

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
      { label: "View FA Hub", tab: "FA Hub" },
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
      { label: "FA Hub", tab: "FA Hub" },
      { label: "Free Agency", tab: "Free Agency" },
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
      { label: "Big Board", tab: "Mock Draft" },
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

  const capRoom = userTeam.capRoom ?? (301.2 - (userTeam.capUsed ?? 0));
  const capUsed = Math.max(0, 301.2 - capRoom);
  const capPct = Math.min(100, Math.round((capUsed / 301.2) * 100));
  const rosterCount = userTeam.rosterCount ?? userTeam.roster?.length ?? 0;
  const overCap = capRoom < 0;
  const ownerApproval = Math.round(league?.ownerApproval ?? league?.ownerMood ?? 75);
  const ownerTone = ownerApproval < 34 ? "#FF453A" : ownerApproval < 60 ? "#FF9F0A" : "#34C759";

  const stats = [
    { label: "Cap Room", value: `$${capRoom.toFixed(1)}M`, color: overCap ? "#FF453A" : capRoom < 10 ? "#FF9F0A" : "#34C759" },
    { label: "Roster Size", value: `${rosterCount} / 53`, color: rosterCount > 53 ? "#FF453A" : "#34C759" },
    { label: "Team OVR", value: userTeam.ovr ?? "—", color: "#0A84FF" },
    { label: "Season", value: league.year ?? "—", color: "var(--text)" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-2xl backdrop-blur-xl mb-4">
      <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          <span>Owner Approval</span>
          <span style={{ color: ownerTone }}>{ownerApproval}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ownerApproval}%`, background: ownerTone }} />
        </div>
        {ownerApproval < 34 && (
          <button
            onClick={() => onNavigate?.("Owner")}
            className="mt-2 text-xs font-semibold text-red-300 underline underline-offset-2"
          >
            Owner is furious — review directives now
          </button>
        )}
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {userTeam.abbr} — Offseason Summary
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/5 bg-white/[0.03] p-2 text-center">
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
      <div className="rounded-xl border border-white/5 bg-black/20 p-2">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "var(--text-subtle)", marginBottom: 3 }}>
          <span>Cap Used</span>
          <span>{capPct}%</span>
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
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-5 rounded-2xl border border-white/10 bg-gradient-to-r from-[#003087]/35 via-slate-900/70 to-[#d6b25e]/15 p-5 shadow-2xl">
        <h2 className="mb-1 text-3xl font-extrabold tracking-tight text-white">
          Offseason Hub
        </h2>
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {league?.year} Offseason · Complete each phase to begin the {(league?.year ?? 0) + 1} season
        </p>
      </div>

      <OffseasonStatsCard league={league} onNavigate={onNavigate} />

      {/* Phase timeline */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-lg">
        <div style={{
          fontSize: "0.65rem", fontWeight: 800, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px", marginBottom: 14,
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
