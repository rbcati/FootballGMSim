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

import React, { useMemo, useState, useEffect, useRef } from "react";
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

// NFL-authentic team colors
const NFL_PRIMARY_WH = {
  BUF:"#00338D",MIA:"#008E97",NE:"#C60C30",NYJ:"#18A050",
  BAL:"#9747FF",CIN:"#FB4F14",CLE:"#FF3C00",PIT:"#FFB612",
  HOU:"#C41230",IND:"#0055A4",JAX:"#D7A22A",TEN:"#4B92DB",
  DEN:"#FB4F14",KC:"#E31837",LV:"#A5ACAF",LAC:"#0080C6",
  DAL:"#6B9EFF",NYG:"#0B62A0",PHI:"#2D9E44",WSH:"#D55050",
  CHI:"#C83803",DET:"#0076B6",GB:"#FFB612",MIN:"#7B3FB5",
  ATL:"#A71930",CAR:"#0085CA",NO:"#B5A86C",TB:"#D50A0A",
  ARI:"#97233F",LAR:"#0047AB",SF:"#AA0000",SEA:"#69BE28",
};
function teamColor(abbr = "") {
  if (NFL_PRIMARY_WH[abbr]) return NFL_PRIMARY_WH[abbr];
  const palette = ["#0A84FF","#34C759","#FF9F0A","#FF453A","#5E5CE6",
    "#64D2FF","#FFD60A","#30D158","#FF6961","#AEC6CF","#FF6B35","#B4A0E5"];
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

// Get last N game results for any team from schedule
function getTeamRecentForm(schedule, teamId, n = 3) {
  if (!schedule?.weeks) return [];
  const results = [];
  for (const week of [...schedule.weeks].reverse()) {
    if (results.length >= n) break;
    for (const game of week.games ?? []) {
      if (!game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId !== teamId && awayId !== teamId) continue;
      const isHome = homeId === teamId;
      const ts = isHome ? game.homeScore : game.awayScore;
      const os = isHome ? game.awayScore : game.homeScore;
      results.push(ts > os ? "W" : ts < os ? "L" : "T");
    }
  }
  return results.reverse();
}

// Get next N unplayed games for the user team
function getUpcomingGames(league, n = 3) {
  if (!league?.schedule?.weeks) return [];
  const userId = league.userTeamId;
  const teamById = Object.fromEntries((league.teams || []).map(t => [t.id, t]));
  const games = [];
  for (const week of league.schedule.weeks) {
    if (games.length >= n) break;
    for (const game of week.games ?? []) {
      if (game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId !== userId && awayId !== userId) continue;
      const isHome = homeId === userId;
      const oppId = isHome ? awayId : homeId;
      games.push({ week: week.week, isHome, opp: teamById[oppId] });
    }
  }
  return games;
}

// Get current win/loss streak for a team
function getTeamStreak(schedule, teamId) {
  if (!schedule?.weeks) return null;
  let streakType = null;
  let count = 0;
  for (const week of [...schedule.weeks].reverse()) {
    for (const game of [...(week.games ?? [])].reverse()) {
      if (!game.played) continue;
      const homeId = typeof game.home === "object" ? game.home.id : Number(game.home);
      const awayId = typeof game.away === "object" ? game.away.id : Number(game.away);
      if (homeId !== teamId && awayId !== teamId) continue;
      const isHome = homeId === teamId;
      const ts = isHome ? game.homeScore : game.awayScore;
      const os = isHome ? game.awayScore : game.homeScore;
      const result = ts > os ? "W" : ts < os ? "L" : "T";
      if (streakType === null) { streakType = result; count = 1; }
      else if (result === streakType) count++;
      else return { type: streakType, count };
    }
  }
  return streakType ? { type: streakType, count } : null;
}

// Compute user team's conference playoff seeding
function getPlayoffSeed(league) {
  if (!league?.teams || !league?.userTeamId) return null;
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return null;
  const confIdx = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
  const confTeams = league.teams
    .filter(t => {
      const tc = typeof t.conf === "number" ? t.conf : t.conf === "AFC" ? 0 : 1;
      return tc === confIdx;
    })
    .sort((a, b) => {
      const ga = a.wins + a.losses + (a.ties ?? 0);
      const gb = b.wins + b.losses + (b.ties ?? 0);
      if (ga === 0 && gb === 0) return (b.ovr ?? 0) - (a.ovr ?? 0);
      const pa = (a.wins + (a.ties ?? 0) * 0.5) / Math.max(1, ga);
      const pb = (b.wins + (b.ties ?? 0) * 0.5) / Math.max(1, gb);
      return pb - pa;
    });
  const seed = confTeams.findIndex(t => t.id === userTeam.id) + 1;
  const confName = ["AFC", "NFC"][confIdx] ?? "?";
  return { seed, confName, inPlayoffs: seed <= 7, total: confTeams.length };
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

// Descriptive effects shown to the player for each decision
const PRACTICE_FOCUS_META = {
  balanced:          { label: "Balanced Week",         effect: "No bonuses — rest and general prep.",               icon: "⚖️" },
  red_zone_offense:  { label: "Red Zone Offense",      effect: "+TDs near goal line; –long-drive efficiency.",      icon: "🎯" },
  run_defense:       { label: "Stuff the Run",         effect: "+run stop rate; –pass rush pressure.",              icon: "🛡️" },
  pass_protection:   { label: "Pass Protection",       effect: "+OL blocking; –run game burst.",                    icon: "🧱" },
  third_down:        { label: "3rd Down Efficiency",   effect: "+conversion rate; –explosive play chance.",         icon: "📐" },
  two_minute_drill:  { label: "Two-Minute Drill",      effect: "+late-game scoring; –first-half ball control.",     icon: "⏱️" },
  secondary_coverage:{ label: "Secondary Coverage",   effect: "+coverage depth; –blitz frequency.",                icon: "🔒" },
  special_teams:     { label: "Special Teams",         effect: "+field position; –offensive reps.",                 icon: "🦵" },
};

const LOCKER_ROOM_META = {
  calm:              { label: "Stay Calm",             effect: "Consistent morale. No downside.",                   icon: "😌" },
  call_out_offense:  { label: "Hold Offense Accountable", effect: "+pressure on starters; –risk of friction.",     icon: "📢" },
  motivate_veterans: { label: "Rally the Veterans",   effect: "+morale for players 28+; –rookie confidence.",      icon: "💪" },
  back_rookie:       { label: "Back the Rookie",      effect: "+youth confidence; –veteran buy-in.",               icon: "🌱" },
  team_film_session: { label: "Extra Film Work",      effect: "+opponent awareness; –practice intensity.",         icon: "🎬" },
  closed_practices:  { label: "Closed Practices",     effect: "+game-plan secrecy; –media coverage.",              icon: "🚫" },
};

// Styled toggle button for GM decisions
function DecisionToggle({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {options.map(({ key, icon, label, shortLabel }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: "5px 10px",
              borderRadius: "var(--radius-pill)",
              border: `1.5px solid ${active ? "var(--accent)" : "var(--hairline)"}`,
              background: active ? "var(--accent-muted)" : "var(--surface)",
              color: active ? "var(--accent)" : "var(--text-muted)",
              fontSize: "0.68rem",
              fontWeight: active ? 800 : 500,
              cursor: "pointer",
              transition: "all 0.12s",
              outline: "none",
              whiteSpace: "nowrap",
            }}
          >
            {icon} {shortLabel ?? label}
          </button>
        );
      })}
    </div>
  );
}

function GMDecisionsCard({ league, actions }) {
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const existing = userTeam?.strategies?.gmDecisions || {};
  const [practiceFocus, setPracticeFocus] = useState(existing.practiceFocus || "balanced");
  const [lockerRoom, setLockerRoom]       = useState(existing.lockerRoom    || "calm");
  const [gameIntensity, setGameIntensity] = useState(existing.gameIntensity || "standard");

  const update = (next) => {
    actions?.updateStrategy?.({
      gmDecisions: {
        practiceFocus:  next.practiceFocus  ?? practiceFocus,
        lockerRoom:     next.lockerRoom     ?? lockerRoom,
        gameIntensity:  next.gameIntensity  ?? gameIntensity,
      },
    });
  };

  const practiceMeta = PRACTICE_FOCUS_META[practiceFocus] ?? PRACTICE_FOCUS_META.balanced;
  const lockerMeta   = LOCKER_ROOM_META[lockerRoom]       ?? LOCKER_ROOM_META.calm;

  const practiceOptions = Object.entries(PRACTICE_FOCUS_META).map(([k, v]) => ({
    key: k, icon: v.icon, label: v.label,
    shortLabel: v.label.split(" ").slice(0, 2).join(" "),
  }));
  const lockerOptions = Object.entries(LOCKER_ROOM_META).map(([k, v]) => ({
    key: k, icon: v.icon, label: v.label,
    shortLabel: v.label.split(" ").slice(0, 2).join(" "),
  }));
  const intensityOptions = [
    { key: "conservative", icon: "🛡️", label: "Conservative", shortLabel: "Conservative" },
    { key: "standard",     icon: "⚖️", label: "Standard",     shortLabel: "Standard" },
    { key: "aggressive",   icon: "⚔️", label: "Aggressive",   shortLabel: "Aggressive" },
    { key: "all_out",      icon: "🔥", label: "All-Out",      shortLabel: "All-Out" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Weekly Decisions" emoji="🧠" />
      <div style={{
        background: "var(--surface)",
        border: "1.5px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}>

        {/* Practice Focus */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
            <span>🏋️</span> Practice Focus
          </div>
          <DecisionToggle
            options={practiceOptions}
            value={practiceFocus}
            onChange={(v) => { setPracticeFocus(v); update({ practiceFocus: v }); }}
          />
          <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginTop: 6, lineHeight: 1.4 }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{practiceMeta.icon} {practiceMeta.label}:</span>{" "}
            {practiceMeta.effect}
          </div>
        </div>

        {/* Locker Room Tone */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
            <span>🎙️</span> Locker Room Tone
          </div>
          <DecisionToggle
            options={lockerOptions}
            value={lockerRoom}
            onChange={(v) => { setLockerRoom(v); update({ lockerRoom: v }); }}
          />
          <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginTop: 6, lineHeight: 1.4 }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{lockerMeta.icon} {lockerMeta.label}:</span>{" "}
            {lockerMeta.effect}
          </div>
        </div>

        {/* Game Intensity */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
            <span>⚡</span> Game Intensity
          </div>
          <DecisionToggle
            options={intensityOptions}
            value={gameIntensity}
            onChange={(v) => { setGameIntensity(v); update({ gameIntensity: v }); }}
          />
          <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginTop: 6, lineHeight: 1.4 }}>
            {gameIntensity === "conservative" && "🛡️ Lower injury risk; small scoring downside."}
            {gameIntensity === "standard"     && "⚖️ Balanced risk vs. reward. No modifiers."}
            {gameIntensity === "aggressive"   && "⚔️ +scoring upside; higher injury exposure."}
            {gameIntensity === "all_out"      && "🔥 Maximum upside; significant injury risk."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Owner Goals Card ──────────────────────────────────────────────────────────
// Explicit season goals driven by the cycle year + current performance.
// Shows fan approval bar + explicit win-target with consequence text.
function OwnerGoalsCard({ league }) {
  if (!league?.teams) return null;

  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return null;

  const wins      = userTeam.wins   ?? 0;
  const losses    = userTeam.losses ?? 0;
  const ties      = userTeam.ties   ?? 0;
  const games     = wins + losses + ties;
  const approval  = Math.round(league.ownerApproval ?? 75);
  const fanApproval = Math.round(league.fanApproval ?? 65);
  const year      = league.year ?? 1;
  const phase     = league.phase ?? "regular";
  const week      = league.week  ?? 1;

  // Season goal tiers (cycle repeats every 3 years)
  const cycle = ((year - 1) % 3) + 1;
  const goals = cycle === 1
    ? { wins: 7,  label: "7-win season",   reward: "Contract extension offer",  penalty: "Mandatory roster review" }
    : cycle === 2
    ? { wins: 9,  label: "Winning record", reward: "Increased draft budget",     penalty: "HC on hot seat" }
    : { wins: 11, label: "Playoff berth",  reward: "Franchise player bonus",     penalty: "HC fired at season end" };

  const remainingGames = Math.max(0, 17 - games);
  const winsNeeded     = Math.max(0, goals.wins - wins);
  const onPace         = games > 0 && (wins / games * 17) >= goals.wins;
  const alreadyMet     = wins >= goals.wins;
  const impossible     = !alreadyMet && winsNeeded > remainingGames;

  const statusColor = alreadyMet ? "#34C759" : impossible ? "#FF453A" : onPace ? "#0A84FF" : "#FF9F0A";
  const statusLabel = alreadyMet ? "✓ Goal met!" : impossible ? "Unreachable" : onPace ? "On pace" : "Behind pace";

  const approvalColor = (v) => v >= 70 ? "#34C759" : v >= 45 ? "#FF9F0A" : "#FF453A";

  // Fan approval meter
  const fanColor = approvalColor(fanApproval);

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Owner Goals" emoji="🎯" />
      <div style={{
        background: "var(--surface)",
        border: `1.5px solid ${statusColor}44`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 14px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Win target row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${statusColor}18`,
            border: `1.5px solid ${statusColor}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.1rem", flexShrink: 0,
          }}>
            {alreadyMet ? "🏆" : impossible ? "😰" : "🎯"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>
              Year {cycle} Goal: <span style={{ color: statusColor }}>{goals.label}</span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
              {alreadyMet
                ? `Achieved with ${wins} wins — great work!`
                : `${wins}W so far · need ${winsNeeded} more in ${remainingGames} games`}
            </div>
          </div>
          <span style={{
            fontSize: "0.65rem", fontWeight: 800,
            color: statusColor,
            background: `${statusColor}18`,
            border: `1px solid ${statusColor}44`,
            padding: "3px 8px", borderRadius: 8,
            flexShrink: 0,
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Win progress bar */}
        {phase === "regular" && (
          <div>
            <div style={{ height: 5, background: "var(--hairline)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (wins / goals.wins) * 100)}%`,
                background: `linear-gradient(90deg, ${statusColor}bb, ${statusColor})`,
                borderRadius: 3, transition: "width 0.5s",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span style={{ fontSize: "0.6rem", color: "var(--text-subtle)" }}>{wins} wins</span>
              <span style={{ fontSize: "0.6rem", color: "var(--text-subtle)" }}>Target: {goals.wins}</span>
            </div>
          </div>
        )}

        {/* Reward / Penalty */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            flex: 1, padding: "8px 10px",
            background: "#34C75910", border: "1px solid #34C75930",
            borderRadius: 8,
          }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#34C759", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Reward
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{goals.reward}</div>
          </div>
          <div style={{
            flex: 1, padding: "8px 10px",
            background: "#FF453A10", border: "1px solid #FF453A30",
            borderRadius: 8,
          }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#FF453A", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Consequence
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{goals.penalty}</div>
          </div>
        </div>

        {/* Approval meters */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Owner Approval", value: approval,    color: approvalColor(approval) },
            { label: "Fan Approval",   value: fanApproval, color: fanColor },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: "0.62rem", fontWeight: 900, color }}>{value}%</span>
              </div>
              <div style={{ height: 5, background: "var(--hairline)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${value}%`,
                  background: color, borderRadius: 3, transition: "width 0.5s",
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Low approval warning */}
        {(approval < 40 || fanApproval < 35) && (
          <div style={{
            padding: "8px 10px",
            background: "#FF453A0d",
            border: "1px solid #FF453A44",
            borderRadius: 8,
            fontSize: "0.72rem",
            color: "#FF453A",
            fontWeight: 700,
          }}>
            ⚠️ {approval < 40 ? "Owner patience is running thin — win more games or restructure." : "Fan support is dropping — consecutive losses erode attendance revenue."}
          </div>
        )}
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

function MiniFormDots({ form }) {
  if (!form?.length) return null;
  return (
    <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
      {form.map((r, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: r === "W" ? "#34C759" : r === "L" ? "#FF453A" : "#FF9F0A",
          flexShrink: 0,
        }} title={r === "W" ? "Win" : r === "L" ? "Loss" : "Tie"} />
      ))}
    </div>
  );
}

function NextGameCard({ nextGame, league, onNavigate }) {
  if (!nextGame) return null;
  const { week, isHome, opp, user } = nextGame;
  const userTeam = user || league.teams?.find(t => t.id === league.userTeamId);

  const userForm = useMemo(() => getTeamRecentForm(league?.schedule, league?.userTeamId, 3), [league?.schedule, league?.userTeamId]);
  const oppForm  = useMemo(() => getTeamRecentForm(league?.schedule, opp?.id, 3), [league?.schedule, opp?.id]);
  const oppStreak = useMemo(() => getTeamStreak(league?.schedule, opp?.id), [league?.schedule, opp?.id]);

  // Check if this is a division rival (same conf + div)
  const isDivRival = useMemo(() => {
    if (!userTeam || !opp) return false;
    const uc = typeof userTeam.conf === "number" ? userTeam.conf : userTeam.conf === "AFC" ? 0 : 1;
    const oc = typeof opp.conf === "number" ? opp.conf : opp.conf === "AFC" ? 0 : 1;
    const ud = typeof userTeam.div === "number" ? userTeam.div : { East:0,North:1,South:2,West:3 }[userTeam.div] ?? -1;
    const od = typeof opp.div === "number" ? opp.div : { East:0,North:1,South:2,West:3 }[opp.div] ?? -2;
    return uc === oc && ud === od;
  }, [userTeam, opp]);

  // OVR matchup edge
  const userOvr = userTeam?.ovr ?? 75;
  const oppOvr  = opp?.ovr ?? 75;
  const ovrDiff = userOvr - oppOvr;
  const matchupLabel = ovrDiff >= 5 ? "Favorable" : ovrDiff <= -5 ? "Tough" : "Even";
  const matchupColor = ovrDiff >= 5 ? "#34C759" : ovrDiff <= -5 ? "#FF453A" : "#FF9F0A";

  const isPlayoffWeek = week >= 19;
  const weekLabel = isPlayoffWeek
    ? (["Wild Card","Divisional","Conf. Championship","Super Bowl"][week - 19] ?? `Playoffs`)
    : `Week ${week ?? "?"}`;

  return (
    <div style={{
      background: isPlayoffWeek ? "linear-gradient(135deg, rgba(255,214,10,0.06) 0%, var(--surface) 60%)" : "var(--surface)",
      border: isPlayoffWeek ? "1.5px solid #FFD60A55" : "1.5px solid var(--hairline)",
      borderRadius: "var(--radius-lg)",
      padding: "16px",
      marginBottom: 16,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <SectionHeader title={`${weekLabel} — Next Game`} emoji={isPlayoffWeek ? "🏆" : "🏈"} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {isDivRival && (
            <span style={{
              fontSize: "0.6rem", fontWeight: 800, color: "#FF453A",
              background: "#FF453A18", padding: "2px 6px",
              borderRadius: 4, letterSpacing: "0.5px",
            }}>DIV RIVAL</span>
          )}
          <span style={{
            fontSize: "0.6rem", fontWeight: 800, color: matchupColor,
            background: `${matchupColor}18`, padding: "2px 6px",
            borderRadius: 4,
          }}>{matchupLabel}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* User team */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <TeamCircle abbr={userTeam?.abbr ?? "YOU"} size={52} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text)" }}>{userTeam?.abbr ?? "Your Team"}</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{userTeam?.wins??0}-{userTeam?.losses??0} · OVR {userOvr}</div>
          </div>
          <MiniFormDots form={userForm} />
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#34C759", background: "#34C75920", padding: "2px 6px", borderRadius: 4 }}>
            {isHome ? "HOME" : "AWAY"}
          </span>
        </div>

        {/* VS */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)", letterSpacing: "1px" }}>VS</div>
          {ovrDiff !== 0 && (
            <div style={{ fontSize: "0.58rem", color: matchupColor, fontWeight: 700 }}>
              {ovrDiff > 0 ? `+${ovrDiff}` : ovrDiff}
            </div>
          )}
        </div>

        {/* Opponent */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <TeamCircle abbr={opp?.abbr ?? "OPP"} size={52} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text)" }}>{opp?.abbr ?? "Opponent"}</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{opp?.wins??0}-{opp?.losses??0} · OVR {oppOvr}</div>
          </div>
          <MiniFormDots form={oppForm} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#FF9F0A", background: "#FF9F0A20", padding: "2px 6px", borderRadius: 4 }}>
              {isHome ? "AWAY" : "HOME"}
            </span>
            {oppStreak && (
              <span style={{
                fontSize: "0.58rem", color: oppStreak.type === "W" ? "#34C759" : "#FF453A",
                fontWeight: 700,
              }}>
                {oppStreak.count}{oppStreak.type} streak
              </span>
            )}
          </div>
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
        View Game Plan →
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

function getPowerRankWH(league) {
  if (!league?.teams || !league?.userTeamId) return null;
  const sorted = [...league.teams].sort((a, b) => {
    const ga = a.wins + a.losses + (a.ties ?? 0);
    const gb = b.wins + b.losses + (b.ties ?? 0);
    const pa = ga > 0 ? (a.wins + (a.ties ?? 0) * 0.5) / ga : 0.5;
    const pb = gb > 0 ? (b.wins + (b.ties ?? 0) * 0.5) / gb : 0.5;
    if (Math.abs(pb - pa) > 0.005) return pb - pa;
    return (b.ovr ?? 70) - (a.ovr ?? 70);
  });
  return sorted.findIndex(t => t.id === league.userTeamId) + 1;
}

function SeasonProgressBar({ league }) {
  const week  = league?.week ?? league?.currentWeek ?? 0;
  const total = league?.phase === "playoffs" ? 18 : 17;
  const pct   = Math.min(100, Math.round((week / total) * 100));
  const phase = phaseInfo(league?.phase);
  const userTeam = league?.teams?.find(t => t.id === league.userTeamId);
  const powerRank = getPowerRankWH(league);
  const rankColor = powerRank <= 8 ? "#FFD60A" : powerRank <= 16 ? "#34C759" : powerRank <= 24 ? "#FF9F0A" : "#FF453A";

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
              {league?.year ?? "Season"}
              {league?.phase === "regular" ? ` · Week ${week} of ${total}` : ""}
              {userTeam ? ` · ${userTeam.wins ?? 0}-${userTeam.losses ?? 0}${(userTeam.ties ?? 0) > 0 ? `-${userTeam.ties}` : ""}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {powerRank && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Power Rank</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 900, color: rankColor, lineHeight: 1.1 }}>#{powerRank}</div>
            </div>
          )}
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: phase.color, lineHeight: 1 }}>
            {week}
          </div>
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
    </div>
  );
}

// ── Playoff Picture Snippet ───────────────────────────────────────────────────

function PlayoffPictureSnippet({ league }) {
  if (league?.phase !== "regular") return null;
  const seedData = getPlayoffSeed(league);
  if (!seedData) return null;
  const { seed, confName, inPlayoffs } = seedData;
  const weeksLeft = Math.max(0, 18 - (league.week ?? 0));

  let statusText, seedColor, icon;
  if (seed === 1) {
    statusText = `#1 seed — ${confName} leader`;
    seedColor = "#FFD60A"; icon = "🥇";
  } else if (seed <= 4) {
    statusText = `#${seed} seed — Div leader`;
    seedColor = "#34C759"; icon = "🟢";
  } else if (seed <= 7) {
    statusText = `#${seed} seed — Wild card`;
    seedColor = "#0A84FF"; icon = "🔵";
  } else {
    const back = seed - 7;
    statusText = `#${seed} — ${back} game${back !== 1 ? "s" : ""} out of playoffs`;
    seedColor = "#FF453A"; icon = "🔴";
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 14px",
      background: inPlayoffs ? "#34C75908" : "#FF453A08",
      border: `1px solid ${inPlayoffs ? "#34C75930" : "#FF453A25"}`,
      borderRadius: "var(--radius-md)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: "0.9rem" }}>{icon}</span>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 800, color: seedColor }}>{statusText}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-subtle)", marginTop: 1 }}>
            {confName} Playoff Picture
          </div>
        </div>
      </div>
      <div style={{
        fontSize: "0.68rem", fontWeight: 700,
        color: "var(--text-subtle)", textAlign: "right",
      }}>
        {weeksLeft > 0 ? `${weeksLeft}w remaining` : "Season complete"}
      </div>
    </div>
  );
}

// ── Upcoming Schedule ─────────────────────────────────────────────────────────

function UpcomingScheduleCard({ league, onNavigate }) {
  const upcoming = useMemo(() => getUpcomingGames(league, 4), [league]);
  // Skip the first (already shown in NextGameCard), show up to 3 more
  const rest = upcoming.slice(1, 4);
  if (!rest.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader title="Upcoming Schedule" emoji="📅" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rest.map(({ week, isHome, opp }) => {
          const isPlayoffRound = week >= 19;
          const weekLabel = isPlayoffRound
            ? (["WC","DIV","CCG","SB"][week - 19] ?? `Wk${week}`)
            : `Wk ${week}`;
          const oppOvr = opp?.ovr ?? 75;
          const ovrColor = oppOvr >= 82 ? "#FF453A" : oppOvr >= 75 ? "#FF9F0A" : "#34C759";
          return (
            <div key={week} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 12px",
              background: "var(--surface)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-md)",
            }}>
              <span style={{
                fontSize: "0.62rem", fontWeight: 800,
                color: isPlayoffRound ? "#FFD60A" : "var(--text-subtle)",
                width: 32, flexShrink: 0,
              }}>{weekLabel}</span>
              <TeamCircle abbr={opp?.abbr ?? "?"} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>
                  {isHome ? "vs " : "@ "}{opp?.abbr ?? "?"}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", marginLeft: 6 }}>
                  {opp?.wins ?? 0}-{opp?.losses ?? 0}
                </span>
              </div>
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, color: ovrColor,
                background: `${ovrColor}15`, padding: "1px 5px", borderRadius: 3,
              }}>OVR {oppOvr}</span>
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, flexShrink: 0,
                color: isHome ? "#34C759" : "#FF9F0A",
              }}>{isHome ? "H" : "A"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── League Leaders Snapshot ───────────────────────────────────────────────────

function WeeklyLeagueLeaders({ league, onNavigate }) {
  const leaders = useMemo(() => {
    if (!league?.teams?.length) return [];
    const allPlayers = [];
    for (const team of league.teams) {
      for (const p of team.roster ?? []) {
        allPlayers.push({ ...p, teamAbbr: team.abbr, teamId: team.id });
      }
    }

    const getStat = (p, key) =>
      p.stats?.season?.[key] ?? p.seasonStats?.[key] ?? p.stats?.career?.[key] ?? 0;

    const topBy = (key, posFilter, label, unit = "") => {
      const eligible = allPlayers.filter(p => {
        const pos = p.pos ?? p.position ?? "";
        return posFilter.some(f => pos.toUpperCase().startsWith(f));
      });
      const sorted = eligible.filter(p => getStat(p, key) > 0).sort((a, b) => getStat(b, key) - getStat(a, key));
      if (!sorted.length) return null;
      const top = sorted[0];
      const val = getStat(top, key);
      const name = top.lastName ? `${top.firstName?.[0] ?? ""}. ${top.lastName}` : (top.name ?? "?");
      return { label, name: name.trim(), val: Math.round(val) + unit, teamAbbr: top.teamAbbr, pos: top.pos ?? top.position ?? "" };
    };

    return [
      topBy("passYds",  ["QB"],           "Pass Yds"),
      topBy("rushYds",  ["RB","QB","FB"], "Rush Yds"),
      topBy("recYds",   ["WR","TE","RB"], "Rec Yds"),
      topBy("sacks",    ["DE","DT","LB","OLB","EDGE","DL"], "Sacks"),
      topBy("passTD",   ["QB"],           "Pass TDs"),
      topBy("rushTD",   ["RB","QB"],      "Rush TDs"),
    ].filter(Boolean).slice(0, 6);
  }, [league?.teams]);

  if (!leaders.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionHeader title="League Leaders" emoji="📊" />
        {onNavigate && (
          <button
            onClick={() => onNavigate?.("Stats")}
            style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            Full Stats →
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {leaders.map(({ label, name, val, teamAbbr, pos }) => (
          <div key={label} style={{
            padding: "8px 10px",
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-md)",
          }}>
            <div style={{ fontSize: "0.58rem", color: "var(--text-subtle)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 900, color: "var(--text)", lineHeight: 1.1 }}>
              {val}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
              {name} · {teamAbbr}
            </div>
          </div>
        ))}
      </div>
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

// ── Owner Strategy Notes ──────────────────────────────────────────────────────
// Persistent GM notepad — text is stored in localStorage so it survives reloads.
function OwnerNotesCard({ league }) {
  const storageKey = `gmsim_gm_notes_${league?.id ?? 'default'}`;
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem(storageKey) || ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(false);
  const timerRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, val); } catch { /* quota full */ }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }, 600);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionHeader title="GM Notes" emoji="📝" />
        {saved && (
          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#34C759", opacity: 0.8 }}>
            ✓ Saved
          </span>
        )}
      </div>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Jot down your strategy, trade targets, injury concerns…"
        rows={4}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: "1.5px solid var(--hairline)",
          borderRadius: "var(--radius-lg)",
          padding: "10px 12px",
          color: "var(--text)",
          fontSize: "0.78rem",
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
        onBlur={e => { e.target.style.borderColor = "var(--hairline)"; }}
      />
    </div>
  );
}

// ── New-Career Checklist ──────────────────────────────────────────────────────
// Shows only in year 1 / first career. Each item auto-completes when the
// corresponding milestone is detected in league state.

const CHECKLIST_ITEMS = [
  {
    id: "sim_week",
    label: "Simulate your first week",
    check: (l) => (l?.week ?? 1) > 1 || l?.phase === "playoffs" || l?.phase === "offseason",
  },
  {
    id: "check_roster",
    label: "Review your roster (Roster Hub tab)",
    check: (_l, done) => done.has("check_roster"),  // manual dismiss
    manual: true,
  },
  {
    id: "set_strategy",
    label: "Set your scheme & game plan",
    check: (l) => !!(l?.teams?.find(t => t.id === l?.userTeamId)?.strategies?.offSchemeId),
  },
  {
    id: "first_win",
    label: "Win your first game",
    check: (l) => (l?.teams?.find(t => t.id === l?.userTeamId)?.wins ?? 0) >= 1,
  },
  {
    id: "make_playoffs",
    label: "Make the playoffs",
    check: (l) => l?.phase === "playoffs" || l?.phase === "offseason" || l?.phase === "offseason_resign",
  },
];

function NewCareerChecklist({ league, onNavigate }) {
  const storageKey = `gmsim_checklist_${league?.seasonId ?? "0"}`;
  const [manualDone, setManualDone] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); }
    catch { return new Set(); }
  });
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem("gmsim_checklist_dismissed"); }
    catch { return false; }
  });

  // Only show in year 1 of a career
  const isNewCareer = (league?.year === 2025 || league?.year === 1);
  if (!isNewCareer || dismissed) return null;

  const items = CHECKLIST_ITEMS.map(item => ({
    ...item,
    done: item.check(league, manualDone),
  }));

  const completedCount = items.filter(i => i.done).length;
  const allDone = completedCount === items.length;

  const markManual = (id) => {
    const next = new Set([...manualDone, id]);
    setManualDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* non-fatal */ }
  };

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("gmsim_checklist_dismissed", "1"); } catch { /* non-fatal */ }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionHeader title="First Season Goals" emoji="✅" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)" }}>
            {completedCount}/{items.length}
          </span>
          <button
            onClick={dismiss}
            style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer", fontSize: "0.75rem", padding: "0 2px" }}
            title="Dismiss checklist"
          >
            ×
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--hairline)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${(completedCount / items.length) * 100}%`,
          background: allDone ? "#34C759" : "var(--accent)",
          borderRadius: 2,
          transition: "width 0.4s",
        }} />
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1.5px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px",
              borderBottom: i < items.length - 1 ? "1px solid var(--hairline)" : "none",
              opacity: item.done ? 0.55 : 1,
            }}
          >
            {/* Checkbox */}
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${item.done ? "#34C759" : "var(--hairline)"}`,
              background: item.done ? "#34C75922" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.7rem",
            }}>
              {item.done ? "✓" : ""}
            </div>

            {/* Label */}
            <span style={{
              flex: 1, fontSize: "0.78rem",
              fontWeight: item.done ? 500 : 700,
              color: item.done ? "var(--text-muted)" : "var(--text)",
              textDecoration: item.done ? "line-through" : "none",
            }}>
              {item.label}
            </span>

            {/* Manual dismiss for items with no auto-check */}
            {!item.done && item.manual && (
              <button
                onClick={() => markManual(item.id)}
                style={{
                  fontSize: "0.65rem", color: "var(--accent)",
                  background: "none", border: "1px solid var(--accent)",
                  borderRadius: 6, padding: "2px 8px", cursor: "pointer",
                }}
              >
                Done
              </button>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div style={{
          marginTop: 10, textAlign: "center",
          fontSize: "0.8rem", fontWeight: 800, color: "#34C759",
        }}>
          🎉 First-season goals complete! You&apos;re a real GM now.
        </div>
      )}
    </div>
  );
}

export default function WeeklyHub({ league, actions, onNavigate, onPlayerSelect, onAdvanceWeek, busy, simulating }) {
  const nextGame  = useMemo(() => getNextGame(league),     [league]);
  const injuries  = useMemo(() => getInjuries(league),     [league]);
  const news      = useMemo(() => league?.news ?? [],      [league?.news]);
  const userStreak = useMemo(() => getTeamStreak(league?.schedule, league?.userTeamId), [league?.schedule, league?.userTeamId]);

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
    {
      icon: "🚀", label: "V2 Roadmap",
      sublabel: "Track pending upgrades",
      color: "#FF9F0A",
      tab: "V2 Roadmap",
      badge: null,
    },
    {
      icon: "🧪", label: "Training Lab",
      sublabel: "Weekly training points",
      color: "#34C759",
      tab: "Training Lab",
      badge: null,
    },
    {
      icon: "🔎", label: "Scouting",
      sublabel: "Big board + combine",
      color: "#0A84FF",
      tab: "Scouting Center",
      badge: null,
    },
    {
      icon: "💼", label: "Contracts",
      sublabel: "Negotiation + bidding",
      color: "#FF9F0A",
      tab: "Contracts Hub",
      badge: null,
    },
    {
      icon: "🧠", label: "League AI",
      sublabel: "CPU trend reactions",
      color: "#5E5CE6",
      tab: "League AI",
      badge: null,
    },
    {
      icon: "🌅", label: "Offseason",
      sublabel: "Calendar + phase tools",
      color: "#64D2FF",
      tab: "Offseason",
      badge: null,
    },
  ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 80px" }}>

      {/* ── Season Progress ── */}
      <SeasonProgressBar league={league} />

      {/* ── Streak Banner ── */}
      {userStreak && userStreak.count >= 2 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px",
          background: userStreak.type === "W" ? "#34C75910" : "#FF453A08",
          border: `1px solid ${userStreak.type === "W" ? "#34C75930" : "#FF453A25"}`,
          borderRadius: "var(--radius-md)", marginBottom: 12,
        }}>
          <span style={{ fontSize: "1rem" }}>{userStreak.type === "W" ? "🔥" : "❄️"}</span>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, color: userStreak.type === "W" ? "#34C759" : "#FF453A" }}>
            {userStreak.count}-game {userStreak.type === "W" ? "win" : "losing"} streak
          </span>
          {userStreak.type === "W" && userStreak.count >= 4 && (
            <span style={{ fontSize: "0.62rem", color: "#FF9F0A", fontWeight: 700, marginLeft: "auto" }}>HOT STREAK 🌶️</span>
          )}
        </div>
      )}

      {/* ── Playoff picture (regular season only) ── */}
      <PlayoffPictureSnippet league={league} />

      {/* ── Next Game ── */}
      <NextGameCard nextGame={nextGame} league={league} onNavigate={onNavigate} />

      {/* ── ADVANCE WEEK CTA — primary action, shown right after matchup context ── */}
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
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
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

      {/* ── Upcoming Schedule ── */}
      <UpcomingScheduleCard league={league} onNavigate={onNavigate} />

      {/* ── Injury Alerts ── */}
      <InjuryAlerts injuries={injuries} onNavigate={onNavigate} onPlayerSelect={onPlayerSelect} />

      {/* ── Top Performers ── */}
      <TopPerformers league={league} onPlayerSelect={onPlayerSelect} />

      {/* ── Owner Goals & Approval ── */}
      <OwnerGoalsCard league={league} />

      {/* ── GM Weekly Decisions ── */}
      <CoachApprovalSnippet league={league} />
      <OwnerMoodSnippet league={league} />
      <GMDecisionsCard league={league} actions={actions} />

      {/* ── GM Notes (persistent notepad) ── */}
      <OwnerNotesCard league={league} />

      {/* ── New-career checklist (year 1 only) ── */}
      <NewCareerChecklist league={league} onNavigate={onNavigate} />

      {/* ── League Leaders ── */}
      <WeeklyLeagueLeaders league={league} onNavigate={onNavigate} />

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
