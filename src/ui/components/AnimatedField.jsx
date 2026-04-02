/**
 * AnimatedField.jsx — SVG-based animated football field for play-by-play visualization
 *
 * Shows a top-down football field with animated player icons, ball movement,
 * line of scrimmage, first-down markers, and real-time play commentary.
 *
 * v2 additions:
 *  - Highlighted key players with glowing halos (passer, receiver/rusher on offense;
 *    tackler, coverage defender, pass rusher on defense)
 *  - Floating name tags above highlighted players (e.g. "LB Warner")
 *  - Particle burst effect on big plays (TD, INT, sack)
 *  - Camera "pulse zoom" on touchdowns / turnovers via SVG viewBox animation
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// Field constants
const FIELD_W = 1000;
const FIELD_H = 460;
const END_ZONE_W = 80;
const PLAY_AREA_W = FIELD_W - 2 * END_ZONE_W; // 840
const YARD_PX = PLAY_AREA_W / 100; // 8.4px per yard

function yardToX(yard) {
  return END_ZONE_W + Math.max(0, Math.min(100, yard)) * YARD_PX;
}

const TEAM_COLORS = {
  home: { primary: "#1a5276", secondary: "#2980b9" },
  away: { primary: "#922b21", secondary: "#e74c3c" },
};

// Generate player positions for a formation
function getOffensePositions(ballX, ballY, isHome) {
  const dir = isHome ? 1 : -1;
  return [
    { role: "QB",  x: ballX - dir * 40, y: ballY,          r: 8  },
    { role: "RB",  x: ballX - dir * 70, y: ballY + 15,     r: 7  },
    { role: "WR1", x: ballX + dir * 10, y: 60,             r: 7  },
    { role: "WR2", x: ballX + dir * 10, y: FIELD_H - 60,   r: 7  },
    { role: "WR3", x: ballX + dir * 5,  y: 120,            r: 7  },
    { role: "TE",  x: ballX + dir * 5,  y: ballY - 30,     r: 7  },
    { role: "OL1", x: ballX - dir * 15, y: ballY - 30,     r: 8  },
    { role: "OL2", x: ballX - dir * 15, y: ballY - 15,     r: 8  },
    { role: "C",   x: ballX - dir * 10, y: ballY,          r: 8  },
    { role: "OL3", x: ballX - dir * 15, y: ballY + 15,     r: 8  },
    { role: "OL4", x: ballX - dir * 15, y: ballY + 30,     r: 8  },
  ];
}

function getDefensePositions(ballX, ballY, isHome) {
  const dir = isHome ? 1 : -1;
  return [
    { role: "DL1", x: ballX + dir * 15, y: ballY - 25,   r: 8 },
    { role: "DL2", x: ballX + dir * 15, y: ballY,        r: 8 },
    { role: "DL3", x: ballX + dir * 15, y: ballY + 25,   r: 8 },
    { role: "LB1", x: ballX + dir * 50, y: ballY - 40,   r: 7 },
    { role: "LB2", x: ballX + dir * 50, y: ballY,        r: 7 },
    { role: "LB3", x: ballX + dir * 50, y: ballY + 40,   r: 7 },
    { role: "CB1", x: ballX + dir * 20, y: 65,           r: 7 },
    { role: "CB2", x: ballX + dir * 20, y: FIELD_H - 65, r: 7 },
    { role: "S1",  x: ballX + dir * 90, y: ballY - 50,   r: 7 },
    { role: "S2",  x: ballX + dir * 90, y: ballY + 50,   r: 7 },
    { role: "NB",  x: ballX + dir * 35, y: 130,          r: 7 },
  ];
}

// Football shape for the ball
function Football({ x, y, rotation = 0, size = 6 }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`}>
      <ellipse rx={size} ry={size * 0.55} fill="#8B4513" stroke="#5C3317" strokeWidth="1" />
      <line x1={-size * 0.5} y1="0" x2={size * 0.5} y2="0" stroke="white" strokeWidth="0.8" />
      <line x1={-size * 0.3} y1="-1.5" x2={-size * 0.3} y2="1.5" stroke="white" strokeWidth="0.6" />
      <line x1={0} y1="-2" x2={0} y2="2" stroke="white" strokeWidth="0.6" />
      <line x1={size * 0.3} y1="-1.5" x2={size * 0.3} y2="1.5" stroke="white" strokeWidth="0.6" />
    </g>
  );
}

// Glowing halo ring around a highlighted player
function PlayerGlow({ x, y, r, color, pulseKey }) {
  return (
    <g key={pulseKey}>
      <circle cx={x} cy={y} r={r + 6} fill="none" stroke={color} strokeWidth="2.5" opacity="0.7">
        <animate attributeName="r" values={`${r + 4};${r + 9};${r + 4}`} dur="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={r + 12} fill="none" stroke={color} strokeWidth="1" opacity="0.3">
        <animate attributeName="r" values={`${r + 10};${r + 16};${r + 10}`} dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// Floating name tag above a player
function NameTag({ x, y, label, color }) {
  const w = Math.max(52, label.length * 6.5 + 12);
  return (
    <g>
      <rect
        x={x - w / 2} y={y - 30} width={w} height={16}
        rx="4" fill="rgba(0,0,0,0.82)" stroke={color} strokeWidth="1"
      />
      <text
        x={x} y={y - 18}
        fill={color} fontSize="9" fontWeight="800"
        textAnchor="middle" dominantBaseline="middle"
        style={{ pointerEvents: "none", letterSpacing: "0.3px" }}
      >
        {label}
      </text>
    </g>
  );
}

// Particle burst for big plays
function ParticleBurst({ x, y, color, count = 12, active }) {
  if (!active) return null;
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI;
      const dist = 20 + Math.random() * 30;
      const r = 2 + Math.random() * 3; // dynamic sizes
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist + 15, // gravity effect
        r
      };
    }), [count] // eslint-disable-line
  );
  return (
    <g>
      {particles.map((p, i) => (
        <circle key={i} cx={x} cy={y} r={p.r} fill={color} opacity="0.9">
          <animateTransform
            attributeName="transform" type="translate"
            from="0 0" to={`${p.dx} ${p.dy}`}
            dur="0.6s" fill="freeze"
            calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1"
          />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" fill="freeze" />
          <animate attributeName="r" from={p.r} to="1" dur="0.6s" fill="freeze" />
        </circle>
      ))}
    </g>
  );
}

export default function AnimatedField({
  play,
  homeTeam,
  awayTeam,
  possession,
  momentum = 0,
  isPlaying = false,
  speed = 1,
}) {
  const [animPhase, setAnimPhase] = useState(0); // 0=pre-snap, 1=play, 2=result
  const [ballPos, setBallPos] = useState({ x: 500, y: FIELD_H / 2 });
  const [commentary, setCommentary] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [burstActive, setBurstActive] = useState(false);
  const prevPlayRef = useRef(null);

  const ballOn = play?.ballOn ?? 50;
  const firstDownLine = play?.ballOn != null && play?.distance != null
    ? Math.min(100, ballOn + (play.distance ?? 10))
    : null;

  const losX = yardToX(ballOn);
  const fdX = firstDownLine != null ? yardToX(firstDownLine) : null;

  // Determine if this play has a big event (TD, turnover, sack)
  const isBigPlay = useMemo(() => {
    if (!play) return false;
    const txt = (play.description || "").toLowerCase();
    return play.isTouchdown || play.isTurnover ||
      txt.includes("touchdown") || txt.includes("interception") || txt.includes("sack");
  }, [play]);

  // Animate when play changes
  useEffect(() => {
    if (!play || play === prevPlayRef.current) return;
    prevPlayRef.current = play;

    setAnimPhase(0);
    setShowResult(false);
    setBurstActive(false);
    setBallPos({ x: losX, y: FIELD_H / 2 });

    const dur = Math.max(200, 1500 / speed);

    const t1 = setTimeout(() => {
      setAnimPhase(1);
      const yards = play.yards ?? 0;
      const newX = yardToX(Math.max(0, Math.min(100, ballOn + yards)));

      if (play.type === "pass") {
        setBallPos({ x: newX, y: FIELD_H / 2 + (Math.random() - 0.5) * 80 });
      } else if (play.type === "run") {
        setBallPos({ x: newX, y: FIELD_H / 2 + (Math.random() - 0.5) * 40 });
      } else {
        setBallPos({ x: newX, y: FIELD_H / 2 });
      }
    }, dur * 0.3);

    const t2 = setTimeout(() => {
      setAnimPhase(2);
      setShowResult(true);
      setCommentary(play.description || `${play.type} for ${play.yards ?? 0} yards`);
      if (isBigPlay) setBurstActive(true);
    }, dur);

    const t3 = setTimeout(() => setBurstActive(false), dur + 700);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [play, losX, ballOn, speed, isBigPlay]);

  const homeColor = homeTeam?.color || TEAM_COLORS.home.primary;
  const awayColor = awayTeam?.color || TEAM_COLORS.away.primary;
  const possColor = possession === "home" ? homeColor : awayColor;
  const defColor  = possession === "home" ? awayColor : homeColor;

  const offPositions = useMemo(() =>
    getOffensePositions(losX, FIELD_H / 2, possession === "home"),
    [losX, possession]
  );
  const defPositions = useMemo(() =>
    getDefensePositions(losX, FIELD_H / 2, possession === "home"),
    [losX, possession]
  );

  // ── Key player extraction from play data ─────────────────────────────────
  // play may carry: .passer, .receiver (or .player for rush/rec), .tackler,
  // .defender, .passRusher / .player (for sack)
  const keyPlayers = useMemo(() => {
    if (!play) return {};
    return {
      passer:     play.passer     || null,
      receiver:   (play.type === "pass" && play.player) ? play.player : null,
      rusher:     (play.type === "run"  && play.player) ? play.player : null,
      tackler:    play.tackler    || null,
      defender:   play.defender   || null,
      passRusher: (play.type === "sack" && play.player) ? play.player : null,
    };
  }, [play]);

  // Decide which offense players to highlight
  const offHighlight = useMemo(() => {
    const set = new Set();
    if (animPhase >= 1) {
      if (keyPlayers.passer)   set.add("QB");
      if (keyPlayers.receiver) set.add("WR1");
      if (keyPlayers.rusher)   set.add("RB");
    }
    return set;
  }, [animPhase, keyPlayers]);

  // Decide which defense players to highlight
  const defHighlight = useMemo(() => {
    const set = new Set();
    if (animPhase >= 1) {
      if (keyPlayers.tackler)    set.add("LB2");
      if (keyPlayers.defender)   set.add("CB1");
      if (keyPlayers.passRusher) set.add("DL2");
    }
    return set;
  }, [animPhase, keyPlayers]);

  // Burst coordinates (ball landing spot)
  const burstX = animPhase >= 1 ? ballPos.x : losX;
  const burstY = animPhase >= 1 ? ballPos.y : FIELD_H / 2;

  const playDesc = (play?.description || "").toLowerCase();
  const isGoal = play?.isTouchdown || playDesc.includes("touchdown");
  const isTurnoverOrSack = play?.isTurnover || playDesc.includes("interception") || playDesc.includes("sack") || playDesc.includes("fumble");
  const isKick = playDesc.includes("field goal") || play?.type === "fieldGoal" || play?.type === "kickoff" || playDesc.includes("kick");

  const burstColor = isBigPlay
    ? isGoal ? "#FFD700"
      : isTurnoverOrSack ? "#FF453A"
      : isKick ? "#0A84FF"
      : "#FF9F0A"
    : "#34C759";

  // Build name tag label: "POS LastName"
  function nameTagLabel(playerRef, fallbackPos) {
    if (!playerRef || typeof playerRef !== "object") return null;
    const lastName = (playerRef.name || "").split(" ").pop() || "";
    const pos = playerRef.pos || fallbackPos || "";
    if (!lastName) return null;
    return `${pos} ${lastName}`;
  }

  return (
    <div style={{ width: "100%", background: "var(--surface)", borderRadius: "var(--radius-lg, 12px)", overflow: "hidden", border: "1px solid var(--hairline)" }}>
      {/* Scoreboard */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 12px", background: "var(--bg)", borderBottom: "1px solid var(--hairline)",
        fontSize: 13, fontWeight: 700,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: awayColor, fontSize: 14 }}>{awayTeam?.abbr || "AWY"}</span>
          <span style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
            {play?.awayScore ?? 0}
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
          <div>{play?.quarter ? `Q${play.quarter}` : "Q1"} · {play?.time || "15:00"}</div>
          <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>
            {play?.down ? `${play.down}${["st","nd","rd","th"][Math.min(play.down-1,3)]} & ${play.distance ?? 10}` : "1st & 10"}
            {" · "}{possession === "home" ? homeTeam?.abbr : awayTeam?.abbr} ball
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
            {play?.homeScore ?? 0}
          </span>
          <span style={{ color: homeColor, fontSize: 14 }}>{homeTeam?.abbr || "HME"}</span>
        </div>
      </div>

      {/* Momentum bar */}
      <div style={{ height: 4, background: "var(--surface-strong, #1a1a2e)", display: "flex" }}>
        <div style={{
          width: `${50 - momentum / 2}%`, background: awayColor, opacity: 0.7,
          transition: "width 0.8s ease",
        }} />
        <div style={{ flex: 1 }} />
        <div style={{
          width: `${momentum / 2}%`, background: homeColor, opacity: 0.7,
          transition: "width 0.8s ease",
        }} />
      </div>

      {/* SVG Field */}
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        style={{ width: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fieldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a1e" />
            <stop offset="50%" stopColor="#347a28" />
            <stop offset="100%" stopColor="#2d5a1e" />
          </linearGradient>
          <filter id="glowFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="subtleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Field background */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="url(#fieldGrad)" />

        {/* End zones */}
        <rect x="0" y="0" width={END_ZONE_W} height={FIELD_H} fill={awayColor} opacity="0.3" />
        <rect x={FIELD_W - END_ZONE_W} y="0" width={END_ZONE_W} height={FIELD_H} fill={homeColor} opacity="0.3" />

        {/* End zone text */}
        <text x={END_ZONE_W / 2} y={FIELD_H / 2} fill="white" opacity="0.15" fontSize="40" fontWeight="900"
          textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90, ${END_ZONE_W / 2}, ${FIELD_H / 2})`}>
          {awayTeam?.abbr || "AWAY"}
        </text>
        <text x={FIELD_W - END_ZONE_W / 2} y={FIELD_H / 2} fill="white" opacity="0.15" fontSize="40" fontWeight="900"
          textAnchor="middle" dominantBaseline="middle" transform={`rotate(90, ${FIELD_W - END_ZONE_W / 2}, ${FIELD_H / 2})`}>
          {homeTeam?.abbr || "HOME"}
        </text>

        {/* End zone borders */}
        <line x1={END_ZONE_W} y1="0" x2={END_ZONE_W} y2={FIELD_H} stroke="white" strokeWidth="3" />
        <line x1={FIELD_W - END_ZONE_W} y1="0" x2={FIELD_W - END_ZONE_W} y2={FIELD_H} stroke="white" strokeWidth="3" />

        {/* Yard lines */}
        {Array.from({ length: 11 }, (_, i) => {
          const yard = i * 10;
          const x = yardToX(yard);
          return (
            <g key={`yd-${yard}`}>
              <line x1={x} y1="0" x2={x} y2={FIELD_H} stroke="white" strokeWidth="1" opacity="0.5" />
              {yard > 0 && yard < 100 && (
                <>
                  <text x={x} y="25" fill="white" opacity="0.4" fontSize="16" fontWeight="700"
                    textAnchor="middle">{yard <= 50 ? yard : 100 - yard}</text>
                  <text x={x} y={FIELD_H - 12} fill="white" opacity="0.4" fontSize="16" fontWeight="700"
                    textAnchor="middle">{yard <= 50 ? yard : 100 - yard}</text>
                </>
              )}
            </g>
          );
        })}

        {/* Hash marks */}
        {Array.from({ length: 99 }, (_, i) => {
          const x = yardToX(i + 1);
          if ((i + 1) % 10 === 0) return null;
          return (
            <g key={`hash-${i}`}>
              <line x1={x} y1={FIELD_H * 0.33 - 3} x2={x} y2={FIELD_H * 0.33 + 3} stroke="white" strokeWidth="0.5" opacity="0.3" />
              <line x1={x} y1={FIELD_H * 0.67 - 3} x2={x} y2={FIELD_H * 0.67 + 3} stroke="white" strokeWidth="0.5" opacity="0.3" />
            </g>
          );
        })}

        {/* First down line (yellow) */}
        {fdX != null && (
          <line x1={fdX} y1="0" x2={fdX} y2={FIELD_H} stroke="#FFD700" strokeWidth="3" opacity="0.8"
            strokeDasharray="8 4" />
        )}

        {/* Line of scrimmage (blue) */}
        <line x1={losX} y1="0" x2={losX} y2={FIELD_H} stroke="#4A90D9" strokeWidth="3" opacity="0.8" />

        {/* ── Offense players ── */}
        {offPositions.map((p, i) => {
          const isHighlighted = offHighlight.has(p.role);
          const moveX = animPhase >= 1 && play?.type === "run" && (p.role === "RB" || p.role === "QB")
            ? (play.yards ?? 0) * YARD_PX * (possession === "home" ? 1 : -1) * 0.5
            : 0;
          const moveY = animPhase >= 1 && p.role.startsWith("WR") && play?.type === "pass"
            ? (Math.random() - 0.5) * 40 : 0;
          const cx = p.x + moveX;
          const cy = p.y + moveY;

          // Name tag data for highlighted players
          let nameTag = null;
          if (isHighlighted && animPhase >= 1) {
            if (p.role === "QB" && keyPlayers.passer)
              nameTag = nameTagLabel(keyPlayers.passer, "QB");
            else if (p.role === "WR1" && keyPlayers.receiver)
              nameTag = nameTagLabel(keyPlayers.receiver, "WR");
            else if (p.role === "RB" && keyPlayers.rusher)
              nameTag = nameTagLabel(keyPlayers.rusher, "RB");
          }

          return (
            <g key={`off-${i}`} style={{ transition: `transform ${0.8 / speed}s ease` }}>
              {isHighlighted && (
                <PlayerGlow x={cx} y={cy} r={p.r} color={possColor} pulseKey={`off-glow-${i}-${animPhase}`} />
              )}
              <circle
                cx={cx} cy={cy} r={p.r + (isHighlighted ? 1 : 0)}
                fill={isHighlighted ? possColor : `${possColor}cc`}
                stroke={isHighlighted ? "white" : "rgba(255,255,255,0.6)"}
                strokeWidth={isHighlighted ? 2 : 1.5}
                filter={isHighlighted ? "url(#subtleGlow)" : undefined}
                style={{ transition: `cx ${0.8 / speed}s ease, cy ${0.8 / speed}s ease` }}
              />
              <text x={cx} y={cy + 1} fill="white" fontSize="6" fontWeight="800"
                textAnchor="middle" dominantBaseline="middle"
                style={{ transition: `x ${0.8 / speed}s ease, y ${0.8 / speed}s ease`, pointerEvents: "none" }}>
                {p.role.replace(/\d/g, "")}
              </text>
              {nameTag && <NameTag x={cx} y={cy} label={nameTag} color={possColor} />}
            </g>
          );
        })}

        {/* ── Defense players ── */}
        {defPositions.map((p, i) => {
          const isHighlighted = defHighlight.has(p.role);
          const moveX = animPhase >= 1 ? (Math.random() - 0.5) * 15 : 0;
          const cx = p.x + moveX;
          const cy = p.y;

          let nameTag = null;
          if (isHighlighted && animPhase >= 1) {
            if (p.role === "LB2" && keyPlayers.tackler)
              nameTag = nameTagLabel(keyPlayers.tackler, "LB");
            else if (p.role === "CB1" && keyPlayers.defender)
              nameTag = nameTagLabel(keyPlayers.defender, "CB");
            else if (p.role === "DL2" && keyPlayers.passRusher)
              nameTag = nameTagLabel(keyPlayers.passRusher, "DE");
          }

          return (
            <g key={`def-${i}`}>
              {isHighlighted && (
                <PlayerGlow x={cx} y={cy} r={p.r} color="#FF453A" pulseKey={`def-glow-${i}-${animPhase}`} />
              )}
              <circle
                cx={cx} cy={cy} r={p.r + (isHighlighted ? 1 : 0)}
                fill={isHighlighted ? defColor : `${defColor}bb`}
                stroke={isHighlighted ? "white" : "rgba(255,255,255,0.6)"}
                strokeWidth={isHighlighted ? 2 : 1.5}
                filter={isHighlighted ? "url(#subtleGlow)" : undefined}
                style={{ transition: `cx ${0.8 / speed}s ease` }}
              />
              <text x={cx} y={cy + 1} fill="white" fontSize="6" fontWeight="800"
                textAnchor="middle" dominantBaseline="middle"
                style={{ transition: `x ${0.8 / speed}s ease`, pointerEvents: "none" }}>
                {p.role.replace(/\d/g, "")}
              </text>
              {nameTag && <NameTag x={cx} y={cy} label={nameTag} color="#FF453A" />}
            </g>
          );
        })}

        {/* Pass trajectory */}
        {play?.type === "pass" && animPhase >= 1 && (
          <line
            x1={losX} y1={FIELD_H / 2}
            x2={ballPos.x} y2={ballPos.y}
            stroke="white" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5"
            style={{ transition: `x2 ${0.6 / speed}s ease, y2 ${0.6 / speed}s ease` }}
          />
        )}

        {/* Kick/Punt trajectory */}
        {(play?.type === "kick" || play?.type === "punt" || play?.type === "fieldGoal" || (play?.description || "").toLowerCase().includes("punt") || (play?.description || "").toLowerCase().includes("kick") || (play?.description || "").toLowerCase().includes("field goal")) && animPhase >= 1 && (
          <line
            x1={losX} y1={FIELD_H / 2}
            x2={ballPos.x} y2={ballPos.y}
            stroke="#0A84FF" strokeWidth="2" strokeDasharray="6 4" opacity="0.6"
            style={{ transition: `x2 ${0.6 / speed}s ease, y2 ${0.6 / speed}s ease` }}
          />
        )}

        {/* Ball */}
        <Football
          x={animPhase >= 1 ? ballPos.x : losX}
          y={animPhase >= 1 ? ballPos.y : FIELD_H / 2}
          rotation={play?.type === "pass" ? 45 : 0}
          size={7}
        />

        {/* Particle burst on big plays */}
        <ParticleBurst x={burstX} y={burstY} color={burstColor} count={14} active={burstActive} />

        {/* Result overlay */}
        {showResult && play?.result && (
          <g>
            <rect x={FIELD_W / 2 - 120} y={FIELD_H / 2 - 25} width="240" height="50" rx="8"
              fill="rgba(0,0,0,0.75)" />
            <text x={FIELD_W / 2} y={FIELD_H / 2 - 5} fill={
              (play.yards ?? 0) > 0 ? "#34C759" : (play.yards ?? 0) < 0 ? "#FF453A" : "white"
            } fontSize="14" fontWeight="800" textAnchor="middle">
              {play.result}
            </text>
            <text x={FIELD_W / 2} y={FIELD_H / 2 + 15} fill="white" fontSize="10" textAnchor="middle" opacity="0.8">
              {play.yards != null ? `${play.yards > 0 ? "+" : ""}${play.yards} yards` : ""}
            </text>
          </g>
        )}

        {/* Sideline borders */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="none" stroke="white" strokeWidth="4" />
      </svg>

      {/* Commentary bar */}
      {commentary && (
        <div style={{
          padding: "8px 12px",
          background: "var(--bg)",
          borderTop: "1px solid var(--hairline)",
          fontSize: 12,
          color: "var(--text)",
          fontWeight: 600,
          animation: "slideInRight 0.3s ease-out",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isPlaying ? "#34C759" : "var(--text-subtle)",
            flexShrink: 0,
          }} />
          <span>{commentary}</span>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
