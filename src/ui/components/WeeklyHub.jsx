/**
 * WeeklyHub.jsx — Central weekly management screen
 *
 * Ties together every aspect of a GM week into one premium hub:
 *
 *   PHASE BAR  →  week progress + current phase label
 *   ACTION GRID →  Training | Staff | Injuries | Strategy | Free Agency | Sim
 *   NEXT GAME PREVIEW  →  matchup card with team records
 *   INJURY ALERTS      →  top 3 injuries with recovery timeline
 *   TOP PERFORMERS     →  last week's stars (if available)
 *   RECENT NEWS        →  last 4 news items
 *
 * All "Navigate to …" cards call props.onNavigate(tabName) so the parent
 * (LeagueDashboard) can switch tabs without any routing library.
 */

import React, { useMemo, useState } from "react";
import PlayerCard from "./PlayerCard.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Advance Week Button ────────────────────────────────────────────────────────

function AdvanceWeekButton({ league, busy, simulating, onAdvanceWeek }) {
  const [pressed, setPressed] = useState(false);
  if (!league) return null;

  const phase = league.phase ?? "regular";
  const disabled = busy || simulating;

  let label, sublabel, color, emoji;

  if (simulating) {
    label = "Simulating…";
    sublabel = "Please wait";
    color = "#636366";
    emoji = "⏳";
  } else if (busy) {
    label = "Working…";
    sublabel = "Please wait";
    color = "#636366";
    emoji = "⏳";
  } else if (phase === "preseason") {
    const userTeam = league.teams?.find(t => t.id === league.userTeamId);
    const rosterCount = userTeam?.rosterCount ?? 0;
    if (rosterCount > 53) {
      label = "Cut Roster to 53";
      sublabel = `${rosterCount - 53} players over limit`;
      color = "#FF453A";
      emoji = "✂️";
    } else {
      label = "Start Season";
      sublabel = "Begin regular season";
      color = "#34C759";
      emoji = "▶";
    }
  } else if (phase === "regular") {
    label = `Sim Week ${league.week ?? ""}`;
    sublabel = "Simulate next game";
    color = "#0A84FF";
    emoji = "🏈";
  } else if (phase === "playoffs") {
    const roundNames = { 19: "Wild Card", 20: "Divisional", 21: "Conf. Champ", 22: "Super Bowl" };
    const round = roundNames[league.week] || `Playoffs Wk ${league.week}`;
    label = `Sim ${round}`;
    sublabel = "Playoff game";
    color = "#FFD60A";
    emoji = "🏆";
  } else if (phase === "free_agency") {
    label = "Next FA Day";
    sublabel = "Advance free agency";
    color = "#FF9F0A";
    emoji = "✍️";
  } else if (phase === "draft") {
    label = "Draft";
    sublabel = "Go to draft board";
    color = "#BF5AF2";
    emoji = "📋";
  } else if (["offseason_resign", "offseason"].includes(phase)) {
    label = "Advance Offseason";
    sublabel = "Move to next phase";
    color = "#64D2FF";
    emoji = "📅";
  } else {
    label = "Advance";
    sublabel = "";
    color = "var(--accent)";
    emoji = "▶";
  }

  return (
    <Button
      onClick={disabled ? undefined : onAdvanceWeek}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
        width: "100%",
        background: disabled
          ? "rgba(255,255,255,0.04)"
          : pressed
            ? `${color}dd`
            : `linear-gradient(135deg, ${color}ee, ${color}bb)`,
        border: `1.5px solid ${disabled ? "var(--hairline)" : color}`,
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", gap: 14,
        transition: "all 0.15s",
        transform: pressed ? "scale(0.98)" : "scale(1)",
        boxShadow: disabled ? "none" : `0 4px 24px ${color}44`,
        opacity: disabled ? 0.6 : 1,
        textAlign: "left",
        marginBottom: 16,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.4rem", flexShrink: 0,
      }}>
        {emoji}
      </div>
      <div>
        <div style={{
          fontSize: "1rem", fontWeight: 900,
          color: disabled ? "var(--text-muted)" : "#fff",
          lineHeight: 1.2,
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{
            fontSize: "0.72rem", fontWeight: 600,
            color: disabled ? "var(--text-subtle)" : "rgba(255,255,255,0.75)",
            marginTop: 2,
          }}>
            {sublabel}
          </div>
        )}
      </div>
      {!disabled && (
        <div style={{ marginLeft: "auto", fontSize: "1.2rem", color: "rgba(255,255,255,0.6)" }}>
          →
        </div>
      )}
    </Button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamColor(abbr = "") {
  const palette = [
    "#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF",
    "#FF6B35","#B4A0E5",
  ];
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = abbr.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function winPct(w, l, t) {
  const g = w + l + t;
  return g === 0 ? ".000" : ((w + t * 0.5) / g).toFixed(3).replace(/^0/, "");
}

function phaseInfo(phase) {
  const map = {
    preseason:  { label: "Pre-Season",   color: "#64D2FF", icon: "🏕️" },
    regular:    { label: "Regular Season",color: "#0A84FF", icon: "🏈" },
    playoffs:   { label: "Playoffs",      color: "#FFD60A", icon: "🏆" },
    draft:      { label: "Draft",         color: "#BF5AF2", icon: "📋" },
    offseason:  { label: "Off-Season",    color: "#34C759", icon: "🌅" },
    fa:         { label: "Free Agency",   color: "#FF9F0A", icon: "✍️"  },
  };
  return map[phase] || { label: phase ?? "Season", color: "#9FB0C2", icon: "📅" };
}

// Find next unplayed user game
function getNextGame(league) {
  if (!league?.schedule?.weeks) return null;
  const userId = league.userTeamId;
  for (const week of league.schedule.weeks) {
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId === userId || awayId === userId) {
        const isHome = homeId === userId;
        const oppId  = isHome ? awayId : homeId;
        const teamById = Object.fromEntries((league.teams || []).map(t => [t.id, t]));
        const opp      = teamById[oppId];
        const user     = teamById[userId];
        return { week: week.week, isHome, opp, user };
      }
    }
  }
  return null;
}

// Get injured players from user's roster
function getInjuries(league) {
  if (!league?.teams) return [];
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam?.roster) return [];
  return userTeam.roster.filter(p => p.injury || p.injuredWeeks > 0).slice(0, 4);
}

// ── Coach Approval Snippet ─────────────────────────────────────────────────────

function approvalColor(val) {
  if (val >= 75) return "#34C759";
  if (val >= 55) return "#FF9F0A";
  return "#FF453A";
}

function ownerMoodMeta(league) {
  if (!league) {
    return {
      mood: "neutral",
      face: "😐",
      toneColor: "var(--text-muted)",
      headline: "Owner mood unknown",
      detail: "Play a few weeks to get a read on expectations.",
    };
  }

  const userTeam = league.teams?.find(t => t.id === league.userTeamId);
  const approval = Math.round(league.ownerApproval ?? 75);
  const wins = userTeam?.wins ?? 0;
  const losses = userTeam?.losses ?? 0;
  const ties = userTeam?.ties ?? 0;
  const games = wins + losses + ties;
  const winPct = games > 0 ? ((wins + ties * 0.5) / games) : 0.5;

  const year = league.year ?? 1;
  const cycle = ((year - 1) % 3) + 1; // 1,2,3 → simple regime cycle

  let expectation;
  if (cycle === 1) {
    expectation = "Year 1: show clear progress toward 7+ wins or a top-10 unit.";
  } else if (cycle === 2) {
    expectation = "Year 2: push for a winning record and serious playoff contention.";
  } else {
    expectation = "Year 3: make the playoffs and be dangerous once you get there.";
  }

  let mood = "neutral";
  let face = "😐";
  let toneColor = "var(--text-muted)";
  let detail;

  if (approval >= 78) {
    mood = "thrilled";
    face = "😄";
    toneColor = "var(--success)";
    if (winPct >= 0.7) {
      detail = "Thrilled with how often you’re winning right now.";
    } else {
      detail = "Happy with the direction and the way the roster is shaping up.";
    }
  } else if (approval >= 58) {
    mood = "uneasy";
    face = "😕";
    toneColor = "var(--warning)";
    if (winPct >= 0.5) {
      detail = "Encouraged, but waiting to see if this team can truly separate.";
    } else {
      detail = "Concerned about inconsistency — wants cleaner performances soon.";
    }
  } else {
    mood = "angry";
    face = "😡";
    toneColor = "var(--danger)";
    if (winPct >= 0.4) {
      detail = "Frustrated that a talented roster isn’t converting close games.";
    } else {
      detail = "Very unhappy with the slide — patience is running low.";
    }
  }

  return {
    mood,
    face,
    toneColor,
    headline: `Owner mood: ${mood === "thrilled" ? "Thrilled" : mood === "uneasy" ? "Concerned" : "Angry"}`,
    detail,
    expectation,
    approval,
  };
}

/**
 * CoachApprovalSnippet — shows GM/Staff/Players/Fans/Media approval ratings.
 * Values are synthesised deterministically from league state so they update
 * after every simulated week without requiring a dedicated worker call.
 */
function CoachApprovalSnippet({ league }) {
  if (!league) return null;

  const userTeam = league.teams?.find(t => t.id === league.userTeamId);
  const base  = Math.round(league.ownerApproval ?? 75);
  const wins  = userTeam?.wins  ?? 0;
  const losses = userTeam?.losses ?? 0;
  const total  = wins + losses;
  const winRate = total > 0 ? wins / total : 0.5;

  // Deterministic fuzz per category — changes each week but never flickers
  const seed = ((league.year ?? 2025) * 31 + (league.week ?? 1) * 7) | 0;
  const fuzz = (offset) => {
    let s = (seed + offset * 1664525 + 1013904223) & 0xffff;
    return (s / 0xffff - 0.5) * 10;
  };

  const categories = [
    {
      label: "GM",
      emoji: "🏢",
      value: base,
    },
    {
      label: "Staff",
      emoji: "👔",
      value: Math.round(Math.min(99, Math.max(1, base + fuzz(1) * 0.5))),
    },
    {
      label: "Players",
      emoji: "🏈",
      value: Math.round(Math.min(99, Math.max(1, base * 0.88 + winRate * 12 + fuzz(2)))),
    },
    {
      label: "Fans",
      emoji: "📣",
      value: Math.round(Math.min(99, Math.max(1, winRate * 84 + 15 + fuzz(3)))),
    },
    {
      label: "Media",
      emoji: "📺",
      value: Math.round(Math.min(99, Math.max(1, winRate * 60 + base * 0.38 + fuzz(4)))),
    },
  ];

  const avg = Math.round(
    categories.reduce((s, c) => s + c.value, 0) / categories.length
  );
  const overallColor = approvalColor(avg);
  const trendEmoji   = avg >= 78 ? "📈" : avg >= 58 ? "➡️" : "📉";

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderLeft: `3px solid ${overallColor}`,
      borderRadius: "var(--radius-lg)",
      padding: "12px 14px 10px",
      marginBottom: 14,
    }}>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "0.95rem" }}>🏟️</span>
          <span style={{
            fontSize: "0.72rem", fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "1.1px",
          }}>
            Coach Approval
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: "0.75rem" }}>{trendEmoji}</span>
          <span style={{
            fontSize: "1.15rem", fontWeight: 900,
            color: overallColor, lineHeight: 1,
          }}>
            {avg}<span style={{ fontSize: "0.7rem", fontWeight: 700 }}>%</span>
          </span>
        </div>
      </div>

      {/* Five category columns */}
      <div style={{ display: "flex", gap: 6 }}>
        {categories.map(({ label, value }) => {
          const c = approvalColor(value);
          return (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                fontSize: "0.58rem", color: "var(--text-subtle)",
                fontWeight: 700, letterSpacing: "0.3px", marginBottom: 3,
              }}>
                {label}
              </div>
              <div style={{
                fontSize: "0.82rem", fontWeight: 900,
                color: c, lineHeight: 1.1, marginBottom: 4,
              }}>
                {value}
              </div>
              <div style={{
                height: 3, background: "rgba(255,255,255,0.07)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${value}%`,
                  background: c,
                  borderRadius: 2,
                  transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OwnerMoodSnippet({ league }) {
  const meta = ownerMoodMeta(league);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "10px 14px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.3rem",
        flexShrink: 0,
      }}>
        {meta.face}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.78rem",
          fontWeight: 800,
          color: meta.toneColor,
          marginBottom: 2,
        }}>
          {meta.headline} ({meta.approval}%)
        </div>
        <div style={{
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          lineHeight: 1.4,
        }}>
          {meta.detail}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, emoji }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {emoji && <span style={{ fontSize: "1rem" }}>{emoji}</span>}
      <h3 style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
        {title}
      </h3>
    </div>
  );
}

function TeamCircle({ abbr, size = 44 }) {
  const color = teamColor(abbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`, border: `2.5px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: size * 0.28, color, flexShrink: 0,
      letterSpacing: "-0.5px",
    }}>
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ icon, label, sublabel, color, onClick, badge, disabled }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Button
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: disabled ? "var(--surface)" : pressed
          ? `${color}22`
          : "var(--surface)",
        border: `1.5px solid ${disabled ? "var(--hairline)" : `${color}44`}`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        transition: "background 0.12s, transform 0.1s, box-shadow 0.12s",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        boxShadow: pressed ? "none" : "var(--shadow-sm)",
        opacity: disabled ? 0.45 : 1,
        position: "relative",
        overflow: "hidden",
        minHeight: 80,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}
    >
      {/* Subtle corner gradient */}
      {!disabled && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 48, height: 48,
          background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`,
          pointerEvents: "none",
        }} />
      )}

      {/* Badge */}
      {badge != null && badge > 0 && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "#FF453A", color: "#fff",
          borderRadius: "50%", width: 18, height: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.62rem", fontWeight: 900,
        }}>{badge > 9 ? "9+" : badge}</div>
      )}

      <div>
        <div style={{ fontSize: "1.4rem", marginBottom: 6, lineHeight: 1 }}>{icon}</div>
        <div style={{ fontSize: "0.85rem", fontWeight: 800, color: disabled ? "var(--text-subtle)" : "var(--text)", marginBottom: 2 }}>
          {label}
        </div>
      </div>
      {sublabel && (
        <div style={{ fontSize: "0.68rem", color: disabled ? "var(--text-subtle)" : "var(--text-muted)", lineHeight: 1.3 }}>
          {sublabel}
        </div>
      )}
    </Button>
  );
}

// ── Next Game Preview ─────────────────────────────────────────────────────────

function NextGameCard({ nextGame, league, onNavigate }) {
  if (!nextGame) return null;
  const { week, isHome, opp, user } = nextGame;
  const userTeam = user || league.teams?.find(t => t.id === league.userTeamId);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "16px",
      marginBottom: 16,
    }}>
      <SectionHeader title={`Week ${week ?? "?"} — Next Game`} emoji="🏈" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* User team */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <TeamCircle abbr={userTeam?.abbr ?? "YOU"} size={52} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text)" }}>{userTeam?.abbr ?? "Your Team"}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{winPct(userTeam?.wins??0,userTeam?.losses??0,userTeam?.ties??0)} • {userTeam?.wins??0}-{userTeam?.losses??0}</div>
          </div>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#34C759", background: "#34C75920", padding: "2px 6px", borderRadius: 4 }}>
            {isHome ? "HOME" : "AWAY"}
          </span>
        </div>

        {/* VS */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)", letterSpacing: "1px" }}>VS</div>
        </div>

        {/* Opponent */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <TeamCircle abbr={opp?.abbr ?? "OPP"} size={52} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text)" }}>{opp?.abbr ?? "Opponent"}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{winPct(opp?.wins??0,opp?.losses??0,opp?.ties??0)} • {opp?.wins??0}-{opp?.losses??0}</div>
          </div>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#FF9F0A", background: "#FF9F0A20", padding: "2px 6px", borderRadius: 4 }}>
            {isHome ? "AWAY" : "HOME"}
          </span>
        </div>
      </div>

      <Button
        onClick={() => onNavigate?.("Game Plan")}
        style={{
          width: "100%", marginTop: 14,
          background: "var(--accent)", color: "#fff",
          border: "none", borderRadius: "var(--radius-md)",
          padding: "10px", fontWeight: 800, fontSize: "0.85rem",
          cursor: "pointer", letterSpacing: "0.3px",
        }}
      >
        Game Plan →
      </Button>
    </div>
  );
}

// ── Injury Alert ──────────────────────────────────────────────────────────────

function InjuryAlerts({ injuries, onNavigate, onPlayerSelect }) {
  if (!injuries.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Injury Report" emoji="🏥" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {injuries.map(p => {
          const inj = p.injury || {};
          const weeks = inj.weeksLeft ?? inj.weeks ?? p.injuredWeeks ?? 0;
          const severity = weeks >= 6 ? "high" : weeks >= 3 ? "med" : "low";
          const color = severity === "high" ? "#FF453A" : severity === "med" ? "#FF9F0A" : "#FFD60A";
          return (
            <div
              key={p.id}
              onClick={() => onPlayerSelect?.(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                background: `${color}0d`,
                border: `1px solid ${color}33`,
                borderRadius: "var(--radius-md)",
                cursor: onPlayerSelect ? "pointer" : "default",
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text)" }}>{p.name}</span>
                <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "var(--text-muted)" }}>{p.pos}</span>
              </div>
              <div style={{ fontSize: "0.72rem", color, fontWeight: 700 }}>
                {inj.type ?? inj.description ?? "Injured"}
              </div>
              {weeks > 0 && (
                <div style={{ fontSize: "0.68rem", color: "var(--text-subtle)", flexShrink: 0 }}>
                  {weeks}w out
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button
        onClick={() => onNavigate?.("Injuries")}
        style={{
          background: "none", border: "none", color: "var(--accent)",
          fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
          padding: "6px 0 0", width: "100%", textAlign: "right",
        }}
      >
        View Full Report →
      </Button>
    </div>
  );
}

// ── Top Performers ────────────────────────────────────────────────────────────

function TopPerformers({ league, onPlayerSelect }) {
  const performers = useMemo(() => {
    if (!league?.lastResults?.length) return [];
    const seen = new Set();
    const out  = [];
    for (const result of league.lastResults) {
      for (const p of result.stars ?? result.topPlayers ?? []) {
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out.slice(0, 3);
  }, [league?.lastResults]);

  if (!performers.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Last Week's Stars" emoji="⭐" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {performers.map(p => (
          <PlayerCard
            key={p.id}
            player={p}
            variant="compact"
            onClick={onPlayerSelect ? () => onPlayerSelect(p.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ── Season Progress Bar ───────────────────────────────────────────────────────

function SeasonProgressBar({ league }) {
  const week  = league?.week ?? league?.currentWeek ?? 0;
  const total = league?.phase === "playoffs" ? 18 : 17;
  const pct   = Math.min(100, Math.round((week / total) * 100));
  const phase = phaseInfo(league?.phase);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1.5px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "14px 16px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.1rem" }}>{phase.icon}</span>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text)" }}>
              {phase.label}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {league?.year ?? "Season"} · Week {week} of {total}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: "1.6rem", fontWeight: 900, color: phase.color,
          lineHeight: 1,
        }}>
          {week}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${phase.color}cc, ${phase.color})`,
          borderRadius: 3,
          transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
        }} />
      </div>

      {/* Team record */}
      {league?.userTeam && (
        <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {league.userTeam.name} · {league.userTeam.wins ?? 0}-{league.userTeam.losses ?? 0}
          {league.userTeam.ties > 0 ? `-${league.userTeam.ties}` : ""}
        </div>
      )}
    </div>
  );
}

// ── Recent News ───────────────────────────────────────────────────────────────

function RecentNews({ news = [], onNavigate }) {
  if (!news.length) return null;
  const slice = news.slice(0, 4);

  const icons = { injury: "🏥", trade: "🔄", signing: "✍️", draft: "📋", award: "🏆", retirement: "👴", default: "📰" };

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Latest News" emoji="📰" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slice.map((item, i) => {
          const cat = item.category ?? item.type ?? "default";
          const icon = icons[cat] ?? icons.default;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 12px",
              background: "var(--surface)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)",
            }}>
              <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {item.text ?? item.headline ?? item.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WeeklyHub({ league, actions, onNavigate, onPlayerSelect, onAdvanceWeek, busy, simulating }) {
  const nextGame  = useMemo(() => getNextGame(league),     [league]);
  const injuries  = useMemo(() => getInjuries(league),     [league]);
  const news      = useMemo(() => league?.news ?? [],      [league?.news]);

  const injuryCount   = injuries.length;
  const userTeam      = league?.teams?.find(t => t.id === league.userTeamId);
  const capSpace      = userTeam?.capSpace ?? userTeam?.capRoom ?? null;
  const faCount       = league?.freeAgentCount ?? league?.freeAgents?.length ?? 0;
  const phase         = league?.phase ?? "regular";

  const isDraftPhase  = phase === "draft";
  const isFAPhase     = phase === "fa" || phase === "offseason";

  // Action grid config
  const actions_grid = [
    {
      icon: "🏋️", label: "Training",
      sublabel: "Develop your roster",
      color: "#34C759",
      tab: "Training",
      badge: null,
    },
    {
      icon: "👥", label: "Staff",
      sublabel: "Coaching & scouts",
      color: "#BF5AF2",
      tab: "Staff",
      badge: null,
    },
    {
      icon: "🏥", label: "Injuries",
      sublabel: injuryCount > 0 ? `${injuryCount} player${injuryCount !== 1 ? "s" : ""} out` : "No injuries",
      color: injuryCount > 0 ? "#FF453A" : "#34C759",
      tab: "Injuries",
      badge: injuryCount,
    },
    {
      icon: "🎯", label: "Game Plan",
      sublabel: "Set your game plan",
      color: "#0A84FF",
      tab: "Game Plan",
      badge: null,
    },
    {
      icon: "✍️", label: "Free Agency",
      sublabel: faCount > 0 ? `${faCount} available` : "Browse market",
      color: "#FF9F0A",
      tab: isFAPhase ? "FA Hub" : "Free Agency",
      badge: null,
    },
    {
      icon: "🔄", label: "Trades",
      sublabel: "Build your team",
      color: "#64D2FF",
      tab: "Trades",
      badge: null,
    },
    ...(isDraftPhase ? [{
      icon: "📋", label: "Draft Room",
      sublabel: "Make your picks",
      color: "#BF5AF2",
      tab: "Draft Room",
      badge: null,
    }] : []),
    {
      icon: "📊", label: "Roster",
      sublabel: capSpace != null ? `$${Number(capSpace).toFixed(0)}M cap space` : "Manage roster",
      color: "#9FB0C2",
      tab: "Roster",
      badge: null,
    },
    {
      icon: "📋", label: "Depth Chart",
      sublabel: "Set starters & depth",
      color: "#5E5CE6",
      tab: "Depth Chart",
      badge: null,
    },
  ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 80px" }}>

      {/* ── Season Progress + Next Game (mobile hero stack) ── */}
      <SeasonProgressBar league={league} />
      <NextGameCard nextGame={nextGame} league={league} onNavigate={onNavigate} />

      {/* ── Approval strip ── */}
      <CoachApprovalSnippet league={league} />
      <OwnerMoodSnippet league={league} />

      {/* ── Advance Week CTA ── */}
      {onAdvanceWeek && (
        <AdvanceWeekButton
          league={league}
          busy={!!busy}
          simulating={!!simulating}
          onAdvanceWeek={onAdvanceWeek}
        />
      )}

      {/* ── Action Grid ── */}
      <div style={{ marginBottom: 16 }}>
        <SectionHeader title="This Week" emoji="📅" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}>
          {actions_grid.map(a => (
            <ActionCard
              key={a.tab}
              icon={a.icon}
              label={a.label}
              sublabel={a.sublabel}
              color={a.color}
              badge={a.badge}
              onClick={() => onNavigate?.(a.tab)}
            />
          ))}
        </div>
      </div>

      {/* ── Injury Alerts ── */}
      <InjuryAlerts injuries={injuries} onNavigate={onNavigate} onPlayerSelect={onPlayerSelect} />

      {/* ── Top Performers ── */}
      <TopPerformers league={league} onPlayerSelect={onPlayerSelect} />

      {/* ── Recent News ── */}
      <RecentNews news={news} onNavigate={onNavigate} />

      {/* ── Cap Space Footer ── */}
      {capSpace != null && (() => {
        const capTotal  = userTeam?.capTotal ?? 255;
        const capUsed   = userTeam?.capUsed  ?? (capTotal - capSpace);
        const capColor  = capSpace > 20 ? "#34C759" : capSpace > 5 ? "#FF9F0A" : "#FF453A";
        const usedPct   = Math.min(100, Math.round((capUsed / capTotal) * 100));

        return (
          <div style={{
            background: `${capColor}0a`,
            border: `1px solid ${capColor}30`,
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
          }}>
            {/* Row 1: label + value */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.9rem" }}>💰</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Salary Cap
                </span>
              </div>
              <span style={{ fontWeight: 900, fontSize: "1rem", color: capColor }}>
                ${Number(capSpace).toFixed(1)}M remaining
              </span>
            </div>

            {/* Cap usage bar */}
            <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                height: "100%", width: `${usedPct}%`,
                background: `linear-gradient(90deg, var(--accent), ${capColor})`,
                borderRadius: 3, transition: "width 1s",
              }} />
            </div>

            {/* Row 3: used / total */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-subtle)" }}>
              <span>${Number(capUsed).toFixed(1)}M used ({usedPct}%)</span>
              <span>${Number(capTotal).toFixed(0)}M cap ceiling</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
