/**
 * GameSimulation.jsx — Premium Madden-style game simulation screen
 *
 * Replaces SeasonSimViewer with a fully immersive experience:
 *  - AnimatedField SVG with real-time player movement
 *  - Live score ticker + quarter/time/down-distance HUD
 *  - Visual momentum meter (swinging bar)
 *  - Dramatic play-by-play feed with commentary lines
 *  - Key Plays filter mode
 *  - Fast Forward / Pause / Watch Key Plays controls
 *  - PlayerCard popup on big plays (TD, INT, 20+ yards)
 *  - Transitions to PostGameScreen on completion
 */

import React, {
  useState, useEffect, useRef, useMemo, useCallback
} from "react";
import AnimatedField from "./AnimatedField.jsx";
import PlayerCard, { ovrTier, posColor } from "./PlayerCard.jsx";

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

function isKeyPlay(log) {
  const txt = (log.text || log.playText || log.description || "").toLowerCase();
  return (
    log.type === "touchdown" || log.type === "interception" || log.type === "fumble" ||
    txt.includes("touchdown") || txt.includes("td") || txt.includes("interception") ||
    txt.includes("fumble") || txt.includes("sack") || txt.includes("field goal") ||
    (log.yards != null && log.yards >= 20)
  );
}

function isTouchdown(log) {
  const txt = (log.text || log.playText || log.description || "").toLowerCase();
  return log.type === "touchdown" || txt.includes("touchdown");
}

function isTurnover(log) {
  const txt = (log.text || log.playText || log.description || "").toLowerCase();
  return log.type === "interception" || log.type === "fumble" ||
    txt.includes("interception") || txt.includes("fumble");
}

const SPEED_DELAYS = { 1: 900, 2: 400, 4: 150, instant: 20 };

// ── Commentary system with 30+ player-name-aware lines ───────────────────────

function _rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getCommentary(log) {
  const txt = (log.text || log.playText || log.description || "").toLowerCase();
  const p = log.player;
  const pn = p ? (p.name || "").split(" ").pop() : null; // last name
  const passer = log.passer;
  const pnPasser = passer ? (passer.name || "").split(" ").pop() : null;

  if (isTouchdown(log)) {
    const tdType = log.tdType;
    if (tdType === "pass" && pn && pnPasser) {
      return _rand([
        `TOUCHDOWN! ${pnPasser} to ${pn} — pure brilliance!`,
        `${pnPasser} finds ${pn} in the end zone! SIX POINTS!`,
        `${pn} hauls it in! ${pnPasser} with the perfect throw!`,
        `That's a TOUCHDOWN! ${pn} makes it look easy!`,
        `${pnPasser} delivers and ${pn} comes down with it — TOUCHDOWN!`,
      ]);
    }
    if (tdType === "rush" && pn) {
      return _rand([
        `TOUCHDOWN! ${pn} refuses to be stopped!`,
        `${pn} bulldozes into the end zone! Six points!`,
        `There's no stopping ${pn} today — TOUCHDOWN!`,
        `${pn} with power and purpose — TOUCHDOWN!`,
      ]);
    }
    if ((tdType === "int_return" || tdType === "fumble_return") && pn) {
      return _rand([
        `DEFENSIVE TOUCHDOWN! ${pn} takes it all the way!`,
        `${pn} with the big return — the defense scores!`,
        `Unbelievable! ${pn} with the pick-six!`,
      ]);
    }
    return _rand([
      "TOUCHDOWN! The crowd goes absolutely wild!",
      "HE'S IN! That's six points!",
      "WHAT A SCORE! The fans are on their feet!",
      "A momentum-shifting score! The stadium erupts!",
    ]);
  }

  if (isTurnover(log)) {
    if (txt.includes("fumble")) {
      return _rand([
        "FUMBLE! Loose ball on the field!",
        "The ball is out! Who's got it?!",
        "FUMBLE RECOVERED! The defense is pumped up!",
        `${pn ? pn + " loses it" : "Turnover"} — huge momentum swing!`,
      ]);
    }
    // Interception
    if (pn && log.intedQB) {
      const qbLast = (log.intedQB.name || "").split(" ").pop();
      return _rand([
        `PICKED OFF! ${pn} reads ${qbLast} perfectly!`,
        `${pn} with the interception — what a play!`,
        `${qbLast} throws it right to ${pn}! INTERCEPTION!`,
        `TURNOVER! ${pn} jumps the route and comes down with it!`,
      ]);
    }
    return _rand([
      "PICKED OFF! The defense comes up HUGE!",
      "INTERCEPTION! What a read by the secondary!",
      "TURNOVER! The momentum completely shifts!",
    ]);
  }

  if (txt.includes("sack")) {
    if (pn && log.sackedQB) {
      const qbLast = (log.sackedQB.name || "").split(" ").pop();
      return _rand([
        `SACKED! ${pn} brings down ${qbLast} for a loss!`,
        `${pn} gets home! ${qbLast} goes down!`,
        `Great pressure from ${pn} — the QB is down!`,
        `${pn} beats the block and sacks ${qbLast}!`,
      ]);
    }
    return _rand([
      "SACKED! The defense brings him down!",
      "He's got nowhere to go — taken down for a loss!",
      "Great pressure off the edge!",
    ]);
  }

  if ((log.yards ?? 0) >= 20) {
    if (pn) {
      return _rand([
        `${pn} takes it the distance — what a gain!`,
        `Big play by ${pn}! Over 20 yards on the move!`,
        `${pn} finds the open field — chunk yards!`,
        `That's a HUGE pickup by ${pn}!`,
        `${pn} makes the defense look foolish — big gain!`,
      ]);
    }
    return _rand([
      "Big gain on the play!",
      "He breaks a tackle and picks up chunks!",
      "That's a HUGE chunk of yards!",
    ]);
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TeamBadge({ abbr, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}20`, border: `2px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: size * 0.28, color, flexShrink: 0,
    }}>
      {abbr?.slice(0, 3) ?? "?"}
    </div>
  );
}

function ScoreHUD({ homeTeam, awayTeam, homeScore, awayScore, quarter, timeLeft, down, distance, possession, homeColor, awayColor }) {
  const qLabel = quarter ? (quarter > 4 ? "OT" : `Q${quarter}`) : "—";
  const downLabel = down ? `${down}${["st","nd","rd","th"][Math.min(down-1,3)]} & ${distance ?? 10}` : "";
  const possAbbr = possession === "home" ? homeTeam?.abbr : awayTeam?.abbr;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px",
      background: "rgba(0,0,0,0.6)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      flexShrink: 0,
      gap: 8,
    }}>
      {/* Away */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <TeamBadge abbr={awayTeam?.abbr} color={awayColor} size={36} />
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>
            {awayTeam?.abbr ?? "AWY"}
          </div>
          <div style={{
            fontSize: "1.9rem", fontWeight: 900, lineHeight: 1,
            color: awayScore > homeScore ? awayColor : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.4s",
          }}>
            {awayScore}
          </div>
        </div>
      </div>

      {/* Game info */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{
          fontSize: "0.85rem", fontWeight: 900, color: "var(--text)",
          letterSpacing: "0.5px",
        }}>
          {qLabel}
          {timeLeft && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: 4 }}>· {timeLeft}</span>}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
          {downLabel}
          {possAbbr && <span style={{ marginLeft: 4, color: "var(--text-subtle)" }}>· {possAbbr} ball</span>}
        </div>
      </div>

      {/* Home */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>
            {homeTeam?.abbr ?? "HME"}
          </div>
          <div style={{
            fontSize: "1.9rem", fontWeight: 900, lineHeight: 1,
            color: homeScore > awayScore ? homeColor : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.4s",
          }}>
            {homeScore}
          </div>
        </div>
        <TeamBadge abbr={homeTeam?.abbr} color={homeColor} size={36} />
      </div>
    </div>
  );
}

function MomentumMeter({ momentum = 0, homeColor, awayColor, homeAbbr, awayAbbr }) {
  // momentum: -100 (full away) to +100 (full home), 0 = even
  const clamp = Math.max(-100, Math.min(100, momentum));
  const homeWidth = Math.round(50 + clamp / 2); // 0-100%
  const awayWidth = 100 - homeWidth;
  const label = Math.abs(clamp) < 10
    ? "Even"
    : clamp > 0
      ? `${homeAbbr} Momentum`
      : `${awayAbbr} Momentum`;

  return (
    <div style={{ padding: "6px 14px", flexShrink: 0 }}>
      <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px",
        color: "var(--text-subtle)", textAlign: "center", marginBottom: 4 }}>
        Momentum — {label}
      </div>
      <div style={{
        height: 8, borderRadius: 4, overflow: "hidden",
        display: "flex", background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          width: `${awayWidth}%`, background: awayColor,
          opacity: 0.75, transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
        }} />
        <div style={{ width: 2, background: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
        <div style={{
          flex: 1, background: homeColor,
          opacity: 0.75, transition: "width 1s cubic-bezier(0.2,0.8,0.2,1)",
        }} />
      </div>
    </div>
  );
}

// ── Live Stats Strip ──────────────────────────────────────────────────────────
// Shows top QB stat line + top receiver/rusher from play logs accumulated so far

function LiveStatsStrip({ logs, visibleCount }) {
  const stats = useMemo(() => {
    const acc = {}; // playerId -> { name, pos, passAtt, passComp, passYds, passTDs, rushAtt, rushYds, rushTDs, receptions, recYds, recTDs, sacks, ints }
    for (let i = 0; i < visibleCount && i < logs.length; i++) {
      const l = logs[i];
      const addP = (p, key, val = 1) => {
        if (!p) return;
        const id = String(p.id ?? p.name ?? "?");
        if (!acc[id]) acc[id] = { name: p.name, pos: p.pos };
        acc[id][key] = (acc[id][key] || 0) + val;
      };
      // Pass plays
      if (l.passer) {
        addP(l.passer, "passAtt");
        if (l.completed) { addP(l.passer, "passComp"); addP(l.passer, "passYds", l.passYds || l.yards || 0); }
        if (l.isTouchdown && (l.tdType === "pass")) addP(l.passer, "passTDs");
      }
      // Rush plays
      if (l.rushYds != null && l.player && (l.type === "run" || l.tdType === "rush")) {
        addP(l.player, "rushAtt");
        addP(l.player, "rushYds", l.rushYds || l.yards || 0);
        if (l.isTouchdown) addP(l.player, "rushTDs");
      }
      // Receiving
      if (l.recYds != null && l.player && (l.completed || l.isTouchdown)) {
        addP(l.player, "receptions");
        addP(l.player, "recYds", l.recYds || l.yards || 0);
        if (l.isTouchdown && l.tdType === "pass") addP(l.player, "recTDs");
      }
      // Defense
      if (l.type === "sack" && l.player) addP(l.player, "sacks");
      if (l.type === "interception" && l.player) { addP(l.player, "ints"); }
    }
    return acc;
  }, [logs, visibleCount]);

  // Top QB, top receiver, top rusher
  const players = Object.values(stats);
  const topQB = players.filter(p => p.pos === "QB").sort((a, b) => (b.passYds || 0) - (a.passYds || 0))[0];
  const topRec = players.filter(p => p.pos !== "QB" && (p.recYds || 0) > 0).sort((a, b) => (b.recYds || 0) - (a.recYds || 0))[0];
  const topRusher = players.filter(p => (p.rushYds || 0) > 0 && p.pos !== "QB").sort((a, b) => (b.rushYds || 0) - (a.rushYds || 0))[0];

  if (!topQB && !topRec && !topRusher) return null;

  const lastName = (name) => (name || "?").split(" ").pop();

  const pills = [];
  if (topQB) {
    const comp = topQB.passComp || 0, att = topQB.passAtt || 0, yds = topQB.passYds || 0, tds = topQB.passTDs || 0;
    pills.push({ key: "qb", label: `${lastName(topQB.name)} ${comp}/${att} ${yds} yds${tds > 0 ? ` ${tds} TD` : ""}`, color: "#FF9F0A" });
  }
  if (topRec) {
    const rec = topRec.receptions || 0, yds = topRec.recYds || 0, tds = topRec.recTDs || 0;
    pills.push({ key: "rec", label: `${lastName(topRec.name)} ${rec} rec ${yds} yds${tds > 0 ? ` ${tds} TD` : ""}`, color: "#0A84FF" });
  }
  if (topRusher && topRusher !== topRec) {
    const att = topRusher.rushAtt || 0, yds = topRusher.rushYds || 0, tds = topRusher.rushTDs || 0;
    pills.push({ key: "rush", label: `${lastName(topRusher.name)} ${att} car ${yds} yds${tds > 0 ? ` ${tds} TD` : ""}`, color: "#34C759" });
  }

  if (!pills.length) return null;

  return (
    <div style={{
      display: "flex", gap: 6, padding: "5px 14px", flexShrink: 0,
      background: "rgba(0,0,0,0.35)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      overflowX: "auto", WebkitOverflowScrolling: "touch",
    }}>
      {pills.map(pill => (
        <div key={pill.key} style={{
          fontSize: "0.65rem", fontWeight: 700, color: pill.color,
          background: `${pill.color}14`,
          border: `1px solid ${pill.color}30`,
          borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {pill.label}
        </div>
      ))}
    </div>
  );
}

function PlayFeedEntry({ log, isLatest }) {
  const txt = log.text || log.playText || log.description || "Play";
  const score = isTouchdown(log);
  const turnover = isTurnover(log);
  const big = (log.yards ?? 0) >= 20;
  const sack = txt.toLowerCase().includes("sack");

  const borderColor = score
    ? "#34C759"
    : turnover
      ? "#FF453A"
      : big || sack
        ? "#FFD60A"
        : "var(--hairline)";

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 10px",
      borderLeft: `3px solid ${borderColor}`,
      background: score
        ? "rgba(52,199,89,0.07)"
        : turnover
          ? "rgba(255,69,58,0.07)"
          : "transparent",
      borderRadius: "0 6px 6px 0",
      marginBottom: 3,
      animation: isLatest ? "feedSlideIn 0.25s ease-out" : "none",
    }}>
      <span style={{
        fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)",
        minWidth: 22, flexShrink: 0, paddingTop: 2,
      }}>
        {log.quarter ? `Q${log.quarter}` : ""}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: "0.78rem", lineHeight: 1.4,
          fontWeight: score || big || turnover ? 700 : 400,
          color: score ? "#34C759" : turnover ? "#FF453A" : "var(--text)",
        }}>
          {txt}
        </span>
        {log.yards != null && log.yards !== 0 && (
          <span style={{
            marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
            color: log.yards > 0 ? "#34C759" : "#FF453A",
          }}>
            {log.yards > 0 ? "+" : ""}{log.yards} yds
          </span>
        )}
      </div>
    </div>
  );
}

function BigPlayPopup({ log, onDismiss }) {
  const txt = log.text || log.playText || log.description || "";
  const score = isTouchdown(log);
  const turnover = isTurnover(log);
  const isSack = (txt.toLowerCase().includes("sack"));

  const color = score ? "#34C759" : turnover ? "#FF453A" : isSack ? "#FF9F0A" : "#FFD60A";
  const emoji = score ? "🏈" : turnover ? "🔄" : isSack ? "💥" : "⚡";
  const label = score ? "TOUCHDOWN!" : turnover ? "TURNOVER!" : isSack ? "SACK!" : "BIG PLAY!";

  // Player chip
  const player = log.player;
  const pChip = player ? `${player.pos || ""} ${player.name || ""}`.trim() : null;

  return (
    <div style={{
      position: "absolute", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 50, pointerEvents: "auto",
      background: "rgba(0,0,0,0.93)",
      border: `2px solid ${color}`,
      borderRadius: 16,
      padding: "20px 24px",
      textAlign: "center",
      maxWidth: 300, width: "90%",
      animation: "bigPlayPop 0.3s cubic-bezier(0.2,0.8,0.2,1)",
      boxShadow: `0 0 40px ${color}44`,
    }}>
      <div style={{ fontSize: "2.2rem", lineHeight: 1, marginBottom: 6 }}>{emoji}</div>
      <div style={{
        fontSize: "1.25rem", fontWeight: 900, color,
        letterSpacing: "1px", marginBottom: pChip ? 6 : 8,
      }}>{label}</div>
      {pChip && (
        <div style={{
          display: "inline-block", background: `${color}20`, border: `1px solid ${color}50`,
          borderRadius: 20, padding: "3px 12px", fontSize: "0.75rem", fontWeight: 800,
          color, marginBottom: 8, letterSpacing: "0.3px",
        }}>
          {pChip}
        </div>
      )}
      <div style={{ fontSize: "0.77rem", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: 14 }}>
        {txt}
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: color, color: color === "#FFD60A" || color === "#FF9F0A" ? "#000" : "#fff",
          border: "none", borderRadius: 8, padding: "8px 20px",
          fontWeight: 800, fontSize: "0.82rem", cursor: "pointer",
        }}
      >
        Continue →
      </button>
    </div>
  );
}

function ProgressBar({ current, total }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
      <div style={{
        height: "100%", background: "var(--accent)",
        width: `${total > 0 ? (current / total) * 100 : 0}%`,
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}

// ── Main GameSimulation Component ─────────────────────────────────────────────

export default function GameSimulation({
  logs = [],
  homeTeam,
  awayTeam,
  userTeamId,
  onComplete,
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);      // 1, 2, 4, instant
  const [keyPlaysOnly, setKeyPlaysOnly] = useState(false);
  const [showBigPlay, setShowBigPlay] = useState(null); // log entry or null
  const [showFinal, setShowFinal] = useState(false);
  const feedRef = useRef(null);
  const timerRef = useRef(null);

  const hColor = useMemo(() => teamColor(homeTeam?.abbr || "HME"), [homeTeam?.abbr]);
  const aColor = useMemo(() => teamColor(awayTeam?.abbr || "AWY"), [awayTeam?.abbr]);

  // Effective play list (key plays filter)
  const effectiveLogs = useMemo(() =>
    keyPlaysOnly ? logs.filter(isKeyPlay) : logs,
    [logs, keyPlaysOnly]
  );

  const isComplete = index >= effectiveLogs.length && effectiveLogs.length > 0;
  const currentLog = effectiveLogs[index - 1] ?? null;

  // Auto-advance
  useEffect(() => {
    if (!playing || isComplete || showBigPlay) return;
    const delay = SPEED_DELAYS[speed] ?? 400;
    timerRef.current = setTimeout(() => {
      setIndex(i => i + 1);
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [playing, index, isComplete, showBigPlay, speed]);

  // Auto-complete on empty logs
  useEffect(() => {
    if (!Array.isArray(logs) || logs.length === 0) {
      const t = setTimeout(() => onComplete?.(), 1000);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  // Show final overlay after completion
  useEffect(() => {
    if (isComplete) {
      const t = setTimeout(() => setShowFinal(true), 800);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  // Big play popup
  useEffect(() => {
    if (!currentLog) return;
    if (speed < 4 && isKeyPlay(currentLog)) {
      setPlaying(false);
      setShowBigPlay(currentLog);
    }
  }, [currentLog, speed]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [index]);

  // Derive current game state
  const state = useMemo(() => {
    let homeScore = 0, awayScore = 0, quarter = 1, timeLeft = "";
    let ballOn = 50, down = 1, distance = 10, possession = "home";
    let momentum = 0;

    for (let i = 0; i < index && i < effectiveLogs.length; i++) {
      const l = effectiveLogs[i];
      if (l.homeScore != null) homeScore = l.homeScore;
      else if (l.scoreHome != null) homeScore = l.scoreHome;
      if (l.awayScore != null) awayScore = l.awayScore;
      else if (l.scoreAway != null) awayScore = l.scoreAway;
      if (l.quarter) quarter = l.quarter;
      if (l.timeLeft) timeLeft = l.timeLeft;
      else if (l.clock) timeLeft = l.clock;
      if (l.fieldPosition != null) ballOn = l.fieldPosition;
      else if (l.yardLine != null) ballOn = l.yardLine;
      else if (l.ballOn != null) ballOn = l.ballOn;
      if (l.down) down = l.down;
      if (l.distance != null) distance = l.distance;
      if (l.possession) possession = l.possession;

      // Accumulate momentum
      if (isTouchdown(l)) momentum += l.possession === "home" ? 25 : -25;
      else if (isTurnover(l)) momentum += l.possession === "home" ? -15 : 15;
      else if ((l.yards ?? 0) >= 20) momentum += l.possession === "home" ? 8 : -8;
      else if ((l.yards ?? 0) < 0) momentum += l.possession === "home" ? -5 : 5;
      momentum = Math.max(-100, Math.min(100, momentum * 0.96));
    }

    return { homeScore, awayScore, quarter, timeLeft, ballOn, down, distance, possession, momentum };
  }, [effectiveLogs, index]);

  // Current AnimatedField play data
  const fieldPlay = useMemo(() => {
    if (!currentLog) return null;
    return {
      ballOn: state.ballOn,
      distance: state.distance,
      down: state.down,
      quarter: state.quarter,
      time: state.timeLeft,
      awayScore: state.awayScore,
      homeScore: state.homeScore,
      yards: currentLog.yards,
      type: currentLog.type || "run",
      result: currentLog.yards != null
        ? (currentLog.yards > 0 ? `+${currentLog.yards} yards` : `${currentLog.yards} yards`)
        : "",
      description: currentLog.text || currentLog.playText || currentLog.description || "",
    };
  }, [currentLog, state]);

  const commentary = useMemo(() => currentLog ? getCommentary(currentLog) : null, [currentLog]);
  const visibleLogs = effectiveLogs.slice(0, index);

  const dismissBigPlay = useCallback(() => {
    setShowBigPlay(null);
    setPlaying(true);
  }, []);

  // Final game data — must be before handleFinish so they're in scope for deps
  const finalHomeScore = useMemo(() => {
    let s = 0;
    for (const l of effectiveLogs) {
      if (l.homeScore != null) s = l.homeScore;
      else if (l.scoreHome != null) s = l.scoreHome;
    }
    return s;
  }, [effectiveLogs]);
  const finalAwayScore = useMemo(() => {
    let s = 0;
    for (const l of effectiveLogs) {
      if (l.awayScore != null) s = l.awayScore;
      else if (l.scoreAway != null) s = l.scoreAway;
    }
    return s;
  }, [effectiveLogs]);

  const handleFinish = useCallback(() => {
    if (onComplete) onComplete({ homeScore: finalHomeScore, awayScore: finalAwayScore });
  }, [onComplete, finalHomeScore, finalAwayScore]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "#0a0a0f",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      fontFamily: "inherit",
    }}>
      <style>{`
        @keyframes feedSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bigPlayPop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes finalFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── HUD — Score + Quarter ── */}
      <ScoreHUD
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeScore={state.homeScore}
        awayScore={state.awayScore}
        quarter={state.quarter}
        timeLeft={state.timeLeft}
        down={state.down}
        distance={state.distance}
        possession={state.possession}
        homeColor={hColor}
        awayColor={aColor}
      />

      {/* ── Controls row ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {[1, 2, 4, "⚡"].map((s) => {
            const val = s === "⚡" ? "instant" : s;
            const active = speed === val;
            return (
              <button
                key={s}
                onClick={() => setSpeed(val)}
                style={{
                  padding: "4px 9px", borderRadius: 6, border: "none",
                  background: active ? "var(--accent)" : "rgba(255,255,255,0.08)",
                  color: active ? "#fff" : "var(--text-muted)",
                  fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                  minWidth: 32,
                }}
              >
                {s === "⚡" ? "⚡" : `${s}x`}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button
            onClick={() => setKeyPlaysOnly(k => !k)}
            style={{
              padding: "4px 9px", borderRadius: 6, border: "none",
              background: keyPlaysOnly ? "#FFD60A22" : "rgba(255,255,255,0.06)",
              color: keyPlaysOnly ? "#FFD60A" : "var(--text-muted)",
              fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            🔑 Key Plays
          </button>
          <button
            onClick={() => setPlaying(p => !p)}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "var(--text)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
              minWidth: 60,
            }}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={handleFinish}
            style={{
              padding: "4px 9px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "none",
              color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Momentum Bar ── */}
      <MomentumMeter
        momentum={state.momentum}
        homeColor={hColor}
        awayColor={aColor}
        homeAbbr={homeTeam?.abbr}
        awayAbbr={awayTeam?.abbr}
      />

      {/* ── Live Stats Strip ── */}
      <LiveStatsStrip logs={effectiveLogs} visibleCount={index} />

      {/* ── Animated Field ── */}
      <div style={{ flexShrink: 0, position: "relative" }}>
        <AnimatedField
          play={fieldPlay}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          possession={state.possession}
          momentum={state.momentum}
          isPlaying={playing}
          speed={speed === "instant" ? 8 : speed}
        />
        {/* Big play popup overlay */}
        {showBigPlay && (
          <BigPlayPopup log={showBigPlay} onDismiss={dismissBigPlay} />
        )}
      </div>

      {/* ── Commentary banner ── */}
      {commentary && (
        <div style={{
          padding: "7px 14px",
          background: "rgba(255,215,0,0.06)",
          borderTop: "1px solid rgba(255,215,0,0.12)",
          borderBottom: "1px solid rgba(255,215,0,0.12)",
          fontSize: "0.78rem", fontWeight: 700, color: "#FFD60A",
          letterSpacing: "0.2px",
          flexShrink: 0,
          animation: "feedSlideIn 0.3s ease-out",
        }}>
          📣 {commentary}
        </div>
      )}

      {/* ── Play Feed ── */}
      <div
        ref={feedRef}
        style={{
          flex: 1, overflowY: "auto",
          padding: "8px 12px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {visibleLogs.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Game starting…
          </div>
        )}
        {visibleLogs.map((l, i) => (
          <PlayFeedEntry key={i} log={l} isLatest={i === index - 1} />
        ))}
      </div>

      {/* ── Progress bar ── */}
      <ProgressBar current={index} total={effectiveLogs.length} />

      {/* ── Final Score Overlay ── */}
      {showFinal && (
        <FinalOverlay
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={finalHomeScore}
          awayScore={finalAwayScore}
          homeColor={hColor}
          awayColor={aColor}
          userTeamId={userTeamId}
          onContinue={handleFinish}
          logs={effectiveLogs}
        />
      )}
    </div>
  );
}

// ── Final Score Overlay ───────────────────────────────────────────────────────

function FinalOverlay({ homeTeam, awayTeam, homeScore, awayScore, homeColor, awayColor, userTeamId, onContinue, logs }) {
  const homeWon = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const userIsHome = homeTeam?.id === userTeamId;
  const userIsAway = awayTeam?.id === userTeamId;
  const userWon = (userIsHome && homeWon) || (userIsAway && !homeWon && !tied);
  const userLost = (userIsHome && !homeWon && !tied) || (userIsAway && homeWon);

  const resultColor = userWon ? "#34C759" : userLost ? "#FF453A" : "#FFD60A";
  const resultEmoji = userWon ? "🏆" : userLost ? "😔" : tied ? "🤝" : "🏈";
  const resultText = tied
    ? "FINAL · TIE"
    : homeWon
      ? `${homeTeam?.abbr ?? "HOME"} WIN!`
      : `${awayTeam?.abbr ?? "AWAY"} WIN!`;

  // Find MVP: top passer or top scorer by accumulated yards in logs
  const mvpPlayer = useMemo(() => {
    const acc = {};
    for (const l of logs) {
      const addP = (p, key, val = 1) => {
        if (!p) return;
        const id = String(p.id ?? p.name ?? "?");
        if (!acc[id]) acc[id] = { player: p, score: 0 };
        acc[id].score += val;
      };
      if (l.passer && l.completed) addP(l.passer, "passYds", (l.passYds || l.yards || 0) * 0.05);
      if (l.passer && l.isTouchdown) addP(l.passer, "passTD", 6);
      if (l.rushYds != null && l.player && (l.type === "run" || l.tdType === "rush")) {
        addP(l.player, "rushYds", (l.rushYds || l.yards || 0) * 0.1);
        if (l.isTouchdown) addP(l.player, "rushTD", 6);
      }
      if (l.recYds != null && l.player && l.completed) {
        addP(l.player, "recYds", (l.recYds || l.yards || 0) * 0.1);
        if (l.isTouchdown) addP(l.player, "recTD", 6);
      }
    }
    const sorted = Object.values(acc).sort((a, b) => b.score - a.score);
    return sorted[0]?.player || null;
  }, [logs]);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24,
      animation: "finalFadeIn 0.4s ease-out",
    }}>
      {/* Confetti dots */}
      {userWon && <ConfettiLayer colors={[homeColor, "#FFD700", "#34C759"]} />}

      <div style={{ textAlign: "center", maxWidth: 340 }}>
        <div style={{ fontSize: "3rem", lineHeight: 1, marginBottom: 12 }}>{resultEmoji}</div>

        {/* Score */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
              {awayTeam?.abbr ?? "AWY"}
            </div>
            <div style={{
              fontSize: "3.5rem", fontWeight: 900, lineHeight: 1,
              color: awayScore > homeScore ? aColor : "var(--text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {awayScore}
            </div>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)" }}>FINAL</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
              {homeTeam?.abbr ?? "HME"}
            </div>
            <div style={{
              fontSize: "3.5rem", fontWeight: 900, lineHeight: 1,
              color: homeScore > awayScore ? homeColor : "var(--text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {homeScore}
            </div>
          </div>
        </div>

        {/* Result badge */}
        <div style={{
          display: "inline-block",
          background: `${resultColor}20`,
          border: `1.5px solid ${resultColor}`,
          borderRadius: 8, padding: "6px 16px",
          fontSize: "0.9rem", fontWeight: 900, color: resultColor,
          letterSpacing: "1px", marginBottom: 20,
        }}>
          {resultText}
        </div>

        {/* MVP card if available */}
        {mvpPlayer && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-subtle)",
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
              Game MVP
            </div>
            <PlayerCard player={mvpPlayer} variant="standard" />
          </div>
        )}

        <button
          onClick={onContinue}
          style={{
            width: "100%", padding: "14px",
            background: resultColor, color: resultColor === "#FFD60A" ? "#000" : "#fff",
            border: "none", borderRadius: 10,
            fontWeight: 900, fontSize: "1rem", cursor: "pointer",
            letterSpacing: "0.5px",
          }}
        >
          Continue to Hub →
        </button>
      </div>
    </div>
  );
}

// Simple confetti layer
function ConfettiLayer({ colors = ["#FFD700", "#34C759", "#0A84FF"] }) {
  const particles = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
    duration: 1.5 + Math.random() * 1.5,
  })), []); // eslint-disable-line

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <style>{`
        @keyframes confettiFall {
          from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          to   { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: 0, left: `${p.x}%`,
          width: p.size, height: p.size * 0.5,
          background: p.color, borderRadius: 2,
          animation: `confettiFall ${p.duration}s ${p.delay}s linear forwards`,
        }} />
      ))}
    </div>
  );
}
